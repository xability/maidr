/**
 * @jest-environment jsdom
 *
 * The Recharts example apps, rendered: each chart is drawn by real Recharts
 * and read by the adapter, and what MAIDR is handed is held to what was
 * drawn.
 *
 * The adapter's own tests draw their own charts, so an example that drew one
 * chart and declared another passed all of them while its reader and a
 * sighted colleague were describing two different charts.
 */

import type {
  GanttData,
  GaugePoint,
  Maidr as MaidrData,
  MaidrLayer,
  TreemapPoint,
} from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { GanttExample } from '../../../examples/recharts/examples/GanttExample';
import { GaugeExample } from '../../../examples/recharts/examples/GaugeExample';
import { IcicleExample } from '../../../examples/recharts/examples/IcicleExample';
import { SunburstExample } from '../../../examples/recharts/examples/SunburstExample';

const seen: MaidrData[] = [];

// The payload each example hands `<Maidr>`, kept rather than bound: binding
// needs a focusable page, and what is checked here is the payload against
// the drawing.
jest.mock('../../../src/maidr-component', () => ({
  Maidr: ({ data, children }: { data: MaidrData; children: ReactNode }): ReactNode => {
    seen.push(data);
    return children;
  },
}));

/**
 * Renders an example and returns its one layer.
 *
 * @param example - The example's component
 * @returns The drawn chart's container and the layer MAIDR was handed for it
 */
function draw(example: () => ReactElement): { chart: HTMLElement; layer: MaidrLayer } {
  seen.length = 0;
  const { container } = render(createElement(example));
  const figure = seen.at(-1);
  if (figure === undefined) {
    throw new Error('the example handed MAIDR nothing');
  }
  return { chart: container, layer: figure.subplots[0][0].layers[0] };
}

/**
 * Where a Recharts rectangle is drawn, from the path it draws it as.
 *
 * @param rectangle - A `path.recharts-rectangle`
 * @returns Its left edge, its top edge and its height
 */
function boxOf(rectangle: Element): { x: number; y: number; height: number } {
  // `M x,y h width v height h -width Z`
  const [x, y, , height] = (rectangle.getAttribute('d') ?? '').match(/-?[\d.]+/g)?.map(Number) ?? [];
  return { x, y, height };
}

/**
 * The vertical centre of a Recharts rectangle.
 *
 * @param rectangle - A `path.recharts-rectangle`
 * @returns Its centre's y
 */
function centreY(rectangle: Element): number {
  const { y, height } = boxOf(rectangle);
  return y + height / 2;
}

/**
 * The rows a vertical-layout chart's category axis draws, top to bottom.
 *
 * @param chart - The rendered example
 * @returns Each row's label and the y it is drawn at
 */
function categoryRows(chart: HTMLElement): { label: string; y: number }[] {
  // Recharts draws an axis's tick labels apart from its tick lines, in a
  // layer of their own, each label's text at its tick's coordinate.
  return [...chart.querySelectorAll('.recharts-yAxis-tick-labels text')].map(text => ({
    label: text.textContent ?? '',
    y: Number(text.getAttribute('y')),
  }));
}

/**
 * The row a bar is drawn on: the axis row nearest its centre.
 *
 * @param rows - The chart's rows, as {@link categoryRows} reads them
 * @param bar - A `path.recharts-rectangle`
 * @returns The row's label
 */
function rowOf(rows: { label: string; y: number }[], bar: Element): string {
  const y = centreY(bar);
  return rows.reduce((nearest, row) => (Math.abs(row.y - y) < Math.abs(nearest.y - y) ? row : nearest)).label;
}

beforeAll(() => {
  // Recharts measures nothing for a chart given its size, but reaches for
  // ResizeObserver, which jsdom lacks.
  if (!('ResizeObserver' in globalThis)) {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    });
  }
});

afterEach(() => {
  cleanup();
});

describe('the recharts example apps', () => {
  it('draw the gantt one row per lane MAIDR walks, each interval on its own lane\'s row', () => {
    // A category axis gave every data row a slot of its own, so the chart
    // drew Discovery, Design, Design, Build, Build and no Launch, while the
    // reader was walked through four lanes, the last one empty.
    const { chart, layer } = draw(GanttExample);
    const gantt = layer.data as GanttData;
    const rows = categoryRows(chart);
    const bars = [...chart.querySelectorAll('.recharts-bar-rectangle .recharts-rectangle')];

    expect(rows.map(row => row.label)).toEqual(gantt.lanes?.map(String));
    expect(bars.map(bar => rowOf(rows, bar))).toEqual(gantt.points.flat().map(point => String(point.x)));
  });

  it('draw the icicle one band per depth, each node on its own depth\'s band', () => {
    // Each node had a row of its own, a staircase labelled 0, 1, 1, 0, ...,
    // so moving to a sibling moved down the chart.
    const { chart, layer } = draw(IcicleExample);
    const rows = categoryRows(chart);
    const bars = [...chart.querySelectorAll('.recharts-bar-rectangle .recharts-rectangle')];
    const nodes = layer.data as TreemapPoint[];

    expect(rows.map(row => row.label)).toEqual(['0', '1']);
    expect(bars.map(bar => rowOf(rows, bar))).toEqual(nodes.map(node => String(node.path?.length ?? 0)));
  });

  it('draw the sunburst\'s every node as an arc', () => {
    // With only its leaves valued, every arc's angle was NaN and nothing was
    // drawn at all.
    const { chart, layer } = draw(SunburstExample);
    const arcs = [...chart.querySelectorAll('.recharts-sunburst .recharts-sector')];
    const nodes = (layer.data as unknown[]).length;

    expect(arcs).toHaveLength(nodes);
    expect(arcs.filter(arc => /NaN/.test(arc.getAttribute('d') ?? ''))).toEqual([]);
  });

  it('draw the gauge\'s bands and target round its dial', () => {
    // The dial drew the value arc alone while every move read "Target is 80"
    // and the description listed the three bands.
    const { chart, layer } = draw(GaugeExample);
    const gauge = layer.data as GaugePoint;
    const texts = [...chart.querySelectorAll('svg text')].map(text => text.textContent ?? '');

    expect(gauge.bands?.length).toBe(3);
    for (const band of gauge.bands ?? []) {
      expect(texts).toContain(band.label);
    }
    expect(texts.some(text => text.includes(String(gauge.target)))).toBe(true);
  });
});
