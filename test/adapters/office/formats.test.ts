import { describe, expect, it } from '@jest/globals';
import { asNumber, categoryLabel, formatDate, isDateFormat, numberLabel, serialToDate } from '../../../src/adapters/office/formats';

describe('serialToDate', () => {
  it.each([
    [45292, '2024-01-01T00:00:00.000Z'],
    [45292.5, '2024-01-01T12:00:00.000Z'],
    [61, '1900-03-01T00:00:00.000Z'],
    // Excel's 1900-02-29, which never was, reads as the day before.
    [60, '1900-02-28T00:00:00.000Z'],
    [1, '1900-01-01T00:00:00.000Z'],
  ])('should read serial %s in the 1900 date system', (serial, expected) => {
    expect(serialToDate(serial).toISOString()).toBe(expected);
  });

  it('should count from 1904 when the workbook does', () => {
    expect(serialToDate(0, true).toISOString()).toBe('1904-01-01T00:00:00.000Z');
    expect(serialToDate(43830, true).toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('isDateFormat', () => {
  it.each([
    ['mmm-yy', true],
    ['d/m/yyyy h:mm', true],
    ['[$-409]mmmm d, yyyy;@', true],
    ['hh:mm:ss AM/PM', true],
    ['0.0%', false],
    ['#,##0', false],
    ['"Day" 0', false],
    ['General', false],
    ['', false],
  ])('should say whether %s writes a date', (code, expected) => {
    expect(isDateFormat(code)).toBe(expected);
  });
});

describe('formatDate', () => {
  const moment = new Date(Date.UTC(2024, 0, 5, 14, 7, 9));

  it.each([
    ['mmm-yy', 'Jan-24'],
    ['mmmm d, yyyy', 'January 5, 2024'],
    ['dddd', 'Friday'],
    ['ddd dd/mm', 'Fri 05/01'],
    ['h:mm AM/PM', '2:07 PM'],
    ['hh:mm:ss', '14:07:09'],
    ['yyyy"Q"m', '2024Q1'],
    ['[$-409]d-mmm;@', '5-Jan'],
    ['mmmmm', 'J'],
    ['d\\.m\\.yy_)', '5.1.24'],
  ])('should write %s as Excel does', (code, expected) => {
    expect(formatDate(moment, code)).toBe(expected);
  });

  it('should write a date ISO style when the format is not a date\'s, with the time only when there is one', () => {
    expect(formatDate(new Date(Date.UTC(2024, 0, 5)))).toBe('2024-01-05');
    expect(formatDate(moment, 'General')).toBe('2024-01-05 14:07:09');
    expect(formatDate(new Date(Date.UTC(2024, 0, 5, 9, 30)))).toBe('2024-01-05 09:30');
  });
});

describe('numberLabel', () => {
  it('should write numbers as General does', () => {
    expect(numberLabel(2024)).toBe('2024');
    expect(numberLabel(0.1 + 0.2)).toBe('0.3');
    expect(numberLabel(-1.5)).toBe('-1.5');
  });
});

describe('categoryLabel', () => {
  it('should keep text, write numbers as General, and dates as their format or the date axis says', () => {
    expect(categoryLabel('North', false, undefined, false, false)).toBe('North');
    expect(categoryLabel('45292', true, undefined, false, false)).toBe('45292');
    expect(categoryLabel('45292', true, 'mmm yyyy', false, false)).toBe('Jan 2024');
    expect(categoryLabel('45292', true, undefined, true, false)).toBe('2024-01-01');
    expect(categoryLabel('', true, undefined, false, false)).toBe('');
    expect(categoryLabel('n/a', true, undefined, false, false)).toBe('n/a');
  });
});

describe('asNumber', () => {
  it('should read finite numbers only', () => {
    expect(asNumber('1.5')).toBe(1.5);
    expect(asNumber('1E3')).toBe(1000);
    expect(asNumber(' ')).toBeUndefined();
    expect(asNumber('NaN')).toBeUndefined();
    expect(asNumber('Infinity')).toBeUndefined();
    expect(asNumber(null)).toBeUndefined();
  });
});
