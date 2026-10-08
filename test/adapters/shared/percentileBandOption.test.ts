import { percentileBandPoints, readPercentileBandOptions, warnUnreadBand } from '@adapters/shared/percentileBandOption';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

beforeEach(() => {
  warn.mockClear();
});

describe('readPercentileBandOptions', () => {
  it('reads a fan with its bands outermost first', () => {
    const plans = readPercentileBandOptions([{
      median: 'Median',
      title: 'Forecast',
      bands: [
        { series: 'inner', lower: 0.25, upper: 0.75 },
        { series: 'outer', lower: 0.05, upper: 0.95 },
      ],
    }], 'Test');

    expect(plans).toHaveLength(1);
    expect(plans[0].median).toBe('Median');
    expect(plans[0].title).toBe('Forecast');
    expect(plans[0].bands.map(band => band.series)).toEqual(['outer', 'inner']);
    expect(plans[0].where).toBe('percentileBands[0]');
    expect(warn).not.toHaveBeenCalled();
  });

  it('refuses levels the shared validator refuses, in its words', () => {
    const plans = readPercentileBandOptions([{
      median: 'Median',
      bands: [{ series: 'outer', lower: 5, upper: 95 }],
    }], 'Test');

    expect(plans).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[MAIDR Test\] .*percentileBands\[0\] \(median "Median"\)/));
  });

  it('refuses bands that do not nest', () => {
    const plans = readPercentileBandOptions([{
      median: 'Median',
      bands: [
        { series: 'a', lower: 0.05, upper: 0.75 },
        { series: 'b', lower: 0.25, upper: 0.95 },
      ],
    }], 'Test');

    expect(plans).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('do not nest'));
  });

  it('refuses an entry naming no median, and a value that is not a list', () => {
    expect(readPercentileBandOptions([{ bands: [] }], 'Test')).toEqual([]);
    expect(readPercentileBandOptions({ median: 'Median' }, 'Test')).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('says each problem with one entry once, however often it is read', () => {
    const option = [{ median: 'Median', bands: [{ series: 'outer', lower: 5, upper: 95 }] }];

    readPercentileBandOptions(option, 'Test');
    const once = warn.mock.calls.length;
    readPercentileBandOptions(option, 'Test');
    expect(warn).toHaveBeenCalledTimes(once);
    const [plan] = readPercentileBandOptions(
      [{ median: 'Median', bands: [{ series: 'outer', lower: 0.05, upper: 0.95 }] }],
      'Test',
    );
    warnUnreadBand('Test', plan, 'outer', 'this chart does not draw');
    warnUnreadBand('Test', plan, 'outer', 'this chart does not draw');

    expect(warn).toHaveBeenCalledTimes(once + 1);
  });
});

describe('percentileBandPoints', () => {
  it('orders the quantiles lowest first and leaves a gap where a band draws nothing', () => {
    const points = percentileBandPoints(
      [{ x: 'a', value: 1 }, { x: 'b', value: null }, { x: 'c', value: 3 }],
      [
        { lower: 0.05, upper: 0.95, edgesAt: position => [position - 2, position + 4] },
        { lower: 0.25, upper: 0.75, edgesAt: position => (position === 0 ? undefined : [position, position + 2]) },
      ],
    );

    expect(points).toEqual([
      {
        x: 'a',
        quantiles: [
          { level: 0.05, value: -2 },
          { level: 0.25, value: null },
          { level: 0.5, value: 1 },
          { level: 0.75, value: null },
          { level: 0.95, value: 4 },
        ],
      },
      {
        x: 'c',
        quantiles: [
          { level: 0.05, value: 0 },
          { level: 0.25, value: 2 },
          { level: 0.5, value: 3 },
          { level: 0.75, value: 4 },
          { level: 0.95, value: 6 },
        ],
      },
    ]);
  });
});
