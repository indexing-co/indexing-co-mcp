import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PusherClient } from '../pusher/client.js';
import { registerTools } from './tools.js';

export function createServer(pusher: PusherClient): McpServer {
  const server = new McpServer({
    name: 'indexing-co',
    version: '1.0.0',
  });

  registerTools(server, pusher);

  return server;
}
