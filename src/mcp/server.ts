import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamClient } from '../ws/client.js';
import type { ApiClient } from '../api/client.js';
import { registerTools } from './tools.js';

export function createServer(stream: StreamClient, api: ApiClient): McpServer {
  const server = new McpServer({
    name: 'indexing-co',
    version: '1.0.0',
  });

  registerTools(server, stream, api);

  return server;
}
