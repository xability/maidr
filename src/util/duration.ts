import type { MessageKey } from '@util/i18n';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';

/** One unit a span of time is read in. */
interface DurationUnit {
  /** The milliseconds in one of it. */
  ms: number;
  /** The words for a count of exactly 1. */
  one: MessageKey;
  /** The words for any other count. */
  many: MessageKey;
}

/** A week, read only where a span comes out in whole weeks. */
const WEEK: DurationUnit = { ms: 604_800_000, one: 'model.durationWeeksOne', many: 'model.durationWeeksMany' };

/** The other units, coarsest first. */
const UNITS: readonly DurationUnit[] = [
  { ms: 86_400_000, one: 'model.durationDaysOne', many: 'model.durationDaysMany' },
  { ms: 3_600_000, one: 'model.durationHoursOne', many: 'model.durationHoursMany' },
  { ms: 60_000, one: 'model.durationMinutesOne', many: 'model.durationMinutesMany' },
  { ms: 1000, one: 'model.durationSecondsOne', many: 'model.durationSecondsMany' },
];

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
 * There is no plural engine, so the count chooses between two messages, the
 * one for a count that reads exactly "1" and the one for any other.
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
  const count = defaultFormat(countOf(span, unit));
  return t(count === '1' ? unit.one : unit.many, { count });
}
