import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsSource = fs.readFileSync(path.join(root, 'src/mcp/tools.ts'), 'utf8');

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

console.log('hardening-check: ok');
