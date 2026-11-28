import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const workflows = new URL('../.github/workflows/', import.meta.url);

function tokenScope(source) {
  const step = source.match(/- name: Mint Iris[^\n]*\n([\s\S]*?)(?=\n {6}- name:|$)/);
  assert.ok(step, 'Iris token step not found');
  assert.match(step[1], /uses: actions\/create-github-app-token@/);
  const repositories = step[1].match(/^\s+repositories:\s*(.+)$/m);
  assert.ok(repositories, 'token repository scope not found');
  return repositories[1].split(',').map(repo => repo.trim());
}

for (const name of ['spec-fanout', 'iris-route']) {
  test(`${name} token covers the engineering hub and every target`, () => {
    const source = fs.readFileSync(new URL(`${name}.yml`, workflows), 'utf8');
    const scope = tokenScope(source);
    const targets = name === 'spec-fanout'
      ? source.match(/ALLOWED_REPOS="([^"]+)"/)?.[1].split(/\s+/)
      : [...(source.match(/declare -A repo_for=\(([^)]+)\)/)?.[1] ?? '')
          .matchAll(/\[route:[^\]]+\]=([a-z0-9-]+)/g)].map(match => match[1]);
    assert.ok(targets?.length, 'workflow targets not found');
    assert.equal(new Set(scope).size, scope.length, 'duplicate token repository');
    assert.deepEqual(new Set(scope), new Set(['rettx-engineering', ...targets]));
    assert.ok(!scope.includes('rettx'), 'initiative repo must not be in the token scope');
  });
}
