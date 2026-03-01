import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamClient } from '../ws/client.js';
import type { ApiClient } from '../api/client.js';
import { insertEvents, getEvents, getStats, runQuery, describeData, clearEvents, getDbPath } from '../storage/sqlite.js';

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

function error(msg: string) {
  return { content: [{ type: 'text' as const, text: msg }], isError: true };
}

export function registerTools(server: McpServer, stream: StreamClient, api: ApiClient) {
  // ── Streaming tools (existing) ────────────────────────────────────────

  server.tool('subscribe', 'Subscribe to a channel. Events start flowing into SQLite.', { channel: z.string() }, async ({ channel }) => {
    stream.subscribe(channel, (events) => {
      insertEvents(channel, events);
      process.stderr.write(`[mcp] Received ${events.length} events on '${channel}'\n`);
    });

    return json(`Subscribed to channel '${channel}'. Events will be stored in SQLite as they arrive.`);
  });

  server.tool('unsubscribe', 'Stop receiving events for a channel.', { channel: z.string() }, async ({ channel }) => {
    stream.unsubscribe(channel);
    return json(`Unsubscribed from channel '${channel}'.`);
  });

  server.tool('get_subscriptions', 'List active channels, connection status, and event counts.', {}, async () => {
    const subs = stream.getSubscriptions();
    const stats = getStats();

    return json({
      connection: {
        connected: subs.connected,
        socketId: subs.socketId,
        uptimeSeconds: subs.uptime,
      },
      channels: subs.channels.map((ch) => {
        const stat = stats.find((s) => s.channel === ch);
        return { channel: ch, storedEvents: stat?.count || 0, latestEvent: stat?.latest || null };
      }),
    });
  });

  server.tool(
    'get_events',
    'Get recent raw events. Returns JSON payloads as-is.',
    { channel: z.string().optional(), limit: z.number().optional(), offset: z.number().optional() },
    async ({ channel, limit, offset }) => {
      const events = getEvents(channel, limit ?? 50, offset ?? 0);
      return json(events);
    }
  );

  server.tool(
    'describe_data',
    'Auto-discover data shape: sample keys, types, and value examples from stored events.',
    { channel: z.string() },
    async ({ channel }) => {
      return json(describeData(channel));
    }
  );

  server.tool(
    'query',
    'Run a read-only SQL query against stored events. Use json_extract(data, \'$.key\') to query event fields.',
    { sql: z.string() },
    async ({ sql }) => {
      try {
        return json(runQuery(sql));
      } catch (err) {
        return error(`Query error: ${err instanceof Error ? err.message : String(err)}`);
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
      return json(`Cleared ${deleted} events from ${scope}.`);
    }
  );

  server.tool('get_status', 'WebSocket state, channels, event counts, uptime, DB path.', {}, async () => {
    const subs = stream.getSubscriptions();
    const stats = getStats();

    return json({
      websocket: {
        connected: subs.connected,
        socketId: subs.socketId,
        uptimeSeconds: subs.uptime,
      },
      channels: subs.channels,
      eventCounts: stats,
      database: getDbPath(),
    });
  });

  // ── Pipeline tools ────────────────────────────────────────────────────

  server.tool('list_pipelines', 'List all pipelines.', {}, async () => {
    try {
      return json(await api.get('/pipelines'));
    } catch (err) {
      return error(`Failed to list pipelines: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  server.tool(
    'get_pipeline',
    'Get a pipeline by name.',
    { name: z.string() },
    async ({ name }) => {
      try {
        return json(await api.get(`/pipelines/${encodeURIComponent(name)}`));
      } catch (err) {
        return error(`Failed to get pipeline: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    'create_pipeline',
    'Create or update a pipeline.',
    {
      name: z.string(),
      transformation: z.string(),
      networks: z.array(z.string()),
      delivery: z.object({
        adapter: z.string(),
        connectionUri: z.string().optional(),
        connection: z.record(z.unknown()).optional(),
      }),
      filter: z.string().optional(),
      filterKeys: z.array(z.string()).optional(),
      enabled: z.boolean().optional(),
    },
    async (params) => {
      try {
        return json(await api.post('/pipelines', params));
      } catch (err) {
        return error(`Failed to create pipeline: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    'delete_pipeline',
    'Delete a pipeline.',
    { name: z.string() },
    async ({ name }) => {
      try {
        return json(await api.delete(`/pipelines/${encodeURIComponent(name)}`));
      } catch (err) {
        return error(`Failed to delete pipeline: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    'backfill',
    'Backfill historical data for a pipeline.',
    {
      pipeline: z.string(),
      network: z.string(),
      beats: z.array(z.number()).optional(),
      beatStart: z.number().optional(),
      beatEnd: z.number().optional(),
      value: z.string().optional(),
    },
    async ({ pipeline, ...body }) => {
      try {
        return json(await api.post(`/pipelines/${encodeURIComponent(pipeline)}/backfill`, body));
      } catch (err) {
        return error(`Failed to backfill: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // ── Filter tools ──────────────────────────────────────────────────────

  server.tool('list_filters', 'List all filters.', {}, async () => {
    try {
      return json(await api.get('/filters'));
    } catch (err) {
      return error(`Failed to list filters: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  server.tool(
    'get_filter',
    'Get filter values with optional prefix search and pagination.',
    {
      name: z.string(),
      prefix: z.string().optional(),
      pageToken: z.string().optional(),
    },
    async ({ name, prefix, pageToken }) => {
      try {
        const query: Record<string, string> = {};
        if (prefix) query.prefix = prefix;
        if (pageToken) query.pageToken = pageToken;
        return json(await api.get(`/filters/${encodeURIComponent(name)}`, Object.keys(query).length ? query : undefined));
      } catch (err) {
        return error(`Failed to get filter: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    'create_filter',
    'Create a filter or add values to an existing filter.',
    {
      name: z.string(),
      values: z.array(z.string()),
    },
    async ({ name, values }) => {
      try {
        return json(await api.post(`/filters/${encodeURIComponent(name)}`, { name, values }));
      } catch (err) {
        return error(`Failed to create filter: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    'delete_filter_values',
    'Remove values from a filter.',
    {
      name: z.string(),
      values: z.array(z.string()),
    },
    async ({ name, values }) => {
      try {
        return json(await api.delete(`/filters/${encodeURIComponent(name)}`, { name, values }));
      } catch (err) {
        return error(`Failed to delete filter values: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // ── Transformation tools ──────────────────────────────────────────────

  server.tool('list_transformations', 'List all transformations.', {}, async () => {
    try {
      return json(await api.get('/transformations'));
    } catch (err) {
      return error(`Failed to list transformations: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  server.tool(
    'get_transformation',
    'Get transformation code by name.',
    { name: z.string() },
    async ({ name }) => {
      try {
        return json(await api.get(`/transformations/${encodeURIComponent(name)}`));
      } catch (err) {
        return error(`Failed to get transformation: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    'create_transformation',
    'Create or update a transformation.',
    {
      name: z.string(),
      code: z.string(),
    },
    async ({ name, code }) => {
      try {
        return json(await api.post(`/transformations/${encodeURIComponent(name)}`, { name, code }));
      } catch (err) {
        return error(`Failed to create transformation: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    'test_transformation',
    'Test transformation code against live blockchain data.',
    {
      code: z.string(),
      network: z.string(),
      beat: z.string().optional(),
      filter: z.string().optional(),
      filterKeys: z.array(z.string()).optional(),
    },
    async (params) => {
      try {
        return json(await api.post('/transformations/test', params));
      } catch (err) {
        return error(`Failed to test transformation: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
