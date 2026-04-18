import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { env } from '../../config/index.js';
import { logger } from '../logger/logger.js';
import type { DatabaseProvider, PreparedStatement, SqliteValue } from './types.js';

export class SqliteProvider implements DatabaseProvider {
  private database?: Database.Database;

  initialize() {
    if (this.database) {
      return;
    }

    const fullPath = path.resolve(env.DB_PATH);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    this.database = new Database(fullPath);
    this.database.pragma('journal_mode = WAL');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS system_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS calendar_alarm_state (
        fire_key TEXT PRIMARY KEY,
        dismissed_at TEXT,
        snooze_until TEXT
      );
    `);

    logger.info({ dbPath: fullPath }, 'SQLite initialized');
  }

  prepare<TParams extends Record<string, SqliteValue>, TResult>(
    sql: string,
  ): PreparedStatement<TParams, TResult> {
    if (!this.database) {
      throw new Error('Database is not initialized');
    }

    const statement = this.database.prepare(sql);

    return {
      all: (params?: TParams) =>
        (params === undefined ? statement.all() : statement.all(params)) as TResult[],
      get: (params?: TParams) =>
        (params === undefined ? statement.get() : statement.get(params)) as TResult | undefined,
      run: (params?: TParams) => {
        const result = params === undefined ? statement.run() : statement.run(params);

        return {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid,
        };
      },
    };
  }
}
