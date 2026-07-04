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
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Tests only use the public Element/JSDOM surface.
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
    options: { chart: { type: input.type } },
  } as HighchartsChart;
}

/** Points for a simple category bar/column series. */
export function categoryPoints(values: number[], categories: string[]): Partial<HighchartsPoint>[] {
  return values.map((y, i) => ({ x: i, y, category: categories[i] }));
}
