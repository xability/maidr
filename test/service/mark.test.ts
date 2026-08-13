import type { Context } from '@model/context';
import type { Figure } from '@model/plot';
import type { AudioService } from '@service/audio';
import type { HighlightService } from '@service/highlight';
import type { NotificationService } from '@service/notification';
import type { StorageService } from '@service/storage';
import type { TextService } from '@service/text';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { FigureMarks, Mark } from '@type/mark';
import type { TextState, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { MarkService } from '@service/mark';
import { Scope } from '@type/event';

const STORAGE_KEY = 'maidr-marks-fig-1';

/** A trace stub exposing exactly the surface MarkService reads. */
interface TraceStub {
  getId: () => string;
  row: number;
  col: number;
  moveToIndex: jest.Mock<(row: number, col: number) => void>;
  state: TraceState;
}

/** A subplot stub: a grid of traces plus the active-trace cursor. */
interface SubplotStub {
  traces: TraceStub[][];
  row: number;
  col: number;
}

function makeTrace(
  id: string,
  state: TraceState,
  row = 0,
  col = 0,
): TraceStub {
  const trace: TraceStub = {
    getId: () => id,
    row,
    col,
    moveToIndex: jest.fn((r: number, c: number) => {
      trace.row = r;
      trace.col = c;
    }),
    state,
  };
  return trace;
}

/** Wraps trace rows in a single-subplot figure and returns both. */
function makeFigure(traceRows: TraceStub[][]): { figure: Figure; subplot: SubplotStub } {
  const subplot: SubplotStub = { traces: traceRows, row: 0, col: 0 };
  const figure = { subplots: [[subplot]] } as unknown as Figure;
  return { figure, subplot };
}

function nonEmptyState(text: TextState): TraceState {
  return { type: 'trace', empty: false, text } as unknown as TraceState;
}

const EMPTY_STATE = { type: 'trace', empty: true } as unknown as TraceState;

const TEXT: TextState = {
  main: { label: 'Month', value: 'Jan' },
  cross: { label: 'Count', value: 10 },
};

interface Harness {
  service: MarkService;
  context: Context;
  subplot: SubplotStub;
  storage: { save: jest.Mock; load: jest.Mock; remove: jest.Mock };
  notify: jest.Mock;
  audioUpdate: jest.Mock;
  highlightUpdate: jest.Mock;
  brailleUpdate: jest.Mock;
  textUpdate: jest.Mock;
  isVerbose: jest.Mock;
}

/**
 * Builds a MarkService with fully mocked collaborators. `active`/`state` drive
 * the current cursor; `traceRows` is the figure the service searches on
 * play/jump; `stored` seeds localStorage so persistence and recall can be
 * exercised without going through setMark first.
 */
function setup(options: {
  active?: unknown;
  state?: TraceState;
  scope?: Scope;
  traceRows?: TraceStub[][];
  stored?: FigureMarks | null;
  verbose?: boolean;
} = {}): Harness {
  const active = options.active ?? makeTrace('t1', options.state ?? nonEmptyState(TEXT));
  const { figure, subplot } = makeFigure(options.traceRows ?? [[active as TraceStub]]);

  const storage = {
    save: jest.fn(),
    load: jest.fn(() => options.stored ?? null),
    remove: jest.fn(),
  };
  const notify = jest.fn();
  const audioUpdate = jest.fn();
  const highlightUpdate = jest.fn();
  const brailleUpdate = jest.fn();
  const textUpdate = jest.fn();
  const isVerbose = jest.fn(() => options.verbose ?? false);

  const context = {
    id: 'fig-1',
    scope: options.scope ?? Scope.TRACE,
    toggleScope: jest.fn(),
    active,
    state: options.state ?? nonEmptyState(TEXT),
  } as unknown as Context;

  const service = new MarkService(
    context,
    figure,
    storage as unknown as StorageService,
    { notify } as unknown as NotificationService,
    { update: audioUpdate } as unknown as AudioService,
    { update: highlightUpdate } as unknown as HighlightService,
    { update: brailleUpdate } as unknown as BrailleViewModel,
    { update: textUpdate } as unknown as TextViewModel,
    { isVerbose } as unknown as TextService,
  );

  return {
    service,
    context,
    subplot,
    storage,
    notify,
    audioUpdate,
    highlightUpdate,
    brailleUpdate,
    textUpdate,
    isVerbose,
  };
}

/** A stored marks blob referencing a trace with id `traceId`. */
function storedMark(slot: number, mark: Partial<Mark> & { traceId: string }): FigureMarks {
  return {
    figureId: 'fig-1',
    marks: {
      [slot]: {
        row: 0,
        col: 0,
        terseText: 'terse',
        verboseText: 'verbose',
        ...mark,
      },
    },
  };
}

describe('MarkService construction', () => {
  test('loads existing marks from the figure-scoped storage key', () => {
    const stored = storedMark(3, { traceId: 't1', terseText: 'Jan, 10' });
    const { service, storage } = setup({ stored });

    expect(storage.load).toHaveBeenCalledWith(STORAGE_KEY);
    expect(service.getSetMarks()).toEqual([
      { slot: 3, mark: stored.marks[3] },
    ]);
  });

  test('starts empty when storage has nothing for this figure', () => {
    const { service } = setup({ stored: null });

    expect(service.getSetMarks()).toEqual([]);
  });
});

describe('MarkService.setMark', () => {
  test('captures the position, persists it, and announces the slot', () => {
    const { service, storage, notify, context } = setup({
      active: makeTrace('t1', nonEmptyState(TEXT), 2, 4),
      state: nonEmptyState(TEXT),
    });

    service.setMark(5);

    expect(notify).toHaveBeenCalledWith('Marked position 5');
    expect(storage.save).toHaveBeenCalledWith(STORAGE_KEY, expect.anything());
    expect(service.hasMarkAtSlot(5)).toBe(true);
    expect(service.getSetMarks()[0].mark).toMatchObject({ traceId: 't1', row: 2, col: 4 });
    // Setting a mark returns the user to whatever scope they were in.
    expect(context.toggleScope).toHaveBeenCalled();
  });

  test('stores both terse and verbose renderings of the point', () => {
    const { service } = setup({ state: nonEmptyState(TEXT) });

    service.setMark(0);
    const { mark } = service.getSetMarks()[0];

    expect(mark.terseText).toBe('Jan, 10');
    expect(mark.verboseText).toBe('Month is Jan, Count is 10');
  });

  test('announces a replacement when the slot is already occupied', () => {
    const { service, notify } = setup({
      stored: storedMark(2, { traceId: 't1' }),
      state: nonEmptyState(TEXT),
    });

    service.setMark(2);

    expect(notify).toHaveBeenCalledWith('Replaced mark 2');
  });

  test('refuses to mark outside a trace context and does not persist', () => {
    const { service, storage, notify } = setup({
      state: { type: 'subplot', empty: false } as unknown as TraceState,
    });

    service.setMark(1);

    expect(notify).toHaveBeenCalledWith('Cannot set mark outside of trace context');
    expect(storage.save).not.toHaveBeenCalled();
    expect(service.hasMarkAtSlot(1)).toBe(false);
  });

  test('refuses to mark an empty position and does not persist', () => {
    const { service, storage, notify } = setup({ state: EMPTY_STATE });

    service.setMark(1);

    expect(notify).toHaveBeenCalledWith('Cannot set mark on empty position');
    expect(storage.save).not.toHaveBeenCalled();
  });

  test('formats array-valued axes: bracketed when terse, comma-joined when verbose', () => {
    const arrayText: TextState = {
      main: { label: 'Bin', value: [1, 2] },
      cross: { label: 'Count', value: 10 },
    };
    const { service } = setup({ state: nonEmptyState(arrayText) });

    service.setMark(0);
    const { mark } = service.getSetMarks()[0];

    expect(mark.terseText).toBe('[1, 2], 10');
    expect(mark.verboseText).toBe('Bin is 1, 2, Count is 10');
  });
});

describe('MarkService.playMark', () => {
  test('announces the empty slot without touching any modality', () => {
    const { service, notify, textUpdate, audioUpdate, brailleUpdate, highlightUpdate } = setup();

    service.playMark(7);

    expect(notify).toHaveBeenCalledWith('Mark 7 is empty');
    expect(textUpdate).not.toHaveBeenCalled();
    expect(audioUpdate).not.toHaveBeenCalled();
    expect(brailleUpdate).not.toHaveBeenCalled();
    expect(highlightUpdate).not.toHaveBeenCalled();
  });

  test('describes the mark across every modality and restores the cursor', () => {
    const markState = nonEmptyState(TEXT);
    const trace = makeTrace('t1', markState, 0, 0);
    const { service, notify, textUpdate, audioUpdate, brailleUpdate, highlightUpdate } = setup({
      active: trace,
      traceRows: [[trace]],
      stored: storedMark(2, { traceId: 't1', row: 4, col: 6 }),
    });

    service.playMark(2);

    expect(notify).toHaveBeenCalledWith('Mark 2');
    expect(textUpdate).toHaveBeenCalledWith(markState);
    expect(audioUpdate).toHaveBeenCalledWith(markState);
    expect(brailleUpdate).toHaveBeenCalledWith(markState);
    expect(highlightUpdate).toHaveBeenCalledWith(markState);
    // The read is transient: the visible cursor must land back where it was.
    expect(trace.row).toBe(0);
    expect(trace.col).toBe(0);
    expect(trace.moveToIndex).not.toHaveBeenCalled();
  });

  test('does not drive the modalities when the marked position is empty', () => {
    const trace = makeTrace('t1', EMPTY_STATE);
    const { service, notify, textUpdate } = setup({
      active: trace,
      traceRows: [[trace]],
      stored: storedMark(1, { traceId: 't1' }),
    });

    service.playMark(1);

    expect(notify).toHaveBeenCalledWith('Mark 1');
    expect(textUpdate).not.toHaveBeenCalled();
  });

  test('reports a mark whose trace no longer exists in the figure', () => {
    const { service, notify } = setup({
      stored: storedMark(3, { traceId: 'gone' }),
    });

    service.playMark(3);

    expect(notify).toHaveBeenCalledWith('Mark 3 references invalid trace');
  });
});

describe('MarkService.jumpToMark', () => {
  test('announces an empty slot', () => {
    const { service, notify } = setup();

    service.jumpToMark(4);

    expect(notify).toHaveBeenCalledWith('Mark 4 is empty');
  });

  test('switches to the marked trace and moves to its stored position', () => {
    const first = makeTrace('a', nonEmptyState(TEXT));
    const second = makeTrace('b', nonEmptyState(TEXT));
    const { service, notify, subplot } = setup({
      active: first,
      traceRows: [[first, second]],
      stored: storedMark(1, { traceId: 'b', row: 3, col: 5 }),
    });

    service.jumpToMark(1);

    expect(subplot.col).toBe(1); // active trace cursor moved to layer 'b'
    expect(second.moveToIndex).toHaveBeenCalledWith(3, 5);
    expect(notify).toHaveBeenCalledWith('Jumped to mark 1');
  });

  test('reports failure when the marked trace is missing', () => {
    const { service, notify } = setup({
      stored: storedMark(1, { traceId: 'gone' }),
    });

    service.jumpToMark(1);

    expect(notify).toHaveBeenCalledWith('Failed to jump to mark 1');
  });
});

describe('MarkService scope activation', () => {
  test('activate stores the current scope and toggles to the requested one', () => {
    const { service, context } = setup({ scope: Scope.SUBPLOT });

    service.activateScope(Scope.MARK_SET);

    expect(context.toggleScope).toHaveBeenCalledWith(Scope.MARK_SET);
  });

  test('deactivate returns to the scope captured at activation', () => {
    const { service, context } = setup({ scope: Scope.SUBPLOT });

    service.activateScope(Scope.MARK_PLAY);
    (context.toggleScope as jest.Mock).mockClear();
    service.deactivateScope();

    expect(context.toggleScope).toHaveBeenCalledWith(Scope.SUBPLOT);
  });
});

describe('MarkService accessors', () => {
  test('getSetMarks returns only occupied slots, sorted ascending', () => {
    const stored: FigureMarks = {
      figureId: 'fig-1',
      marks: {
        5: { traceId: 't1', row: 0, col: 0, terseText: '', verboseText: '' },
        1: { traceId: 't1', row: 0, col: 0, terseText: '', verboseText: '' },
      },
    };
    const { service } = setup({ stored });

    expect(service.getSetMarks().map(m => m.slot)).toEqual([1, 5]);
  });

  test('hasMarkAtSlot reflects occupancy', () => {
    const { service } = setup({ stored: storedMark(8, { traceId: 't1' }) });

    expect(service.hasMarkAtSlot(8)).toBe(true);
    expect(service.hasMarkAtSlot(9)).toBe(false);
  });

  test('isVerboseMode delegates to the text service', () => {
    const { service, isVerbose } = setup({ verbose: true });

    expect(service.isVerboseMode()).toBe(true);
    expect(isVerbose).toHaveBeenCalled();
  });
});
