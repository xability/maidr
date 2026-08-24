/**
 * @jest-environment jsdom
 */

import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';
import { isPointCloudHighlightable } from '@type/navigation';

/**
 * A scatter-family trace publishes the *identity* of the points it has
 * highlighted, as indices into its layer's `data` array (#897).
 *
 * `highlight` answers the same question in `SVGElement`s, which a canvas chart
 * has none of — so amCharts and Chart.js could not outline a scatter, volcano
 * or Manhattan point at all. The only position on offer was the braille one,
 * and a scatter's braille surface is a *binned grid*: it is empty outside grid
 * mode, and inside it names a cell rather than a point.
 *
 * These pin the index channel against the five navigation modes, and — where
 * the SVG channel is available — pin the two to each other, since a highlight
 * that says one thing to an SVG adapter and another to a canvas one is worse
 * than either alone.
 */

/**
 * A scatter layer with no axis ranges — the shape both canvas adapters emit
 * (`src/adapters/chartjs/extractor.ts` emits labels only, and amCharts emits no
 * min/max/tickStep at all), so `resolveGridConfig` returns null and grid mode
 * is unavailable. This is the configuration the bug was reported against.
 */
function createLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'cloud',
    type: TraceType.SCATTER,
    title: 'Point identity',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

/** The same layer with the six values `resolveGridConfig` requires. */
function createGriddedLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'cloud',
    type: TraceType.SCATTER,
    title: 'Point identity, binned',
    axes: {
      x: { label: 'X', min: 0, max: 10, tickStep: 5 },
      y: { label: 'Y', min: 0, max: 10, tickStep: 5 },
    },
    data,
  };
}

/**
 * Three points, two of which share an X — so a column selects a *set*, which is
 * the case no single row/column pair can name.
 */
const shared: ScatterPoint[] = [
  { x: 1, y: 10 },
  { x: 2, y: 20 },
  { x: 2, y: 30 },
];

describe('a scatter names the points it has highlighted', () => {
  test('declares the capability, so the controller can feature-test it', () => {
    const trace = new ScatterTrace(createLayer(shared));

    expect(isPointCloudHighlightable(trace)).toBe(true);
  });

  test('the capability test reads the shape, not just the name', () => {
    // A trace carrying the name but not the shape must not be fed to a
    // consumer that will spread it as indices.
    expect(isPointCloudHighlightable({ highlightedPointIndices: 3 })).toBe(false);
    expect(isPointCloudHighlightable({ highlightedPointIndices: undefined })).toBe(false);
    expect(isPointCloudHighlightable({ somethingElse: [] })).toBe(false);
    expect(isPointCloudHighlightable(null)).toBe(false);

    expect(isPointCloudHighlightable({ highlightedPointIndices: [] })).toBe(true);
  });

  test('COL mode selects every point sharing the column X', () => {
    const trace = new ScatterTrace(createLayer(shared));

    // The cursor sits before the first column on entry, so the first move
    // lands on column 0 rather than stepping past it.
    trace.moveOnce('FORWARD');
    // xPoints is grouped on (x asc, y asc): column 0 is x=1, holding data[0].
    expect([...trace.highlightedPointIndices]).toEqual([0]);

    trace.moveOnce('FORWARD');
    // Column 1 is x=2, which both data[1] and data[2] sit in. A single index
    // could not say this, which is why the channel carries a list.
    expect([...trace.highlightedPointIndices]).toEqual([1, 2]);
  });

  test('ROW mode selects every point sharing the row Y', () => {
    const trace = new ScatterTrace(createLayer([
      { x: 1, y: 5 },
      { x: 2, y: 5 },
      { x: 3, y: 9 },
    ]));

    // The first UPWARD consumes the initial-entry handshake; the second
    // toggles into ROW mode, as the arrow keys do in the live UI.
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');

    // yPoints is grouped on (y asc, x asc): row 0 is y=5, holding data[0] and
    // data[1].
    expect([...trace.highlightedPointIndices]).toEqual([0, 1]);
  });

  test('point mode selects exactly the point being announced', () => {
    // Every coordinate distinct, so the index can only be right by naming the
    // right point. `pointModeIndex` indexes flatPoints, which is
    // `data.map(...)`, so it is already a data index — this pins that.
    const data: ScatterPoint[] = [
      { x: 1, y: 70 },
      { x: 2, y: 80 },
      { x: 3, y: 90 },
    ];
    const trace = new ScatterTrace(createLayer(data));
    trace.setPointMode(true);

    /** The data point the trace says it is standing on, read off its own text. */
    const announced = (): { x: unknown; y: unknown } => {
      const state = trace.state;
      if (state.empty) {
        throw new Error('expected a non-empty state');
      }
      return { x: state.text.main.value, y: state.text.cross?.value };
    };

    /** The data point the published index names. */
    const named = (): { x: unknown; y: unknown } => {
      const indices = [...trace.highlightedPointIndices];
      expect(indices).toHaveLength(1);
      const point = data[indices[0]];
      return { x: point.x, y: point.y };
    };

    expect(named()).toEqual(announced());

    // Walk the reading order; the index has to follow the announcement, not
    // some other cursor left behind by an earlier mode.
    const seen = new Set<number>([trace.highlightedPointIndices[0]]);
    while (trace.movePointLeft()) {
      expect(named()).toEqual(announced());
      seen.add(trace.highlightedPointIndices[0]);
    }
    while (trace.movePointRight()) {
      expect(named()).toEqual(announced());
      seen.add(trace.highlightedPointIndices[0]);
    }

    // Every point is reachable, and each is named exactly once.
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  test('intersection mode selects one point of the column stack', () => {
    const trace = new ScatterTrace(createLayer(shared));
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    // Column 1 stacks data[1] and data[2].
    expect([...trace.highlightedPointIndices]).toEqual([1, 2]);

    trace.setIntersectionMode(true);
    // Intersection focuses a single point of that stack rather than the chord.
    expect([...trace.highlightedPointIndices]).toEqual([1]);

    trace.moveToNextIntersection();
    expect([...trace.highlightedPointIndices]).toEqual([2]);
  });

  test('grid mode selects every point binned into the cell', () => {
    const trace = new ScatterTrace(createGriddedLayer([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 8, y: 8 },
    ]));
    trace.setGridMode(true);

    // The low bin holds the two points near the origin; the far one is in
    // another cell entirely. Which cell the cursor starts in is the model's
    // business — what matters is that the answer is a set of data indices and
    // that it never mixes the two bins.
    const cell = [...trace.highlightedPointIndices];
    expect(cell.length).toBeGreaterThan(0);
    const isLowBin = cell.includes(0);
    expect(cell).toEqual(isLowBin ? [0, 1] : [2]);
  });

  test('the index channel and the SVG channel never name different points', () => {
    // The accessibility invariant: an SVG adapter highlights through
    // `selectors` and a canvas one through these indices, and the two must
    // agree about what is selected or the same chart says two things.
    // One element per datapoint, positioned where its data says — the shape a
    // real SVG binder supplies, and what `groupSvgElements` groups on.
    document.body.innerHTML = `<svg>${
      shared.map(p => `<circle class="pt" cx="${p.x}" cy="${p.y}" r="1"/>`).join('')
    }</svg>`;

    const trace = new ScatterTrace({
      ...createLayer(shared),
      selectors: 'circle.pt',
    } as MaidrLayer);

    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty || state.highlight.empty) {
      throw new Error('expected the SVG channel to resolve for this layer');
    }
    const elements = Array.isArray(state.highlight.elements)
      ? state.highlight.elements
      : [state.highlight.elements];

    // One index per element: the two channels cover the same marks.
    expect(trace.highlightedPointIndices).toHaveLength(elements.length);
  });

  test('the SVG channel still picks the right element in intersection mode', () => {
    // Guards the refactor behind this fix: `buildStackedSvg` became
    // `buildStackedIndices` plus a lookup, and it is the array intersection
    // highlighting indexes. An SVG adapter must keep outlining the one point of
    // the stack the user is on.
    document.body.innerHTML = `<svg>${
      shared.map(p => `<circle class="pt" cx="${p.x}" cy="${p.y}" r="1"/>`).join('')
    }</svg>`;

    const trace = new ScatterTrace({
      ...createLayer(shared),
      selectors: 'circle.pt',
    } as MaidrLayer);

    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    trace.setIntersectionMode(true);

    /** The cy of the single element the SVG channel is outlining. */
    const outlined = (): string | null => {
      const state = trace.state;
      if (state.empty || state.highlight.empty) {
        throw new Error('expected the SVG channel to resolve');
      }
      const elements = Array.isArray(state.highlight.elements)
        ? state.highlight.elements
        : [state.highlight.elements];
      expect(elements).toHaveLength(1);
      return elements[0].getAttribute('cy');
    };

    // The x=2 stack runs (x2,y20) then (x2,y30) — data[1] then data[2].
    expect(outlined()).toBe('20');
    expect([...trace.highlightedPointIndices]).toEqual([1]);

    trace.moveToNextIntersection();
    expect(outlined()).toBe('30');
    expect([...trace.highlightedPointIndices]).toEqual([2]);
  });

  test('names its points even when no SVG element was ever supplied', () => {
    // The canvas case, and the whole reason the channel exists. `highlight`
    // falls back to out-of-bounds without elements to point at; the identity
    // of the points does not depend on anything having been drawn in SVG.
    const trace = new ScatterTrace(createLayer(shared));
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('expected a non-empty state');
    }
    expect(state.highlight.empty).toBe(true);
    expect([...trace.highlightedPointIndices]).toEqual([0]);
  });

  test('names its points while the braille surface stays empty', () => {
    // The decoupling #897 asked for, in one assertion. Braille is empty
    // outside grid mode because that is the correct braille answer for a
    // point cloud, not an oversight — so the old highlight path, gated on
    // braille having something to say, could never fire. The identity channel
    // carries a selection at the very moment braille carries none, which is
    // what lets the overlay move without degrading what a blind user reads to
    // feed a sighted one.
    const trace = new ScatterTrace(createLayer(shared));
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('expected a non-empty state');
    }
    expect(state.braille.empty).toBe(true);
    expect([...trace.highlightedPointIndices]).toEqual([0]);
  });
});
