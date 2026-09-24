/**
 * @jest-environment jsdom
 */
import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * Where a scatter marker drawn as an inline `<path>` sits.
 *
 * matplotlib writes each marker as an inline path whenever the markers vary
 * from point to point -- seaborn's `style=` -- rather than as a `<use>` of a
 * shared definition. Such a path carries its position only in `d`, and the
 * first `M x y` there is where the outline starts: the bottom of a circle, a
 * corner of an `X`. Read as the position, two shapes at the same x fell into
 * different columns. The paths below are what matplotlib wrote for
 * `sns.scatterplot(x=[1, 1, 2, 2], ..., style=g)`, as measured.
 */

const CIRCLE_AT_1 = 'M 73.832727 298.488 C 74.628337 298.488 75.391467 298.171901 75.954048 297.60932 C 76.516628 297.04674 76.832727 296.283609 76.832727 295.488 C 76.832727 294.692391 76.516628 293.92926 75.954048 293.36668 C 75.391467 292.804099 74.628337 292.488 73.832727 292.488 C 73.037118 292.488 72.273988 292.804099 71.711407 293.36668 C 71.148826 293.92926 70.832727 294.692391 70.832727 295.488 C 70.832727 296.283609 71.148826 297.04674 71.711407 297.60932 C 72.273988 298.171901 73.037118 298.488 73.832727 298.488 z';
const X_AT_1 = 'M 72.332727 250.104 L 73.832727 248.604 L 75.332727 250.104 L 76.832727 248.604 L 75.332727 247.104 L 76.832727 245.604 L 75.332727 244.104 L 73.832727 245.604 L 72.332727 244.104 L 70.832727 245.604 L 72.332727 247.104 L 70.832727 248.604 z';
const CIRCLE_AT_2 = 'M 236.16 201.72 C 236.955609 201.72 237.71874 201.403901 238.28132 200.84132 C 238.843901 200.27874 239.16 199.515609 239.16 198.72 C 239.16 197.924391 238.843901 197.16126 238.28132 196.59868 C 237.71874 196.036099 236.955609 195.72 236.16 195.72 C 235.364391 195.72 234.60126 196.036099 234.03868 196.59868 C 233.476099 197.16126 233.16 197.924391 233.16 198.72 C 233.16 199.515609 233.476099 200.27874 234.03868 200.84132 C 234.60126 201.403901 235.364391 201.72 236.16 201.72 z';
const X_AT_2 = 'M 234.66 153.336 L 236.16 151.836 L 237.66 153.336 L 239.16 151.836 L 237.66 150.336 L 239.16 148.836 L 237.66 147.336 L 236.16 148.836 L 234.66 147.336 L 233.16 148.836 L 234.66 150.336 L 233.16 151.836 z';

const POINTS: ScatterPoint[] = [
  { x: 1, y: 1 },
  { x: 1, y: 2 },
  { x: 2, y: 3 },
  { x: 2, y: 4 },
];

function layer(): MaidrLayer {
  return {
    id: 'path-markers',
    type: TraceType.SCATTER,
    title: 'Styled',
    axes: { x: { label: 'x' }, y: { label: 'y' } },
    selectors: 'g#markers > path',
    data: POINTS,
  };
}

function mount(paths: string[]): void {
  document.body.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg"><g id="markers">
      ${paths.map(d => `<path d="${d}"></path>`).join('')}
    </g></svg>`;
}

/** How many markers each x column of the highlight holds. */
function columnSizes(trace: ScatterTrace): number[] | null {
  const columns = (trace as unknown as { highlightXValues: SVGElement[][] | null })
    .highlightXValues;
  return columns?.map(column => column.length) ?? null;
}

describe('a scatter marker drawn as an inline path', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete (SVGElement.prototype as unknown as { getBBox?: unknown }).getBBox;
  });

  test('different shapes at the same x share a column', () => {
    mount([CIRCLE_AT_1, X_AT_1, CIRCLE_AT_2, X_AT_2]);

    const trace = new ScatterTrace(layer());

    expect(columnSizes(trace)).toEqual([2, 2]);
  });

  test('the browser\'s bounding box is used when it has one', () => {
    // Every marker reports a box centred on x = 5, whatever its `d` says.
    (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = function () {
      return { x: 0, y: 0, width: 10, height: 10 } as DOMRect;
    };
    mount([CIRCLE_AT_1, X_AT_1, CIRCLE_AT_2, X_AT_2]);

    const trace = new ScatterTrace(layer());

    expect(columnSizes(trace)).toEqual([4]);
  });

  test('an empty bounding box falls back to the path\'s vertices', () => {
    (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = function () {
      return { x: 0, y: 0, width: 0, height: 0 } as DOMRect;
    };
    mount([CIRCLE_AT_1, X_AT_1, CIRCLE_AT_2, X_AT_2]);

    const trace = new ScatterTrace(layer());

    expect(columnSizes(trace)).toEqual([2, 2]);
  });

  test('an arc-drawn symbol still groups by where it starts', () => {
    // A Highcharts circle is one arc back to (almost) its start. Arcs are not
    // read, so without a browser box the start point is the whole shape, as
    // it always was.
    mount([
      'M 100 50 A 4 4 0 1 1 100.004 50 Z',
      'M 100 80 A 4 4 0 1 1 100.004 80 Z',
      'M 200 30 A 4 4 0 1 1 200.004 30 Z',
      'M 200 10 A 4 4 0 1 1 200.004 10 Z',
    ]);

    const trace = new ScatterTrace(layer());

    expect(columnSizes(trace)).toEqual([2, 2]);
  });
});
