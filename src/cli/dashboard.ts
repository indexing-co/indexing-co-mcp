import { StreamClient } from '../ws/client.js';
import { loadConfig } from '../config.js';
import { ApiClient } from '../api/client.js';
import {
  RESET, BOLD, DIM, CYAN, GREEN, WHITE, GRAY, RED,
  BRIGHT_YELLOW, BRIGHT_WHITE,
  formatDuration, colorizeValue, truncateHex,
} from './format.js';
import { sparkline, barChart } from './charts.js';
import { ensurePipelineEnabled } from './ensure-pipeline.js';

const channel = process.argv[2];
if (!channel) {
  console.error('Usage: node dist/cli/dashboard.js <channel>');
  process.exit(1);
}

// ── State ────────────────────────────────────────────────────────────────────

let totalEvents = 0;
let connectedAt: number | null = null;
let isConnected = false;
let socketId: string | null = null;

const eventTimestamps: number[] = [];
const rateHistory: number[] = [];
const keyCounts = new Map<string, number>();
const recentEvents: { index: number; time: string; data: Record<string, unknown> }[] = [];

const WINDOW_SEC = 30;
const MAX_RATE_HISTORY = 60;
const MAX_RECENT = 5;

// ── Rate calculation ─────────────────────────────────────────────────────────

function computeRate(): number {
  const cutoff = Date.now() - WINDOW_SEC * 1000;
  while (eventTimestamps.length > 0 && eventTimestamps[0] < cutoff) {
    eventTimestamps.shift();
  }
  return eventTimestamps.length / WINDOW_SEC;
}

function sampleRate(): void {
  const rate = computeRate();
  rateHistory.push(rate);
  if (rateHistory.length > MAX_RATE_HISTORY) rateHistory.shift();
}

// ── Terminal helpers ─────────────────────────────────────────────────────────

function getWidth(): number {
  return process.stdout.columns || 80;
}

function hLine(char: string, width: number): string {
  return char.repeat(width);
}

function padRight(text: string, rawLen: number, width: number): string {
  const pad = width - rawLen;
  return text + ' '.repeat(Math.max(0, pad));
}

// ── Render ───────────────────────────────────────────────────────────────────

function render(): string {
  const w = getWidth();
  const inner = w - 4; // inside box borders + padding

  const lines: string[] = [];

  // Top border + title
  const titleText = ` INDEXING.CO Dashboard ── channel: ${channel} `;
  const titlePad = w - 2 - titleText.length;
  lines.push(`${GRAY}╭─${RESET}${BOLD}${CYAN}${titleText}${RESET}${GRAY}${hLine('─', Math.max(0, titlePad))}╮${RESET}`);

  // Status bar
  const dot = isConnected ? `${GREEN}${BOLD}●${RESET}` : `${RED}${BOLD}●${RESET}`;
  const connLabel = isConnected ? `${GREEN}Connected${RESET}` : `${RED}Disconnected${RESET}`;
  const sock = socketId ? `Socket: ${socketId.slice(0, 6)}` : 'Socket: ---';
  const uptime = connectedAt ? formatDuration(Date.now() - connectedAt) : '---';
  const statusRaw = `  ● ${isConnected ? 'Connected' : 'Disconnected'}  │  ${sock}  │  Uptime: ${uptime}  `;
  const statusText = `  ${dot} ${connLabel}  ${GRAY}│${RESET}  ${DIM}${sock}${RESET}  ${GRAY}│${RESET}  ${DIM}Uptime:${RESET} ${WHITE}${uptime}${RESET}  `;
  lines.push(`${GRAY}│${RESET}${padRight(statusText, statusRaw.length, inner)}${GRAY}│${RESET}`);

  // Separator
  lines.push(`${GRAY}├${hLine('─', w - 2)}┤${RESET}`);

  // Event Rate panel
  const rate = computeRate();
  const rateLabel = `  Event Rate`;
  const rateVal = `${totalEvents} total`;
  const rateHeaderRaw = rateLabel + rateVal;
  const rateHeaderPad = inner - rateLabel.length - rateVal.length;
  lines.push(`${GRAY}│${RESET}  ${BOLD}${WHITE}Event Rate${RESET}${' '.repeat(Math.max(1, rateHeaderPad))}${DIM}${rateVal}${RESET}${GRAY}│${RESET}`);

  const sparkWidth = Math.min(inner - 14, rateHistory.length);
  const sparkValues = rateHistory.slice(-sparkWidth);
  const spark = sparkValues.length > 0 ? sparkline(sparkValues) : `${DIM}waiting...${RESET}`;
  const rateStr = `${rate.toFixed(1)}/s`;
  const sparkRawLen = sparkValues.length + 2 + rateStr.length + 2;
  lines.push(`${GRAY}│${RESET}  ${spark}  ${BRIGHT_YELLOW}${rateStr}${RESET}${' '.repeat(Math.max(0, inner - sparkRawLen))}${GRAY}│${RESET}`);

  // Separator
  lines.push(`${GRAY}├${hLine('─', w - 2)}┤${RESET}`);

  // Top Values panel
  lines.push(`${GRAY}│${RESET}  ${BOLD}${WHITE}Top Values${RESET}${' '.repeat(Math.max(0, inner - 12))}${GRAY}│${RESET}`);

  const sorted = [...keyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (sorted.length > 0) {
    const maxKeyLen = Math.max(...sorted.map(([k]) => k.length));
    const maxVal = Math.max(...sorted.map(([, v]) => v));
    const barMax = inner - maxKeyLen - 10;
    for (const [key, count] of sorted) {
      const barLen = maxVal > 0 ? Math.round((count / maxVal) * Math.max(1, barMax)) : 0;
      const bar = '█'.repeat(Math.max(0, barLen));
      const label = key.padEnd(maxKeyLen);
      const valStr = String(count);
      const lineRaw = `  ${label}  ${bar} ${valStr}`;
      lines.push(`${GRAY}│${RESET}  ${DIM}${label}${RESET}  ${CYAN}${bar}${RESET} ${BRIGHT_YELLOW}${valStr}${RESET}${' '.repeat(Math.max(0, inner - lineRaw.length))}${GRAY}│${RESET}`);
    }
  } else {
    lines.push(`${GRAY}│${RESET}  ${DIM}No events yet${RESET}${' '.repeat(Math.max(0, inner - 15))}${GRAY}│${RESET}`);
  }

  // Separator
  lines.push(`${GRAY}├${hLine('─', w - 2)}┤${RESET}`);

  // Recent Events panel
  lines.push(`${GRAY}│${RESET}  ${BOLD}${WHITE}Recent Events${RESET}${' '.repeat(Math.max(0, inner - 15))}${GRAY}│${RESET}`);

  if (recentEvents.length > 0) {
    for (const evt of recentEvents) {
      const headerText = `── #${evt.index} ── ${evt.time} ──`;
      lines.push(`${GRAY}│${RESET}  ${DIM}${headerText}${RESET}${' '.repeat(Math.max(0, inner - headerText.length - 2))}${GRAY}│${RESET}`);

      const keys = Object.keys(evt.data).slice(0, 3);
      const maxKey = Math.max(...keys.map((k) => k.length), 0);
      for (const key of keys) {
        const val = evt.data[key];
        let valStr: string;
        let valRawLen: number;
        if (typeof val === 'string' && /^0x[0-9a-fA-F]{40,64}$/.test(val)) {
          valStr = `${BRIGHT_WHITE}${truncateHex(val)}${RESET}`;
          valRawLen = truncateHex(val).length;
        } else {
          const s = String(val ?? 'null');
          const truncated = s.length > 40 ? s.slice(0, 37) + '...' : s;
          valStr = truncated;
          valRawLen = truncated.length;
        }
        const keyPadded = key.padEnd(maxKey);
        const lineRaw = `    ${keyPadded}   ${valStr}`;
        // Truncate if too wide
        if (lineRaw.length > inner - 2) {
          valStr = valStr.slice(0, inner - maxKey - 10) + '...';
        }
        lines.push(`${GRAY}│${RESET}    ${DIM}${keyPadded}${RESET}   ${valStr}${' '.repeat(Math.max(0, inner - 4 - maxKey - 3 - valRawLen))}${GRAY}│${RESET}`);
      }
    }
  } else {
    lines.push(`${GRAY}│${RESET}  ${DIM}Waiting for events...${RESET}${' '.repeat(Math.max(0, inner - 23))}${GRAY}│${RESET}`);
  }

  // Separator
  lines.push(`${GRAY}├${hLine('─', w - 2)}┤${RESET}`);

  // Footer with key bindings
  const footerText = `  q quit  │  r reset`;
  lines.push(`${GRAY}│${RESET}  ${DIM}${footerText}${RESET}${' '.repeat(Math.max(0, inner - footerText.length - 2))}${GRAY}│${RESET}`);

  // Bottom border
  lines.push(`${GRAY}╰${hLine('─', w - 2)}╯${RESET}`);

  return lines.join('\n');
}

// ── Event processing ─────────────────────────────────────────────────────────

function processEvent(event: Record<string, unknown>): void {
  totalEvents++;
  eventTimestamps.push(Date.now());

  // Track key frequencies
  for (const key of Object.keys(event)) {
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }

  // Track recent events
  const d = new Date();
  const time = `${d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  recentEvents.unshift({ index: totalEvents, time, data: event });
  if (recentEvents.length > MAX_RECENT) recentEvents.pop();
}

function resetStats(): void {
  totalEvents = 0;
  eventTimestamps.length = 0;
  rateHistory.length = 0;
  keyCounts.clear();
  recentEvents.length = 0;
}

// ── Terminal management ──────────────────────────────────────────────────────

function enterFullscreen(): void {
  process.stdout.write('\x1b[?1049h'); // alternate screen buffer
  process.stdout.write('\x1b[?25l');   // hide cursor
}

function exitFullscreen(): void {
  process.stdout.write('\x1b[?25h');   // show cursor
  process.stdout.write('\x1b[?1049l'); // restore screen buffer
}

function fullRender(): void {
  const output = render();
  process.stdout.write('\x1b[H\x1b[2J' + output);
}

// ── Main ─────────────────────────────────────────────────────────────────────

loadConfig()
  .then((config) => {
    if (!config.streamUrl || !config.apiKey) {
      console.error('API key required. Set INDEXING_API_KEY env var or add API_KEY to ~/.indexing-co/credentials');
      process.exit(1);
    }
    const stream = new StreamClient(config.streamUrl);

    enterFullscreen();

    // Raw mode for key input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
    }

    const shutdown = () => {
      clearInterval(tickTimer);
      stream.disconnect();
      exitFullscreen();

      // Print summary
      const elapsed = connectedAt ? Date.now() - connectedAt : 0;
      const durStr = formatDuration(elapsed);
      const rate = elapsed > 0 ? (totalEvents / (elapsed / 1000)).toFixed(1) : '0.0';
      console.log('');
      console.log(`${BOLD}${WHITE}Stream ended${RESET}`);
      console.log(`${DIM}Events:${RESET}   ${BRIGHT_YELLOW}${totalEvents}${RESET}`);
      console.log(`${DIM}Duration:${RESET} ${WHITE}${durStr}${RESET}`);
      console.log(`${DIM}Avg rate:${RESET} ${WHITE}${rate} events/sec${RESET}`);
      if (rateHistory.length > 0) {
        console.log(`${DIM}Rate:${RESET}     ${sparkline(rateHistory)}`);
      }
      console.log('');
      process.exit(0);
    };

    // Key bindings
    process.stdin.on('data', (key: string) => {
      if (key === 'q' || key === '\x03') { // q or Ctrl+C
        shutdown();
      } else if (key === 'r') {
        resetStats();
        fullRender();
      }
    });

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Resize handler
    process.stdout.on('resize', () => {
      fullRender();
    });

    // Tick timer — update uptime, sample rate, re-render
    const tickTimer = setInterval(() => {
      sampleRate();
      fullRender();
    }, 1000);

    // Initial render
    fullRender();

    // Connect
    const connectTimeout = setTimeout(() => {
      if (!isConnected) {
        exitFullscreen();
        console.error('Connection timed out after 10s');
        process.exit(1);
      }
    }, 10_000);

    const api = new ApiClient(config.baseUrl, config.apiKey);

    return stream.connect().then(async () => {
      isConnected = true;
      connectedAt = Date.now();
      socketId = stream.getSubscriptions().socketId;
      clearTimeout(connectTimeout);

      await ensurePipelineEnabled(api, channel);
      fullRender();

      stream.subscribe(channel, (events) => {
        for (const event of events) {
          processEvent(event);
        }
        sampleRate();
        fullRender();
      });
    });
  })
  .catch((err: unknown) => {
    exitFullscreen();
    console.error(`Failed to start: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
