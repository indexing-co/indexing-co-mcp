import fs from 'fs';
import path from 'path';
import os from 'os';

export interface Config {
  streamUrl: string | undefined;
  apiKey: string | undefined;
  baseUrl: string;
}

export const API_KEY_GUIDANCE =
  'No API key configured. Sign in to Console, open Account -> API Keys, create or copy an active key, then set INDEXING_API_KEY or add API_KEY to ~/.indexing-co/credentials. New accounts include 10,000 free blocks and no card is required. Never use browser JWTs, bearer headers, destination secrets, or private keys.';

export async function loadConfig(): Promise<Config> {
  const env = process.env;

  // Read credentials file as fallback
  const vars: Record<string, string> = {};
  const credPath = path.join(os.homedir(), '.indexing-co', 'credentials');
  if (fs.existsSync(credPath)) {
    const content = fs.readFileSync(credPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match) vars[match[1]] = match[2].trim();
    }
  }

  function get(envKey: string, fileKey?: string): string | undefined {
    return env[envKey] || vars[fileKey ?? envKey];
  }

  // API config
  const apiKey = get('INDEXING_API_KEY', 'API_KEY');
  if (!apiKey) {
    process.stderr.write(`[indexing-co-mcp] WARNING: ${API_KEY_GUIDANCE}\n`);
  }
  const baseUrl = get('INDEXING_BASE_URL') || 'https://app.indexing.co/dw';

  // Stream URL: explicit override or fetched from API (requires auth)
  let streamUrl: string | undefined = get('STREAM_URL');
  if (!streamUrl && apiKey) {
    const res = await fetch(`${baseUrl}/stream`, {
      headers: { 'X-API-KEY': apiKey },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch stream URL from ${baseUrl}/stream (${res.status})`);
    }
    const body = (await res.json()) as { url: string };
    streamUrl = body.url;
  }

  return { streamUrl, apiKey, baseUrl };
}
