import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('ADR sync excludes unpublished records, removes stale pages, and remains idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rettx-adr-sync-'));
  try {
    const scriptDir = path.join(root, 'scripts');
    const adrDir = path.join(root, 'docs', 'adr');
    const outDir = path.join(root, 'site', 'src', 'content', 'docs', 'decisions');
    for (const directory of [scriptDir, adrDir, outDir]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    const script = path.join(scriptDir, 'sync-adrs.mjs');
    fs.copyFileSync(new URL('./sync-adrs.mjs', import.meta.url), script);
    fs.writeFileSync(path.join(outDir, 'index.md'), '---\ntitle: Archive\n---\n\nFor contributors.\n\n## Currently merged ADRs\n\nOld rows\n');
    fs.writeFileSync(path.join(adrDir, '0001-example.md'), '# ADR 0001 — Example\n\n- **Status**: Accepted\n\n[Source](../../README.md) [Self](0001-example.md#why) [Hidden ADR](./0011-pulse-contributor-access-scope.md) [Initiative](https://docs.rettx.eu)\n');
    for (const filename of [
      '0009-pulse-menstrual-period-duration-model.md',
      '0010-pulse-sleep-entry-duration-quality-model.md',
      '0011-pulse-contributor-access-scope.md',
      '0013-admin-data-dedicated-cosmos-database.md',
      '0015-medication-regimen-not-pulse-event.md',
      '0018-registry-data-store-and-dataset-driven-forms.md',
    ]) {
      fs.writeFileSync(path.join(adrDir, filename), '# Prototype\n\nUnpublished example.\n');
      fs.writeFileSync(path.join(outDir, filename), 'Stale published page\n');
    }

    execFileSync(process.execPath, [script]);
    assert.deepEqual(fs.readdirSync(outDir).sort(), ['0001-example.md', 'index.md']);
    const page = fs.readFileSync(path.join(outDir, '0001-example.md'), 'utf8');
    const index = fs.readFileSync(path.join(outDir, 'index.md'), 'utf8');
    assert.match(page, /https:\/\/github\.com\/rett-europe\/rettx-engineering\/blob\/main\/README\.md/);
    assert.match(page, /\[Initiative\]\(https:\/\/docs\.rettx\.eu\)/);
    assert.match(page, /\[Self\]\(\/decisions\/0001-example\/#why\)/);
    assert.match(page, /Hidden ADR/);
    assert.doesNotMatch(page, /0011|docs\/adr/);
    assert.match(index, /For contributors\./);
    assert.match(index, /\[0001\]\(\/decisions\/0001-example\/\)/);
    assert.doesNotMatch(index, /Pulse|Prototype|Old rows/);

    execFileSync(process.execPath, [script]);
    assert.equal(fs.readFileSync(path.join(outDir, 'index.md'), 'utf8'), index);
    assert.equal(fs.readFileSync(path.join(outDir, '0001-example.md'), 'utf8'), page);
    assert.equal(fs.readdirSync(adrDir).length, 7);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
