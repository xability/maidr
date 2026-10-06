import type { DotPadKey, DotPadState } from '@type/dotPad';
import type {
  Hid,
  HidCollectionInfo,
  HidConnectionEvent,
  HidDevice,
  HidDeviceFilter,
  HidInputReportEvent,
  HidReportItem,
} from '@type/hid';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BrailleUsage } from '@util/tactile/hidBraille';
import { DotPack } from '@util/tactile/pack';
import { DotRaster } from '@util/tactile/raster';

/**
 * Tests for `src/service/monarchSession.ts`, the connection to a Monarch in
 * Braille Terminal over WebHID.
 *
 * Nothing here can run against the device: jest has no WebHID and no Monarch.
 * The session reaches both through `navigator.hid`, so a fake stands in for
 * it, holding fake devices whose collections are shaped the way Chromium hands
 * a HID braille display's descriptor over. The regressions pinned are the
 * quiet ones:
 *
 * - The geometry. The Monarch's pins are 96 by 40, but Braille Terminal only
 *   reports cells, so the session takes the pins from the hardware and checks
 *   the cells against them. A display that does not fit -- an ordinary
 *   single-line braille display picked by mistake -- is refused rather than
 *   drawn on as though it were a Monarch.
 * - Where a pin lands. A pin drawn at (x, y) has to come out in the cell and
 *   the dot that sit under it, including the pins between cells that Braille
 *   Terminal never raises.
 * - Gathering a frame. The tactile service sends a frame as several writes,
 *   and a Monarch takes seconds to raise a whole display, so they go out as
 *   one report rather than one each.
 * - Drawing through the pin array where the Monarch has one: every pin of the
 *   picture where it was drawn, and the text line spaced as Braille Terminal
 *   spaces it.
 * - The keys, which fire once per press however long the key is held: the
 *   left D-pad pans the picture, the right one and Space chords scroll the
 *   text line, and a lone D-pad pans whichever side it is on.
 * - Passing the Monarch between charts, as the DotPad's session does: two
 *   frames writing to one display would overwrite each other's pictures.
 *
 * `monarchSession` is a module-level singleton, so every case loads a fresh
 * copy with `jest.resetModules()`, and two copies stand for two frames.
 */

type Session = typeof import('@service/monarchSession')['monarchSession'];

const BRAILLE_DISPLAY = { usagePage: 0x41, usage: 0x01 } as const;
const BRAILLE_ROW = { usagePage: 0x41, usage: 0x02 } as const;

const LEFT_CONTROLS = { usagePage: 0x41, usage: 0x20D } as const;
const RIGHT_CONTROLS = { usagePage: 0x41, usage: 0x20E } as const;

/**
 * The Monarch's zoom keys, usages of its own past the end of the braille page.
 */
const ZOOM_IN = 0x41_0220;
const ZOOM_OUT = 0x41_0221;

/**
 * The usage the Monarch declares its pin array under.
 */
const PIN_ARRAY = 0x41_0301;

const D_PAD: readonly number[] = [BrailleUsage.dPadUp, BrailleUsage.dPadDown, BrailleUsage.dPadLeft, BrailleUsage.dPadRight];

/**
 * The keys the fake Monarch reports, one bit each, in this order.
 */
const KEY_BITS = [
  ...D_PAD,
  BrailleUsage.panLeft,
  BrailleUsage.panRight,
  BrailleUsage.keyboardDot1,
  BrailleUsage.keyboardSpace,
  BrailleUsage.keyboardDot4,
  ZOOM_IN,
  ZOOM_OUT,
];

/**
 * What a fake display has beside its cells and keys.
 */
interface Extras {
  /**
   * The Monarch's pin array, in output report 0x21, with this many pins.
   */
  pins?: number;

  /**
   * A D-pad under right controls and another under left controls, ahead of
   * the other keys, as a Monarch reports them; or only the one side named.
   */
  pads?: 'both' | 'right';
}

/**
 * A HID braille display as Chromium presents it: rows of cells in output
 * report 2, each in a Braille Row collection, and keys in input report 1.
 * @param lines - Rows of cells
 * @param cells - Cells in each row
 * @param dots - Dots in each cell
 * @param extras - What it has beside
 */
function brailleDisplay(lines: number, cells: number = 32, dots: 6 | 8 = 8, extras: Extras = {}): HidCollectionInfo[] {
  const row: HidReportItem = {
    usages: [dots === 8 ? BrailleUsage.eightDotCell : BrailleUsage.sixDotCell],
    reportSize: 8,
    reportCount: cells,
  };
  const rows = Array.from({ length: lines }, () => row);
  // A display with pads of its own reports the D-pad usages there alone.
  const others = extras.pads === undefined ? KEY_BITS : KEY_BITS.filter(usage => !D_PAD.includes(usage));
  const keyItem: HidReportItem = { usages: others, reportSize: 1, reportCount: others.length };
  const padItem = (): HidReportItem => ({ usages: D_PAD, reportSize: 1, reportCount: D_PAD.length });
  const pads = extras.pads === 'both'
    ? [{ ...RIGHT_CONTROLS, item: padItem() }, { ...LEFT_CONTROLS, item: padItem() }]
    : extras.pads === 'right' ? [{ ...RIGHT_CONTROLS, item: padItem() }] : [];
  const pinReports = extras.pins === undefined
    ? []
    : [{ reportId: 0x21, items: [{ usages: [PIN_ARRAY], reportSize: 1, reportCount: extras.pins }] }];
  return [{
    ...BRAILLE_DISPLAY,
    outputReports: [{ reportId: 2, items: rows }, ...pinReports],
    inputReports: [{ reportId: 1, items: [...pads.map(pad => pad.item), keyItem] }],
    children: [
      ...rows.map(item => ({ ...BRAILLE_ROW, outputReports: [{ reportId: 2, items: [item] }] })),
      ...pads.map(({ item, ...collection }) => ({ ...collection, inputReports: [{ reportId: 1, items: [item] }] })),
    ],
  }];
}

/**
 * A device the fake browser hands the page.
 */
class FakeDevice implements HidDevice {
  public opened = false;
  public opens = 0;
  public closes = 0;
  public readonly sent: { reportId: number; data: number[] }[] = [];

  /**
   * What `open` and `sendReport` wait on, so a case can make either fail or
   * hang.
   */
  public openHook: () => Promise<void> = async () => {};
  public sendHook: () => Promise<void> = async () => {};

  /**
   * Every call, in order, so a case can check a close came after a send.
   */
  public readonly calls: string[] = [];

  private readonly listeners = new Set<(event: HidInputReportEvent) => void>();

  public constructor(
    public readonly collections: readonly HidCollectionInfo[],
    public readonly productName: string = 'Monarch',
  ) {}

  public async open(): Promise<void> {
    this.opens += 1;
    await this.openHook();
    this.opened = true;
    this.calls.push('open');
  }

  public async close(): Promise<void> {
    this.closes += 1;
    this.opened = false;
    this.calls.push('close');
  }

  public async sendReport(reportId: number, data: Uint8Array): Promise<void> {
    await this.sendHook();
    this.sent.push({ reportId, data: Array.from(data) });
    this.calls.push('send');
  }

  public addEventListener(_type: 'inputreport', listener: (event: HidInputReportEvent) => void): void {
    this.listeners.add(listener);
  }

  public removeEventListener(_type: 'inputreport', listener: (event: HidInputReportEvent) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Sends the page an input report.
   * @param bytes - The report's data
   */
  public input(bytes: number[]): void {
    for (const listener of Array.from(this.listeners)) {
      listener({ device: this, reportId: 1, data: new DataView(Uint8Array.from(bytes).buffer) });
    }
  }

  /**
   * The last report sent, or an empty array.
   */
  public get last(): number[] {
    return this.sent.at(-1)?.data ?? [];
  }
}

/**
 * The browser's `navigator.hid`.
 */
class FakeHid implements Hid {
  public picked: HidDevice[] = [];
  public granted: HidDevice[] = [];
  public filters: readonly HidDeviceFilter[] | null = null;
  public requests = 0;
  public requestHook: (() => Promise<HidDevice[]>) | null = null;
  private readonly disconnectListeners = new Set<(event: HidConnectionEvent) => void>();

  public async requestDevice(options: { filters: readonly HidDeviceFilter[] }): Promise<HidDevice[]> {
    this.requests += 1;
    this.filters = options.filters;
    return this.requestHook === null ? this.picked : this.requestHook();
  }

  public async getDevices(): Promise<HidDevice[]> {
    return this.granted;
  }

  public addEventListener(_type: 'disconnect', listener: (event: HidConnectionEvent) => void): void {
    this.disconnectListeners.add(listener);
  }

  /**
   * Takes a device away, as unplugging it or closing Braille Terminal does.
   * @param device - The device
   */
  public unplug(device: HidDevice): void {
    for (const listener of Array.from(this.disconnectListeners)) {
      listener({ device });
    }
  }
}

/**
 * Stand-in for the page's `BroadcastChannel`, one hub per case, so only the
 * copies of the session a case loaded talk to each other.
 */
class FakeChannel {
  public static hub = new Set<FakeChannel>();

  private readonly listeners = new Set<(event: { data: unknown }) => void>();

  public constructor(private readonly name: string) {
    FakeChannel.hub.add(this);
  }

  public postMessage(data: unknown): void {
    for (const channel of FakeChannel.hub) {
      if (channel !== this && channel.name === this.name) {
        setTimeout(() => channel.listeners.forEach(listener => listener({ data })), 0);
      }
    }
  }

  public addEventListener(
    _type: string,
    listener: (event: { data: unknown }) => void,
    options?: { signal?: AbortSignal },
  ): void {
    this.listeners.add(listener);
    options?.signal?.addEventListener('abort', () => this.listeners.delete(listener));
  }
}

/**
 * The page's globals, as the session reads them.
 */
function pageScope(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

/**
 * Replaces `navigator` for one test.
 * @param value - The stand-in navigator
 */
function setNavigator(value: object): void {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

/**
 * Loads a fresh copy of the singleton, standing for a frame of its own.
 */
async function loadSession(): Promise<Session> {
  jest.resetModules();
  const module = await import('@service/monarchSession');
  return module.monarchSession;
}

/**
 * Lets every send and handoff already started run to its end.
 */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 5; tick++) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

/**
 * A graphic frame for the Monarch's geometry with the given pins raised,
 * packed as the tactile service packs it.
 * @param session - The connected session, for its geometry
 * @param pins - The pins, as [x, y]
 */
function frame(session: Session, pins: [number, number][]): string {
  const geometry = session.geometry;
  if (geometry === null) {
    throw new Error('not connected');
  }
  const raster = new DotRaster(geometry.dotWidth, geometry.dotHeight);
  for (const [x, y] of pins) {
    raster.set(x, y);
  }
  return DotPack.graphic(raster, geometry.cellColumns, geometry.cellRows);
}

/**
 * The bytes of a key report with the given bits set.
 * @param bits - The bits, from the start of the report
 * @param total - Bits in the report
 */
function report(bits: number[], total: number): number[] {
  const bytes = Array.from({ length: Math.ceil(total / 8) }, () => 0);
  for (const bit of bits) {
    bytes[bit >> 3] |= 1 << (bit & 7);
  }
  return bytes;
}

/**
 * The fake Monarch's key report with the given keys down.
 * @param usages - The keys
 */
function keys(...usages: number[]): number[] {
  return report(usages.map(usage => KEY_BITS.indexOf(usage)), KEY_BITS.length);
}

/**
 * The key report of a fake Monarch with a D-pad on each side, with keys on
 * the pads down.
 * @param pressed - Each key as its pad and its direction
 */
function padKeys(...pressed: ['left' | 'right', number][]): number[] {
  // The right pad's four bits come first, then the left pad's.
  const bits = pressed.map(([side, usage]) => (side === 'right' ? 0 : D_PAD.length) + D_PAD.indexOf(usage));
  return report(bits, D_PAD.length + KEY_BITS.length);
}

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const channelDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel');

// The failure paths log on purpose.
const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('monarchSession', () => {
  let hid: FakeHid;
  let monarch: FakeDevice;

  beforeEach(() => {
    FakeChannel.hub = new Set();
    pageScope().BroadcastChannel = FakeChannel;
    hid = new FakeHid();
    monarch = new FakeDevice(brailleDisplay(8));
    hid.picked = [monarch];
    hid.granted = [monarch];
    setNavigator({ hid });
    consoleError.mockClear();
    consoleWarn.mockClear();
  });

  afterEach(() => {
    delete pageScope().document;
    if (navigatorDescriptor === undefined) {
      delete pageScope().navigator;
    } else {
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    }
  });

  afterAll(() => {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
    if (channelDescriptor === undefined) {
      delete pageScope().BroadcastChannel;
    } else {
      Object.defineProperty(globalThis, 'BroadcastChannel', channelDescriptor);
    }
  });

  describe('support detection', () => {
    it('should report support where the browser has WebHID', async () => {
      const session = await loadSession();

      expect(session.isSupported).toBe(true);
      expect(session.supports('hid')).toBe(true);
    });

    it('should report no support where the browser has no WebHID', async () => {
      setNavigator({ userAgent: 'test' });

      const session = await loadSession();

      expect(session.isSupported).toBe(false);
    });

    it('should report no support where the page is not allowed WebHID', async () => {
      // A frame without `allow="hid"` can still expose the API, so the policy
      // is what has to be asked.
      Object.defineProperty(globalThis, 'document', {
        value: { featurePolicy: { allowsFeature: (name: string) => name !== 'hid' } },
        configurable: true,
        writable: true,
      });

      const session = await loadSession();

      expect(session.supports('hid')).toBe(false);
    });

    it('should connect over WebHID and nothing else', async () => {
      const session = await loadSession();

      expect(session.transports).toEqual(['hid']);
      expect(session.supports('bluetooth')).toBe(false);
      expect(session.supports('serial')).toBe(false);
    });
  });

  describe('connect', () => {
    it('should say why where the browser has no WebHID', async () => {
      setNavigator({ userAgent: 'test' });
      const session = await loadSession();

      const state = await session.connect('hid');

      expect(state.status).toBe('unavailable');
      expect(state.message).toContain('WebHID');
    });

    it('should list braille displays only in the picker', async () => {
      const session = await loadSession();

      await session.connect('hid');

      expect(hid.filters).toEqual([{ usagePage: 0x41 }]);
    });

    it('should report a dismissed picker as no selection rather than a failure', async () => {
      hid.picked = [];
      const session = await loadSession();

      const state = await session.connect('hid');

      expect(state.status).toBe('disconnected');
      expect(state.message).toBe('No Monarch was selected.');
    });

    it('should refuse a braille display that is not laid out like a Monarch', async () => {
      // An ordinary forty-cell display, picked by mistake. Drawn on as though
      // it were a Monarch, it would show a torn strip of the chart; refused,
      // the reader is told what to pick instead.
      const single = new FakeDevice(brailleDisplay(1, 40), 'Brailliant BI 40X');
      hid.picked = [single];
      const session = await loadSession();

      const state = await session.connect('hid');

      expect(state.status).toBe('failed');
      expect(state.message).toContain('not laid out like a Monarch');
      expect(single.opens).toBe(0);
    });

    it('should draw on the Monarch\'s own pins, less the line kept for text', async () => {
      // Eight lines of eight-dot cells sit five pins apart, so seven lines of
      // picture are 35 pins down -- a cell row and a bit, as a DotPad counts.
      const session = await loadSession();

      const state = await session.connect('hid');

      expect(state).toEqual({
        status: 'connected',
        deviceName: 'Monarch',
        transport: 'hid',
        geometry: { cellColumns: 48, cellRows: 9, textCells: 32, dotWidth: 96, dotHeight: 35 },
        message: '',
      });
      expect(session.isConnected).toBe(true);
    });

    it('should draw on ten lines four pins apart', async () => {
      hid.picked = [new FakeDevice(brailleDisplay(10))];
      const session = await loadSession();

      const state = await session.connect('hid');

      expect(state.geometry).toEqual({ cellColumns: 48, cellRows: 9, textCells: 32, dotWidth: 96, dotHeight: 36 });
    });

    it('should take a Monarch that reports its lines as one long row', async () => {
      hid.picked = [new FakeDevice(brailleDisplay(1, 256))];
      const session = await loadSession();

      const state = await session.connect('hid');

      expect(state.geometry?.dotHeight).toBe(35);
    });

    it('should say what to check when the Monarch will not open', async () => {
      // A screen reader using the Monarch as its braille display holds it, and
      // that is the one cause the reader can do something about.
      monarch.openHook = () => Promise.reject(Object.assign(new Error('Failed to open the device.'), { name: 'NotAllowedError' }));
      const session = await loadSession();

      const state = await session.connect('hid');

      expect(state.status).toBe('failed');
      expect(state.message).toContain('screen reader');
      expect(session.isConnected).toBe(false);
    });

    it('should report a page refused WebHID as not permitted', async () => {
      hid.requestHook = () => Promise.reject(Object.assign(new Error('denied'), { name: 'SecurityError' }));
      const session = await loadSession();

      const state = await session.connect('hid');

      expect(state.status).toBe('unavailable');
      expect(state.message).toContain('not permitted');
    });

    it('should not open a second picker while one is open', async () => {
      let pick: (devices: HidDevice[]) => void = () => {};
      hid.requestHook = () => new Promise(resolve => (pick = resolve));
      const session = await loadSession();

      const first = session.connect('hid');
      const second = await session.connect('hid');
      pick([monarch]);
      await first;

      expect(second.status).toBe('connecting');
      expect(hid.requests).toBe(1);
    });
  });

  describe('writing', () => {
    let session: Session;

    beforeEach(async () => {
      session = await loadSession();
      await session.connect('hid');
    });

    it('should put a pin in the cell and dot that sit under it', async () => {
      // x 4 is the right-hand column of the second cell; y 2 its third row.
      session.writeGraphic(frame(session, [[4, 2]]));
      await settle();

      expect(monarch.sent).toHaveLength(1);
      expect(monarch.sent[0].reportId).toBe(2);
      expect(monarch.last[1]).toBe(0x20);
      expect(monarch.last.filter(cell => cell !== 0)).toHaveLength(1);
    });

    it('should feel a pin between cells beside it rather than lose it', async () => {
      session.writeGraphic(frame(session, [[5, 0]]));
      await settle();

      expect(monarch.last[1]).toBe(0x08);
    });

    it('should put the picture\'s lower lines on the lines below', async () => {
      // y 33 is in the seventh line, the last of the picture.
      session.writeGraphic(frame(session, [[0, 33]]));
      await settle();

      expect(monarch.last[6 * 32]).toBe(0x40);
    });

    it('should put the text line on the bottom line', async () => {
      session.writeText(DotPack.brailleCells([0x1E, 0x15, 0xFF], 32));
      await settle();

      expect(monarch.last.slice(7 * 32, 7 * 32 + 4)).toEqual([0x1E, 0x15, 0xFF, 0]);
    });

    it('should send a frame drawn as several writes once', async () => {
      // A Monarch takes seconds to raise a whole display; sending each row as
      // it arrives would send the same lines several times over.
      const rows = frame(session, [[0, 0], [10, 10]]);
      session.writeGraphicRow(0, rows.slice(0, 96));
      session.writeGraphicRow(2, rows.slice(2 * 96, 3 * 96));
      session.writeText(DotPack.brailleCells([0x01], 32));
      await settle();

      expect(monarch.sent).toHaveLength(1);
      expect(monarch.last[0]).toBe(0x01);
      // x 10, y 10: the right-hand column of the fourth cell, top of line 3.
      expect(monarch.last[2 * 32 + 3]).toBe(0x08);
      expect(monarch.last[7 * 32]).toBe(0x01);
    });

    it('should not send a picture that has not changed', async () => {
      session.writeGraphic(frame(session, [[4, 2]]));
      await settle();
      session.writeGraphic(frame(session, [[4, 2]]));
      await settle();

      expect(monarch.sent).toHaveLength(1);
    });

    it('should keep sending what is drawn while a send is under way', async () => {
      let release: () => void = () => {};
      monarch.sendHook = () => new Promise(resolve => (release = resolve));
      session.writeGraphic(frame(session, [[0, 0]]));
      await settle();

      session.writeGraphic(frame(session, [[3, 0]]));
      monarch.sendHook = async () => {};
      release();
      await settle();

      expect(monarch.sent).toHaveLength(2);
      expect(monarch.last[1]).toBe(0x01);
    });

    it('should say when a report is refused, and send it whole again after', async () => {
      const failures = jest.fn();
      session.onWriteFailure(failures);
      monarch.sendHook = () => Promise.reject(new Error('device busy'));

      session.writeGraphic(frame(session, [[4, 2]]));
      await settle();
      monarch.sendHook = async () => {};
      session.writeGraphic(frame(session, [[4, 2]]));
      await settle();

      expect(failures).toHaveBeenCalledTimes(1);
      expect(monarch.sent).toHaveLength(1);
      expect(monarch.last[1]).toBe(0x20);
    });

    it('should accept no writes once disconnected', async () => {
      const hex = frame(session, [[4, 2]]);
      session.disconnect();

      session.writeGraphic(hex);
      session.writeText(DotPack.brailleCells([0x01], 32));
      await settle();

      expect(monarch.sent).toHaveLength(0);
    });

    it('should send the last frame before it closes the device', async () => {
      // Lowering every pin is the last thing a chart does before it lets the
      // display go; closing first would leave the reader feeling a chart they
      // have left.
      let release: () => void = () => {};
      monarch.sendHook = () => new Promise(resolve => (release = resolve));
      session.writeGraphic(frame(session, [[4, 2]]));
      await settle();

      session.disconnect();
      release();
      await settle();

      expect(session.isConnected).toBe(false);
      expect(monarch.calls).toEqual(['open', 'send', 'close']);
    });

    it('should never contract the text line or buzz', async () => {
      expect(session.canTranslate).toBe(false);
      await expect(session.translate('12')).resolves.toBeNull();
      expect(session.vibrate()).toBe(false);
    });
  });

  describe('keys', () => {
    let session: Session;
    let pressed: DotPadKey[];

    beforeEach(async () => {
      session = await loadSession();
      await session.connect('hid');
      pressed = [];
      session.onKey(key => pressed.push(key));
    });

    it('should pan the picture with the D-pads', () => {
      monarch.input(keys(BrailleUsage.dPadLeft));
      monarch.input(keys());
      monarch.input(keys(BrailleUsage.dPadUp));

      expect(pressed).toEqual(['panLeft', 'function2']);
    });

    it('should move along the text line with the panning keys', () => {
      monarch.input(keys(BrailleUsage.panRight));
      monarch.input(keys());
      monarch.input(keys(BrailleUsage.panLeft));

      expect(pressed).toEqual(['function4', 'function1']);
    });

    it('should fire once for a key held down', () => {
      monarch.input(keys(BrailleUsage.dPadRight));
      monarch.input(keys(BrailleUsage.dPadRight));
      monarch.input(keys(BrailleUsage.dPadRight, BrailleUsage.dPadDown));

      expect(pressed).toEqual(['panRight', 'function3']);
    });

    it('should move along the text line with Space and dot 1 or dot 4, once they are let go', () => {
      monarch.input(keys(BrailleUsage.keyboardSpace));
      monarch.input(keys(BrailleUsage.keyboardSpace, BrailleUsage.keyboardDot4));
      const whileHeld = [...pressed];
      monarch.input(keys(BrailleUsage.keyboardDot4));
      monarch.input(keys());
      monarch.input(keys(BrailleUsage.keyboardDot1, BrailleUsage.keyboardSpace));
      monarch.input(keys());

      expect(whileHeld).toEqual([]);
      expect(pressed).toEqual(['function4', 'function1']);
    });

    it('should do nothing for any other chord', () => {
      monarch.input(keys(BrailleUsage.keyboardDot1));
      monarch.input(keys());
      monarch.input(keys(BrailleUsage.keyboardSpace));
      monarch.input(keys());
      monarch.input(keys(BrailleUsage.keyboardSpace, BrailleUsage.keyboardDot1, BrailleUsage.keyboardDot4));
      monarch.input(keys());

      expect(pressed).toEqual([]);
    });

    it('should zoom with the zoom keys', () => {
      monarch.input(keys(ZOOM_IN));
      monarch.input(keys());
      monarch.input(keys(ZOOM_OUT));

      expect(pressed).toEqual(['zoomIn', 'zoomOut']);
    });

    it('should hear no keys once disconnected', () => {
      session.disconnect();

      monarch.input(keys(BrailleUsage.dPadLeft));

      expect(pressed).toEqual([]);
    });
  });

  describe('a Monarch\'s two D-pads', () => {
    let session: Session;
    let device: FakeDevice;
    let pressed: DotPadKey[];

    beforeEach(async () => {
      device = new FakeDevice(brailleDisplay(8, 32, 8, { pads: 'both' }));
      hid.picked = [device];
      session = await loadSession();
      await session.connect('hid');
      pressed = [];
      session.onKey(key => pressed.push(key));
    });

    it('should pan the picture with the left D-pad', () => {
      device.input(padKeys(['left', BrailleUsage.dPadLeft]));
      device.input(padKeys(['left', BrailleUsage.dPadUp]));
      device.input(padKeys(['left', BrailleUsage.dPadRight]));
      device.input(padKeys(['left', BrailleUsage.dPadDown]));

      expect(pressed).toEqual(['panLeft', 'function2', 'panRight', 'function3']);
    });

    it('should move along the text line with the right D-pad, on with right or down and back with left or up', () => {
      device.input(padKeys(['right', BrailleUsage.dPadRight]));
      device.input(padKeys(['right', BrailleUsage.dPadDown]));
      device.input(padKeys(['right', BrailleUsage.dPadLeft]));
      device.input(padKeys(['right', BrailleUsage.dPadUp]));

      expect(pressed).toEqual(['function4', 'function4', 'function1', 'function1']);
    });

    it('should hear both pads at once as two keys', () => {
      device.input(padKeys(['left', BrailleUsage.dPadUp], ['right', BrailleUsage.dPadUp]));

      expect(pressed).toEqual(['function1', 'function2']);
    });
  });

  it('should pan the picture with a D-pad that has no twin, whichever side it is on', async () => {
    // Only a pair is split between picture and text: a display whose one
    // D-pad sits on the right would otherwise have nothing to pan with.
    const device = new FakeDevice(brailleDisplay(8, 32, 8, { pads: 'right' }));
    hid.picked = [device];
    const session = await loadSession();
    await session.connect('hid');
    const pressed: DotPadKey[] = [];
    session.onKey(key => pressed.push(key));

    device.input(padKeys(['right', BrailleUsage.dPadLeft]));

    expect(pressed).toEqual(['panLeft']);
  });

  describe('writing every pin', () => {
    let session: Session;
    let device: FakeDevice;

    beforeEach(async () => {
      device = new FakeDevice(brailleDisplay(8, 32, 8, { pins: 96 * 40 }));
      hid.picked = [device];
      session = await loadSession();
      await session.connect('hid');
    });

    it('should keep the picture above a blank row and the text line', () => {
      expect(session.geometry).toEqual({ cellColumns: 48, cellRows: 9, textCells: 32, dotWidth: 96, dotHeight: 35 });
    });

    it('should raise the very pin drawn, through the pin array alone', async () => {
      // x 4 is the left column of the third block of 2 by 4; y 2 its third
      // row, which is dot 3.
      session.writeGraphic(frame(session, [[4, 2]]));
      await settle();

      expect(device.sent).toHaveLength(1);
      expect(device.sent[0].reportId).toBe(0x21);
      expect(device.last).toHaveLength(480);
      expect(device.last[2]).toBe(0x04);
      expect(device.last.filter(byte => byte !== 0)).toHaveLength(1);
    });

    it('should raise a pin that falls between Braille Terminal\'s cells where it was drawn', async () => {
      // x 5 is the space between the second and third cells, which the cells
      // can only fold into a dot beside it. On the pin array it is dot 4 of
      // the third block, like any other pin.
      session.writeGraphic(frame(session, [[5, 0]]));
      await settle();

      expect(device.last[2]).toBe(0x08);
      expect(device.last.filter(byte => byte !== 0)).toHaveLength(1);
    });

    it('should reach the picture\'s last row and leave the row under it down', async () => {
      // y 34 is the third row of the ninth row of blocks; y 35, its fourth,
      // is the blank row above the text line.
      session.writeGraphic(frame(session, [[0, 34]]));
      await settle();

      expect(device.last[8 * 48]).toBe(0x04);
    });

    it('should draw the text line on the bottom four rows, three pins to a cell', async () => {
      session.writeText(DotPack.brailleCells([0x1E, 0x15, 0xFF], 32));
      await settle();

      // Cell 0 fills the first block of the last row of blocks. Cell 1 starts
      // three pins on, in the right-hand column of the second block, and ends
      // in the left-hand column of the third; cell 2 is the fourth block.
      expect(device.last.slice(9 * 48, 9 * 48 + 5)).toEqual([0x1E, 0x28, 0x02, 0xFF, 0]);
    });
  });

  it('should write cells to a display whose pin array is not the Monarch\'s', async () => {
    const device = new FakeDevice(brailleDisplay(8, 32, 8, { pins: 64 }));
    hid.picked = [device];
    const session = await loadSession();
    await session.connect('hid');

    session.writeGraphic(frame(session, [[4, 2]]));
    await settle();

    expect(device.sent.map(sent => sent.reportId)).toEqual([2]);
  });

  describe('the device going away', () => {
    it('should tell the reader when the Monarch goes away', async () => {
      const session = await loadSession();
      await session.connect('hid');
      const states: DotPadState[] = [];
      session.onStateChange(state => states.push(state));

      hid.unplug(monarch);

      expect(session.isConnected).toBe(false);
      expect(states.at(-1)?.message).toBe('Monarch disconnected');
    });

    it('should ignore another device going away', async () => {
      const session = await loadSession();
      await session.connect('hid');

      hid.unplug(new FakeDevice(brailleDisplay(1, 40)));

      expect(session.isConnected).toBe(true);
    });
  });

  describe('adopt', () => {
    it('should take up a Monarch the page was granted, without a picker', async () => {
      const session = await loadSession();

      const adopted = await session.adopt();

      expect(adopted).toBe(true);
      expect(session.isConnected).toBe(true);
      expect(hid.requests).toBe(0);
    });

    it('should leave alone a granted display that is not a Monarch', async () => {
      const single = new FakeDevice(brailleDisplay(1, 40));
      hid.granted = [single];
      const session = await loadSession();

      const adopted = await session.adopt();

      expect(adopted).toBe(false);
      expect(single.opens).toBe(0);
    });

    it('should take up nothing where the browser has no WebHID', async () => {
      setNavigator({ userAgent: 'test' });
      const session = await loadSession();

      await expect(session.adopt()).resolves.toBe(false);
    });

    it('should stay quiet when a granted Monarch will not open', async () => {
      // This runs without the reader asking, so it must not put an error next
      // to a control they did not touch.
      monarch.openHook = () => Promise.reject(new Error('in use'));
      const session = await loadSession();

      const adopted = await session.adopt();

      expect(adopted).toBe(false);
      expect(session.current.status).toBe('disconnected');
      expect(session.current.message).toBe('');
    });

    it('should take the Monarch over from another chart', async () => {
      const first = await loadSession();
      await first.connect('hid');
      const second = await loadSession();

      const adopted = await second.adopt();

      expect(adopted).toBe(true);
      expect(second.isConnected).toBe(true);
      expect(first.isConnected).toBe(false);
      expect(monarch.calls).toEqual(['open', 'close', 'open']);
    });

    it('should give the Monarch back when taking it over fails', async () => {
      const first = await loadSession();
      await first.connect('hid');
      const second = await loadSession();
      let refusals = 1;
      monarch.openHook = async () => {
        if (refusals > 0) {
          refusals -= 1;
          throw new Error('link dropped');
        }
      };

      const adopted = await second.adopt();
      await new Promise<void>(resolve => setTimeout(resolve, 400));

      expect(adopted).toBe(false);
      expect(second.isConnected).toBe(false);
      expect(first.isConnected).toBe(true);
    });
  });
});
