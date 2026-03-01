import fs from 'fs';
import path from 'path';
import os from 'os';

export interface Config {
  streamUrl: string;
  apiKey: string;
  baseUrl: string;
}

export function loadConfig(): Config {
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

  // Stream URL: explicit URL, or constructed from Pusher config
  let streamUrl = get('STREAM_URL');
  if (!streamUrl) {
    const key = get('PUSHER_KEY');
    if (!key) {
      throw new Error(
        'Missing stream config. Set STREAM_URL or PUSHER_KEY (env var or ~/.indexing-co/credentials)'
      );
    }
    const host = get('PUSHER_HOST');
    if (host && (host.startsWith('ws://') || host.startsWith('wss://'))) {
      streamUrl = `${host}/app/${key}?protocol=7`;
    } else {
      const cluster = get('PUSHER_CLUSTER') || 'us2';
      streamUrl = `wss://ws-${cluster}.pusher.com/app/${key}?protocol=7`;
    }
  }

  // API config
  const apiKey = get('INDEXING_API_KEY', 'API_KEY');
  if (!apiKey) {
    throw new Error(
      'Missing API key. Set INDEXING_API_KEY env var or add API_KEY to ~/.indexing-co/credentials'
    );
  }
  const baseUrl = get('INDEXING_BASE_URL') || 'https://app.indexing.co/dw';

  return { streamUrl, apiKey, baseUrl };
}
