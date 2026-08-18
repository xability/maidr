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
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

// jsdom exposes no specialised SVG constructors, and `SegmentedTrace` branches
// on `SVGPathElement` before it chunks. Alias path to the real element so the
// string path below is reachable; the array path returns before it gets there.
const globals = globalThis as unknown as Record<string, unknown>;
globals.SVGPathElement = globals.SVGElement;

// Each case builds its own chart, so the previous one's has to go: two charts
// in the document at once would leave every selector below resolving against
// whichever was appended first.
afterEach(() => {
  document.body.innerHTML = '';
});

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

describe('a segmented layer handed a flat selector list', () => {
  it('declines rather than reporting an empty highlight', () => {
    // A flat list says which bars there are but not which cell each one is
    // in, and the chunking is exactly what would have to answer that — so it
    // is declined, while the grid below is honoured. Pinned because the
    // override takes the widened parameter by bivariance: without the guard an
    // array reaches `selectAllElements`, which answers `[]` for anything but a
    // string, and the decline happens by accident in a helper rather than on
    // purpose here.
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

/** Two series of three bars each, in the trace's own order per group. */
function buildGroups(): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', 'barlayer');
  for (const series of ['A', 'B']) {
    const trace = document.createElementNS(SVG_NS, 'g');
    trace.setAttribute('class', 'trace bars');
    const points = document.createElementNS(SVG_NS, 'g');
    points.setAttribute('class', 'points');
    for (const name of ['charlie', 'alpha', 'bravo']) {
      const point = document.createElementNS(SVG_NS, 'g');
      point.setAttribute('class', 'point');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('data-name', `${series}-${name}`);
      point.appendChild(path);
      points.appendChild(point);
    }
    trace.appendChild(points);
    layer.appendChild(trace);
  }
  svg.appendChild(layer);
  document.body.appendChild(svg);
}

/**
 * The cell in one group of the DOM built above, counting from one.
 * @param group - Which trace group
 * @param point - Which point within it
 * @returns The selector naming that one bar
 */
function cell(group: number, point: number): string {
  return `.barlayer > g.trace.bars:nth-of-type(${group})`
    + ` > g.points > g.point:nth-of-type(${point}) > path`;
}

/**
 * A stacked layer announced in drawn order, with a per-cell selector grid.
 * @returns The layer
 */
function griddedLayer(): MaidrLayer {
  return {
    id: '0',
    type: TraceType.STACKED,
    orientation: Orientation.VERTICAL,
    // The DOM holds charlie, alpha, bravo; the layer announces alpha, bravo,
    // charlie, so each row names its group's 2nd, 3rd and 1st point.
    selectors: [
      [cell(1, 2), cell(1, 3), cell(1, 1)],
      [cell(2, 2), cell(2, 3), cell(2, 1)],
    ],
    axes: {},
    data: [
      [
        { x: 'alpha', y: 1, z: 'A' },
        { x: 'bravo', y: 2, z: 'A' },
        { x: 'charlie', y: 3, z: 'A' },
      ],
      [
        { x: 'alpha', y: 10, z: 'B' },
        { x: 'bravo', y: 20, z: 'B' },
        { x: 'charlie', y: 30, z: 'B' },
      ],
    ],
  } as unknown as MaidrLayer;
}

/**
 * The trace a layer builds, opened up enough to read its highlight.
 * @param layer - The layer to build from
 * @returns The trace
 */
function highlightOf(layer: MaidrLayer): SVGElement[][] | null {
  const trace = TraceFactory.create(layer) as unknown as {
    highlightValues: SVGElement[][] | null;
  };
  return trace.highlightValues;
}

describe('a segmented layer handed a selector grid', () => {
  it('resolves every cell', () => {
    // Also what says the summary row is not among the rows counted:
    // `createSummaryLevel` appends one after `super()` returns, so a grid is
    // matched against the two series alone. Were the count taken after, this
    // two-row grid would be one row short and withdrawn.
    buildGroups();

    expect(highlightOf(griddedLayer())).not.toBeNull();
  });

  it('points each cell at the bar its own point announces', () => {
    buildGroups();
    const highlight = highlightOf(griddedLayer()) ?? [];

    expect(highlight.map(row => row.map(el => el.getAttribute('data-name')))).toEqual([
      ['A-alpha', 'A-bravo', 'A-charlie'],
      ['B-alpha', 'B-bravo', 'B-charlie'],
    ]);
  });

  it('declines a grid that leaves a series out', () => {
    // The one case only the row count catches. A short grid otherwise
    // resolves as far as it goes and returns, leaving the series past its end
    // with no row at all — a highlight that works for the first series and
    // silently does nothing for the rest.
    buildGroups();
    const layer = griddedLayer();
    (layer as { selectors: string[][] }).selectors.pop();

    expect(highlightOf(layer)).toBeNull();
  });

  it('declines a grid whose row is the wrong length', () => {
    buildGroups();
    const layer = griddedLayer();
    (layer as { selectors: string[][] }).selectors[1] = [cell(2, 1)];

    expect(highlightOf(layer)).toBeNull();
  });

  it('declines outright when one cell names nothing', () => {
    // Half a highlight reads as "this bar has no mark" rather than as a
    // failure, so one unresolvable cell withdraws the whole grid.
    buildGroups();
    const layer = griddedLayer();
    (layer as { selectors: string[][] }).selectors[1][2] = '.nothing-here';

    expect(highlightOf(layer)).toBeNull();
  });

  it('leaves no clones behind when it declines', () => {
    // The resolved cells are hidden clones inserted next to the originals.
    // Abandoning them would leave a chart carrying copies of its own bars for
    // every layer that failed to resolve.
    buildGroups();
    const before = document.querySelectorAll('path').length;
    const layer = griddedLayer();
    (layer as { selectors: string[][] }).selectors[1][2] = '.nothing-here';
    highlightOf(layer);

    expect(document.querySelectorAll('path').length).toBe(before);
  });
});

/**
 * The DOM a plotly panel builds when a histogram shares its `barlayer`:
 * the histogram's group first, then the two bar traces, each holding its own
 * points in its trace's order.
 */
function buildWithHistogram(): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const barlayer = document.createElementNS(SVG_NS, 'g');
  barlayer.setAttribute('class', 'barlayer');
  const groups: [string, string[]][] = [
    ['H', ['bin1', 'bin2']],
    ['A', ['charlie', 'alpha', 'bravo']],
    ['B', ['charlie', 'alpha', 'bravo']],
  ];
  for (const [series, names] of groups) {
    const trace = document.createElementNS(SVG_NS, 'g');
    trace.setAttribute('class', 'trace bars');
    const points = document.createElementNS(SVG_NS, 'g');
    points.setAttribute('class', 'points');
    for (const name of names) {
      const point = document.createElementNS(SVG_NS, 'g');
      point.setAttribute('class', 'point');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('data-name', `${series}-${name}`);
      point.appendChild(path);
      points.appendChild(point);
    }
    trace.appendChild(points);
    barlayer.appendChild(trace);
  }
  svg.appendChild(barlayer);
  document.body.appendChild(svg);
}

/** The selector naming one whole `barlayer` group, counting from one. */
function groupSelector(position: number): string {
  return `.barlayer > g.trace.bars:nth-of-type(${position}) .point > path`;
}

/**
 * A two-series stacked layer over the DOM above, carrying the selector it is
 * handed.
 * @param selectors - What the adapter emitted
 * @returns The layer
 */
function stackedOver(selectors: string): MaidrLayer {
  return {
    id: '0',
    type: TraceType.STACKED,
    orientation: Orientation.VERTICAL,
    selectors,
    axes: {},
    data: [
      [
        { x: 'charlie', y: 3, z: 'A' },
        { x: 'alpha', y: 1, z: 'A' },
        { x: 'bravo', y: 2, z: 'A' },
      ],
      [
        { x: 'charlie', y: 30, z: 'B' },
        { x: 'alpha', y: 10, z: 'B' },
        { x: 'bravo', y: 20, z: 'B' },
      ],
    ],
  } as unknown as MaidrLayer;
}

describe('a segmented layer whose selector lists the groups it covers', () => {
  it('chunks each series onto its own trace group', () => {
    // The shape the plotly adapter emits once its selector is scoped (#993).
    // `querySelectorAll` answers a selector list in document order, so the
    // chunking lands series 0 on the first group listed.
    buildWithHistogram();
    const highlight = highlightOf(
      stackedOver(`${groupSelector(2)}, ${groupSelector(3)}`),
    ) ?? [];

    expect(highlight.map(row => row.map(el => el.getAttribute('data-name')))).toEqual([
      ['A-charlie', 'A-alpha', 'A-bravo'],
      ['B-charlie', 'B-alpha', 'B-bravo'],
    ]);
  });

  it('chunks a panel-wide selector blind, which is why one must not be sent', () => {
    // Not a bug in the chunking: it is handed a flat list and told the layer
    // owns all of it, and nothing in that list says which group an element
    // came from. That is exactly why the adapter has to scope (#993) — named
    // panel-wide, the histogram's two bins sat at the head and every cell
    // shifted by two, announcing series A at 'charlie' while outlining the
    // histogram's first bin. Pinned so a later attempt to make the model
    // clever about this turns red here and reads the reason.
    buildWithHistogram();
    const highlight = highlightOf(stackedOver('.trace.bars .point > path')) ?? [];

    expect(highlight.map(row => row.map(el => el.getAttribute('data-name')))).toEqual([
      ['H-bin1', 'H-bin2', 'A-charlie'],
      ['A-alpha', 'A-bravo', 'B-charlie'],
    ]);
  });
});
