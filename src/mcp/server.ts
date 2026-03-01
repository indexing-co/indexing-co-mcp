import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamClient } from '../ws/client.js';
import { registerTools } from './tools.js';

export function createServer(stream: StreamClient): McpServer {
  const server = new McpServer({
    name: 'indexing-co',
    version: '1.0.0',
  });

  registerTools(server, stream);

  return server;
}
