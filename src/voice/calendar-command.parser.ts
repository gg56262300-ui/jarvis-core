import { z } from 'zod';

interface ParsedCalendarCommand {
  title: string;
  start?: string;
  end?: string;
  parseFailed: boolean;
}

const CalendarCreateMatchSchema = z.object({
  rawTimeOfDay: z.string().optional(),
  rawStartHour: z.string().min(1),
  rawEndHour: z.string().min(1),
  title: z.string().min(1),
});

type EstonianTimeOfDay = 'hommikul' | 'paeval' | 'ohtul';

const ESTONIAN_TIME_OF_DAY_WORDS = new Set<EstonianTimeOfDay>([
  'hommikul',
  'paeval',
  'ohtul',
]);

const ESTONIAN_HOUR_WORDS: Record<string, number> = {
  null: 0,
  uks: 1,
  kaks: 2,
  kolm: 3,
  neli: 4,
  viis: 5,
  kuus: 6,
  seitse: 7,
  kaheksa: 8,
  uheksa: 9,
  kumme: 10,
  uksteist: 11,
  kaksteist: 12,
};

export const parseCalendarCreateCommand = (
  transcript: string,
  now: Date = new Date(),
): ParsedCalendarCommand => {
  const cleaned = transcript.replace(/^lisa kalendrisse[:\s-]*/i, '').trim();

  if (!cleaned) {
    return {
      title: '',
      parseFailed: false,
    };
  }

  const startsWithTomorrow = /^homme\b/i.test(cleaned);

  const saturdaySingleTimeMatch = cleaned.match(
    /^laupäeval\s+(\d{1,2})\.?\s*(?:kuupäeval)?\s+kell\s+([^\s]+)(?:\s+(hommikul|päeval|paeval|õhtul|ohtul))?\s+(.+)$/i,
  );

  if (saturdaySingleTimeMatch) {
    const day = Number(saturdaySingleTimeMatch[1]);
    const rawHour = saturdaySingleTimeMatch[2];
    const rawTimeOfDay = saturdaySingleTimeMatch[3];
    const title = saturdaySingleTimeMatch[4].trim();

    const timeOfDay = parseTimeOfDayToken(rawTimeOfDay);
    const startHour = parseHourToken(rawHour, timeOfDay);

    if (startHour === null) {
      return {
        title,
        parseFailed: true,
      };
    }

    const year = now.getFullYear();
    const month = now.getMonth();
    const startDate = new Date(now);
    startDate.setFullYear(year, month, day);
    startDate.setHours(startHour, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1, 0, 0, 0);

    return {
      title,
      start: formatIsoWithOffset(startDate),
      end: formatIsoWithOffset(endDate),
      parseFailed: false,
    };
  }

  const tomorrowSingleTimeMatch = cleaned.match(
    /^homme\s+kell\s+([^\s]+)(?:\s+(hommikul|päeval|paeval|õhtul|ohtul))?\s+(.+)$/i,
  );

  if (tomorrowSingleTimeMatch) {
    const rawHour = tomorrowSingleTimeMatch[1];
    const rawTimeOfDay = tomorrowSingleTimeMatch[2];
    const title = tomorrowSingleTimeMatch[3].trim();

    if (/^kuni\b/i.test(title)) {
      // let the range parser below handle commands like:
      // "homme kell 10 kuni 11 pealkiri"
    } else {
      const timeOfDay = parseTimeOfDayToken(rawTimeOfDay);
      const startHour = parseHourToken(rawHour, timeOfDay);

      if (startHour === null) {
        return {
          title,
          parseFailed: true,
        };
      }

      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() + 1);
      startDate.setHours(startHour, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setHours(startDate.getHours() + 1, 0, 0, 0);

      return {
        title,
        start: formatIsoWithOffset(startDate),
        end: formatIsoWithOffset(endDate),
        parseFailed: false,
      };
    }
  }

  const match = startsWithTomorrow
    ? cleaned.match(
        /^homme(?:\s+(hommikul|päeval|paeval|õhtul|ohtul))?\s+kell\s+([^\s]+)\s+kuni\s+([^\s]+)\s+(.+)$/i,
      )
    : cleaned.match(
        /^(.+)\s+homme(?:\s+(hommikul|päeval|paeval|õhtul|ohtul))?\s+kell\s+([^\s]+)\s+kuni\s+([^\s]+)$/i,
      );

  if (!match) {
    return {
      title: cleaned,
      parseFailed: true,
    };
  }

  let rawTimeOfDay: string | undefined;
  let rawStartHour: string;
  let rawEndHour: string;
  let title: string;

  if (startsWithTomorrow) {
    rawTimeOfDay = match[1];
    rawStartHour = match[2];
    rawEndHour = match[3];
    title = match[4];
  } else {
    title = match[1];
    rawTimeOfDay = match[2];
    rawStartHour = match[3];
    rawEndHour = match[4];
  }

  const parsedMatch = CalendarCreateMatchSchema.safeParse({
    rawTimeOfDay,
    rawStartHour,
    rawEndHour,
    title,
  });

  if (!parsedMatch.success) {
    return {
      title: cleaned,
      parseFailed: true,
    };
  }

  ({ rawTimeOfDay, rawStartHour, rawEndHour, title } = parsedMatch.data);

  const timeOfDay = parseTimeOfDayToken(rawTimeOfDay);
  const startHour = parseHourToken(rawStartHour, timeOfDay);
  const endHour = parseHourToken(rawEndHour, timeOfDay);

  if (startHour === null || endHour === null || endHour <= startHour) {
    return {
      title: title.trim(),
      parseFailed: true,
    };
  }

  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() + 1);
  startDate.setHours(startHour, 0, 0, 0);

  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 1);
  endDate.setHours(endHour, 0, 0, 0);

  return {
    title: title.trim(),
    start: formatIsoWithOffset(startDate),
    end: formatIsoWithOffset(endDate),
    parseFailed: false,
  };
};

const parseHourToken = (
  rawHourToken: string,
  timeOfDay?: EstonianTimeOfDay,
): number | null => {
  if (/^\d{1,2}$/.test(rawHourToken)) {
    const hour = Number(rawHourToken);
    return hour >= 0 && hour <= 23 ? applyTimeOfDayHint(hour, timeOfDay) : null;
  }

  const normalizedHourToken = normalizeEstonianToken(rawHourToken);
  const hour = ESTONIAN_HOUR_WORDS[normalizedHourToken];

  if (hour === undefined) {
    return null;
  }

  if (timeOfDay) {
    return applyTimeOfDayHint(hour, timeOfDay);
  }

  if (hour >= 1 && hour <= 7) {
    return hour + 12;
  }

  return hour;
};

const applyTimeOfDayHint = (hour: number, timeOfDay?: EstonianTimeOfDay) => {
  if (!timeOfDay) {
    return hour;
  }

  if (timeOfDay === 'hommikul') {
    return hour;
  }

  if ((timeOfDay === 'paeval' || timeOfDay === 'ohtul') && hour >= 1 && hour <= 11) {
    return hour + 12;
  }

  return hour;
};

const parseTimeOfDayToken = (
  rawTimeOfDay?: string,
): EstonianTimeOfDay | undefined => {
  if (!rawTimeOfDay) {
    return undefined;
  }

  const normalizedTimeOfDay = normalizeEstonianToken(rawTimeOfDay);

  if (!ESTONIAN_TIME_OF_DAY_WORDS.has(normalizedTimeOfDay as EstonianTimeOfDay)) {
    return undefined;
  }

  return normalizedTimeOfDay as EstonianTimeOfDay;
};

const normalizeEstonianToken = (value?: string | null) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const formatIsoWithOffset = (value: Date) => {
  const year = value.getFullYear();
  const month = pad(value.getMonth() + 1);
  const day = pad(value.getDate());
  const hours = pad(value.getHours());
  const minutes = pad(value.getMinutes());
  const seconds = pad(value.getSeconds());

  const offsetMinutes = -value.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absoluteOffsetMinutes / 60));
  const offsetRemainderMinutes = pad(absoluteOffsetMinutes % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetRemainderMinutes}`;
};

const pad = (value: number) => String(value).padStart(2, '0');
