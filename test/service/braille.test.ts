import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { LineBrailleState, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { BrailleService } from '@service/braille';
import { TraceType } from '@type/grammar';

interface SettingsChangeEventMock {
  affectsSetting: (settingPath: string) => boolean;
  get: <T>(settingPath: string) => T;
}

interface BrailleCacheCell {
  row: number;
  col: number;
}

interface BrailleCache {
  value: string;
  cellToIndex: number[][];
  indexToCell: BrailleCacheCell[];
}

interface BrailleServiceInternals {
  cache: BrailleCache | null;
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
 * Creates a settings mock and exposes a helper to emit display-size change events.
 * @param displaySize - Initial display width used by the encoder
 * @returns Settings service mock and change trigger
 */
function createSettingsMockController(displaySize: number): SettingsMockController {
  let currentDisplaySize = displaySize;
  let onChangeListener: ((event: SettingsChangeEventMock) => void) | null = null;

  const settings = {
    get: <T>(_settingPath: string): T => currentDisplaySize as T,
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
    get: <T>(_settingPath: string): T => displaySize as T,
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

/**
 * Reads the internal cache from BrailleService for encoding assertions.
 * @param service - BrailleService under test
 * @returns Internal cache snapshot
 */
function getCache(service: BrailleService): BrailleCache {
  const internals = service as unknown as BrailleServiceInternals;
  if (internals.cache === null) {
    throw new Error('Expected braille cache to be populated.');
  }
  return internals.cache;
}

describe('BrailleService display-size encoding', () => {
  test('encodes one newline when row length is less than display size', () => {
    const { service } = createBrailleService(10);
    const state = createLineTraceState([[1, 2, 3]], 0, 0);

    service.toggle(state);

    const cache = getCache(service);
    const newlineCount = (cache.value.match(/\n/g) ?? []).length;

    expect(newlineCount).toBe(1);
    expect(cache.value.endsWith('\n\n')).toBe(false);

    service.dispose();
  });

  test('appends end-of-row sentinel for non-multiple row lengths', () => {
    const { service, contextMoveToIndex } = createBrailleService(2);
    const state = createLineTraceState([[1, 2, 3]], 0, 3);

    let lastIndex = -1;
    const disposable = service.onChange((event) => {
      lastIndex = event.index;
    });

    service.toggle(state);

    const cache = getCache(service);
    expect(cache.cellToIndex[0][3]).toBe(lastIndex);

    service.moveToIndex(lastIndex);
    expect(contextMoveToIndex).toHaveBeenCalledWith(0, 3);

    disposable.dispose();
    service.dispose();
  });

  test('uses explicit sentinel when row length is exactly divisible by display size', () => {
    const { service, contextMoveToIndex } = createBrailleService(2);
    const state = createLineTraceState([[1, 2, 3, 4]], 0, 4);

    let sentinelIndex = -1;
    const disposable = service.onChange((event) => {
      sentinelIndex = event.index;
    });

    service.toggle(state);

    const cache = getCache(service);
    expect(cache.value.endsWith('\n\n')).toBe(false);
    expect(cache.cellToIndex[0][4]).toBe(sentinelIndex);

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
});
