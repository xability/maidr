/**
 * @jest-environment jsdom
 */

import type { LiveDataEvent } from '@service/liveData';
import type { Maidr, NavigationTarget } from '@type/grammar';
import type { ReactNode } from 'react';
import type { FakeUPlot } from './helpers';
import { bindUPlot, maidrPlugin } from '@adapters/uplot/binder';
import { liveDataManager } from '@service/liveData';
import { act } from '@testing-library/react';
import { BAR_PATHS, fakeUPlot, fire, LINE_PATHS, POINT_PATHS } from './helpers';

/**
 * What the stand-in `<Maidr>` saw: every `data` prop it was rendered with,
 * every live event delivered to it, and every navigation target handed to it.
 */
const mockMaidr: {
  renders: Maidr[];
  events: LiveDataEvent[];
  targets: Array<NavigationTarget | null>;
} = { renders: [], events: [], targets: [] };

/**
 * `<Maidr>` stands in for itself, as in the Tableau binder tests: the real
 * component reaches ESM-only modules through the chat panel, and this project
 * compiles to CommonJS. The stand-in does the two things the binder relies
 * on -- it renders its children inside a figure, and registers with the live
 * data manager on mount, as the real component does -- and records what it
 * was given.
 */
jest.mock('../../../src/maidr-component', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  const { liveDataManager: manager } = jest.requireActual<typeof import('../../../src/service/liveData')>(
    '../../../src/service/liveData',
  );
  return {
    Maidr: (props: { data: Maidr; children: ReactNode }): ReactNode => {
      mockMaidr.renders.push(props.data);
      const id = props.data.id;
      useEffect(() => {
        const registration = manager.register(
          props.data,
          (event) => {
            mockMaidr.events.push(event);
          },
          (target) => {
            mockMaidr.targets.push(target);
            return true;
          },
        );
        return () => registration.dispose();
      }, [id]);
      return <figure id={`maidr-figure-${id}`}>{props.children}</figure>;
    },
  };
});

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

/** The onNavigate the binder handed MAIDR most recently. */
function onNavigate(): NonNullable<Maidr['onNavigate']> {
  const last = mockMaidr.renders[mockMaidr.renders.length - 1];
  if (!last?.onNavigate) {
    throw new Error('no onNavigate was rendered');
  }
  return last.onNavigate;
}

function boxes(u: FakeUPlot): Array<Record<string, string>> {
  return Array.from(u.over.querySelectorAll<HTMLElement>('[data-maidr-uplot-highlight]'), node => ({
    left: node.style.left,
    top: node.style.top,
    width: node.style.width,
    height: node.style.height,
  }));
}

/** A two-series line chart on x 0..10 (400px) and y 0..100 (200px). */
function lineChart(): FakeUPlot {
  return fakeUPlot({
    title: 'Load',
    data: [[1, 2, 3], [10, 50, null], [20, 30, 40]],
    series: [{}, { label: 'CPU', _paths: LINE_PATHS }, { label: 'Mem', _paths: LINE_PATHS }],
  });
}

let host: HTMLDivElement;
let after: HTMLElement;
const handles: Array<{ dispose: () => void }> = [];

/** Puts the chart's root in the page, between nothing and a sibling. */
function place(u: FakeUPlot): void {
  host.insertBefore(u.root, after);
}

function bind(u: FakeUPlot, options = {}): ReturnType<typeof bindUPlot> {
  let handle: ReturnType<typeof bindUPlot> | undefined;
  act(() => {
    handle = bindUPlot(u, options);
  });
  if (!handle) {
    throw new Error('bindUPlot returned nothing');
  }
  handles.push(handle);
  return handle;
}

beforeEach(() => {
  mockMaidr.renders = [];
  mockMaidr.events = [];
  mockMaidr.targets = [];
  warn.mockClear();
  host = document.createElement('div');
  after = document.createElement('p');
  host.appendChild(after);
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => {
    for (const handle of handles.splice(0)) {
      handle.dispose();
    }
  });
  document.body.replaceChildren();
});

describe('mounting', () => {
  it('wraps the chart root in a MAIDR figure where it stood', () => {
    const u = lineChart();
    place(u);
    const handle = bind(u, { id: 'load' });

    const container = host.querySelector('[data-maidr-uplot]');
    expect(container?.getAttribute('data-maidr-uplot')).toBe('load');
    expect(container?.nextSibling).toBe(after);
    expect(container?.querySelector('figure#maidr-figure-load')?.contains(u.root)).toBe(true);
    expect(u.over.querySelector('[data-maidr-uplot-overlay]')).not.toBeNull();
    expect(handle.id).toBe('load');
    expect(mockMaidr.renders[0]).toMatchObject({ id: 'load', title: 'Load', live: true });
    expect(liveDataManager.getData('load')).toBeDefined();
  });

  it('returns the same handle when bound twice', () => {
    const u = lineChart();
    place(u);
    const first = bind(u);
    expect(bind(u)).toBe(first);
    expect(host.querySelectorAll('[data-maidr-uplot]')).toHaveLength(1);
  });

  it('derives the id from the root id', () => {
    const u = fakeUPlot({ rootId: 'cpu', data: [[1], [2]], series: [{}, {}] });
    place(u);
    expect(bind(u).id).toBe('maidr-uplot-cpu');
  });

  it('throws for a drawn chart that is not in the document', () => {
    expect(() => bindUPlot(lineChart())).toThrow('must be in the document');
  });
});

describe('navigation drawn onto the chart', () => {
  it('boxes a line vertex and moves uPlot\'s cursor to it', () => {
    const u = lineChart();
    place(u);
    bind(u);

    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
    // x 2 of 0..10 over 400px, y 50 of 0..100 over 200px.
    expect(boxes(u)).toEqual([{ left: '74px', top: '94px', width: '12px', height: '12px' }]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 80, top: 100 });

    act(() => onNavigate()({ layerId: 'line-y', row: 1, col: 2 }));
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 120, top: 120 });
  });

  it('draws no box on a gap but still marks its x with the cursor', () => {
    const u = lineChart();
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 2 }));
    expect(boxes(u)).toEqual([]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 120, top: -10 });
  });

  it('boxes a bar from its base to its tip', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 50, 30]],
      series: [{}, { label: 'Sales', _paths: BAR_PATHS }],
    });
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 1 }));
    // Neighbours 40px away, 60% of that wide; from y 0 (200px) up to 50 (100px).
    expect(boxes(u)).toEqual([{ left: '68px', top: '100px', width: '24px', height: '100px' }]);
  });

  it('boxes every selected point of a scatter layer', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, null, 30]],
      series: [{}, { label: 'Dots', _paths: POINT_PATHS }],
    });
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'scatter-1', row: 0, col: 0, pointIndices: [0, 1] }));
    // The second MAIDR point is data index 2: the null was skipped.
    expect(boxes(u).map(b => [b.left, b.top])).toEqual([['34px', '174px'], ['114px', '134px']]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 40, top: 180 });
  });

  it('clears the box and hides the cursor when the reader leaves', () => {
    const u = lineChart();
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 0 }));
    act(() => onNavigate()(null));
    expect(boxes(u)).toEqual([]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: -10, top: -10 });
  });

  it('draws nothing for a layer the chart no longer has', () => {
    const u = lineChart();
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 0 }));
    act(() => onNavigate()({ layerId: 'bar-9', row: 0, col: 0 }));
    expect(boxes(u)).toEqual([]);
  });

  it('redraws the highlight after a resize', () => {
    const u = lineChart();
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
    u.setCursor.mockClear();
    act(() => fire(u, 'setSize'));
    expect(u.setCursor).toHaveBeenCalledWith({ left: 80, top: 100 });
    expect(boxes(u)).toHaveLength(1);
  });

  it('uses the highlight color', () => {
    const u = lineChart();
    place(u);
    bind(u, { highlightColor: 'red' });
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
    const box = u.over.querySelector<HTMLElement>('[data-maidr-uplot-highlight]');
    expect(box?.style.outline).toBe('2px solid red');
  });
});

describe('clicks on the plot', () => {
  function click(u: FakeUPlot, idx: number | null): void {
    u.cursor.idx = idx;
    act(() => {
      u.over.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });
  }

  it('moves the reader to the point under the cursor', () => {
    const u = lineChart();
    place(u);
    bind(u);
    click(u, 1);
    expect(mockMaidr.targets).toEqual([{ layerId: 'line-y', row: 0, col: 1 }]);
  });

  it('prefers the series uPlot has focused', () => {
    const u = lineChart();
    (u.series[2] as { _focus?: boolean })._focus = true;
    place(u);
    bind(u);
    click(u, 2);
    expect(mockMaidr.targets).toEqual([{ layerId: 'line-y', row: 1, col: 2 }]);
  });

  it('names a scatter point by its index', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, null, 30]],
      series: [{}, { _paths: POINT_PATHS }],
    });
    place(u);
    bind(u);
    click(u, 2);
    expect(mockMaidr.targets).toEqual([{ layerId: 'scatter-1', pointIndex: 1 }]);
  });

  it('ignores a click with no point under the cursor', () => {
    const u = lineChart();
    place(u);
    bind(u);
    click(u, null);
    expect(mockMaidr.targets).toEqual([]);
  });
});

describe('following the chart through its hooks', () => {
  it('re-reads on the draw after setData and streams an append', () => {
    const u = lineChart();
    place(u);
    const handle = bind(u);

    u.data = [[1, 2, 3, 4], [10, 50, null, 60], [20, 30, 40, 50]];
    act(() => fire(u, 'setData'));
    expect(mockMaidr.events).toEqual([]);
    act(() => fire(u, 'draw'));

    expect(mockMaidr.events.map(e => e.appended?.row)).toEqual([0, 1]);
    const layer = liveDataManager.getData(handle.id)?.subplots[0][0].layers[0];
    expect((layer?.data as unknown[][])[0]).toHaveLength(4);

    // A draw with no data change reads nothing.
    act(() => fire(u, 'draw'));
    expect(mockMaidr.events).toHaveLength(2);
  });

  it('replaces the data when an update is not an append', () => {
    const u = lineChart();
    place(u);
    bind(u);
    u.data = [[1, 2, 3], [11, 50, null], [20, 30, 40]];
    act(() => {
      fire(u, 'setData');
      fire(u, 'draw');
    });
    expect(mockMaidr.events).toHaveLength(1);
    expect(mockMaidr.events[0].appended).toBeUndefined();
    expect(mockMaidr.events[0].maidr.onNavigate).toBeDefined();
  });

  it('re-reads when refresh is called', () => {
    const u = lineChart();
    place(u);
    const handle = bind(u);
    u.data = [[1, 2, 3, 4], [10, 50, null, 60], [20, 30, 40, 50]];
    act(() => handle.refresh());
    expect(mockMaidr.events).toHaveLength(2);
  });

  it('keeps the previous reading when the update is unreadable', () => {
    const u = lineChart();
    place(u);
    const handle = bind(u);
    u.data = [[]];
    act(() => {
      fire(u, 'setData');
      fire(u, 'draw');
    });
    expect(mockMaidr.events).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('keeping the previous reading'));
    expect(liveDataManager.getData(handle.id)).toBeDefined();
  });

  it('unmounts on destroy without putting the root back', () => {
    const u = lineChart();
    place(u);
    const handle = bind(u);
    // uPlot takes its root out of the page before firing destroy.
    act(() => fire(u, 'destroy'));

    expect(host.querySelector('[data-maidr-uplot]')).toBeNull();
    expect(u.root.isConnected).toBe(false);
    expect(u.over.querySelector('[data-maidr-uplot-overlay]')).toBeNull();
    expect(liveDataManager.getData(handle.id)).toBeUndefined();
    for (const name of ['setData', 'draw', 'setSize', 'destroy']) {
      expect(u.hooks[name]).toEqual([]);
    }
  });

  it('keeps hooks registered before it', () => {
    const u = lineChart();
    const own = jest.fn();
    u.hooks.draw = [own];
    place(u);
    bind(u);
    act(() => fire(u, 'draw'));
    expect(own).toHaveBeenCalledTimes(1);
    act(() => fire(u, 'destroy'));
    expect(u.hooks.draw).toEqual([own]);
  });
});

describe('dispose', () => {
  it('puts the root back where it stood and detaches everything', () => {
    const u = lineChart();
    place(u);
    const handle = bind(u);
    act(() => handle.dispose());

    expect(u.root.parentElement).toBe(host);
    expect(u.root.nextSibling).toBe(after);
    expect(host.querySelector('[data-maidr-uplot]')).toBeNull();
    expect(u.over.querySelector('[data-maidr-uplot-overlay]')).toBeNull();
    expect(liveDataManager.getData(handle.id)).toBeUndefined();

    // Disposed: hooks and clicks no longer reach MAIDR, and binding again works.
    u.cursor.idx = 0;
    u.over.dispatchEvent(new MouseEvent('click', { button: 0 }));
    expect(mockMaidr.targets).toEqual([]);
    const again = bind(u);
    expect(again).not.toBe(handle);
    expect(host.querySelectorAll('[data-maidr-uplot]')).toHaveLength(1);
  });

  it('is safe to call twice', () => {
    const u = lineChart();
    place(u);
    const handle = bind(u);
    act(() => {
      handle.dispose();
      handle.dispose();
    });
    expect(u.root.parentElement).toBe(host);
  });
});

describe('a chart that has not drawn yet', () => {
  it('binds on its ready hook', () => {
    const u = lineChart();
    u.status = 0;
    place(u);
    const pending = bind(u);
    expect(bind(u)).toBe(pending);
    expect(host.querySelector('[data-maidr-uplot]')).toBeNull();

    u.status = 1;
    act(() => fire(u, 'ready'));
    expect(host.querySelector('[data-maidr-uplot]')).not.toBeNull();
    expect(u.hooks.ready).toEqual([]);

    // The pending handle drives the binding it became.
    act(() => pending.dispose());
    expect(host.querySelector('[data-maidr-uplot]')).toBeNull();
    expect(u.root.parentElement).toBe(host);
  });

  it('does not bind when disposed before ready', () => {
    const u = lineChart();
    u.status = 0;
    place(u);
    const pending = bind(u);
    act(() => pending.dispose());
    u.status = 1;
    act(() => fire(u, 'ready'));
    expect(host.querySelector('[data-maidr-uplot]')).toBeNull();
  });

  it('warns instead of throwing when the ready chart is unreadable', () => {
    const u = fakeUPlot({ data: [[1], [2]], series: [{}, { maidr: false }], status: 0 });
    place(u);
    bind(u);
    act(() => fire(u, 'ready'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Skipping chart'));
    expect(host.querySelector('[data-maidr-uplot]')).toBeNull();
  });
});

describe('maidrPlugin', () => {
  it('binds on ready', () => {
    const u = lineChart();
    place(u);
    act(() => maidrPlugin({ id: 'plugged' }).hooks.ready?.(u));
    handles.push({ dispose: () => bindUPlot(u).dispose() });
    expect(host.querySelector('[data-maidr-uplot="plugged"]')).not.toBeNull();
  });

  it('does nothing when disabled', () => {
    const u = lineChart();
    place(u);
    act(() => maidrPlugin({ enabled: false }).hooks.ready?.(u));
    expect(host.querySelector('[data-maidr-uplot]')).toBeNull();
    expect(u.hooks).toEqual({});
  });

  it.each([
    ['has nothing to read', () => fakeUPlot({ data: [[1]], series: [{}] }), true],
    ['is not in the document', () => lineChart(), false],
  ])('warns and skips a chart that %s', (_name, make, attach) => {
    const u = make();
    if (attach) {
      place(u);
    }
    expect(() => act(() => maidrPlugin().hooks.ready?.(u))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[maidr/uplot] Skipping chart.'));
    expect(document.querySelector('[data-maidr-uplot]')).toBeNull();
  });
});
