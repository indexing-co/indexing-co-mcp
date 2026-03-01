# Indexing Co MCP Server

Stream live blockchain data from [Indexing Co](https://indexing.co) pipelines directly into your Claude Code session.

Instead of pushing to a database and querying separately, this MCP server subscribes to pipeline events over WebSockets and stores them in local SQLite — so Claude can query, analyze, and react to blockchain data in real time.

```
[Blockchain] → [Indexer Pipeline] → [Pusher/Soketi] → [MCP Server] → [SQLite] → [Claude Code]
```

## Quick Start

### 1. Install

```bash
git clone https://github.com/indexing-co/indexing-co-mcp.git
cd indexing-co-mcp
npm install && npm run build
```

### 2. Configure

Add your Pusher credentials to `~/.indexing-co/credentials`:

```
API_KEY=<your Indexing Co API key>
PUSHER_KEY=<your Pusher key>
PUSHER_CLUSTER=<your Pusher cluster, e.g. us2>
```

### 3. Register with Claude Code

```bash
claude mcp add indexing-co -- node /path/to/indexing-co-mcp/dist/index.js
```

### 4. Use

In Claude Code, the following tools are now available:

| Tool | Description |
|------|-------------|
| `subscribe` | Subscribe to a channel. Events start flowing into SQLite. |
| `unsubscribe` | Stop receiving events for a channel. |
| `get_subscriptions` | List active channels, connection status, event counts. |
| `get_events` | Get recent raw events as JSON. |
| `describe_data` | Auto-discover data shape from stored events. |
| `query` | Run read-only SQL with `json_extract()` support. |
| `clear_events` | Delete stored events (all or by channel). |
| `get_status` | WebSocket state, channels, event counts, DB path. |

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

- `table` is the Pusher channel name you'll subscribe to
- Empty `connectionUri` uses shared Pusher env vars
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

### Architecture

- **No Pusher client library** — uses Node 22+ built-in `WebSocket` to speak the Pusher protocol directly
- **Auto-reconnect** with exponential backoff
- **SQLite with WAL mode** for concurrent read/write
- **Generic schema** — works with any pipeline output shape
- Events stored at `~/.indexing-co/mcp-events.db`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PUSHER_KEY` | Yes | Pusher app key |
| `PUSHER_CLUSTER` | No | Pusher cluster (default: `us2`) |
| `PUSHER_HOST` | No | Custom host for self-hosted Soketi |

These can also be set in `~/.indexing-co/credentials`.

## Requirements

- Node.js 22+
- An [Indexing Co](https://accounts.indexing.co) account
- A Pusher account (or self-hosted Soketi instance)

## License

MIT
