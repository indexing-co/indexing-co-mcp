import fs from 'fs';
import path from 'path';
import os from 'os';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PusherClient } from './pusher/client.js';
import { createServer } from './mcp/server.js';
import { initDb } from './storage/sqlite.js';

function log(msg: string) {
  process.stderr.write(`[indexing-co-mcp] ${msg}\n`);
}

function loadConfig(): { key: string; cluster?: string; host?: string } {
  // Check env vars first
  if (process.env.PUSHER_KEY) {
    return {
      key: process.env.PUSHER_KEY,
      cluster: process.env.PUSHER_CLUSTER,
      host: process.env.PUSHER_HOST,
    };
  }

  // Fall back to credentials file
  const credPath = path.join(os.homedir(), '.indexing-co', 'credentials');
  if (fs.existsSync(credPath)) {
    const content = fs.readFileSync(credPath, 'utf-8');
    const vars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match) vars[match[1]] = match[2].trim();
    }

    if (vars.PUSHER_KEY) {
      return {
        key: vars.PUSHER_KEY,
        cluster: vars.PUSHER_CLUSTER,
        host: vars.PUSHER_HOST,
      };
    }
  }

  throw new Error(
    'Missing Pusher config. Set PUSHER_KEY env var or add PUSHER_KEY to ~/.indexing-co/credentials'
  );
}

async function main() {
  log('Starting...');

  // Load config
  const config = loadConfig();
  log(`Pusher key: ${config.key.slice(0, 4)}...`);

  // Initialize SQLite
  initDb();
  log('SQLite initialized');

  // Connect to Pusher via raw WebSocket
  const pusher = new PusherClient(config.key, config.host || config.cluster);
  await pusher.connect();
  log('Pusher WebSocket connected');

  // Create and start MCP server
  const server = createServer(pusher);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server running on stdio');

  // Graceful shutdown
  const shutdown = () => {
    log('Shutting down...');
    pusher.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
