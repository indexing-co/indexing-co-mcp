import { StreamClient } from '../ws/client.js';
import { loadConfig } from '../config.js';
import { ApiClient } from '../api/client.js';
import { printBanner, printConnected, printEvent, printDisconnect, DIM, RESET, BRIGHT_YELLOW, CYAN, GRAY } from './format.js';
import { sparkline } from './charts.js';
import { ensurePipelineEnabled } from './ensure-pipeline.js';

const args = process.argv.slice(2);
const statsFlag = args.includes('--stats');
const channel = args.find((a) => !a.startsWith('--'));

if (!channel) {
  console.error('Usage: node dist/cli/preview.js <channel> [--stats]');
  process.exit(1);
}

let eventCount = 0;
let startTime = Date.now();
let connected = false;

// Stats tracking
const eventTimestamps: number[] = [];
const rateHistory: number[] = [];
const WINDOW_SEC = 30;

function computeRate(): number {
  const cutoff = Date.now() - WINDOW_SEC * 1000;
  while (eventTimestamps.length > 0 && eventTimestamps[0] < cutoff) {
    eventTimestamps.shift();
  }
  return eventTimestamps.length / WINDOW_SEC;
}

function printStats(): void {
  const rate = computeRate();
  rateHistory.push(rate);
  if (rateHistory.length > 60) rateHistory.shift();

  const spark = sparkline(rateHistory, { color: CYAN });
  const rateStr = rate.toFixed(1);
  console.log(`  ${DIM}rate${RESET} ${spark} ${BRIGHT_YELLOW}${rateStr}${RESET}${DIM}/s${RESET}`);
}

printBanner(channel);

loadConfig()
  .then((config) => {
    if (!config.streamUrl || !config.apiKey) {
      console.error('API key required. Set INDEXING_API_KEY env var or add API_KEY to ~/.indexing-co/credentials');
      process.exit(1);
    }
    const stream = new StreamClient(config.streamUrl);

    // Connect with timeout
    const timeout = setTimeout(() => {
      if (!connected) {
        console.error('Connection timed out after 10s');
        process.exit(1);
      }
    }, 10_000);

    // Graceful shutdown
    const shutdown = () => {
      stream.disconnect();

      if (statsFlag && rateHistory.length > 0) {
        console.log('');
        console.log(`  ${DIM}Rate trend:${RESET} ${sparkline(rateHistory, { color: CYAN })}`);
      }

      printDisconnect(eventCount, startTime);
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    const api = new ApiClient(config.baseUrl, config.apiKey);

    return stream.connect().then(async () => {
      connected = true;
      clearTimeout(timeout);
      startTime = Date.now();

      printConnected();

      await ensurePipelineEnabled(api, channel);

      stream.subscribe(channel, (events) => {
        const now = Date.now();
        for (const event of events) {
          eventCount++;
          if (statsFlag) eventTimestamps.push(now);
          printEvent(event, eventCount);
        }
        if (statsFlag) printStats();
      });
    });
  })
  .catch((err: unknown) => {
    console.error(`Failed to start: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
