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

/** Two samples, each an estimate with a bound either side. */
const SAMPLES: ErrorBarPoint[] = [
  { x: 'a', y: 4, yMin: 3.6, yMax: 4.8 },
  { x: 'b', y: 6, yMin: 5.1, yMax: 6.4 },
];

/**
 * A whip as Recharts draws one with `direction="y"`: the top cap, the
 * whisker, the bottom cap, each tagged with the part it is.
 *
 * @param at - Where the whisker stands on x
 * @param top - Where the upper bound is drawn on y
 * @param bottom - Where the lower bound is drawn on y
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
 * @returns The layer
 */
function layer(type: TraceType = TraceType.ERROR_BAR, orientation?: Orientation): MaidrLayer {
  return {
    id: 'whips',
    type,
    axes: { x: { label: 'Group' }, y: { label: 'Score' } },
    selectors: '#chart > g.whip',
    ...(orientation === undefined ? {} : { orientation }),
    data: SAMPLES,
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
  return SAMPLES.map((_, col) => [0, 1, 2].map((row) => {
    trace.moveToIndex(row, col);
    return outlined(trace.state);
  }));
}

describe('an error bar\'s bounds outlined as their own caps', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('outlines the bottom cap at the lower bound and the top cap at the upper', () => {
    draw([verticalWhip(100, 52, 80), verticalWhip(200, 30, 61)]);

    expect(outlines(layer())).toEqual([
      ['bottom', 'g', 'top'],
      ['bottom', 'g', 'top'],
    ]);
  });

  it('reads a horizontal whip by its own whisker: the left cap is the lower bound', () => {
    // A forest plot's intervals run along x, which Recharts draws with
    // `direction="x"`.
    draw([horizontalWhip(40, 120, 180), horizontalWhip(80, 150, 210)]);

    expect(outlines(layer(TraceType.FOREST, Orientation.HORIZONTAL))).toEqual([
      ['left', 'g', 'right'],
      ['left', 'g', 'right'],
    ]);
  });

  it('outlines the whole whip on every section when it is not cap, whisker and cap', () => {
    // One path for the whole whip, and a group of four lines: neither has a
    // mark of its own for one bound.
    draw([
      '<g class="whip"><path d="M 95 52 L 105 52 M 100 52 L 100 80 M 95 80 L 105 80" /></g>',
      `<g class="whip">${'<line x1="200" y1="30" x2="200" y2="61" />'.repeat(4)}</g>`,
    ]);

    expect(outlines(layer())).toEqual([
      ['g', 'g', 'g'],
      ['g', 'g', 'g'],
    ]);
  });

  it('outlines the whole whip when its three lines do not meet as cap, whisker and cap', () => {
    // A cap at the same end as the other, so neither is the lower bound's.
    draw([
      `<g class="whip">
        <line x1="95" y1="52" x2="105" y2="52" />
        <line x1="100" y1="80" x2="100" y2="52" />
        <line x1="95" y1="52" x2="105" y2="52" />
      </g>`,
      verticalWhip(200, 30, 61),
    ]);

    expect(outlines(layer())).toEqual([
      ['g', 'g', 'g'],
      ['bottom', 'g', 'top'],
    ]);
  });
});
