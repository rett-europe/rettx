// Sanity checks for the `Spec:` declaration parser in scripts/status.mjs.
// Run: node scripts/status.test.mjs
//
// The parser is load-bearing: it decides what the programme can and cannot
// account for. An earlier version inferred attribution from prose and mis-filed
// a spec-036 pull request under 042, so the cases below pin BOTH what must be
// recognised and — just as importantly — what must NOT be.

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'status.mjs'), 'utf8');

// Lift the two pure functions out of the script rather than exporting them,
// so the script stays a single self-contained file with no test-only surface.
const extract = name => {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found in status.mjs`);
  let depth = 0, i = src.indexOf('{', start);
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return src.slice(start, i + 1).replace(`function ${name}(`, `function ${name}(`);
};

const specs = [
  { spec_id: '036', slug: 'pulse-metric-catalog-admin' },
  { spec_id: '042', slug: 'admin-app-shell' },
  { spec_id: '046', slug: 'medication-regimen' }
];
const bySlug = new Map(specs.map(s => [s.slug, s]));
const issueIndex = new Map([['rettxweb#281', 'medication-regimen']]);

const prSlug = new Function(
  'specs', 'bySlug', 'issueIndex',
  `${extract('prSlug')}; return prSlug;`
)(specs, bySlug, issueIndex);

const pr = (o) => ({ repo: 'rettxweb', title: '', body: '', ...o });
let failures = 0;
const check = (label, actual, expected) => {
  try {
    assert.deepEqual(actual, expected);
    console.log(`  ok   ${label}`);
  } catch {
    console.log(`  FAIL ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failures++;
  }
};

console.log('declaration parser');

check('numeric id', prSlug(pr({ body: 'Spec: 046' })), 'medication-regimen');
check('zero-padded id', prSlug(pr({ body: 'Spec: 46' })), 'medication-regimen');
check('slug', prSlug(pr({ body: 'Spec: medication-regimen' })), 'medication-regimen');
check('bold markdown', prSlug(pr({ body: '**Spec**: 046' })), 'medication-regimen');
check('lowercase key', prSlug(pr({ body: 'spec: 046' })), 'medication-regimen');
check('mid-body line', prSlug(pr({ body: '## Summary\n\nWork.\n\nSpec: 046\n' })), 'medication-regimen');
check('trailing period', prSlug(pr({ body: 'Spec: 046.' })), 'medication-regimen');

check('none', prSlug(pr({ body: 'Spec: none — dependency bump' })), 'none');
check('n/a', prSlug(pr({ body: 'Spec: n/a' })), 'none');
check('incident', prSlug(pr({ body: 'Spec: incident — https://example/1' })), 'incident');

check('title prefix', prSlug(pr({ title: '[spec/admin-app-shell] nav' })), 'admin-app-shell');
check('closes fan-out issue', prSlug(pr({ body: 'Closes #281' })), 'medication-regimen');
check('fixes fan-out issue', prSlug(pr({ body: 'Fixes #281' })), 'medication-regimen');
check('closes unrelated issue', prSlug(pr({ body: 'Closes #999' })), null);

// The regression that prompted the rewrite: prose mentioning a spec must NOT
// attribute the pull request to it.
check(
  'prose mention does NOT attribute (the 036-filed-as-042 bug)',
  prSlug(pr({ title: 'feat: enable catalog surface', body: 'A gate is separate work (spec 042) and is not attempted here.' })),
  null
);
check('bare "spec 046" in prose', prSlug(pr({ body: 'Related to spec 046 somehow.' })), null);
check('empty body', prSlug(pr({ body: '' })), null);
check('unknown id', prSlug(pr({ body: 'Spec: 999' })), null);

console.log('');
if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('all passed');
