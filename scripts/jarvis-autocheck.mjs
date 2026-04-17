import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import webpush from 'web-push';
import { fileURLToPath } from 'node:url';
 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
 
const HEALTH_URL = process.env.JARVIS_HEALTH_URL?.trim() || 'http://127.0.0.1:3000/health';
const LOG_DIR = path.resolve(projectRoot, 'logs');
const STATE_PATH = path.join(LOG_DIR, 'autocheck-state.json');
 
const TELEGRAM_API = 'https://api.telegram.org';
 
function nowIso() {
  return new Date().toISOString();
}
 
async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
 
async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
}
 
async function sendTelegram(text) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) return { ok: false, skipped: 'TELEGRAM_NOT_CONFIGURED' };
 
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
 
async function sendPush(title, body) {
  const subscriptionsPath =
    process.env.PUSH_SUBSCRIPTIONS_PATH?.trim() || path.resolve(projectRoot, 'data', 'push-subscriptions.json');
  const vapidPath =
    process.env.PUSH_VAPID_KEYS_PATH?.trim() || path.resolve(projectRoot, 'data', 'push-vapid.json');
 
  const store = await readJson(subscriptionsPath);
  const subs = Array.isArray(store?.subscriptions) ? store.subscriptions : [];
  if (!subs.length) return { ok: false, skipped: 'NO_SUBSCRIPTIONS' };
 
  let vapid;
  const configuredPublic = (process.env.PUSH_VAPID_PUBLIC_KEY || '').trim();
  const configuredPrivate = (process.env.PUSH_VAPID_PRIVATE_KEY || '').trim();
  if (configuredPublic && configuredPrivate) {
    vapid = { publicKey: configuredPublic, privateKey: configuredPrivate };
  } else {
    vapid = await readJson(vapidPath);
  }
  if (!vapid?.publicKey || !vapid?.privateKey) return { ok: false, skipped: 'NO_VAPID_KEYS' };
 
  webpush.setVapidDetails(process.env.PUSH_SUBJECT?.trim() || 'mailto:jarvis@localhost', vapid.publicKey, vapid.privateKey);
 
  const payload = JSON.stringify({ title, body, url: '/chat.html' });
  let sent = 0;
  let failed = 0;
 
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
 
  return { ok: sent > 0, sent, failed };
}
 
async function healthCheck() {
  const start = Date.now();
  try {
    const res = await fetch(HEALTH_URL, { method: 'GET' });
    const text = await res.text().catch(() => '');
    const durationMs = Date.now() - start;
    const ok = res.ok && /"status"\s*:\s*"ok"/.test(text);
    return { ok, status: res.status, durationMs, body: text.slice(0, 300) };
  } catch (err) {
    const durationMs = Date.now() - start;
    return { ok: false, status: 0, durationMs, error: String(err) };
  }
}
 
async function main() {
  const health = await healthCheck();
  const state = (await readJson(STATE_PATH)) || { lastOk: null, lastNotifiedAt: null };
 
  const changed = state.lastOk === null ? true : Boolean(state.lastOk) !== Boolean(health.ok);
 
  const nextState = {
    lastOk: Boolean(health.ok),
    lastCheckedAt: nowIso(),
    lastStatus: health.status,
    lastDurationMs: health.durationMs,
    lastError: health.error || null,
    lastBody: health.body || null,
    lastNotifiedAt: state.lastNotifiedAt || null,
  };

  console.log(
    `[${nowIso()}] health ${health.ok ? 'OK' : 'FAIL'} HTTP ${health.status || 0} ${health.durationMs}ms muutus=${changed}`,
  );

  if (!changed) {
    await writeJson(STATE_PATH, nextState);
    return;
  }
 
  const title = health.ok ? 'Jarvis OK' : 'Jarvis PROBLEM';
  // Keep push very short (small screen). Telegram can be slightly more detailed.
  const pushBody = health.ok
    ? 'Taastus.'
    : `health FAIL (HTTP ${health.status || 0}).`;

  const telegramBody = health.ok
    ? `Taastus. health OK (${health.durationMs} ms).`
    : `health FAIL (HTTP ${health.status || 0}, ${health.durationMs} ms). ${health.error || ''}`.trim();
 
  const telegram = await sendTelegram(
    `<b>${title}</b>\n${telegramBody}\n\nNext: pm2 logs jarvis --lines 80 --nostream`,
  );
  const push = await sendPush(title, pushBody);
 
  nextState.lastNotifiedAt = nowIso();
  nextState.lastNotify = { telegram, push };
  await writeJson(STATE_PATH, nextState);
}
 
await main();
