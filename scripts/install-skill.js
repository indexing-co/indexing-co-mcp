import fs from 'fs';
import path from 'path';
import os from 'os';

const skillName = 'indexing-co-pipelines';
const src = path.resolve(import.meta.dirname, '..', 'SKILL.md');
const dest = path.join(os.homedir(), '.claude', 'skills', skillName, 'SKILL.md');

if (!fs.existsSync(src)) {
  console.error(`[install-skill] SKILL.md not found at ${src}`);
  process.exit(1);
}

const srcContent = fs.readFileSync(src, 'utf-8');
const destDir = path.dirname(dest);

// Check if already up to date
if (fs.existsSync(dest)) {
  const destContent = fs.readFileSync(dest, 'utf-8');
  if (srcContent === destContent) {
    console.log(`[install-skill] ${skillName} is up to date`);
    process.exit(0);
  }
}

fs.mkdirSync(destDir, { recursive: true });
fs.writeFileSync(dest, srcContent);
console.log(`[install-skill] Installed ${skillName} skill to ${dest}`);
