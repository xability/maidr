import type { AxisFormat, Maidr } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { FormatterService } from '@service/formatter';
import { TraceType } from '@type/grammar';

/** A one-layer figure whose y axis optionally carries a format. */
function figure(format?: AxisFormat): Maidr {
  return {
    id: 'chart',
    subplots: [[{
      layers: [{
        id: 'layer-1',
        type: TraceType.BAR,
        axes: {
          x: { label: 'Quarter' },
          y: { label: 'Share', ...(format ? { format } : {}) },
        },
        data: [],
      }],
    }]],
  };
}

describe('formatterService', () => {
  it('applies the default rounding to a layer with no format configured', () => {
    // The pure function is covered in test/util/format.test.ts; this pins the
    // resolve → wrap → apply chain every chart actually goes through.
    const service = new FormatterService(figure());

    expect(service.formatSingleValue(57.14285714285714, 'layer-1', 'y')).toBe('57.14');

    service.dispose();
  });

  it('applies an explicit axis format instead of the default', () => {
    const service = new FormatterService(figure({ type: 'fixed', decimals: 4 }));

    expect(service.formatSingleValue(57.14285714285714, 'layer-1', 'y')).toBe('57.1429');
    // The unformatted axis still gets the default.
    expect(service.formatSingleValue(57.14285714285714, 'layer-1', 'x')).toBe('57.14');

    service.dispose();
  });

  it('rounds every element of an array, as boxplot outliers arrive', () => {
    const service = new FormatterService(figure());

    expect(service.formatArrayValue(
      [-9.795123, 6.0570001, 14.736999],
      'layer-1',
      'y',
    )).toEqual(['-9.8', '6.06', '14.74']);

    service.dispose();
  });

  it('still renders a missing value as missing rather than rounding it', () => {
    const service = new FormatterService(figure());

    expect(service.formatSingleValue(Number.NaN, 'layer-1', 'y')).toBe('missing');

    service.dispose();
  });

  it('falls back to the default formatter for an unknown layer', () => {
    const service = new FormatterService(figure());

    expect(service.formatSingleValue(57.14285714285714, 'no-such-layer', 'y')).toBe('57.14');

    service.dispose();
  });

  it('applies the same formatting whether or not the axis configured one', () => {
    // The service used to expose `hasCustomFormatter` for callers to branch on,
    // but it compared the stored function against the `defaultFormat` export
    // while always storing a fresh `wrapFormat` closure — so it answered true
    // for every layer it knew. Callers now format unconditionally, and this
    // pins the property that makes that safe: an unconfigured axis produces a
    // sensible string rather than something a caller would need to skip.
    const plain = new FormatterService(figure());
    const configured = new FormatterService(figure({ type: 'fixed', decimals: 2 }));

    expect(plain.formatSingleValue(57.14285714285714, 'layer-1', 'y')).toBe('57.14');
    expect(configured.formatSingleValue(57.14285714285714, 'layer-1', 'y')).toBe('57.14');
    // Strings and integers survive the unconfigured path untouched, which is
    // what the removed gate was protecting.
    expect(plain.formatSingleValue('Q1', 'layer-1', 'x')).toBe('Q1');
    expect(plain.formatSingleValue(120, 'layer-1', 'x')).toBe('120');

    plain.dispose();
    configured.dispose();
  });
});
