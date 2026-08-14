/**
 * Fake Highcharts object builders for the adapter tests.
 *
 * The adapter reads only the minimal structural types in
 * `@adapters/highcharts/types`, so tests construct plain objects matching
 * that surface. `renderTo` needs a real element (the adapter stamps a
 * container id on it), provided via jsdom since jest runs in a node env.
 */

import type {
  HighchartsAxis,
  HighchartsChart,
  HighchartsPoint,
  HighchartsSeries,
} from '@adapters/highcharts/types';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
const doc = dom.window.document as Document;

let elementCounter = 0;

export function fakeAxis(overrides: Partial<HighchartsAxis> = {}): HighchartsAxis {
  return {
    getExtremes: () => ({ min: 0, max: 100 }),
    options: {},
    ...overrides,
  };
}

export interface FakeSeriesInput {
  index: number;
  data: Partial<HighchartsPoint>[];
  type?: string;
  name?: string;
  xAxis?: HighchartsAxis;
  yAxis?: HighchartsAxis;
  visible?: boolean;
  options?: HighchartsSeries['options'];
  /** The series Highcharts resolved this one's `linkedTo` to. */
  linkedParent?: HighchartsSeries;
}

export function fakeSeries(input: FakeSeriesInput): HighchartsSeries {
  const series = {
    type: input.type ?? 'column',
    name: input.name ?? `Series ${input.index}`,
    index: input.index,
    visible: input.visible ?? true,
    xAxis: input.xAxis ?? fakeAxis(),
    yAxis: input.yAxis ?? fakeAxis(),
    options: input.options ?? {},
    linkedParent: input.linkedParent,
    data: [] as HighchartsPoint[],
  } as HighchartsSeries;

  series.data = input.data.map((point, i) => ({
    x: i,
    y: null,
    index: i,
    series,
    ...point,
  } as HighchartsPoint));

  return series;
}

export interface FakeChartInput {
  series: HighchartsSeries[];
  title?: string;
  type?: string;
  renderToId?: string;
  xAxis?: HighchartsAxis[];
  yAxis?: HighchartsAxis[];
  plotOptions?: HighchartsChart['options']['plotOptions'];
  /** Wraps the cartesian plane around a circle — radar, spider, wind rose. */
  polar?: boolean;
  /** One axis per variable, one series per observation. */
  parallelCoordinates?: boolean;
}

export function fakeChart(input: FakeChartInput): HighchartsChart {
  const renderTo = doc.createElement('div');
  renderTo.id = input.renderToId ?? `fake-chart-${elementCounter++}`;
  doc.body.appendChild(renderTo);

  return {
    series: input.series,
    xAxis: input.xAxis ?? [...new Set(input.series.map(s => s.xAxis))],
    yAxis: input.yAxis ?? [...new Set(input.series.map(s => s.yAxis))],
    title: { textStr: input.title },
    container: renderTo,
    renderTo,
    options: {
      chart: {
        type: input.type,
        polar: input.polar,
        parallelCoordinates: input.parallelCoordinates,
      },
      plotOptions: input.plotOptions,
    },
  } as HighchartsChart;
}

/**
 * A stand-in for the `point.graphic` reference Highcharts sets during render.
 *
 * The adapter stamps index attributes onto that element for the trace types
 * whose DOM order does not match declaration order (heatmap cells, treemap and
 * sunburst nodes), so a test that covers stamping needs a real element to
 * inspect afterwards.
 */
export function fakeGraphic(): { element: SVGElement } {
  return { element: doc.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGElement };
}

/** Points for a simple category bar/column series. */
export function categoryPoints(values: number[], categories: string[]): Partial<HighchartsPoint>[] {
  return values.map((y, i) => ({ x: i, y, category: categories[i] }));
}
