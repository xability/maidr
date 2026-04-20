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
 * Builds a BrailleService with configurable display size and display lines.
 *
 * Prefer this over {@link createBrailleService} whenever a test needs to
 * exercise multiline mode (`displayLines > 1`), horizontal windowing, or
 * any behavior that depends on the `brailleDisplayLines` setting.
 * {@link createBrailleService} hard-codes `displayLines = 1`, so it is only
 * suitable for single-line tests.
 *
 * Consolidates the context/notification/display/settings mock boilerplate
 * that multiline and windowing tests otherwise reconstruct inline.
 * @param displaySize - Braille display size (cells per line)
 * @param displayLines - Number of physical braille display lines
 * @returns Service instance and a context `moveToIndex` spy
 */
function createMultilineBrailleService(
  displaySize: number,
  displayLines: number,
): {
  service: BrailleService;
  contextMoveToIndex: ReturnType<typeof jest.fn>;
} {
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
        return displaySize as T;
      if (path === 'general.brailleDisplayLines')
        return displayLines as T;
      return undefined as T;
    },
    onChange: () => ({ dispose: () => {} }),
  } as unknown as SettingsService;

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

  test('multiline mode: space-pads each row to displaySize boundary', () => {
    const { service } = createMultilineBrailleService(10, 2);

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
    const { service, contextMoveToIndex } = createMultilineBrailleService(10, 2);

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
    const { service } = createMultilineBrailleService(32, 3);

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
    const { service } = createMultilineBrailleService(32, 2);

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

  test('horizontal windowing: multi-row plot with cols > displaySize produces displaySize chars per row', () => {
    const { service } = createMultilineBrailleService(3, 2);

    // 3 rows of 5 cols, displaySize=3. maxCols (5) > displaySize (3) → windowing activates.
    const state = createLineTraceState(
      [[1, 2, 3, 4, 5], [10, 20, 30, 40, 50], [100, 200, 300, 400, 500]],
      0,
      0,
    );

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(state);

    // Each of the 3 rows is sliced to exactly displaySize=3 → total = 9 chars.
    expect(emitted.length).toBe(9);
    // No newlines in multiline mode.
    expect(emitted.includes('\n')).toBe(false);

    disposable.dispose();
    service.dispose();
  });

  test('horizontal windowing: cursor past displaySize triggers page-aligned re-encode', () => {
    const { service } = createMultilineBrailleService(3, 2);

    // Enable at cursor (row=0, col=0) → window [0, 3).
    const firstState = createLineTraceState(
      [[1, 2, 3, 4, 5], [10, 20, 30, 40, 50]],
      0,
      0,
    );

    const emissions: Array<{ value: string; index: number }> = [];
    const disposable = service.onChange((event) => {
      emissions.push({ value: event.value, index: event.index });
    });

    service.toggle(firstState);
    // Window [0, 3): rows reversed (row 1 first, row 0 last), each 3 chars → total 6.
    expect(emissions[0].value.length).toBe(6);

    // Cursor jumps to col 3 → must page to window [3, 6). Same braille.id because
    // the service re-reads the state via update(), so we emit a state whose id and
    // values match but cursor moves.  Use a different id to force a fresh encode.
    const secondState = createLineTraceState(
      [[1, 2, 3, 4, 5], [10, 20, 30, 40, 50]],
      0,
      3,
    );
    service.update(secondState);

    // Window should shift to [3, 6).  Row 0 has 5 cols → in-window cols 3, 4 are
    // data, col 5 is padding (space).
    const after = emissions[emissions.length - 1];
    expect(after.value.length).toBe(6);
    // Cursor index in the output: row 0 is encoded last (reversed), so its window
    // occupies positions [3..5]. col=3 is the first in-window col → index 3.
    expect(after.index).toBe(3);

    disposable.dispose();
    service.dispose();
  });

  test('horizontal windowing: single-row plot keeps existing overflow behavior (no windowing)', () => {
    const { service } = createMultilineBrailleService(4, 2);

    // Single row of 10 cols, displaySize=4 → current behavior: pad to ceil(10/4)*4 = 12.
    const state = createLineTraceState(
      [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
      0,
      0,
    );

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(state);

    // Windowing does NOT apply for single-row: length = 12 (10 data + 2 pad).
    expect(emitted.length).toBe(12);
    expect(emitted.includes('\n')).toBe(false);

    disposable.dispose();
    service.dispose();
  });

  test('horizontal windowing: multi-row where all rows fit keeps per-row padding (no windowing)', () => {
    const { service } = createMultilineBrailleService(10, 3);

    // 3 rows of 5 cols, displaySize=10. All rows fit → no windowing; each row
    // padded to 10 chars = 30 total.
    const state = createHeatmapTraceState(
      [[1, 2, 3, 4, 5], [10, 20, 30, 40, 50], [100, 200, 300, 400, 500]],
      0,
      0,
    );

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(state);

    expect(emitted.length).toBe(30);
    expect(emitted.includes('\n')).toBe(false);

    disposable.dispose();
    service.dispose();
  });

  test('horizontal windowing: click on padding inside window maps to last data col', () => {
    const { service, contextMoveToIndex } = createMultilineBrailleService(4, 2);

    // Row 0: 5 cols. Row 1: 2 cols. displaySize=4 → windowing activates.
    // Window [0, 4): row 1 has cols 0,1 then 2 padding chars. Row 0 fills all 4.
    // Rows reversed in multiline → output: row1 chunk (4 chars) + row0 chunk (4 chars) = 8.
    const state = createLineTraceState(
      [[1, 2, 3, 4, 5], [10, 20]],
      0,
      0,
    );

    const disposable = service.onChange(() => {});
    service.toggle(state);

    // Row 1 is encoded first (reversed). Its cols 0,1 are indices 0,1.
    // Indices 2,3 are padding → should map to row=1, col=1 (last data col).
    service.moveToIndex(3);
    expect(contextMoveToIndex).toHaveBeenCalledWith(1, 1);

    disposable.dispose();
    service.dispose();
  });

  test('horizontal windowing: cursor on page-boundary columns selects the correct window', () => {
    const { service } = createMultilineBrailleService(3, 2);

    // Two rows of 9 cols, displaySize=3 → windows are [0,3), [3,6), [6,9).
    const values = [[1, 2, 3, 4, 5, 6, 7, 8, 9], [10, 20, 30, 40, 50, 60, 70, 80, 90]];

    const emissions: Array<{ value: string; index: number }> = [];
    const disposable = service.onChange((event) => {
      emissions.push({ value: event.value, index: event.index });
    });

    // Cursor at col=2 (last col of window [0,3)) → stays in first window.
    service.toggle(createLineTraceState(values, 0, 2));
    const atEndOfFirst = emissions[emissions.length - 1];
    // Row 0 is encoded last (reversed) → occupies indices [3..5]; col 2 → index 5.
    expect(atEndOfFirst.index).toBe(5);

    // Cursor at col=3 (first col of window [3,6)) → pages to second window.
    service.update(createLineTraceState(values, 0, 3));
    const atStartOfSecond = emissions[emissions.length - 1];
    // New window means fresh encode; row 0's slice occupies indices [3..5];
    // col 3 is the first in-window col → index 3.
    expect(atStartOfSecond.index).toBe(3);

    // Cursor at col=5 (last col of window [3,6)) → stays in second window.
    service.update(createLineTraceState(values, 0, 5));
    const atEndOfSecond = emissions[emissions.length - 1];
    expect(atEndOfSecond.index).toBe(5);

    // Cursor at col=6 (first col of window [6,9)) → pages to third window.
    service.update(createLineTraceState(values, 0, 6));
    const atStartOfThird = emissions[emissions.length - 1];
    expect(atStartOfThird.index).toBe(3);

    disposable.dispose();
    service.dispose();
  });

  test('horizontal windowing: single-line mode never windows', () => {
    const { service } = createMultilineBrailleService(3, 1);

    // 2 rows of 5 cols, displaySize=3. In single-line mode, newline wrapping applies.
    const state = createLineTraceState(
      [[1, 2, 3, 4, 5], [10, 20, 30, 40, 50]],
      0,
      0,
    );

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(state);

    // Single-line mode preserves newline wrapping behavior.
    expect(emitted.includes('\n')).toBe(true);

    disposable.dispose();
    service.dispose();
  });

  test('multiline mode: settings change for brailleDisplayLines re-encodes and flips mode', () => {
    // Start in single-line mode (displayLines=1), switch to multiline (displayLines=2),
    // and verify the cache is invalidated and the output re-encodes without newlines.
    let currentDisplayLines = 1;
    let onChangeListener:
      | ((event: SettingsChangeEventMock) => void)
      | null = null;

    const state = createLineTraceState([[1, 2, 3, 4, 5], [10, 20, 30]], 0, 0);

    const context = {
      moveToIndex: jest.fn<(row: number, col: number) => void>(),
      get state(): TraceState {
        return state;
      },
    } as unknown as Context;
    const notification = {
      notify: jest.fn<(message: string) => void>(),
    } as unknown as NotificationService;
    const display = { toggleFocus: jest.fn() } as unknown as DisplayService;

    const settings = {
      get: <T>(path: string): T => {
        if (path === 'general.brailleDisplaySize')
          return 10 as T;
        if (path === 'general.brailleDisplayLines')
          return currentDisplayLines as T;
        return undefined as T;
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

    const service = new BrailleService(context, notification, display, settings);

    const emissions: Array<{ value: string; displayLines: number }> = [];
    const disposable = service.onChange((event) => {
      emissions.push({ value: event.value, displayLines: event.displayLines });
    });

    service.toggle(state);

    // Before the setting change: single-line mode → newlines present, displayLines=1.
    expect(emissions.length).toBeGreaterThan(0);
    const before = emissions[emissions.length - 1];
    expect(before.value.includes('\n')).toBe(true);
    expect(before.displayLines).toBe(1);

    // Flip the setting and fire the change event.
    currentDisplayLines = 2;
    expect(onChangeListener).not.toBeNull();
    onChangeListener!({
      affectsSetting: (path: string): boolean =>
        path === 'general.brailleDisplayLines',
      get: <T>(path: string): T => {
        if (path === 'general.brailleDisplayLines')
          return currentDisplayLines as T;
        return 10 as T;
      },
    });

    // After the setting change: the service must re-encode and re-emit in
    // multiline mode (no newlines) with the new displayLines value.
    const after = emissions[emissions.length - 1];
    expect(after).not.toBe(before);
    expect(after.value.includes('\n')).toBe(false);
    expect(after.displayLines).toBe(2);
    // Each row padded to displaySize=10 → 2 rows → total length 20.
    expect(after.value.length).toBe(20);

    disposable.dispose();
    service.dispose();
  });

  test('horizontal windowing: cache hit within the same window never emits a stale -1 index', () => {
    // Out-of-window columns are marked with -1 in cellToIndex; the service
    // guarantees the cursor is in-window by recomputing targetOffset before
    // any emit and including it in the cache key. This test pins that
    // invariant by moving the cursor across every in-window column while the
    // cache is warm — if the service ever leaked an out-of-window -1, the
    // assertion below would catch it.
    const { service } = createMultilineBrailleService(3, 2);

    // 2 rows × 6 cols, displaySize=3 → windows [0,3) and [3,6).
    const values = [[1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 50, 60]];

    const indices: number[] = [];
    const disposable = service.onChange(event => indices.push(event.index));

    // Enable at (0, 0): fresh encode with window [0,3).
    service.toggle(createLineTraceState(values, 0, 0));
    // Same-window moves (0,1) and (0,2): must be cache hits, never -1.
    service.update(createLineTraceState(values, 0, 1));
    service.update(createLineTraceState(values, 0, 2));

    expect(indices.length).toBeGreaterThanOrEqual(3);
    for (const index of indices) {
      expect(index).toBeGreaterThanOrEqual(0);
    }

    disposable.dispose();
    service.dispose();
  });

  test('multiline mode: bar chart renders with space-padded rows (no newlines)', () => {
    // The bar encoder shares encodeWithWrapping with line/heatmap, but no
    // existing test exercises the BarBrailleEncoder path end-to-end in
    // multiline mode. This pins that the shared wrapping behavior holds.
    const { service } = createMultilineBrailleService(10, 2);

    // 2 rows of 5 items each, displaySize=10, displayLines=2.
    const state = createBarTraceState([[1, 2, 3, 4, 5], [10, 20, 30, 40, 50]], 0, 0);

    let emitted = '';
    let emittedDisplayLines = -1;
    const disposable = service.onChange((event) => {
      emitted = event.value;
      emittedDisplayLines = event.displayLines;
    });

    service.toggle(state);

    // Multiline: no newlines, each row padded to displaySize boundary.
    expect(emitted.includes('\n')).toBe(false);
    // 2 rows × 10 chars = 20 total (each row: 5 data + 5 padding).
    expect(emitted.length).toBe(20);
    expect(emittedDisplayLines).toBe(2);

    disposable.dispose();
    service.dispose();
  });

  test('horizontal windowing: colOffset resets to 0 when brailleDisplayLines changes', () => {
    // Before the settings change, place the cursor in a non-zero window.
    // After changing the setting (with the cursor moved back to col=0 in
    // context state), the next encode should use window [0, displaySize),
    // proving the service did not reuse the prior non-zero offset.
    let currentDisplayLines = 2;
    let onChangeListener: ((event: SettingsChangeEventMock) => void) | null = null;

    const wideValues = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [10, 20, 30, 40, 50, 60, 70, 80, 90],
    ];
    // Start with cursor at col=5: window [3,6) with displaySize=3.
    let currentState = createLineTraceState(wideValues, 0, 5);

    const context = {
      moveToIndex: jest.fn<(row: number, col: number) => void>(),
      get state(): TraceState {
        return currentState;
      },
    } as unknown as Context;
    const notification = {
      notify: jest.fn<(message: string) => void>(),
    } as unknown as NotificationService;
    const display = { toggleFocus: jest.fn() } as unknown as DisplayService;

    const settings = {
      get: <T>(path: string): T => {
        if (path === 'general.brailleDisplaySize')
          return 3 as T;
        if (path === 'general.brailleDisplayLines')
          return currentDisplayLines as T;
        return undefined as T;
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

    const service = new BrailleService(context, notification, display, settings);

    const indices: number[] = [];
    const disposable = service.onChange(event => indices.push(event.index));

    service.toggle(currentState);
    // Window [3,6); rows reversed so row 0 occupies indices [3..5]; col 5 → index 5.
    expect(indices[indices.length - 1]).toBe(5);

    // Move cursor back to col=0 in context state so the post-change re-encode
    // reads the reset-relevant cursor.
    currentState = createLineTraceState(wideValues, 0, 0);

    // Flip displayLines; service should invalidate cache, reset colOffset to 0,
    // then re-encode from the current context state.
    currentDisplayLines = 3;
    expect(onChangeListener).not.toBeNull();
    onChangeListener!({
      affectsSetting: (path: string): boolean =>
        path === 'general.brailleDisplayLines',
      get: <T>(path: string): T => {
        if (path === 'general.brailleDisplayLines')
          return currentDisplayLines as T;
        return 3 as T;
      },
    });

    // If colOffset reset correctly, window is [0,3); row 0 occupies [3..5];
    // col 0 → index 3. If offset leaked, index would not be 3.
    expect(indices[indices.length - 1]).toBe(3);

    disposable.dispose();
    service.dispose();
  });
});
