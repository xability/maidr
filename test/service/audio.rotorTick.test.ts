/**
 * Tests for AudioService.playRotorTick -- the rotor's ratchet cue, a few soft
 * clicks like a clock being wound, played when the reader cycles the rotor
 * mode. It must stay a quiet click under the announcement: short, well below
 * the menu cues, silent when sound is OFF or the volume is 0, and its pitch
 * drift is what tells the two directions apart.
 *
 * AudioContext doesn't exist in the node test environment, so this installs
 * the same minimal mock as test/service/audio.menuTone.test.ts.
 */
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { PlotState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';

interface MockOscillator {
  type: string;
  frequency: { value: number };
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  disconnect: jest.Mock;
}

interface MockAudioContext {
  currentTime: number;
  state: string;
  destination: object;
  oscillators: MockOscillator[];
  createOscillator: () => MockOscillator;
  createGain: () => unknown;
  createStereoPanner: () => unknown;
  createDynamicsCompressor: () => unknown;
  resume: () => Promise<void>;
  close: () => void;
}

function makeOscillator(): MockOscillator {
  return {
    type: '',
    frequency: { value: 0 },
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeGain(): unknown {
  return {
    gain: {
      value: 0,
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      setValueCurveAtTime: jest.fn(),
    },
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makePanner(): unknown {
  return { pan: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() };
}

function makeCompressor(): unknown {
  return {
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

function installAudioContextMock(state: string = 'running'): MockAudioContext {
  const ctx: MockAudioContext = {
    currentTime: 0,
    state,
    destination: {},
    oscillators: [],
    createOscillator() {
      const osc = makeOscillator();
      this.oscillators.push(osc);
      return osc;
    },
    createGain: makeGain,
    createStereoPanner: makePanner,
    createDynamicsCompressor: makeCompressor,
    // Simplification: state flips synchronously, though a real AudioContext
    // only transitions once the promise settles. Tests where that ordering
    // matters must override resume() with a deferred flip.
    resume() {
      this.state = 'running';
      return Promise.resolve();
    },
    close: jest.fn(),
  };
  const audioGlobal = globalThis as unknown as { AudioContext: new () => MockAudioContext };
  audioGlobal.AudioContext = function () {
    return ctx;
  } as unknown as new () => MockAudioContext;
  return ctx;
}

function createSettings(volume: number = 100): SettingsService {
  return {
    get: <T>(key: string) => (key === 'general.volume' ? volume : 100) as unknown as T,
    onChange: () => {},
  } as unknown as SettingsService;
}

function createNotification(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const INITIAL_STATE: PlotState = { empty: true, type: 'figure' };

describe('AudioService rotor ratchet cue', () => {
  it('plays three short clicks, drifting up for the next mode and down for the previous', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playRotorTick('next');
    const next = ctx.oscillators.slice(before).map(osc => osc.frequency.value);
    service.playRotorTick('prev');
    const prev = ctx.oscillators.slice(before + 3).map(osc => osc.frequency.value);

    expect(next).toHaveLength(3);
    expect(next).toEqual([...next].sort((a, b) => a - b));
    expect(prev).toEqual([...next].reverse());
    service.dispose();
  });

  it('keeps each click short and quieter than the menu cues', async () => {
    const ctx = installAudioContextMock();
    const gains: { gain: { setValueAtTime: jest.Mock } }[] = [];
    const createGain = ctx.createGain;
    ctx.createGain = () => {
      const gain = createGain() as { gain: { setValueAtTime: jest.Mock } };
      gains.push(gain);
      return gain;
    };
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const gainsBefore = gains.length;
    service.playMenuOpenTone();
    const menuPeak = gains[gainsBefore].gain.setValueAtTime.mock.calls[0][0] as number;
    const oscBefore = ctx.oscillators.length;
    const tickGainsBefore = gains.length;
    service.playRotorTick('next');
    const tickPeak = gains[tickGainsBefore].gain.setValueAtTime.mock.calls[0][0] as number;
    const click = ctx.oscillators[oscBefore];
    const [startAt] = click.start.mock.calls[0] as [number];
    const [stopAt] = click.stop.mock.calls[0] as [number];

    expect(tickPeak).toBeLessThan(menuPeak);
    expect(stopAt - startAt).toBeLessThanOrEqual(0.02);
    service.dispose();
  });

  it('plays nothing when audio mode is OFF', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);
    service.toggle(); // SEPARATE -> OFF

    const before = ctx.oscillators.length;
    service.playRotorTick('next');

    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });

  it('plays nothing when volume is 0', async () => {
    const ctx = installAudioContextMock();
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(0), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playRotorTick('prev');

    expect(ctx.oscillators.length).toBe(before);
    service.dispose();
  });

  it('waits for a suspended AudioContext to resume rather than dropping the cue', async () => {
    const ctx = installAudioContextMock('suspended');
    const { AudioService } = await import('@service/audio');
    const service = new AudioService(createNotification(), createSettings(), INITIAL_STATE);

    const before = ctx.oscillators.length;
    service.playRotorTick('next');
    expect(ctx.oscillators.length).toBe(before);

    await Promise.resolve();
    expect(ctx.oscillators.length).toBe(before + 3);
    service.dispose();
  });
});
