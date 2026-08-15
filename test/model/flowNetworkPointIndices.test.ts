/**
 * @jest-environment jsdom
 */

import type { FlowPoint, MaidrLayer, NetworkPoint } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { FlowTrace } from '@model/flow';
import { NetworkTrace } from '@model/network';
import { TraceType } from '@type/grammar';
import { isPointCloudHighlightable } from '@type/navigation';

/**
 * A flow and a network trace name the mark they highlighted (#904).
 *
 * amCharts renders to canvas, so a sankey, chord, alluvial or network layer has
 * no SVG elements for `selectors` to reach and its only path to an overlay is
 * the navigate callback. Reconstructing the node from `{row, col}` would mean
 * copying `FlowTrace`'s stage layering or `NetworkTrace`'s component walk into
 * an adapter, where it drifts silently — so the trace publishes the mark
 * instead, as an index into the `data` array the adapter supplied.
 *
 * **The whole risk is that it publishes a wider set than the SVG path
 * outlines.** A node touches every flow on either side of it, but
 * `mapToSvgElements` outlines exactly one of them. Publishing
 * `[...node.out, ...node.in]` would put amCharts' overlay on every ribbon
 * touching a node while Vega-Lite outlined one — the two renderers disagreeing
 * about the same trace at the same cursor position, which looks right and is
 * not. Every test below compares the two channels rather than either alone.
 */

/**
 * Five flows through six nodes, declared out of value order.
 *
 * The declared order matters twice over. Every node sorts its edges by value on
 * construction, so a chart authored largest-first could not tell a correct
 * pairing from one that re-derived a position from the sorted list. And
 * `Electricity` carries flows on *both* sides — one arriving, two leaving — so
 * it is the node where the wider set and the outlined ribbon differ.
 */
const FLOWS: FlowPoint[] = [
  { source: 'Coal', target: 'Losses', value: 8 },
  { source: 'Coal', target: 'Electricity', value: 34 },
  { source: 'Coal', target: 'Heat', value: 14 },
  { source: 'Electricity', target: 'Homes', value: 20 },
  { source: 'Electricity', target: 'Industry', value: 14 },
];

/**
 * A hub, its three neighbours, and a node linked to nobody.
 *
 * Declared so that the hub's most connected neighbour is not the first link
 * authored, for the same reason the flows are.
 */
const LINKS: NetworkPoint[] = [
  { source: 'Ada', target: 'Edsger' },
  { source: 'Ada', target: 'Grace' },
  { source: 'Ada', target: 'Alan' },
  { source: 'Grace', target: 'Alan' },
  { source: 'Ida', target: 'Ida' },
];

/** How a ribbon or a line is named in the DOM, from the record that drew it. */
function nameOf(point: FlowPoint | NetworkPoint): string {
  return `${String(point.source)}-${String(point.target)}`;
}

/**
 * Create a flow layer whose selectors name each ribbon by its own flow.
 * @returns Flow layer definition
 */
function flowLayer(): MaidrLayer {
  return {
    id: 'flow-indices',
    type: TraceType.SANKEY,
    title: 'Energy flow',
    axes: { x: { label: 'Node' }, y: { label: 'Petajoules' } },
    selectors: FLOWS.map((_, index) => `#ribbon-${index}`),
    data: FLOWS,
  };
}

/**
 * Create a network layer whose selectors name each line by its own link.
 * @returns Network layer definition
 */
function networkLayer(): MaidrLayer {
  return {
    id: 'network-indices',
    type: TraceType.NETWORK,
    title: 'Collaborations',
    axes: { x: { label: 'Person' }, y: { label: 'Links' } },
    selectors: LINKS.map((_, index) => `#link-${index}`),
    data: LINKS,
  };
}

/** Paint the ribbons and lines the two layers declare selectors for. */
function paintChart(): void {
  const ribbons = FLOWS
    .map((flow, index) => `<path id="ribbon-${index}" data-mark="${nameOf(flow)}" />`)
    .join('');
  const lines = LINKS
    .map((link, index) => `<line id="link-${index}" data-mark="${nameOf(link)}" />`)
    .join('');
  document.body.innerHTML
    = `<svg xmlns="http://www.w3.org/2000/svg">${ribbons}${lines}</svg>`;
}

/**
 * What the SVG channel outlines, named by the record each mark was drawn for.
 *
 * The elements are MAIDR's hidden clones rather than the originals, so they are
 * read by the attribute they carry rather than by identity — which is also how
 * a reader would tell which ribbon lit up.
 *
 * @param trace - The trace to read
 * @returns One name per outlined mark, in the order the state lists them
 */
function svgMarks(trace: FlowTrace | NetworkTrace): string[] {
  const state = trace.state;
  if (state.empty || state.highlight.empty) {
    return [];
  }
  const { elements } = state.highlight;
  const flat = Array.isArray(elements) ? elements.flat() : [elements];
  return flat
    .map(element => element?.getAttribute('data-mark'))
    .filter((name): name is string => name !== null && name !== undefined);
}

/**
 * What the canvas channel publishes, named the same way.
 *
 * This is the inversion an adapter performs: an index arrives, and the adapter
 * looks it up in the `data` array it supplied. Doing it here rather than
 * reaching for the DOM is the point — the index has to mean something against
 * `layer.data`, not against a selector list a canvas chart does not have.
 *
 * @param trace - The trace to read
 * @param data - The records the layer was built from
 * @returns One name per published index, in the order they were published
 */
function canvasMarks(
  trace: FlowTrace | NetworkTrace,
  data: readonly (FlowPoint | NetworkPoint)[],
): string[] {
  return [...trace.highlightedPointIndices].map((index) => {
    const record = data[index];
    if (record === undefined) {
      throw new Error(`Published index ${index} is not a record of this layer`);
    }
    return nameOf(record);
  });
}

/**
 * Walk every addressable cell of a trace, comparing the two channels at each.
 *
 * @param trace - The trace to walk
 * @param data - The records the layer was built from
 * @param rows - How many rows to try
 * @param cols - How many columns to try
 * @returns The cells that were reachable, so a caller can assert it walked some
 */
function walkAgreeing(
  trace: FlowTrace | NetworkTrace,
  data: readonly (FlowPoint | NetworkPoint)[],
  rows: number,
  cols: number,
): { row: number; col: number; marks: string[] }[] {
  const visited: { row: number; col: number; marks: string[] }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!trace.moveToIndex(row, col)) {
        continue;
      }
      const svg = svgMarks(trace);
      // The claim of #904, at one cursor position: the canvas overlay and the
      // SVG outline cover the same marks. A wider published set passes every
      // assertion that reads one channel and fails only this one.
      expect(canvasMarks(trace, data)).toEqual(svg);
      visited.push({ row, col, marks: svg });
    }
  }
  return visited;
}

describe('a flow trace publishes the ribbon it highlighted', () => {
  beforeEach(paintChart);

  test('it announces itself as naming its own marks', () => {
    const trace = new FlowTrace(flowLayer());

    // The guard is what `createNavigateObserver` feature-tests on, so failing
    // it means the trace is silently back on the braille-position path.
    expect(isPointCloudHighlightable(trace)).toBe(true);
  });

  test('the canvas and the SVG channels agree at every position', () => {
    const trace = new FlowTrace(flowLayer());

    // Six nodes over three stages, so the grid is larger than either.
    const visited = walkAgreeing(trace, FLOWS, 6, 6);

    // The walk has to have gone somewhere, or the comparison above proved
    // nothing at all.
    expect(visited.length).toBe(6);
    expect(visited.every(cell => cell.marks.length === 1)).toBe(true);
  });

  test('a node with flows on both sides publishes one ribbon, not all of them', () => {
    // Electricity receives Coal-Electricity (34, the widest ribbon on the
    // chart) and sends Electricity-Homes (20) and Electricity-Industry (14).
    // `[...node.out, ...node.in]` would publish all three, and an adapter
    // reading it would light the whole junction up while an SVG renderer lit
    // one band — the disagreement #904 exists to prevent.
    const trace = new FlowTrace(flowLayer());
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }
    expect(state.text.main.value).toBe('Electricity');

    expect(canvasMarks(trace, FLOWS)).toEqual(['Electricity-Homes']);
    expect(canvasMarks(trace, FLOWS)).toEqual(svgMarks(trace));
  });

  test('a sink publishes the ribbon that reaches it', () => {
    // A node with nothing leaving it falls back to the widest thing arriving,
    // which is what the SVG path settles on too.
    const trace = new FlowTrace(flowLayer());
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }
    expect(state.text.main.value).toBe('Homes');

    expect(canvasMarks(trace, FLOWS)).toEqual(['Electricity-Homes']);
    expect(canvasMarks(trace, FLOWS)).toEqual(svgMarks(trace));
  });

  test('nothing is published before the cursor has entered', () => {
    const trace = new FlowTrace(flowLayer());

    // The inherited `highlight` reports out of bounds until the first move, so
    // publishing a ribbon here would outline one before the reader arrived.
    expect(svgMarks(trace)).toEqual([]);
    expect(canvasMarks(trace, FLOWS)).toEqual([]);
  });
});

describe('a network trace publishes the line it highlighted', () => {
  beforeEach(paintChart);

  test('it announces itself as naming its own marks', () => {
    const trace = new NetworkTrace(networkLayer());

    expect(isPointCloudHighlightable(trace)).toBe(true);
  });

  test('the canvas and the SVG channels agree at every position', () => {
    const trace = new NetworkTrace(networkLayer());

    // Four linked nodes in one component and Ida alone in another.
    const visited = walkAgreeing(trace, LINKS, 4, 4);

    expect(visited.length).toBe(5);
    // Ida is isolated, so exactly one visited cell names no line — and it must
    // name none on both channels rather than borrowing somebody else's.
    expect(visited.filter(cell => cell.marks.length === 0).length).toBe(1);
  });

  test('a hub publishes one line, not every line it touches', () => {
    // Ada is linked to Edsger, Grace and Alan. Publishing all three would
    // light the hub's whole neighbourhood while an SVG renderer lit the single
    // line `mapToSvgElements` chose — the same disagreement as the sankey's.
    const trace = new NetworkTrace(networkLayer());
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }
    expect(state.text.main.value).toBe('Ada');

    // Sorted by degree, Ada's first neighbour is Grace, drawn by link 1 — not
    // link 0, which a pairing by rank would have taken.
    expect(canvasMarks(trace, LINKS)).toEqual(['Ada-Grace']);
    expect(canvasMarks(trace, LINKS)).toEqual(svgMarks(trace));
  });

  test('an isolated node publishes nothing rather than somebody else’s line', () => {
    const trace = new NetworkTrace(networkLayer());
    trace.moveOnce('FORWARD');
    trace.moveOnce('UPWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }
    expect(state.text.main.value).toBe('Ida');

    expect(canvasMarks(trace, LINKS)).toEqual([]);
    expect(svgMarks(trace)).toEqual([]);
  });

  test('nothing is published before the cursor has entered', () => {
    const trace = new NetworkTrace(networkLayer());

    expect(svgMarks(trace)).toEqual([]);
    expect(canvasMarks(trace, LINKS)).toEqual([]);
  });
});
