import { describe, expect, it } from '@jest/globals';
import { defaultFormat, formatters, FormatUtil } from '@util/format';

describe('defaultFormat', () => {
  it('shortens a computed share to something a screen reader can speak', () => {
    // 120 of 210 under `barnorm: 'percent'` — the chart from #720, whose fix
    // made these shares announceable at all and left them at full precision.
    expect(defaultFormat(57.14285714285714)).toBe('57.14');
    expect(defaultFormat(42.857142857142854)).toBe('42.86');
  });

  it('drops the decimal point when rounding reaches a whole number', () => {
    // Nothing is padded, so a computed value can come out looking like one
    // that was read verbatim.
    expect(defaultFormat(99.999)).toBe('100');
    expect(defaultFormat(0.004)).toBe('0.004');
  });

  it('leaves an integer exactly as it was', () => {
    expect(defaultFormat(120)).toBe('120');
    expect(defaultFormat(0)).toBe('0');
    expect(defaultFormat(-40)).toBe('-40');
  });

  it('does not pad a value that is already short', () => {
    expect(defaultFormat(0.5)).toBe('0.5');
    expect(defaultFormat(2.25)).toBe('2.25');
    expect(defaultFormat(-1.5)).toBe('-1.5');
  });

  it('keeps a small value visible rather than rounding it away', () => {
    // Two decimals would announce each of these as `0`, which is not what the
    // chart shows.
    expect(defaultFormat(0.000123456)).toBe('0.000123');
    expect(defaultFormat(0.0004)).toBe('0.0004');
    expect(defaultFormat(-0.000987654)).toBe('-0.000988');
  });

  it('keeps exponential notation where JavaScript already used it', () => {
    // Below ~1e-6 the fallback's toPrecision returns an exponent, but so does
    // plain stringification — `String(1.234e-7)` is already `'1.234e-7'`. Only
    // the mantissa gets shorter, so nothing switches notation because of this.
    expect(defaultFormat(0.0000001234)).toBe('1.23e-7');
    expect(defaultFormat(-0.0000001234)).toBe('-1.23e-7');
  });

  it('passes strings through untouched', () => {
    expect(defaultFormat('Q1')).toBe('Q1');
    expect(defaultFormat('57.14285714285714')).toBe('57.14285714285714');
  });

  it('does not attempt to round a non-finite number', () => {
    // Only NaN goes on to be rendered as `missing` by wrapFormat; Infinity is
    // announced as-is, which is pre-existing behaviour this does not change.
    expect(defaultFormat(Number.NaN)).toBe('NaN');
    expect(defaultFormat(Number.POSITIVE_INFINITY)).toBe('Infinity');
    expect(FormatUtil.wrapFormat(defaultFormat)(Number.POSITIVE_INFINITY)).toBe('Infinity');
  });

  it('is still overridden by an explicit axis format', () => {
    const fixed = FormatUtil.resolveFormat({ type: 'fixed', decimals: 4 });
    const percent = FormatUtil.resolveFormat({ type: 'percent', decimals: 1 });

    expect(fixed(57.14285714285714)).toBe('57.1429');
    expect(percent(0.5714285714285714)).toBe('57.1%');
  });

  it('renders a missing value as missing once wrapped, not as a number', () => {
    const wrapped = FormatUtil.wrapFormat(defaultFormat);

    expect(wrapped(Number.NaN)).toBe('missing');
    expect(wrapped(57.14285714285714)).toBe('57.14');
  });
});

describe('a numeric format meeting a value it cannot express', () => {
  // Every numeric formatter coerced with `Number.parseFloat(String(value))`
  // and formatted the result unconditionally, so a *category name* came back
  // as a number that does not exist (#930):
  //
  //     currency    -> $NaN
  //     percent     -> NaN%
  //     number      -> NaN
  //     scientific  -> NaN
  //     fixed       -> NaN
  //     date        -> THREW RangeError
  //
  // A named axis with a numeric `AxisFormat` is a legal combination —
  // `BarPoint.x` is `string | number`, and `ScatterPoint.xLabel` (#927) now
  // reaches the same place — so this is not a malformed payload being
  // punished. It is a formatter meeting a value it cannot express, and
  // "g is $NaN" is a confident statement of something false.
  //
  // The `date` case is the worst of the six and was not in the original
  // report: `Intl.DateTimeFormat.format` *throws* on an invalid date rather
  // than returning a NaN-ish string, and nothing between there and the
  // announcement catches it — so it took the whole reading out.

  it('returns a category name unchanged rather than formatting it', () => {
    expect(formatters.currency('USD', 2)('Cherries')).toBe('Cherries');
    expect(formatters.percent(1)('Cherries')).toBe('Cherries');
    expect(formatters.number(2)('Cherries')).toBe('Cherries');
    expect(formatters.scientific(2)('Cherries')).toBe('Cherries');
    expect(formatters.fixed(2)('Cherries')).toBe('Cherries');
  });

  it('does not throw on a date format', () => {
    expect(() => formatters.date({ month: 'short' })('Cherries')).not.toThrow();
    expect(formatters.date({ month: 'short' })('Cherries')).toBe('Cherries');
  });

  it('treats a non-finite number the same way', () => {
    // `Infinity` and `NaN` are values a formatter cannot express either, and
    // announcing "$∞" would be the same confident falsehood.
    expect(formatters.currency('USD', 2)(Number.NaN)).toBe('NaN');
    expect(formatters.number(0)(Number.POSITIVE_INFINITY)).toBe('Infinity');
  });

  it('still formats a numeric string, which is the point of the coercion', () => {
    // The guard must not throw away the reason `parseFloat` was there: a
    // producer emitting numbers as strings is ordinary.
    expect(formatters.currency('USD', 2)('1234.5')).toBe('$1,234.50');
    expect(formatters.percent(1)('0.156')).toBe('15.6%');
    expect(formatters.fixed(2)('3.14159')).toBe('3.14');
  });

  it('still formats real numbers', () => {
    expect(formatters.currency('USD', 2)(1234.5)).toBe('$1,234.50');
    expect(formatters.percent(0)(0.75)).toBe('75%');
    expect(formatters.number(2)(1234567.89)).toBe('1,234,567.89');
    expect(formatters.scientific(2)(1234567)).toBe('1.23e+6');
    expect(formatters.fixed(0)(3.7)).toBe('4');
  });

  it('still formats a real date', () => {
    expect(formatters.date({ month: 'short', day: 'numeric' })('2023-01-15'))
      .toBe('Jan 15');
  });
});
