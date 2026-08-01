import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
);

test('quality lanes are bounded and never install the skill globally', () => {
  assert.equal(pkg.scripts.build, 'npm run build:compile && npm run install-skill');
  assert.equal(pkg.scripts['build:compile'], 'tsc');
  assert.equal(pkg.scripts.test, 'npm run build:compile && node scripts/hardening-check.mjs');
  assert.equal(
    pkg.scripts['quality:baseline'],
    'npm run quality:contract && npm run typecheck && npm test'
  );
  assert.equal(pkg.scripts['quality:security'], 'node scripts/hardening-check.mjs');

  for (const name of ['test', 'quality:baseline', 'quality:security']) {
    assert.doesNotMatch(pkg.scripts[name], /install-skill|npm publish|git push/);
  }
});
