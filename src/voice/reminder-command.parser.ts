interface ParsedReminderCommand {
  title: string;
  dueAt?: string;
  dueAtParseFailed: boolean;
}

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

export const parseReminderCommand = (
  transcript: string,
  now: Date = new Date(),
): ParsedReminderCommand => {
  const title = transcript.replace(/^lisa meeldetuletus[:\s-]*/i, '').trim();

  if (!title) {
    return {
      title: '',
      dueAtParseFailed: false,
    };
  }

  const dueAtMatch =
    title.match(
      /^homme(?:\s+(hommikul|päeval|paeval|õhtul|ohtul))?\s+kell\s+([^\s]+)\s+(.+)$/i,
    ) ??
    title.match(
      /^(.+)\s+homme(?:\s+(hommikul|päeval|paeval|õhtul|ohtul))?\s+kell\s+([^\s]+)$/i,
    );

  if (!dueAtMatch) {
    return {
      title,
      dueAtParseFailed: false,
    };
  }

  let rawTimeOfDay;
  let rawHourToken;
  let reminderTitle;

  if (normalizeEstonianToken(dueAtMatch[1]) == 'homme') {
    rawTimeOfDay = dueAtMatch[2];
    rawHourToken = dueAtMatch[3];
    reminderTitle = dueAtMatch[4];
  } else {
    reminderTitle = dueAtMatch[1];
    rawTimeOfDay = dueAtMatch[2];
    rawHourToken = dueAtMatch[3];
  }
  const timeOfDay = parseTimeOfDayToken(rawTimeOfDay);
  const parsedHour = parseHourToken(rawHourToken, timeOfDay);

  if (parsedHour === null) {
    return {
      title: reminderTitle.trim(),
      dueAtParseFailed: true,
    };
  }

  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 1);
  dueDate.setHours(parsedHour, 0, 0, 0);

  return {
    title: reminderTitle.trim(),
    dueAt: formatIsoWithOffset(dueDate),
    dueAtParseFailed: false,
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
