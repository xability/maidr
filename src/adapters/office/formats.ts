/**
 * How a chart part's cached category values are written as labels: text as
 * it is, a number as Excel's General format writes it, and a date as the
 * axis' number format writes it.
 *
 * A chart part keeps a date as its serial number, the days since the
 * workbook's epoch, and its number format as an Excel format code such as
 * `mmm-yy`. Office.js hands an add-in the labels already written out; a part
 * read from a file has to be written out here.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** By `Date.getUTCDay()`: Sunday first. */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** One token of a date format code, or one literal character. */
const DATE_TOKEN = /"[^"]*"|\\.|\[[^\]]*\]|_.|\*.|yyyy|yy|e|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|a\/p|./gi;

/** The parts of a format code that are never date parts: quoted text, escapes, brackets. */
const NOT_A_TOKEN = /"[^"]*"|\\.|\[[^\]]*\]/g;

const DAY_MS = 86_400_000;

/**
 * A number written as Excel's General format writes it: a whole number
 * without a decimal point, any other to ten significant digits.
 *
 * @param value - A finite number.
 * @returns The label.
 */
export function numberLabel(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toPrecision(10)));
}

/**
 * Whether an Excel number format writes a date or a time: date or time parts,
 * and no digit placeholders.
 *
 * @param code - The format code, such as `mmm-yy` or `0.0%`.
 * @returns `true` for a date or time format.
 */
export function isDateFormat(code: string | null | undefined): boolean {
  if (code === null || code === undefined || code === '' || code.toLowerCase() === 'general') {
    return false;
  }
  const bare = code.split(';')[0].replace(NOT_A_TOKEN, '').toLowerCase();
  return /[ymdhs]/.test(bare) && !/[0#?]/.test(bare);
}

/**
 * The moment an Excel serial number stands for, in UTC.
 *
 * In the 1900 date system serial 60 is Excel's 1900-02-29, which never was;
 * it is read as 1900-02-28.
 *
 * @param serial - Days since the workbook's epoch, the time of day as a fraction.
 * @param date1904 - Whether the workbook counts from 1904-01-01.
 * @returns The moment, to the nearest second.
 */
export function serialToDate(serial: number, date1904 = false): Date {
  let base: number;
  let days = serial;
  if (date1904) {
    base = Date.UTC(1904, 0, 1);
  } else if (serial >= 61) {
    base = Date.UTC(1899, 11, 30);
  } else {
    base = Date.UTC(1899, 11, 31);
    if (serial >= 60) {
      days -= 1;
    }
  }
  return new Date(base + Math.round(days * 86_400) * 1000);
}

/** Whether the `m` token at `index` means minutes: after hours, or before seconds. */
function isMinute(tokens: readonly string[], index: number): boolean {
  const letters = (sequence: readonly string[]): string | undefined => {
    for (const token of sequence) {
      const lower = token.toLowerCase();
      if (/^[ymdhs]/.test(lower)) {
        return lower;
      }
    }
    return undefined;
  };
  const before = letters(tokens.slice(0, index).reverse());
  const after = letters(tokens.slice(index + 1));
  return (before ?? '').startsWith('h') || (after ?? '').startsWith('s');
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function datePart(token: string, moment: Date, twelveHour: boolean): string {
  const lower = token.toLowerCase();
  const hours = moment.getUTCHours();
  const hour = twelveHour ? (hours % 12 || 12) : hours;
  const month = MONTHS[moment.getUTCMonth()];
  const day = DAYS[moment.getUTCDay()];
  switch (lower) {
    case 'yyyy':
    case 'e':
      return pad(moment.getUTCFullYear(), 4);
    case 'yy':
      return pad(moment.getUTCFullYear() % 100);
    case 'mmmmm':
      return month[0];
    case 'mmmm':
      return month;
    case 'mmm':
      return month.slice(0, 3);
    case 'mm':
      return pad(moment.getUTCMonth() + 1);
    case 'm':
      return String(moment.getUTCMonth() + 1);
    case 'dddd':
      return day;
    case 'ddd':
      return day.slice(0, 3);
    case 'dd':
      return pad(moment.getUTCDate());
    case 'd':
      return String(moment.getUTCDate());
    case 'hh':
      return pad(hour);
    case 'h':
      return String(hour);
    case 'ss':
      return pad(moment.getUTCSeconds());
    case 's':
      return String(moment.getUTCSeconds());
    case 'am/pm':
      return hours < 12 ? 'AM' : 'PM';
    case 'a/p':
      return hours < 12 ? 'A' : 'P';
  }
  if (token.startsWith('"')) {
    return token.slice(1, -1);
  }
  if (token.startsWith('\\')) {
    return token.slice(1);
  }
  if (token.startsWith('[') || token.startsWith('*')) {
    // A condition or a color, and the fill a `*` repeats: nothing to read.
    return '';
  }
  // `_x` pads with the width of x.
  return token.startsWith('_') ? ' ' : token;
}

/**
 * A moment written the way an Excel date format writes it, month and day
 * names in English; with no date format, ISO 8601 style, the time only when
 * there is one.
 *
 * @param moment - The moment, in UTC.
 * @param code - An Excel date format such as `mmm-yy`.
 * @returns `Jan-24` for `mmm-yy`.
 */
export function formatDate(moment: Date, code?: string | null): string {
  if (!isDateFormat(code)) {
    const date = `${pad(moment.getUTCFullYear(), 4)}-${pad(moment.getUTCMonth() + 1)}-${pad(moment.getUTCDate())}`;
    if (moment.getTime() % DAY_MS === 0) {
      return date;
    }
    const time = `${pad(moment.getUTCHours())}:${pad(moment.getUTCMinutes())}`;
    const seconds = moment.getUTCSeconds();
    return `${date} ${time}${seconds === 0 ? '' : `:${pad(seconds)}`}`;
  }
  const tokens = (code as string).split(';')[0].match(DATE_TOKEN) ?? [];
  const twelveHour = tokens.some(token => ['am/pm', 'a/p'].includes(token.toLowerCase()));
  return tokens
    .map((token, i) => {
      const lower = token.toLowerCase();
      if ((lower === 'm' || lower === 'mm') && isMinute(tokens, i)) {
        return lower === 'mm' ? pad(moment.getUTCMinutes()) : String(moment.getUTCMinutes());
      }
      return datePart(token, moment, twelveHour);
    })
    .join('')
    .trim();
}

/**
 * A finite number from a cached value, or `undefined`.
 *
 * @param value - The cached text.
 * @returns The number.
 */
export function asNumber(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value.trim() === '') {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * A category as the axis labels it: text as it is, a date as its format, or
 * the axis' being a date axis, says, and any other number as General.
 *
 * @param value - The cached value.
 * @param numeric - Whether the cache holds numbers (`c:numCache`).
 * @param code - The cache's or the axis' number format.
 * @param dates - Whether the axis is a date axis.
 * @param date1904 - Whether the workbook counts from 1904.
 * @returns The label, `''` for a blank.
 */
export function categoryLabel(
  value: string | undefined,
  numeric: boolean,
  code: string | null | undefined,
  dates: boolean,
  date1904: boolean,
): string {
  if (value === undefined || value === '') {
    return '';
  }
  if (!numeric) {
    return value;
  }
  const number = asNumber(value);
  if (number === undefined) {
    return value;
  }
  if (isDateFormat(code)) {
    return formatDate(serialToDate(number, date1904), code);
  }
  if (dates) {
    return formatDate(serialToDate(number, date1904));
  }
  return numberLabel(number);
}
