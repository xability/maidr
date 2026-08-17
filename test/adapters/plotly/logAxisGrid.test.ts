/**
 * @jest-environment jsdom
 */
/**
 * A plotly log axis must not hand `ScatterTrace` a navigation grid (#969).
 *
 * `extractAxisGridConfig` reads plotly's computed `range` and `dtick`, which
 * on a log axis are measured in *decades* while `layer.data` keeps the plain
 * values. The grid was therefore laid out over a span the data does not live
 * in: for 1..1e9 plotly reports `[-0.578, 9.578]`, so 1 binned and 1e3, 1e6
 * and 1e9 landed in no cell at all — grid mode still engaged, announcing a
 * 5x5 grid holding one point.
 *
 * Every axis object below is what plotly.js 3.7.0 actually put in
 * `_fullLayout` for the stated data, read back from a real browser render.
 */
import type { PlotlyAxis, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { MaidrLayer } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Plotly's computed axes, measured rather than composed. */
const MEASURED = {
  /** `type: 'linear'`, data 1..1000. */
  linear: { type: 'linear', range: [-63.19905956112852, 1064.1990595611285], dtick: 200 },
  /** `type: 'log'`, data 1..1000 — a narrow log axis gets a *string* dtick. */
  logNarrow: { type: 'log', range: [-0.1927899686520376, 3.192789968652037], dtick: 'D2' },
  /** `type: 'log'`, data 1..1000, the author pinning one tick per decade. */
  logPinned: { type: 'log', range: [-0.1927899686520376, 3.192789968652037], dtick: 1 },
  /** `type: 'log'`, data 1..1e9 — wide enough that plotly picks a number. */
  logWide: { type: 'log', range: [-0.5783699059561128, 9.57836990595611], dtick: 2 },
} satisfies Record<string, PlotlyAxis>;

/**
 * A rendered plotly div carrying one scatter trace.
 * @param axis - The computed axis, used for both x and y
 * @param values - The x and y values, which are the same here
 * @returns The graph div
 */
function graphDiv(axis: PlotlyAxis, values: number[]): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  (gd as unknown as { _fullData: unknown })._fullData = [
    { type: 'scatter', mode: 'markers', x: values, y: values } as PlotlyTrace,
  ];
  (gd as unknown as { _fullLayout: unknown })._fullLayout = { xaxis: axis, yaxis: axis };
  return gd;
}

/**
 * The layer a scatter on the given axis converts to.
 * @param axis - The computed axis
 * @param values - The x and y values
 * @returns The emitted layer
 */
function layerFor(axis: PlotlyAxis, values: number[]): MaidrLayer {
  const layer = extractPlotlyData(graphDiv(axis, values))?.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer as MaidrLayer;
}

/** How many of the layer's points the built grid actually holds. */
function pointsInGrid(layer: MaidrLayer): { cells: string; placed: number } {
  const trace = TraceFactory.create(layer) as unknown as {
    numGridRows: number;
    numGridCols: number;
    gridCells: { points: unknown[] }[][] | null;
  };
  let placed = 0;
  for (const row of trace.gridCells ?? []) {
    for (const cell of row) {
      placed += cell.points.length;
    }
  }
  return { cells: `${trace.numGridRows}x${trace.numGridCols}`, placed };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a plotly log-axis scatter', () => {
  it('emits no grid config when plotly picked a numeric dtick', () => {
    // The case that needs no configuration at all: `type: 'log'` over data
    // spanning nine decades. Before the fix this was
    // `{min: -0.578, max: 9.578, tickStep: 2}` — decades, over plain values.
    const layer = layerFor(MEASURED.logWide, [1, 1e3, 1e6, 1e9]);

    expect(layer.axes?.x?.min).toBeUndefined();
    expect(layer.axes?.x?.tickStep).toBeUndefined();
    expect(layer.axes?.y?.min).toBeUndefined();
  });

  it('emits no grid config when the author pinned dtick to one decade', () => {
    const layer = layerFor(MEASURED.logPinned, [1, 10, 100, 1000]);

    expect(layer.axes?.x?.min).toBeUndefined();
    expect(layer.axes?.x?.tickStep).toBeUndefined();
  });

  it('leaves grid mode off rather than binning the points wrongly', () => {
    // The whole point of declining: grid mode never engages, so the reader is
    // not walked through cells the data is not in. Before the fix this built
    // a 5x5 grid holding 1 of the 4 points.
    const { cells, placed } = pointsInGrid(layerFor(MEASURED.logWide, [1, 1e3, 1e6, 1e9]));

    expect(cells).toBe('0x0');
    expect(placed).toBe(0);
  });

  it('keeps the data itself in plain values', () => {
    // Declining the grid must not touch the payload — every point is still
    // there and still announced at its real magnitude.
    const layer = layerFor(MEASURED.logWide, [1, 1e3, 1e6, 1e9]);

    expect((layer.data as { x: number }[]).map(point => point.x)).toEqual([1, 1e3, 1e6, 1e9]);
  });

  it('was already declining a narrow log axis, and still does', () => {
    // Plotly spells a narrow log axis's dtick `D2`, which the existing
    // non-numeric check rejected. This is the behaviour the fix generalises.
    const layer = layerFor(MEASURED.logNarrow, [1, 10, 100, 1000]);

    expect(layer.axes?.x?.min).toBeUndefined();
  });
});

describe('a plotly linear-axis scatter is untouched', () => {
  it('still emits the grid config plotly computed', () => {
    const layer = layerFor(MEASURED.linear, [1, 10, 100, 1000]);

    expect(layer.axes?.x?.min).toBeCloseTo(-63.199, 3);
    expect(layer.axes?.x?.max).toBeCloseTo(1064.199, 3);
    expect(layer.axes?.x?.tickStep).toBe(200);
  });

  it('still builds a grid holding every point', () => {
    const { cells, placed } = pointsInGrid(layerFor(MEASURED.linear, [1, 10, 100, 1000]));

    expect(cells).toBe('6x6');
    expect(placed).toBe(4);
  });
});
