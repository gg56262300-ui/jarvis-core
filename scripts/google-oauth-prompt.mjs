#!/usr/bin/env node
/**
 * Legacy abiskript (käsitsi code). Soovitus: kasuta nüüd 1‑kliki OAuth'i:
 * - /api/gmail/google/start
 * - /api/contacts/google/start
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';

const kind = (process.argv[2] ?? '').toLowerCase();
const base = process.env.JARVIS_URL ?? 'http://127.0.0.1:3000';

const paths = {
  gmail: { auth: '/api/gmail/google/auth-url', authorize: '/api/gmail/google/authorize', start: '/api/gmail/google/start' },
  contacts: {
    auth: '/api/contacts/google/auth-url',
    authorize: '/api/contacts/google/authorize',
    start: '/api/contacts/google/start',
  },
};

if (kind !== 'gmail' && kind !== 'contacts') {
  console.error('Kasutus: node scripts/google-oauth-prompt.mjs gmail|contacts');
  process.exit(1);
}

const { auth, authorize } = paths[kind];
const { start } = paths[kind];

console.log('\x1b[1;42m========== KOPERI SIIT ==========\x1b[0m\n');

const authRes = await fetch(`${base}${auth}`);
if (!authRes.ok) {
  console.error(`auth-url HTTP ${authRes.status}`);
  process.exit(1);
}
const authJson = await authRes.json();
const authUrl = authJson.authUrl;
if (!authUrl) {
  console.error('authUrl puudub vastuses:', authJson);
  process.exit(1);
}

console.log('1) Soovitus: kasuta 1‑kliki start URL-i (sama tulem, vähem paste):\n');
console.log(`${base}${start}`);
console.log('\nKui pead ikka authUrl kasutama, siis see on all.\n');
console.log('2) Ava brauseris see link (või Macis avan automaatselt):\n');
console.log(authUrl);
console.log('');

if (process.platform === 'darwin') {
  const r = spawnSync('open', [authUrl], { stdio: 'ignore' });
  if (r.status === 0) {
    console.log('(Link avatud: open [url])\n');
  }
}

const rl = readline.createInterface({ input, output });
const code = (await rl.question('3) Kleebi siia OAuth code (aadressiribalt või lehelt) ja vajuta Enter:\n')).trim();
rl.close();

if (!code) {
  console.error('Code puudu.');
  process.exit(1);
}

const postRes = await fetch(`${base}${authorize}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});

const text = await postRes.text();
console.log('\n--- vastus ---\n');
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
if (!postRes.ok) {
  process.exit(1);
}
