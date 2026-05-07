# Indexing Co MCP Server

Stream live blockchain data from [Indexing Co](https://indexing.co) pipelines directly into your Claude Code session.

Instead of pushing to a database and querying separately, this MCP server subscribes to pipeline events over WebSockets and stores them in local SQLite — so Claude can query, analyze, and react to blockchain data in real time.

```
[Blockchain] → [Indexer Pipeline] → [DIRECT adapter] → [MCP Server (WebSocket)] → [SQLite] → [Claude Code]
```

## Quick Start

### 1. Install

```bash
git clone https://github.com/indexing-co/indexing-co-mcp.git
cd indexing-co-mcp
npm install && npm run build
```

This also installs the Claude Code [pipeline skill](SKILL.md) to `~/.claude/skills/`. To update later: `git pull && npm run build`.

### 2. Configure

Add your stream credentials to `~/.indexing-co/credentials`:

```
API_KEY=<your Indexing Co API key>
```

### 3. Register with Claude Code

```bash
claude mcp add indexing-co -- node /path/to/indexing-co-mcp/dist/index.js
```

### 4. Use

In Claude Code, the following tools are now available:

| Tool | Description |
|------|-------------|
| `subscribe` | Subscribe to a DIRECT pipeline channel. Validates channel exists. |
| `unsubscribe` | Stop receiving events for a channel. |
| `get_subscriptions` | List active channels, connection status, event counts. |
| `get_events` | Get recent raw events as JSON. |
| `describe_data` | Auto-discover data shape from stored events. |
| `query` | Run read-only SQL with `json_extract()` support. |
| `clear_events` | Delete stored events (all or by channel). |
| `chart` | Run SQL and render results as ASCII chart (sparkline, line, bar, histogram, table). |
| `get_status` | WebSocket state, channels, event counts, DB path. |
| `list_pipelines` | List all pipelines. Shows DIRECT channel names. |
| `get_pipeline` | Get a pipeline by name. |
| `create_pipeline` | Create or update a pipeline (POSTGRES, HTTP, WEBSOCKET, DIRECT). |
| `delete_pipeline` | Delete a pipeline. |
| `backfill` | Backfill historical data for a pipeline. |
| `list_filters` | List all filters. |
| `get_filter` | Get filter values with optional prefix search. |
| `create_filter` | Create a filter or add values to an existing filter. |
| `delete_filter_values` | Remove values from a filter. |
| `list_transformations` | List all transformations. |
| `get_transformation` | Get transformation code by name. |
| `create_transformation` | Create or update a transformation. |
| `test_transformation` | Test transformation code against live blockchain data. |
| `parse_subgraph_manifest` | Convert a Graph subgraph manifest into contracts, event signatures, transformation code, and SQL schema scaffolding. |

## How It Works

### Pipeline Setup

When creating an Indexing Co pipeline, add `DIRECT` as a delivery adapter:

```json
{
  "delivery": {
    "adapter": "DIRECT",
    "connectionUri": "",
    "table": "my-channel-name"
  }
}
```

- `table` is the channel name you'll subscribe to
- Empty `connectionUri` uses env vars
- Can run alongside any other adapter (e.g., DIRECT + POSTGRES)
- Events only sent when at least one subscriber is connected — no wasted API calls

### Querying Data

Events are stored as raw JSON in SQLite. Use `describe_data` to discover the shape, then `query` with SQL:

```sql
SELECT json_extract(data, '$.chain') as chain,
       json_extract(data, '$.transaction_hash') as tx,
       json_extract(data, '$.decoded.value') as amount
FROM events
WHERE channel = 'my-transfers'
  AND json_extract(data, '$.chain') = 'ethereum'
ORDER BY received_at DESC
LIMIT 20;
```

### Subgraph Migration

`parse_subgraph_manifest` accepts either raw `subgraph.yaml` text or a JSON manifest and returns a pipeline starting point you can feed into the other MCP tools.

Suggested agent flow:

1. Call `parse_subgraph_manifest` with the manifest text.
2. Use `transformationSuggestions.filterValues` with `create_filter`.
3. Use `transformationSuggestions.code` with `create_transformation`.
4. Use `transformationSuggestions.networks` plus your destination config with `create_pipeline`.

The tool also returns `contracts`, `events`, and `sqlSchemaScaffold.ddl` so the target table can be created before backfilling.

### Architecture

- **No external client libraries** — uses Node 22+ built-in `WebSocket`
- **Auto-reconnect** with exponential backoff
- **SQLite with WAL mode** for concurrent read/write
- **Generic schema** — works with any pipeline output shape
- Events stored at `~/.indexing-co/mcp-events.db`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `INDEXING_API_KEY` | Yes | Indexing Co API key (also read from `~/.indexing-co/credentials` as `API_KEY`) |
| `STREAM_URL` | No | Override stream WebSocket URL (auto-fetched from API if not set) |

## Requirements

- Node.js 22+
- An [Indexing Co](https://accounts.indexing.co) account

## License

MIT
