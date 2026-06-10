import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsSource = fs.readFileSync(path.join(root, 'src/mcp/tools.ts'), 'utf8');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

assert.doesNotMatch(
  toolsSource,
  /socketId|getDbPath|database:\s*getDbPath/,
  'MCP status/subscription tools must not expose connection ids or local database paths'
);

assert.match(
  toolsSource,
  /storage:\s*\{\s*enabled:\s*true,\s*\}/s,
  'MCP status should expose only non-local storage metadata'
);

for (const relativePath of ['README.md', 'SKILL.md', 'src/config.ts']) {
  const source = read(relativePath);
  assert.match(
    source,
    /Account -> API Keys/,
    `${relativePath} should point users to Console Account -> API Keys for account API keys`
  );
  assert.doesNotMatch(
    source,
    /accounts\.indexing\.co/,
    `${relativePath} should not point users to the stale accounts.indexing.co signup path`
  );
}

console.log('hardening-check: ok');
