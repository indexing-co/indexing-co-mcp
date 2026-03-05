import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamClient } from './ws/client.js';
import { ApiClient } from './api/client.js';
import { createServer } from './mcp/server.js';
import { initDb } from './storage/sqlite.js';
import { loadConfig } from './config.js';

function log(msg: string) {
  process.stderr.write(`[indexing-co-mcp] ${msg}\n`);
}

async function main() {
  log('Starting...');

  // Load config
  const config = await loadConfig();
  if (config.streamUrl) log(`Stream: ${config.streamUrl.replace(/\?.*/, '')}`);
  log(`API: ${config.baseUrl}`);

  // Initialize SQLite
  initDb();
  log('SQLite initialized');

  // Connect to event stream via WebSocket
  const stream = new StreamClient(config.streamUrl ?? '');
  if (config.streamUrl) {
    await stream.connect();
    log('WebSocket connected');
  } else {
    log('No API key — skipping WebSocket, tools will return setup instructions');
  }

  // Create API client
  const api = new ApiClient(config.baseUrl, config.apiKey);

  // Create and start MCP server
  const server = createServer(stream, api);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server running on stdio');

  // Graceful shutdown
  const shutdown = () => {
    log('Shutting down...');
    stream.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
