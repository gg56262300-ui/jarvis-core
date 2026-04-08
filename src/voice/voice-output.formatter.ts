import type { VoiceTurnResult } from './voice.types.js';

type FormattedVoiceOutput = {
  displayText: string;
  speechText: string;
};

const UNITS = [
  'null',
  'üks',
  'kaks',
  'kolm',
  'neli',
  'viis',
  'kuus',
  'seitse',
  'kaheksa',
  'üheksa',
];

const TEENS: Record<number, string> = {
  10: 'kümme',
  11: 'üksteist',
  12: 'kaksteist',
  13: 'kolmteist',
  14: 'neliteist',
  15: 'viisteist',
  16: 'kuusteist',
  17: 'seitseteist',
  18: 'kaheksateist',
  19: 'üheksateist',
};

const TENS: Record<number, string> = {
  2: 'kakskümmend',
  3: 'kolmkümmend',
  4: 'nelikümmend',
  5: 'viiskümmend',
  6: 'kuuskümmend',
  7: 'seitsekümmend',
  8: 'kaheksakümmend',
  9: 'üheksakümmend',
};

const ORDINAL_DAYS: Record<number, string> = {
  1: 'esimene',
  2: 'teine',
  3: 'kolmas',
  4: 'neljas',
  5: 'viies',
  6: 'kuues',
  7: 'seitsmes',
  8: 'kaheksas',
  9: 'üheksas',
  10: 'kümnes',
  11: 'üheteistkümnes',
  12: 'kaheteistkümnes',
  13: 'kolmeteistkümnes',
  14: 'neljateistkümnes',
  15: 'viieteistkümnes',
  16: 'kuueteistkümnes',
  17: 'seitseteistkümnes',
  18: 'kaheksateistkümnes',
  19: 'üheksateistkümnes',
  20: 'kahekümnes',
  21: 'kahekümne esimene',
  22: 'kahekümne teine',
  23: 'kahekümne kolmas',
  24: 'kahekümne neljas',
  25: 'kahekümne viies',
  26: 'kahekümne kuues',
  27: 'kahekümne seitsmes',
  28: 'kahekümne kaheksas',
  29: 'kahekümne üheksas',
  30: 'kolmekümnes',
  31: 'kolmekümne esimene',
};

export const formatVoiceOutputTexts = (text: string): FormattedVoiceOutput => {
  const clean = normalizeWhitespace(text);

  return {
    displayText: buildDisplayText(clean),
    speechText: buildSpeechText(clean),
  };
};

export const applyVoiceOutputFormatting = (
  result: VoiceTurnResult,
): VoiceTurnResult => {
  const formatted = formatVoiceOutputTexts(result.responseText);

  return {
    ...result,
    responseText: result.displayText ?? formatted.displayText,
    displayText: result.displayText ?? formatted.displayText,
    speechText: result.speechText ?? formatted.speechText,
  };
};

const normalizeWhitespace = (text: string) => {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s([,!?;:])/g, '$1')
    .replace(/\s+\./g, '.')
    .trim();
};

const buildDisplayText = (text: string) => {
  let display = text;

  display = display.replace(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/gu, (_m, hh, mm, ss) => {
    const parts = [
      `${numberToEstonianWords(Number(hh))} (${pad2(hh)})`,
      `${displayClockPart(Number(mm))} (${pad2(mm)})`,
    ];

    if (ss !== undefined) {
      parts.push(`${displayClockPart(Number(ss))} (${pad2(ss)})`);
    }

    return parts.join(': ');
  });

  display = display.replace(/\b(\d{1,2})\.\s*([A-Za-zÀ-ÿÕÄÖÜõäöü]+)\s+(\d{4})\b/gu, (_m, day, month, year) => {
    return `${numberToEstonianWords(Number(day))} (${Number(day)}). ${month} ${numberToEstonianWords(Number(year))} (${Number(year)})`;
  });

  display = display.replace(/\b\d+\.\d+\b/gu, (raw) => {
    const [intPart, fracPart] = raw.split('.');
    return `${numberToEstonianWords(Number(intPart))} koma ${digitsToWords(fracPart)} (${raw})`;
  });

  return normalizeWhitespace(display);
};

const buildSpeechText = (text: string) => {
  let speech = text;

  speech = speech.replace(/\bm\/s\b/gu, 'meetrit sekundis');
  speech = speech.replace(/\bkm\/h\b/gu, 'kilomeetrit tunnis');
  speech = speech.replace(/\b°C\b/gu, 'kraadi');
  speech = speech.replace(/\b€/gu, 'eurot');

  speech = speech.replace(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/gu, (_m, hh, mm, ss) => {
    const parts = [
      numberToEstonianWords(Number(hh)),
      speechClockPart(Number(mm)),
    ];

    if (ss !== undefined) {
      parts.push(speechClockPart(Number(ss)));
    }

    return parts.join(' … ');
  });

  speech = speech.replace(/\b(\d{1,2})\.\s*([A-Za-zÀ-ÿÕÄÖÜõäöü]+)\s+(\d{4})\b/gu, (_m, day, month, year) => {
    return `${dayToOrdinalSpeech(Number(day))} … ${month} … ${numberToEstonianWords(Number(year))}`;
  });

  speech = speech.replace(/\b\d+\.\d+\b/gu, (raw) => {
    const [intPart, fracPart] = raw.split('.');
    return `${numberToEstonianWords(Number(intPart))} koma ${digitsToWords(fracPart)}`;
  });

  speech = speech.replace(/\b\d+\b/gu, (raw) => {
    const num = Number(raw);
    if (!Number.isSafeInteger(num) || num < 0 || num > 999999) return raw;
    return numberToEstonianWords(num);
  });

  speech = speech
    .replace(/\s*\(([^)]*)\)/gu, '')
    .replace(/:/g, ' … ')
    .replace(/;/g, ' … ')
    .replace(/,/g, ' … ')
    .replace(/\./g, '. … ')
    .replace(/\?/g, '? … ')
    .replace(/!/g, '! … ')
    .replace(/…\s*…/g, '…')
    .replace(/\s+/g, ' ')
    .trim();

  return speech;
};

const displayClockPart = (value: number) => {
  if (value === 0) return 'null null';
  return numberToEstonianWords(value);
};

const speechClockPart = (value: number) => {
  if (value === 0) return 'null null';
  if (value < 10) return `null ${numberToEstonianWords(value)}`;
  return numberToEstonianWords(value);
};

const dayToOrdinalSpeech = (day: number) => {
  return ORDINAL_DAYS[day] ?? numberToEstonianWords(day);
};

const digitsToWords = (digits: string) => {
  return digits
    .split('')
    .map((d) => UNITS[Number(d)] ?? d)
    .join(' … ');
};

const pad2 = (value: string | number) => String(value).padStart(2, '0');

const numberToEstonianWords = (value: number): string => {
  if (value < 10) return UNITS[value];
  if (value < 20) return TEENS[value];

  if (value < 100) {
    const tens = Math.floor(value / 10);
    const unit = value % 10;
    return unit === 0 ? TENS[tens] : `${TENS[tens]} ${UNITS[unit]}`;
  }

  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    const hundredWord = hundreds === 1 ? 'sada' : `${UNITS[hundreds]}sada`;
    return rest === 0 ? hundredWord : `${hundredWord} ${numberToEstonianWords(rest)}`;
  }

  if (value < 1000000) {
    const thousands = Math.floor(value / 1000);
    const rest = value % 1000;
    const thousandWord = thousands === 1 ? 'tuhat' : `${numberToEstonianWords(thousands)} tuhat`;
    return rest === 0 ? thousandWord : `${thousandWord} ${numberToEstonianWords(rest)}`;
  }

  return String(value);
};
