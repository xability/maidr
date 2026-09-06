import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
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

describe('a user format function that throws', () => {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it('falls back to the default format instead of taking the reading out', () => {
    // A body that is right for the numbers on an axis and wrong for the
    // category labels the same axis also carries. It throws from
    // TextService.update, which runs before the review, highlight and tactile
    // observers, so one bad value cost the reader all three.
    const format = FormatUtil.resolveFormat({ function: 'return value.toFixed(2);' });
    const wrapped = FormatUtil.wrapFormat(format);

    expect(wrapped(1.5)).toBe('1.50');
    expect(wrapped('Cherries')).toBe('Cherries');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps announcing every later value rather than stopping at the first', () => {
    const wrapped = FormatUtil.wrapFormat(() => {
      throw new Error('boom');
    });

    expect(wrapped(1.5)).toBe('1.5');
    expect(wrapped(2)).toBe('2');
  });
});

describe('the Intl formatters an axis is announced through', () => {
  /**
   * Counts how many times an Intl constructor runs while `run` executes.
   * @param key - The Intl constructor to count
   * @param run - Work to perform with the counter installed
   * @returns Number of constructions observed
   */
  function countConstructions(
    key: 'NumberFormat' | 'DateTimeFormat',
    run: () => void,
  ): number {
    const intl = Intl as unknown as Record<string, unknown>;
    const RealCtor = intl[key] as new (...args: unknown[]) => object;
    let constructions = 0;
    // A plain function, not an arrow: the code under test calls it with `new`.
    const counting = function (...args: unknown[]): object {
      constructions += 1;
      return new RealCtor(...args);
    };

    intl[key] = counting;
    try {
      run();
    } finally {
      intl[key] = RealCtor;
    }
    return constructions;
  }

  it('builds one currency formatter for the whole axis', () => {
    // The options are fixed when the factory runs, but the Intl object was
    // rebuilt for every announced value — and TextService formats several per
    // keypress, whole arrays of them for a scatter row or a box's outliers.
    const format = formatters.currency('USD', 2);

    const constructions = countConstructions('NumberFormat', () => {
      expect(format(1234.5)).toBe('$1,234.50');
      expect(format(2)).toBe('$2.00');
      expect(format(3)).toBe('$3.00');
    });

    expect(constructions).toBe(1);
  });

  it('builds one number formatter for the whole axis', () => {
    const format = formatters.number(2);

    const constructions = countConstructions('NumberFormat', () => {
      expect(format(1234567.89)).toBe('1,234,567.89');
      expect(format(2)).toBe('2.00');
    });

    expect(constructions).toBe(1);
  });

  it('builds one date formatter for the whole axis', () => {
    const format = formatters.date({ month: 'short', day: 'numeric' });

    const constructions = countConstructions('DateTimeFormat', () => {
      expect(format('2023-01-15')).toBe('Jan 15');
      expect(format('2023-02-16')).toBe('Feb 16');
    });

    expect(constructions).toBe(1);
  });
});
