import type { Request, Response } from 'express';
import OpenAI, { APIConnectionTimeoutError, APIError, RateLimitError } from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/index.js';
import {
  createCalendarEvent,
  DEFAULT_CALENDAR_TIMEZONE,
  deleteAllEventsOnCalendarDates,
  deleteCalendarEventById,
  listEventsOverlappingLocalInclusiveRange,
  listEventsOverlappingRange,
  listUpcomingEventsWithinDays,
  patchCalendarEventById,
  type CalendarEventItem,
} from '../modules/calendar/services/googleCalendar.service.js';
import { appendAgentInboxEntry } from '../agent-inbox/agent-inbox.service.js';
import { CalculatorService } from '../calculator/calculator.service.js';
import { appendChatChannelMessage } from './channel.controller.js';
import { sendTelegramMessage } from '../integrations/telegram/telegram.client.js';
import { logger } from '../shared/logger/logger.js';
import { DateTime } from 'luxon';

const MOBILE_REMOTE_STATE_PATH = path.resolve(process.cwd(), 'logs', 'mobile-remote-state.json');
const MOBILE_RULES_LOG_PATH = path.resolve(process.cwd(), 'logs', 'mobile-rules.jsonl');
const MOBILE_WORKFLOW_STAGES = [
  { key: 'A', label: 'Make stabiliseerimine' },
  { key: 'B', label: 'Mobiilikanali töökindlus' },
  { key: 'C', label: 'CRM telefonitest' },
  { key: 'D', label: 'E-post + kontaktid telefonitest' },
  { key: 'E', label: 'WhatsApp valmisoleku audit' },
] as const;

type MobileRemoteMode = 'continue' | 'stop';
type MobileRemoteCommand = 'status' | 'continue' | 'stop' | 'next' | 'help' | 'wake' | 'sleep' | 'rules';
type MobileRemoteStageKey = (typeof MOBILE_WORKFLOW_STAGES)[number]['key'];
type MobileRemoteState = {
  mode: MobileRemoteMode;
  stageKey: MobileRemoteStageKey;
  stageIndex: number;
  version: number;
  lastCommand: MobileRemoteCommand | 'init';
  lastApplied: boolean;
  updatedAt: string;
  source: 'chat-mobile';
};

async function readMobileRemoteState(): Promise<MobileRemoteState> {
  try {
    const raw = await fs.readFile(MOBILE_REMOTE_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MobileRemoteState>;
    const mode = parsed.mode === 'stop' ? 'stop' : 'continue';
    const stageIndexRaw = Number(parsed.stageIndex);
    const stageIndex =
      Number.isInteger(stageIndexRaw) && stageIndexRaw >= 0 && stageIndexRaw < MOBILE_WORKFLOW_STAGES.length
        ? stageIndexRaw
        : 0;
    const stageKey = MOBILE_WORKFLOW_STAGES[stageIndex].key;
    const version = Number.isInteger(Number(parsed.version)) ? Number(parsed.version) : 1;
    const lastCommand =
      typeof parsed.lastCommand === 'string' &&
      ['status', 'continue', 'stop', 'next', 'help', 'wake', 'sleep', 'rules', 'init'].includes(parsed.lastCommand)
        ? (parsed.lastCommand as MobileRemoteState['lastCommand'])
        : 'init';
    const lastApplied = typeof parsed.lastApplied === 'boolean' ? parsed.lastApplied : true;
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString();
    return { mode, stageKey, stageIndex, version, lastCommand, lastApplied, updatedAt, source: 'chat-mobile' };
  } catch {
    return {
      mode: 'continue',
      stageKey: MOBILE_WORKFLOW_STAGES[0].key,
      stageIndex: 0,
      version: 1,
      lastCommand: 'init',
      lastApplied: true,
      updatedAt: new Date().toISOString(),
      source: 'chat-mobile',
    };
  }
}

async function writeMobileRemoteState(state: MobileRemoteState): Promise<MobileRemoteState> {
  const nextState: MobileRemoteState = {
    ...state,
    source: 'chat-mobile',
  };
  await fs.mkdir(path.dirname(MOBILE_REMOTE_STATE_PATH), { recursive: true });
  await fs.writeFile(MOBILE_REMOTE_STATE_PATH, JSON.stringify(nextState, null, 2), { encoding: 'utf8', mode: 0o600 });
  return nextState;
}

/**
 * Kas küsimus on Jarvisi koodibaasi / töövooprojekti faasi kohta (mitte Google Calendar).
 * Pikad vene laused ei läbi normalizeMobileCommand täpset võrdlust — muidu läheks LLM-i ja mudel võib kutsuda list_calendar_events.
 */
function isJarvisDevStatusQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || t.length > 500) {
    return false;
  }
  if (
    /календар|kalend|calendar|meeldetulet|напомн|reminder|\bkiri\b|mail|\bkontakt|contact|событ|sündmus|\bevent\b|kohtumine/i.test(
      t,
    )
  ) {
    return false;
  }

  const lower = t.toLowerCase();
  const hasJarvis =
    /\bjarvis\b/i.test(t) ||
    /\bджарвис\b/i.test(t) ||
    /\bjärvi(s)?\b/i.test(lower) ||
    /\brobert\b/i.test(t) ||
    /\bроберт\b/i.test(t);

  if (!hasJarvis) {
    return false;
  }

  const stageAsk =
    /\b(этап|этапе|этапы|стадии|стадия|стадией|стадию|развития|развитие|готовности)\b/i.test(t) ||
    /\b(в\s+каком|на\s+какой|на\s+какой\s+стадии|какой\s+сейчас\s+этап|какая\s+сейчас\s+стадия)\b/i.test(t) ||
    /\b(faas|etapp|etapis|staadium|stage|progress)\b/i.test(lower) ||
    /\b(arengujärk|arengu\s+järk|tööde\s+faas)\b/i.test(lower) ||
    /\b(mis\s+faasis|millises\s+faasis|kus\s+me\s+oleme\s+projekti|projekti\s+faas)\b/i.test(lower);

  const projectContext = /\b(проект|projekt|project|repo|koodibaas)\b/i.test(t);
  return Boolean(stageAsk || (projectContext && /\b(статус|staatus|status|olek|seis)\b/i.test(lower)));
}

function normalizeMobileCommand(raw: string): MobileRemoteCommand | null {
  const stripped = raw
    .trim()
    .replace(/^[\s,.:;-]*(?:robert|jarvis|роберт|джарвис)(?=\s|[,:;.!?-]|$)[,:;.!?-]*\s*/iu, '')
    .replaceAll(/[!?.,;:]+$/gu, '')
    .trim()
    .toLowerCase();

  if (
    [
      'jdev',
      'jarvis projekt',
      'jarvis project',
      'jarvis-projekt',
      'jarvis-projekti staatus',
      'проект jarvis',
      'проект джарвис',
      'projekt jarvis',
      'staatus',
      'status',
      'статус',
      'этап',
      'этапы',
      'mis järgmine',
      'mis on järgmine',
      'mis järgmine samm',
      'järgmine samm',
      'что дальше',
      'что делать',
      'что делать дальше',
      'какое дальше',
      'какое следующее',
      'какое следующее действие',
      'следующее действие',
      'next step',
      'what next',
      "what's next",
      'mis teeme',
      'mis me teeme',
    ].includes(stripped)
  ) {
    return 'status';
  }
  if (['jätka', 'jätkame', 'continue', 'go', 'да', 'jah', 'продолжай', 'дальше'].includes(stripped)) {
    return 'continue';
  }
  if (['individuaalselt', 'individual', 'индивидуально', 'работай индивидуально'].includes(stripped)) {
    return 'continue';
  }
  if (['stop', 'stopp', 'seis', 'pause', 'пауза', 'стоп', 'ei', 'нет'].includes(stripped)) return 'stop';
  if (
    ['maga', 'sleep', 'засыпай', 'robert засыпай', 'спи', 'спать', 'уснуть', 'уйди в сон', 'sleep mode', 'uinu'].includes(stripped)
  ) {
    return 'sleep';
  }
  if (['järgmine', 'next', 'следующий', 'dalše', 'дальше этап'].includes(stripped)) return 'next';
  if (['abi', 'help', 'помощь', 'команды', 'käsud'].includes(stripped)) return 'help';
  if (['aaa', 'aaaa', 'rules', 'reeglid', 'правила'].includes(stripped)) return 'rules';
  if (
    [
      'ärka',
      'ärkame',
      'wake',
      'wake up',
      'просыпайся',
      'robert prosõpaisja',
      'robert prosypaisya',
      'проснись',
    ].includes(stripped)
  ) {
    return 'wake';
  }
  return null;
}

function extractMobileRuleNote(raw: string): string {
  const withoutBotName = raw
    .trim()
    .replace(/^[\s,.:;-]*(?:robert|jarvis|роберт|джарвис)(?=\s|[,:;.!?-]|$)[,:;.!?-]*\s*/iu, '')
    .trim();
  const note = withoutBotName
    .replace(/^(?:aaa|aaaa|rules|reeglid|правила)(?=\s|[,:;.!?-]|$)[,:;.!?-]*\s*/iu, '')
    .trim();
  return note;
}

async function appendMobileRuleNote(rawUserMessage: string): Promise<void> {
  const note = extractMobileRuleNote(rawUserMessage);
  const payload = {
    ts: new Date().toISOString(),
    source: 'chat-mobile',
    kind: 'rules',
    note: note || 'KANALI_VALVE',
    raw: rawUserMessage.trim(),
  };
  await fs.mkdir(path.dirname(MOBILE_RULES_LOG_PATH), { recursive: true });
  await fs.appendFile(MOBILE_RULES_LOG_PATH, `${JSON.stringify(payload)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function applyMobileCommand(
  prev: MobileRemoteState,
  command: MobileRemoteCommand,
): { next: MobileRemoteState; applied: boolean; reply: string } {
  const base = { ...prev };
  const stage = MOBILE_WORKFLOW_STAGES[base.stageIndex];
  const makeStatusLine = (mode: MobileRemoteMode, version: number) =>
    `MODE:${mode === 'stop' ? 'STOP' : 'JÄTKA'} | ETAPP:${stage.key} ${stage.label} | v${version}`;

  if (command === 'status') {
    return { next: base, applied: false, reply: `STAATUS: ${makeStatusLine(base.mode, base.version)}` };
  }
  if (command === 'help') {
    return {
      next: base,
      applied: false,
      reply:
        'ABI: ÄRKA | MAGA | INDIVIDUAALSELT | STAATUS | JDEV | JARVIS PROJEKT | JÄTKA | STOP | JÄRGMINE | AAAA. Cursori agent (Mac): alusta rida sõnaga AGENT: või CURSOR: (vene АГЕНТ: / КУРСОР:). Kalender/meil eraldi — tavaline lause ilma nende eesliiteta.',
    };
  }
  if (command === 'rules') {
    return {
      next: base,
      applied: false,
      reply: 'AAAA ✅ Kanali valve aktiivne ja reeglisoov logitud. Hoian ühendust taustal töös.',
    };
  }
  if (command === 'next') {
    if (base.stageIndex >= MOBILE_WORKFLOW_STAGES.length - 1) {
      return { next: base, applied: false, reply: 'JÄRGMINE: ETAPP E on viimane. Vasta: STAATUS.' };
    }
    const stageIndex = base.stageIndex + 1;
    const stageKey = MOBILE_WORKFLOW_STAGES[stageIndex].key;
    const next = {
      ...base,
      stageIndex,
      stageKey,
      version: base.version + 1,
      lastCommand: 'next' as const,
      lastApplied: true,
      updatedAt: new Date().toISOString(),
    };
    const s = MOBILE_WORKFLOW_STAGES[stageIndex];
    return { next, applied: true, reply: `OK. ETAPP:${s.key} ${s.label} ✅` };
  }

  const nextMode: MobileRemoteMode =
    command === 'wake' || command === 'continue' ? 'continue' : command === 'sleep' || command === 'stop' ? 'stop' : base.mode;
  if (nextMode === base.mode) {
    return { next: base, applied: false, reply: `JUBA AKTIIVNE: ${makeStatusLine(base.mode, base.version)}` };
  }

  const next = {
    ...base,
    mode: nextMode,
    version: base.version + 1,
    lastCommand: command,
    lastApplied: true,
    updatedAt: new Date().toISOString(),
  };
  if (command === 'wake') return { next, applied: true, reply: 'ÄRKVEL ✅ MODE:JÄTKA. Käsk: STAATUS' };
  if (command === 'sleep') return { next, applied: true, reply: 'MAGAN 😴 MODE:STOP. Käsk äratuseks: ÄRKA / просыпайся' };
  if (command === 'continue') return { next, applied: true, reply: 'OK. MODE:JÄTKA ✅' };
  return { next, applied: true, reply: 'OK. MODE:STOP ⛔' };
}

async function fetchJsonSafe(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function buildMobileStatusReply(): Promise<string> {
  const [state, healthRaw, crmRaw, makeRaw] = await Promise.all([
    readMobileRemoteState(),
    fetchJsonSafe('http://127.0.0.1:3000/health'),
    fetchJsonSafe('http://127.0.0.1:3000/api/crm/leads'),
    fetchJsonSafe('http://127.0.0.1:3000/api/integrations/make/failed?limit=20'),
  ]);
  const healthOk =
    typeof healthRaw === 'object' && healthRaw !== null && (healthRaw as Record<string, unknown>).status === 'ok';
  const crmOk =
    typeof crmRaw === 'object' &&
    crmRaw !== null &&
    ((crmRaw as Record<string, unknown>).status === 'ready' ||
      Array.isArray((crmRaw as Record<string, unknown>).leads));
  const makeSummary =
    typeof makeRaw === 'object' && makeRaw !== null
      ? ((makeRaw as Record<string, unknown>).summary as Record<string, unknown> | undefined)
      : undefined;
  const makeTop =
    makeSummary && Object.keys(makeSummary).length
      ? Object.entries(makeSummary).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
      : null;
  const nonRetryable =
    typeof makeRaw === 'object' && makeRaw !== null
      ? Number((makeRaw as Record<string, unknown>).count ?? 0) -
        Number((makeRaw as Record<string, unknown>).retryableCount ?? 0)
      : 0;
  let makeLight = '🟢';
  if (nonRetryable > 0) {
    makeLight = '🔴';
  } else if (makeTop) {
    makeLight = '🟡';
  }
  const modeLabel = state.mode === 'stop' ? 'STOP' : 'JÄTKA';
  const stage = MOBILE_WORKFLOW_STAGES[state.stageIndex] || MOBILE_WORKFLOW_STAGES[0];
  const stateTimeShort = DateTime.fromISO(state.updatedAt).toFormat('HH:mm');
  const checkNowShort = DateTime.now().toFormat('HH:mm');
  const makeTag = makeTop ? `${makeTop[0]}:${makeTop[1]}` : 'ok';

  const activityTag = state.mode === 'continue' ? 'OOTESEIS' : 'PAUS';
  return `STAATUS: A${healthOk ? '🟢' : '🔴'} B${makeLight} C${crmOk ? '🟢' : '🔴'} | MODE:${modeLabel} | ETAPP:${stage.key} | MAKE:${makeTag} | v${state.version} | olek:${stateTimeShort} | kontroll:${checkNowShort}\nSEIS: ${activityTag} (pole aktiivset taustatööd; järgmine samm käivitub ainult sinu käsul)`;
}

async function tryHandleMobileRemoteCommand(rawUserMessage: string): Promise<string | null> {
  if (isJarvisDevStatusQuestion(rawUserMessage)) {
    return buildMobileStatusReply();
  }

  const command = normalizeMobileCommand(rawUserMessage);
  if (!command) return null;

  if (command === 'status') {
    return buildMobileStatusReply();
  }
  if (command === 'rules') {
    await appendMobileRuleNote(rawUserMessage);
  }
  const prev = await readMobileRemoteState();
  const out = applyMobileCommand(prev, command);
  const persisted: MobileRemoteState = {
    ...out.next,
    lastCommand: command,
    lastApplied: out.applied,
    updatedAt: out.applied ? out.next.updatedAt : new Date().toISOString(),
  };
  await writeMobileRemoteState(persisted);
  return out.reply;
}

/** Iga /api/chat päring eraldi — muidu jääks „täna“ valeks pärast keskööd ja võrgu üleskäiku. */
function resolveClientTimeZone(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_CALENDAR_TIMEZONE;
  const trimmed = raw.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return DEFAULT_CALENDAR_TIMEZONE;
  const dt = DateTime.now().setZone(trimmed);
  return dt.isValid ? trimmed : DEFAULT_CALENDAR_TIMEZONE;
}

/**
 * Brauseri kohalik kalendripäev (getFullYear/getMonth/getDate) — sama mis kasutaja ekraanil «täna»,
 * isegi kui IANA vöönd on tühi või Luxoni «nüüd»+vöönd annaks teistsuguse kalendripäeva.
 */
function parseClientLocalCalendarYmd(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100) return null;
  const probe = DateTime.fromObject({ year: y, month: mo, day: d });
  if (!probe.isValid) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Kanooniline «täna» antud vööndis; kui brauser saatis YYYY-MM-DD, kasuta seda ankruna. */
function calendarAnchorStartOfDayInZone(zone: string, clientYmd: string | null): DateTime {
  if (clientYmd) {
    const [ys, ms, ds] = clientYmd.split('-');
    const y = Number(ys);
    const mo = Number(ms);
    const d = Number(ds);
    const dt = DateTime.fromObject({ year: y, month: mo, day: d }, { zone }).startOf('day');
    if (dt.isValid) {
      return dt;
    }
  }
  return DateTime.now().setZone(zone).startOf('day');
}

function sanitizeClientLocale(raw: unknown): string {
  if (typeof raw !== 'string') return 'et';
  const t = raw.trim();
  if (t.length < 2 || t.length > 40) return 'et';
  if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(t)) return 'et';
  return t;
}

const RU_MONTHS_GEN: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

const ET_MONTHS: Record<string, number> = {
  jaanuar: 1,
  veebruar: 2,
  märts: 3,
  aprill: 4,
  mai: 5,
  juuni: 6,
  juuli: 7,
  august: 8,
  september: 9,
  oktoober: 10,
  november: 11,
  detsember: 12,
};

const EN_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/**
 * Üritab leida ühe kindla kalendripäeva (kasutaja tekstist), et list_calendar_events ei jääks
 * upcoming_days režiimi taha (mineviku päevad jääks muidu välja).
 */
function referenceYearForImplicitDates(zone: string, clientTodayYmd: string | null): number {
  return calendarAnchorStartOfDayInZone(zone, clientTodayYmd).year;
}

function tryParseExplicitCalendarDayFromUserMessage(
  message: string,
  zone: string,
  clientTodayYmd: string | null,
): string | null {
  const raw = message.trim();
  if (raw.length < 5) {
    return null;
  }
  const isoDates = raw.match(/\b20\d{2}-\d{2}-\d{2}\b/g);
  if (isoDates && isoDates.length >= 2) {
    return null;
  }

  const isoFull = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoFull) {
    const d = DateTime.fromISO(`${isoFull[1]}-${isoFull[2]}-${isoFull[3]}`, { zone });
    return d.isValid ? d.toISODate()! : null;
  }

  const ru = raw.match(
    /\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(20\d{2}))?\b/i,
  );
  if (ru) {
    const day = parseInt(ru[1], 10);
    const mo = RU_MONTHS_GEN[ru[2].toLowerCase()];
    const year = ru[3] ? parseInt(ru[3], 10) : DateTime.now().setZone(zone).year;
    if (mo && day >= 1 && day <= 31) {
      const d = DateTime.fromObject({ year, month: mo, day }, { zone });
      return d.isValid ? d.toISODate()! : null;
    }
  }

  const et = raw.match(
    /\b(\d{1,2})\.?\s+(jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember)(?:\s+(20\d{2}))?(?:\s|$|[,.;])/i,
  );
  if (et) {
    const day = parseInt(et[1], 10);
    const mo = ET_MONTHS[et[2].toLowerCase()];
    const year = et[3] ? parseInt(et[3], 10) : referenceYearForImplicitDates(zone, clientTodayYmd);
    if (mo && day >= 1 && day <= 31) {
      const d = DateTime.fromObject({ year, month: mo, day }, { zone });
      return d.isValid ? d.toISODate()! : null;
    }
  }

  const en = raw.match(
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(20\d{2}))?\b/i,
  );
  if (en) {
    const day = parseInt(en[1], 10);
    const mo = EN_MONTHS[en[2].toLowerCase()];
    const year = en[3] ? parseInt(en[3], 10) : referenceYearForImplicitDates(zone, clientTodayYmd);
    if (mo && day >= 1 && day <= 31) {
      const d = DateTime.fromObject({ year, month: mo, day }, { zone });
      return d.isValid ? d.toISODate()! : null;
    }
  }

  const dmy = raw.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](20\d{2}))?\b/);
  if (dmy) {
    const a = parseInt(dmy[1], 10);
    const b = parseInt(dmy[2], 10);
    const y = dmy[3] ? parseInt(dmy[3], 10) : referenceYearForImplicitDates(zone, clientTodayYmd);
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = DateTime.fromObject({ year: y, month, day }, { zone });
      return d.isValid ? d.toISODate()! : null;
    }
  }

  return null;
}

/**
 * Kas sõnum küsib tänast kalendripäeva (mitte LLM-i — muidu vale number).
 * Laiad vene mustrid: sõnajärk võib olla vaba, võib olla ees „Роберт“.
 */
function messageAsksForTodaysCalendarDate(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > 500) {
    return false;
  }
  const lower = t.toLowerCase();
  // Ära võta otseteed, kui küsitakse teise suhtelise päeva kohta (mitte «täna»).
  if (/\b(вчера|завтра|позавчера|послезавтра|eile|homme|ülehomme|üleeile|yesterday|tomorrow)\b/i.test(lower)) {
    if (!/\bсегодня\b/i.test(lower) && !/\btäna\b/i.test(lower) && !/\btoday\b/i.test(lower)) {
      return false;
    }
  }
  const deNoise = lower.replace(/^[\s,]*(?:роберт|jarvis|джарвис)\b[,:]?\s*/i, '');
  const core = deNoise.length >= 4 ? deNoise : lower;

  if (
    /как(ое|ой|ая)\s+сегодня\s+(число|день|дата)/i.test(t) ||
    /как(ое|ой)\s+число\s+сегодня/i.test(t) ||
    /\bсегодня\s+(какое|какой|какая)\s+(число|день|дата)\b/i.test(lower) ||
    /что\s+за\s+число\s+сегодня/i.test(lower) ||
    /какое\s+у\s+нас\s+сегодня\s+число/i.test(lower) ||
    /которое\s+сегодня\s+число/i.test(lower) ||
    /\bсегодняшн(яя|ее)\s+(дата|число)\b/i.test(lower) ||
    /^(mis\s+)?kuupäev\s+(on\s+)?täna\b/i.test(lower) ||
    /^mis\s+on\s+tänane\s+kuupäev\b/i.test(lower) ||
    /^täna\s+on\s+mis\s+kuupäev\b/i.test(lower) ||
    /^what\s+('?s\s+)?(the\s+)?date\s*(today)?\??$/i.test(lower) ||
    /^what\s+is\s+today'?s\s+date\??$/i.test(lower) ||
    /^what\s+day\s+is\s+it(\s+today)?\??$/i.test(lower)
  ) {
    return true;
  }

  // Vene: „сегодня“ ja „число/дата/день“ küsivalt (sõnad lõdvalt lauses)
  if (
    /\bсегодня\b/.test(core) &&
    /\b(число|числа|дата|день|день\s+месяца)\b/.test(core) &&
    /\b(как|какой|какое|какая|каков|что\s+за|скажи|назови|у\s+нас|который|которое|напомни|подскажи)\b/.test(core)
  ) {
    return true;
  }

  // Lühike: „какое число“ / „какой день“ (täna kontekstis; väldib pikka juttu)
  if (t.length <= 80 && /^(?:роберт|jarvis|джарвис)?[\s,]*(какое|какой|какая)\s+(число|день|дата)\b/i.test(t)) {
    return true;
  }

  // Kalendri vaatamine + «mis kuupäev täna» (muidu läheb list_calendar_events + vale kuupäev)
  if (
    /календар|calendar|kalender/i.test(t) &&
    /\b(сегодня|täna|today)\b/i.test(lower) &&
    /\b(число|числа|дата|день|kuupäev|kuupäeva|päev)\b/i.test(lower) &&
    /\b(как|какой|какое|скажи|назови|посмотри|покажи|vaata|üt|look|tell|what)/i.test(lower)
  ) {
    return true;
  }
  if (
    /календар|calendar|kalender/i.test(t) &&
    /\b(сегодня|täna|today)\b/i.test(lower) &&
    /\b(скажи|назови|посмотри|покажи|vaata|üt|tell|say)\b/i.test(lower) &&
    /\b(число|дата|kuupäev|kuupäeva|mis\s+kuupäev|what\s+date|which\s+day)\b/i.test(lower)
  ) {
    return true;
  }

  return false;
}

function tryDirectTodaysDateQuestionReply(text: string, zone: string, clientTodayYmd: string | null): string | null {
  const t = text.trim();
  if (t.length < 4 || t.length > 500) {
    return null;
  }
  if (!messageAsksForTodaysCalendarDate(t)) {
    return null;
  }
  const day = calendarAnchorStartOfDayInZone(zone, clientTodayYmd);
  const iso = day.toISODate() ?? '';
  const dowEt = day.setLocale('et').toFormat('cccc');
  const dowRu = day.setLocale('ru').toFormat('cccc');
  const longEt = day.setLocale('et').toFormat('d. MMMM yyyy');
  const longRu = day.setLocale('ru').toFormat('d MMMM yyyy');
  const src = clientTodayYmd ? 'sinu seadme kohalik kalendripäev (brauser) + ajavöönd' : 'serveri arvutus sinu ajavööndi järgi';
  return `Täna on ${iso} (${dowEt}, ${longEt}). Allikas: ${src} (${zone}). Vene keeles: сегодня ${longRu} г. (${dowRu}). «Сегодня» tähendab just seda kuupäeva (${iso}), mitte eilset ega homset.`;
}

/**
 * Otsevastus (ilma LLM-ita): «mis kell / сколько время» — sama põhjus mis kuupäeval.
 */
function tryDirectCurrentTimeQuestionReply(text: string, zone: string): string | null {
  const t = text.trim();
  if (t.length < 4 || t.length > 400) {
    return null;
  }
  const lower = t.toLowerCase();
  const asksTime =
    /сколько\s+(сейчас|щас)\s+врем/i.test(t) ||
    /сколько\s+времени\s+(сейчас|щас)/i.test(lower) ||
    /\bкоторый\s+сейчас\s+час\b/i.test(lower) ||
    /^(какой|который)\s+час(\s+сейчас)?\??$/i.test(lower) ||
    /^mis\s+kell(\s+on)?(\s+praegu)?\??$/i.test(lower) ||
    /^mis\s+kellaa?eg\b/i.test(lower) ||
    /^mitu\s+kella\b/i.test(lower) ||
    /^what(\s+is)?\s+the\s+time\??$/i.test(lower) ||
    /^what\s+time\s+is\s+it\??$/i.test(lower);
  if (!asksTime) {
    return null;
  }
  const now = DateTime.now().setZone(zone);
  const hm = now.setLocale('et').toFormat('HH:mm');
  const hms = now.toFormat('HH:mm:ss');
  const hmRu = now.setLocale('ru').toFormat('HH:mm');
  const off = now.toFormat('ZZZZ');
  return `Praegu on kell ${hm} (${hms}, sekunditega). Sinu brauseri ajavöönd: ${zone}, nihe: ${off}. Vene keeles: сейчас ${hmRu}.`;
}

const chatCalculator = new CalculatorService();

/** Otsevastus (ilma LLM-ita): lihtne aritmeetika — vähendab OpenAI sõltuvust (nt mobiilivõrk). */
function tryDirectArithmeticReply(text: string): string | null {
  const raw = text
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '');
  if (raw.length < 1 || raw.length > 400) {
    return null;
  }

  const binary = raw.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
  if (binary) {
    try {
      return chatCalculator.evaluate(`${binary[1]}${binary[2]}${binary[3]}`).responseText;
    } catch {
      /* järgmine */
    }
  }

  const framed = raw
    .replace(/^vasta mulle\s+/iu, '')
    .replace(/^palun\s+/iu, '')
    .replace(/^mis on\s+/iu, '')
    .replace(/^arvuta\s+/iu, '')
    .replace(/^(сколько будет|сколько|посчитай)\s+/iu, '')
    .replace(/\s+on\s*[.!?]*$/iu, '')
    .trim();

  const candidates = [framed, raw].filter((v, i, a) => v && a.indexOf(v) === i);

  for (const expr of candidates) {
    try {
      return chatCalculator.evaluate(expr).responseText;
    } catch {
      /* järgmine variant */
    }
  }

  const embedded = raw.match(/(\d+(?:\s*[+\-*/]\s*\d+)+|\d+[+\-*/]+[\d+\-*/\s]*)/);
  if (embedded?.[1]) {
    try {
      return chatCalculator.evaluate(embedded[1]).responseText;
    } catch {
      return null;
    }
  }

  return null;
}

function augmentUserMessageWithDateContext(
  rawMessage: string,
  zone: string,
  clientTodayYmd: string | null,
): string {
  const m = rawMessage.trim();
  const day = calendarAnchorStartOfDayInZone(zone, clientTodayYmd);
  const todayIso = day.toISODate() ?? '';
  const clockHm = DateTime.now().setZone(zone).toFormat('HH:mm');
  const explicit = tryParseExplicitCalendarDayFromUserMessage(m, zone, clientTodayYmd);
  let extra = `\n\n[Jarvis: TÄNA (${zone}) = ${todayIso}; PRAEGUNE KELL = ${clockHm}. «Täna»/«сегодня» = ainult see kuupäev; «praegune kell» = ${clockHm} samas vööndis.`;
  if (explicit && explicit !== todayIso) {
    extra += ` Tekstis on ka päev ${explicit} — see pole automaatselt «täna».`;
  }
  extra += ' Kalendri kohta vasta pärast list_calendar_events tulemust.]';
  return `${m}${extra}`;
}

/** Kas sõnum on märgistatud arendusvooks (Cursori agent loeb sama rida agent-inboxist). */
function isAgentBridgePrefixedMessage(rawMessage: string): boolean {
  return /^\s*(AGENT|CURSOR|АГЕНТ|КУРСОР)\s*:/i.test(rawMessage.trim());
}

/**
 * LLM-ile: hoia Robert lühikesena, kui tegu on Cursori silla sõnumiga.
 */
function augmentUserMessageForAgentBridge(rawMessage: string, dateAugmentedContent: string): string {
  if (!isAgentBridgePrefixedMessage(rawMessage)) {
    return dateAugmentedContent;
  }
  return `${dateAugmentedContent}\n\n[Jarvis: ARENDUSVOOG — sama tekst logitakse Cursori agendile. Vasta Kaidole max 2 lausega, kinnita kättesaamine; ära anna pikka koodi, failiteid ega Git/terminali samm-sammult juhendit — seda teeb Cursor.]`;
}

/**
 * Kui kasutaja tekstis on suhteline päev (täna / вчера / через неделю / …), joonda sündmuse kuupäev
 * selle vööndi kalendripäevaga, säilitades mudeli antud kohalik kellaaeg.
 */
function resolveRelativeDayAnchorForSnap(
  zone: string,
  msg: string,
  clientTodayYmd: string | null,
): DateTime | null {
  const t = msg.trim();
  if (t.length < 3) {
    return null;
  }
  const base = () => calendarAnchorStartOfDayInZone(zone, clientTodayYmd);
  if (/\b(через\s+месяц|kuu\s+pärast|a month from now|in a month)\b/i.test(t)) {
    return base().plus({ months: 1 });
  }
  if (
    /\b(через\s+неделю|через\s+7\s+дн(?:ей|я)?|nädala\s+pärast|nädal\s+pärast|in a week|in 7 days)\b/i.test(t)
  ) {
    return base().plus({ days: 7 });
  }
  if (/\b(сегодня|täna|today)\b/i.test(t)) {
    return base();
  }
  if (/\b(вчера|eile|yesterday)\b/i.test(t)) {
    return base().minus({ days: 1 });
  }
  if (/\b(завтра|homme|tomorrow)\b/i.test(t)) {
    return base().plus({ days: 1 });
  }
  if (/\bпослезавтра\b/i.test(t) || /\bülehomme\b/i.test(t)) {
    return base().plus({ days: 2 });
  }
  if (/\bпозавчера\b/i.test(t) || /\büleeile\b/i.test(t)) {
    return base().minus({ days: 2 });
  }
  return null;
}

function snapCreateEventTimesToRelativeDayInZone(
  userMessage: string,
  zone: string,
  startRaw: string,
  endRaw: string,
  clientTodayYmd: string | null,
): { start: string; end: string } {
  const msg = userMessage.trim();
  if (msg.length < 3) {
    return { start: startRaw, end: endRaw };
  }

  const dayRef = resolveRelativeDayAnchorForSnap(zone, msg, clientTodayYmd);
  if (!dayRef) {
    return { start: startRaw, end: endRaw };
  }

  const startDt = DateTime.fromISO(startRaw, { setZone: true });
  const endDt = DateTime.fromISO(endRaw, { setZone: true });
  if (!startDt.isValid || !endDt.isValid) {
    return { start: startRaw, end: endRaw };
  }

  const startLocal = startDt.setZone(zone);
  const endLocal = endDt.setZone(zone);

  const newStart = dayRef.set({
    hour: startLocal.hour,
    minute: startLocal.minute,
    second: 0,
    millisecond: 0,
  });

  const durationMin = endLocal.diff(startLocal, 'minutes').minutes;
  const safeDuration = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 60;
  const newEnd = newStart.plus({ minutes: safeDuration });

  const newStartIso = newStart.toISO();
  const newEndIso = newEnd.toISO();
  if (!newStartIso || !newEndIso) {
    return { start: startRaw, end: endRaw };
  }

  if (newStartIso !== startRaw || newEndIso !== endRaw) {
    logger.info(
      { zone, anchorDay: dayRef.toISODate(), before: [startRaw, endRaw], after: [newStartIso, newEndIso] },
      'chat: snapped create_calendar_event to relative day',
    );
  }

  return { start: newStartIso, end: newEndIso };
}

function buildRobertSystemPrompt(
  activeZone: string,
  clientLocaleRaw: string,
  clientTodayYmd: string | null,
): string {
  const homeZone = DEFAULT_CALENDAR_TIMEZONE;
  const dayAnchor = calendarAnchorStartOfDayInZone(activeZone, clientTodayYmd);
  const clockNow = DateTime.now().setZone(activeZone);
  const iso = dayAnchor.toISODate() ?? '';
  const yesterdayIso = dayAnchor.minus({ days: 1 }).toISODate() ?? '';
  const tomorrowIso = dayAnchor.plus({ days: 1 }).toISODate() ?? '';
  const plus2Iso = dayAnchor.plus({ days: 2 }).toISODate() ?? '';
  const minus2Iso = dayAnchor.minus({ days: 2 }).toISODate() ?? '';
  const loc = sanitizeClientLocale(clientLocaleRaw);
  const weekdayHuman = dayAnchor.setLocale(loc).toFormat('cccc');
  const longHuman = dayAnchor.setLocale(loc).toFormat('d. MMMM yyyy');
  const wkY = dayAnchor.weekYear;
  const wkN = dayAnchor.weekNumber;
  const isoWeekMon = DateTime.fromISO(`${wkY}-W${String(wkN).padStart(2, '0')}-1`, { zone: activeZone });
  const isoWeekSun = isoWeekMon.isValid ? isoWeekMon.plus({ days: 6 }) : null;
  const nextWeekMon = isoWeekMon.isValid ? isoWeekMon.plus({ weeks: 1 }) : null;
  const nextWeekSun = nextWeekMon ? nextWeekMon.plus({ days: 6 }) : null;
  const isoRangeThis =
    isoWeekMon.isValid && isoWeekSun
      ? `${isoWeekMon.toISODate()} … ${isoWeekSun.toISODate()}`
      : '(ei saanud arvutada)';
  const isoRangeNext =
    nextWeekMon && nextWeekSun
      ? `${nextWeekMon.toISODate()} … ${nextWeekSun.toISODate()}`
      : '(ei saanud arvutada)';
  const clockHms = clockNow.toFormat('HH:mm:ss');
  const clockHm = clockNow.toFormat('HH:mm');

  return `Sa oled Robert — Kaido isiklik tehisintellekt-assistent. Sa oled tark, sõbralik ja konkreetne.

REEGLID:
- Vasta alati eesti keeles (va kui Kaido ise räägib teises keeles)
- TÄNASE KUUPÄEVA KÕVA REEGEL: kui kasutaja küsib tänast kuupäeva, «mis kuupäev», «какое число сегодня», käsib kalendrit vaadata et öelda mis kuupäev või mis kuupäev on täna — vasta **ainult** allpool oleva KANONILISE TÄNASE (${iso}) järgi; **ära** mõtle kuupäeva välja ega võta seda Google Calendari sündmuste loendist (sündmused ei määra kalendrilehe «täna» numbrit). Kui sama küsimuses palutakse ka sündmusi, ütle esmalt kuupäev kanooniliselt, siis vajadusel listi sündmused.
- Ole lühike ja konkreetne — mitte rohkem kui 2-3 lauset vastuses
- KALENDRI KÕVA REEGEL: ära kunagi väida, et sündmus on kalendrisse lisatud, uuendatud või kustutatud, kui sa EI kutsunud SELLES vastuses vastavat tööriista ning tööriista tekst ei kinnitanud õnnestumist (nt create_calendar_event → peab sisaldada "Lisatud id="; kui tööriista väljund algab "Viga:" või sisaldab "Viga", siis ütle lühidalt veast, ära väida edukust). Kasutaja võib sõnastada vene või muus keeles — tõlgenda kuupäev ja kellaaeg kasutaja aktiivse ajavööndi (${activeZone}) järgi ning anna tööriistale õiged ISO väärtused (offset peab vastama tõlgendatud kohalikule ajale).
- Kui saad käsu täita (kalender, meeldetuletus) — täida kohe tööriistadega; ära väljamõeldis, et midagi kustutatud oleks, kui tööriista ei kutsunud
- Masskustutuseks (nt "kõik 17. kuupäeva sündmused") kasuta delete_calendar_events koos dates massiiviga
- Enne uue sündmuse lisamist, kui kasutaja kardab kattumist, võid kasutada check_calendar_conflicts
- Kui vajad täpsustust — küsi ühe konkreetse küsimusega
- Ole sõbralik nagu hea kolleeg

CURSORI AGENDI SILD (telefon ↔ Mac):
- See vestlus on ka **sidekanal**: Kaido sõnumid logitakse arendusjaoks (agent-inbox / logifail), et **Cursori AI agent** samas Macis saaks neid lugeda ja vastata.
- Kui Kaido tahab **otse arendajale** suunata küsimuse või juhise, kirjutagu rea alguses **AGENT:** või **CURSOR:** — vene keeles sobivad **АГЕНТ:** või **КУРСОР:**. See eristab arendusvoogu kalendrist ja igapäevanõustamisest.
- Selle eesliitega sõnumitel: vasta **ühise või kahe lausega**, kinnita kättesaamine; **ära** asenda Cursorit pika koodi, arhitektuuri või terminalikäskudega. Kui midagi on ebamäärane, ütle et Cursor täpsustab Macis.
- Kui Cursori agent saadab Kaidole vastuse tagasi, ilmub see tavaliselt **sama Roberti vestluses** assistendina — see on arendusvastus; võid seda lühidalt kokku võtta ainult kui Kaido palub.
- Kui Kaido küsib „kuidas teiega tööd teha“ või „kuidas sild töötab“, selgita lühidalt: **telefon** = see chat; **AGENT:** = sõnum Maci agendile; **STAATUS / JDEV** = Jarvisi projektifaas (mitte kalender); kalender = tavaline lause ilma nende arenduseesliiteta.

VABAFORMI TEKST (oluline):
- Kasutaja võib kirjutada vabalt — vene või eesti keeles, pikalt või lühidalt, sõnajärk võib olla vaba (mitte ainult "õiges" järjekorras). Püüa mõista kogu mõtet: mida tahetakse teha või teada, mitte ainult üksikuid sõnu eraldi.
- Kirjavigu, katkendlikku lauset, segast sõnajärku või keelesegu tõlgi mõtte tasemel: kui sisu on arusaadav, ära keelduta vormivea pärast; kui mõni sõna on ilmselt vale (nt sarnane häälik), vali loogiline tähendus konteksti järgi.
- Tee lühikeid loogilisi järeldusi: mis on põhiküsimus või põhiülesanne, mis on taust; kui osad laused tunduvad vastuolus, eelda üht terviklikku kavatsust ja vajadusel küsi ühe lausega, milline tõlgendus kehtib — ära jäta vastamata selget küsimust ainult selle tõttu, et mujal oli segadust.
- Kui küsitakse midagi konkreetset, vasta esmalt otseselt sellele küsimusele; kui antakse ülesanne (kalender, meeldetuletus), täida see vastavalt mõistetud eesmärgile tööriistadega — mitte ainult esimese ebamäärase sõna järgi.
- Kui lauset saab loogiliselt tervikuna tõlgendada, tee seda; kui mõni kriitiline detail jääb tõesti lahtiseks (milline kuupäev või kellaaeg, kas kustutada või lisada, millise sündmuse kohta jutt), ära tee oletusega ohtlikku või pöördumatut sammu — küsi ÜKS lühike, konkreetne täpsustav küsimus (eesti keeles).
- Kui kasutaja vastab täpsustusele, võta see arvesse ja jätka; kui ikka ebamäärane, küsi uuesti teise sõnastusega (mitte täpselt sama lause kordamisena). Kui pärast kuni kahte täpsustusringi käsk on endiselt väga udune, võid lühidalt öelda, mida sa praegu mõistad, ja paluda kinnitust enne toimingut.

KINNITUSE EKRAAN (ohtlik vs lihtne):
- OHTLIK (masskustutus, terve päeva/ mitme päeva tühjaks, "kõik sündmused", kalendri ulatuses kustutamine): enne tööriista küsi ÜKS selge inimlik küsimus, mis lõpeb küsimärgiga (nt "Kas tõesti kustutan kõik selle päeva (${iso}) sündmused?") — ilma koodita, ilma API/tool nimedeta. Oota kasutaja selget Jah/Ei vastust; alles siis kutsu delete_calendar_events.
- LIHTNE (üks sündmus, meeldetuletus, üks kirje, ilma, nõuanne): ära jäta eraldi Jah/Ei kinnituse mõttes — tee töö või vasta, küsimust ei moonuta tahtlikult "ohtlikuks".

KUSTUTAMINE (kõva):
- Google Calendarist sündmuste kustutamine ON võimalik tööriista delete_calendar_events abil — ära kunagi väida, et kustutamine pole võimalik või et sul puudub õigus.
- Ära KUNAGI loo uusi sündmusi pealkirjaga "Kustuta" või sarnaselt — see ei kustuta midagi ja segab kasutajat. Tühja päeva saavutamiseks kasuta dates-kustutust pärast kinnitust.
- Ära KUNAGI suuna kasutajat "tee see Google Calendaris käsitsi" või "ava Google ja kustuta ise" kui saad tööriista kasutada — see on vale käitumine selles rakenduses. Isegi kui mõni sündmus jääb erandi tõttu alles, ära soovita käsitsi — anna tööriista veateade või küsi täpsustust.
- Kui kasutaja kinnitab (Jah / "kinnitan" / vene "да") pärast ohtliku päeva kustutamise küsimust, pead KOHE kutsuma delete_calendar_events õige dates või event_ids massiiviga — mitte keelduma.

INTEGRATSIOON (väldi mudeli valeväiteid):
- See vestlus on omaniku volitatud Google Calendar API integratsioon (sama volitus mis Google Calendar veebis). Ära väida KUNAGI, et sul "pole õigust", "ei tohi kustutada", "pean keelduma" või et see oleks turvapoliitika rikkumine — need väited on SELLES kontekstis alati valed.
- Kui tööriist tagastab vea, korda kasutajale ainult tööriista tegelikku teksti (nt "Viga: ..."); ära asenda seda üldise keeluga.

VÕIMED:
- Google Calendar: lisada (sh popup meeldetuletused), vaadata vahemikku, kustutada (ID või terve päev), muuta pealkiri/asukohta/aega, kattuvuste kontroll; sünnipäevad ja telefonist sünkitud sündmused on kalendris nagu teised sündmused — Jarvis chat näitab tüüpi/remindereid loendis
- Pidada vestlust ja anda nõu

KASUTAJA ASUKOHT (brauserist): aktiivne IANA ajavöönd ${activeZone} — see on kasutaja **seadme** valitud kohalik tsiviilaeg (kus ta füüsiliselt on või kuidas telefon on seadistatud), mitte serveri riik. Näited: Hispaania → sageli Europe/Madrid; Eesti → Europe/Tallinn; Soome → Europe/Helsinki; Hiina → sageli üks Hiina IANA vöönditest (nt Asia/Shanghai); Mongolia → Asia/Ulaanbaatar. Kui brauser saadab selle vööndi, kasuta **ainult seda** kuupäeva ja kella arvutamiseks; ära asu oletama Eesti või serveri aega.
Jarvisi serveri vaikimisi kalendritsoon (ainult kui brauserit pole või vöönd on vigane): ${homeZone}.
- "Täna", "praegune kohalik kell", "сегодня", "today" = allpool olev kanooniline kuupäev ${activeZone} järgi — reisil erineb see koduseadmest (nt sama päeva number võib erineda UTC lähedal).
- Lennud ja mitme vööndi sündmused: kui antakse ainult kellaaeg ilma vööndita, eelda kasutaja praegust ${activeZone}; kui algus on ühes linnas ja lõpp teises või on mitu aegade kihti, tee selgeks või küsi puuduvaid kellaaegu koos vööndi või anna ISO aegu koos offsetiga.

AJAVÖÖND (kalendri tõlgendused): kasutaja aktiivne vöönd ${activeZone}. YYYY-MM-DD loetakse selle vööndi kalendripäevaks.

KANONILINE TÄNANE KUUPÄEV (${activeZone}): ${iso} (${weekdayHuman}, ${longHuman}). Kõik väljendid "täna", "сегодня", "today" tähendavad just seda kuupäeva (${iso}). Uue sündmuse ISO algus/lõpp ehita selle kuupäeva ja kasutaja öeldud kellaaja peale ${activeZone} offsetiga, kui kasutaja ei nõua teist konkreetset kuupäeva; ära vali kuupäeva ainult nädalapäeva sõnast ilma selle ISO reaga sidumata.

PRAEGUNE KOHalik KELL (${activeZone}): ${clockHms} (${clockHm}). Kui kasutaja küsib "mis kell on" / "сколько время", kasuta just neid väärtusi — ära mõtle kellaaega välja.

ISO NÄDALAD (${activeZone}, ISO 8601): praegune nädal on ${wkY}-W${String(wkN).padStart(2, '0')} — esmaspäevist pühapäevani ${isoRangeThis}. "Järgmine nädal" / "следующая неделя" ≈ ${isoRangeNext}. Kui kasutaja viitab "16. nädalale", "17-й неделе", "selle nädala kõigile päevadele" või tühjendab terve nädala, tõlgenda ISO nädala järgi (sama loogika mis Google / eurokalender): list_calendar_events date_range või delete_calendar_events dates peab katma selle nädala kõik päevad korraga (esmaspäev–pühapäev); kui aasta pole öeldud, kasuta ${wkY} või küsi ühe lühikese küsimusega.

KALENDRI LOETLEMINE: Kui kasutaja küsib ühe kindla päeva sündmusi (nt "17 апреля", "17. aprillil", "mis on 3. mail", "eilne päev"), kasuta list_calendar_events **date_range** — date_from ja date_to on sama YYYY-MM-DD (aasta: kui kasutaja ei öelnud, võta praegune kalendriaasta ${activeZone} järgi). Üksiku päeva jaoks **ära** kasuta upcoming_days — see on ebasobiv. upcoming_days režiimil alustab server brauseri saadetud tänase kalendripäeva keskööst (kui brauser saatis selle), et tänased hommikused sündmused ei kaoks; kui ikkagi kahtled, kasuta date_range konkreetse päeva kohta. Ära väljamõeldis teisi kuupäevi kui tööriista väljund seda ei näita.

SUHTELISED KUUPÄEVAD (sama vöönd ${activeZone}): "вчера" / eile = ${yesterdayIso}; "завтра" / homme = ${tomorrowIso}; "послезавтра" = ${plus2Iso}; "позавчера" = ${minus2Iso}; "через неделю" / "nädala pärast" ≈ +7 kalendripäeva; "через месяц" / "kuu pärast" ≈ +1 kuu samale kuupäevale. Kui kasutaja ütleb "сегодня" või "täna", kasuta kuupäeva ${iso} — mitte ${yesterdayIso}. Kui ta ütleb ainult nädalapäeva (nt laupäev), võrdle seda kanoonilise ${iso} nädalapäevaga; kui tekib lahknevus, usalda ISO kuupäeva (${iso}) ja kellaaja kombinatsiooni, mitte ainult nädalapäeva sõna oletust teisest nädalast.`;
}

function formatCalendarEventsForTool(events: CalendarEventItem[]): string {
  if (!events.length) {
    return 'Sündmusi ei leitud.';
  }
  return events
    .map((e) => {
      const loc = e.location ? ` | ${e.location}` : '';
      const typ = e.eventType ? ` | tüüp=${e.eventType}` : '';
      const rem =
        e.reminderPopupOffsets && e.reminderPopupOffsets.length
          ? ` | popup=minutit enne: ${e.reminderPopupOffsets.join(',')}`
          : ' | popup=minutit enne: (puudub või ainult vaikimisi meil)';
      return `• id=${e.id} | ${e.summary} | ${e.start} → ${e.end}${loc}${typ}${rem}`;
    })
    .join('\n');
}

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description:
        'Lisa sündmus Google Calendari (primary). KOHUSTUSLIK iga kord, kui kasutaja soovib päriselt uut sündmust (sh häälsisestus). Ilma selle tööriistata ära väida, et sündmus on lisatud. Pärast positiivset vastust (Lisatud id=) võid kinnitada lühidalt.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Pealkiri' },
          start: {
            type: 'string',
            description:
              'Algus ISO 8601 (offset vastab kasutaja aktiivsele ajavööndile). Kui sõnumis on täna/сегодня, через неделю, через месяц jms, server joondab kuupäeva — anna siiski mõistlik ISO (kellaaeg kasutaja öeldud).',
          },
          end: {
            type: 'string',
            description: 'Lõpp ISO 8601 (sama kuupäev kui algus, kui pole mitmepäevast sündmust)',
          },
          location: { type: 'string', description: 'Asukoht (valikuline)' },
          description: { type: 'string', description: 'Kirjeldus (valikuline)' },
          reminder_popup_minutes: {
            type: 'array',
            items: { type: 'number' },
            description: 'Google popup meeldetuletused minutites enne algust, nt [10, 60]; valikuline',
          },
        },
        required: ['title', 'start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_calendar_events',
      description:
        'Loetle Google Calendari sündmusi. Kui kasutaja nimetab KONKREETSET kuupäeva (nt "17 апреля", "17. aprill"), kasuta ALATI mode=date_range ja date_from=date_to=sama YYYY-MM-DD (aastaga). upcoming_days: server alustab brauseri tänase kalendripäeva keskööst (kui saadetud), et tänased sündmused ei jääks vahele; ikkagi kasuta date_range ühe kindla päeva küsimuse jaoks. upcoming_days ei asenda date_range mineviku päeva (nt eile) jaoks.',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['upcoming_days', 'date_range'],
            description:
              'date_range = kindlad kalendripäevad (sobib konkreetsele päevale / vahemikule); upcoming_days = järgmised N kalendripäeva (algus: brauseri tänane päev keskööst kui saadaval, muidu alates hetkest)',
          },
          upcoming_days: { type: 'number', description: 'Mitu päeva ette (nt 7), kui mode=upcoming_days' },
          date_from: { type: 'string', description: 'Alguskuupäev YYYY-MM-DD, kui mode=date_range' },
          date_to: { type: 'string', description: 'Lõppkuupäev YYYY-MM-DD, kui mode=date_range' },
        },
        required: ['mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_calendar_events',
      description:
        'Kustuta Google Calendarist sündmusi — omaniku volitatud API, sul ON lubatud. Kasuta event_ids VÕI dates (terve päev tühjaks YYYY-MM-DD koos aastaga, nt 2026-04-19). Kustutatakse kõik, mis sellel päeval kattub. Ära keela kustutamist ega soovita käsitsi Google\'is; kui kustutamine ebaõnnestub, tagasta tööriista veateade. Enne väidet „päev on tühi“ võid kasutada list_calendar_events date_range.',
      parameters: {
        type: 'object',
        properties: {
          event_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Google Calendar event id-d',
          },
          dates: {
            type: 'array',
            items: { type: 'string' },
            description: 'Kuupäevad YYYY-MM-DD — kustutatakse KÕIK sündmused neil päevadel',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_calendar_event',
      description:
        'Muuda olemasolevat sündmust (primary). Anna event_id (list_calendar_events väljundist). Võid muuta pealkirja, asukohta, algust ja lõppu korraga.',
      parameters: {
        type: 'object',
        properties: {
          event_id: { type: 'string', description: 'Google Calendar event id' },
          title: { type: 'string' },
          location: { type: 'string' },
          start: { type: 'string', description: 'Uus algus ISO; kui annad, peab ka end tulema' },
          end: { type: 'string', description: 'Uus lõpp ISO' },
        },
        required: ['event_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_calendar_conflicts',
      description: 'Kontrolli, kas antud ajavahemikus on juba sündmusi (kattuvus). Enne lisamist / ümberpaigutust.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Algus ISO 8601' },
          end: { type: 'string', description: 'Lõpp ISO 8601' },
        },
        required: ['start', 'end'],
      },
    },
  },
];

type RunToolContext = {
  calendarTimeZone: string;
  userMessage: string;
  clientLocalTodayYmd: string | null;
};

async function runTool(name: string, args: Record<string, unknown>, ctx: RunToolContext): Promise<string> {
  const tz = ctx.calendarTimeZone;
  if (name === 'create_calendar_event') {
    try {
      const rawRem = args.reminder_popup_minutes;
      const reminderPopupMinutes = Array.isArray(rawRem)
        ? rawRem.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 40320)
        : undefined;

      const startRaw = args.start as string;
      const endRaw = args.end as string;
      const snapped = snapCreateEventTimesToRelativeDayInZone(
        ctx.userMessage,
        tz,
        startRaw,
        endRaw,
        ctx.clientLocalTodayYmd,
      );

      const result = await createCalendarEvent({
        title: args.title as string,
        start: snapped.start,
        end: snapped.end,
        description: typeof args.description === 'string' ? args.description : undefined,
        location: typeof args.location === 'string' ? args.location : undefined,
        ...(reminderPopupMinutes?.length ? { reminderPopupMinutes } : {}),
      });
      void sendTelegramMessage(`✅ Kalendrisse lisatud:\n<b>${args.title}</b>\n🕐 ${snapped.start}`);
      return `Lisatud id=${result.id}.`;
    } catch (err) {
      logger.error({ err }, 'chat: create_calendar_event failed');
      return `Viga: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  if (name === 'list_calendar_events') {
    try {
      const explicitFromUser = tryParseExplicitCalendarDayFromUserMessage(
        ctx.userMessage,
        tz,
        ctx.clientLocalTodayYmd,
      );
      if (explicitFromUser) {
        const events = await listEventsOverlappingLocalInclusiveRange(
          explicitFromUser,
          explicitFromUser,
          tz,
        );
        logger.info(
          { explicitFromUser, overridesModel: true },
          'chat: list_calendar_events single day from user text',
        );
        return formatCalendarEventsForTool(events);
      }

      const mode = (args.mode as string) || 'upcoming_days';
      if (mode === 'date_range') {
        const from = String(args.date_from ?? '').trim();
        const to = String(args.date_to ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          return 'Viga: date_from ja date_to peavad olema YYYY-MM-DD (koos aastaga).';
        }
        const events = await listEventsOverlappingLocalInclusiveRange(from, to, tz);
        return formatCalendarEventsForTool(events);
      }
      const days = Math.min(120, Math.max(1, Number(args.upcoming_days) || 7));
      const events = await listUpcomingEventsWithinDays(days, 100, tz, ctx.clientLocalTodayYmd);
      return formatCalendarEventsForTool(events);
    } catch (err) {
      logger.error({ err }, 'chat: list_calendar_events failed');
      return `Viga kalendri lugemisel: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  if (name === 'delete_calendar_events') {
    try {
      const ids = args.event_ids as string[] | undefined;
      const dates = args.dates as string[] | undefined;

      if (dates?.length) {
        const clean = dates.map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
        if (!clean.length) {
          return 'Viga: dates peavad olema YYYY-MM-DD.';
        }
        const r = await deleteAllEventsOnCalendarDates(clean, tz);
        const note = r.notes.length ? ` Märkus: ${r.notes.join(' ')}` : '';
        return `Kustutatud ${r.deleted} sündmust.${note}`;
      }

      if (ids?.length) {
        let n = 0;
        for (const id of ids.slice(0, 40)) {
          if (!id?.trim()) continue;
          await deleteCalendarEventById(id.trim());
          n += 1;
        }
        return `Kustutatud ${n} sündmust ID järgi.`;
      }

      return 'Puudu event_ids või dates.';
    } catch (err) {
      logger.error({ err }, 'chat: delete_calendar_events failed');
      return `Viga kustutamisel: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  if (name === 'update_calendar_event') {
    try {
      const eventId = String(args.event_id ?? '').trim();
      if (!eventId) {
        return 'Puudu event_id.';
      }
      const patch: {
        title?: string;
        location?: string;
        start?: string;
        end?: string;
      } = {};
      if (typeof args.title === 'string') {
        patch.title = args.title;
      }
      if (typeof args.location === 'string') {
        patch.location = args.location;
      }
      if (typeof args.start === 'string' && typeof args.end === 'string') {
        patch.start = args.start;
        patch.end = args.end;
      } else if (typeof args.start === 'string' || typeof args.end === 'string') {
        return 'Kui muudad aega, anna nii start kui end korraga.';
      }

      if (!patch.title && !patch.location && !patch.start) {
        return 'Puudu muudatus (title, location või start+end).';
      }

      const updated = await patchCalendarEventById(eventId, patch);
      return `Uuendatud: ${updated.summary} | ${updated.start} → ${updated.end}`;
    } catch (err) {
      logger.error({ err }, 'chat: update_calendar_event failed');
      return `Viga uuendamisel: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  if (name === 'check_calendar_conflicts') {
    try {
      const start = String(args.start ?? '').trim();
      const end = String(args.end ?? '').trim();
      const overlaps = await listEventsOverlappingRange(start, end);
      if (!overlaps.length) {
        return 'Selles ajavahemikus pole teisi sündmusi (või ei leitud kattuvusi).';
      }
      return `Kattuvad / samas vahemikus olevad sündmused:\n${formatCalendarEventsForTool(overlaps)}`;
    } catch (err) {
      logger.error({ err }, 'chat: check_calendar_conflicts failed');
      return `Viga: ${err instanceof Error ? err.message : 'teadmata'}`;
    }
  }

  return 'Tundmatu tööriist';
}

function chatFailureMessageForClient(err: unknown): string {
  if (err instanceof RateLimitError) {
    return 'Liiga palju päringuid — oota hetke ja proovi uuesti.';
  }
  if (err instanceof APIConnectionTimeoutError) {
    return 'Ühendus AI-teenusesse venis — proovi uuesti (võrk võib olla nõrk).';
  }
  if (err instanceof APIError) {
    if (err.status === 401 || err.status === 403) {
      return 'Teenuse autentimise viga serveris (OpenAI võti).';
    }
    if (err.status === 429) {
      return 'Liiga palju päringuid — oota hetke ja proovi uuesti.';
    }
    if (err.status === 503 || (typeof err.status === 'number' && err.status >= 500)) {
      return 'AI-teenus on ajutiselt ülekoormatud — proovi uuesti.';
    }
  }
  if (err instanceof Error && /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket|network/i.test(err.message)) {
    return 'Serveri ühendus AI-teenusega katkes — proovi uuesti.';
  }
  return 'Viga AI vastuses — proovi uuesti.';
}

function fallbackReplyWithoutLlm(rawUserMessage: string): string {
  const t = rawUserMessage.trim();
  if (!t) {
    return 'Sain sõnumi kätte. Korda palun lühidalt.';
  }
  if (t.length <= 80) {
    return `Sain kätte: "${t}". AI-ühendus on hetkel kõikuv; kanal töötab ja jätkan kohe, kui ühendus taastub.`;
  }
  return 'Sain sõnumi kätte. AI-ühendus on hetkel kõikuv; kanal töötab ja jätkan kohe, kui ühendus taastub.';
}

export async function handleChat(req: Request, res: Response) {
  const { message, history = [], clientTimeZone, clientLocale, clientLocalCalendarDate } = req.body as {
    message: string;
    history: OpenAI.Chat.ChatCompletionMessageParam[];
    clientTimeZone?: string;
    clientLocale?: string;
    /** Brauseri kohalik YYYY-MM-DD (getFullYear/getMonth/getDate) — kanooniline «täna». */
    clientLocalCalendarDate?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: 'message puudub' });
    return;
  }

  const activeZone = resolveClientTimeZone(clientTimeZone);
  const clientTodayYmd = parseClientLocalCalendarYmd(clientLocalCalendarDate);
  const rawUserMessage = message.trim();
  void appendAgentInboxEntry({ source: 'chat', text: rawUserMessage });
  void appendChatChannelMessage({ from: 'user', text: rawUserMessage });

  const directArithmeticFirst = tryDirectArithmeticReply(rawUserMessage);
  if (directArithmeticFirst) {
    res.json({ reply: directArithmeticFirst });
    return;
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const m = 'OpenAI API võti puudub serveris.';
    res.status(503).json({ error: m, message: m });
    return;
  }

  const openai = new OpenAI({
    apiKey,
    timeout: 120_000,
    maxRetries: 2,
  });

  if (clientTodayYmd) {
    const serverDay = DateTime.now().setZone(activeZone).toISODate();
    if (serverDay && serverDay !== clientTodayYmd) {
      logger.info(
        { activeZone, clientTodayYmd, serverDay },
        'chat: client local calendar date differs from server-computed day in zone (using client for today)',
      );
    }
  }

  const directTime = tryDirectCurrentTimeQuestionReply(rawUserMessage, activeZone);
  if (directTime) {
    res.json({ reply: directTime });
    return;
  }

  const directDate = tryDirectTodaysDateQuestionReply(rawUserMessage, activeZone, clientTodayYmd);
  if (directDate) {
    if (!clientTodayYmd) {
      logger.warn(
        { activeZone, hasBodyField: clientLocalCalendarDate !== undefined },
        'chat: kuupäeva otsevastus ilma brauseri clientLocalCalendarDate — tõenäoliselt vana chat.html või päring ilma väljata',
      );
    }
    res.json({ reply: directDate });
    return;
  }

  const mobileCommandReply = await tryHandleMobileRemoteCommand(rawUserMessage);
  if (mobileCommandReply) {
    res.json({ reply: mobileCommandReply });
    return;
  }

  const dateAugmented = augmentUserMessageWithDateContext(rawUserMessage, activeZone, clientTodayYmd);
  const userContentForLlm = augmentUserMessageForAgentBridge(rawUserMessage, dateAugmented);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildRobertSystemPrompt(activeZone, clientLocale ?? '', clientTodayYmd) },
    ...history.slice(-10),
    { role: 'user', content: userContentForLlm },
  ];

  try {
    let response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
    });

    let assistantMessage = response.choices[0]?.message;
    if (!assistantMessage) {
      throw new Error('OpenAI ei tagastanud vastust (tühi choices).');
    }

    while (assistantMessage.tool_calls?.length) {
      messages.push(assistantMessage);

      for (const call of assistantMessage.tool_calls) {
        if (call.type !== 'function') continue;
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(call.function.arguments ?? '{}') as Record<string, unknown>;
        } catch {
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: 'Viga: tööriista argumendid pole kehtiv JSON.',
          });
          continue;
        }
        const result = await runTool(call.function.name, args, {
          calendarTimeZone: activeZone,
          userMessage: rawUserMessage,
          clientLocalTodayYmd: clientTodayYmd,
        });
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }

      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto',
      });

      assistantMessage = response.choices[0]?.message;
      if (!assistantMessage) {
        throw new Error('OpenAI ei tagastanud vastust pärast tööriista (tühi choices).');
      }
    }

    res.json({ reply: assistantMessage.content ?? '' });
  } catch (err) {
    logger.error({ err }, 'chat: OpenAI error');
    const fallback = fallbackReplyWithoutLlm(rawUserMessage);
    res.status(200).json({ reply: fallback, degraded: true, error: chatFailureMessageForClient(err) });
  }
}
