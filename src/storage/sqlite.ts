import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

let db: Database.Database;

export function initDb(dbPath?: string): Database.Database {
  const dir = path.join(os.homedir(), '.indexing-co');
  fs.mkdirSync(dir, { recursive: true });

  const finalPath = dbPath || path.join(dir, 'mcp-events.db');
  db = new Database(finalPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      data JSON NOT NULL,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_events_channel ON events(channel);
    CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at);
  `);

  return db;
}

export function getDbPath(): string {
  return db.name;
}

export function insertEvents(channel: string, payloads: Record<string, unknown>[]) {
  const stmt = db.prepare('INSERT INTO events (channel, data) VALUES (?, ?)');
  const insertMany = db.transaction((items: Record<string, unknown>[]) => {
    for (const item of items) {
      stmt.run(channel, JSON.stringify(item));
    }
  });
  insertMany(payloads);
}

export function getEvents(
  channel?: string,
  limit = 50,
  offset = 0
): { id: number; channel: string; data: Record<string, unknown>; received_at: string }[] {
  let sql = 'SELECT id, channel, data, received_at FROM events';
  const params: (string | number)[] = [];

  if (channel) {
    sql += ' WHERE channel = ?';
    params.push(channel);
  }

  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params) as {
    id: number;
    channel: string;
    data: string;
    received_at: string;
  }[];

  return rows.map((row) => ({
    ...row,
    data: JSON.parse(row.data) as Record<string, unknown>,
  }));
}

export function getStats(): { channel: string; count: number; latest: string | null }[] {
  const rows = db
    .prepare(
      `SELECT channel, COUNT(*) as count, MAX(received_at) as latest
     FROM events GROUP BY channel ORDER BY count DESC`
    )
    .all() as { channel: string; count: number; latest: string | null }[];
  return rows;
}

export function runQuery(sql: string): { columns: string[]; rows: unknown[] } {
  const trimmed = sql.trim();
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error('Only SELECT queries are allowed');
  }

  const stmt = db.prepare(trimmed);
  const rows = stmt.all();
  const columns = stmt.columns().map((c) => c.name);
  return { columns, rows };
}

export function describeData(channel: string): {
  channel: string;
  totalEvents: number;
  sampleKeys: { key: string; type: string; example: unknown }[];
} {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM events WHERE channel = ?').get(channel) as { cnt: number };

  const sampleRows = db
    .prepare('SELECT data FROM events WHERE channel = ? ORDER BY id DESC LIMIT 10')
    .all(channel) as { data: string }[];

  const keyMap = new Map<string, { types: Set<string>; example: unknown }>();

  for (const row of sampleRows) {
    const obj = JSON.parse(row.data) as Record<string, unknown>;
    collectKeys(obj, '', keyMap);
  }

  const sampleKeys = [...keyMap.entries()].map(([key, info]) => ({
    key,
    type: [...info.types].join(' | '),
    example: info.example,
  }));

  return { channel, totalEvents: countRow.cnt, sampleKeys };
}

function collectKeys(
  obj: Record<string, unknown>,
  prefix: string,
  keyMap: Map<string, { types: Set<string>; example: unknown }>
) {
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const type = val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val;

    if (!keyMap.has(fullKey)) {
      keyMap.set(fullKey, { types: new Set(), example: type === 'object' ? '[object]' : val });
    }
    keyMap.get(fullKey)!.types.add(type);

    if (type === 'object' && val !== null && !Array.isArray(val)) {
      collectKeys(val as Record<string, unknown>, fullKey, keyMap);
    }
  }
}

export function clearEvents(channel?: string): number {
  if (channel) {
    const result = db.prepare('DELETE FROM events WHERE channel = ?').run(channel);
    return result.changes;
  }
  const result = db.prepare('DELETE FROM events').run();
  return result.changes;
}
