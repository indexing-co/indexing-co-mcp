import { StreamClient } from '../ws/client.js';
import { loadConfig } from '../config.js';
import { printBanner, printConnected, printEvent, printDisconnect } from './format.js';

const channel = process.argv[2];
if (!channel) {
  console.error('Usage: node dist/cli/preview.js <channel>');
  process.exit(1);
}

const config = loadConfig();
const stream = new StreamClient(config.streamUrl);

let eventCount = 0;
let startTime = Date.now();
let connected = false;

printBanner(channel);

// Connect with timeout
const timeout = setTimeout(() => {
  if (!connected) {
    console.error('Connection timed out after 10s');
    process.exit(1);
  }
}, 10_000);

stream
  .connect()
  .then(() => {
    connected = true;
    clearTimeout(timeout);
    startTime = Date.now();

    printConnected();

    stream.subscribe(channel, (events) => {
      for (const event of events) {
        eventCount++;
        printEvent(event, eventCount);
      }
    });
  })
  .catch((err: unknown) => {
    clearTimeout(timeout);
    console.error(`Failed to connect: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });

// Graceful shutdown
const shutdown = () => {
  stream.disconnect();
  printDisconnect(eventCount, startTime);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
