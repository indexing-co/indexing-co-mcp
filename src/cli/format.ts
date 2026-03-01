// ANSI escape codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const GRAY = '\x1b[90m';
const BRIGHT_YELLOW = '\x1b[93m';
const BRIGHT_BLUE = '\x1b[94m';
const BRIGHT_MAGENTA = '\x1b[95m';
const BRIGHT_WHITE = '\x1b[97m';

const BOX_WIDTH = 50;

function boxLine(content: string, rawLen: number): string {
  const pad = BOX_WIDTH - 2 - rawLen;
  return `│  ${content}${' '.repeat(Math.max(0, pad))}│`;
}

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function timestampMs(): string {
  const d = new Date();
  const t = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${t}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function printBanner(channel: string): void {
  const top = `╭${'─'.repeat(BOX_WIDTH - 2)}╮`;
  const bot = `╰${'─'.repeat(BOX_WIDTH - 2)}╯`;
  const empty = `│${' '.repeat(BOX_WIDTH - 2)}│`;

  const title = `${BOLD}${CYAN}◆ INDEXING.CO${RESET}${GRAY} — Live Event Stream${RESET}`;
  const titleRaw = '◆ INDEXING.CO — Live Event Stream';

  const chLabel = `${DIM}Channel:${RESET}  ${BOLD}${WHITE}${channel}${RESET}`;
  const chRaw = `Channel:  ${channel}`;

  console.log('');
  console.log(`${GRAY}${top}${RESET}`);
  console.log(`${GRAY}${boxLine(title, titleRaw.length)}${RESET}`);
  console.log(`${GRAY}${empty}${RESET}`);
  console.log(`${GRAY}${boxLine(chLabel, chRaw.length)}${RESET}`);
  console.log(`${GRAY}${bot}${RESET}`);
  console.log('');
}

export function printConnected(): void {
  const ts = timestamp();
  const dot = `${GREEN}${BOLD}●${RESET}`;
  const label = `${GREEN}Connected${RESET}`;
  const pad = BOX_WIDTH - 16 - ts.length;
  console.log(`  ${dot} ${label}${' '.repeat(Math.max(1, pad))}${DIM}${ts}${RESET}`);
  console.log('');
  console.log(`  ${DIM}Waiting for events...${RESET}`);
  console.log('');
}

export function printEvent(event: Record<string, unknown>, index: number): void {
  // Clear "Waiting for events..." on first event
  if (index === 1) {
    process.stdout.write('\x1b[2A\x1b[2K\x1b[1A\x1b[2K');
  }

  const ts = timestampMs();
  const num = `#${index}`;
  const dashesLeft = 4;
  const dashesRight = BOX_WIDTH - dashesLeft - num.length - 4 - ts.length - 4;

  console.log(
    `${DIM}${'─'.repeat(dashesLeft)} ${RESET}${BOLD}${WHITE}${num}${RESET} ${DIM}${'─'.repeat(Math.max(1, dashesRight))} ${ts} ──${RESET}`
  );

  const keys = Object.keys(event);
  const maxKeyLen = Math.max(...keys.map((k) => k.length), 0);

  for (const key of keys) {
    const paddedKey = key.padEnd(maxKeyLen);
    const val = event[key];
    console.log(`  ${DIM}${paddedKey}${RESET}   ${colorizeValue(val)}`);
  }

  console.log('');
}

export function printDisconnect(count: number, startTime: number): void {
  const elapsed = Date.now() - startTime;
  const durStr = formatDuration(elapsed);
  const rate = elapsed > 0 ? (count / (elapsed / 1000)).toFixed(1) : '0.0';

  const top = `╭${'─'.repeat(BOX_WIDTH - 2)}╮`;
  const bot = `╰${'─'.repeat(BOX_WIDTH - 2)}╯`;

  const line1 = `${BOLD}${WHITE}Stream ended${RESET}`;
  const line1Raw = 'Stream ended';
  const line2 = `${DIM}Events received:${RESET}  ${BOLD}${BRIGHT_YELLOW}${count}${RESET}`;
  const line2Raw = `Events received:  ${count}`;
  const line3 = `${DIM}Duration:${RESET}         ${BOLD}${WHITE}${durStr}${RESET}`;
  const line3Raw = `Duration:         ${durStr}`;
  const line4 = `${DIM}Avg rate:${RESET}         ${BOLD}${WHITE}${rate} events/sec${RESET}`;
  const line4Raw = `Avg rate:         ${rate} events/sec`;

  console.log('');
  console.log(`${GRAY}${top}${RESET}`);
  console.log(`${GRAY}${boxLine(line1, line1Raw.length)}${RESET}`);
  console.log(`${GRAY}${boxLine(line2, line2Raw.length)}${RESET}`);
  console.log(`${GRAY}${boxLine(line3, line3Raw.length)}${RESET}`);
  console.log(`${GRAY}${boxLine(line4, line4Raw.length)}${RESET}`);
  console.log(`${GRAY}${bot}${RESET}`);
  console.log('');
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return `${min}m ${rem}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ${rem}s`;
}

function colorizeValue(val: unknown, depth = 0): string {
  if (val === null || val === undefined) {
    return `${DIM}${ITALIC}${GRAY}null${RESET}`;
  }

  if (typeof val === 'boolean') {
    return val ? `${GREEN}true${RESET}` : `${RED}false${RESET}`;
  }

  if (typeof val === 'number') {
    return `${BRIGHT_YELLOW}${val}${RESET}`;
  }

  if (typeof val === 'string') {
    // Ethereum address: 0x + 40 hex chars
    if (/^0x[0-9a-fA-F]{40}$/.test(val)) {
      return `${BRIGHT_MAGENTA}${truncateHex(val)}${RESET}`;
    }
    // Tx hash: 0x + 64 hex chars
    if (/^0x[0-9a-fA-F]{64}$/.test(val)) {
      return `${BRIGHT_BLUE}${truncateHex(val)}${RESET}`;
    }
    // Numeric string
    if (/^\d+$/.test(val)) {
      return `${BRIGHT_YELLOW}${val}${RESET}`;
    }
    // Long string
    if (val.length > 80) {
      return `${BRIGHT_WHITE}${val.slice(0, 77)}...${RESET}`;
    }
    return `${BRIGHT_WHITE}${val}${RESET}`;
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return `${DIM}[]${RESET}`;
    const indent = '  '.repeat(depth + 2);
    const items = val.map((v) => `${indent}${colorizeValue(v, depth + 1)}`).join('\n');
    return `\n${items}`;
  }

  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return `${DIM}{}${RESET}`;
    const indent = '  '.repeat(depth + 2);
    const maxKey = Math.max(...entries.map(([k]) => k.length));
    const lines = entries.map(([k, v]) => {
      return `${indent}${DIM}${k.padEnd(maxKey)}${RESET}   ${colorizeValue(v, depth + 1)}`;
    });
    return `\n${lines.join('\n')}`;
  }

  return `${BRIGHT_WHITE}${String(val)}${RESET}`;
}

function truncateHex(hex: string): string {
  return `${hex.slice(0, 6)}...${hex.slice(-4)}`;
}
