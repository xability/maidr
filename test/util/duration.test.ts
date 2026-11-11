import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { axisUnitMs, durationText } from '@util/duration';
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

describe('axisUnitMs', () => {
  // A date format that names a unit says so on purpose.
  let warn: ReturnType<typeof jest.spyOn>;
  beforeAll(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  beforeEach(() => {
    warn.mockClear();
  });
  afterAll(() => {
    warn.mockRestore();
  });

  it('takes a date format\'s values as epoch milliseconds, whatever unit it names', () => {
    expect(axisUnitMs({ type: 'date' })).toBe(1);
    expect(axisUnitMs({ type: 'date', unit: 'second' })).toBe(1);
    expect(axisUnitMs({ type: 'date', unit: 'fortnight' } as never)).toBe(1);
  });

  it('says once in the console that a date format ignores its unit', () => {
    axisUnitMs({ type: 'date', unit: 'hour' });
    axisUnitMs({ type: 'date', unit: 'hour' });
    axisUnitMs({ type: 'date', unit: 'millisecond' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"hour" is ignored');
  });

  it('takes the unit any other format names', () => {
    expect(axisUnitMs({ function: 'return String(value);', unit: 'day' })).toBe(DAY);
    expect(axisUnitMs({ function: 'return String(value);', unit: 'second' })).toBe(SECOND);
    expect(axisUnitMs({ type: 'number', unit: 'second' })).toBe(SECOND);
  });

  it('has no unit for a format that names none, or names one it does not know', () => {
    expect(axisUnitMs(undefined)).toBeUndefined();
    expect(axisUnitMs({ function: 'return String(value);' })).toBeUndefined();
    expect(axisUnitMs({ type: 'fixed', decimals: 1 })).toBeUndefined();
    expect(axisUnitMs({ function: 'return String(value);', unit: 'aeon' } as never)).toBeUndefined();
  });

  it('reads a unit in the singular or the plural, in any case', () => {
    // A gantt's own unit is written in the plural, and a producer will write
    // this one the same way.
    expect(axisUnitMs({ function: 'return String(value);', unit: 'days' } as never)).toBe(DAY);
    expect(axisUnitMs({ function: 'return String(value);', unit: 'Day' } as never)).toBe(DAY);
    expect(axisUnitMs({ type: 'number', unit: 'SECONDS' } as never)).toBe(SECOND);
    expect(axisUnitMs({ type: 'date', unit: 'milliseconds' } as never)).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('says once in the console that it ignores a unit it does not know', () => {
    axisUnitMs({ function: 'return String(value);', unit: 'fortnight' } as never);
    axisUnitMs({ type: 'number', unit: 'fortnight' } as never);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"fortnight"');
  });
});
