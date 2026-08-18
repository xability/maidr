/**
 * A fitted trend line is a reading, not a mark to skip (#1081).
 *
 * `Plot.linearRegressionY` produced no layer. Unlike a box plot — whose four
 * parts arrive as ordinary `rule`, `bar` and `tick` groups and need a
 * declaration to be recognised as one chart (#1074) — this mark names itself:
 * Plot gives it `aria-label="linear-regression"`, which nothing else produces.
 * So the detection needs no heuristic and no option.
 *
 * What is read is the fitted line. The confidence band is not: `SmoothPoint`
 * carries `x`, `y`, `svg_x` and `svg_y` and no bounds, and `SmoothTrace`
 * announces none, so an interval has nowhere to go on a smooth layer.
 */

import type { MaidrLayer, SmoothPoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

function layersOf(key: Parameters<typeof mountFixture>[0]): MaidrLayer[] {
  const { element } = mountFixture(key);
  const maidr = observablePlotToMaidr(element);
  if (!maidr)
    throw new Error(`fixture "${String(key)}" produced no schema`);
  return maidr.subplots[0][0].layers;
}

describe('a linear regression mark', () => {
  it('is read as a smooth curve alongside the points it was fitted to', () => {
    const layers = layersOf('regression');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER, TraceType.SMOOTH]);
  });

  it('recovers the trend the chart drew', () => {
    // Dose 1-4 against response 2,4,6,8 is exactly linear, so the fit runs
    // corner to corner and its two vertices are the trend's ends.
    const fit = layersOf('regression')[1].data as SmoothPoint[][];

    expect(fit).toHaveLength(1);
    expect(fit[0].map(point => [point.x, point.y])).toEqual([[1, 2], [4, 8]]);
  });

  it('carries the pixels the fit was drawn at', () => {
    // `SmoothPoint` asks for SVG-space coordinates as well as data-space ones,
    // and for this adapter the pixels are what the values were inverted from.
    const fit = layersOf('regression')[1].data as SmoothPoint[][];

    expect(fit[0].map(point => [point.svg_x, point.svg_y])).toEqual([[40, 370], [620, 20]]);
  });

  it('reads one fit per series when the mark is split by colour', () => {
    // Four paths — a band and a line per series. Taking them in pairs by
    // position would work here and break the day Plot reorders them; `fill`
    // is what actually says which is which.
    const fits = layersOf('groupedRegression')[0].data as SmoothPoint[][];

    expect(fits).toHaveLength(2);
    expect(fits[0].map(point => [point.x, point.y])).toEqual([[1, 2], [4, 8]]);
    expect(fits[1].map(point => [point.x, point.y])).toEqual([[1, 5], [4, 11]]);
  });

  it('leaves an area mark reading its colour off the fill', () => {
    // A fitted line's colour is on its stroke because its fill is `none`. An
    // area is the other way round — filled, with no stroke at all — so the
    // stroke-first read this mark needs must not leak into the line family.
    // It did: one careless replace-all took `strokeOrFill` out of
    // `convertLine` too, and every stacked area silently lost its band names
    // while the whole suite stayed green, because nothing pinned them.
    const { element } = mountFixture('stackedStepArea');
    const maidr = observablePlotToMaidr(element);
    const bands = maidr?.subplots[0][0].layers[0].data as { z?: string }[][];

    expect(maidr?.subplots[0][0].legend).toEqual(['a', 'b']);
    expect(bands.map(band => band[0].z)).toEqual(['a', 'b']);
  });

  it('names the series so a reader knows which trend is which', () => {
    expect(layersOf('groupedRegression')[0].type).toBe(TraceType.SMOOTH);
    const { element } = mountFixture('groupedRegression');
    const maidr = observablePlotToMaidr(element);

    expect(maidr?.subplots[0][0].legend).toEqual(['x', 'y']);
  });
});
