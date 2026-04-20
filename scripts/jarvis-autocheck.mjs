/* global AbortSignal */
import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import webpush from 'web-push';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function hydrateOpenAiKeyFromFile() {
  const keyFile = (process.env.OPENAI_API_KEY_FILE || '').trim();
  if (!keyFile) return;
  try {
    const abs = path.isAbsolute(keyFile) ? keyFile : path.resolve(projectRoot, keyFile);
    const raw = fsSync.readFileSync(abs, 'utf8').trim().replace(/^\uFEFF/, '');
    if (!raw) return;
    const existing = (process.env.OPENAI_API_KEY || '').trim();
    if (!existing) process.env.OPENAI_API_KEY = raw;
  } catch {
    /* ignore */
  }
}

const HEALTH_URL = process.env.JARVIS_HEALTH_URL?.trim() || 'http://127.0.0.1:3000/health';
const PUBLIC_BASE = (process.env.JARVIS_PUBLIC_BASE?.trim() || 'https://jarvis-kait.us').replace(/\/$/, '');
const CHANNEL_LOCAL_URL =
  process.env.JARVIS_CHANNEL_URL?.trim() || 'http://127.0.0.1:3000/api/chat/channel?after=0';
const CHANNEL_PUBLIC_URL = `${PUBLIC_BASE}/api/chat/channel?after=0`;

const LOG_DIR = path.resolve(projectRoot, 'logs');
const STATE_PATH = path.join(LOG_DIR, 'autocheck-state.json');
const REMEDIATE_COOLDOWN_MS = 30 * 60 * 1000;
 
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
 
  webpush.setVapidDetails(process.env.PUSH_SUBJECT?.trim() || 'https://jarvis-kait.us', vapid.publicKey, vapid.privateKey);
 
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
    const res = await fetch(HEALTH_URL, { method: 'GET', signal: AbortSignal.timeout(8000) });
    const text = await res.text().catch(() => '');
    const durationMs = Date.now() - start;
    const ok = res.ok && /"status"\s*:\s*"ok"/.test(text);
    return { ok, status: res.status, durationMs, body: text.slice(0, 300) };
  } catch (err) {
    const durationMs = Date.now() - start;
    return { ok: false, status: 0, durationMs, error: String(err) };
  }
}

async function openaiAuthCheck() {
  const key = (process.env.OPENAI_API_KEY || '').trim().replace(/^\uFEFF/, '');
  if (!key) {
    return { ok: false, reason: 'MISSING_KEY', durationMs: 0, label: 'openai' };
  }
  const start = Date.now();
  try {
    const { default: OpenAI } = await import('openai');
    const orgRaw = (process.env.OPENAI_ORG_ID || '').trim().replace(/^\uFEFF/, '');
    const projectRaw = (process.env.OPENAI_PROJECT_ID || '').trim().replace(/^\uFEFF/, '');
    const baseURLRaw = (process.env.OPENAI_BASE_URL || '').trim().replace(/^\uFEFF/, '');
    const organization = orgRaw.length > 0 ? orgRaw : null;
    const project = projectRaw.length > 0 ? projectRaw : null;
    const baseURL = baseURLRaw.length > 0 ? baseURLRaw : undefined;
    const client = new OpenAI({
      apiKey: key,
      organization,
      project,
      ...(baseURL ? { baseURL } : {}),
      maxRetries: 0,
      timeout: 15_000,
    });
    await client.models.list({ limit: 1 });
    const durationMs = Date.now() - start;
    return { ok: true, durationMs, label: 'openai' };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      ok: false,
      durationMs,
      reason: 'OPENAI_CALL_FAILED',
      error: String(err).slice(0, 220),
      label: 'openai',
    };
  }
}

async function channelPollCheck(url, label) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text().catch(() => '');
    const durationMs = Date.now() - start;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, durationMs, error: 'NOT_JSON', label };
    }
    const ok = res.ok && parsed.ok === true && Array.isArray(parsed.messages);
    return { ok, status: res.status, durationMs, label };
  } catch (err) {
    return { ok: false, status: 0, durationMs: Date.now() - start, error: String(err), label };
  }
}

async function runAllChecks() {
  const health = await healthCheck();
  const channelLocal = await channelPollCheck(CHANNEL_LOCAL_URL, 'channelLocal');
  const channelPublic = await channelPollCheck(CHANNEL_PUBLIC_URL, 'channelPublic');
  const openai = await openaiAuthCheck();
  const overallOk = Boolean(health.ok && channelLocal.ok && channelPublic.ok && openai.ok);
  return { health, channelLocal, channelPublic, openai, overallOk };
}

function summarizeFailure(checks) {
  const parts = [];
  if (!checks.health.ok) parts.push('health');
  if (!checks.channelLocal.ok) parts.push('kanal(kohalik)');
  if (!checks.channelPublic.ok) parts.push('kanal(avalik/tunnel)');
  if (checks.openai && !checks.openai.ok) parts.push('openai(autentimine)');
  return parts.length ? parts.join(', ') : '';
}

function pm2Restart(name) {
  return new Promise((resolve) => {
    const child = spawn('pm2', ['restart', name], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function tryRemediate(state, checks) {
  const last = state.lastRemediateAt ? Date.parse(state.lastRemediateAt) : 0;
  if (last && Date.now() - last < REMEDIATE_COOLDOWN_MS) {
    return { ran: false, reason: 'cooldown' };
  }

  const h = checks.health.ok;
  const cl = checks.channelLocal.ok;
  const cp = checks.channelPublic.ok;
  if (h && cl && cp && checks.openai && !checks.openai.ok) {
    return { ran: false, reason: 'openai_needs_env_fix' };
  }

  if (!h || !cl) {
    const ok = await pm2Restart('jarvis');
    return { ran: true, action: 'pm2 restart jarvis', ok };
  }
  if (h && cl && !cp) {
    const ok = await pm2Restart('cloudflared');
    return { ran: true, action: 'pm2 restart cloudflared', ok };
  }
  return { ran: false, reason: 'nothing_to_do' };
}

async function main() {
  hydrateOpenAiKeyFromFile();
  let state = (await readJson(STATE_PATH)) || { lastOk: null, lastNotifiedAt: null };
  let checks = await runAllChecks();
  let remediate = { ran: false };

  if (!checks.overallOk) {
    remediate = await tryRemediate(state, checks);
    if (remediate.ran) {
      state = { ...state, lastRemediateAt: nowIso(), lastRemediateAction: remediate.action };
      await delay(8000);
      checks = await runAllChecks();
    }
  }

  const overallOk = checks.overallOk;
  const changed = state.lastOk === null ? true : Boolean(state.lastOk) !== Boolean(overallOk);

  const nextState = {
    lastOk: Boolean(overallOk),
    lastCheckedAt: nowIso(),
    lastStatus: checks.health.status,
    lastDurationMs: checks.health.durationMs,
    lastError: checks.health.error || null,
    lastBody: checks.health.body || null,
    lastChecks: {
      health: { ok: checks.health.ok, status: checks.health.status, durationMs: checks.health.durationMs },
      channelLocal: {
        ok: checks.channelLocal.ok,
        status: checks.channelLocal.status,
        durationMs: checks.channelLocal.durationMs,
        error: checks.channelLocal.error || null,
      },
      channelPublic: {
        ok: checks.channelPublic.ok,
        status: checks.channelPublic.status,
        durationMs: checks.channelPublic.durationMs,
        error: checks.channelPublic.error || null,
      },
      openai: {
        ok: checks.openai.ok,
        durationMs: checks.openai.durationMs,
        reason: checks.openai.reason || null,
        error: checks.openai.error || null,
      },
    },
    lastRemediateAt: state.lastRemediateAt || null,
    lastRemediateAction: remediate.ran ? remediate.action : state.lastRemediateAction || null,
    lastRemediateExitOk: remediate.ran ? Boolean(remediate.ok) : null,
    lastNotifiedAt: state.lastNotifiedAt || null,
  };

  const failSummary = summarizeFailure(checks);

  console.log(
    `[${nowIso()}] overall ${overallOk ? 'OK' : 'FAIL'} health=${checks.health.ok ? 'OK' : 'FAIL'} chL=${checks.channelLocal.ok ? 'OK' : 'FAIL'} chPub=${checks.channelPublic.ok ? 'OK' : 'FAIL'} openai=${checks.openai.ok ? 'OK' : 'FAIL'} muutus=${changed}${remediate.ran ? ` remediate=${remediate.action}` : ''}`,
  );

  if (!changed) {
    await writeJson(STATE_PATH, nextState);
    return;
  }

  const title = overallOk ? 'Jarvis OK' : 'Jarvis PROBLEM';
  const pushBody = overallOk
    ? 'Taastus (sh kanal + OpenAI).'
    : failSummary
      ? `FAIL: ${failSummary}.`
      : 'FAIL.';

  const openaiHint =
    checks.openai && !checks.openai.ok
      ? ` OpenAI: ${checks.openai.reason || 'FAIL'}${checks.openai.error ? ` — ${checks.openai.error}` : ''}. Paranda .env (OPENAI_API_KEY jms), siis pm2 restart jarvis --update-env.`
      : '';

  const telegramBody = overallOk
    ? `Taastus. health + kanal + OpenAI OK (kohalik + avalik tunnel).`
    : `FAIL: ${failSummary || 'tundmatu'}. health HTTP ${checks.health.status || 0}, chL HTTP ${checks.channelLocal.status || 0}, chPub HTTP ${checks.channelPublic.status || 0}.${openaiHint} ${remediate.ran ? `Remediate: ${remediate.action} (exit ${remediate.ok ? 'OK' : 'FAIL'}). ` : ''}`.trim();

  const telegram = await sendTelegram(
    `<b>${title}</b>\n${telegramBody}\n\nNext: npm run channel:check — pm2 logs cloudflared --lines 40 --nostream`,
  );
  const push = await sendPush(title, pushBody);

  nextState.lastNotifiedAt = nowIso();
  nextState.lastNotify = { telegram, push };
  await writeJson(STATE_PATH, nextState);
}

await main();
