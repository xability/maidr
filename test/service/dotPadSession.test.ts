import type {
  DotPadState,
  DotPadTransport,
  DotPadVendorDevice,
  DotPadVendorModule,
  DotPadVendorScanner,
  DotPadVendorSdk,
} from '@type/dotPad';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Why this file exists.
 *
 * `dotPadSession` is the whole Bluetooth connection state machine sitting
 * behind the Settings device picker, and none of it can be exercised for real:
 * jest has no Web Bluetooth, no vendor SDK, and no tactile display. The module
 * is written so that it does not need any of them — every device-specific
 * decision is taken behind two probes, `'bluetooth' in navigator` and a vendor
 * module discovered off the page's globals. This file drives both probes and
 * holds the state machine to its contract, because the alternative is finding
 * out what it does only when a blind reader plugs a display in.
 *
 * The regressions pinned here are the quiet ones:
 *
 * - `connect()` returning rather than throwing. Every failure on this path is
 *   something the reader has to be *told* next to the connect control, so a
 *   thrown exception is a silent dead end. A dismissed picker in particular is
 *   `disconnected`, not `failed` — the user changed their mind, nothing broke.
 * - Geometry read from the device's own report. Models differ, and one DotPad
 *   has no braille text line at all. A hardcoded 30x10 renders garbage on
 *   anything else, so the successful-connect case uses a deliberately unusual
 *   20x15 device.
 * - `writeGraphicRow(0, …)` addressing line **1**. Line 0 on the device is the
 *   braille text line, so an off-by-one here draws the chart one row out of
 *   place, or over the text, without any error anywhere.
 * - Writes staying serialised, and a failed write staying swallowed. The device
 *   acknowledges one line before accepting the next, and a dropped frame must
 *   not break the navigation the reader is in the middle of.
 *
 * Two things about the setup.
 *
 * `dotPadSession` is a module-level singleton on purpose: it must outlive
 * MAIDR's controller, which is rebuilt on every focus change, because
 * reconnecting needs a fresh user gesture that cannot be asked for
 * mid-navigation. That is exactly what makes it leak between test cases — a
 * connection opened by one case is still open in the next, and `connect()`
 * short-circuits. So every case calls `loadSession()`, which resets the module
 * registry and dynamically re-imports the module to get a genuinely fresh
 * singleton.
 *
 * The session reads globals through `window`, which the node test environment
 * does not have, so `beforeEach` points `window` at `globalThis` and the vendor
 * module is installed as a global from there. Both that and `navigator` are put
 * back in `afterEach`; leaving either behind would decide the next case's
 * `isSupported`.
 */

/**
 * The module's own type for the session, so helpers can be annotated without
 * exporting the class it comes from.
 */
type Session = typeof import('@service/dotPadSession')['dotPadSession'];

type MessageCallback = (device: DotPadVendorDevice, dataCode: string, msg: string) => void;

type KeyDownCallback = (device: DotPadVendorDevice, key: string, binary: string) => void;

/**
 * One recorded call to the vendor SDK's display methods.
 */
type RecordedWrite
  = | { readonly kind: 'graphic'; readonly hex: string; readonly mode: string | undefined }
    | { readonly kind: 'line'; readonly lineId: number; readonly startCell: number; readonly hex: string; readonly mode: string }
    | { readonly kind: 'text'; readonly hex: string; readonly mode: string | undefined };

/**
 * Behaviour the fake SDK defers to, so a case can make the picker resolve
 * empty, a connect reject, or a write hang without rebuilding the vendor.
 */
interface VendorHooks {
  scan: () => Promise<unknown>;
  connectDevice: () => Promise<DotPadVendorDevice | null | undefined>;
  onGraphic: () => void;
  onText: () => Promise<void> | void;
  translate: (text: string) => Promise<string>;
}

/**
 * What the SDK was told about braille translation, and what it was asked to
 * translate.
 */
interface Translation {
  language: unknown;
  grade: number | null;
  perLine: number | null;
  assetBaseUrl: string | null;
  requests: { text: string; wordWrap?: boolean }[];
}

/**
 * Stands in for a `BrailleLanguage` entry. MAIDR passes these straight back to
 * the SDK without looking inside, so an opaque marker is the honest fake.
 */
const ENGLISH_TABLE = { name: 'English' };

/**
 * A fake vendor module plus everything the assertions need to see through it.
 */
interface Vendor {
  readonly module: DotPadVendorModule;
  readonly hooks: VendorHooks;
  readonly writes: RecordedWrite[];
  readonly disconnected: (DotPadVendorDevice | null | undefined)[];
  readonly counts: { sdks: number; scanners: number; scans: number; bleScans: number; usbScans: number; bleConnects: number; usbConnects: number };
  readonly translation: Translation;
  fireMessage: (dataCode: string, device?: DotPadVendorDevice) => void;
  fireKeyDown: (key: string) => void;
}

/**
 * A device that is deliberately not the shape anybody would hardcode: 20 cell
 * rows by 15 cell columns, so a constant 30x10 fails the geometry assertions.
 */
const DEVICE: DotPadVendorDevice = {
  isConnect: true,
  cellType: 'DotPad 320 test unit',
  numberCellRows: 20,
  numberCellColumns: 15,
  numberBrailleCellColumns: 20,
};

/**
 * The opaque token a real scanner hands back for the chosen device.
 */
const SELECTION = { id: 'selected-dotpad' };

/**
 * Builds a fake vendor module implementing the `DotPadVendorModule` contract.
 * @param device - Device the SDK connects to by default
 * @returns The module and the recording around it
 */
function createVendor(device: DotPadVendorDevice = DEVICE): Vendor {
  const writes: RecordedWrite[] = [];
  const disconnected: (DotPadVendorDevice | null | undefined)[] = [];
  const counts = { sdks: 0, scanners: 0, scans: 0, bleScans: 0, usbScans: 0, bleConnects: 0, usbConnects: 0 };
  const translation: Translation = {
    language: undefined,
    grade: null,
    perLine: null,
    assetBaseUrl: null,
    requests: [],
  };
  let messageCallback: MessageCallback | null = null;
  let keyDownCallback: KeyDownCallback | null = null;

  const hooks: VendorHooks = {
    scan: (): Promise<unknown> => Promise.resolve(SELECTION),
    connectDevice: (): Promise<DotPadVendorDevice | null | undefined> => Promise.resolve(device),
    onGraphic: (): void => {},
    onText: (): Promise<void> | void => {},
    translate: (): Promise<string> => Promise.resolve('1e15'),
  };

  class FakeScanner implements DotPadVendorScanner {
    public constructor() {
      counts.scanners += 1;
    }

    public startBleScan(): Promise<unknown> {
      counts.scans += 1;
      counts.bleScans += 1;
      return hooks.scan();
    }

    public startUsbScan(): Promise<unknown> {
      counts.scans += 1;
      counts.usbScans += 1;
      return hooks.scan();
    }
  }

  class FakeSdk implements DotPadVendorSdk {
    public constructor() {
      counts.sdks += 1;
    }

    public getConnectedDevices(): DotPadVendorDevice[] {
      return [];
    }

    public setBrailleLanguage(language: unknown, gradeOption?: number | null): void {
      translation.language = language;
      translation.grade = gradeOption ?? null;
    }

    public setNumberOfBraillePerLine(count: number): void {
      translation.perLine = count;
    }

    public translateText(inputText: string, applyWordWrap?: boolean): Promise<string> {
      translation.requests.push({ text: inputText, wordWrap: applyWordWrap });
      return hooks.translate(inputText);
    }

    public connectBleDevice(_selected: unknown): Promise<DotPadVendorDevice | null | undefined> {
      counts.bleConnects += 1;
      return hooks.connectDevice();
    }

    public connectUsbDevice(_selected: unknown): Promise<DotPadVendorDevice | null | undefined> {
      counts.usbConnects += 1;
      return hooks.connectDevice();
    }

    public disconnect(target?: DotPadVendorDevice | null): void {
      disconnected.push(target);
    }

    public displayGraphicData(hex: string, _device?: DotPadVendorDevice | null, mode?: string): void {
      hooks.onGraphic();
      writes.push({ kind: 'graphic', hex, mode });
    }

    public displayTextData(hex: string, _device?: DotPadVendorDevice | null, mode?: string): Promise<void> | void {
      const pending = hooks.onText();
      writes.push({ kind: 'text', hex, mode });
      return pending;
    }

    public displayLineData(
      lineId: number,
      startCellIndex: number,
      hex: string,
      mode: string,
      _device?: DotPadVendorDevice | null,
    ): void {
      writes.push({ kind: 'line', lineId, startCell: startCellIndex, hex, mode });
    }

    public setCallBack(
      message: MessageCallback | null,
      _key: ((device: DotPadVendorDevice, keyCode: string, msg: string) => void) | null,
      keyDown?: KeyDownCallback | null,
    ): void {
      messageCallback = message;
      keyDownCallback = keyDown ?? null;
    }
  }

  return {
    module: {
      DotPadSDK: FakeSdk,
      DotPadScanner: FakeScanner,
      BrailleLanguage: { English: ENGLISH_TABLE },
      GradeOption: { Grade1: 1, Grade2: 2, Grade3: 3 },
      LiblouisManager: {
        setAssetBaseUrl: (url: string): void => {
          translation.assetBaseUrl = url;
        },
      },
    },
    hooks,
    translation,
    writes,
    disconnected,
    counts,
    fireMessage: (dataCode: string, target: DotPadVendorDevice = device): void => {
      messageCallback?.(target, dataCode, '');
    },
    fireKeyDown: (key: string): void => {
      keyDownCallback?.(device, key, '');
    },
  };
}

/**
 * The page's globals, as the session reads them.
 * @returns `globalThis` as a writable bag of properties
 */
function pageScope(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

/**
 * Replaces `navigator` for one test.
 * @param value - The stand-in navigator, or undefined to remove it entirely
 */
function setNavigator(value: object | undefined): void {
  if (value === undefined) {
    delete pageScope().navigator;
    return;
  }
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
}

/**
 * Puts a vendor module where the session looks for one.
 * @param vendor - The fake vendor, or undefined to leave the page bare
 */
function installVendor(vendor: Vendor | undefined): void {
  if (vendor === undefined) {
    delete pageScope().DotPadSDK;
    return;
  }
  pageScope().DotPadSDK = vendor.module;
}

/**
 * Loads a fresh copy of the singleton.
 *
 * Resetting the registry is what stops one case's connection from being the
 * next case's starting state.
 *
 * @returns The session exported by a newly evaluated copy of the module
 */
async function loadSession(): Promise<Session> {
  jest.resetModules();
  const module = await import('@service/dotPadSession');
  return module.dotPadSession;
}

/**
 * Waits for the session's write queue to drain.
 *
 * The queue is a private promise chain, so this waits on a macrotask instead:
 * every microtask already scheduled, including each link of the chain, runs
 * before a zero-delay timer does.
 */
async function flushWrites(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

/**
 * Connects a fresh session to the fake vendor.
 * @param vendor - The fake vendor to connect through
 * @returns The connected session and the state it settled on
 */
async function connectSession(
  vendor: Vendor,
  transport: DotPadTransport = 'bluetooth',
): Promise<{ session: Session; state: DotPadState }> {
  setNavigator(transport === 'bluetooth' ? { bluetooth: {} } : { serial: {} });
  installVendor(vendor);
  const session = await loadSession();
  const state = await session.connect(transport);
  return { session, state };
}

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

// The failure paths log on purpose; a file-scope spy keeps the expected noise
// out of every run without being reinstalled per test.
const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('dotPadSession', () => {
  beforeEach(() => {
    pageScope().window = globalThis;
    consoleError.mockClear();
  });

  afterEach(() => {
    delete pageScope().DotPadSDK;
    delete pageScope().window;
    if (navigatorDescriptor === undefined) {
      delete pageScope().navigator;
    } else {
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    }
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  describe('support detection', () => {
    it('should report no support when the browser has no Bluetooth', async () => {
      setNavigator({ userAgent: 'test' });

      const session = await loadSession();

      expect(session.isSupported).toBe(false);
    });

    it('should report support when the browser exposes Bluetooth', async () => {
      setNavigator({ bluetooth: {} });

      const session = await loadSession();

      expect(session.isSupported).toBe(true);
    });

    it('should report each transport separately', async () => {
      // A page may permit one and not the other -- Permissions Policy gates
      // them independently, and Web Serial does not exist on Android at all.
      // Collapsing the two into one answer would make a USB-only page look as
      // though it could reach nothing.
      setNavigator({ serial: {} });

      const session = await loadSession();

      expect(session.supports('serial')).toBe(true);
      expect(session.supports('bluetooth')).toBe(false);
      expect(session.isSupported).toBe(true);
    });

    it('should report support when only Bluetooth is available', async () => {
      setNavigator({ bluetooth: {} });

      const session = await loadSession();

      expect(session.supports('bluetooth')).toBe(true);
      expect(session.supports('serial')).toBe(false);
    });

    it('should report no support for either transport without a navigator', async () => {
      setNavigator(undefined);

      const session = await loadSession();

      expect(session.supports('bluetooth')).toBe(false);
      expect(session.supports('serial')).toBe(false);
    });

    it('should report no support when there is no navigator at all', async () => {
      setNavigator(undefined);

      const session = await loadSession();

      expect(session.isSupported).toBe(false);
    });
  });

  describe('braille translation', () => {
    it('should ask the SDK for contracted braille once connected', async () => {
      const vendor = createVendor();

      const { session } = await connectSession(vendor);

      // Grade 2 rather than grade 1: contractions are most of the difference
      // between a value fitting a twenty-cell line and needing to be panned.
      expect(vendor.translation.grade).toBe(2);
      expect(vendor.translation.language).toBe(ENGLISH_TABLE);
      expect(session.canTranslate).toBe(true);
    });

    it('should point the SDK at a liblouis build', async () => {
      const vendor = createVendor();

      await connectSession(vendor);

      expect(vendor.translation.assetBaseUrl).toContain('lib/');
    });

    it('should translate through the SDK rather than word-wrapping there', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);

      const hex = await session.translate('the');

      // MAIDR windows the line itself against the cell count the device
      // reported, so a wrap inserted by the SDK would fight that.
      expect(hex).toBe('1e15');
      expect(vendor.translation.requests).toEqual([{ text: 'the', wordWrap: false }]);
    });

    it('should report no translation when the SDK has no language tables', async () => {
      const vendor = createVendor();
      const bare = { DotPadSDK: vendor.module.DotPadSDK, DotPadScanner: vendor.module.DotPadScanner };
      setNavigator({ bluetooth: {} });
      pageScope().window = globalThis;
      pageScope().DotPadSDK = bare;
      const session = await loadSession();
      await session.connect();

      // An older SDK build still drives the pins; only the contracted text
      // line is lost, and the caller falls back rather than going silent.
      expect(session.isConnected).toBe(true);
      expect(session.canTranslate).toBe(false);
      expect(await session.translate('the')).toBeNull();
    });

    it('should fall back rather than throw when translation fails', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);
      vendor.hooks.translate = (): Promise<string> => Promise.reject(new Error('no tables'));

      expect(await session.translate('the')).toBeNull();
    });

    it('should fall back when the SDK answers with nothing', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);
      vendor.hooks.translate = (): Promise<string> => Promise.resolve('');

      expect(await session.translate('the')).toBeNull();
    });

    it('should not translate before anything is connected', async () => {
      const session = await loadSession();

      expect(session.canTranslate).toBe(false);
      expect(await session.translate('the')).toBeNull();
    });
  });

  describe('connect over USB', () => {
    it('should scan and connect over serial rather than Bluetooth', async () => {
      const vendor = createVendor();

      const { session, state } = await connectSession(vendor, 'serial');

      expect(state.status).toBe('connected');
      expect(state.transport).toBe('serial');
      expect(vendor.counts.usbScans).toBe(1);
      expect(vendor.counts.usbConnects).toBe(1);
      expect(vendor.counts.bleScans).toBe(0);
      expect(vendor.counts.bleConnects).toBe(0);
      expect(session.isConnected).toBe(true);
    });

    it('should record the transport it connected over', async () => {
      const vendor = createVendor();

      const { state } = await connectSession(vendor, 'bluetooth');

      // The two differ enough in responsiveness that a reader on a slow
      // display should be able to see which one they got.
      expect(state.transport).toBe('bluetooth');
    });

    it('should refuse USB on a page that only permits Bluetooth', async () => {
      const vendor = createVendor();
      setNavigator({ bluetooth: {} });
      installVendor(vendor);
      const session = await loadSession();

      const state = await session.connect('serial');

      expect(state.status).toBe('unavailable');
      expect(state.message).toContain('USB');
      expect(vendor.counts.scans).toBe(0);
    });

    it('should refuse Bluetooth on a page that only permits USB', async () => {
      const vendor = createVendor();
      setNavigator({ serial: {} });
      installVendor(vendor);
      const session = await loadSession();

      const state = await session.connect('bluetooth');

      expect(state.status).toBe('unavailable');
      expect(state.message).toContain('Bluetooth');
      expect(vendor.counts.scans).toBe(0);
    });

    it('should clear the transport when the device drops', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor, 'serial');

      vendor.fireMessage('Disconnected');

      expect(session.current.transport).toBeNull();
      expect(session.isConnected).toBe(false);
    });

    it('should clear the transport on an explicit disconnect', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor, 'serial');

      session.disconnect();

      expect(session.current.transport).toBeNull();
    });
  });

  describe('connect', () => {
    it('should resolve as unavailable with a message when Bluetooth is missing', async () => {
      setNavigator({ userAgent: 'test' });
      const vendor = createVendor();
      installVendor(vendor);
      const session = await loadSession();

      const state = await session.connect();

      expect(state.status).toBe('unavailable');
      expect(state.message.length).toBeGreaterThan(0);
      expect(vendor.counts.sdks).toBe(0);
      expect(vendor.counts.scans).toBe(0);
      expect(session.isConnected).toBe(false);
    });

    it('should resolve as unavailable when the page carries no vendor SDK', async () => {
      setNavigator({ bluetooth: {} });
      installVendor(undefined);
      const session = await loadSession();

      const state = await session.connect();

      expect(state.status).toBe('unavailable');
      expect(state.message.length).toBeGreaterThan(0);
      expect(session.isConnected).toBe(false);
    });

    it('should connect and report the geometry the device itself reports', async () => {
      const vendor = createVendor();
      setNavigator({ bluetooth: {} });
      installVendor(vendor);
      const session = await loadSession();
      const seen: DotPadState[] = [];
      session.onStateChange(state => seen.push(state));

      const state = await session.connect();

      expect(state.status).toBe('connected');
      expect(state.deviceName).toBe(DEVICE.cellType);
      expect(session.isConnected).toBe(true);
      expect(session.geometry).toEqual({
        cellColumns: 15,
        cellRows: 20,
        textCells: 20,
        dotWidth: 30,
        dotHeight: 80,
      });
      expect(seen.map(entry => entry.status)).toEqual(['connecting', 'connected']);
    });

    it('should derive dot dimensions from the cell counts of a second device shape', async () => {
      const vendor = createVendor({
        isConnect: true,
        cellType: 'DotPad no text line',
        numberCellRows: 4,
        numberCellColumns: 40,
        numberBrailleCellColumns: 0,
      });

      const { session } = await connectSession(vendor);

      expect(session.geometry).toEqual({
        cellColumns: 40,
        cellRows: 4,
        textCells: 0,
        dotWidth: 80,
        dotHeight: 16,
      });
    });

    it('should treat a dismissed picker as disconnected rather than failed', async () => {
      const vendor = createVendor();
      vendor.hooks.scan = (): Promise<unknown> => Promise.resolve(undefined);

      const { session, state } = await connectSession(vendor);

      expect(state.status).toBe('disconnected');
      expect(state.message).toMatch(/selected/i);
      expect(session.isConnected).toBe(false);
    });

    it('should fail without staying connected when the scanner rejects', async () => {
      const vendor = createVendor();
      vendor.hooks.scan = (): Promise<unknown> => Promise.reject(new Error('scan blew up'));

      const { session, state } = await connectSession(vendor);

      expect(state.status).toBe('failed');
      expect(state.message).toBe('scan blew up');
      expect(session.isConnected).toBe(false);
    });

    it('should fail without staying connected when connecting rejects', async () => {
      const vendor = createVendor();
      vendor.hooks.connectDevice = (): Promise<DotPadVendorDevice> =>
        Promise.reject(new Error('device refused the connection'));

      const { session, state } = await connectSession(vendor);

      expect(state.status).toBe('failed');
      expect(state.message).toBe('device refused the connection');
      expect(session.isConnected).toBe(false);
      expect(session.geometry).toBeNull();
    });

    it('should fail when the SDK returns no device', async () => {
      const vendor = createVendor();
      vendor.hooks.connectDevice = (): Promise<null> => Promise.resolve(null);

      const { session, state } = await connectSession(vendor);

      expect(state.status).toBe('failed');
      expect(state.message.length).toBeGreaterThan(0);
      expect(session.isConnected).toBe(false);
    });

    it('should not reopen the picker when a device is already connected', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);

      const state = await session.connect();

      expect(state.status).toBe('connected');
      expect(vendor.counts.scans).toBe(1);
      expect(vendor.counts.sdks).toBe(1);
    });
  });

  describe('writes', () => {
    it('should write nothing at all while disconnected', async () => {
      const vendor = createVendor();
      setNavigator({ bluetooth: {} });
      installVendor(vendor);
      const session = await loadSession();

      session.writeGraphic('ff00');
      session.writeGraphicRow(0, 'ff');
      session.writeText('2801');
      await flushWrites();

      expect(vendor.writes).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('should send a full graphic frame in graphic mode once connected', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);

      session.writeGraphic('ff00ff');
      await flushWrites();

      expect(vendor.writes).toEqual([{ kind: 'graphic', hex: 'ff00ff', mode: 'GraphicMode' }]);
    });

    it('should address graphic row 0 as line 1, past the braille text line', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);

      session.writeGraphicRow(0, 'aa');
      await flushWrites();

      expect(vendor.writes).toEqual([
        { kind: 'line', lineId: 1, startCell: 0, hex: 'aa', mode: 'GraphicMode' },
      ]);
    });

    it('should keep the row offset on the last row of the graphic area', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);

      session.writeGraphicRow(19, 'bb');
      await flushWrites();

      expect(vendor.writes).toEqual([
        { kind: 'line', lineId: 20, startCell: 0, hex: 'bb', mode: 'GraphicMode' },
      ]);
    });

    it('should send braille cells to the text line in text mode', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);

      session.writeText('281b');
      await flushWrites();

      expect(vendor.writes).toEqual([{ kind: 'text', hex: '281b', mode: 'TextMode' }]);
    });

    it('should hold a write back until the one in flight finishes', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);
      let release = (): void => {};
      vendor.hooks.onText = (): Promise<void> => new Promise<void>((resolve) => {
        release = resolve;
      });

      session.writeText('2801');
      session.writeGraphic('ff');
      await flushWrites();

      expect(vendor.writes).toEqual([{ kind: 'text', hex: '2801', mode: 'TextMode' }]);

      release();
      await flushWrites();

      expect(vendor.writes).toEqual([
        { kind: 'text', hex: '2801', mode: 'TextMode' },
        { kind: 'graphic', hex: 'ff', mode: 'GraphicMode' },
      ]);
    });

    it('should swallow a failed write and still deliver the next one', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);
      vendor.hooks.onGraphic = (): void => {
        throw new Error('frame dropped');
      };

      expect(() => session.writeGraphic('ff')).not.toThrow();
      await flushWrites();
      vendor.hooks.onGraphic = (): void => {};
      session.writeGraphic('00');
      await flushWrites();

      expect(vendor.writes).toEqual([{ kind: 'graphic', hex: '00', mode: 'GraphicMode' }]);
      expect(consoleError).toHaveBeenCalled();
    });
  });

  describe('vendor callbacks', () => {
    it('should return to disconnected and drop the geometry when the device drops', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);
      const seen: DotPadState[] = [];
      session.onStateChange(state => seen.push(state));

      vendor.fireMessage('Disconnected');

      expect(session.current.status).toBe('disconnected');
      expect(session.current.deviceName).toBeNull();
      expect(session.geometry).toBeNull();
      expect(session.isConnected).toBe(false);
      expect(seen).toHaveLength(1);
    });

    it('should ignore a disconnect reported for some other device', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);

      vendor.fireMessage('Disconnected', { ...DEVICE, cellType: 'someone else' });

      expect(session.current.status).toBe('connected');
      expect(session.isConnected).toBe(true);
    });

    it('should map the vendor panning keys onto MAIDR keys', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);
      const keys: string[] = [];
      session.onKey(key => keys.push(key));

      vendor.fireKeyDown('PanningLeft');
      vendor.fireKeyDown('PanningRight');

      expect(keys).toEqual(['panLeft', 'panRight']);
    });

    it('should map the vendor function keys onto MAIDR keys', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);
      const keys: string[] = [];
      session.onKey(key => keys.push(key));

      vendor.fireKeyDown('KeyFunction1');
      vendor.fireKeyDown('KeyFunction4');

      expect(keys).toEqual(['function1', 'function4']);
    });

    it('should fire nothing for a key it does not recognise', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);
      const keys: string[] = [];
      session.onKey(key => keys.push(key));

      vendor.fireKeyDown('KeyFunction9');
      vendor.fireKeyDown('PanningUp');

      expect(keys).toEqual([]);
    });

    // The key table is a plain object literal, so a naive `VENDOR_KEYS[key]`
    // lookup walks `Object.prototype`: a vendor key called `constructor` — or
    // `toString`, or `valueOf` — resolves to a function, passes an
    // `!== undefined` guard, and is fired as though it were a `DotPadKey`,
    // handing every listener a value outside the union it is typed against.
    // The own-property check is what stops that, and this pins it.
    it('should fire nothing for a key named after an inherited property', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);
      const keys: string[] = [];
      session.onKey(key => keys.push(key));

      vendor.fireKeyDown('constructor');
      vendor.fireKeyDown('toString');

      expect(keys).toEqual([]);
    });
  });

  describe('disconnect', () => {
    it('should close the vendor connection and clear the state', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);

      session.disconnect();

      expect(vendor.disconnected).toEqual([DEVICE]);
      expect(session.current.status).toBe('disconnected');
      expect(session.current.deviceName).toBeNull();
      expect(session.geometry).toBeNull();
      expect(session.isConnected).toBe(false);
    });

    it('should stop writes from reaching the device once disconnected', async () => {
      const vendor = createVendor();
      const { session } = await connectSession(vendor);

      session.disconnect();
      session.writeGraphic('ff');
      session.writeGraphicRow(0, 'ff');
      session.writeText('2801');
      await flushWrites();

      expect(vendor.writes).toEqual([]);
    });
  });
});
