import type { DotPadKey, DotPadState, DotPadTransport } from '@type/dotPad';
import type { TactileDisplayDriver } from '@type/tactileDisplay';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TactileDisplay } from '@service/tactileDisplay';
import { Emitter } from '@type/event';

/**
 * Tests for `src/service/tactileDisplay.ts`, which puts the tactile service and
 * the Settings dialog in front of whichever kind of display the reader has.
 *
 * Its failures are quiet in a particular way: it passes calls on and events
 * back, so getting the routing wrong does not throw -- a key on one device
 * pans the picture on the other, or a picture goes to a display nobody is
 * touching while the one under the reader's hands stays blank. So the cases
 * pin which driver each call reaches and which driver's events get through,
 * with two fake drivers standing for a DotPad and a Monarch.
 */

const DISCONNECTED: DotPadState = { status: 'disconnected', deviceName: null, transport: null, geometry: null, message: '' };

/**
 * A driver whose calls are recorded and whose events a case can fire.
 */
interface FakeDriver extends TactileDisplayDriver {
  current: DotPadState;
  setState: (state: Partial<DotPadState>) => void;
  fireKey: (key: DotPadKey) => void;
  fireWriteFailure: () => void;
  adoptResult: boolean;
  connect: jest.Mock<(transport: DotPadTransport) => Promise<DotPadState>>;
  adopt: jest.Mock<() => Promise<boolean>>;
  disconnect: jest.Mock<() => void>;
  preload: jest.Mock<() => Promise<void>>;
  supports: jest.Mock<(transport: DotPadTransport) => boolean>;
  writeGraphic: jest.Mock<(hex: string) => void>;
  writeGraphicRow: jest.Mock<(cellRow: number, hex: string) => void>;
  writeText: jest.Mock<(hex: string) => void>;
}

/**
 * Builds a fake driver for some transports.
 * @param deviceName - What it calls the device it connects to
 * @param transports - The transports it connects over
 */
function createDriver(deviceName: string, transports: DotPadTransport[]): FakeDriver {
  const states = new Emitter<DotPadState>();
  const keys = new Emitter<DotPadKey>();
  const failures = new Emitter<void>();
  const driver: FakeDriver = {
    transports,
    current: DISCONNECTED,
    get isConnected() {
      return driver.current.status === 'connected';
    },
    geometry: null,
    canTranslate: false,
    isSupported: true,
    onStateChange: states.event,
    onKey: keys.event,
    onWriteFailure: failures.event,
    adoptResult: false,
    setState: (state) => {
      driver.current = { ...driver.current, ...state };
      states.fire(driver.current);
    },
    fireKey: key => keys.fire(key),
    fireWriteFailure: () => failures.fire(),
    supports: jest.fn((transport: DotPadTransport) => transports.includes(transport)),
    preload: jest.fn(async () => {}),
    connect: jest.fn(async (transport: DotPadTransport) => {
      driver.setState({ status: 'connected', deviceName, transport });
      return driver.current;
    }),
    adopt: jest.fn(async () => {
      if (driver.adoptResult) {
        driver.setState({ status: 'connected', deviceName });
      }
      return driver.adoptResult;
    }),
    disconnect: jest.fn(() => driver.setState(DISCONNECTED)),
    translate: jest.fn(async () => null),
    writeGraphic: jest.fn(),
    writeGraphicRow: jest.fn(),
    writeText: jest.fn(),
    vibrate: jest.fn(() => true),
  };
  return driver;
}

/**
 * Saves a device in the reader's settings, as the Settings dialog does.
 * @param deviceId - The device, or null to save none
 */
function saveDevice(deviceId: string | null): void {
  const stored: Record<string, string> = deviceId === null
    ? {}
    : { 'maidr-settings': JSON.stringify({ general: { tactileDisplayDeviceId: deviceId } }) };
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: (key: string) => stored[key] ?? null },
    configurable: true,
    writable: true,
  });
}

describe('TactileDisplay', () => {
  let dotPad: FakeDriver;
  let monarch: FakeDriver;
  let display: TactileDisplay;

  beforeEach(() => {
    saveDevice(null);
    dotPad = createDriver('DotPad320', ['bluetooth', 'serial']);
    monarch = createDriver('Monarch', ['hid']);
    display = new TactileDisplay([dotPad, monarch]);
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('should connect a DotPad over Bluetooth or USB and a Monarch over WebHID', async () => {
    await display.connect('serial');
    const dotPadCalls = dotPad.connect.mock.calls.length;
    await display.connect('hid');

    expect(dotPadCalls).toBe(1);
    expect(monarch.connect).toHaveBeenCalledWith('hid');
    expect(display.current.deviceName).toBe('Monarch');
  });

  it('should close the display in use when the reader connects another', async () => {
    // Two displays drawn on at once, and only one of them under the reader's
    // hands.
    await display.connect('bluetooth');

    await display.connect('hid');

    expect(dotPad.disconnect).toHaveBeenCalledTimes(1);
    expect(dotPad.isConnected).toBe(false);
    expect(display.isConnected).toBe(true);
  });

  it('should pass on only the events of the display in use', async () => {
    await display.connect('hid');
    const keys: DotPadKey[] = [];
    const failures = jest.fn();
    const states: DotPadState[] = [];
    display.onKey(key => keys.push(key));
    display.onWriteFailure(failures);
    display.onStateChange(state => states.push(state));

    dotPad.fireKey('panLeft');
    dotPad.fireWriteFailure();
    dotPad.setState({ status: 'failed', message: 'busy' });
    monarch.fireKey('function4');
    monarch.fireWriteFailure();

    expect(keys).toEqual(['function4']);
    expect(failures).toHaveBeenCalledTimes(1);
    expect(states).toEqual([]);
  });

  it('should send writes to the display in use', async () => {
    await display.connect('hid');

    display.writeGraphic('ff');
    display.writeGraphicRow(2, '0f');
    display.writeText('01');

    expect(monarch.writeGraphic).toHaveBeenCalledWith('ff');
    expect(monarch.writeGraphicRow).toHaveBeenCalledWith(2, '0f');
    expect(monarch.writeText).toHaveBeenCalledWith('01');
    expect(dotPad.writeGraphic).not.toHaveBeenCalled();
  });

  it('should make a display that comes up on its own the one in use', async () => {
    // A Monarch handed back by another chart reconnects without going through
    // `connect`, and the picture has to follow it.
    await display.connect('bluetooth');
    const states: DotPadState[] = [];
    display.onStateChange(state => states.push(state));

    monarch.setState({ status: 'connected', deviceName: 'Monarch' });

    expect(states.at(-1)?.deviceName).toBe('Monarch');
    expect(dotPad.disconnect).toHaveBeenCalledTimes(1);
    display.writeText('01');
    expect(monarch.writeText).toHaveBeenCalledWith('01');
  });

  it('should take up the kind of display saved in Settings first', async () => {
    saveDevice('monarch');
    dotPad.adoptResult = true;
    monarch.adoptResult = true;

    const adopted = await display.adopt();

    expect(adopted).toBe(true);
    expect(monarch.adopt).toHaveBeenCalled();
    expect(dotPad.adopt).not.toHaveBeenCalled();
    expect(display.current.deviceName).toBe('Monarch');
  });

  it('should try the other kind when the first takes nothing up', async () => {
    monarch.adoptResult = true;

    const adopted = await display.adopt();

    expect(adopted).toBe(true);
    expect(dotPad.adopt).toHaveBeenCalled();
    expect(display.isConnected).toBe(true);
  });

  it('should take nothing up while a display is connected', async () => {
    await display.connect('hid');

    const adopted = await display.adopt();

    expect(adopted).toBe(false);
    expect(dotPad.adopt).not.toHaveBeenCalled();
    expect(monarch.adopt).not.toHaveBeenCalled();
  });

  it('should ask the driver of a transport whether it can be reached', () => {
    display.supports('hid');
    display.supports('serial');

    expect(monarch.supports).toHaveBeenCalledWith('hid');
    expect(dotPad.supports).toHaveBeenCalledWith('serial');
  });

  it('should fetch only what the chosen device needs', async () => {
    await display.preload('monarch');
    await display.preload(null);

    expect(monarch.preload).toHaveBeenCalledTimes(1);
    expect(dotPad.preload).toHaveBeenCalledTimes(1);
  });

  it('should disconnect the display in use', async () => {
    await display.connect('hid');

    display.disconnect();

    expect(monarch.disconnect).toHaveBeenCalledTimes(1);
    expect(display.isConnected).toBe(false);
  });
});
