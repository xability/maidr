/**
 * A Highcharts heatmap has to arrive top-first (#973).
 *
 * `HeatmapData` runs top-first and `Heatmap` turns it over so its own row 0 is
 * the bottom of the drawn grid, which is what makes ArrowUp move visually up.
 * Highcharts numbers a y axis from the *bottom*, and the adapter emitted
 * `yAxis.categories` in declared order without ever consulting `reversed`, so
 * an ordinary heatmap was navigated upside down.
 *
 * Measured on real Highcharts 13.0.1 in Chromium, for
 * `categories: ['first','second','third']`, via `yAxis.toPixels` where a
 * smaller pixel is higher on screen:
 *
 *   reversed: false   toPixels(0) = 351.8   toPixels(2) = 107.2   → 0 is BOTTOM
 *   reversed: true    toPixels(0) = 107.2   toPixels(2) = 351.8   → 0 is TOP
 */
import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { JSDOM } from 'jsdom';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const Y = ['first', 'second', 'third'];

// `TraceFactory` resolves the layer's `string[][]` selectors through
// `document.querySelector`, so the model needs one. Nothing matches here and
// nothing needs to — an unresolvable selector degrades to "no highlight",
// which leaves the navigation these cases are about untouched. jsdom is
// installed by hand rather than by the `@jest-environment` docblock because
// `./helpers` imports JSDOM itself, which that environment breaks.
beforeEach(() => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = dom.window.document;
  g.SVGElement = dom.window.SVGElement;
});

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.document;
  delete g.SVGElement;
});

/**
 * The layer a three-row heatmap converts to.
 * @param reversed - Whether Highcharts is drawing the y axis reversed
 * @returns The emitted layer
 */
function layerFor(reversed: boolean): MaidrLayer {
  const yAxis = fakeAxis({ categories: Y, reversed, options: { reversed } } as never);
  const xAxis = fakeAxis({ categories: ['c1', 'c2'] } as never);
  const series = fakeSeries({
    index: 0,
    type: 'heatmap',
    name: 'H',
    xAxis,
    yAxis,
    data: [
      { x: 0, y: 0, options: { value: 1 } },
      { x: 1, y: 0, options: { value: 2 } },
      { x: 0, y: 1, options: { value: 3 } },
      { x: 1, y: 1, options: { value: 4 } },
      { x: 0, y: 2, options: { value: 5 } },
      { x: 1, y: 2, options: { value: 6 } },
    ],
  });
  const chart = fakeChart({
    type: 'heatmap',
    series: [series],
    xAxis: [xAxis],
    yAxis: [yAxis],
  });
  return highchartsToMaidr(chart).subplots[0][0].layers[0] as MaidrLayer;
}

/** Which Highcharts y index each selector row points at. */
function stampedRows(layer: MaidrLayer): (string | undefined)[] {
  return (layer.selectors as string[][]).map(
    row => /data-maidr-row="(\d+)"/.exec(row[0])?.[1],
  );
}

/** Where the cursor lands, and where ArrowUp takes it. */
function walkUp(layer: MaidrLayer): { entry: unknown; afterUp: unknown } {
  const trace = TraceFactory.create(layer) as unknown as {
    state: { text?: { cross?: { value?: unknown } } };
    moveOnce: (direction: string) => boolean;
  };
  const entry = trace.state.text?.cross?.value;
  // The first move only settles the cursor, so step twice to actually travel.
  trace.moveOnce('UPWARD');
  trace.moveOnce('UPWARD');
  return { entry, afterUp: trace.state.text?.cross?.value };
}

describe('an ordinary highcharts heatmap', () => {
  it('is emitted top row first', () => {
    // Highcharts' y index 2 — 'third' — is the top row, so the layer leads
    // with it. Before the fix this was ['first', 'second', 'third'].
    expect((layerFor(false).data as HeatmapData).y).toEqual(['third', 'second', 'first']);
  });

  it('turns the values over with their labels', () => {
    expect((layerFor(false).data as HeatmapData).points).toEqual([[5, 6], [3, 4], [1, 2]]);
  });

  it('enters at the bottom row and moves up from there', () => {
    // Before the fix the cursor entered at 'third' — the top — and ArrowUp
    // took it to 'second', walking down the chart.
    const { entry, afterUp } = walkUp(layerFor(false));

    expect(entry).toBe('first');
    expect(afterUp).toBe('second');
  });

  it('points each selector row at the cell it announces', () => {
    // Both reversals cancel, so logical row r lands on stamped row r: row 0
    // announces 'first', which is Highcharts' y index 0.
    expect(stampedRows(layerFor(false))).toEqual(['0', '1', '2']);
  });
});

describe('a highcharts heatmap on a reversed y axis', () => {
  it('is left as Highcharts gave it', () => {
    // A reversed axis already counts from the top, which is the order the
    // grammar asks for. Reversing would put it back upside down.
    expect((layerFor(true).data as HeatmapData).y).toEqual(Y);
    expect((layerFor(true).data as HeatmapData).points).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('still enters at the bottom row', () => {
    // With the axis reversed, 'third' is the one drawn at the bottom.
    const { entry, afterUp } = walkUp(layerFor(true));

    expect(entry).toBe('third');
    expect(afterUp).toBe('second');
  });

  it('flips its selector rows instead', () => {
    // Only the model's reversal applies here, so logical row 0 — 'third' —
    // is Highcharts' y index 2.
    expect(stampedRows(layerFor(true))).toEqual(['2', '1', '0']);
  });
});

describe('either way round', () => {
  it('keeps every value on its own label', () => {
    // The pairing survived the bug too, so this is the part a fix must not
    // break rather than the part it fixes.
    for (const reversed of [false, true]) {
      const { y, points } = layerFor(reversed).data as HeatmapData;
      const valueOf = (label: string): (number | null)[] => points[y.indexOf(label)];

      expect(valueOf('first')).toEqual([1, 2]);
      expect(valueOf('second')).toEqual([3, 4]);
      expect(valueOf('third')).toEqual([5, 6]);
    }
  });
});
