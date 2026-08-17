/**
 * @jest-environment jsdom
 */

/**
 * The per-bar selectors a reordered bar layer emits have to reach the
 * highlight (#990).
 *
 * #988 made a `categoryorder` bar chart announce its bars in the order plotly
 * draws them, and narrowed the layer's one selector into a per-bar list so the
 * highlight would move with them. The list never reached the DOM:
 * `AbstractBarPlot.mapToSvgElements` takes a `string`, and `Svg.selectAllElements`
 * guards with `typeof query === 'string'`, so an array fell straight through to
 * an empty result and the layer reported no highlight at all.
 *
 * That traded a correct highlight for a missing one — better than announcing
 * one bar while outlining another, which is what reordering the data alone
 * would have done, but still a regression against the chart as it was.
 */

import type { MaidrLayer } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

// jsdom exposes no specialised SVG constructors, and `SegmentedTrace` branches
// on `SVGPathElement` before it chunks. Alias path to the real element so the
// string path below is reachable; the array path returns before it gets there.
const globals = globalThis as unknown as Record<string, unknown>;
globals.SVGPathElement = globals.SVGElement;

/** Three bars in the DOM, in the trace's own order: charlie, alpha, bravo. */
function buildBars(): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'points');
  for (const name of ['charlie', 'alpha', 'bravo']) {
    const point = document.createElementNS(SVG_NS, 'g');
    point.setAttribute('class', 'point');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('data-name', name);
    point.appendChild(path);
    group.appendChild(point);
  }
  svg.appendChild(group);
  document.body.appendChild(svg);
}

/** A bar layer announced in drawn order, with per-bar selectors to match. */
function reorderedLayer(): MaidrLayer {
  return {
    id: '0',
    type: TraceType.BAR,
    orientation: Orientation.VERTICAL,
    selectors: [
      '.points .point:nth-child(2) > path',
      '.points .point:nth-child(3) > path',
      '.points .point:nth-child(1) > path',
    ],
    axes: {},
    data: [
      { x: 'alpha', y: 1 },
      { x: 'bravo', y: 2 },
      { x: 'charlie', y: 3 },
    ],
  } as unknown as MaidrLayer;
}

describe('a bar layer whose selectors were narrowed per bar', () => {
  it('still has a highlight', () => {
    buildBars();
    const trace = TraceFactory.create(reorderedLayer()) as unknown as {
      highlightValues: SVGElement[][] | null;
    };

    expect(trace.highlightValues).not.toBeNull();
  });

  it('points each row at the bar its own point announces', () => {
    buildBars();
    const trace = TraceFactory.create(reorderedLayer()) as unknown as {
      highlightValues: SVGElement[][] | null;
    };
    const row = trace.highlightValues?.[0] ?? [];

    // The layer announces alpha, bravo, charlie; the DOM holds charlie,
    // alpha, bravo. So the first announced bar is the second in the DOM.
    expect(row.map(element => element.getAttribute('data-name'))).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ]);
  });
});

describe('a segmented layer handed a selector list', () => {
  it('declines rather than reporting an empty highlight', () => {
    // `SegmentedTrace` infers which element belongs to which cell from one
    // selector — `skipZeros`, row versus column major, and which end a
    // category's series start from. A per-cell list would make all of that
    // unnecessary rather than feed it, so it declines outright (#989 is where
    // honouring one belongs). Pinned because the override takes the widened
    // parameter by bivariance: without the guard an array reaches
    // `selectAllElements`, which answers `[]` for anything but a string, and
    // the decline happens by accident in a helper rather than on purpose here.
    buildBars();
    const layer = {
      id: '0',
      type: TraceType.STACKED,
      orientation: Orientation.VERTICAL,
      selectors: ['.points .point:nth-child(1) > path'],
      axes: {},
      data: [
        [{ x: 'alpha', y: 1, z: 'A' }],
        [{ x: 'alpha', y: 2, z: 'B' }],
      ],
    } as unknown as MaidrLayer;

    const trace = TraceFactory.create(layer) as unknown as {
      highlightValues: SVGElement[][] | null;
    };

    expect(trace.highlightValues).toBeNull();
  });

  it('still resolves a plain selector string', () => {
    // The decline is for lists only; the ordinary path is untouched.
    buildBars();
    const layer = {
      id: '0',
      type: TraceType.STACKED,
      orientation: Orientation.VERTICAL,
      selectors: '.points .point > path',
      axes: {},
      data: [
        [{ x: 'alpha', y: 1, z: 'A' }],
        [{ x: 'bravo', y: 2, z: 'A' }],
        [{ x: 'charlie', y: 3, z: 'A' }],
      ],
    } as unknown as MaidrLayer;

    const trace = TraceFactory.create(layer) as unknown as {
      highlightValues: SVGElement[][] | null;
    };

    expect(trace.highlightValues).not.toBeNull();
  });
});
