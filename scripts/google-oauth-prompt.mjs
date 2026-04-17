#!/usr/bin/env node
/**
 * Küsib OAuth koodi käsitsi ja saadab POST /api/.../google/authorize.
 * Kasutus: node scripts/google-oauth-prompt.mjs gmail
 *          node scripts/google-oauth-prompt.mjs contacts
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';

const kind = (process.argv[2] ?? '').toLowerCase();
const base = process.env.JARVIS_URL ?? 'http://127.0.0.1:3000';

const paths = {
  gmail: { auth: '/api/gmail/google/auth-url', authorize: '/api/gmail/google/authorize' },
  contacts: { auth: '/api/contacts/google/auth-url', authorize: '/api/contacts/google/authorize' },
};

if (kind !== 'gmail' && kind !== 'contacts') {
  console.error('Kasutus: node scripts/google-oauth-prompt.mjs gmail|contacts');
  process.exit(1);
}

const { auth, authorize } = paths[kind];

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

console.log('1) Ava brauseris see link (või vajuta Enter, et Macis avada Safari/Chrome):\n');
console.log(authUrl);
console.log('');

if (process.platform === 'darwin') {
  const r = spawnSync('open', [authUrl], { stdio: 'ignore' });
  if (r.status === 0) {
    console.log('(Link avatud: open [url])\n');
  }
}

const rl = readline.createInterface({ input, output });
const code = (await rl.question('2) Kleebi siia OAuth code (aadressiribalt või lehelt) ja vajuta Enter:\n')).trim();
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
