---
name: indexing-co-pipelines
description: "Build and deploy blockchain data pipelines with Indexing Co. Use when user wants to index onchain data, set up event listeners, stream blockchain events to databases/webhooks, write transformation functions, or backfill historical data."
---

# Indexing Co Data Pipelines

**Your job:** Help users build onchain data pipelines — from raw blockchain events to structured data in their database. A pipeline = filter + transformation + destination.

|                |                                          |
| -------------- | ---------------------------------------- |
| **Base URL**   | `https://app.indexing.co/dw`             |
| **Auth**       | `X-API-KEY: {key}` header               |
| **Docs**       | `https://docs.indexing.co`               |
| **Sign up**    | `accounts.indexing.co` |

---

## Credentials

Check `~/.indexing-co/credentials` on every session start:

**File exists with `API_KEY`** -> load it. Don't prompt.

**File missing** -> ask user for their API key. Tell them to register at `accounts.indexing.co` if they don't have one. Save:

```bash
mkdir -p ~/.indexing-co && cat > ~/.indexing-co/credentials << 'EOF'
API_KEY=...
EOF
```

---

## Pipeline Architecture

Every pipeline has 3 parts. Build them in order:

```
[Filter] --> [Transformation] --> [Destination]
  what         how to reshape       where to send
```

| Component        | What it does                                        |
| ---------------- | --------------------------------------------------- |
| **Filter**       | Which addresses/contracts to watch                  |
| **Transformation** | JavaScript function that reshapes raw block data  |
| **Destination**  | Where processed data lands (Postgres, webhook, etc) |

---

## Step 1: Create a Filter

Filters target specific contract or wallet addresses. Supports millions of addresses per filter.

```bash
curl 'https://app.indexing.co/dw/filters/{FILTER_NAME}' \
  -H 'X-API-KEY: $API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"values": ["0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2"]}'
```

| Endpoint                  | Method   | Purpose                |
| ------------------------- | -------- | ---------------------- |
| `/filters/{name}`         | `POST`   | Create/update filter   |
| `/filters/{name}`         | `GET`    | List filter values     |
| `/filters/{name}`         | `DELETE` | Delete filter          |

---

## Step 2: Write a Transformation

JavaScript function that receives a `block` object and returns structured data. Runs server-side.

### Available Helpers

| Function | Purpose |
| -------- | ------- |
| `utils.evmDecodeLog(log, signatures[])` | Decode EVM log against event signatures |
| `utils.evmDecodeLogWithMetadata(log, signatures[])` | Same but includes event name |
| `utils.evmMethodSignatureToHex(signature)` | Convert signature to topic0 hash |
| `utils.blockToTimestamp(block)` | Get block timestamp |
| `utils.evmChainToId(chain)` | Chain name to chainId |
| `templates.tokenTransfers(block)` | Extract all token transfers |

### Available Packages

`BigNumber.js`, `viem`, `borsh`, `bs58`, `Buffer`, `zlib`

### Template: EVM Event Extraction

```javascript
function transform(block) {
  const results = [];
  const signatures = [
    // Get exact signatures from contract ABI — include `indexed` keyword
    'event Transfer(address indexed from, address indexed to, uint256 value)'
  ];

  for (const tx of block.transactions || []) {
    for (const log of tx.receipt?.logs || []) {
      const decoded = utils.evmDecodeLogWithMetadata(log, signatures);
      if (decoded) {
        results.push({
          chain: block._network,
          block: Number(block.number),
          transaction_hash: tx.hash,
          log_index: log.logIndex,
          contract_address: log.address?.toLowerCase(),
          event_name: decoded.eventName,
          decoded: decoded.decoded,
        });
      }
    }
  }
  return results;
}
```

### Template: Token Transfers (Shortcut)

```javascript
function transform(block) {
  return templates.tokenTransfers(block);
}
```

### Finding Event Signatures

**Critical:** Signatures must include `indexed` keywords exactly as declared in the ABI.

1. Get contract ABI from Etherscan/block explorer
2. Find events with `"type": "event"` entries
3. Format as: `event Name(type1 indexed param1, type2 param2, ...)`

### Test Before Deploying

Dry-run a transformation against a real block:

```bash
curl 'https://app.indexing.co/dw/transformations/test?network=ethereum&beat=22282149&filter={FILTER}&filterKeys[0]=contract_address' \
  -H 'X-API-KEY: $API_KEY' \
  -F 'code=@transform.js'
```

### Register Transformation

```bash
curl 'https://app.indexing.co/dw/transformations/{NAME}' \
  -H 'X-API-KEY: $API_KEY' \
  -F 'code=@transform.js'
```

| Endpoint                    | Method | Purpose                  |
| --------------------------- | ------ | ------------------------ |
| `/transformations/{name}`   | `POST` | Register transformation  |
| `/transformations/test`     | `POST` | Test without committing  |
| `/transformations/{name}`   | `GET`  | Retrieve transformation  |
| `/transformations`          | `GET`  | List all transformations |

---

## Step 3: Choose a Destination

### PostgreSQL (Most Common)

```json
{
  "adapter": "POSTGRES",
  "connectionUri": "postgresql://user:pass@host:5432/db",
  "table": "events_table",
  "uniqueKeys": ["chain", "transaction_hash", "log_index"]
}
```

**Always set `uniqueKeys`** — delivery is at-least-once, unique keys prevent duplicates.

**Recommended schema pattern:**

```sql
CREATE TABLE events (
  chain TEXT NOT NULL,
  block BIGINT NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  event_name TEXT NOT NULL,
  decoded JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (chain, transaction_hash, log_index)
);
```

### Webhook

```json
{
  "adapter": "HTTP",
  "connection": {
    "host": "https://your-endpoint.com/webhook",
    "headers": {"auth-key": "secret"}
  }
}
```

### WebSocket

```json
{
  "adapter": "WEBSOCKET",
  "connection": { "host": "ws://your-host.com/stream" }
}
```

### DIRECT (Stream to Claude Code)

Stream live pipeline events directly into a Claude Code session via the Indexing Co MCP server. Events flow over WebSockets and are stored in local SQLite for querying.

```json
{
  "adapter": "DIRECT",
  "connectionUri": "my-channel-name",
  "table": "my-channel-name"
}
```

- `connectionUri` = channel name (what you `subscribe` to in the MCP server)
- `table` should match `connectionUri`
- Events only sent when at least one subscriber is connected (saves cost)
- Can run alongside any other adapter (e.g., DIRECT + POSTGRES)

**Stream to Claude Code workflow:**
1. Create filter + transformation (same as any pipeline)
2. Deploy pipeline with DIRECT adapter, `table` = channel name
3. In Claude Code: use `subscribe` tool to connect to the channel
4. Use `describe_data` to see what's arriving, then `query` with SQL to analyze

**MCP Server tools available after subscribing:**

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

**Live Preview CLI:**

Stream events to the terminal with colorized, formatted output — useful for visually inspecting what a pipeline is producing in real-time.

```bash
node ~/workspace/indexing-co/indexing-co-mcp/dist/cli/preview.js <channel>
```

- Run as a background process (`run_in_background: true`) so you can trigger backfills or wait for live data
- Shows a banner with channel name, connection status, then renders each event with aligned key-value pairs
- Addresses in magenta, tx hashes in blue, numbers in yellow, booleans green/red, nested objects indented
- Ctrl+C (or `TaskStop`) prints a summary box with event count, duration, and avg rate
- Requires `~/.indexing-co/credentials` with `API_KEY`

**Example: querying streamed data with SQL:**

```sql
SELECT json_extract(data, '$.chain') as chain,
       json_extract(data, '$.transaction_hash') as tx,
       json_extract(data, '$.decoded.value') as amount
FROM events
WHERE channel = 'my-transfers'
  AND json_extract(data, '$.chain') = 'base'
ORDER BY received_at DESC
LIMIT 20;
```

### Other Adapters

Only `POSTGRES`, `HTTP`, `WEBSOCKET`, and `DIRECT` are available via the self-service API. Other adapters (Kafka, Kinesis, Pulsar, GCP PubSub, AWS S3, GCS, MongoDB, BigQuery, Firestore, Neo4j, ArangoDB, MySQL, SQLite) require contacting Indexing Co.

---

## Step 4: Deploy the Pipeline

```bash
curl 'https://app.indexing.co/dw/pipelines/' \
  -H 'X-API-KEY: $API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "my_pipeline",
    "transformation": "{TRANSFORM_NAME}",
    "filter": "{FILTER_NAME}",
    "filterKeys": ["contract_address"],
    "networks": ["ethereum"],
    "enabled": true,
    "delivery": {
      "adapter": "POSTGRES",
      "connectionUri": "postgresql://user:pass@host:5432/db",
      "table": "events",
      "uniqueKeys": ["chain", "transaction_hash", "log_index"]
    }
  }'
```

| Endpoint                          | Method   | Purpose                  |
| --------------------------------- | -------- | ------------------------ |
| `/pipelines`                      | `POST`   | Create pipeline          |
| `/pipelines`                      | `GET`    | List pipelines           |
| `/pipelines/{name}`               | `GET`    | Get pipeline details     |
| `/pipelines/{name}`               | `DELETE` | Disable pipeline         |
| `/pipelines/{name}/networks`      | `POST`   | Enable networks          |
| `/pipelines/{name}/networks`      | `DELETE` | Disable networks         |
| `/pipelines/{name}/backfill`      | `POST`   | Backfill historical data |

### Updating a Pipeline

There is no PATCH/PUT endpoint for pipelines. To change the destination, delivery config, or any pipeline setting:

1. **Delete** the existing pipeline: `DELETE /pipelines/{name}`
2. **Recreate** it with the new config: `POST /pipelines`

Updating a **transformation** is simpler — just re-POST to `/transformations/{name}` with the new code. The live pipeline picks up the new transformation automatically without needing to be recreated.

Updating a **filter** is also in-place — POST new values to `/filters/{name}`.

---

## Backfill Historical Data

After deploying a pipeline, backfill past blocks. The backfill API requires `network`, `value` (the filter address), and either `beats` (array of specific block numbers) or `beatStart`/`beatEnd` (block range).

**Specific blocks:**

```bash
curl -X POST 'https://app.indexing.co/dw/pipelines/{NAME}/backfill' \
  -H 'X-API-KEY: $API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "network": "ethereum",
    "value": "0xYOUR_FILTER_ADDRESS",
    "beats": [24519100, 24519200, 24519300]
  }'
```

**Block range:**

```bash
curl -X POST 'https://app.indexing.co/dw/pipelines/{NAME}/backfill' \
  -H 'X-API-KEY: $API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "network": "ethereum",
    "value": "0xYOUR_FILTER_ADDRESS",
    "beatStart": 18000000,
    "beatEnd": 18001000
  }'
```

> **Note:** `value` must match an address in your filter. Without it, the API returns `"must provide beats or value"`.

---

## Supported Networks

**150+ networks** across EVM, SVM, MoveVM, UTXO, CosmWasm.

**Major EVM:** `ethereum`, `arbitrum`, `optimism`, `base`, `polygon`, `avalanche`, `fantom`, `bsc`, `celo`

**Non-EVM:** `solana`, `aptos`, `sui`, `bitcoin`, `cardano`, `cosmos`, `osmosis`

**Testnets:** `sepolia`, `base-sepolia`, `avalanche-fuji`

Network status: `https://jiti.indexing.co/status/{NETWORK_KEY}`

---

## Stablecoin Registry

Prefer the MCP tool when it is available:

- `list_stablecoins()` for the full registry
- `list_stablecoins({ chain: "base" })` to narrow by chain

If the tool is unavailable, use this embedded registry for the most common payment-tracking pairs:

| Chain | Symbol | Decimals | Address |
| ----- | ------ | -------- | ------- |
| Ethereum | `USDC` | `6` | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Ethereum | `USDT` | `6` | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| Ethereum | `DAI` | `18` | `0x6B175474E89094C44Da98b954EedeAC495271d0F` |
| Base | `USDC` | `6` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base | `USDT` | `6` | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` |
| Base | `DAI` | `18` | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` |
| Arbitrum | `USDC` | `6` | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Arbitrum | `USDT` | `6` | `0xFd086bC7CD5C481DCC9C85ebe478A1C0b69FCbb9` |
| Arbitrum | `DAI` | `18` | `0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1` |
| Optimism | `USDC` | `6` | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| Optimism | `USDT` | `6` | `0x94b008aA00579c1307B0EF2c499aD98a8CE58e58` |
| Optimism | `DAI` | `18` | `0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1` |
| Polygon | `USDC` | `6` | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| Polygon | `USDT` | `6` | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |
| Polygon | `DAI` | `18` | `0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063` |

Use these values when the user says things like:

- "track all USDC payments to my wallet on Base"
- "watch DAI transfers on Arbitrum"
- "index USDT deposits on Optimism"

---

## Post-Deploy Verification

**A successful transformation test does NOT guarantee live delivery.** The test endpoint runs your code against a block and returns results directly. The live pipeline has additional layers (filter matching, delivery adapter, network connectivity) that can silently fail.

After deploying, always verify end-to-end:

1. **Confirm pipeline state**: `GET /pipelines/{name}` — check `enabled: true` and correct `networks`
2. **Trigger a backfill** of a known block (one that returned data in your transformation test)
3. **Check the destination** — did data actually arrive?
4. **If no data arrives**, debug layer by layer:
   - Test the destination directly (e.g., `curl -X POST` to your webhook) — is it reachable and returning 200?
   - Simplify the transformation (remove all filtering logic) and backfill again — does unfiltered data arrive?
   - If unfiltered data doesn't arrive either, the issue is at the pipeline/delivery layer, not the transformation
   - Contact Indexing Co support at **hello@indexing.co** — there are no delivery logs exposed via the API

### Debugging Webhook Delivery

Use [webhook.site](https://webhook.site) for testing — it shows incoming requests in real-time. First verify the URL works with a direct `curl POST`, then trigger a backfill. If your manual curl arrives but pipeline data doesn't, the issue is on the Indexing Co delivery side.

---

## Workflow Checklist

When a user asks to set up a pipeline, walk through:

1. **What data?** Identify contracts, events, chains
2. **Create filter** with target addresses
3. **Find event signatures** from ABI/block explorer
4. **Write transformation** using the template above
5. **Test transformation** against a real block
6. **Create destination table** (SQL schema from test output)
7. **Register transformation**
8. **Deploy pipeline**
9. **Verify delivery** — backfill a known block and confirm data arrives at destination
10. **Backfill** historical data if needed

---

## Common Patterns

### DEX Swaps (Uniswap V2)

```javascript
// Filter: pool addresses
// Signature:
'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
```

### Aave Lending Events

```javascript
// Filter: Aave pool contract
// Signatures:
'event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)'
'event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)'
```

### ERC-20 Transfers

```javascript
// Filter: token contract address
// Signature:
'event Transfer(address indexed from, address indexed to, uint256 value)'
```

### ERC-20 Transfers Filtered by Protocol

When a user wants token transfers "through" a specific protocol (e.g., "USDC transfers through Aave"), the filter still targets the **token contract** (since Transfer events are emitted by the token). The protocol filtering happens inside the **transformation** by checking if `from` or `to` matches a protocol address.

**Key insight:** Tokens don't flow to/from the protocol's main contract — they flow to/from the protocol's **vault or token-holding contract**. For example:
- Aave: USDC flows to/from the **aToken contract** (aUSDC), not the Pool contract
- Compound: tokens flow to/from the **cToken contract** (cUSDC)
- Uniswap: tokens flow to/from the **pool pair contract**

**You must research the correct addresses.** Use WebSearch to find the actual token-holding contract addresses for the protocol. Verify with the user — suggest they can also check with [Perplexity AI](https://perplexity.ai) for quick contract address lookups.

```javascript
// Example: USDC transfers through Aave on Ethereum
// Filter: USDC contract (from the stablecoin registry)
// Transformation filters by Aave addresses:
const protocolContracts = new Set([
  '0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c', // Aave V3 aEthUSDC
  '0xbcca60bb61934080951369a648fb03df4f96263c', // Aave V2 aUSDC
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', // Aave V3 Pool
  '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9', // Aave V2 LendingPool
]);

// Inside transform loop, after decoding:
const from = decoded.decoded.from?.toLowerCase();
const to = decoded.decoded.to?.toLowerCase();
if (!protocolContracts.has(from) && !protocolContracts.has(to)) continue;
```

### Universal Token Transfers

```javascript
// No filter needed — captures all transfers
// Use the built-in template:
function transform(block) {
  return templates.tokenTransfers(block);
}
```

### Payment Tracking: USDC To One Wallet On Base

When the user asks to track incoming USDC payments on Base, resolve the token contract as:

- Chain: `base`
- Symbol: `USDC`
- Address: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Decimals: `6`

Recommended build steps:

1. Create a filter containing the Base USDC address.
2. Use `templates.tokenTransfers(block)` in the transformation.
3. Keep only rows where `decoded.to` equals the target wallet.
4. Deliver to `DIRECT` for Claude/MCP workflows or `POSTGRES` for app storage.

```javascript
function transform(block) {
  const target = '0xYOUR_WALLET'.toLowerCase();
  const token = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

  return templates
    .tokenTransfers(block)
    .filter((transfer) =>
      transfer.contract_address?.toLowerCase() === token &&
      transfer.decoded?.to?.toLowerCase() === target
    )
    .map((transfer) => ({
      chain: transfer.chain,
      block: transfer.block,
      transaction_hash: transfer.transaction_hash,
      log_index: transfer.log_index,
      contract_address: transfer.contract_address,
      from: transfer.decoded.from,
      to: transfer.decoded.to,
      value: transfer.decoded.value,
    }));
}
```

---

## TableMap (Multi-Table Routing)

Route different event types to different tables from a single pipeline. Return an object with table names as keys:

```javascript
function transform(block) {
  return {
    "supplies": [...suppliesArray],
    "borrows": [...borrowsArray]
  };
}
```

Configure delivery with `tableMap` instead of `table`.

---

## Reliability

- **At-least-once delivery** — duplicates prevented by `uniqueKeys`
- **Chain reorg handling** — automatic reprocessing of affected blocks
- **Sub-second latency** for real-time data
- **99.95% uptime** SLA

---

## References

| Resource | URL |
| -------- | --- |
| Full docs | [docs.indexing.co](https://docs.indexing.co) |
| LLM-optimized docs | [docs.indexing.co/llms-full.txt](https://docs.indexing.co/llms-full.txt) |
| Network status | [jiti.indexing.co/status](https://jiti.indexing.co/status) |
| Account signup | [accounts.indexing.co](https://accounts.indexing.co) |
