/**
 * A Chart.js box plot or violin drawn on its side was read as an upright one.
 *
 * `indexAxis: 'y'` is Chart.js's own name for the horizontal reading, and the
 * bar family has read it since the adapter existed. The two controllers
 * `@sgratzl/chartjs-chart-boxplot` registers honour it as well, and neither
 * `extractBoxplotLayers` nor `extractViolinLayers` asked: a distribution
 * chart turned on its side came out declaring nothing, which resolves to
 * `vert`.
 *
 * Measured in Chromium on chart.js 4 plus the boxplot plugin, the same three
 * samples once each way, through `extractMaidrData`:
 *
 *   options                emitted orientation
 *   (default)              (none) = vert
 *   indexAxis: 'y'         (none) = vert     <- the chart is sideways
 *
 * Neither payload moves with the key: a `BoxPoint` carries no `x`/`y` pair to
 * exchange and a `ViolinKdePoint` names its violin the same way round either
 * way. What moves is the reading — `BoxTrace` and `ViolinTrace` take the group
 * off `axes.y` and the measurement off `axes.x` when the layer is horizontal,
 * and a box plot's arrow keys walk the sections of one distribution rather
 * than across the distributions.
 *
 * Chart.js needs no label swap for any of this: with `indexAxis: 'y'` its own
 * `x` scale **is** the measured one, so the titles already describe the axes
 * as drawn. That is not true of every library — Highcharts and AnyChart keep
 * calling the category axis `xAxis` whichever way they draw it — which is why
 * the swap lives in those adapters and not here.
 */

import type {
  ChartJsChart,
  ChartJsData,
  ChartJsDataValue,
  ChartJsParsedValue,
} from '@adapters/chartjs/types';
import type { MaidrLayer } from '@type/grammar';
import { extractMaidrData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';

/** The parse the plugin leaves for one box of `[1,2,2,3,4,4,5,6,7,9]`. */
const BOX_PARSE: ChartJsParsedValue = {
  x: 0,
  items: [1, 2, 2, 3, 4, 4, 5, 6, 7, 9],
  outliers: [],
  whiskerMax: 9,
  whiskerMin: 1,
  max: 9,
  median: 4,
  min: 1,
  q1: 2.25,
  q3: 5.75,
  y: 4,
};

/** The same parse with the density curve a violin adds. */
const VIOLIN_PARSE: ChartJsParsedValue = {
  ...BOX_PARSE,
  coords: [
    { v: 1, estimate: 0.05 },
    { v: 4, estimate: 0.21 },
    { v: 9, estimate: 0.03 },
  ],
};

/**
 * One dataset of raw samples -- the boxplot plugin's documented primary form,
 * which `ChartJsDataValue` does not name because only the plugin reads it.
 */
const SAMPLES = [1, 2, 2, 3, 4, 4, 5, 6, 7, 9] as unknown as ChartJsDataValue;

const DATA: ChartJsData = {
  labels: ['alpha'],
  datasets: [{ label: 'Samples', data: [SAMPLES] }],
};

/**
 * A drawn distribution chart, upright or on its side.
 * @param type - `'boxplot'` or `'violin'`
 * @param indexAxis - Which axis Chart.js indexes by
 * @returns The mock chart
 */
function createChart(type: string, indexAxis?: 'x' | 'y'): ChartJsChart {
  const parsed = type === 'violin' ? VIOLIN_PARSE : BOX_PARSE;
  return {
    canvas: { id: 'dist-chart' } as unknown as HTMLCanvasElement,
    data: DATA,
    options: indexAxis ? { indexAxis } : {},
    config: { type },
    getDatasetMeta: () => ({ data: [], type, _parsed: [parsed] }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/**
 * The layers one chart converts to.
 * @param type - `'boxplot'` or `'violin'`
 * @param indexAxis - Which axis Chart.js indexes by
 * @returns The emitted layers
 */
function layersFor(type: string, indexAxis?: 'x' | 'y'): MaidrLayer[] {
  return extractMaidrData(createChart(type, indexAxis)).subplots[0][0].layers;
}

describe('an upright Chart.js distribution', () => {
  it('says nothing about orientation, which is `vert`', () => {
    expect(layersFor('boxplot')[0].orientation).toBeUndefined();
    expect(layersFor('violin').map(layer => layer.orientation))
      .toEqual([undefined, undefined]);
  });
});

describe('a Chart.js distribution drawn on its side', () => {
  it('says a box plot is drawn sideways', () => {
    const [box] = layersFor('boxplot', 'y');

    expect(box.type).toBe(TraceType.BOX);
    expect(box.orientation).toBe(Orientation.HORIZONTAL);
  });

  it('leaves the summary itself alone', () => {
    // The quantiles are the same five numbers whichever way the box is drawn;
    // it is the axes they are announced against that move.
    expect(layersFor('boxplot', 'y')[0].data)
      .toEqual(layersFor('boxplot')[0].data);
  });

  it('says both halves of a violin are drawn sideways', () => {
    // Both layers or neither: they are one chart, and a reader paging from
    // the summary to the curve would otherwise be told the violin turned.
    const layers = layersFor('violin', 'y');

    expect(layers.map(layer => layer.type))
      .toEqual([TraceType.VIOLIN_BOX, TraceType.VIOLIN_KDE]);
    expect(layers.map(layer => layer.orientation))
      .toEqual([Orientation.HORIZONTAL, Orientation.HORIZONTAL]);
  });

  it('keeps the axis titles as the chart drew them', () => {
    // No swap here, deliberately: `indexAxis: 'y'` makes Chart.js's own `x`
    // scale the measured one, so its title already names the axis the
    // measurement lies on.
    expect(layersFor('boxplot', 'y')[0].axes).toEqual(layersFor('boxplot')[0].axes);
  });
});
