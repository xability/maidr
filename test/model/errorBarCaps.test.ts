/**
 * @jest-environment jsdom
 */

/**
 * An error bar's bounds outlined as their own caps.
 *
 * A layer names one element per sample. Recharts draws each `<ErrorBar>`
 * sample as a group of exactly three lines -- for a vertical bar the top
 * cap, the whisker and the bottom cap, and for a horizontal one the right
 * cap, the whisker and the left cap -- and every bound used to outline that
 * whole group: moving from the estimate to a bound changed what was
 * announced and nothing on the chart.
 */

import type { ErrorBarPoint, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Three samples, each an estimate with a bound either side. No interval lies
 * within another, so the order the caps are drawn in says which way the value
 * axis grows.
 */
const SAMPLES: ErrorBarPoint[] = [
  { x: 'a', y: 4, yMin: 3.6, yMax: 4.8 },
  { x: 'b', y: 6, yMin: 5.1, yMax: 6.4 },
  { x: 'c', y: 3, yMin: 2.2, yMax: 3.4 },
];

/**
 * Where a value is drawn on y, up the page as a value axis usually grows.
 *
 * @param value - The value
 * @returns Its y
 */
function upward(value: number): number {
  return 200 - 20 * value;
}

/**
 * Where a value is drawn on x, rightwards as a value axis usually grows.
 *
 * @param value - The value
 * @returns Its x
 */
function rightward(value: number): number {
  return 50 + 20 * value;
}

/**
 * A whip as Recharts draws one with `direction="y"`: the top cap, the
 * whisker, the bottom cap, each tagged with the part it is.
 *
 * @param at - Where the whisker stands on x
 * @param top - Where the cap higher up the page is drawn on y
 * @param bottom - Where the cap lower down is drawn on y
 * @returns The group's markup
 */
function verticalWhip(at: number, top: number, bottom: number): string {
  return `<g class="whip">
    <line data-part="top" x1="${at - 5}" y1="${top}" x2="${at + 5}" y2="${top}" />
    <line data-part="whisker" x1="${at}" y1="${bottom}" x2="${at}" y2="${top}" />
    <line data-part="bottom" x1="${at - 5}" y1="${bottom}" x2="${at + 5}" y2="${bottom}" />
  </g>`;
}

/**
 * Every sample's whip, drawn with `direction="y"` on a value axis that puts
 * each value where `place` says.
 *
 * @param place - Where a value is drawn on y
 * @param points - The samples
 * @returns Each whip's markup, in order
 */
function verticalWhips(place: (value: number) => number, points: ErrorBarPoint[] = SAMPLES): string[] {
  return points.map((point, col) => {
    const ends = [place(point.yMin ?? 0), place(point.yMax ?? 0)];
    return verticalWhip(100 * (col + 1), Math.min(...ends), Math.max(...ends));
  });
}

/**
 * A whip as Recharts draws one with `direction="x"`: the right cap, the
 * whisker, the left cap.
 *
 * @param at - Where the whisker lies on y
 * @param left - Where the lower bound is drawn on x
 * @param right - Where the upper bound is drawn on x
 * @returns The group's markup
 */
function horizontalWhip(at: number, left: number, right: number): string {
  return `<g class="whip">
    <line data-part="right" x1="${right}" y1="${at + 5}" x2="${right}" y2="${at - 5}" />
    <line data-part="whisker" x1="${left}" y1="${at}" x2="${right}" y2="${at}" />
    <line data-part="left" x1="${left}" y1="${at + 5}" x2="${left}" y2="${at - 5}" />
  </g>`;
}

/**
 * Puts the whips in the document.
 *
 * @param whips - Each sample's markup, in order
 */
function draw(whips: string[]): void {
  document.body.innerHTML = `<svg id="chart">${whips.join('')}</svg>`;
}

/**
 * An error bar or forest layer over the samples, naming one group per sample.
 *
 * @param type - Which of the two interval types
 * @param orientation - Which way the intervals run
 * @param data - The samples
 * @returns The layer
 */
function layer(type: TraceType = TraceType.ERROR_BAR, orientation?: Orientation, data: ErrorBarPoint[] = SAMPLES): MaidrLayer {
  return {
    id: 'whips',
    type,
    axes: { x: { label: 'Group' }, y: { label: 'Score' } },
    selectors: '#chart > g.whip',
    ...(orientation === undefined ? {} : { orientation }),
    data,
  };
}

/**
 * What the outline is on: the part a line is tagged as, or the tag of a mark
 * that is not one of the lines.
 *
 * @param state - The trace state
 * @returns The part outlined, or null when nothing is
 */
function outlined(state: TraceState): string | null {
  if (state.empty || state.highlight.empty) {
    return null;
  }
  const element = Array.isArray(state.highlight.elements) ? state.highlight.elements[0] : state.highlight.elements;
  return element.getAttribute('data-part') ?? element.tagName.toLowerCase();
}

/**
 * The outline at every section of every sample, rows bottom to top.
 *
 * @param source - The layer to read
 * @returns For each sample, the lower bound's, the estimate's and the upper bound's outline
 */
function outlines(source: MaidrLayer): (string | null)[][] {
  const trace = TraceFactory.create(source);
  return (source.data as ErrorBarPoint[]).map((_, col) => [0, 1, 2].map((row) => {
    trace.moveToIndex(row, col);
    return outlined(trace.state);
  }));
}

describe('an error bar\'s bounds outlined as their own caps', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('outlines the bottom cap at the lower bound and the top cap at the upper', () => {
    draw(verticalWhips(upward));

    expect(outlines(layer())).toEqual([
      ['bottom', 'g', 'top'],
      ['bottom', 'g', 'top'],
      ['bottom', 'g', 'top'],
    ]);
  });

  it('reads a horizontal whip by its own whisker: the left cap is the lower bound', () => {
    // A forest plot's intervals run along x, which Recharts draws with
    // `direction="x"`.
    draw(SAMPLES.map((point, row) => horizontalWhip(40 * (row + 1), rightward(point.yMin ?? 0), rightward(point.yMax ?? 0))));

    expect(outlines(layer(TraceType.FOREST, Orientation.HORIZONTAL))).toEqual([
      ['left', 'g', 'right'],
      ['left', 'g', 'right'],
      ['left', 'g', 'right'],
    ]);
  });

  // The first sample, 3.6 to 4.8, is drawn from y 128 up to y 104.
  it.each([
    ['one path', '<g class="whip"><path d="M 95 104 L 105 104 M 100 104 L 100 128 M 95 128 L 105 128" /></g>'],
    ['four lines', `<g class="whip">${'<line x1="100" y1="104" x2="100" y2="128" />'.repeat(4)}</g>`],
    [
      'two lines and the estimate\'s own mark',
      '<g class="whip"><line x1="95" y1="104" x2="105" y2="104" /><line x1="100" y1="128" x2="100" y2="104" /><circle cx="100" cy="120" r="3" /></g>',
    ],
    [
      'three lines whose caps sit at one end',
      '<g class="whip"><line x1="95" y1="104" x2="105" y2="104" /><line x1="100" y1="128" x2="100" y2="104" /><line x1="95" y1="104" x2="105" y2="104" /></g>',
    ],
    ['cap, whisker and cap, one line moved by a transform', verticalWhip(100, 104, 128).replace('data-part="top"', 'data-part="top" transform="translate(0 24)"')],
    ['cap, whisker and cap in a group with a transform', verticalWhip(100, 104, 128).replace('class="whip"', 'class="whip" transform="translate(0 10)"')],
  ])('outlines the whole whip on every section when it is %s', (_, odd) => {
    draw([odd, ...verticalWhips(upward).slice(1)]);

    expect(outlines(layer())).toEqual([
      ['g', 'g', 'g'],
      ['bottom', 'g', 'top'],
      ['bottom', 'g', 'top'],
    ]);
  });

  it('outlines the whole whip on a value axis drawn reversed', () => {
    // `<YAxis reversed>` draws larger values further down, so the bottom cap
    // is the upper bound's. Read as on an axis growing up, the outline would
    // sit on the upper bound's cap while the lower bound is announced.
    draw(verticalWhips(value => 20 * value));

    expect(outlines(layer())).toEqual([
      ['g', 'g', 'g'],
      ['g', 'g', 'g'],
      ['g', 'g', 'g'],
    ]);
  });

  it('outlines the whole whip when the caps cannot tell which way the axis grows', () => {
    // Each interval lies within the next, which an axis drawn either way
    // would put in order.
    const nested: ErrorBarPoint[] = [
      { x: 'a', y: 5, yMin: 3, yMax: 7 },
      { x: 'b', y: 5, yMin: 4, yMax: 6 },
      { x: 'c', y: 5, yMin: 4.5, yMax: 5.5 },
    ];
    draw(verticalWhips(upward, nested));

    expect(outlines(layer(TraceType.ERROR_BAR, undefined, nested))).toEqual([
      ['g', 'g', 'g'],
      ['g', 'g', 'g'],
      ['g', 'g', 'g'],
    ]);
  });
});
