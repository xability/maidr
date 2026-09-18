/**
 * @jest-environment jsdom
 */

/**
 * A refused target leaves the reader's modes exactly as they were.
 *
 * `Controller.navigateTo` leaves the modes that re-route the arrow keys --
 * the candlestick delta layer, grid-cell navigation, a rotor mode -- before it
 * moves, because the target is spelled in the trace's data coordinates. Those
 * exits have side effects of their own: the delta layer is popped from the
 * stack and the keyboard scope changes with it. So they must not run for a
 * target that is then refused, or a stale click from a host would silently
 * throw a reader out of the view they were in and report that nothing moved.
 *
 * Built on a real `Controller`, since the ordering under test is the
 * controller's own; the Web Audio API and `hotkeys-js` are stubbed at the
 * boundary, as the component tests stub them.
 */

import type { Keys } from '@type/event';
import type { CandlestickPoint, LinePoint, Maidr } from '@type/grammar';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';
import { Controller } from '../../src/controller';

const setScope = jest.fn<(scope: string) => void>();

jest.mock('hotkeys-js', () => {
  const hotkeys = (): void => {};
  hotkeys.setScope = (scope: string): void => setScope(scope);
  hotkeys.unbind = (): void => {};
  hotkeys.deleteScope = (): void => {};
  hotkeys.filter = (): boolean => true;
  hotkeys.getScope = (): string => '';
  return { __esModule: true, default: hotkeys };
});

/**
 * A candle whose close price is the given value.
 * @param value - The date string
 * @param close - The close price
 * @returns A candlestick point
 */
function candle(value: string, close: number): CandlestickPoint {
  return {
    value,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 100,
    trend: 'Bull',
    volatility: 4,
  };
}

/**
 * A candlestick layer over a moving-average line that covers every candle, so
 * the delta layer can be activated from the first one.
 * @returns A Maidr config
 */
function createMaidr(): Maidr {
  const candles: CandlestickPoint[] = [
    candle('2026-01-01', 10),
    candle('2026-01-02', 12),
    candle('2026-01-03', 9),
    candle('2026-01-04', 11),
  ];
  const average: LinePoint[] = candles.map(point => ({
    x: point.value,
    y: point.close + 1,
    z: 'Moving Average 3 days',
  }));
  return {
    id: 'navigate-controller',
    subplots: [[{
      layers: [
        {
          id: 'candle-layer',
          type: TraceType.CANDLESTICK,
          axes: { x: { label: 'Date' }, y: { label: 'Price' } },
          data: candles,
        },
        {
          id: 'ma-layer',
          type: TraceType.LINE,
          axes: { x: { label: 'Date' }, y: { label: 'Price' } },
          data: [average],
        },
      ],
    }]],
  };
}

/** A Web Audio node that accepts every call the audio service makes of it. */
function audioNode(): Record<string, unknown> {
  const param = {
    value: 0,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
  };
  return {
    type: '',
    frequency: param,
    gain: param,
    pan: param,
    threshold: param,
    knee: param,
    ratio: param,
    attack: param,
    release: param,
    buffer: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  };
}

/** A stand-in AudioContext, running from the start. */
function audioContext(): Record<string, unknown> {
  return {
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    destination: {},
    createOscillator: audioNode,
    createGain: audioNode,
    createStereoPanner: audioNode,
    createDynamicsCompressor: audioNode,
    createConvolver: audioNode,
    createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
    createBufferSource: audioNode,
    resume: () => Promise.resolve(),
    close: jest.fn(),
  };
}

const realStructuredClone = globalThis.structuredClone;

beforeAll(() => {
  globalThis.structuredClone = (<T>(value: T): T => JSON.parse(JSON.stringify(value)) as T) as typeof structuredClone;
  (globalThis as unknown as { AudioContext: unknown }).AudioContext
    = function AudioContextStub(): Record<string, unknown> {
      return audioContext();
    } as unknown as typeof AudioContext;
});

afterAll(() => {
  globalThis.structuredClone = realStructuredClone;
});

/** A controller over the fixture, with the reader on the delta layer. */
interface Harness {
  controller: Controller;
  /** The text last announced. */
  announced: () => string;
}

let controller: Controller | null = null;

/**
 * Builds the controller, walks onto the chart, and activates the delta layer
 * through the same commands the keyboard runs.
 * @returns The harness
 */
function onDeltaLayer(): Harness {
  const plot = document.createElement('div');
  document.body.append(plot);
  const store = createMaidrStore();
  controller = new Controller(createMaidr(), plot, store);
  const { commandExecutor } = controller.getContextValue();

  // `Keys` is the keys every scope shares, which is none: cast, as the
  // executor's own callers do.
  commandExecutor.executeCommand('MOVE_RIGHT' as Keys);
  commandExecutor.executeCommand('TOGGLE_CANDLESTICK_DELTA_LAYER' as Keys);
  commandExecutor.executeCommand('CANDLESTICK_DELTA_REF_SELECT' as Keys);
  expect(setScope).toHaveBeenLastCalledWith(Scope.CANDLESTICK_DELTA);

  return {
    controller,
    announced: (): string => store.getState().text.value ?? '',
  };
}

beforeEach(() => {
  setScope.mockClear();
});

afterEach(() => {
  controller?.dispose();
  controller = null;
  document.body.innerHTML = '';
});

describe('Controller.navigateTo', () => {
  it('should leave the delta layer in place when the target is refused', () => {
    const { controller, announced } = onDeltaLayer();
    const before = announced();
    setScope.mockClear();

    expect(controller.navigateTo({ layerId: 'candle-layer', row: 0, col: 99 })).toBe(false);
    expect(controller.navigateTo({ layerId: 'elsewhere', row: 0, col: 0 })).toBe(false);

    // The delta layer was neither closed nor left: the keyboard scope did not
    // change and nothing new was announced.
    expect(setScope).not.toHaveBeenCalled();
    expect(announced()).toBe(before);
  });

  it('should close the delta layer and land on the mark when the target is good', () => {
    const { controller, announced } = onDeltaLayer();
    setScope.mockClear();

    expect(controller.navigateTo({ layerId: 'candle-layer', row: 0, col: 2 })).toBe(true);

    expect(setScope).toHaveBeenCalledWith(Scope.TRACE);
    expect(announced()).toContain('2026-01-03');
  });
});
