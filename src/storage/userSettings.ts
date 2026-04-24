import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../shared/logger/logger.js';

const SETTINGS_PATH = path.resolve(process.cwd(), 'data/user-settings.json');

export type TelegramUserSettings = {
  audio: boolean;
};

type SettingsFileShape = Record<string, { audio?: boolean }>;

const defaultSettings = (): TelegramUserSettings => ({ audio: false });

let lock: Promise<void> = Promise.resolve();

function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lock.then(fn, fn);
  lock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function normalizeUserKey(userId: number): string {
  return String(userId);
}

async function ensureDataDir(): Promise<void> {
  const dir = path.dirname(SETTINGS_PATH);
  await fs.mkdir(dir, { recursive: true });
}

async function readRaw(): Promise<SettingsFileShape> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SettingsFileShape;
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      logger.warn({ err }, 'userSettings: read failed');
    }
  }
  return {};
}

async function writeRaw(data: SettingsFileShape): Promise<void> {
  await ensureDataDir();
  const tmp = `${SETTINGS_PATH}.${process.pid}.tmp`;
  const json = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tmp, json, 'utf8');
  await fs.rename(tmp, SETTINGS_PATH);
}

export function getUserSetting(userId: number): TelegramUserSettings {
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as SettingsFileShape;
    const row = parsed[normalizeUserKey(userId)];
    return { audio: row?.audio === true };
  } catch {
    return defaultSettings();
  }
}

export async function setUserSetting(userId: number, next: TelegramUserSettings): Promise<void> {
  const key = normalizeUserKey(userId);
  try {
    await withFileLock(async () => {
      const all = await readRaw();
      all[key] = { audio: next.audio === true };
      await writeRaw(all);
    });
  } catch (err) {
    logger.warn({ err }, 'userSettings: setUserSetting failed');
  }
}

export async function toggleUserAudio(userId: number): Promise<TelegramUserSettings> {
  const key = normalizeUserKey(userId);
  try {
    return await withFileLock(async () => {
      const all = await readRaw();
      const cur = all[key]?.audio === true;
      const next: TelegramUserSettings = { audio: !cur };
      all[key] = { audio: next.audio };
      await writeRaw(all);
      return next;
    });
  } catch (err) {
    logger.warn({ err }, 'userSettings: toggleUserAudio failed');
    return defaultSettings();
  }
}
