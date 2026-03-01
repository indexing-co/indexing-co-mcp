import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamClient } from '../ws/client.js';
import { insertEvents, getEvents, getStats, runQuery, describeData, clearEvents, getDbPath } from '../storage/sqlite.js';

export function registerTools(server: McpServer, stream: StreamClient) {
  server.tool('subscribe', 'Subscribe to a channel. Events start flowing into SQLite.', { channel: z.string() }, async ({ channel }) => {
    stream.subscribe(channel, (events) => {
      insertEvents(channel, events);
      process.stderr.write(`[mcp] Received ${events.length} events on '${channel}'\n`);
    });

    return { content: [{ type: 'text', text: `Subscribed to channel '${channel}'. Events will be stored in SQLite as they arrive.` }] };
  });

  server.tool('unsubscribe', 'Stop receiving events for a channel.', { channel: z.string() }, async ({ channel }) => {
    stream.unsubscribe(channel);
    return { content: [{ type: 'text', text: `Unsubscribed from channel '${channel}'.` }] };
  });

  server.tool('get_subscriptions', 'List active channels, connection status, and event counts.', {}, async () => {
    const subs = stream.getSubscriptions();
    const stats = getStats();

    const result = {
      connection: {
        connected: subs.connected,
        socketId: subs.socketId,
        uptimeSeconds: subs.uptime,
      },
      channels: subs.channels.map((ch) => {
        const stat = stats.find((s) => s.channel === ch);
        return { channel: ch, storedEvents: stat?.count || 0, latestEvent: stat?.latest || null };
      }),
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool(
    'get_events',
    'Get recent raw events. Returns JSON payloads as-is.',
    { channel: z.string().optional(), limit: z.number().optional(), offset: z.number().optional() },
    async ({ channel, limit, offset }) => {
      const events = getEvents(channel, limit ?? 50, offset ?? 0);
      return { content: [{ type: 'text', text: JSON.stringify(events, null, 2) }] };
    }
  );

  server.tool(
    'describe_data',
    'Auto-discover data shape: sample keys, types, and value examples from stored events.',
    { channel: z.string() },
    async ({ channel }) => {
      const description = describeData(channel);
      return { content: [{ type: 'text', text: JSON.stringify(description, null, 2) }] };
    }
  );

  server.tool(
    'query',
    'Run a read-only SQL query against stored events. Use json_extract(data, \'$.key\') to query event fields.',
    { sql: z.string() },
    async ({ sql }) => {
      try {
        const result = runQuery(sql);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Query error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.tool(
    'clear_events',
    'Delete stored events (all or by channel).',
    { channel: z.string().optional() },
    async ({ channel }) => {
      const deleted = clearEvents(channel);
      const scope = channel ? `channel '${channel}'` : 'all channels';
      return { content: [{ type: 'text', text: `Cleared ${deleted} events from ${scope}.` }] };
    }
  );

  server.tool('get_status', 'WebSocket state, channels, event counts, uptime, DB path.', {}, async () => {
    const subs = stream.getSubscriptions();
    const stats = getStats();

    const status = {
      websocket: {
        connected: subs.connected,
        socketId: subs.socketId,
        uptimeSeconds: subs.uptime,
      },
      channels: subs.channels,
      eventCounts: stats,
      database: getDbPath(),
    };

    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  });
}
