#!/usr/bin/env node
// Program status — reconciles INTENT (specs in this repo) against DELIVERY
// (issues and pull requests in the downstream repos).
//
// WHY THIS IS A LOCAL SCRIPT AND NOT A WORKFLOW
// --------------------------------------------
// `rettx` is PUBLIC. `rettxweb`, `rettxapi`, `rettxadmin`, `rettxmutation` and
// `rettxid` are PRIVATE. The report this produces contains private issue and
// pull-request titles, which describe unfixed weaknesses in a codebase that
// handles caregiver data. That must never become public.
//
// Two consequences, both deliberate:
//
//   1. The OUTPUT is never committed. It is written to `status.local.md`,
//      which is gitignored.
//   2. This must NEVER run as a GitHub Actions workflow in this repo. Actions
//      logs and job summaries on a PUBLIC repo are world-readable, so a
//      scheduled run would publish the report even if it committed nothing.
//      The guard below enforces that; do not remove it. If scheduled runs are
//      ever wanted, the workflow has to live in a PRIVATE repo.
//
// The SCRIPT is safe to publish: it holds query logic and public spec slugs,
// no private data. Anyone without access to the private repos who runs it gets
// nothing back. The boundary is enforced by GitHub's own authorization rather
// than by anyone remembering to be careful.
//
// Usage:  node scripts/status.mjs [--days N]
// Needs:  gh CLI, authenticated with access to the private repos.
//
// Pure Node ESM, no external dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const specsDir = path.join(root, 'specs');
const outPath = path.join(root, 'status.local.md');

const OWNER = 'rett-europe';
const CONTROL_PLANE = 'rettx';
const DOWNSTREAM = ['rettxweb', 'rettxapi', 'rettxadmin', 'rettxmutation', 'rettxid'];

// A spec whose delivery has been quiet for longer than this is called out.
const DEFAULT_STALE_DAYS = 21;

if (process.env.GITHUB_ACTIONS || process.env.CI) {
  console.error(
    'refusing to run: this report contains PRIVATE repo titles and `rettx` is a\n' +
      'PUBLIC repo, so Actions logs would publish it. Run it locally, or move the\n' +
      'workflow to a private repo.'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const staleDays = (() => {
  const i = args.indexOf('--days');
  return i !== -1 && args[i + 1] ? Number(args[i + 1]) : DEFAULT_STALE_DAYS;
})();

/** Run gh and parse JSON, returning [] when a repo is unreachable. */
function gh(argv) {
  try {
    const out = execFileSync('gh', argv, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(out || '[]');
  } catch (err) {
    const msg = (err.stderr || err.message || '').toString().trim().split('\n')[0];
    console.error(`  ! ${argv.slice(0, 4).join(' ')}: ${msg}`);
    return [];
  }
}

/**
 * Read the `---` frontmatter block. It is preceded by an HTML comment in every
 * spec, so this cannot assume the block starts at line 1.
 */
function frontmatter(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => l.trim() === '---');
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && l.trim() === '---');
  if (end === -1) return null;
  const block = lines.slice(start + 1, end);

  const scalar = key => {
    const hit = block.find(l => new RegExp(`^${key}:`).test(l));
    if (!hit) return null;
    // Strip an inline `#` comment, then surrounding quotes.
    return hit
      .slice(key.length + 1)
      .replace(/\s+#.*$/, '')
      .trim()
      .replace(/^["']|["']$/g, '');
  };

  // Fanout repos sit at exactly two-space indent; `summary: |` bodies are
  // indented deeper, so they cannot be mistaken for entries.
  const fanout = block
    .filter(l => /^ {2}- repo:/.test(l))
    .map(l => l.split(':')[1].trim());

  return {
    spec_id: scalar('spec_id'),
    slug: scalar('slug'),
    title: scalar('title'),
    status: scalar('status'),
    fanout
  };
}

function loadSpecs() {
  if (!fs.existsSync(specsDir)) return [];
  return fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'template')
    .map(d => {
      const file = path.join(specsDir, d.name, 'spec.md');
      if (!fs.existsSync(file)) return null;
      const fm = frontmatter(fs.readFileSync(file, 'utf8'));
      if (!fm || !fm.slug) return null;
      return { dir: d.name, ...fm };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.spec_id).localeCompare(String(b.spec_id)));
}

const daysSince = iso => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const short = (s, n = 62) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

console.error('Reading specs…');
const specs = loadSpecs();
const bySlug = new Map(specs.map(s => [s.slug, s]));

console.error('Querying downstream repos…');
const issues = [];
const prs = [];
for (const repo of DOWNSTREAM) {
  const full = `${OWNER}/${repo}`;
  for (const i of gh([
    'issue', 'list', '--repo', full, '--label', 'squad', '--state', 'open',
    '--limit', '200', '--json', 'number,title,createdAt,updatedAt'
  ])) {
    issues.push({ repo, ...i });
  }
  for (const p of gh([
    'pr', 'list', '--repo', full, '--state', 'open',
    '--limit', '200', '--json', 'number,title,body,updatedAt,createdAt,isDraft,author,labels'
  ])) {
    prs.push({ repo, ...p });
  }
}

const specPrs = gh([
  'pr', 'list', '--repo', `${OWNER}/${CONTROL_PLANE}`, '--state', 'open',
  '--limit', '200', '--json', 'number,title,updatedAt,isDraft'
]);

/** A fan-out issue is titled `[spec/<slug>] …`. */
function issueSlug(title) {
  const m = title.match(/^\[spec\/([^\]]+)\]/);
  return m ? m[1] : null;
}

// Squad issues, keyed `repo#number`, so a PR that closes one inherits its spec.
const issueIndex = new Map();
for (const i of issues) {
  const s = issueSlug(i.title);
  if (s) issueIndex.set(`${i.repo}#${i.number}`, s);
}

/**
 * Attribute a pull request to a spec — by EXPLICIT DECLARATION ONLY.
 *
 * An earlier version inferred this from prose, and confidently mis-filed a
 * spec-036 PR under 042 because its description mentioned "(spec 042)" in
 * passing. A ledger that guesses is worse than one that admits it does not
 * know, so the three accepted signals are all unambiguous:
 *
 *   1. a `Spec: <id|slug|none|incident>` line in the body
 *   2. a `[spec/<slug>]` prefix in the title
 *   3. a closing keyword pointing at a fan-out issue
 *
 * Anything else is reported as undeclared. Returns `none` when a maintainer has
 * explicitly recorded that no spec applies, and `incident` for the incident
 * lane (patterns.md §11), which owes a reconciliation within 7 days.
 */
function prSlug(pr) {
  const body = pr.body || '';

  const declared = body.match(/^\s*(?:\*\*)?Spec(?:\*\*)?:\s*([^\s*<]+)/mi);
  if (declared) {
    const v = declared[1].toLowerCase().replace(/[.,—-]$/, '');
    if (['none', 'n/a', 'na', '-'].includes(v)) return 'none';
    if (v === 'incident') return 'incident';
    if (bySlug.has(v)) return v;
    const byId = specs.find(s => s.spec_id === v.padStart(3, '0'));
    if (byId) return byId.slug;
  }

  const titled = pr.title.match(/^\[spec\/([^\]]+)\]/);
  if (titled && bySlug.has(titled[1])) return titled[1];

  for (const m of body.matchAll(/(?:close[sd]?|fixe[sd]?|resolve[sd]?)\s+#(\d+)/gi)) {
    const hit = issueIndex.get(`${pr.repo}#${m[1]}`);
    if (hit) return hit;
  }

  return null;
}

for (const i of issues) i.slug = issueSlug(i.title);
for (const p of prs) p.slug = prSlug(p);

const openFor = slug => ({
  issues: issues.filter(i => i.slug === slug),
  prs: prs.filter(p => p.slug === slug)
});

// ---------------------------------------------------------------- rendering

const L = [];
const say = s => L.push(s);

say('# rettX programme status');
say('');
say('> **PRIVATE — do not commit or paste this anywhere public.** It contains issue');
say('> and pull-request titles from private repositories. `rettx` is a public repo;');
say('> this file is gitignored. Regenerate with `node scripts/status.mjs`.');
say('');
say(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z · ` +
  `${specs.length} specs · ${issues.length} open squad issues · ${prs.length} open downstream PRs`);
say('');

// 1. Delivery drift — the signal the lifecycle could not previously produce.
const drift = specs
  .filter(s => ['ready', 'accepted'].includes(s.status))
  .map(s => ({ spec: s, ...openFor(s.slug) }))
  .filter(x => x.issues.length || x.prs.length);

say('## Shipped specs with delivery still open');
say('');
say('These read as done in the control plane, but downstream work is still open.');
say('Either the work is genuinely outstanding, or the issue should be closed.');
say('');
if (!drift.length) {
  say('_None — intent and delivery agree._');
} else {
  for (const d of drift) {
    say(`### ${d.spec.spec_id} · ${d.spec.slug} — \`${d.spec.status}\``);
    say('');
    for (const i of d.issues) {
      say(`- issue \`${i.repo}#${i.number}\` — ${short(i.title)} _(${daysSince(i.createdAt)}d old)_`);
    }
    for (const p of d.prs) {
      say(`- PR \`${p.repo}#${p.number}\`${p.isDraft ? ' _(draft)_' : ''} — ${short(p.title)} _(${daysSince(p.updatedAt)}d quiet)_`);
    }
    say('');
  }
}
say('');

// 2. Specs still awaiting a decision.
const drafts = specs.filter(s => s.status === 'draft');
say('## Waiting on a maintainer decision');
say('');
if (!drafts.length) {
  say('_No drafts._');
} else {
  for (const s of drafts) {
    const o = openFor(s.slug);
    say(`- **${s.spec_id} · ${s.slug}** — ${short(s.title, 70)}`);
    say(`  - \`draft\`, so it fans out nothing on merge` +
      (s.fanout.length ? ` (would route to: ${s.fanout.join(', ')})` : ''));
    if (o.prs.length) say(`  - ${o.prs.length} downstream PR(s) already open against it`);
  }
}
say('');
if (specPrs.length) {
  say('Open spec PRs in the control plane:');
  say('');
  for (const p of specPrs) {
    say(`- \`${CONTROL_PLANE}#${p.number}\`${p.isDraft ? ' _(draft)_' : ''} — ${short(p.title)} _(${daysSince(p.updatedAt)}d quiet)_`);
  }
}
say('');

// 3. Incidents awaiting reconciliation (patterns.md §11).
//
// The lane exists so production breakage can ship without a spec. The 7-day
// reconciliation is what stops "ship first" from quietly becoming the norm, so
// an overdue incident is reported as overdue rather than merely listed.
const INCIDENT_RECONCILE_DAYS = 7;
const hasIncidentLabel = p => (p.labels || []).some(l => /^incident$/i.test(l.name));
const incidents = prs.filter(p => p.slug === 'incident' || hasIncidentLabel(p));

say('## Incidents awaiting reconciliation');
say('');
say(`Shipped under the incident lane. Each owes a spec — or a recorded decision to`);
say(`close it as a one-off — within ${INCIDENT_RECONCILE_DAYS} days.`);
say('');
if (!incidents.length) {
  say('_None open._');
} else {
  for (const p of incidents.sort((a, b) => daysSince(b.createdAt) - daysSince(a.createdAt))) {
    const age = daysSince(p.createdAt);
    const flag = age > INCIDENT_RECONCILE_DAYS ? ' **← OVERDUE**' : '';
    say(`- \`${p.repo}#${p.number}\` — ${short(p.title)} _(${age}d old)_${flag}`);
  }
}
say('');

// 4. Work with no spec behind it — how #296/#297/#300 happened.
//
// Only dependency bumps are set aside. Other bot authors (the coding agent,
// for instance) open real feature work, so hiding every `is_bot` PR would
// quietly shrink the very list this report exists to show.
const isDepBump = p => /dependabot/i.test(p.author?.login || '');
const undeclared = prs.filter(p => !p.slug && !isDepBump(p));
const declaredNone = prs.filter(p => p.slug === 'none');
const botPrs = prs.filter(p => !p.slug && isDepBump(p));

say('## Downstream work with no spec declared');
say('');
say('Attribution is by explicit declaration only — a `Spec:` line, a `[spec/<slug>]`');
say('title, or a closing keyword aimed at a fan-out issue. Nothing here is guessed,');
say('so this list is the true set of work the control plane cannot account for.');
say('');
if (!undeclared.length) {
  say('_None._');
} else {
  for (const p of undeclared.sort((a, b) => daysSince(b.updatedAt) - daysSince(a.updatedAt))) {
    say(`- \`${p.repo}#${p.number}\`${p.isDraft ? ' _(draft)_' : ''} — ${short(p.title)} _(${daysSince(p.updatedAt)}d quiet)_`);
  }
  say('');
  say('Add `Spec: <id>` — `Spec: none — <reason>` for maintenance, or');
  say('`Spec: incident — <link>` for production breakage — to each of these and');
  say('they drop off this list. See patterns.md §11.');
}
say('');
if (declaredNone.length) {
  say(`Declared \`Spec: none\` (accepted as maintenance): ` +
    declaredNone.map(p => `\`${p.repo}#${p.number}\``).join(', '));
  say('');
}
if (botPrs.length) {
  say(`Dependency bumps, excluded from the count above: ` +
    botPrs.map(p => `\`${p.repo}#${p.number}\``).join(', '));
  say('');
  const oldBump = botPrs.filter(p => daysSince(p.updatedAt) >= staleDays);
  if (oldBump.length) {
    say(`${oldBump.length} of those have been open ${staleDays}+ days. Dependency bumps on a`);
    say('private backend are security work; they should not sit indefinitely.');
    say('');
  }
}

// 4. Anything gone quiet.
const stale = [
  ...issues.map(i => ({ kind: 'issue', repo: i.repo, number: i.number, title: i.title, days: daysSince(i.updatedAt) })),
  ...prs.map(p => ({ kind: 'PR', repo: p.repo, number: p.number, title: p.title, days: daysSince(p.updatedAt) }))
].filter(x => x.days >= staleDays).sort((a, b) => b.days - a.days);

say(`## Quiet for ${staleDays}+ days`);
say('');
if (!stale.length) {
  say('_Nothing stale._');
} else {
  for (const x of stale) say(`- ${x.kind} \`${x.repo}#${x.number}\` — ${short(x.title)} _(${x.days}d)_`);
}
say('');

fs.writeFileSync(outPath, L.join('\n') + '\n', 'utf8');

console.error('');
console.error(`  drift:        ${drift.length} shipped spec(s) with delivery open`);
console.error(`  decisions:    ${drafts.length} draft spec(s), ${specPrs.length} open spec PR(s)`);
const overdue = incidents.filter(p => daysSince(p.createdAt) > INCIDENT_RECONCILE_DAYS).length;
console.error(`  incidents:    ${incidents.length} open (${overdue} overdue)`);
console.error(`  undeclared:   ${undeclared.length} downstream PR(s) with no spec declared`);
console.error(`  stale:        ${stale.length} item(s) quiet ${staleDays}+ days`);
console.error('');
console.error(`  written to ${path.relative(root, outPath)} (gitignored)`);
