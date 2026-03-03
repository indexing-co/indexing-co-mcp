import { ApiClient } from '../api/client.js';
import { DIM, RESET, GREEN, YELLOW } from './format.js';

interface Pipeline {
  name: string;
  enabled: boolean;
  delivery: { adapter: string; table?: string };
  [key: string]: unknown;
}

export async function ensurePipelineEnabled(api: ApiClient, channel: string): Promise<void> {
  try {
    const res = (await api.get('/pipelines')) as { data: Pipeline[] };
    const pipeline = res.data.find(
      (p) => p.delivery?.adapter === 'DIRECT' && p.delivery?.table === channel
    );

    if (!pipeline) {
      // No DIRECT pipeline found for this channel — could be disabled (invisible via API)
      // or non-existent. Either way, nothing we can do.
      return;
    }

    if (pipeline.enabled) return;

    await api.post('/pipelines', { ...pipeline, enabled: true });
    console.log(`  ${GREEN}▲${RESET} ${DIM}Auto-enabled pipeline${RESET} ${YELLOW}${pipeline.name}${RESET}`);
  } catch {
    // Silent — don't block streaming if API call fails
  }
}
