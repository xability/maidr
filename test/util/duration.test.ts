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

  it('reads the unit in the reader\'s language, singular for a count of one', () => {
    setLocale('de');
    expect(durationText(DAY)).toBe('1 Tag');
    expect(durationText(2 * WEEK)).toBe('2 Wochen');

    setLocale('ja');
    expect(durationText(DAY)).toBe('1日間');
  });
});
