/**
 * @jest-environment jsdom
 *
 * A Recharts bump chart read the way it is drawn.
 *
 * A bump chart is a `<LineChart>` of ranks, drawn under `<YAxis reversed>`
 * so rank 1 sits at the top. The layer said nothing about it, and a Recharts
 * chart of several lines carries no highlight for the core to measure the
 * drawing by, so Up moved to the next larger rank number: from Arsenal in
 * third, the bottom line, Up said "No more data to display", and Down moved
 * up the page to second. The adapter now reads where first place is drawn off
 * the `<YAxis>` and says so on the layer (`firstPlace`).
 *
 * `<Maidr>` is stood in for so the data `<MaidrRecharts>` hands it can be
 * read; the chart itself is drawn.
 */

import type { MaidrRechartsProps } from '@adapters/recharts/types';
import type { Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import { firstPlaceFor } from '@adapters/recharts/childProps';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { MaidrRecharts } from '@adapters/recharts/MaidrRecharts';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { cleanup, render } from '@testing-library/react';
import { createElement, Fragment } from 'react';
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

const seen: MaidrData[] = [];

jest.mock('../../../src/maidr-component', () => ({
  Maidr: ({ data, children }: { data: MaidrData; children: ReactNode }): ReactNode => {
    seen.push(data);
    return children;
  },
}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  cleanup();
  seen.length = 0;
});

/** The Recharts example's table: Arsenal starts third, Everton second, Chelsea first. */
const RANKS = [
  { matchday: 1, arsenal: 3, chelsea: 1, everton: 2 },
  { matchday: 2, arsenal: 1, chelsea: 2, everton: 3 },
  { matchday: 3, arsenal: 1, chelsea: 3, everton: 2 },
];

const CLUBS = ['arsenal', 'chelsea', 'everton'];

/**
 * The bump chart of the Recharts example, with its rank axis as given.
 * @param yAxis - The `<YAxis>` props, or null for a chart drawn without one
 * @returns The chart
 */
function chart(yAxis: Record<string, unknown> | null): ReactElement {
  return createElement(
    LineChart,
    { width: 400, height: 300, data: RANKS },
    createElement(XAxis, { dataKey: 'matchday' }),
    ...(yAxis === null ? [] : [createElement(YAxis, yAxis)]),
    ...CLUBS.map(key => createElement(Line, { key, dataKey: key, dot: true, isAnimationActive: false })),
  );
}

/**
 * The bump layer `<MaidrRecharts>` hands MAIDR for a chart.
 * @param child - The chart
 * @param props - Props to add, such as `firstPlace`
 * @returns The layer
 */
function bumpLayer(child: ReactElement, props: Partial<MaidrRechartsProps> = {}): MaidrLayer {
  render(createElement(MaidrRecharts, {
    id: 'bump',
    data: RANKS,
    chartType: 'bump',
    xKey: 'matchday',
    yKeys: CLUBS,
    xLabel: 'Matchday',
    yLabel: 'Position',
    ...props,
    children: child,
  }));
  const layer = seen.at(-1)?.subplots[0][0].layers[0];
  if (!layer) {
    throw new Error('MaidrRecharts handed MAIDR no layer');
  }
  return layer;
}

/**
 * Where the keys go from Arsenal in third on the first matchday.
 * @param layer - The bump layer
 * @param keys - The vertical moves, in order
 * @returns The club and rank announced after each move, or `edge` where the
 *   move was refused
 */
function walk(layer: MaidrLayer, keys: ('UPWARD' | 'DOWNWARD')[]): string[] {
  const trace = TraceFactory.create(layer);
  trace.moveToIndex(0, 0);
  const heard = keys.map((key) => {
    if (!trace.isMovable(key)) {
      return 'edge';
    }
    trace.moveOnce(key);
    const state = trace.state;
    return state.empty ? 'nothing' : `${String(state.text.z?.value)} ${String(state.text.cross?.value)}`;
  });
  trace.dispose();
  return heard;
}

describe('a Recharts bump chart', () => {
  it('says first place is at the top under a reversed rank axis', () => {
    const layer = bumpLayer(chart({ reversed: true, allowDecimals: false, domain: [1, 3] }));

    expect(layer.firstPlace).toBe('top');
  });

  it('moves Up to the place drawn above, one better, and Down to the place below', () => {
    const layer = bumpLayer(chart({ reversed: true, allowDecimals: false, domain: [1, 3] }));

    expect(walk(layer, ['UPWARD', 'UPWARD', 'UPWARD'])).toEqual(['everton 2', 'chelsea 1', 'edge']);
    expect(walk(layer, ['DOWNWARD'])).toEqual(['edge']);
  });

  it('says first place is at the bottom under an ordinary rank axis, which draws rank 1 lowest', () => {
    const layer = bumpLayer(chart({ allowDecimals: false }));

    expect(layer.firstPlace).toBe('bottom');
    expect(walk(layer, ['DOWNWARD', 'DOWNWARD'])).toEqual(['everton 2', 'chelsea 1']);
  });

  it('keeps a first place the chart declares', () => {
    const layer = bumpLayer(chart({ reversed: true }), { firstPlace: 'bottom' });

    expect(layer.firstPlace).toBe('bottom');
  });

  it('says nothing for a chart drawn without a rank axis', () => {
    const layer = bumpLayer(chart(null));

    expect(layer.firstPlace).toBeUndefined();
  });

  it('leaves first place off a chart that is not a bump chart', () => {
    render(createElement(MaidrRecharts, {
      id: 'line',
      data: RANKS,
      chartType: 'line',
      xKey: 'matchday',
      yKeys: CLUBS,
      children: chart({ reversed: true }),
    }));

    expect(seen.at(-1)?.subplots[0][0].layers[0].firstPlace).toBeUndefined();
  });
});

describe('a grid of Recharts bump charts', () => {
  it('carries the first place it declares onto every panel', () => {
    const maidr = convertRechartsToMaidr({
      id: 'grid',
      data: RANKS,
      xKey: 'matchday',
      firstPlace: 'top',
      subplots: [[
        { chartType: 'bump', yKeys: CLUBS },
        { chartType: 'bump', yKeys: CLUBS.slice(0, 2) },
      ]],
    });

    expect(maidr.subplots[0].map(panel => panel.layers[0].firstPlace)).toEqual(['top', 'top']);
  });
});

describe('firstPlaceFor', () => {
  it('reads a rank axis nested inside a container or a fragment', () => {
    const nested = createElement(ResponsiveContainer, {
      width: 400,
      height: 300,
      children: createElement(Fragment, null, chart({ reversed: true })),
    });

    expect(firstPlaceFor(nested)).toBe('top');
  });

  it('reads the first rank axis of a chart that draws two', () => {
    const twoAxes = createElement(
      LineChart,
      { width: 400, height: 300, data: RANKS },
      createElement(YAxis, { yAxisId: 'rank', reversed: true }),
      createElement(YAxis, { yAxisId: 'other', orientation: 'right' }),
    );

    expect(firstPlaceFor(twoAxes)).toBe('top');
  });
});
