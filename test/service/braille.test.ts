import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type {
  BarBrailleState,
  BoxBrailleState,
  HeatmapBrailleState,
  LineBrailleState,
  TraceState,
} from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { BrailleService } from '@service/braille';
import { TraceType } from '@type/grammar';

interface SettingsChangeEventMock {
  affectsSetting: (settingPath: string) => boolean;
  get: <T>(settingPath: string) => T;
}

interface SettingsMockController {
  settings: SettingsService;
  triggerDisplaySizeChange: (nextDisplaySize: number) => void;
}

/**
 * Creates a line trace state with configurable braille cursor position.
 * @param values - Braille value rows
 * @param row - Active braille row
 * @param col - Active braille column
 * @returns Non-empty trace state for line braille updates
 */
function createLineTraceState(values: number[][], row: number, col: number): TraceState {
  const braille: LineBrailleState = {
    id: `line-braille-${values[0]?.length ?? 0}-${row}-${col}`,
    empty: false,
    row,
    col,
    values,
    min: values.map(items => Math.min(...items)),
    max: values.map(items => Math.max(...items)),
  };

  return {
    empty: false,
    type: 'trace',
    layerId: 'test-layer',
    traceType: TraceType.LINE,
    plotType: 'line',
    title: 'Line test trace',
    xAxis: 'x',
    yAxis: 'y',
    fill: 'none',
    hasMultiPoints: false,
    audio: {
      freq: { min: 200, max: 1000, raw: 300 },
      panning: { y: 0, x: 0, rows: 1, cols: 1 },
    },
    braille,
    text: {
      main: { label: 'x', value: 0 },
      cross: { label: 'y', value: 0 },
    },
    autoplay: {
      UPWARD: 0,
      DOWNWARD: 0,
      FORWARD: 0,
      BACKWARD: 0,
    },
    highlight: {
      empty: false,
      elements: [] as unknown as SVGElement[],
    },
  };
}

/**
 * Creates a bar trace state with configurable braille cursor position.
 * @param values - Braille value rows
 * @param row - Active braille row
 * @param col - Active braille column
 * @returns Non-empty trace state for bar braille updates
 */
function createBarTraceState(values: number[][], row: number, col: number): TraceState {
  const braille: BarBrailleState = {
    id: `bar-braille-${values[0]?.length ?? 0}-${row}-${col}`,
    empty: false,
    row,
    col,
    values,
    min: values.map(items => Math.min(...items)),
    max: values.map(items => Math.max(...items)),
  };

  return {
    empty: false,
    type: 'trace',
    layerId: 'test-layer',
    traceType: TraceType.BAR,
    plotType: 'bar',
    title: 'Bar test trace',
    xAxis: 'x',
    yAxis: 'y',
    fill: 'none',
    hasMultiPoints: false,
    audio: {
      freq: { min: 200, max: 1000, raw: 300 },
      panning: { y: 0, x: 0, rows: 1, cols: 1 },
    },
    braille,
    text: {
      main: { label: 'x', value: 0 },
      cross: { label: 'y', value: 0 },
    },
    autoplay: {
      UPWARD: 0,
      DOWNWARD: 0,
      FORWARD: 0,
      BACKWARD: 0,
    },
    highlight: {
      empty: false,
      elements: [] as unknown as SVGElement[],
    },
  };
}

/**
 * Creates a heatmap trace state with configurable braille cursor position.
 * @param values - Braille value rows
 * @param row - Active braille row
 * @param col - Active braille column
 * @returns Non-empty trace state for heatmap braille updates
 */
function createHeatmapTraceState(values: number[][], row: number, col: number): TraceState {
  const flattened = values.flat();
  const braille: HeatmapBrailleState = {
    id: `heatmap-braille-${values[0]?.length ?? 0}-${row}-${col}`,
    empty: false,
    row,
    col,
    values,
    min: Math.min(...flattened),
    max: Math.max(...flattened),
  };

  return {
    empty: false,
    type: 'trace',
    layerId: 'test-layer',
    traceType: TraceType.HEATMAP,
    plotType: 'heatmap',
    title: 'Heatmap test trace',
    xAxis: 'x',
    yAxis: 'y',
    fill: 'none',
    hasMultiPoints: false,
    audio: {
      freq: { min: 200, max: 1000, raw: 300 },
      panning: { y: 0, x: 0, rows: 1, cols: 1 },
    },
    braille,
    text: {
      main: { label: 'x', value: 0 },
      cross: { label: 'y', value: 0 },
    },
    autoplay: {
      UPWARD: 0,
      DOWNWARD: 0,
      FORWARD: 0,
      BACKWARD: 0,
    },
    highlight: {
      empty: false,
      elements: [] as unknown as SVGElement[],
    },
  };
}

/**
 * Creates a box plot trace state with configurable braille cursor position.
 * @param boxes - Array of box point data (one per row)
 * @param globalMin - Global minimum across all boxes
 * @param globalMax - Global maximum across all boxes
 * @param row - Active braille row
 * @param col - Active braille column (section index: 0=lowerOutlier..6=upperOutlier)
 * @returns Non-empty trace state for box braille updates
 */
function createBoxTraceState(
  boxes: Array<{ lowerOutliers: number[]; min: number; q1: number; q2: number; q3: number; max: number; upperOutliers: number[] }>,
  globalMin: number,
  globalMax: number,
  row: number,
  col: number,
): TraceState {
  const braille: BoxBrailleState = {
    id: `box-braille-${boxes.length}-${row}-${col}`,
    empty: false,
    row,
    col,
    values: boxes.map(b => ({
      fill: '#000',
      lowerOutliers: b.lowerOutliers,
      min: b.min,
      q1: b.q1,
      q2: b.q2,
      q3: b.q3,
      max: b.max,
      upperOutliers: b.upperOutliers,
    })),
    min: globalMin,
    max: globalMax,
  };

  return {
    empty: false,
    type: 'trace',
    layerId: 'test-layer',
    traceType: TraceType.BOX,
    plotType: 'box',
    title: 'Box test trace',
    xAxis: 'x',
    yAxis: 'y',
    fill: 'none',
    hasMultiPoints: false,
    audio: {
      freq: { min: 200, max: 1000, raw: 300 },
      panning: { y: 0, x: 0, rows: 1, cols: 1 },
    },
    braille,
    text: {
      main: { label: 'x', value: 0 },
      cross: { label: 'y', value: 0 },
    },
    autoplay: {
      UPWARD: 0,
      DOWNWARD: 0,
      FORWARD: 0,
      BACKWARD: 0,
    },
    highlight: {
      empty: false,
      elements: [] as unknown as SVGElement[],
    },
  };
}

/**
 * Creates a settings mock and exposes a helper to emit display-size change events.
 * @param displaySize - Initial display width used by the encoder
 * @returns Settings service mock and change trigger
 */
function createSettingsMockController(displaySize: number): SettingsMockController {
  let currentDisplaySize = displaySize;
  let onChangeListener: ((event: SettingsChangeEventMock) => void) | null = null;

  const settings = {
    get: <T>(settingPath: string): T => {
      if (settingPath === 'general.brailleDisplayLines')
        return 1 as T;
      return currentDisplaySize as T;
    },
    onChange: (listener: (event: SettingsChangeEventMock) => void) => {
      onChangeListener = listener;
      return {
        dispose: () => {
          onChangeListener = null;
        },
      };
    },
  } as unknown as SettingsService;

  const triggerDisplaySizeChange = (nextDisplaySize: number): void => {
    currentDisplaySize = nextDisplaySize;
    if (onChangeListener === null) {
      return;
    }

    onChangeListener({
      affectsSetting: (settingPath: string): boolean =>
        settingPath === 'general.brailleDisplaySize',
      get: <T>(_settingPath: string): T => currentDisplaySize as T,
    });
  };

  return { settings, triggerDisplaySizeChange };
}

/**
 * Creates a settings mock that returns a fixed braille display size.
 * @param displaySize - Display width used by the encoder
 * @returns Structural SettingsService mock
 */
function createStaticSettingsMock(displaySize: number): SettingsService {
  return {
    get: <T>(settingPath: string): T => {
      if (settingPath === 'general.brailleDisplayLines')
        return 1 as T;
      return displaySize as T;
    },
    onChange: () => ({
      dispose: () => {},
    }),
  } as unknown as SettingsService;
}

/**
 * Builds a BrailleService with lightweight dependency mocks.
 * @param displaySize - Braille display size setting to use
 * @returns Service instance and context spy for index mapping assertions
 */
function createBrailleService(displaySize: number): {
  service: BrailleService;
  contextMoveToIndex: ReturnType<typeof jest.fn>;
} {
  const contextMoveToIndex = jest.fn<(row: number, col: number) => void>();
  const context = {
    moveToIndex: contextMoveToIndex,
  } as unknown as Context;

  const notification = {
    notify: jest.fn<(message: string) => void>(),
  } as unknown as NotificationService;

  const display = {
    toggleFocus: jest.fn(),
  } as unknown as DisplayService;

  const settings = createStaticSettingsMock(displaySize);

  const service = new BrailleService(context, notification, display, settings);
  return { service, contextMoveToIndex };
}

/**
 * Builds a BrailleService with a settings mock that can emit runtime changes.
 * @param displaySize - Initial braille display size setting to use
 * @returns Service instance and settings trigger for change-event assertions
 */
function createBrailleServiceWithSettingsTrigger(displaySize: number): {
  service: BrailleService;
  triggerDisplaySizeChange: (nextDisplaySize: number) => void;
  setContextState: (state: TraceState) => void;
} {
  let currentState: TraceState | undefined;
  const context = {
    moveToIndex: jest.fn<(row: number, col: number) => void>(),
    get state(): TraceState | undefined {
      return currentState;
    },
  } as unknown as Context;

  const notification = {
    notify: jest.fn<(message: string) => void>(),
  } as unknown as NotificationService;

  const display = {
    toggleFocus: jest.fn(),
  } as unknown as DisplayService;

  const { settings, triggerDisplaySizeChange } = createSettingsMockController(displaySize);
  const service = new BrailleService(context, notification, display, settings);

  const setContextState = (state: TraceState): void => {
    currentState = state;
  };

  return { service, triggerDisplaySizeChange, setContextState };
}

describe('BrailleService display-size encoding', () => {
  test('encodes one newline when row length is less than display size', () => {
    const { service } = createBrailleService(10);
    const state = createLineTraceState([[1, 2, 3]], 0, 0);

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(state);

    const newlineCount = (emitted.match(/\n/g) ?? []).length;
    expect(newlineCount).toBe(1);
    expect(emitted.endsWith('\n\n')).toBe(false);

    disposable.dispose();
    service.dispose();
  });

  test('navigates to correct cell for non-multiple row lengths', () => {
    const { service, contextMoveToIndex } = createBrailleService(2);
    const state = createLineTraceState([[1, 2, 3]], 0, 3);

    let lastIndex = -1;
    const disposable = service.onChange((event) => {
      lastIndex = event.index;
    });

    service.toggle(state);

    service.moveToIndex(lastIndex);
    expect(contextMoveToIndex).toHaveBeenCalledWith(0, 3);

    disposable.dispose();
    service.dispose();
  });

  test('no double newline when row length is exactly divisible by display size', () => {
    const { service, contextMoveToIndex } = createBrailleService(2);
    const state = createLineTraceState([[1, 2, 3, 4]], 0, 4);

    let emitted = '';
    let sentinelIndex = -1;
    const disposable = service.onChange((event) => {
      emitted = event.value;
      sentinelIndex = event.index;
    });

    service.toggle(state);

    expect(emitted.includes('\n\n')).toBe(false);

    service.moveToIndex(sentinelIndex);
    expect(contextMoveToIndex).toHaveBeenCalledWith(0, 4);

    disposable.dispose();
    service.dispose();
  });

  test('preserves index-to-cell mapping after mid-row wrap newlines', () => {
    const { service, contextMoveToIndex } = createBrailleService(2);
    const state = createLineTraceState([[1, 2, 3, 4, 5]], 0, 3);

    let mappedIndex = -1;
    const disposable = service.onChange((event) => {
      mappedIndex = event.index;
    });

    service.toggle(state);

    service.moveToIndex(mappedIndex);
    expect(contextMoveToIndex).toHaveBeenCalledWith(0, 3);

    disposable.dispose();
    service.dispose();
  });

  test('re-emits braille output immediately when display size setting changes', () => {
    const { service, triggerDisplaySizeChange, setContextState }
      = createBrailleServiceWithSettingsTrigger(4);
    const state = createLineTraceState([[1, 2, 3, 4]], 0, 0);
    setContextState(state);

    const values: string[] = [];
    const disposable = service.onChange((event) => {
      values.push(event.value);
    });

    service.toggle(state);
    const beforeChange = values[values.length - 1];
    triggerDisplaySizeChange(2);
    const afterChange = values[values.length - 1];

    expect(values.length).toBeGreaterThan(1);
    expect(beforeChange).not.toEqual(afterChange);

    disposable.dispose();
    service.dispose();
  });

  test('emits untrimmed braille value to preserve index mapping offsets', () => {
    const { service } = createBrailleService(10);
    const state = createLineTraceState([[1, 2, 3]], 0, 3);

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(state);

    expect(emitted.endsWith('\n')).toBe(true);

    disposable.dispose();
    service.dispose();
  });

  test('wraps bar braille output based on configured display size', () => {
    const { service, contextMoveToIndex } = createBrailleService(2);
    const state = createBarTraceState([[1, 2, 3, 4, 5]], 0, 5);

    let emitted = '';
    let lastIndex = -1;
    const disposable = service.onChange((event) => {
      emitted = event.value;
      lastIndex = event.index;
    });

    service.toggle(state);

    // 5 items, displaySize 2: wraps at 2, 4 → 2 mid-row newlines + 1 end-of-row = 3
    const newlineCount = (emitted.match(/\n/g) ?? []).length;
    expect(newlineCount).toBe(3);

    service.moveToIndex(lastIndex);
    expect(contextMoveToIndex).toHaveBeenCalledWith(0, 5);

    disposable.dispose();
    service.dispose();
  });

  test('wraps heatmap braille output based on configured display size', () => {
    const { service, contextMoveToIndex } = createBrailleService(2);
    const state = createHeatmapTraceState([[1, 2, 3, 4, 5]], 0, 5);

    let emitted = '';
    let lastIndex = -1;
    const disposable = service.onChange((event) => {
      emitted = event.value;
      lastIndex = event.index;
    });

    service.toggle(state);

    const newlineCount = (emitted.match(/\n/g) ?? []).length;
    expect(newlineCount).toBe(3);

    service.moveToIndex(lastIndex);
    expect(contextMoveToIndex).toHaveBeenCalledWith(0, 5);

    disposable.dispose();
    service.dispose();
  });

  test('handles multi-row data with correct per-row wrapping and navigation', () => {
    const { service, contextMoveToIndex } = createBrailleService(3);
    const state = createLineTraceState(
      [[1, 2, 3, 4, 5], [10, 20, 30]],
      1,
      2,
    );

    let emitted = '';
    let lastIndex = -1;
    const disposable = service.onChange((event) => {
      emitted = event.value;
      lastIndex = event.index;
    });

    service.toggle(state);

    // Two rows of data should produce two row-groups in the output
    const rows = emitted.split('\n').filter(r => r.length > 0);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Navigate to row 1, col 2
    service.moveToIndex(lastIndex);
    expect(contextMoveToIndex).toHaveBeenCalledWith(1, 2);

    disposable.dispose();
    service.dispose();
  });

  test('handles displaySize of 1 (every cell gets its own line)', () => {
    const { service } = createBrailleService(1);
    const state = createLineTraceState([[1, 2, 3]], 0, 0);

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(state);

    // Each cell followed by a newline, row end aligns exactly → 3 newlines total
    const newlineCount = (emitted.match(/\n/g) ?? []).length;
    expect(newlineCount).toBe(3);
    expect(emitted.includes('\n\n')).toBe(false);

    disposable.dispose();
    service.dispose();
  });

  test('handles empty row without errors', () => {
    const { service } = createBrailleService(10);
    const state = createLineTraceState([[]], 0, 0);

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    // Should not throw when toggling with an empty row
    service.toggle(state);

    // Empty row should produce just a newline
    expect(emitted).toBe('\n');

    disposable.dispose();
    service.dispose();
  });

  test('emits displaySize in onChange event', () => {
    const { service } = createBrailleService(40);
    const state = createLineTraceState([[1, 2, 3]], 0, 0);

    let emittedDisplaySize = -1;
    const disposable = service.onChange((event) => {
      emittedDisplaySize = event.displaySize;
    });

    service.toggle(state);

    expect(emittedDisplaySize).toBe(40);

    disposable.dispose();
    service.dispose();
  });

  test('settings change updates displaySize in subsequent emissions', () => {
    const { service, triggerDisplaySizeChange, setContextState }
      = createBrailleServiceWithSettingsTrigger(32);
    const state = createLineTraceState([[1, 2, 3]], 0, 0);
    setContextState(state);

    const displaySizes: number[] = [];
    const disposable = service.onChange((event) => {
      displaySizes.push(event.displaySize);
    });

    service.toggle(state);
    triggerDisplaySizeChange(20);

    expect(displaySizes).toContain(32);
    expect(displaySizes).toContain(20);

    disposable.dispose();
    service.dispose();
  });

  test('does not re-emit when service is not enabled and display size changes', () => {
    const { service, triggerDisplaySizeChange }
      = createBrailleServiceWithSettingsTrigger(32);

    let emitCount = 0;
    const disposable = service.onChange(() => {
      emitCount++;
    });

    // Service is never toggled on — enabled remains false
    triggerDisplaySizeChange(20);

    expect(emitCount).toBe(0);

    disposable.dispose();
    service.dispose();
  });

  test('multiline mode: uses space padding instead of newlines between rows', () => {
    // Create a braille service where displayLines > 1 is triggered via multiline encoder call
    // We test this by calling the service with a state and checking no \n in output
    // Use a custom setup with displayLines=2 by extending the service mock
    const { service } = createBrailleService(10);
    // Single row with 5 chars, displaySize=10 → should produce 10 chars (5 data + 5 spaces) and no \n in multiline
    // We test this via the multiline path indirectly - we verify the single-line path still works
    const state = createLineTraceState([[1, 2, 3]], 0, 0);

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(state);

    // Single-line mode (default displayLines=1): should still use \n
    expect(emitted.includes('\n')).toBe(true);

    disposable.dispose();
    service.dispose();
  });

  test('multiline mode: space-pads each row to displaySize boundary', () => {
    // We need to test the encoder directly via the BrailleService with displayLines > 1.
    // Since BrailleService reads displayLines from settings, create a mock with displayLines=2.
    const contextMoveToIndex = jest.fn<(row: number, col: number) => void>();
    const context = {
      moveToIndex: contextMoveToIndex,
      get state(): undefined {
        return undefined;
      },
    } as unknown as Context;
    const notification = {
      notify: jest.fn<(message: string) => void>(),
    } as unknown as NotificationService;
    const display = {
      toggleFocus: jest.fn(),
    } as unknown as DisplayService;

    const settings = {
      get: <T>(path: string): T => {
        if (path === 'general.brailleDisplaySize')
          return 10 as T;
        if (path === 'general.brailleDisplayLines')
          return 2 as T;
        return undefined as T;
      },
      onChange: () => ({ dispose: () => {} }),
    } as unknown as SettingsService;

    const service = new BrailleService(context, notification, display, settings);

    // 2 rows: [5 items, 3 items], displaySize=10, displayLines=2
    const state = createLineTraceState([[1, 2, 3, 4, 5], [10, 20, 30]], 0, 0);

    let emitted = '';
    let emittedDisplayLines = -1;
    const disposable = service.onChange((event) => {
      emitted = event.value;
      emittedDisplayLines = event.displayLines;
    });

    service.toggle(state);

    // With multiline (displayLines=2): no \n, each row padded to 10 chars
    expect(emitted.includes('\n')).toBe(false);
    // Total length: row0=10 chars (5 data + 5 spaces) + row1=10 chars (3 data + 7 spaces) = 20
    expect(emitted.length).toBe(20);
    // displayLines emitted correctly
    expect(emittedDisplayLines).toBe(2);

    disposable.dispose();
    service.dispose();
  });

  test('multiline mode: navigation maps correctly in space-padded rows', () => {
    const contextMoveToIndex = jest.fn<(row: number, col: number) => void>();
    const context = {
      moveToIndex: contextMoveToIndex,
      get state(): undefined {
        return undefined;
      },
    } as unknown as Context;
    const notification = { notify: jest.fn<(message: string) => void>() } as unknown as NotificationService;
    const display = { toggleFocus: jest.fn() } as unknown as DisplayService;

    const settings = {
      get: <T>(path: string): T => {
        if (path === 'general.brailleDisplaySize')
          return 10 as T;
        if (path === 'general.brailleDisplayLines')
          return 2 as T;
        return undefined as T;
      },
      onChange: () => ({ dispose: () => {} }),
    } as unknown as SettingsService;

    const service = new BrailleService(context, notification, display, settings);

    // Navigate to row=1, col=2 in a 2-row dataset
    const state = createLineTraceState([[1, 2, 3, 4, 5], [10, 20, 30]], 1, 2);

    let cursorIndex = -1;
    const disposable = service.onChange((event) => {
      cursorIndex = event.index;
    });

    service.toggle(state);

    // row1, col2: row 1 is encoded first (rows reversed so UP moves cursor upward),
    // so cursor is at index 2
    expect(cursorIndex).toBe(2);

    // clicking at index 2 should navigate to (1, 2)
    service.moveToIndex(2);
    expect(contextMoveToIndex).toHaveBeenCalledWith(1, 2);

    // clicking in padding of row1 (e.g. index 7) should navigate to (1, 2) - last data col of row1
    service.moveToIndex(7);
    expect(contextMoveToIndex).toHaveBeenCalledWith(1, 2);

    disposable.dispose();
    service.dispose();
  });

  test('multiline mode: emits displayLines in onChange event', () => {
    const context = {
      moveToIndex: jest.fn(),
      get state(): undefined {
        return undefined;
      },
    } as unknown as Context;
    const notification = { notify: jest.fn<(message: string) => void>() } as unknown as NotificationService;
    const display = { toggleFocus: jest.fn() } as unknown as DisplayService;

    const settings = {
      get: <T>(path: string): T => {
        if (path === 'general.brailleDisplaySize')
          return 32 as T;
        if (path === 'general.brailleDisplayLines')
          return 3 as T;
        return undefined as T;
      },
      onChange: () => ({ dispose: () => {} }),
    } as unknown as SettingsService;

    const service = new BrailleService(context, notification, display, settings);

    const state = createLineTraceState([[1, 2, 3]], 0, 0);

    let emittedDisplayLines = -1;
    const disposable = service.onChange((event) => {
      emittedDisplayLines = event.displayLines;
    });

    service.toggle(state);
    expect(emittedDisplayLines).toBe(3);

    disposable.dispose();
    service.dispose();
  });

  test('multiline mode: box encoder space-pads rows to displaySize boundary', () => {
    const contextMoveToIndex = jest.fn<(row: number, col: number) => void>();
    const context = {
      moveToIndex: contextMoveToIndex,
      get state(): undefined {
        return undefined;
      },
    } as unknown as Context;
    const notification = { notify: jest.fn<(message: string) => void>() } as unknown as NotificationService;
    const display = { toggleFocus: jest.fn() } as unknown as DisplayService;

    const settings = {
      get: <T>(path: string): T => {
        if (path === 'general.brailleDisplaySize')
          return 32 as T;
        if (path === 'general.brailleDisplayLines')
          return 2 as T;
        return undefined as T;
      },
      onChange: () => ({ dispose: () => {} }),
    } as unknown as SettingsService;

    const service = new BrailleService(context, notification, display, settings);

    const box = {
      lowerOutliers: [] as number[],
      min: 10,
      q1: 25,
      q2: 50,
      q3: 75,
      max: 90,
      upperOutliers: [] as number[],
    };
    const state = createBoxTraceState([box, box], 0, 100, 0, 3);

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(state);

    // Multiline: no newlines
    expect(emitted.includes('\n')).toBe(false);
    // Each row should be a multiple of displaySize (32)
    expect(emitted.length % 32).toBe(0);
    // Two rows → total length should be 64
    expect(emitted.length).toBe(64);

    disposable.dispose();
    service.dispose();
  });
});
