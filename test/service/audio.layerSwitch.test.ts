/**
 * Page Up and Page Down through the real model, heard by the audio service.
 *
 * Wires a figure, its context and an `AudioService` the way the controller's
 * `registerObservers` does -- the figure, every subplot and every trace -- and
 * counts the oscillators one key press starts. A layer edge is one boundary
 * chord, as an arrow key's is, and a layer switch is one tone for the point
 * the reader lands on.
 *
 * AudioContext doesn't exist in the node test environment, so a minimal global
 * mock records `createOscillator` calls, as in audio.emptyTone.test.ts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { describe, expect, it, jest } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

const EMPTY_TONE_OSCILLATORS = 5; // one per harmonic frequency

interface MockAudioContext {
  currentTime: number;
  state: string;
  destination: object;
  oscillators: { frequency: { value: number } }[];
  createOscillator: () => unknown;
  createGain: () => unknown;
  createStereoPanner: () => unknown;
  createDynamicsCompressor: () => unknown;
  resume: () => Promise<void>;
  close: () => void;
}

/**
 * Installs an AudioContext stand-in that records each oscillator.
 *
 * A context born `suspended` starts running only once `resume()` settles, a
 * microtask later, as a browser's does: a cue deferred behind it is sounded
 * from the service's own `then`, not on the key press.
 * @param initialState - The state the context is born in
 * @returns The stand-in
 */
function installAudioContextMock(initialState = 'running'): MockAudioContext {
  const param = (): unknown => ({
    value: 0,
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
  });
  const node = (fields: Record<string, unknown>): unknown => ({
    ...fields,
    connect: jest.fn(),
    disconnect: jest.fn(),
  });
  const ctx: MockAudioContext = {
    currentTime: 0,
    state: initialState,
    destination: {},
    oscillators: [],
    createOscillator() {
      const osc = node({ type: '', frequency: param(), start: jest.fn(), stop: jest.fn() }) as {
        frequency: { value: number };
      };
      this.oscillators.push(osc);
      return osc;
    },
    createGain: () => node({ gain: param() }),
    createStereoPanner: () => node({ pan: param() }),
    createDynamicsCompressor: () => node({
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    }),
    resume() {
      return Promise.resolve().then(() => {
        this.state = 'running';
      });
    },
    close: jest.fn(),
  };
  const audioGlobal = globalThis as unknown as { AudioContext: new () => MockAudioContext };
  audioGlobal.AudioContext = function () {
    return ctx;
  } as unknown as new () => MockAudioContext;
  return ctx;
}

const BARS: MaidrLayer = {
  id: 'bars',
  type: TraceType.BAR,
  data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }, { x: 'C', y: 3 }],
};
const LINE: MaidrLayer = {
  id: 'line',
  type: TraceType.LINE,
  data: [[{ x: 'A', y: 3 }, { x: 'B', y: 4 }, { x: 'C', y: 5 }]],
};

/**
 * A chart wired as the controller wires it, with the reader on its first
 * layer's second point.
 * @param layers - The one subplot's layers
 * @param initialState - The state the AudioContext is born in
 * @returns The context and the oscillators sounded so far
 */
async function chart(
  layers: MaidrLayer[],
  initialState = 'running',
): Promise<{ context: Context; ctx: MockAudioContext }> {
  const ctx = installAudioContextMock(initialState);
  const { AudioService } = await import('@service/audio');
  const maidr: Maidr = { id: 'layers', subplots: [[{ layers }]] };
  const figure = new Figure(maidr);
  const context = new Context(figure);
  const settings = {
    get: <T>() => 100 as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const audio = new AudioService(notification, settings, figure.state);
  figure.addObserver(audio);
  figure.subplots.flat().forEach((subplot) => {
    subplot.addObserver(audio);
    subplot.traces.flat().forEach(trace => trace.addObserver(audio));
  });
  context.moveOnce('FORWARD');
  context.moveOnce('FORWARD');
  return { context, ctx };
}

describe('Page Up and Page Down, heard', () => {
  it('sounds one boundary chord at the edge of a chart with one layer', async () => {
    const { context, ctx } = await chart([BARS]);

    const before = ctx.oscillators.length;
    context.stepTrace('DOWNWARD');

    expect(ctx.oscillators.length - before).toBe(EMPTY_TONE_OSCILLATORS);
  });

  it('sounds one tone for the point a layer switch lands on', async () => {
    const { context, ctx } = await chart([BARS, LINE]);

    const before = ctx.oscillators.length;
    context.stepTrace('UPWARD');

    expect(ctx.oscillators.length - before).toBe(1);
  });

  it('sounds one boundary chord past the last layer', async () => {
    const { context, ctx } = await chart([BARS, LINE]);
    context.stepTrace('UPWARD');

    const before = ctx.oscillators.length;
    context.stepTrace('UPWARD');

    expect(ctx.oscillators.length - before).toBe(EMPTY_TONE_OSCILLATORS);
  });

  // Focus that lands programmatically -- a screen reader's virtual cursor,
  // `autofocus`, a host page calling `.focus()` -- leaves the context
  // suspended, and the service sounds the key's cue once `resume()` settles.
  // The subplot's "no additional layer" follows the trace's boundary state
  // within the same key press, and must not take the trace's chord's place.
  describe('on a suspended AudioContext', () => {
    /**
     * Lets a deferred cue's `resume()` settle.
     * @returns Once the pending microtasks have run
     */
    async function settle(): Promise<void> {
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
    }

    it('sounds the boundary chord at the edge of a chart with one layer', async () => {
      const { context, ctx } = await chart([BARS], 'suspended');
      await settle();
      ctx.state = 'suspended';

      const before = ctx.oscillators.length;
      context.stepTrace('DOWNWARD');
      await settle();

      expect(ctx.state).toBe('running');
      expect(ctx.oscillators.length - before).toBe(EMPTY_TONE_OSCILLATORS);
    });

    it('sounds the boundary chord past the last layer', async () => {
      const { context, ctx } = await chart([BARS, LINE], 'suspended');
      context.stepTrace('UPWARD');
      await settle();
      ctx.state = 'suspended';

      const before = ctx.oscillators.length;
      context.stepTrace('UPWARD');
      await settle();

      expect(ctx.state).toBe('running');
      expect(ctx.oscillators.length - before).toBe(EMPTY_TONE_OSCILLATORS);
    });
  });
});
