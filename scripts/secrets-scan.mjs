import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

const SKIP_DIRS = new Set(['node_modules', 'dist', 'backups', 'tmp', '.git', 'data']);
const SKIP_FILES = new Set(['package-lock.json']);
const SKIP_PATH_PARTS = [
  path.join('scripts', 'archive'),
];

const SKIP_FILE_REGEX = [
  /^\.env(\..*)?$/i,
  /\.zip$/i,
];

const PATTERNS = [
  // OpenAI API key (common formats)
  { id: 'OPENAI_API_KEY=sk-*', re: /OPENAI_API_KEY\s*=\s*["']?\s*sk-(?:proj-)?[A-Za-z0-9]{20,}\b/i },
  { id: 'sk-* token', re: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/ },

  // Telegram bot token: <digits>:<base64url-ish>
  { id: 'TELEGRAM_BOT_TOKEN', re: /\b\d{8,}:[A-Za-z0-9_-]{20,}\b/ },

  // WhatsApp / Meta Graph access tokens often start with EAAG... and are long
  { id: 'WHATSAPP_META_TOKEN', re: /\bEAAG[A-Za-z0-9]{40,}\b/ },

  // VAPID private key (base64) if hardcoded
  { id: 'PUSH_VAPID_PRIVATE_KEY_VALUE', re: /PUSH_VAPID_PRIVATE_KEY\s*=\s*["']?[A-Za-z0-9+/=]{40,}["']?/i },
];

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      yield* walk(full);
      continue;
    }
    if (!ent.isFile()) continue;
    if (SKIP_FILES.has(ent.name)) continue;
    if (SKIP_FILE_REGEX.some((re) => re.test(ent.name))) continue;
    yield full;
  }
}

function isProbablyText(buf) {
  // Heuristic: if it contains a NUL byte, treat as binary.
  return !buf.includes(0);
}

function findFirstLineNumber(text, index) {
  // 1-indexed line number
  return text.slice(0, index).split('\n').length;
}

let hits = [];

for await (const filePath of walk(root)) {
  const rel = path.relative(root, filePath);
  if (SKIP_PATH_PARTS.some((part) => rel.includes(part))) continue;
  let buf;
  try {
    buf = await fs.readFile(filePath);
  } catch {
    continue;
  }

  if (!isProbablyText(buf)) continue;
  const text = buf.toString('utf8');

  for (const p of PATTERNS) {
    const m = p.re.exec(text);
    if (!m) continue;
    const line = findFirstLineNumber(text, m.index);
    hits.push({ pattern: p.id, file: path.relative(root, filePath), line });
    if (hits.length >= 20) break;
  }
  if (hits.length >= 20) break;
}

if (hits.length) {
  console.error(`FAIL: secret-like patterns found (${hits.length} shown)`);
  for (const h of hits.slice(0, 20)) {
    console.error(`- ${h.pattern} @ ${h.file}:${h.line}`);
  }
  process.exit(1);
}

console.log('OK: secrets scan');

