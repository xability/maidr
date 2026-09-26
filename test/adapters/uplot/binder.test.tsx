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

  it('redraws the highlight on a draw with no data change, as after a zoom', () => {
    const x = { min: 0, max: 10, ori: 0 };
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 50, null]],
      series: [{}, { label: 'CPU', _paths: LINE_PATHS }],
      scales: { x, y: { min: 0, max: 100, ori: 1 } },
    });
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
    u.setCursor.mockClear();

    // Zoomed in to x 0..5: x 2 is now 160px in.
    x.max = 5;
    act(() => fire(u, 'draw'));

    expect(u.setCursor).toHaveBeenCalledWith({ left: 160, top: 100 });
    expect(boxes(u)).toEqual([{ left: '154px', top: '94px', width: '12px', height: '12px' }]);
    expect(mockMaidr.events).toEqual([]);
  });

  it('positions by data index on an ordinal x scale', () => {
    // uPlot lays an ordinal (distr 2) scale out over 0..n-1, whatever the
    // x values are.
    const u = fakeUPlot({
      data: [[1000, 2000, 3000], [10, 50, 30]],
      series: [{}, { label: 'Sales', _paths: BAR_PATHS }],
      scales: { x: { min: 0, max: 4, ori: 0, distr: 2 }, y: { min: 0, max: 100, ori: 1 } },
    });
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 1 }));
    // Index 1 of 0..4 over 400px is 100px; neighbours 100px away, 60% wide.
    expect(boxes(u)).toEqual([{ left: '70px', top: '100px', width: '60px', height: '100px' }]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 100, top: 100 });
  });

  it('marks a gap by its index on an ordinal x scale', () => {
    const u = fakeUPlot({
      data: [[1000, 2000, 3000], [10, null, 30]],
      series: [{}, { label: 'CPU', _paths: LINE_PATHS }],
      scales: { x: { min: 0, max: 4, ori: 0, distr: 2 }, y: { min: 0, max: 100, ori: 1 } },
    });
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
    expect(boxes(u)).toEqual([]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 100, top: -10 });
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
  /** Clicks with uPlot's cursor at data index `idx` and CSS pixel (left, top). */
  function click(u: FakeUPlot, cursor: FakeUPlot['cursor']): void {
    u.cursor = cursor;
    act(() => {
      u.over.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });
  }

  it('moves the reader to the point under the cursor', () => {
    const u = lineChart();
    place(u);
    bind(u);
    // CPU at x 2 is drawn at (80, 100); Mem at (80, 140).
    click(u, { idx: 1, left: 81, top: 102 });
    expect(mockMaidr.targets).toEqual([{ layerId: 'line-y', row: 0, col: 1 }]);
  });

  it('chooses the series drawn nearest the click', () => {
    const u = lineChart();
    place(u);
    bind(u);
    click(u, { idx: 1, left: 80, top: 130 });
    expect(mockMaidr.targets).toEqual([{ layerId: 'line-y', row: 1, col: 1 }]);
  });

  it('ignores the series uPlot has focused', () => {
    const u = lineChart();
    (u.series[2] as { _focus?: boolean })._focus = true;
    place(u);
    bind(u);
    click(u, { idx: 1, left: 80, top: 100 });
    expect(mockMaidr.targets).toEqual([{ layerId: 'line-y', row: 0, col: 1 }]);
  });

  it('skips a series with a gap at the cursor', () => {
    const u = lineChart();
    place(u);
    bind(u);
    // CPU is null at x 3; the click lands where it would have been drawn.
    click(u, { idx: 2, left: 120, top: 180 });
    expect(mockMaidr.targets).toEqual([{ layerId: 'line-y', row: 1, col: 2 }]);
  });

  it('chooses between layers by distance too', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 50, 30], [20, 90, 40]],
      series: [{}, { label: 'Sales', _paths: BAR_PATHS }, { label: 'Target', _paths: LINE_PATHS }],
    });
    place(u);
    bind(u);
    click(u, { idx: 1, left: 80, top: 30 });
    click(u, { idx: 1, left: 80, top: 110 });
    expect(mockMaidr.targets).toEqual([
      { layerId: 'line-y', row: 0, col: 1 },
      { layerId: 'bar-1', row: 0, col: 1 },
    ]);
  });

  it('names a scatter point by its index', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, null, 30]],
      series: [{}, { _paths: POINT_PATHS }],
    });
    place(u);
    bind(u);
    click(u, { idx: 2, left: 120, top: 140 });
    expect(mockMaidr.targets).toEqual([{ layerId: 'scatter-1', pointIndex: 1 }]);
  });

  it('reads each faceted series at its own index', () => {
    const u = fakeUPlot({
      mode: 2,
      data: [null, [[1, 2, 3], [40, 50, 60]], [[7, 8], [9, 10]]],
      series: [
        {},
        { label: 'A', facets: [{ scale: 'x' }, { scale: 'y' }] },
        { label: 'B', facets: [{ scale: 'x' }, { scale: 'y' }] },
      ],
    });
    place(u);
    bind(u);
    // A's index 2 is drawn at (120, 80), B's index 0 at (280, 182).
    click(u, { idx: 0, idxs: [null, 2, 0], left: 275, top: 180 });
    click(u, { idx: 0, idxs: [null, 2, 0], left: 118, top: 85 });
    click(u, { idx: 0, idxs: [null, null, null], left: 118, top: 85 });
    expect(mockMaidr.targets).toEqual([
      { layerId: 'scatter-2', pointIndex: 0 },
      { layerId: 'scatter-1', pointIndex: 2 },
    ]);
  });

  it.each([
    ['no point under the cursor', { idx: null, left: 80, top: 100 }],
    ['the cursor off the plot', { idx: 1, left: -10, top: -10 }],
    ['no cursor position', { idx: 1 }],
  ])('ignores a click with %s', (_name, cursor) => {
    const u = lineChart();
    place(u);
    bind(u);
    click(u, cursor);
    expect(mockMaidr.targets).toEqual([]);
  });

  it('ignores a button other than the main one', () => {
    const u = lineChart();
    place(u);
    bind(u);
    u.cursor = { idx: 1, left: 80, top: 100 };
    act(() => {
      u.over.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 2 }));
    });
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

  it('hands MAIDR an empty figure when the data empties', () => {
    const u = lineChart();
    place(u);
    const handle = bind(u);
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));

    u.data = [[]];
    act(() => {
      fire(u, 'setData');
      fire(u, 'draw');
    });

    expect(mockMaidr.events).toHaveLength(1);
    expect(mockMaidr.events[0].appended).toBeUndefined();
    expect(mockMaidr.events[0].maidr.subplots).toEqual([[{ layers: [] }]]);
    expect(liveDataManager.getData(handle.id)?.subplots).toEqual([[{ layers: [] }]]);
    expect(boxes(u)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
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

describe('following a sliding window', () => {
  /** Replaces the chart's data the way uPlot does, and lets the draw run. */
  function update(u: FakeUPlot, data: FakeUPlot['data']): void {
    u.data = data;
    act(() => {
      fire(u, 'setData');
      fire(u, 'draw');
    });
  }

  it('keeps the highlight on the same datum after a sliding tick', () => {
    const u = lineChart();
    place(u);
    bind(u);
    // Mem at x 3 (40).
    act(() => onNavigate()({ layerId: 'line-y', row: 1, col: 2 }));

    update(u, [[2, 3, 4], [50, null, 60], [30, 40, 50]]);

    expect(mockMaidr.events.map(e => e.appended?.trimmed)).toEqual([1, 1]);
    // Still x 3 at 40: one column further left.
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 120, top: 120 });
    expect(boxes(u)).toEqual([{ left: '114px', top: '114px', width: '12px', height: '12px' }]);
  });

  it('slides each row by its own trim', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 20, 30], [null, 6, 7]],
      series: [{}, { label: 'Line', _paths: LINE_PATHS }, { label: 'Bars', _paths: BAR_PATHS }],
    });
    place(u);
    bind(u);
    // The bar at x 3, the second bar point.
    act(() => onNavigate()({ layerId: 'bar-2', row: 0, col: 1 }));

    // The line row drops x 1; the bar row never had it, and drops nothing.
    update(u, [[2, 3, 4], [20, 30, 40], [6, 7, 8]]);

    expect(mockMaidr.events.map(e => [e.appended?.layerId, e.appended?.trimmed])).toEqual([
      ['line-y', 1],
      ['bar-2', 0],
    ]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 120, top: 186 });
  });

  it('forgets a position that slid off the front', () => {
    const u = lineChart();
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 0 }));
    u.setCursor.mockClear();

    update(u, [[2, 3, 4], [50, null, 60], [30, 40, 50]]);

    expect(boxes(u)).toEqual([]);
    expect(u.setCursor).not.toHaveBeenCalled();
    act(() => fire(u, 'setSize'));
    expect(u.setCursor).not.toHaveBeenCalled();
  });

  it('shifts selected scatter points, dropping those that slid off', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, null, 30]],
      series: [{}, { label: 'Dots', _paths: POINT_PATHS }],
    });
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'scatter-1', row: 0, col: 0, pointIndices: [0, 1] }));

    update(u, [[2, 3, 4], [null, 30, 40]]);

    expect(mockMaidr.events.map(e => e.appended?.trimmed)).toEqual([1]);
    // Only the point at x 3 is left.
    expect(boxes(u).map(b => [b.left, b.top])).toEqual([['114px', '134px']]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 120, top: 140 });
  });

  it('does not move the position on a pure append', () => {
    const u = lineChart();
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'line-y', row: 1, col: 1 }));

    update(u, [[1, 2, 3, 4], [10, 50, null, 60], [20, 30, 40, 50]]);

    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 80, top: 140 });
  });
});

describe('focus leaving the chart', () => {
  function focusable(parent: HTMLElement): HTMLButtonElement {
    const button = document.createElement('button');
    parent.appendChild(button);
    return button;
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  it('clears the highlight without moving uPlot\'s cursor', async () => {
    const u = lineChart();
    const inside = focusable(u.root);
    const outside = focusable(host);
    place(u);
    bind(u);
    inside.focus();
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
    expect(boxes(u)).toHaveLength(1);
    u.setCursor.mockClear();

    outside.focus();
    await settle();

    expect(boxes(u)).toEqual([]);
    expect(u.setCursor).not.toHaveBeenCalled();
    // Nothing later pulls the cursor back to where the reader was.
    act(() => fire(u, 'setSize'));
    act(() => fire(u, 'draw'));
    expect(u.setCursor).not.toHaveBeenCalled();
    expect(boxes(u)).toEqual([]);
  });

  it('keeps the highlight while focus moves within the chart', async () => {
    const u = lineChart();
    const first = focusable(u.root);
    const second = focusable(u.root);
    place(u);
    bind(u);
    first.focus();
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
    u.setCursor.mockClear();

    second.focus();
    await settle();

    expect(boxes(u)).toHaveLength(1);
    act(() => fire(u, 'setSize'));
    expect(u.setCursor).toHaveBeenCalledWith({ left: 80, top: 100 });
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
    u.cursor = { idx: 0, left: 40, top: 180 };
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

  it('binds a chart with no data yet, and fills it in on the first setData', () => {
    const u = fakeUPlot({ data: [[], []], series: [{}, { label: 'CPU', _paths: LINE_PATHS }], status: 0 });
    place(u);
    const handle = bind(u);
    u.status = 1;
    act(() => fire(u, 'ready'));

    expect(warn).not.toHaveBeenCalled();
    expect(host.querySelector('[data-maidr-uplot]')?.contains(u.root)).toBe(true);
    expect(mockMaidr.renders[0].subplots).toEqual([[{ layers: [] }]]);
    expect(liveDataManager.getData(handle.id)).toBeDefined();

    u.data = [[1, 2], [10, 50]];
    act(() => fire(u, 'setData'));
    act(() => fire(u, 'draw'));

    expect(mockMaidr.events).toHaveLength(1);
    expect(mockMaidr.events[0].maidr.subplots[0][0].layers.map(l => l.id)).toEqual(['line-y']);
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 80, top: 100 });
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

  it('binds a chart that has nothing to read yet', () => {
    const u = fakeUPlot({ data: [[1]], series: [{}] });
    place(u);
    act(() => maidrPlugin({ id: 'empty' }).hooks.ready?.(u));
    handles.push({ dispose: () => bindUPlot(u).dispose() });
    expect(warn).not.toHaveBeenCalled();
    expect(host.querySelector('[data-maidr-uplot="empty"]')).not.toBeNull();
    expect(mockMaidr.renders[0].subplots).toEqual([[{ layers: [] }]]);
  });

  it('warns and skips a chart that is not in the document', () => {
    const u = lineChart();
    expect(() => act(() => maidrPlugin().hooks.ready?.(u))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[maidr/uplot] Skipping chart.'));
    expect(document.querySelector('[data-maidr-uplot]')).toBeNull();
  });
});
