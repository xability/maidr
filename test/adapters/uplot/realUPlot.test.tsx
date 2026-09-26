/**
 * @jest-environment jsdom
 */

import type { UPlotInstance } from '@adapters/uplot/types';
import type { LiveDataEvent } from '@service/liveData';
import type { BarPoint, LinePoint, Maidr, ScatterPoint } from '@type/grammar';
import type { ReactNode } from 'react';
import { bindUPlot, maidrPlugin } from '@adapters/uplot/binder';
import { extractUPlotData } from '@adapters/uplot/extractor';
import { liveDataManager } from '@service/liveData';
import { act } from '@testing-library/react';
import { TraceType } from '@type/grammar';

/**
 * The adapter against the real uPlot package, rather than a hand-built
 * instance: the path-cache flags the kind inference relies on, the order in
 * which uPlot sets `status` and fires `ready`, and that its `setData` is
 * followed by a `draw` that the binder re-reads on.
 *
 * jsdom has no canvas, so the 2D context and `Path2D` are stubbed with no-op
 * recorders; uPlot's layout and path building are plain arithmetic and run
 * unchanged.
 */

const mockEvents: LiveDataEvent[] = [];

jest.mock('../../../src/maidr-component', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  const { liveDataManager: manager } = jest.requireActual<typeof import('../../../src/service/liveData')>(
    '../../../src/service/liveData',
  );
  return {
    Maidr: (props: { data: Maidr; children: ReactNode }): ReactNode => {
      useEffect(() => {
        const registration = manager.register(props.data, (event) => {
          mockEvents.push(event);
        });
        return () => registration.dispose();
      }, [props.data.id]);
      return <figure>{props.children}</figure>;
    },
  };
});

interface UPlotConstructor {
  new (opts: Record<string, unknown>, data: unknown, target?: HTMLElement): UPlotInstance & {
    setData: (data: unknown) => void;
    setSeries: (idx: number, opts: { show?: boolean }) => void;
    destroy: () => void;
  };
  paths: {
    bars: (opts?: Record<string, unknown>) => unknown;
    points: () => unknown;
    stepped: (opts?: Record<string, unknown>) => unknown;
  };
}

function noopProxy(): unknown {
  const fn = (): void => {};
  return new Proxy(fn, {
    get: (_target, key) => {
      if (key === 'measureText') {
        return () => ({ width: 10, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 5 });
      }
      if (key === 'canvas') {
        return undefined;
      }
      return fn;
    },
    set: () => true,
  });
}

let UPlot: UPlotConstructor;

beforeAll(() => {
  class FakePath2D {
    moveTo(): void {}
    lineTo(): void {}
    rect(): void {}
    arc(): void {}
    closePath(): void {}
    bezierCurveTo(): void {}
    addPath(): void {}
  }
  Object.assign(globalThis, { Path2D: FakePath2D });
  window.matchMedia = (): MediaQueryList => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;
  HTMLCanvasElement.prototype.getContext = (() => noopProxy()) as unknown as HTMLCanvasElement['getContext'];
  // eslint-disable-next-line ts/no-require-imports
  UPlot = require('uplot') as UPlotConstructor;
});

jest.spyOn(console, 'warn').mockImplementation(() => {});

/** Builds a chart and lets its first draw run. */
async function make(opts: Record<string, unknown>, data: unknown): Promise<InstanceType<UPlotConstructor>> {
  const target = document.createElement('div');
  document.body.appendChild(target);
  let u: InstanceType<UPlotConstructor> | undefined;
  await act(async () => {
    u = new UPlot({ width: 400, height: 200, ...opts }, data, target);
    await Promise.resolve();
  });
  if (!u) {
    throw new Error('uPlot was not constructed');
  }
  return u;
}

afterEach(() => {
  document.body.replaceChildren();
  mockEvents.length = 0;
});

describe('the real uPlot package', () => {
  it('leaves the path flags the kind inference reads', async () => {
    const u = await make({
      series: [
        {},
        { label: 'Line' },
        { label: 'Bars', paths: UPlot.paths.bars() },
        { label: 'Points', paths: UPlot.paths.points(), points: { show: true } },
        { label: 'Bare points', paths: () => null, points: { show: true } },
        { label: 'Steps', paths: UPlot.paths.stepped({ align: 1 }) },
      ],
    }, [[1, 2, 3], [1, 2, 3], [4, 5, 6], [7, 8, 9], [1, 1, 1], [3, 2, 1]]);

    expect(u.status).toBe(1);
    const layers = extractUPlotData(u, 'real').maidr.subplots[0][0].layers;
    expect(layers.map(l => [l.id, l.type])).toEqual([
      ['line-y', TraceType.LINE],
      ['bar-2', TraceType.BAR],
      ['scatter-3', TraceType.SCATTER],
      ['scatter-4', TraceType.SCATTER],
    ]);
    expect((layers[0].data as LinePoint[][]).map(row => row[0].z)).toEqual(['Line', 'Steps']);
    expect(layers[1].data as BarPoint[]).toHaveLength(3);
    expect(layers[2].data as ScatterPoint[]).toHaveLength(3);
    u.destroy();
  });

  it('reads the title uPlot renders and its time scale in seconds', async () => {
    const t0 = 1_700_000_000;
    const u = await make({
      title: 'CPU',
      series: [{}, { label: 'CPU %' }],
    }, [[t0, t0 + 60, t0 + 120], [1, 2, 3]]);
    const { maidr } = extractUPlotData(u, 'real');
    expect(maidr.title).toBe('CPU');
    const layer = maidr.subplots[0][0].layers[0];
    expect((layer.data as LinePoint[][])[0][0].x).toBe(t0 * 1000);
    expect(layer.axes?.x?.format?.type).toBe('date');
    u.destroy();
  });

  it('binds through the plugin and streams setData as appends', async () => {
    const u = await make({
      plugins: [maidrPlugin({ id: 'real-live' })],
      series: [{}, { label: 'Bars', paths: UPlot.paths.bars() }],
      scales: { x: { time: false } },
    }, [[1, 2, 3], [4, 5, 6]]);

    expect(document.querySelector('[data-maidr-uplot="real-live"]')?.contains(u.root)).toBe(true);
    expect(liveDataManager.getData('real-live')?.subplots[0][0].layers[0].id).toBe('bar-1');

    await act(async () => {
      u.setData([[2, 3, 4], [5, 6, 7]]);
      await Promise.resolve();
    });
    expect(mockEvents.map(e => e.appended?.trimmed)).toEqual([1]);
    expect(liveDataManager.getData('real-live')?.subplots[0][0].layers[0].data).toEqual([
      { x: 2, y: 5 },
      { x: 3, y: 6 },
      { x: 4, y: 7 },
    ]);

    act(() => u.destroy());
    expect(document.querySelector('[data-maidr-uplot]')).toBeNull();
    expect(liveDataManager.getData('real-live')).toBeUndefined();
  });

  it('binds a chart bound before its first draw once it is ready', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    let u: InstanceType<UPlotConstructor> | undefined;
    await act(async () => {
      u = new UPlot({ width: 400, height: 200, series: [{}, { label: 'v' }] }, [[1, 2], [3, 4]], target);
      expect(u.status).toBe(0);
      bindUPlot(u, { id: 'real-deferred' });
      await Promise.resolve();
    });
    expect(document.querySelector('[data-maidr-uplot="real-deferred"]')?.contains(u?.root ?? null)).toBe(true);
    act(() => u?.destroy());
    expect(document.querySelector('[data-maidr-uplot]')).toBeNull();
  });

  // A reader of a streaming bar panel who hides the series from the legend
  // should not find it re-read as a line on the next tick: the path cache is
  // only rebuilt for shown series, so a hidden bar series falls back to the
  // line default, and its bar layer is replaced by a line layer.
  it.failing('keeps a hidden bar series a bar across setData', async () => {
    const u = await make({
      series: [{}, { label: 'Bars', paths: UPlot.paths.bars() }, { label: 'Line' }],
      scales: { x: { time: false } },
    }, [[1, 2, 3], [4, 5, 6], [1, 2, 3]]);
    expect(extractUPlotData(u, 'real').maidr.subplots[0][0].layers[0].type).toBe(TraceType.BAR);

    await act(async () => {
      u.setSeries(1, { show: false });
      u.setData([[1, 2, 3, 4], [4, 5, 6, 7], [1, 2, 3, 4]]);
      await Promise.resolve();
    });
    const types = extractUPlotData(u, 'real').maidr.subplots[0][0].layers.map(l => l.type);
    expect(types).toEqual([TraceType.BAR, TraceType.LINE]);
    u.destroy();
  });
});
