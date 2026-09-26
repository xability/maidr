/**
 * Reading the values of a Nivo time scale (`xScale: { type: 'time' }`).
 *
 * `@nivo/scales` normalises each value with `createDateNormalizer`: a `Date`
 * is kept, and a string is parsed with d3-time-format's `utcParse(format)`
 * (or `timeParse(format)` with `useUTC: false`), then truncated to the
 * scale's `precision`. The adapter imports neither Nivo nor d3, so the
 * parser here covers the d3 directives a date axis is written with.
 */

/** The props of a Nivo time scale this module reads. */
interface TimeScaleSpec {
  format?: unknown;
  precision?: unknown;
  useUTC?: unknown;
}

/** Month names d3's default (en-US) locale reads for `%b` and `%B`. */
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Weekday names, which `%a`/`%A` match and the date ignores. */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The fields a parsed string sets, with d3's defaults for the rest. */
interface Fields {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  pm?: boolean;
  epoch?: number;
}

/** One directive: the pattern it matches, and what it sets. */
interface Directive {
  pattern: string;
  apply: (fields: Fields, text: string) => void;
}

/**
 * A directive matching a number of up to `digits` digits.
 *
 * @param digits - The most digits d3 reads for it
 * @param apply - Sets the field from the number
 * @returns The directive
 */
function numeric(digits: number, apply: (fields: Fields, value: number) => void): Directive {
  return { pattern: `\\s*(\\d{1,${digits}})`, apply: (fields, text) => apply(fields, Number(text)) };
}

/**
 * A directive matching one of a list of names, case-insensitively.
 *
 * @param names - The full names
 * @param short - Whether the three-letter abbreviations are what is written
 * @param apply - Sets the field from the matched name's index
 * @returns The directive
 */
function named(names: string[], short: boolean, apply?: (fields: Fields, index: number) => void): Directive {
  const written = short ? names.map(name => name.slice(0, 3)) : names;
  return {
    pattern: `(${written.join('|')})`,
    apply: (fields, text) => apply?.(fields, written.indexOf(text.toLowerCase())),
  };
}

const DIRECTIVES: Readonly<Record<string, Directive>> = {
  Y: numeric(4, (f, v) => {
    f.year = v;
  }),
  y: numeric(2, (f, v) => {
    f.year = v + (v > 68 ? 1900 : 2000);
  }),
  m: numeric(2, (f, v) => {
    f.month = v - 1;
  }),
  d: numeric(2, (f, v) => {
    f.day = v;
  }),
  e: numeric(2, (f, v) => {
    f.day = v;
  }),
  H: numeric(2, (f, v) => {
    f.hours = v;
  }),
  I: numeric(2, (f, v) => {
    f.hours = v;
  }),
  M: numeric(2, (f, v) => {
    f.minutes = v;
  }),
  S: numeric(2, (f, v) => {
    f.seconds = v;
  }),
  L: numeric(3, (f, v) => {
    f.milliseconds = v;
  }),
  f: numeric(6, (f, v) => {
    f.milliseconds = Math.floor(v / 1000);
  }),
  Q: { pattern: '\\s*(-?\\d+)', apply: (f, t) => {
    f.epoch = Number(t);
  } },
  s: { pattern: '\\s*(-?\\d+)', apply: (f, t) => {
    f.epoch = Number(t) * 1000;
  } },
  p: { pattern: '(am|pm)', apply: (f, t) => {
    f.pm = t.toLowerCase() === 'pm';
  } },
  b: named(MONTHS, true, (f, i) => {
    f.month = i;
  }),
  B: named(MONTHS, false, (f, i) => {
    f.month = i;
  }),
  a: named(WEEKDAYS, true),
  A: named(WEEKDAYS, false),
};

/**
 * Compiles a d3-time-format specifier into a parser.
 *
 * @param specifier - The format, e.g. `'%Y-%m-%d'`
 * @param utc - Whether the fields are UTC (`utcParse`) or local (`timeParse`)
 * @returns A parser answering a timestamp, or undefined when the string does
 *          not match; undefined itself when a directive is not supported
 */
function compile(specifier: string, utc: boolean): ((text: string) => number | undefined) | undefined {
  let pattern = '';
  const applies: Directive['apply'][] = [];
  for (let i = 0; i < specifier.length; i++) {
    const char = specifier[i];
    if (char !== '%') {
      pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      continue;
    }
    let code = specifier[++i];
    // d3's padding modifiers change how a date is written, not how it is read.
    if (code === '-' || code === '_' || code === '0')
      code = specifier[++i];
    if (code === '%') {
      pattern += '%';
      continue;
    }
    const directive = code === undefined ? undefined : DIRECTIVES[code];
    if (!directive)
      return undefined;
    pattern += directive.pattern;
    applies.push(directive.apply);
  }

  const regex = new RegExp(`^${pattern}$`, 'i');
  return (text) => {
    const match = regex.exec(text);
    if (!match)
      return undefined;
    const fields: Fields = { year: 1900, month: 0, day: 1, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 };
    applies.forEach((apply, index) => apply(fields, match[index + 1]));
    if (fields.epoch !== undefined)
      return fields.epoch;
    if (fields.pm !== undefined)
      fields.hours = (fields.hours % 12) + (fields.pm ? 12 : 0);
    const { year, month, day, hours, minutes, seconds, milliseconds } = fields;
    const time = utc
      ? Date.UTC(year, month, day, hours, minutes, seconds, milliseconds)
      : new Date(year, month, day, hours, minutes, seconds, milliseconds).getTime();
    return Number.isNaN(time) ? undefined : time;
  };
}

/**
 * The truncations of `@nivo/scales`' `precisionCutOffs`, finest first. Nivo
 * applies them with the local-time setters whatever `useUTC` says, and so do
 * these.
 */
const CUT_OFFS: ((date: Date) => void)[] = [
  date => date.setMilliseconds(0),
  date => date.setSeconds(0),
  date => date.setMinutes(0),
  date => date.setHours(0),
  date => date.setDate(1),
  date => date.setMonth(0),
];

const PRECISIONS = ['millisecond', 'second', 'minute', 'hour', 'day', 'month', 'year'];

/** Scale specifiers already reported as unreadable. */
const warnedFormats = new Set<string>();

/**
 * Builds the reader for the values of a time scale, as Nivo normalises them.
 *
 * @param scale - The scale prop (`xScale` or `yScale`)
 * @returns A function answering a value's timestamp, or undefined for a
 *          value Nivo could not place either
 */
export function timeReader(scale: TimeScaleSpec): (value: unknown) => number | undefined {
  const format = typeof scale.format === 'string' ? scale.format : 'native';
  const utc = scale.useUTC !== false;
  const precision = typeof scale.precision === 'string' ? PRECISIONS.indexOf(scale.precision) : 0;
  const cutOffs = CUT_OFFS.slice(0, Math.max(0, precision));
  const parse = format === 'native' ? undefined : compile(format, utc);
  if (format !== 'native' && !parse && !warnedFormats.has(format)) {
    warnedFormats.add(format);
    console.warn(`MAIDR: the Nivo time format "${format}" uses a directive the adapter cannot read; its dates are left out.`);
  }

  return (value) => {
    let time: number | undefined;
    if (value instanceof Date)
      time = value.getTime();
    // Under a format Nivo parses every truthy value, and d3's parser coerces
    // with `String()`, so a number such as 2020 under `format: '%Y'` is drawn
    // as the year it reads as text. A falsy value is left raw, and d3's time
    // scale then places the number 0 at the epoch; anything else falsy is
    // not read as a time here.
    else if (parse && value)
      time = parse(String(value));
    else if (parse && value === 0)
      time = 0;
    if (time === undefined || Number.isNaN(time))
      return undefined;
    const date = new Date(time);
    cutOffs.forEach(cut => cut(date));
    return date.getTime();
  };
}

/**
 * The axis format that announces a time scale's timestamps as dates — with
 * the time of day when any of them has one — in the zone Nivo placed them in.
 *
 * @param scale - The scale prop
 * @param times - The timestamps the axis carries
 * @returns The axis format
 */
export function timeAxisFormat(
  scale: TimeScaleSpec,
  times: readonly number[],
): { type: 'date'; dateOptions: Intl.DateTimeFormatOptions } {
  const utc = scale.useUTC !== false;
  const hasTime = times.some((time) => {
    const date = new Date(time);
    return utc
      ? date.getUTCHours() + date.getUTCMinutes() + date.getUTCSeconds() + date.getUTCMilliseconds() > 0
      : date.getHours() + date.getMinutes() + date.getSeconds() + date.getMilliseconds() > 0;
  });
  return {
    type: 'date',
    dateOptions: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {}),
      ...(utc ? { timeZone: 'UTC' } : {}),
    },
  };
}
