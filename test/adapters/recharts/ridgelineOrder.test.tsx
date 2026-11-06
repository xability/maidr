/**
 * @jest-environment jsdom
 *
 * The Recharts ridgeline example read bottom ridge first, as it is drawn.
 *
 * `RidgelineTrace` reads its first curve as the lowest ridge and steps Up to
 * the next one listed. The example draws Jan on top and Oct at the bottom,
 * offsetting the first month highest as the recipe does, and the adapter
 * listed the months in the order they first appear in the data, Jan first:
 * the reader started on the top ridge, Up moved down the page through Apr and
 * Jul to Oct, and Down from Jan was refused. The ridges are now listed by the
 * offset each is drawn at, read off the key the `<Area>`s draw, and each is
 * paired with its own band.
 *
 * `<Maidr>` is stood in for so the layer `<MaidrRecharts>` hands it can be
 * read; the chart itself is drawn.
 */

import type { Maidr as MaidrData, MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import { MaidrRecharts } from '@adapters/recharts/MaidrRecharts';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';
import { RidgelineExample } from '../../../examples/recharts/examples/RidgelineExample';

const seen: MaidrData[] = [];

jest.mock('../../../src/maidr-component', () => ({
  Maidr: ({ data, children }: { data: MaidrData; children: ReactNode }): ReactNode => {
    seen.push(data);
    return createElement('article', { id: `maidr-article-${data.id}` }, children);
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

/**
 * Draws the example and reads the layer it hands MAIDR.
 * @returns The ridgeline layer
 */
function drawExample(): MaidrLayer {
  render(createElement(RidgelineExample));
  const found = seen.at(-1)?.subplots[0][0].layers[0];
  if (!found) {
    throw new Error('MaidrRecharts handed MAIDR no layer');
  }
  return found;
}

describe('the Recharts ridgeline example', () => {
  it('lists the months bottom ridge first, as they are drawn', () => {
    const layer = drawExample();

    const months = (layer.data as ViolinKdePoint[][]).map(curve => curve[0].x);

    expect(months).toEqual(['Oct', 'Jul', 'Apr', 'Jan']);
  });

  it('names each month\'s own band', () => {
    const layer = drawExample();

    expect(Array.isArray(layer.selectors)).toBe(true);

    const bands = (layer.selectors as string[]).map(selector =>
      [...document.querySelectorAll(selector)].map(band => band.getAttribute('name')));

    expect(bands).toEqual([['Oct'], ['Jul'], ['Apr'], ['Jan']]);
  });

  it('moves Up to the ridge drawn above and Down to the one below', () => {
    const trace = TraceFactory.create(drawExample());
    trace.moveToIndex(0, 0);
    const heard: unknown[] = [];

    for (const direction of ['UPWARD', 'UPWARD', 'DOWNWARD'] as const) {
      trace.moveOnce(direction);
      const { text } = trace.state as { text: { section?: unknown } };
      heard.push(text.section);
    }
    trace.dispose();

    expect(heard).toEqual(['Jul', 'Apr', 'Jul']);
  });
});

describe('a Recharts ridgeline whose drawn key cannot be read', () => {
  const rows = [
    { month: 'Jan', temp: 0, density: 0.1, plotted: 1.1 },
    { month: 'Feb', temp: 0, density: 0.3, plotted: 0.3 },
  ];
  const plotted = (row: unknown): unknown => (row as { plotted: number }).plotted;
  const ridges = (id: string, dataKey: string | ((row: unknown) => unknown)): ReactElement => createElement(MaidrRecharts, {
    id,
    data: rows,
    chartType: 'ridgeline',
    xKey: 'temp',
    ridgelineConfig: { groupKey: 'month', valueKey: 'temp', densityKey: 'density' },
    children: createElement(
      AreaChart,
      { width: 400, height: 300 },
      createElement(XAxis, { dataKey: 'temp', type: 'number' }),
      createElement(YAxis, { type: 'number' }),
      ...['Jan', 'Feb'].map(month => createElement(Area, {
        key: month,
        data: rows.filter(row => row.month === month),
        dataKey,
        isAnimationActive: false,
      })),
    ),
  });

  it('says once that its ridges keep first-appearance order, and nothing for a key it reads', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { rerender } = render(ridges('function-key-ridges', plotted));
      rerender(ridges('function-key-ridges', plotted));
      render(ridges('string-key-ridges', 'plotted'));

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('Ridgeline "function-key-ridges" has no ridgelineConfig.plottedKey, and no <Area>');
    } finally {
      warn.mockRestore();
    }
  });

  it('says it again when the chart is mounted again', () => {
    // Each mounted chart remembers what it has said, so one mounted afresh
    // under the same id has said nothing yet.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(ridges('remounted-ridges', plotted)).unmount();
      render(ridges('remounted-ridges', plotted));

      expect(warn).toHaveBeenCalledTimes(2);
      expect(String(warn.mock.calls[1][0])).toContain('Ridgeline "remounted-ridges" has no ridgelineConfig.plottedKey');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('a Recharts ridgeline drawn on a reversed axis', () => {
  it('lists the ridges from the most offset down, as the reversed axis draws them', () => {
    // Jan is offset 1 and Feb 0: on `<YAxis reversed>` Jan is drawn below Feb.
    const rows = [
      { month: 'Jan', temp: 0, density: 0.1, plotted: 1.1 },
      { month: 'Jan', temp: 5, density: 0.2, plotted: 1.2 },
      { month: 'Feb', temp: 0, density: 0.3, plotted: 0.3 },
      { month: 'Feb', temp: 5, density: 0.1, plotted: 0.1 },
    ];
    render(createElement(MaidrRecharts, {
      id: 'reversed-ridges',
      data: rows,
      chartType: 'ridgeline',
      xKey: 'temp',
      ridgelineConfig: { groupKey: 'month', valueKey: 'temp', densityKey: 'density' },
      children: createElement(
        AreaChart,
        { width: 400, height: 300 },
        createElement(XAxis, { dataKey: 'temp', type: 'number' }),
        createElement(YAxis, { type: 'number', reversed: true }),
        ...['Jan', 'Feb'].map(month => createElement(Area, {
          key: month,
          data: rows.filter(row => row.month === month),
          dataKey: 'plotted',
          name: month,
          isAnimationActive: false,
        })),
      ),
    }));
    const layer = seen.at(-1)?.subplots[0][0].layers[0];

    expect((layer?.data as ViolinKdePoint[][]).map(curve => curve[0].x)).toEqual(['Jan', 'Feb']);
  });

  it('reads the ridges bottom first on an ordinary axis drawn before a reversed one', () => {
    // The ridges are drawn on the first `<YAxis>`; the reversed one after it
    // belongs to something else. Feb, offset 0, is the bottom ridge.
    const rows = [
      { month: 'Jan', temp: 0, density: 0.1, plotted: 1.1 },
      { month: 'Jan', temp: 5, density: 0.2, plotted: 1.2 },
      { month: 'Feb', temp: 0, density: 0.3, plotted: 0.3 },
      { month: 'Feb', temp: 5, density: 0.1, plotted: 0.1 },
    ];
    render(createElement(MaidrRecharts, {
      id: 'two-axis-ridges',
      data: rows,
      chartType: 'ridgeline',
      xKey: 'temp',
      ridgelineConfig: { groupKey: 'month', valueKey: 'temp', densityKey: 'density' },
      children: createElement(
        AreaChart,
        { width: 400, height: 300 },
        createElement(XAxis, { dataKey: 'temp', type: 'number' }),
        createElement(YAxis, { type: 'number' }),
        createElement(YAxis, { yAxisId: 'other', type: 'number', orientation: 'right', reversed: true }),
        ...['Jan', 'Feb'].map(month => createElement(Area, {
          key: month,
          data: rows.filter(row => row.month === month),
          dataKey: 'plotted',
          name: month,
          isAnimationActive: false,
        })),
      ),
    }));
    const layer = seen.at(-1)?.subplots[0][0].layers[0];

    expect((layer?.data as ViolinKdePoint[][]).map(curve => curve[0].x)).toEqual(['Feb', 'Jan']);
  });
});
