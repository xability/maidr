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
});
