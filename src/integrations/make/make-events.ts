/**
 * Canonical `event` field values for Jarvis → Make webhook JSON.
 * @see docs/MAKE_CONTRACT.md
 */
export const JARVIS_MAKE_EVENTS = {
  REMINDER_SET: 'reminder.set',
  CALENDAR_CREATE: 'calendar.create',
  CALENDAR_QUERY: 'calendar.query',
} as const;

export type JarvisMakeEventName = (typeof JARVIS_MAKE_EVENTS)[keyof typeof JARVIS_MAKE_EVENTS];
