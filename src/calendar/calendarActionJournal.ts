import fs from 'node:fs/promises';
import path from 'node:path';

const JOURNAL_PATH = path.resolve(process.cwd(), 'data/calendar-last-action.json');

export type CalendarLastAction =
  | {
      type: 'create';
      at: string;
      event: {
        id: string;
        summary: string;
        start: string;
        end: string;
      };
    }
  | {
      type: 'update';
      at: string;
      before: {
        id: string;
        summary: string;
        start: string;
        end: string;
      };
      after: {
        id: string;
        summary: string;
        start: string;
        end: string;
      };
    }
  | {
      type: 'delete';
      at: string;
      event: {
        id: string;
        summary: string;
        start: string;
        end: string;
      };
    };

export async function writeLastCalendarAction(action: CalendarLastAction) {
  await fs.mkdir(path.dirname(JOURNAL_PATH), { recursive: true });
  await fs.writeFile(JOURNAL_PATH, JSON.stringify(action, null, 2) + '\n', 'utf8');
}

export async function clearLastCalendarAction() {
  try {
    await fs.unlink(JOURNAL_PATH);
  } catch {
    // ignore missing file
  }
}

export async function readLastCalendarAction(): Promise<CalendarLastAction | null> {
  try {
    const raw = await fs.readFile(JOURNAL_PATH, 'utf8');
    return JSON.parse(raw) as CalendarLastAction;
  } catch {
    return null;
  }
}

export { JOURNAL_PATH };
