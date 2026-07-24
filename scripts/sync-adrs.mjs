#!/usr/bin/env node
// Build-time sync: publish every ADR in docs/adr/ as a Starlight page under
// site/src/content/docs/decisions/, and regenerate the decisions index table.
//
// docs/adr/ is the single source of truth. The site pages are a generated view.
// Pure Node ESM, no external dependencies (node:fs + node:path only). Idempotent:
// re-running yields byte-identical output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const adrDir = path.join(root, 'docs', 'adr');
const outDir = path.join(root, 'site', 'src', 'content', 'docs', 'decisions');
const indexPath = path.join(outDir, 'index.md');

const REPO_BLOB_BASE = 'https://github.com/rett-europe/rettx/blob/main/';

/** Quote a string as a safe double-quoted YAML scalar. */
function yamlQuote(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** Strip backtick characters. */
function stripBackticks(value) {
  return value.replace(/`/g, '');
}

/**
 * Rewrite a relative markdown link target (relative to docs/adr/) into an
 * absolute GitHub blob URL. Absolute, anchor-only, and mailto links are left
 * untouched. A trailing #anchor on a relative link is preserved.
 */
function rewriteTarget(target) {
  if (/^(https?:\/\/|#|mailto:)/.test(target)) {
    return target;
  }
  const hashIndex = target.indexOf('#');
  const pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? '' : target.slice(hashIndex);
  const resolved = path.posix.normalize('docs/adr/' + pathPart);
  return REPO_BLOB_BASE + resolved + anchor;
}

/** Rewrite all relative markdown links in a body of text. */
function rewriteLinks(body) {
  return body.replace(/\]\(([^)]+)\)/g, (match, target) => {
    return '](' + rewriteTarget(target) + ')';
  });
}

function readAdrs() {
  const files = fs
    .readdirSync(adrDir)
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .sort();

  return files.map((filename) => {
    const source = fs.readFileSync(path.join(adrDir, filename), 'utf8').replace(/\r\n/g, '\n');
    const lines = source.split('\n');

    // First line is the H1 title.
    const firstLine = lines[0] ?? '';
    const title = stripBackticks(firstLine.replace(/^#\s+/, '')).trim();

    // Description = text after the em dash in the title; else the whole title.
    const dashIndex = title.indexOf('—');
    const description =
      dashIndex === -1 ? title : title.slice(dashIndex + 1).trim();

    // Decision text = title without the leading "ADR NNNN — " prefix.
    const decision = title.replace(/^ADR\s+\d+\s*—\s*/, '').trim();

    // ADR number from the 4-digit filename prefix.
    const numMatch = filename.match(/^(\d{4})/);
    const adrNumber = numMatch ? parseInt(numMatch[1], 10) : 0;
    const numLabel = numMatch ? numMatch[1] : String(adrNumber);

    // Status from the "- **Status**: ..." line.
    let status = 'Accepted';
    for (const line of lines) {
      const m = line.match(/^- \*\*Status\*\*:\s*(.+)$/);
      if (m) {
        status = m[1].trim();
        break;
      }
    }

    // Body = source with the first H1 removed and leading blank lines trimmed.
    let body = lines.slice(1).join('\n').replace(/^\n+/, '');
    body = rewriteLinks(body);

    const slug = filename.replace(/\.md$/i, '');

    return { filename, slug, title, description, decision, adrNumber, numLabel, status, body };
  });
}

function writePage(adr) {
  const frontmatter =
    '---\n' +
    'title: ' + yamlQuote(adr.title) + '\n' +
    'description: ' + yamlQuote(adr.description) + '\n' +
    'sidebar:\n' +
    '  order: ' + (adr.adrNumber + 1) + '\n' +
    '---\n';

  const content = frontmatter + '\n' + adr.body;
  fs.writeFileSync(path.join(outDir, adr.filename), content);
}

function regenerateIndex(adrs) {
  const heading = '## Currently merged ADRs';
  const original = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');
  const headingIndex = original.indexOf(heading);

  const preamble =
    headingIndex === -1 ? original.replace(/\s*$/, '') + '\n\n' : original.slice(0, headingIndex);

  const sorted = [...adrs].sort((a, b) => a.adrNumber - b.adrNumber);

  const rows = sorted.map((adr) => {
    const numCell = `[${adr.numLabel}](/decisions/${adr.slug}/)`;
    const titleCell = stripBackticks(adr.decision);
    return `| ${numCell} | ${titleCell} | ${adr.status} |`;
  });

  const section =
    heading + '\n\n' + '| # | Title | Status |\n' + '|---|---|---|\n' + rows.join('\n') + '\n';

  fs.writeFileSync(indexPath, preamble + section);
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const adrs = readAdrs();
  for (const adr of adrs) {
    writePage(adr);
  }
  regenerateIndex(adrs);
  console.log(`Synced ${adrs.length} ADRs to site/src/content/docs/decisions/`);
}

main();
