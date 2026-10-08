/**
 * A Plot fan chart: `areaY` bands given `y1` and `y2`, and a median `lineY`,
 * each named by the `className` Plot puts on its group. Nothing in the drawn
 * chart says which quantiles a band's edges are, so the caller says it through
 * `percentileBands`. The fixture is what the real Plot 0.6.17 drew.
 */

import type { ObservablePlotOptions } from '@adapters/observable/types';
import type { PercentileBandPoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { withPageDocument } from '../d3/pageDocument';
import { mountFixture } from './helpers';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

beforeEach(() => {
  warn.mockClear();
});

const BANDS: ObservablePlotOptions['percentileBands'] = [{
  median: 'median',
  bands: [
    { series: 'band-50', lower: 0.25, upper: 0.75 },
    { series: 'band-90', lower: 0.05, upper: 0.95 },
  ],
}];

describe('a fan chart drawn by Observable Plot', () => {
  it('is read as one percentile band when its marks are named', () => {
    const { element } = mountFixture('fanChart');

    const layers = observablePlotToMaidr(element, { percentileBands: BANDS })?.subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers?.[0].type).toBe(TraceType.PERCENTILE_BAND);
    // As the path's three-decimal pixels give them back: -1 is drawn at
    // 311.667, which inverts to -1.00001.
    expect((layers?.[0].data as PercentileBandPoint[])[1]).toEqual({
      x: 1,
      quantiles: [
        { level: 0.05, value: -1.00001 },
        { level: 0.25, value: 0.00001 },
        { level: 0.5, value: 1 },
        { level: 0.75, value: 1.99999 },
        { level: 0.95, value: 3.00001 },
      ],
    });
  });

  it('outlines each band\'s outline, outermost first, then the median', () => {
    const { element, svg } = mountFixture('fanChart');
    const maidr = observablePlotToMaidr(element, { percentileBands: BANDS });
    if (!maidr)
      throw new Error('no schema');

    withPageDocument(svg, () => {
      const figure = new Figure(maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));
      const trace = figure.subplots[0][0].traces[0][0] as unknown as {
        highlightValues: SVGElement[][][] | null;
      };
      const outlined = trace.highlightValues?.map(row =>
        (row[0] as unknown as SVGElement[])[0].parentElement?.getAttribute('class'));

      // Levels 0.05, 0.25, 0.5, 0.75 and 0.95.
      expect(outlined).toEqual(['band-90', 'band-50', 'median', 'band-50', 'band-90']);
    });
  });

  it('leaves an interval band unread, as before, when no fan names it', () => {
    const { element } = mountFixture('fanChart');

    const layers = observablePlotToMaidr(element)?.subplots[0][0].layers;

    expect(layers?.map(layer => layer.type)).toEqual([TraceType.LINE]);
  });

  it('leaves out a band no area mark carries, and says so', () => {
    const { element } = mountFixture('fanChart');

    const layers = observablePlotToMaidr(element, {
      percentileBands: [{
        median: 'median',
        bands: [
          { series: 'band-90', lower: 0.05, upper: 0.95 },
          { series: 'band-80', lower: 0.1, upper: 0.9 },
        ],
      }],
    })?.subplots[0][0].layers;

    expect((layers?.[0].data as PercentileBandPoint[])[0].quantiles.map(q => q.level)).toEqual([0.05, 0.5, 0.95]);
    expect(layers?.[0].selectors).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"band-80" as a band of "median", which no area mark'));
  });

  it('reads the marks as before when the median names no line mark', () => {
    const { element } = mountFixture('fanChart');

    const layers = observablePlotToMaidr(element, {
      percentileBands: [{ median: 'band-90', bands: [{ series: 'band-50', lower: 0.25, upper: 0.75 }] }],
    })?.subplots[0][0].layers;

    expect(layers?.map(layer => layer.type)).toEqual([TraceType.LINE]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names "band-90" as the median'));
  });
});
