import type { LiveDataEvent } from '@service/liveData';
import type { Disposable } from '@type/disposable';
import type { LinePoint, Maidr, MaidrLayer } from '@type/grammar';
import { planStream, pushUpdate } from '@adapters/uplot/live';
import { liveDataManager } from '@service/liveData';
import { TraceType } from '@type/grammar';

/**
 * Streaming `u.setData(...)` into MAIDR.
 *
 * uPlot only ever replaces all of its data, so the adapter has to recognise
 * the updates that are really appends -- new points at the end, perhaps with
 * the same number dropped from the front -- and stream those, because only an
 * append is announced in monitor mode. Anything else must fall back to a
 * silent replacement rather than stream a misreading.
 */

function line(id: string, rows: Array<Array<[number, number | null]>>): MaidrLayer {
  return {
    id,
    type: TraceType.LINE,
    data: rows.map((row, r) => row.map(([x, y]) => ({ x, y, z: `s${r}` }) as LinePoint)),
  };
}

function bar(id: string, points: Array<[number, number]>): MaidrLayer {
  return { id, type: TraceType.BAR, data: points.map(([x, y]) => ({ x, y })) };
}

function figure(...layers: MaidrLayer[]): Maidr {
  return { id: 'live-chart', live: true, subplots: [[{ layers }]] };
}

describe('planStream', () => {
  it('plans a pure tail append with no window', () => {
    const plan = planStream(
      figure(line('line-y', [[[1, 1], [2, 2]]])),
      figure(line('line-y', [[[1, 1], [2, 2], [3, 3]]])),
    );
    expect(plan).toEqual({
      appends: [{ point: { x: 3, y: 3, z: 's0' }, layerId: 'line-y', groupIndex: 0, maxWidth: undefined }],
      trims: new Map([['line-y', [0]]]),
    });
  });

  it('plans an unchanged figure as no appends', () => {
    const same = figure(line('line-y', [[[1, 1]]]));
    expect(planStream(same, same)).toEqual({ appends: [], trims: new Map([['line-y', [0]]]) });
  });

  it('reads a sliding window (trim equal to append) and gives the row its maxWidth', () => {
    const plan = planStream(
      figure(line('line-y', [[[1, 1], [2, 2], [3, 3]]])),
      figure(line('line-y', [[[2, 2], [3, 3], [4, 4]]])),
    );
    expect(plan?.appends).toEqual([{ point: { x: 4, y: 4, z: 's0' }, layerId: 'line-y', groupIndex: 0, maxWidth: 3 }]);
    expect(plan?.trims).toEqual(new Map([['line-y', [1]]]));
  });

  it('gives the row the window it ends at when it drops fewer than it gains', () => {
    const plan = planStream(
      figure(bar('bar-1', [[1, 1], [2, 2]])),
      figure(bar('bar-1', [[2, 2], [3, 3], [4, 4]])),
    );
    expect(plan?.appends.map(a => [(a.point as { x: number }).x, a.maxWidth])).toEqual([[3, 3], [4, 3]]);
    expect(plan?.trims).toEqual(new Map([['bar-1', [1]]]));
  });

  it('streams a flat bar layer too', () => {
    const plan = planStream(figure(bar('bar-1', [[1, 1]])), figure(bar('bar-1', [[1, 1], [2, 5]])));
    expect(plan?.appends).toEqual([{ point: { x: 2, y: 5 }, layerId: 'bar-1', groupIndex: 0, maxWidth: undefined }]);
  });

  it('replaces when a value already read was revised', () => {
    expect(planStream(
      figure(line('line-y', [[[1, 1], [2, 2]]])),
      figure(line('line-y', [[[1, 1], [2, 9], [3, 3]]])),
    )).toBeNull();
  });

  it('replaces when a trailing null gap is filled in', () => {
    expect(planStream(
      figure(line('line-y', [[[1, 1], [2, null]]])),
      figure(line('line-y', [[[1, 1], [2, 2]]])),
    )).toBeNull();
  });

  it.each([
    ['a layer is added', figure(line('line-y', [[[1, 1]]]), bar('bar-2', [[1, 1]]))],
    ['a layer changes id', figure(line('line-z', [[[1, 1], [2, 2]]]))],
    ['a layer changes type', figure(bar('line-y', [[1, 1], [2, 2]]))],
    ['a series is added', figure(line('line-y', [[[1, 1], [2, 2]], [[1, 5]]]))],
  ])('replaces when %s', (_name, next) => {
    expect(planStream(figure(line('line-y', [[[1, 1]]])), next)).toBeNull();
  });

  it('replaces when the front is trimmed with nothing appended', () => {
    expect(planStream(
      figure(line('line-y', [[[1, 1], [2, 2], [3, 3]]])),
      figure(line('line-y', [[[2, 2], [3, 3]]])),
    )).toBeNull();
  });

  it('replaces when the data empties', () => {
    expect(planStream(
      figure(bar('bar-1', [[1, 1]])),
      figure(bar('bar-1', [])),
    )).toBeNull();
  });

  it('streams rows trimmed to different lengths, each with its own window', () => {
    const plan = planStream(
      figure(line('line-y', [[[1, 1], [2, 2], [3, 3]], [[1, 1], [2, 2], [3, 3]]])),
      figure(line('line-y', [[[2, 2], [3, 3], [4, 4]], [[3, 3], [4, 4], [5, 5], [6, 6]]])),
    );
    expect(plan?.appends.map(a => [a.groupIndex, (a.point as { x: number }).x, a.maxWidth])).toEqual([
      [0, 4, 3],
      [1, 4, 4],
      [1, 5, 4],
      [1, 6, 4],
    ]);
    expect(plan?.trims).toEqual(new Map([['line-y', [1, 2]]]));
  });

  it('streams an untrimmed row that grows past a trimmed row\'s window', () => {
    const plan = planStream(
      figure(line('line-y', [[[1, 1], [2, 2]]]), bar('bar-1', [[1, 1], [2, 2]])),
      figure(line('line-y', [[[2, 2], [3, 3]]]), bar('bar-1', [[1, 1], [2, 2], [3, 3]])),
    );
    expect(plan?.appends.map(a => [a.layerId, a.maxWidth])).toEqual([['line-y', 2], ['bar-1', undefined]]);
    expect(plan?.trims).toEqual(new Map([['line-y', [1]], ['bar-1', [0]]]));
  });

  it('streams a bar row that left out a null beside a line row that kept it', () => {
    // The line row keeps the gap at x 3 and slides to 3 points; the bar row
    // leaves it out and slides to 2.
    const plan = planStream(
      figure(line('line-y', [[[1, 1], [2, 2], [3, null]]]), bar('bar-2', [[1, 5], [2, 6]])),
      figure(line('line-y', [[[2, 2], [3, null], [4, 4]]]), bar('bar-2', [[2, 6], [4, 8]])),
    );
    expect(plan?.appends.map(a => [a.layerId, (a.point as { x: number }).x, a.maxWidth])).toEqual([
      ['line-y', 4, 3],
      ['bar-2', 4, 2],
    ]);
    expect(plan?.trims).toEqual(new Map([['line-y', [1]], ['bar-2', [1]]]));
  });

  it('records the trim of every row when rows slide by the same amount', () => {
    const plan = planStream(
      figure(line('line-y', [[[1, 1], [2, 2]], [[1, 5], [2, 6]]])),
      figure(line('line-y', [[[2, 2], [3, 3]], [[2, 6], [3, 7]]])),
    );
    expect(plan?.appends.map(a => a.maxWidth)).toEqual([2, 2]);
    expect(plan?.trims).toEqual(new Map([['line-y', [1, 1]]]));
  });

  it('interleaves appends by arrival across rows and layers', () => {
    const plan = planStream(
      figure(line('line-y', [[[1, 1]], [[1, 5]]]), bar('bar-3', [[1, 9]])),
      figure(
        line('line-y', [[[1, 1], [2, 2], [3, 3]], [[1, 5], [2, 6], [3, 7]]]),
        bar('bar-3', [[1, 9], [2, 8]]),
      ),
    );
    expect(plan?.appends.map(a => [a.layerId, a.groupIndex, (a.point as { x: number }).x])).toEqual([
      ['line-y', 0, 2],
      ['line-y', 1, 2],
      ['bar-3', 0, 2],
      ['line-y', 0, 3],
      ['line-y', 1, 3],
    ]);
  });
});

describe('pushUpdate', () => {
  let events: LiveDataEvent[];
  let registration: Disposable | null = null;

  function register(initial: Maidr): void {
    events = [];
    registration = liveDataManager.register(initial, (event) => {
      events.push(event);
    });
  }

  afterEach(() => {
    registration?.dispose();
    registration = null;
  });

  it('does nothing for a chart that is not registered', () => {
    const setData = jest.spyOn(liveDataManager, 'setData');
    expect(pushUpdate(figure(bar('bar-1', [[1, 1]])))).toEqual({ streamed: false, trims: new Map() });
    expect(setData).not.toHaveBeenCalled();
    setData.mockRestore();
  });

  it('streams an append and does not also replace', () => {
    register(figure(line('line-y', [[[1, 1]]])));
    const setData = jest.spyOn(liveDataManager, 'setData');
    const onNavigate = jest.fn();

    const next = { ...figure(line('line-y', [[[1, 1], [2, 2]]])), onNavigate };
    expect(pushUpdate(next)).toEqual({ streamed: true, trims: new Map([['line-y', [0]]]) });

    expect(events).toHaveLength(1);
    expect(events[0].appended).toMatchObject({ layerId: 'line-y', row: 0, col: 1, trimmed: 0 });
    expect(setData).not.toHaveBeenCalled();
    setData.mockRestore();
  });

  it('streams a sliding window through maxWidth, then clears the window', () => {
    register(figure(bar('bar-1', [[1, 1], [2, 2]])));
    const setData = jest.spyOn(liveDataManager, 'setData');

    expect(pushUpdate(figure(bar('bar-1', [[2, 2], [3, 3]])))).toEqual({
      streamed: true,
      trims: new Map([['bar-1', [1]]]),
    });

    expect(events).toHaveLength(1);
    expect(events[0].appended).toMatchObject({ trimmed: 1, col: 1 });
    const stored = liveDataManager.getData('live-chart');
    expect(stored?.maxWidth).toBeUndefined();
    expect(stored?.subplots[0][0].layers[0].data).toEqual([{ x: 2, y: 2 }, { x: 3, y: 3 }]);
    // Only the window differed from the figure read; that is no replacement.
    expect(setData).not.toHaveBeenCalled();
    setData.mockRestore();
  });

  it('sets each row\'s own window before its append', () => {
    register(figure(line('line-y', [[[1, 1], [2, 2], [3, null]]]), bar('bar-2', [[1, 5], [2, 6]])));
    const original = liveDataManager.appendData.bind(liveDataManager);
    const windows: Array<number | undefined> = [];
    const append = jest.spyOn(liveDataManager, 'appendData').mockImplementation((point, options) => {
      windows.push(liveDataManager.getData('live-chart')?.maxWidth);
      return original(point, options);
    });

    pushUpdate(figure(
      line('line-y', [[[2, 2], [3, null], [4, 4]]]),
      bar('bar-2', [[1, 5], [2, 6], [4, 8]]),
    ));

    // The line row slid to 3 points; the bar row kept every point.
    expect(windows).toEqual([3, undefined]);
    expect(liveDataManager.getData('live-chart')?.maxWidth).toBeUndefined();
    append.mockRestore();
  });

  it('streams a bar row that left out a null next to a line row that kept it', () => {
    register(figure(line('line-y', [[[1, 1], [2, 2], [3, null]]]), bar('bar-2', [[1, 5], [2, 6]])));
    const setData = jest.spyOn(liveDataManager, 'setData');
    const next = figure(line('line-y', [[[2, 2], [3, null], [4, 4]]]), bar('bar-2', [[2, 6], [4, 8]]));

    expect(pushUpdate(next)).toEqual({
      streamed: true,
      trims: new Map([['line-y', [1]], ['bar-2', [1]]]),
    });

    expect(events.map(e => [e.appended?.layerId, e.appended?.trimmed, e.appended?.col])).toEqual([
      ['line-y', 1, 2],
      ['bar-2', 1, 1],
    ]);
    const stored = liveDataManager.getData('live-chart');
    expect(stored?.maxWidth).toBeUndefined();
    expect(stored?.subplots[0][0].layers.map(l => l.data)).toEqual(next.subplots[0][0].layers.map(l => l.data));
    expect(setData).not.toHaveBeenCalled();
    setData.mockRestore();
  });

  it('clears a window a later pure append no longer needs', () => {
    register({ ...figure(bar('bar-1', [[1, 1]])), maxWidth: 1 });
    pushUpdate(figure(bar('bar-1', [[1, 1], [2, 2]])));
    expect(liveDataManager.getData('live-chart')?.maxWidth).toBeUndefined();
    expect(liveDataManager.getData('live-chart')?.subplots[0][0].layers[0].data).toHaveLength(2);
  });

  it('replaces the data when the update is not an append', () => {
    register(figure(bar('bar-1', [[1, 1]])));
    const next = figure(bar('bar-1', [[1, 7]]));
    expect(pushUpdate(next)).toEqual({ streamed: false, trims: new Map() });
    expect(events).toEqual([{ maidr: next }]);
  });

  it('replaces rather than streams when the figure is not live', () => {
    register(figure(bar('bar-1', [[1, 1]])));
    const next = { ...figure(bar('bar-1', [[1, 1], [2, 2]])), live: false };
    expect(pushUpdate(next)).toEqual({ streamed: false, trims: new Map() });
    expect(events).toEqual([{ maidr: next }]);
  });

  it('replaces after streaming when something else also changed', () => {
    const initial = figure(bar('bar-1', [[1, 1]]));
    register(initial);
    const next = { ...figure(bar('bar-1', [[1, 1], [2, 2]])), title: 'Renamed' };
    expect(pushUpdate(next)).toEqual({ streamed: true, trims: new Map([['bar-1', [0]]]) });
    expect(events).toHaveLength(2);
    expect(events[0].appended).toBeDefined();
    expect(events[1]).toEqual({ maidr: next });
  });

  it('does nothing when nothing changed', () => {
    const initial = figure(bar('bar-1', [[1, 1]]));
    register(initial);
    expect(pushUpdate({ ...initial, onNavigate: jest.fn() })).toEqual({ streamed: false, trims: new Map() });
    expect(events).toEqual([]);
  });

  it('does not replace a figure that differs only in its stored window', () => {
    const initial = figure(bar('bar-1', [[1, 1]]));
    register({ ...initial, maxWidth: 4 });
    expect(pushUpdate(initial).streamed).toBe(false);
    expect(events).toEqual([]);
  });
});
