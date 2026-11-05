/**
 * @jest-environment jsdom
 *
 * Each series of a Recharts chart of several lines, areas or radars
 * highlighted through its own dots.
 *
 * Recharts 3 draws every series' dots into one layer, one group per series,
 * and writes nothing on them that says which series they belong to. The
 * adapter emitted no selectors for a chart of several series, so the stacked
 * and 100% areas, the radar, the bump chart and the survival curve had no
 * highlight on any point. Each series' dots are now named by their place
 * among the series drawn with dots, read off the chart's own elements.
 *
 * Real charts are drawn, because the place of a series' dots is a fact about
 * the DOM Recharts renders. `<Maidr>` is stood in for so the data
 * `<MaidrRecharts>` hands it can be read; the stand-in draws the article
 * MAIDR wraps a chart in, which every selector is scoped to.
 */

import type { MaidrRechartsProps } from '@adapters/recharts/types';
import type { Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import { dotSeriesFor } from '@adapters/recharts/childProps';
import { MaidrRecharts } from '@adapters/recharts/MaidrRecharts';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { cleanup, render } from '@testing-library/react';
import { createElement, Fragment } from 'react';
import { Area, AreaChart, Line, LineChart, PolarAngleAxis, Radar, RadarChart, XAxis, YAxis } from 'recharts';

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

const rankRows = [
  { matchday: 1, arsenal: 3, chelsea: 1, everton: 2 },
  { matchday: 2, arsenal: 1, chelsea: 2, everton: 3 },
  { matchday: 3, arsenal: 1, chelsea: 3, everton: 2 },
  { matchday: 4, arsenal: 2, chelsea: 3, everton: 1 },
];

const sessionRows = [
  { month: 'Jan', organic: 4000, paid: 2400, referral: 1200 },
  { month: 'Feb', organic: 3000, paid: 1398, referral: 1500 },
  { month: 'Mar', organic: 2000, paid: 2800, referral: 1800 },
];

const skillRows = [
  { skill: 'Speed', alice: 4, bob: 3 },
  { skill: 'Power', alice: 2, bob: 5 },
  { skill: 'Range', alice: 5, bob: 2 },
];

const armRows = [
  { months: 0, treated: 1, control: 1 },
  { months: 6, treated: 0.9, control: 0.8 },
  { months: 12, treated: 0.7, control: 0.5 },
];

/**
 * Draws a chart through `<MaidrRecharts>` and returns the layer it built.
 * @param props - What the chart declares to the adapter
 * @param chart - The Recharts chart
 * @returns The layer handed to `<Maidr>`
 */
function mount(props: Omit<MaidrRechartsProps, 'children'>, chart: ReactElement): MaidrLayer {
  render(createElement(MaidrRecharts, { ...props, children: chart }));
  const data = seen.at(-1);
  if (data === undefined) {
    throw new Error('MaidrRecharts handed <Maidr> no data');
  }
  return data.subplots[0][0].layers[0];
}

/**
 * The series each selector's matches belong to, read off the `name` Recharts
 * copies onto every dot from its series.
 * @param layer - The layer
 * @returns Per selector, the names its matches carry
 */
function matchedSeries(layer: MaidrLayer): (string | null)[][] {
  expect(Array.isArray(layer.selectors)).toBe(true);
  return (layer.selectors as string[]).map(selector =>
    [...document.querySelectorAll(selector)].map(dot => dot.getAttribute('name')));
}

/**
 * For every point the core can stand on, the series of the dot it highlights,
 * and whether that series is one the point is announced with. A point two
 * series share is announced with both ("intersection at (treated, control)").
 * @param layer - The layer
 * @param series - How many series it has
 * @param points - How many points each has
 * @returns One line per point: the highlighted dot's series, followed by what
 *   was announced when that is another series
 */
function highlightedAgainstAnnounced(layer: MaidrLayer, series: number, points: number): string[] {
  const trace = TraceFactory.create(layer);
  const lines: string[] = [];
  for (let row = 0; row < series; row++) {
    for (let col = 0; col < points; col++) {
      const state = trace.getStateAt(row, col);
      if (state.empty || state.highlight.empty) {
        lines.push(`${row},${col}: no highlight`);
        continue;
      }
      const { elements } = state.highlight;
      const dot = Array.isArray(elements) ? elements[0] : elements;
      const name = dot.getAttribute('name') ?? '';
      const announced = String(state.text.z?.value);
      const named = announced.split(/[(), ]+/).includes(name);
      lines.push(`${row},${col}: ${name}${named ? '' : `, announced ${announced}`}`);
    }
  }
  trace.dispose();
  return lines;
}

/**
 * The lines {@link highlightedAgainstAnnounced} gives when every highlight is
 * on the series announced.
 * @param names - The series, in the payload's order
 * @param points - How many points each has
 * @returns The expected lines
 */
function onTheirOwnSeries(names: string[], points: number): string[] {
  return names.flatMap((name, row) =>
    Array.from({ length: points }, (_, col) => `${row},${col}: ${name}`));
}

describe('a chart of several series, each drawn with its dots', () => {
  it('names each line\'s own dots on a bump chart', () => {
    const layer = mount(
      { id: 'bump-dots', data: rankRows, chartType: 'bump', xKey: 'matchday', yKeys: ['arsenal', 'chelsea', 'everton'] },
      createElement(
        LineChart,
        { width: 400, height: 300, data: rankRows },
        createElement(XAxis, { dataKey: 'matchday' }),
        createElement(YAxis, { reversed: true }),
        ...['arsenal', 'chelsea', 'everton'].map(key =>
          createElement(Line, { key, dataKey: key, name: key, dot: true, isAnimationActive: false })),
      ),
    );

    expect(matchedSeries(layer)).toEqual(['arsenal', 'chelsea', 'everton'].map(key => Array.from({ length: 4 }, () => key)));
    expect(highlightedAgainstAnnounced(layer, 3, 4)).toEqual(onTheirOwnSeries(['arsenal', 'chelsea', 'everton'], 4));
  });

  it('names each band\'s own dots on a stacked area chart', () => {
    const layer = mount(
      { id: 'area-dots', data: sessionRows, chartType: 'stacked_area', xKey: 'month', yKeys: ['organic', 'paid', 'referral'] },
      createElement(
        AreaChart,
        { width: 400, height: 300, data: sessionRows },
        createElement(XAxis, { dataKey: 'month' }),
        createElement(YAxis, {}),
        ...['organic', 'paid', 'referral'].map(key =>
          createElement(Area, { key, dataKey: key, name: key, stackId: 'a', dot: true, isAnimationActive: false })),
      ),
    );

    expect(matchedSeries(layer)).toEqual(['organic', 'paid', 'referral'].map(key => Array.from({ length: 3 }, () => key)));
    const announced = highlightedAgainstAnnounced(layer, 3, 3);
    expect(announced).toHaveLength(9);
    expect(announced.filter(line => !/^\d,\d: \w+$/.test(line))).toEqual([]);
  });

  it('names each polygon\'s own dots on a radar chart', () => {
    const layer = mount(
      { id: 'radar-dots', data: skillRows, chartType: 'radar', xKey: 'skill', yKeys: ['alice', 'bob'] },
      createElement(
        RadarChart,
        { width: 400, height: 400, data: skillRows },
        createElement(PolarAngleAxis, { dataKey: 'skill' }),
        ...['alice', 'bob'].map(key =>
          createElement(Radar, { key, dataKey: key, name: key, dot: true, isAnimationActive: false })),
      ),
    );

    expect(matchedSeries(layer)).toEqual(['alice', 'bob'].map(key => Array.from({ length: 3 }, () => key)));
    expect(highlightedAgainstAnnounced(layer, 2, 3)).toEqual(onTheirOwnSeries(['alice', 'bob'], 3));
  });

  it('names each arm\'s own dots on a survival chart', () => {
    const layer = mount(
      {
        id: 'survival-dots',
        data: armRows,
        chartType: 'survival',
        xKey: 'months',
        yKeys: ['treated', 'control'],
        fillKeys: ['treated', 'control'],
      },
      createElement(
        LineChart,
        { width: 400, height: 300, data: armRows },
        createElement(XAxis, { dataKey: 'months' }),
        createElement(YAxis, {}),
        ...['treated', 'control'].map(key =>
          createElement(Line, { key, type: 'stepAfter', dataKey: key, name: key, dot: true, isAnimationActive: false })),
      ),
    );

    expect(matchedSeries(layer)).toEqual(['treated', 'control'].map(key => Array.from({ length: 3 }, () => key)));
    expect(highlightedAgainstAnnounced(layer, 2, 3)).toEqual(onTheirOwnSeries(['treated', 'control'], 3));
  });

  it('pairs each series with its own dots when the lines are drawn in another order', () => {
    const layer = mount(
      { id: 'reordered-dots', data: rankRows, chartType: 'line', xKey: 'matchday', yKeys: ['arsenal', 'chelsea', 'everton'] },
      createElement(
        LineChart,
        { width: 400, height: 300, data: rankRows },
        ...['everton', 'arsenal', 'chelsea'].map(key =>
          createElement(Line, { key, dataKey: key, name: key, isAnimationActive: false })),
      ),
    );

    expect(matchedSeries(layer)).toEqual(['arsenal', 'chelsea', 'everton'].map(key => Array.from({ length: 4 }, () => key)));
  });
});

describe('a chart of several series, one drawn without its dots', () => {
  it('is left unhighlighted rather than outlining another series\' dots', () => {
    const layer = mount(
      { id: 'undotted', data: rankRows, chartType: 'line', xKey: 'matchday', yKeys: ['arsenal', 'chelsea', 'everton'] },
      createElement(
        LineChart,
        { width: 400, height: 300, data: rankRows },
        createElement(Line, { dataKey: 'arsenal', name: 'arsenal', isAnimationActive: false }),
        createElement(Line, { dataKey: 'chelsea', name: 'chelsea', dot: false, isAnimationActive: false }),
        createElement(Line, { dataKey: 'everton', name: 'everton', isAnimationActive: false }),
      ),
    );

    expect(layer.selectors).toBeUndefined();
  });
});

describe('reading which series draw dots off the chart', () => {
  it('counts a <Line> as drawing dots unless told otherwise, an <Area> and a <Radar> only when told', () => {
    const lines = createElement(
      LineChart,
      null,
      createElement(Line, { dataKey: 'a' }),
      createElement(Line, { dataKey: 'b', dot: false }),
      createElement(Line, { dataKey: 'c', hide: true }),
      createElement(Line, { dataKey: (row: { d: number }) => row.d }),
    );
    const areas = createElement(
      AreaChart,
      null,
      createElement(Area, { dataKey: 'a' }),
      createElement(Area, { dataKey: 'b', dot: { r: 4 } }),
    );

    expect(dotSeriesFor(lines, 'line')).toEqual(['a', null]);
    expect(dotSeriesFor(areas, 'stacked_area')).toEqual(['b']);
    expect(dotSeriesFor(createElement(RadarChart, null, createElement(Radar, { dataKey: 'a' })), 'radar')).toEqual([]);
  });

  it('finds the series through fragments and wrappers, in the order they are written', () => {
    const chart = createElement(
      'div',
      null,
      createElement(
        LineChart,
        null,
        createElement(Fragment, null, createElement(Line, { dataKey: 'b' })),
        createElement(Line, { dataKey: 'a' }),
      ),
    );

    expect(dotSeriesFor(chart, 'bump')).toEqual(['b', 'a']);
  });

  it('reads nothing for a chart type whose series draw no dots', () => {
    expect(dotSeriesFor(createElement(LineChart, null), 'bar')).toBeUndefined();
  });
});
