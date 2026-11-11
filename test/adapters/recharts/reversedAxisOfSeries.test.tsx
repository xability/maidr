/**
 * @jest-environment jsdom
 *
 * A Recharts bar or line chart is read along the category axis its series is
 * drawn on.
 *
 * A chart may declare more than one category axis, and Recharts draws each
 * series on the one its `xAxisId` names. The adapter asked whether any of
 * them was reversed, so bars drawn left to right on a plain axis, beside a
 * reversed one declared after it, were read right to left: Q4 first, on a
 * chart that draws Q1 first, with each bar's highlight following the
 * reading rather than the bar.
 *
 * Real charts are drawn, because which way a series runs is a fact about the
 * DOM Recharts renders: each case measures where the bars and dots landed
 * and walks the reading against it. `<Maidr>` is stood in for so the data
 * `<MaidrRecharts>` hands it can be read; the stand-in draws the article
 * MAIDR wraps a chart in, which every selector is scoped to.
 */

import type { Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import { MaidrRecharts } from '@adapters/recharts/MaidrRecharts';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { Bar, BarChart, Line, LineChart, XAxis, YAxis } from 'recharts';

const seen: MaidrData[] = [];

jest.mock('../../../src/maidr-component', () => ({
  Maidr: ({ data, children }: { data: MaidrData; children: ReactNode }): ReactNode => {
    seen.push(data);
    const react = jest.requireActual<typeof import('react')>('react');
    return react.createElement('article', { id: `maidr-article-${data.id}` }, children);
  },
}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  // Recharts 3 observes its wrapper for size changes, which jsdom cannot do;
  // the charts below are given their size outright.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  cleanup();
  seen.length = 0;
});

const QUARTERS = [
  { quarter: 'Q1', revenue: 4200 },
  { quarter: 'Q2', revenue: 5800 },
  { quarter: 'Q3', revenue: 3900 },
  { quarter: 'Q4', revenue: 7100 },
];

const MONTHS = [
  { month: 'Jan', users: 400 },
  { month: 'Feb', users: 600 },
  { month: 'Mar', users: 550 },
  { month: 'Apr', users: 780 },
];

/**
 * A plain bottom axis and, declared after it, a reversed top one, each
 * naming the categories as an axis of a real chart does.
 * @param dataKey - The category key
 * @returns The two axes
 */
function plainThenReversed(dataKey: string): ReactElement[] {
  return [
    createElement(XAxis, { key: 'bottom', dataKey }),
    createElement(XAxis, { key: 'top', xAxisId: 'top', orientation: 'top', dataKey, reversed: true }),
    createElement(YAxis, { key: 'value' }),
  ];
}

/**
 * Draws a chart through `<MaidrRecharts>` and returns the layer it emitted.
 * @param chartType - `bar` or `line`
 * @param chart - The chart element
 * @returns The layer
 */
function mount(chartType: 'bar' | 'line', chart: ReactElement): MaidrLayer {
  const rows = chartType === 'bar' ? QUARTERS : MONTHS;
  render(createElement(MaidrRecharts, {
    id: 'axes',
    data: rows,
    chartType,
    xKey: chartType === 'bar' ? 'quarter' : 'month',
    yKeys: [chartType === 'bar' ? 'revenue' : 'users'],
    children: chart,
  }));
  const layer = seen.at(-1)?.subplots[0][0].layers[0];
  if (!layer) {
    throw new Error('MaidrRecharts handed MAIDR no layer');
  }
  return layer;
}

/**
 * Where a mark sits across the chart: a bar's left edge, a dot's centre.
 * @param mark - A bar's path or a dot
 * @returns Its x, in the chart's own pixels
 */
function leftOf(mark: Element): number {
  const cx = mark.getAttribute('cx');
  if (cx !== null) {
    return Number(cx);
  }
  const start = /^M\s*([-\d.]+)/.exec(mark.getAttribute('d') ?? '');
  if (start === null) {
    throw new Error(`no position on ${mark.outerHTML}`);
  }
  return Number(start[1]);
}

/**
 * The categories in the order Recharts drew them, left to right. Recharts
 * renders the marks in data order whichever way the axis runs, so the i-th
 * mark is the i-th row.
 * @param selector - The marks
 * @param labels - Each row's category
 * @returns The categories, leftmost first
 */
function drawnLeftToRight(selector: string, labels: string[]): string[] {
  const marks = [...document.querySelectorAll(selector)];
  expect(marks).toHaveLength(labels.length);
  return marks
    .map((mark, row) => ({ label: labels[row], left: leftOf(mark) }))
    .sort((a, b) => a.left - b.left)
    .map(mark => mark.label);
}

/**
 * The reading, from its first position to its last: the category announced
 * at each, and whether the mark highlighted with it lies to the right of the
 * one before.
 * @param layer - The layer
 * @param count - How many positions it has
 * @returns What is announced, and whether the highlight moved rightwards
 *   at every step
 */
function readAlong(layer: MaidrLayer, count: number): { announced: string[]; rightwards: boolean } {
  const trace = TraceFactory.create(layer);
  const announced: string[] = [];
  const lefts: number[] = [];
  for (let col = 0; col < count; col++) {
    const state = trace.getStateAt(0, col);
    if (state.empty || state.highlight.empty) {
      throw new Error(`nothing read or highlighted at ${col}`);
    }
    announced.push(String(state.text.main?.value));
    const { elements } = state.highlight;
    lefts.push(leftOf(Array.isArray(elements) ? elements[0] : elements));
  }
  trace.dispose();
  return { announced, rightwards: lefts.every((left, i) => i === 0 || left > lefts[i - 1]) };
}

const BARS = '#maidr-article-axes .recharts-bar-rectangle path';
const DOTS = '#maidr-article-axes .recharts-line-dots circle';

describe('a chart with a plain category axis and a reversed one', () => {
  it('reads bars drawn on the plain axis left to right, as they are drawn', () => {
    const layer = mount('bar', createElement(
      BarChart,
      { width: 400, height: 300, data: QUARTERS },
      ...plainThenReversed('quarter'),
      createElement(Bar, { key: 'bar', dataKey: 'revenue', isAnimationActive: false }),
    ));

    expect(drawnLeftToRight(BARS, ['Q1', 'Q2', 'Q3', 'Q4'])).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(readAlong(layer, 4)).toEqual({ announced: ['Q1', 'Q2', 'Q3', 'Q4'], rightwards: true });
  });

  it('reads bars drawn on the reversed axis from its far end, as they are drawn', () => {
    const layer = mount('bar', createElement(
      BarChart,
      { width: 400, height: 300, data: QUARTERS },
      ...plainThenReversed('quarter'),
      createElement(Bar, { key: 'bar', xAxisId: 'top', dataKey: 'revenue', isAnimationActive: false }),
    ));

    expect(drawnLeftToRight(BARS, ['Q1', 'Q2', 'Q3', 'Q4'])).toEqual(['Q4', 'Q3', 'Q2', 'Q1']);
    expect(readAlong(layer, 4)).toEqual({ announced: ['Q4', 'Q3', 'Q2', 'Q1'], rightwards: true });
  });

  it('reads a line drawn on the plain axis left to right, as it is drawn', () => {
    const layer = mount('line', createElement(
      LineChart,
      { width: 400, height: 300, data: MONTHS },
      ...plainThenReversed('month'),
      createElement(Line, { key: 'line', dataKey: 'users', dot: true, isAnimationActive: false }),
    ));

    expect(drawnLeftToRight(DOTS, ['Jan', 'Feb', 'Mar', 'Apr'])).toEqual(['Jan', 'Feb', 'Mar', 'Apr']);
    expect(readAlong(layer, 4)).toEqual({ announced: ['Jan', 'Feb', 'Mar', 'Apr'], rightwards: true });
  });

  it('reads a line drawn on the reversed axis from its far end, as it is drawn', () => {
    const layer = mount('line', createElement(
      LineChart,
      { width: 400, height: 300, data: MONTHS },
      ...plainThenReversed('month'),
      createElement(Line, { key: 'line', xAxisId: 'top', dataKey: 'users', dot: true, isAnimationActive: false }),
    ));

    expect(drawnLeftToRight(DOTS, ['Jan', 'Feb', 'Mar', 'Apr'])).toEqual(['Apr', 'Mar', 'Feb', 'Jan']);
    expect(readAlong(layer, 4)).toEqual({ announced: ['Apr', 'Mar', 'Feb', 'Jan'], rightwards: true });
  });
});

describe('a series and the axis its id names', () => {
  it('reads bars naming no declared axis as drawn on Recharts\' own, plain one', () => {
    const layer = mount('bar', createElement(
      BarChart,
      { width: 400, height: 300, data: QUARTERS },
      createElement(XAxis, { key: 'top', xAxisId: 'top', orientation: 'top', dataKey: 'quarter', reversed: true }),
      createElement(YAxis, { key: 'value' }),
      createElement(Bar, { key: 'bar', dataKey: 'revenue', isAnimationActive: false }),
    ));

    expect(drawnLeftToRight(BARS, ['Q1', 'Q2', 'Q3', 'Q4'])).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(readAlong(layer, 4)).toEqual({ announced: ['Q1', 'Q2', 'Q3', 'Q4'], rightwards: true });
  });

  it('takes an id written as a number and as a string for one axis', () => {
    const layer = mount('bar', createElement(
      BarChart,
      { width: 400, height: 300, data: QUARTERS },
      createElement(XAxis, { key: 'bottom', xAxisId: 1, dataKey: 'quarter' }),
      createElement(XAxis, { key: 'top', xAxisId: 2, orientation: 'top', dataKey: 'quarter', reversed: true }),
      createElement(YAxis, { key: 'value' }),
      createElement(Bar, { key: 'bar', xAxisId: '2', dataKey: 'revenue', isAnimationActive: false }),
    ));

    expect(drawnLeftToRight(BARS, ['Q1', 'Q2', 'Q3', 'Q4'])).toEqual(['Q4', 'Q3', 'Q2', 'Q1']);
    expect(readAlong(layer, 4)).toEqual({ announced: ['Q4', 'Q3', 'Q2', 'Q1'], rightwards: true });
  });
});
