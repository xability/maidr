import type { MessageKey } from '@util/i18n';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';

/** One unit a span of time is read in. */
export interface DurationUnit {
  /** The milliseconds in one of it. */
  ms: number;
  /** The words for a count of exactly 1. */
  one: MessageKey;
  /** The words for any other count. */
  many: MessageKey;
  /** The unit's own name, with no count: "days". */
  name: MessageKey;
}

/** A week, read only where a span comes out in whole weeks. */
const WEEK: DurationUnit = {
  ms: 604_800_000,
  one: 'model.durationWeeksOne',
  many: 'model.durationWeeksMany',
  name: 'model.durationWeeks',
};

/** The other units, coarsest first. */
const UNITS: readonly DurationUnit[] = [
  { ms: 86_400_000, one: 'model.durationDaysOne', many: 'model.durationDaysMany', name: 'model.durationDays' },
  { ms: 3_600_000, one: 'model.durationHoursOne', many: 'model.durationHoursMany', name: 'model.durationHours' },
  { ms: 60_000, one: 'model.durationMinutesOne', many: 'model.durationMinutesMany', name: 'model.durationMinutes' },
  { ms: 1000, one: 'model.durationSecondsOne', many: 'model.durationSecondsMany', name: 'model.durationSeconds' },
];

/**
 * The units of time a chart may name by an English word, by that word.
 *
 * The adapters name a schedule's unit for the reader -- `days` or `hours`
 * where the chart counts in them -- and py-maidr's Bokeh reader does the
 * same, all of them in English, so a German reader heard "3 days" amid
 * German words.
 */
const UNIT_WORDS: Readonly<Record<string, DurationUnit>> = {
  week: WEEK,
  weeks: WEEK,
  day: UNITS[0],
  days: UNITS[0],
  hour: UNITS[1],
  hours: UNITS[1],
  minute: UNITS[2],
  minutes: UNITS[2],
  second: UNITS[3],
  seconds: UNITS[3],
};

/**
 * The unit of time an English word names -- `days`, `hour`, `Weeks` -- or
 * `undefined` for any other word, which a chart may use for a unit that is
 * not one of time ("bits", "sprints") and which is read as written.
 *
 * @param word - The word a chart names a unit by
 * @returns The unit, or `undefined`
 */
export function namedTimeUnit(word: string): DurationUnit | undefined {
  const key = word.trim().toLowerCase();
  return Object.hasOwn(UNIT_WORDS, key) ? UNIT_WORDS[key] : undefined;
}

/**
 * A count of a unit of time, in the reader's language: "1 day", "3 days".
 *
 * There is no plural engine, so the count chooses between two messages, the
 * one for a count that reads exactly "1" and the one for any other.
 *
 * @param count - The count, already formatted
 * @param unit - The unit
 * @returns The count with its unit
 */
export function unitCount(count: string, unit: DurationUnit): string {
  return t(count === '1' ? unit.one : unit.many, { count });
}

/**
 * How many of a unit a span holds, without the float noise a subtraction of
 * two timestamps leaves: a count within a millionth of a whole number is that
 * number, the tolerance the histogram compares bin widths by. Twelve
 * significant figures, which the gantt cleans a length to, are not enough
 * here: timestamps near 1.8e12 carry noise in the fourth decimal of a
 * millisecond, so a minute a hair short would read 60 seconds.
 *
 * @param ms - The span, in milliseconds
 * @param unit - The unit
 * @returns The count
 */
function countOf(ms: number, unit: DurationUnit): number {
  const count = ms / unit.ms;
  const whole = Math.round(count);
  return whole !== 0 && Math.abs(count - whole) <= Math.abs(whole) * 1e-6 ? whole : count;
}

/**
 * A span of time, given in milliseconds, in the unit a reader counts it in.
 *
 * Whole weeks read as weeks ("2 weeks"). Anything else reads in the coarsest
 * of days, hours, minutes and seconds it lasts at least one of, rounded as
 * every other number is ("1 day", "1.5 days", "6 hours"), and a span shorter
 * than a second in seconds. That is the rule the ApexCharts adapter picks a
 * datetime schedule's unit by, with weeks where they come out whole: ten days
 * read "10 days" rather than "1.43 weeks".
 *
 * The unit is chosen on the count without its float noise, as the count is
 * read: a day a hair short from the subtraction of two timestamps is one day,
 * not 24 hours. A span taken from edges listed high first comes out negative
 * and is the same span, so it reads its size. One that is not a number reads
 * as missing, as an extent with no ends does.
 *
 * @param ms - The span, in milliseconds
 * @returns The span in words
 */
export function durationText(ms: number): string {
  if (!Number.isFinite(ms)) {
    return t('common.missing');
  }
  const span = Math.abs(ms);
  const weeks = countOf(span, WEEK);
  const unit = weeks >= 1 && Number.isInteger(weeks)
    ? WEEK
    : UNITS.find(candidate => countOf(span, candidate) >= 1) ?? UNITS[UNITS.length - 1];
  return unitCount(defaultFormat(countOf(span, unit)), unit);
}
