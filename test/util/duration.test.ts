import { afterEach, describe, expect, it } from '@jest/globals';
import { durationText } from '@util/duration';
import { setLocale } from '@util/i18n';
// Every dictionary but English is a locale pack, so load them all.
import '../../src/locale/all';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

afterEach(() => {
  setLocale('en');
});

describe('durationText', () => {
  it('reads a span in the coarsest unit it lasts at least one of', () => {
    expect(durationText(DAY)).toBe('1 day');
    expect(durationText(6 * HOUR)).toBe('6 hours');
    expect(durationText(30 * MINUTE)).toBe('30 minutes');
    expect(durationText(45 * SECOND)).toBe('45 seconds');
  });

  it('reads whole weeks as weeks, and any other span of days in days', () => {
    expect(durationText(WEEK)).toBe('1 week');
    expect(durationText(2 * WEEK)).toBe('2 weeks');
    expect(durationText(10 * DAY)).toBe('10 days');
  });

  it('reads a span that does not divide evenly with the rounding every number gets', () => {
    expect(durationText(36 * HOUR)).toBe('1.5 days');
    expect(durationText(90 * MINUTE)).toBe('1.5 hours');
  });

  it('reads a span shorter than a second in seconds', () => {
    expect(durationText(250)).toBe('0.25 seconds');
  });

  it('ignores the float noise a subtraction of two timestamps leaves', () => {
    expect(durationText(WEEK - 1e-7)).toBe('1 week');
  });

  it('picks the unit on the span without its float noise', () => {
    // Compared raw, a day a hair short read "24 hours", an hour "60 minutes"
    // and a minute "60 seconds".
    expect(durationText(DAY - 1e-7)).toBe('1 day');
    expect(durationText(HOUR - 1e-7)).toBe('1 hour');
    expect(durationText(MINUTE - 1e-7)).toBe('1 minute');
    // One unit in the last place of a timestamp near 1.8e12, the noise two
    // of today's timestamps leave when they are not whole milliseconds.
    expect(durationText(MINUTE - 2 ** -12)).toBe('1 minute');
    expect(durationText(DAY + 2 ** -12)).toBe('1 day');
  });

  it('reads the size of a span taken from edges listed high first', () => {
    expect(durationText(-DAY)).toBe('1 day');
  });

  it('reads a span that is not a number as missing', () => {
    expect(durationText(Number.NaN)).toBe('missing');
    expect(durationText(Number.POSITIVE_INFINITY)).toBe('missing');
  });

  it('reads the unit in the reader\'s language, singular for a count of one', () => {
    setLocale('de');
    expect(durationText(DAY)).toBe('1 Tag');
    expect(durationText(2 * WEEK)).toBe('2 Wochen');

    setLocale('ja');
    expect(durationText(DAY)).toBe('1日間');
  });
});
