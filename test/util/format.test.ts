import type { MaidrLayer } from '@type/grammar';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { defaultFormat, defaultLabelFormat, formatters, FormatUtil } from '@util/format';

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

  it('groups the digits of a large number in threes with commas', () => {
    expect(defaultFormat(12345)).toBe('12,345');
    expect(defaultFormat(1234567)).toBe('1,234,567');
    expect(defaultFormat(-9876543)).toBe('-9,876,543');
    expect(defaultFormat(1234567.891)).toBe('1,234,567.89');
    expect(defaultFormat(9999.996)).toBe('10,000');
    expect(defaultFormat(-12345.678)).toBe('-12,345.68');
  });

  it('starts grouping at 10,000', () => {
    expect(defaultFormat(9999)).toBe('9999');
    expect(defaultFormat(10000)).toBe('10,000');
    expect(defaultFormat(-10000)).toBe('-10,000');
  });

  it('leaves a four-digit number, such as a year, ungrouped', () => {
    expect(defaultFormat(2024)).toBe('2024');
    expect(defaultFormat(-9999)).toBe('-9999');
    expect(defaultFormat(1234.5)).toBe('1234.5');
  });

  it('leaves exponent notation and numeric strings untouched', () => {
    expect(defaultFormat(1e21)).toBe('1e+21');
    expect(defaultFormat('1234567')).toBe('1234567');
  });

  it('leaves a number that names something ungrouped in the label variant', () => {
    expect(defaultLabelFormat(12345)).toBe('12345');
    expect(defaultLabelFormat(20240115)).toBe('20240115');
    expect(defaultLabelFormat(12345.678)).toBe('12345.68');
    expect(defaultLabelFormat('Q1')).toBe('Q1');
  });

  it('gives way to a declared format', () => {
    expect(FormatUtil.resolveFormat({ type: 'fixed', decimals: 0 })(1234567)).toBe('1234567');
    expect(FormatUtil.resolveFormat({ function: 'return String(value)' })(1234567)).toBe('1234567');
    expect(FormatUtil.resolveFormat(undefined)(1234567)).toBe('1,234,567');
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

  it('reads a value under 0.1 with three significant digits, whichever side of 0.005 it falls', () => {
    // Densities from the Old Faithful curve and the ridgeline example. Two
    // decimals read 0.0050 and 0.0052 as "0.005" and "0.01", twice apart,
    // and the peak 0.0366 as "0.04".
    expect(defaultFormat(0.0050)).toBe('0.005');
    expect(defaultFormat(0.0052)).toBe('0.0052');
    expect(defaultFormat(0.00507)).toBe('0.00507');
    expect(defaultFormat(0.0106)).toBe('0.0106');
    expect(defaultFormat(0.0366)).toBe('0.0366');
    expect(defaultFormat(-0.0734)).toBe('-0.0734');
  });

  it('keeps two decimals from 0.1 up', () => {
    expect(defaultFormat(0.384916570869134)).toBe('0.38');
    expect(defaultFormat(0.1)).toBe('0.1');
    expect(defaultFormat(-0.256)).toBe('-0.26');
  });

  it('reads a small negative the way it reads the positive', () => {
    expect(defaultFormat(-0.0366)).toBe('-0.0366');
    expect(defaultFormat(-0.0052)).toBe('-0.0052');
  });

  it('reads zero as zero, signed or not', () => {
    expect(defaultFormat(0)).toBe('0');
    expect(defaultFormat(-0)).toBe('0');
  });

  it('reads a very small value as three digits and an exponent, not a run of zeros', () => {
    expect(defaultFormat(1e-7)).toBe('1e-7');
    expect(defaultFormat(1.23456e-7)).toBe('1.23e-7');
    expect(defaultFormat(1e-12)).toBe('1e-12');
    expect(defaultFormat(-4.5678e-12)).toBe('-4.57e-12');
  });

  it('changes precision at 0.1 without reading a value past it', () => {
    // Just under the boundary three significant digits; at it, two decimals.
    // A value three digits round up to 0.1 reads as 0.1, not as 0.100.
    expect(defaultFormat(0.0999)).toBe('0.0999');
    expect(defaultFormat(0.09996)).toBe('0.1');
    expect(defaultFormat(0.1)).toBe('0.1');
    expect(defaultFormat(0.1004)).toBe('0.1');
    expect(defaultFormat(-0.0999)).toBe('-0.0999');
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

describe('a declared format coarser than the intervals read through it', () => {
  // Bins a twentieth of a unit wide, read with one decimal: "1.1 through 1.1"
  // twice over, between a bin that read "1.0 through 1.1" and one that read
  // "1.1 through 1.2".
  const TWENTIETHS: [number, number][] = [[1, 1.05], [1.05, 1.1], [1.1, 1.15], [1.15, 1.2]];

  it('takes the decimals it needs for every interval\'s ends to read apart', () => {
    const format = FormatUtil.separating({ type: 'fixed', decimals: 1 }, TWENTIETHS);
    const read = FormatUtil.resolveFormat(format);

    expect(format).toEqual({ type: 'fixed', decimals: 2 });
    expect(TWENTIETHS.map(([low, high]) => `${read(low)} through ${read(high)}`)).toEqual([
      '1.00 through 1.05',
      '1.05 through 1.10',
      '1.10 through 1.15',
      '1.15 through 1.20',
    ]);
  });

  it('gives every interval the same decimals, not each the fewest it needs', () => {
    // The first and last bins read apart at one decimal; read at one, their
    // shared edges would not agree with their neighbours'.
    const read = FormatUtil.resolveFormat(FormatUtil.separating({ type: 'fixed', decimals: 1 }, TWENTIETHS));

    expect(read(1)).toBe('1.00');
    expect(read(1.2)).toBe('1.20');
  });

  it('counts from a type\'s own default when the format declares no decimals', () => {
    // `number` reads whole numbers unless told otherwise.
    expect(FormatUtil.separating({ type: 'number' }, [[1, 1.25], [1.25, 1.5]]))
      .toEqual({ type: 'number', decimals: 1 });
    // A percentage's decimals count in percent, not in the value.
    expect(FormatUtil.separating({ type: 'percent', decimals: 0 }, [[0.101, 0.102]]))
      .toEqual({ type: 'percent', decimals: 1 });
    expect(FormatUtil.separating({ type: 'currency', currency: 'USD' }, [[1.001, 1.004]]))
      .toEqual({ type: 'currency', currency: 'USD', decimals: 3 });
    expect(FormatUtil.separating({ type: 'scientific', decimals: 1 }, [[1_050_000, 1_100_000]]))
      .toEqual({ type: 'scientific', decimals: 2 });
  });

  it('leaves a format alone where every interval already reads apart', () => {
    const format = { type: 'fixed', decimals: 1 } as const;

    expect(FormatUtil.separating(format, [[0.75, 1.25], [1.25, 1.75]])).toBe(format);
  });

  it('leaves a date or a function format alone', () => {
    const date = { type: 'date' } as const;
    const custom = { function: 'return Number(value).toFixed(1);' };

    expect(FormatUtil.separating(date, [[0, 1]])).toBe(date);
    expect(FormatUtil.separating(custom, TWENTIETHS)).toBe(custom);
  });

  it('does not part two ends that differ by float noise alone', () => {
    const format = { type: 'fixed', decimals: 1 } as const;

    expect(FormatUtil.separating(format, [[1, 1 + 1e-12]])).toBe(format);
  });

  it('reads a format as declared when no number of decimals parts the ends', () => {
    // Twenty decimals, the most it gives, still read both ends as zero.
    const format = { type: 'fixed', decimals: 1 } as const;

    expect(FormatUtil.separating(format, [[0, 1e-25]])).toBe(format);
  });

  it('reads a format it cannot build as declared rather than throwing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const format = { type: 'currency', currency: 'NOT A CODE', decimals: 0 } as const;

    expect(FormatUtil.separating(format, [[1, 1.2]])).toBe(format);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('the format a histogram reads an axis in', () => {
  const ONE_DECIMAL = { type: 'fixed', decimals: 1 } as const;

  it('widens the y axis of a histogram drawn sideways, and not its x', () => {
    const layer: MaidrLayer = {
      id: 'sideways',
      type: TraceType.HISTOGRAM,
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'Count', format: ONE_DECIMAL }, y: { label: 'Length', format: ONE_DECIMAL } },
      data: [[1, 1.05], [1.05, 1.1]].map(([low, high]) => (
        { x: 3, y: (low + high) / 2, xMin: 0, xMax: 3, yMin: low, yMax: high }
      )),
    };

    expect(FormatUtil.axisFormat(layer, 'y')).toEqual({ type: 'fixed', decimals: 2 });
    expect(FormatUtil.axisFormat(layer, 'x')).toBe(ONE_DECIMAL);
  });

  it('has no format for an axis that declares none', () => {
    const layer: MaidrLayer = {
      id: 'plain',
      type: TraceType.HISTOGRAM,
      axes: { x: { label: 'Length' }, y: { label: 'Count' } },
      data: [{ x: 1.025, y: 3, xMin: 1, xMax: 1.05, yMin: 0, yMax: 3 }],
    };

    expect(FormatUtil.axisFormat(layer, 'x')).toBeUndefined();
  });
});
