import type { DatabaseProvider } from '../shared/database/index.js';
import { AppError } from '../shared/errors/app-error.js';
import type { CreateReminderInput, Reminder } from './reminders.types.js';

interface ReminderRow {
  id: number;
  title: string;
  notes: string | null;
  due_at: string | null;
  is_done: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export class RemindersRepository {
  constructor(private readonly databaseProvider: DatabaseProvider) {}

  initialize() {
    this.databaseProvider.prepare(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        notes TEXT,
        due_at TEXT,
        is_done INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      )
    `).run();
  }

  list(): Reminder[] {
    const rows = this.databaseProvider
      .prepare<Record<string, never>, ReminderRow>(`
        SELECT
          id,
          title,
          notes,
          due_at,
          is_done,
          created_at,
          updated_at,
          completed_at
        FROM reminders
        ORDER BY is_done ASC, due_at IS NULL ASC, due_at ASC, created_at DESC
      `)
      .all();

    return rows.map(this.mapReminderRow);
  }

  create(input: CreateReminderInput): Reminder {
    const now = new Date().toISOString();
    const result = this.databaseProvider
      .prepare<{
        title: string;
        notes: string | null;
        due_at: string | null;
        created_at: string;
        updated_at: string;
      }>(`
        INSERT INTO reminders (title, notes, due_at, created_at, updated_at)
        VALUES (@title, @notes, @due_at, @created_at, @updated_at)
      `)
      .run({
        title: input.title,
        notes: input.notes ?? null,
        due_at: input.dueAt ?? null,
        created_at: now,
        updated_at: now,
      });

    return this.getById(Number(result.lastInsertRowid));
  }

  markDone(id: number): Reminder {
    const existingReminder = this.getById(id);

    if (existingReminder.isDone) {
      return existingReminder;
    }

    const now = new Date().toISOString();
    const result = this.databaseProvider
      .prepare<{
        id: number;
        updated_at: string;
        completed_at: string;
      }>(`
        UPDATE reminders
        SET is_done = 1,
            updated_at = @updated_at,
            completed_at = @completed_at
        WHERE id = @id
      `)
      .run({
        id,
        updated_at: now,
        completed_at: now,
      });

    if (result.changes === 0) {
      throw new AppError(`Reminder not found: ${id}`, 404, 'REMINDER_NOT_FOUND');
    }

    return this.getById(id);
  }

  private getById(id: number): Reminder {
    const row = this.databaseProvider
      .prepare<{ id: number }, ReminderRow>(`
        SELECT
          id,
          title,
          notes,
          due_at,
          is_done,
          created_at,
          updated_at,
          completed_at
        FROM reminders
        WHERE id = @id
      `)
      .get({ id });

    if (!row) {
      throw new AppError(`Reminder not found: ${id}`, 404, 'REMINDER_NOT_FOUND');
    }

    return this.mapReminderRow(row);
  }

  private mapReminderRow(row: ReminderRow): Reminder {
    return {
      id: row.id,
      title: row.title,
      notes: row.notes,
      dueAt: row.due_at,
      isDone: row.is_done === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }
}

