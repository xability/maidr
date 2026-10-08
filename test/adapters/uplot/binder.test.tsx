/**
 * @jest-environment jsdom
 */

import type { LiveDataEvent } from '@service/liveData';
import type { Maidr, NavigationTarget } from '@type/grammar';
import type { ReactNode } from 'react';
import type { FakeUPlot } from './helpers';
import { bindUPlot, maidrPlugin } from '@adapters/uplot/binder';
import { liveDataManager } from '@service/liveData';
import { SETTINGS_KEY } from '@service/settings';
import { act } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@type/settings';
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
          {
            navigator: (target) => {
              mockMaidr.targets.push(target);
              return true;
            },
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

  it('boxes a fan chart\'s quantile where its own series draws it', () => {
    const u = fakeUPlot({
      data: [[2], [25], [75], [50]],
      bands: [{ series: [2, 1] }],
      series: [
        {},
        { label: 'p5', _paths: LINE_PATHS },
        { label: 'p95', _paths: LINE_PATHS },
        { label: 'Median', _paths: LINE_PATHS, maidr: { bands: [{ band: 0, lower: 0.05, upper: 0.95 }] } },
      ],
    });
    place(u);
    bind(u);

    // Rows are the levels, lowest first: the 5th percentile, the median, the 95th.
    act(() => onNavigate()({ layerId: 'percentile_band-3', row: 0, col: 0 }));
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 80, top: 150 });
    act(() => onNavigate()({ layerId: 'percentile_band-3', row: 1, col: 0 }));
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 80, top: 100 });
    act(() => onNavigate()({ layerId: 'percentile_band-3', row: 2, col: 0 }));
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 80, top: 50 });
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

  describe('a lone bar', () => {
    /** One bar at x 1 (40px), up to 50 (100px). */
    function loneBar(scales?: Parameters<typeof fakeUPlot>[0]['scales']): FakeUPlot {
      return fakeUPlot({ data: [[1], [50]], series: [{}, { label: 'Sales', _paths: BAR_PATHS }], scales });
    }

    it('takes the plot\'s width as its column, as uPlot does', () => {
      const u = loneBar();
      Object.defineProperty(u.over, 'clientWidth', { value: 400, configurable: true });
      place(u);
      bind(u);
      act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 0 }));
      // 60% of the 400px plot, centred on 40px.
      expect(boxes(u)).toEqual([{ left: '-80px', top: '100px', width: '240px', height: '100px' }]);
    });

    it('takes the plot\'s height as its column when the bars lie along x', () => {
      const u = loneBar({ x: { min: 0, max: 2, ori: 1 }, y: { min: 0, max: 100, ori: 0 } });
      Object.defineProperty(u.over, 'clientWidth', { value: 400, configurable: true });
      Object.defineProperty(u.over, 'clientHeight', { value: 200, configurable: true });
      place(u);
      bind(u);
      act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 0 }));
      // x 1 of 0..2 is 100px down; 60% of the 200px plot tall, out to 50 (200px).
      expect(boxes(u)).toEqual([{ left: '0px', top: '40px', width: '200px', height: '120px' }]);
    });

    it('falls back to a 24px column before the plot has a size', () => {
      const u = loneBar();
      place(u);
      bind(u);
      act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 0 }));
      const [box] = boxes(u);
      expect(Number.parseFloat(box.width)).toBeCloseTo(14.4);
      expect(Number.parseFloat(box.left)).toBeCloseTo(32.8);
    });
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

  it('releases uPlot\'s cursor when a scatter selection is empty', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, null, 30]],
      series: [{}, { label: 'Dots', _paths: POINT_PATHS }],
    });
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'scatter-1', row: 0, col: 0, pointIndices: [0] }));
    act(() => onNavigate()({ layerId: 'scatter-1', row: -1, col: -1, pointIndices: [] }));
    expect(boxes(u)).toEqual([]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: -10, top: -10 });
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

  it('redraws the highlight on the draw after a resize, not before uPlot repaints', () => {
    const u = lineChart();
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
    u.setCursor.mockClear();
    act(() => fire(u, 'setSize'));
    expect(u.setCursor).not.toHaveBeenCalled();
    act(() => fire(u, 'draw'));
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

  describe('without a page color', () => {
    afterEach(() => localStorage.removeItem(SETTINGS_KEY));

    function outline(u: FakeUPlot): string | undefined {
      return u.over.querySelector<HTMLElement>('[data-maidr-uplot-highlight]')?.style.outline;
    }

    it('uses the reader\'s highlight color from MAIDR\'s settings', () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ general: { highlightColor: 'blue' } }));
      const u = lineChart();
      place(u);
      bind(u);
      act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
      expect(outline(u)).toBe('2px solid blue');
    });

    it('picks up a settings change on the next move', () => {
      const u = lineChart();
      place(u);
      bind(u);
      act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 1 }));
      expect(outline(u)).toBe(`2px solid ${DEFAULT_SETTINGS.general.highlightColor}`);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ general: { highlightColor: 'purple' } }));
      act(() => onNavigate()({ layerId: 'line-y', row: 0, col: 0 }));
      expect(outline(u)).toBe('2px solid purple');
    });
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

  describe('on a stack', () => {
    /**
     * Errors 10/20/30 with Warnings stacked on them, drawn as running totals
     * 30/50/70: at x 2 (80px), Errors from 200px up to 160px, Warnings from
     * there up to 100px, both 24px wide (68px to 92px).
     */
    function stackChart(): FakeUPlot {
      return fakeUPlot({
        data: [[1, 2, 3], [10, 20, 30], [30, 50, 70]],
        bands: [{ series: [2, 1] }],
        series: [{}, { label: 'Errors', _paths: BAR_PATHS }, { label: 'Warnings', _paths: BAR_PATHS }],
      });
    }

    it('chooses the segment clicked inside, though the top of the one beneath is nearer', () => {
      const u = stackChart();
      place(u);
      bind(u, { stacked: true });
      // 10px above the Errors top, 50px below the Warnings top.
      click(u, { idx: 1, left: 80, top: 150 });
      click(u, { idx: 1, left: 70, top: 195 });
      expect(mockMaidr.targets).toEqual([
        { layerId: 'stacked-y', row: 1, col: 1 },
        { layerId: 'stacked-y', row: 0, col: 1 },
      ]);
    });

    it('chooses the nearest segment top for a click beside the stack', () => {
      const u = stackChart();
      place(u);
      bind(u, { stacked: true });
      // Right of the bar, level with the lower part of Warnings.
      click(u, { idx: 1, left: 95, top: 150 });
      expect(mockMaidr.targets).toEqual([{ layerId: 'stacked-y', row: 0, col: 1 }]);
    });

    it('finds the segment in a stack whose series are listed top first', () => {
      // Series 1 (the totals) is banded onto series 2: the bottom is series 2.
      const u = fakeUPlot({
        data: [[1, 2, 3], [30, 50, 70], [10, 20, 30]],
        bands: [{ series: [1, 2] }],
        series: [{}, { label: 'Warnings', _paths: BAR_PATHS }, { label: 'Errors', _paths: BAR_PATHS }],
      });
      place(u);
      bind(u, { stacked: true });
      click(u, { idx: 1, left: 80, top: 150 });
      click(u, { idx: 1, left: 80, top: 190 });
      expect(mockMaidr.targets).toEqual([
        { layerId: 'stacked-y', row: 1, col: 1 },
        { layerId: 'stacked-y', row: 0, col: 1 },
      ]);
    });
  });

  it('chooses a bar clicked inside over a line point nearer the click than its top', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 50, 30], [20, 15, 40]],
      series: [{}, { label: 'Sales', _paths: BAR_PATHS }, { label: 'Target', _paths: LINE_PATHS }],
    });
    place(u);
    bind(u);
    // The bar at x 2 spans 100px to 200px; the line point is at (80, 170),
    // 10px from the click, the bar's top 80px.
    click(u, { idx: 1, left: 80, top: 180 });
    expect(mockMaidr.targets).toEqual([{ layerId: 'bar-1', row: 0, col: 1 }]);
  });

  it('chooses a line point drawn over a bar when the click is right on it', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 50, 30], [20, 15, 40]],
      series: [{}, { label: 'Sales', _paths: BAR_PATHS }, { label: 'Target', _paths: LINE_PATHS }],
    });
    place(u);
    bind(u);
    // The line point at (80, 170) sits inside the bar; a click 2px from it.
    click(u, { idx: 1, left: 81, top: 171 });
    expect(mockMaidr.targets).toEqual([{ layerId: 'line-y', row: 0, col: 1 }]);
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

describe('stacked bars', () => {
  /**
   * Errors 10/20/30 with Warnings stacked on them, drawn as running totals
   * 30/50/70, on x 0..10 (400px) and y 0..100 (200px).
   */
  function stackChart(): FakeUPlot {
    return fakeUPlot({
      data: [[1, 2, 3], [10, 20, 30], [30, 50, 70]],
      bands: [{ series: [2, 1] }],
      series: [{}, { label: 'Errors', _paths: BAR_PATHS }, { label: 'Warnings', _paths: BAR_PATHS }],
    });
  }

  function update(u: FakeUPlot, data: FakeUPlot['data']): void {
    u.data = data;
    act(() => {
      fire(u, 'setData');
      fire(u, 'draw');
    });
  }

  it('boxes the bottom segment from the base up to its top', () => {
    const u = stackChart();
    place(u);
    bind(u, { stacked: true });
    act(() => onNavigate()({ layerId: 'stacked-y', row: 0, col: 1 }));
    // From 0 (200px) up to 20 (160px), 60% of the 40px column wide.
    expect(boxes(u)).toEqual([{ left: '68px', top: '160px', width: '24px', height: '40px' }]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 80, top: 160 });
  });

  it('boxes an upper segment from the top of the one beneath to its own top', () => {
    const u = stackChart();
    place(u);
    bind(u, { stacked: true });
    act(() => onNavigate()({ layerId: 'stacked-y', row: 1, col: 1 }));
    // From the Errors top at 20 (160px) up to the drawn total 50 (100px).
    expect(boxes(u)).toEqual([{ left: '68px', top: '100px', width: '24px', height: '60px' }]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 80, top: 100 });
  });

  it('boxes a segment from the nearest series beneath it that has a reading', () => {
    // Info on Warnings on Errors; Warnings has a gap at x 2, Errors 20 there.
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 20, 30], [30, null, 70], [40, 60, 80]],
      bands: [{ series: [3, 2] }, { series: [2, 1] }],
      series: [
        {},
        { label: 'Errors', _paths: BAR_PATHS },
        { label: 'Warnings', _paths: BAR_PATHS },
        { label: 'Info', _paths: BAR_PATHS },
      ],
    });
    place(u);
    bind(u, { stacked: true });
    act(() => onNavigate()({ layerId: 'stacked-y', row: 2, col: 1 }));
    // From Errors' 20 (160px) up to 60 (80px).
    expect(boxes(u)).toEqual([{ left: '68px', top: '80px', width: '24px', height: '80px' }]);
  });

  it('boxes an upper segment from the base when the one beneath has a gap', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, null, 30], [30, 50, 70]],
      bands: [{ series: [2, 1] }],
      series: [{}, { label: 'Errors', _paths: BAR_PATHS }, { label: 'Warnings', _paths: BAR_PATHS }],
    });
    place(u);
    bind(u, { stacked: true });
    act(() => onNavigate()({ layerId: 'stacked-y', row: 1, col: 1 }));
    expect(boxes(u)).toEqual([{ left: '68px', top: '100px', width: '24px', height: '100px' }]);
  });

  it('boxes the whole stack for the total row MAIDR adds beneath the segments', () => {
    const u = stackChart();
    place(u);
    bind(u, { stacked: true });
    act(() => onNavigate()({ layerId: 'stacked-y', row: 2, col: 1 }));
    // From 0 (200px) to the top of the stack at 50 (100px).
    expect(boxes(u)).toEqual([{ left: '68px', top: '100px', width: '24px', height: '100px' }]);
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 80, top: 100 });
  });

  it('boxes the segments of a stack whose series are listed top first', () => {
    // Series 1, the running totals, is banded onto series 2: rows bottom first.
    const u = fakeUPlot({
      data: [[1, 2, 3], [30, 50, 70], [10, 20, 30]],
      bands: [{ series: [1, 2] }],
      series: [{}, { label: 'Warnings', _paths: BAR_PATHS }, { label: 'Errors', _paths: BAR_PATHS }],
    });
    place(u);
    bind(u, { stacked: true });
    act(() => onNavigate()({ layerId: 'stacked-y', row: 0, col: 1 }));
    expect(boxes(u)).toEqual([{ left: '68px', top: '160px', width: '24px', height: '40px' }]);
    act(() => onNavigate()({ layerId: 'stacked-y', row: 1, col: 1 }));
    expect(boxes(u)).toEqual([{ left: '68px', top: '100px', width: '24px', height: '60px' }]);
    act(() => onNavigate()({ layerId: 'stacked-y', row: 2, col: 1 }));
    expect(boxes(u)).toEqual([{ left: '68px', top: '100px', width: '24px', height: '100px' }]);
  });

  it('draws nothing past the total row', () => {
    const u = stackChart();
    place(u);
    bind(u, { stacked: true });
    act(() => onNavigate()({ layerId: 'stacked-y', row: 3, col: 1 }));
    expect(boxes(u)).toEqual([]);
  });

  it('keeps the total row on the same stack after a sliding tick', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 20, 30], [30, 50, 75]],
      bands: [{ series: [2, 1] }],
      series: [{}, { label: 'Errors', _paths: BAR_PATHS }, { label: 'Warnings', _paths: BAR_PATHS }],
    });
    place(u);
    bind(u, { stacked: true });
    // The total at x 3: 75.
    act(() => onNavigate()({ layerId: 'stacked-y', row: 2, col: 2 }));
    u.setCursor.mockClear();

    update(u, [[2, 3, 4], [20, 30, 40], [50, 75, 90]]);

    expect(mockMaidr.events.map(e => e.appended?.trimmed)).toEqual([1, 1]);
    // Still x 3 at 75 (50px), one column further left -- not x 4.
    expect(u.setCursor).toHaveBeenLastCalledWith({ left: 120, top: 50 });
    expect(boxes(u)).toEqual([{ left: '108px', top: '50px', width: '24px', height: '150px' }]);
  });
});

describe('bar width measured off the canvas', () => {
  const BAR = [214, 39, 40, 255];

  /**
   * Gives the chart a canvas at twice the CSS size whose every row reads as
   * `paint` -- device-pixel spans of the bar color -- over transparency.
   */
  function withCanvas(u: FakeUPlot, paint: Array<[number, number, number[]?]>): void {
    Object.defineProperty(u.over, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(u.over, 'clientHeight', { value: 200, configurable: true });
    const getImageData = (_x: number, _y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number } => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (const [from, to, color = BAR] of paint) {
        for (let i = from; i <= to; i++) {
          data.set(color, i * 4);
        }
      }
      return { data, width: w, height: h };
    };
    Object.assign(u, {
      bbox: { left: 0, top: 0, width: 800, height: 400 },
      ctx: { getImageData },
    });
  }

  function barChart(): FakeUPlot {
    return fakeUPlot({
      data: [[1, 2, 3], [10, 50, 30]],
      series: [{}, { label: 'Sales', _paths: BAR_PATHS }],
    });
  }

  it('uses the width the bar was drawn at', () => {
    const u = barChart();
    // The bar at x 2 (80px, 160 device px) drawn 40 device px wide.
    withCanvas(u, [[140, 179]]);
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 1 }));
    expect(boxes(u)).toEqual([{ left: '70px', top: '100px', width: '20px', height: '100px' }]);
  });

  it('boxes a bar that fills its column -- touching its neighbours -- the column wide', () => {
    const u = barChart();
    // Histogram bars of one color, touching: one run across the whole plot.
    withCanvas(u, [[0, 799]]);
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 1 }));
    expect(boxes(u)).toEqual([{ left: '60px', top: '100px', width: '40px', height: '100px' }]);
  });

  it('falls back to uPlot\'s default share when the run is under two pixels', () => {
    const u = barChart();
    withCanvas(u, [[159, 161]]);
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 1 }));
    expect(boxes(u)).toEqual([{ left: '68px', top: '100px', width: '24px', height: '100px' }]);
  });

  it('takes in the series\' stroke drawn around the fill', () => {
    const STROKE = [0, 0, 0, 255];
    const paint: Array<[number, number, number[]?]> = [[136, 139, STROKE], [140, 179], [180, 183, STROKE]];
    const stroked = fakeUPlot({
      data: [[1, 2, 3], [10, 50, 30]],
      series: [{}, { label: 'Sales', _paths: BAR_PATHS, width: 1 } as FakeUPlot['series'][number]],
    });
    // Fill 40 device px, a 1 CSS px stroke taking in up to 2 device px of
    // the 4 opaque ones either side.
    withCanvas(stroked, paint);
    place(stroked);
    bind(stroked);
    act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 1 }));
    expect(boxes(stroked)).toEqual([{ left: '69px', top: '100px', width: '22px', height: '100px' }]);

    // Without a stroke width, the stroke is not the bar's.
    const plain = barChart();
    withCanvas(plain, paint);
    place(plain);
    bind(plain);
    act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 1 }));
    expect(boxes(plain)).toEqual([{ left: '70px', top: '100px', width: '20px', height: '100px' }]);
  });

  it('measures a bar reaching past the plot across its visible part', () => {
    // y 0..40: the bar at x 2 (50) runs off the top; its base is at 200px.
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 50, 30]],
      series: [{}, { label: 'Sales', _paths: BAR_PATHS }],
      scales: { x: { min: 0, max: 10, ori: 0 }, y: { min: 0, max: 40, ori: 1 } },
    });
    withCanvas(u, [[140, 179]]);
    const read = jest.spyOn(u.ctx as { getImageData: (...args: number[]) => unknown }, 'getImageData');
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 1 }));
    expect(boxes(u)[0].width).toBe('20px');
    // Visible from 0 to 200 CSS px: measured at 100 (200 device px).
    expect(read).toHaveBeenLastCalledWith(0, 200, 800, 1);
  });

  it('reads the canvas once per series and column, and again after a resize', () => {
    const u = barChart();
    withCanvas(u, [[140, 179]]);
    const read = jest.spyOn(u.ctx as { getImageData: (...args: number[]) => unknown }, 'getImageData');
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 1 }));
    act(() => fire(u, 'draw'));
    act(() => fire(u, 'draw'));
    expect(read).toHaveBeenCalledTimes(1);
    expect(boxes(u)[0].width).toBe('20px');
    act(() => {
      fire(u, 'setSize');
      fire(u, 'draw');
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('falls back to uPlot\'s default share when nothing is drawn at the centre', () => {
    const u = barChart();
    withCanvas(u, []);
    place(u);
    bind(u);
    act(() => onNavigate()({ layerId: 'bar-1', row: 0, col: 1 }));
    expect(boxes(u)).toEqual([{ left: '68px', top: '100px', width: '24px', height: '100px' }]);
  });

  it('measures a stacked segment the same way', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 20, 30], [30, 50, 70]],
      bands: [{ series: [2, 1] }],
      series: [{}, { label: 'Errors', _paths: BAR_PATHS }, { label: 'Warnings', _paths: BAR_PATHS }],
    });
    withCanvas(u, [[150, 169]]);
    place(u);
    bind(u, { stacked: true });
    act(() => onNavigate()({ layerId: 'stacked-y', row: 1, col: 1 }));
    expect(boxes(u)).toEqual([{ left: '75px', top: '100px', width: '10px', height: '60px' }]);
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
    act(() => fire(u, 'draw'));
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
