import type { DotPadGeometry, DotPadKey, DotPadState, DotPadTransport } from '@type/dotPad';
import type { Event } from '@type/event';
import type { Hid, HidConnectionEvent, HidDevice, HidInputReportEvent } from '@type/hid';
import type { TactileDisplayDriver } from '@type/tactileDisplay';
import type { HidBitField, HidBrailleLayout, HidKey } from '@util/tactile/hidBraille';
import type { SpacedCellLayout } from '@util/tactile/spacedCells';
import { Emitter } from '@type/event';
import { allowsDeviceFeature } from '@util/deviceFeature';
import { t } from '@util/i18n';
import { BrailleUsage, HidBraille } from '@util/tactile/hidBraille';
import { DotPack } from '@util/tactile/pack';
import { DotRaster } from '@util/tactile/raster';
import { SpacedCells } from '@util/tactile/spacedCells';
import { DisplayHandoff } from './displayHandoff';

/**
 * The Monarch's pin array: 96 pins across and 40 down, evenly spaced 2.6 mm
 * apart -- 480 eight-pin cells, as APH and HumanWare specify it.
 *
 * These are the one thing about the device the page is not told. Braille
 * Terminal reports its braille cells, not the pins they sit on, so the pins are
 * taken from the hardware and the cells are checked against them: a display
 * whose cells do not fit is refused rather than drawn on as though it were a
 * Monarch.
 */
const PIN_COLUMNS = 96;
const PIN_ROWS = 40;

/**
 * Braille Terminal shows 32 cells to a line, three pins apart: two columns of
 * dots and a column of space.
 */
const CELLS_PER_LINE = 32;

/**
 * Lines of braille the Monarch shows: between six and ten, as the reader sets
 * the spacing between them.
 */
const MIN_LINES = 6;
const MAX_LINES = 10;

/**
 * The Monarch's array of pins, one bit each, which it offers beside its cells.
 *
 * Not part of the HID braille standard, whose usages stop at cells: the
 * Monarch declares it under a usage of its own on the braille page, in an
 * output report of its own (0x21). Each byte is a block of 2 by 4 pins, its
 * dots numbered as a braille cell's are, and the blocks run 48 across by 10
 * down in reading order. Found, and confirmed on a Monarch in Braille
 * Terminal, by the BrlMultiline add-on for NVDA, whose Monarch driver draws
 * through it.
 */
const PIN_ARRAY_USAGE = 0x41_0301;

/**
 * The pin array read as cells with no space between them, one 2 by 4 block to
 * a byte.
 */
const PIN_BLOCKS: SpacedCellLayout = {
  columns: PIN_COLUMNS / DotPack.PINS_PER_CELL_X,
  lines: PIN_ROWS / DotPack.PINS_PER_CELL_Y,
  dotRows: 4,
  pitchX: DotPack.PINS_PER_CELL_X,
  pitchY: DotPack.PINS_PER_CELL_Y,
};

/**
 * The text line when MAIDR draws every pin: Braille Terminal's own spacing,
 * 32 cells three pins apart, on the last of ten four-pin lines -- the bottom
 * four rows, with a blank row between it and the picture.
 */
const TEXT_LINE: SpacedCellLayout = {
  columns: CELLS_PER_LINE,
  lines: PIN_ROWS / DotPack.PINS_PER_CELL_Y,
  dotRows: 4,
  pitchX: PIN_COLUMNS / CELLS_PER_LINE,
  pitchY: DotPack.PINS_PER_CELL_Y,
};

/**
 * Pins down the picture when MAIDR draws every pin: all but the text line and
 * the blank row above it.
 */
const PIN_PICTURE_ROWS = PIN_ROWS - TEXT_LINE.dotRows - 1;

/**
 * The Monarch's zoom keys, the plus and minus beside its keyboard. Usages of
 * its own, just past the last one the braille page defines.
 */
const ZOOM_IN_USAGE = 0x41_0220;
const ZOOM_OUT_USAGE = 0x41_0221;

/**
 * The browser's device picker lists braille displays only: devices with a
 * collection on the HID Braille Display usage page.
 */
const BRAILLE_DISPLAY_FILTER = { usagePage: 0x41 } as const;

/**
 * The channel the frames of one page hand a Monarch between; see
 * {@link DisplayHandoff}.
 */
const HANDOFF_CHANNEL = 'maidr-tactile-display-monarch';

/**
 * How long closing waits for the reports already being sent. Long enough for
 * the frame a caller sends on its way out, short enough that a device that has
 * stopped answering cannot hold the display out of another chart's reach.
 */
const CLOSE_FLUSH_TIMEOUT_MS = 2000;

/**
 * HID braille keys, given the jobs a DotPad's keys do.
 *
 * A D-pad or a joystick pans the picture, which is what the Monarch's D-pads
 * do in its own Tactile Viewer. Panning keys and a rocker -- what most braille
 * displays move a reader on through text with -- move along the text line. The
 * Monarch has neither of those, so its right D-pad and its Space chords do
 * that instead (see {@link RIGHT_PAD_KEYS} and {@link CHORD_KEYS}). Its zoom
 * keys zoom.
 */
const KEYS: ReadonlyMap<number, DotPadKey> = new Map<number, DotPadKey>([
  [BrailleUsage.dPadLeft, 'panLeft'],
  [BrailleUsage.joystickLeft, 'panLeft'],
  [BrailleUsage.dPadRight, 'panRight'],
  [BrailleUsage.joystickRight, 'panRight'],
  [BrailleUsage.dPadUp, 'function2'],
  [BrailleUsage.joystickUp, 'function2'],
  [BrailleUsage.dPadDown, 'function3'],
  [BrailleUsage.joystickDown, 'function3'],
  [BrailleUsage.panLeft, 'function1'],
  [BrailleUsage.rockerUp, 'function1'],
  [BrailleUsage.panRight, 'function4'],
  [BrailleUsage.rockerDown, 'function4'],
  [ZOOM_IN_USAGE, 'zoomIn'],
  [ZOOM_OUT_USAGE, 'zoomOut'],
]);

/**
 * The right-hand D-pad's jobs on a display with a D-pad on each side, as the
 * Monarch has: it moves along the text line, back with left or up and on with
 * right or down, and leaves the left-hand one to pan the picture. Each hand
 * then has one of the two things a reader scrolls.
 */
const RIGHT_PAD_KEYS: ReadonlyMap<number, DotPadKey> = new Map<number, DotPadKey>([
  [BrailleUsage.dPadLeft, 'function1'],
  [BrailleUsage.dPadUp, 'function1'],
  [BrailleUsage.dPadRight, 'function4'],
  [BrailleUsage.dPadDown, 'function4'],
]);

/**
 * Chords of Space with one dot, by the dot: the two a Monarch reader moves
 * back and on through lines of text with, dot 1 back and dot 4 on.
 */
const CHORD_KEYS: ReadonlyMap<number, DotPadKey> = new Map<number, DotPadKey>([
  [BrailleUsage.keyboardDot1, 'function1'],
  [BrailleUsage.keyboardDot4, 'function4'],
]);

/**
 * The braille keyboard's spaces: one in the middle, or one under each thumb.
 */
const SPACES: ReadonlySet<number> = new Set([
  BrailleUsage.keyboardSpace,
  BrailleUsage.keyboardLeftSpace,
  BrailleUsage.keyboardRightSpace,
]);

/**
 * The D-pad's directions, by which a D-pad is told from other keys.
 */
const D_PAD: ReadonlySet<number> = new Set([
  BrailleUsage.dPadUp,
  BrailleUsage.dPadDown,
  BrailleUsage.dPadLeft,
  BrailleUsage.dPadRight,
]);

/**
 * Where a Monarch keeps its cells, and how they sit on its pins.
 */
interface MonarchShape {
  readonly layout: HidBrailleLayout;
  readonly cells: SpacedCellLayout;

  /**
   * Where the device takes its pins one by one, or null when it takes cells
   * only.
   */
  readonly pinArray: HidBitField | null;
}

/**
 * A device the page has open, and everything held for it.
 *
 * Kept together so a connection that has been let go can finish what it was
 * sending without a new one -- the same device taken up again a moment later,
 * say -- being written to by mistake.
 */
interface MonarchConnection {
  readonly device: HidDevice;
  readonly layout: HidBrailleLayout;
  readonly cells: SpacedCellLayout;
  readonly pinArray: HidBitField | null;

  /**
   * The picture, one entry per pin, as the tactile service last drew it.
   */
  readonly pins: DotRaster;

  /**
   * Pins down the picture; the rest of the display is the text line.
   */
  readonly pictureRows: number;

  /**
   * The text line, bit 0 being dot 1.
   */
  readonly text: Uint8Array;

  /**
   * The data of each report as it last went out, so an unchanged report is
   * not sent again.
   */
  readonly sent: Map<number, Uint8Array>;

  /**
   * The keys each input report last said were down, by `keyId`.
   */
  readonly pressed: Map<number, Map<string, HidKey>>;

  /**
   * True when the device has a D-pad on each side, so the right one can be
   * given the text line.
   */
  readonly padsOnBothSides: boolean;

  /**
   * The braille keyboard keys pressed since the keyboard was last let go of
   * entirely: the chord being typed.
   */
  readonly chord: Set<number>;

  readonly onInputReport: (event: HidInputReportEvent) => void;

  /**
   * True while something drawn has not been sent yet.
   */
  dirty: boolean;

  /**
   * The send in progress, or null.
   */
  flushing: Promise<void> | null;
}

/**
 * Owns the connection to a Monarch, for as long as the page lives.
 *
 * The Monarch has no SDK a page can load. What it offers a computer is Braille
 * Terminal, in which it acts as a braille display speaking the USB HID braille
 * standard -- over a cable or paired over Bluetooth -- and WebHID reaches that
 * in Chromium.
 *
 * Beside its cells, Braille Terminal takes the Monarch's 96 by 40 pins one by
 * one (see `PIN_ARRAY_USAGE`), and MAIDR draws through that: the picture
 * on every pin above, the description of the focused point on the bottom
 * line, as a DotPad's braille line carries it. A firmware without the pin
 * array is written cell by cell instead. Its cells are laid out for reading,
 * three pins apart with the third always down, so the picture is still drawn
 * on the 96 by 40 pins and then folded onto the cells (see
 * {@link SpacedCells}).
 *
 * A module-level singleton for the reason the DotPad's session is one: the
 * connection has to outlive every chart's controller, since opening a device
 * from the picker needs a click that cannot be asked for mid-navigation.
 */
class MonarchSession implements TactileDisplayDriver {
  /**
   * WebHID reaches the Monarch on a cable and over Bluetooth alike, and cannot
   * tell the page which, so there is one way to connect.
   */
  public readonly transports: readonly DotPadTransport[] = ['hid'];

  /**
   * The open device, or null.
   */
  private connection: MonarchConnection | null = null;

  /**
   * The adoption in flight, if any, so a second request joins it rather than
   * opening the device twice.
   */
  private adopting: Promise<boolean> | null = null;

  /**
   * Whether this frame is listening for devices being taken away.
   */
  private watchingDisconnects = false;

  private state: DotPadState = {
    status: 'disconnected',
    deviceName: null,
    transport: null,
    geometry: null,
    message: '',
  };

  private readonly onStateChangeEmitter = new Emitter<DotPadState>();

  /**
   * Fires whenever the connection state changes.
   */
  public readonly onStateChange: Event<DotPadState> = this.onStateChangeEmitter.event;

  private readonly onWriteFailureEmitter = new Emitter<void>();

  /**
   * Fires when the browser refused a report, so a caller that sends only what
   * changed can send the whole picture again.
   */
  public readonly onWriteFailure: Event<void> = this.onWriteFailureEmitter.event;

  private readonly onKeyEmitter = new Emitter<DotPadKey>();

  /**
   * Fires when a key MAIDR responds to goes down.
   */
  public readonly onKey: Event<DotPadKey> = this.onKeyEmitter.event;

  /**
   * Passes the Monarch between the frames of the page, as the DotPad's session
   * does: two frames writing to one display would overwrite each other's
   * pictures.
   */
  private readonly handoff = new DisplayHandoff(HANDOFF_CHANNEL, {
    release: () => {
      const connection = this.connection;
      if (connection === null) {
        return null;
      }
      this.connection = null;
      this.setDisconnected('');
      return this.closeWhenSent(connection);
    },
    retake: () => {
      void this.adopt();
    },
  }, CLOSE_FLUSH_TIMEOUT_MS);

  /**
   * Current connection state.
   */
  public get current(): DotPadState {
    return this.state;
  }

  /**
   * True when a Monarch is open and ready for output.
   */
  public get isConnected(): boolean {
    return this.state.status === 'connected' && this.connection !== null;
  }

  /**
   * Layout of the connected Monarch, or null.
   */
  public get geometry(): DotPadGeometry | null {
    return this.state.geometry;
  }

  /**
   * Always false: there is no braille engine to load for a Monarch, so the
   * text line is MAIDR's own uncontracted braille.
   */
  public get canTranslate(): boolean {
    return false;
  }

  /**
   * True: the text line breaks between words, so a number or a name is not
   * read in two halves, one either side of a scroll.
   */
  public get breaksTextAtWords(): boolean {
    return true;
  }

  /**
   * True when WebHID is there and the page may use it.
   */
  public get isSupported(): boolean {
    return this.supports('hid');
  }

  /**
   * Reports whether the browser can reach a Monarch over one transport.
   * @param transport - The connection to test
   */
  public supports(transport: DotPadTransport): boolean {
    return transport === 'hid' && allowsDeviceFeature('hid');
  }

  /**
   * Nothing to fetch: WebHID is the browser's own.
   */
  public async preload(): Promise<void> {}

  /**
   * Opens the browser's device picker and connects to the chosen Monarch.
   *
   * Must be called from a user gesture -- the browser will not show the picker
   * otherwise. Returns the resulting state rather than throwing, because every
   * failure here is something the reader needs told.
   *
   * @param transport - Must be `hid`
   */
  public async connect(transport: DotPadTransport = 'hid'): Promise<DotPadState> {
    if (this.isConnected || this.state.status === 'connecting') {
      return this.state;
    }
    const hid = MonarchSession.hid();
    if (transport !== 'hid' || !this.supports('hid') || hid === null) {
      this.setState({ status: 'unavailable', deviceName: null, transport: null, geometry: null, message: t('tactile.monarchNoHid') });
      return this.state;
    }

    this.setState({ status: 'connecting', message: '' });
    try {
      const devices = await hid.requestDevice({ filters: [BRAILLE_DISPLAY_FILTER] });
      const device = devices.find(candidate => HidBraille.isBrailleDisplay(candidate.collections));
      if (device === undefined) {
        this.setState({ status: 'disconnected', message: t('tactile.monarchNoneSelected') });
        return this.state;
      }
      // Checked before anything is opened or asked for: a display that is not
      // a Monarch must not make another chart let its Monarch go.
      const shape = MonarchSession.shapeOf(device);
      if (shape === null) {
        this.setState({ status: 'failed', transport: null, message: t('tactile.monarchUnrecognised') });
        return this.state;
      }
      await this.takeOver(device, shape);
    } catch (error) {
      this.connection = null;
      const denied = error instanceof Error && error.name === 'SecurityError';
      this.setState({
        status: denied ? 'unavailable' : 'failed',
        transport: null,
        // Opening fails when something else holds the device -- most often a
        // screen reader using the Monarch as its braille display -- and that
        // is the one thing the reader can do something about.
        message: denied ? t('tactile.monarchNotPermitted') : t('tactile.monarchConnectFailed'),
      });
    }
    return this.state;
  }

  /**
   * Connects to a Monarch this origin was already granted, without a picker.
   *
   * Every chart in a notebook is its own frame, and a device open in one frame
   * cannot be handed to another, but the permission belongs to the page: a
   * Monarch the reader picked in one chart is granted to every other. Quiet on
   * failure, since this runs without the reader asking.
   *
   * @returns True when a Monarch was taken up
   */
  public adopt(): Promise<boolean> {
    if (this.isConnected || this.state.status === 'connecting') {
      return Promise.resolve(false);
    }
    if (this.adopting === null) {
      this.adopting = this.adoptGranted().finally(() => {
        this.adopting = null;
      });
    }
    return this.adopting;
  }

  /**
   * The body of {@link adopt}, run at most once at a time.
   */
  private async adoptGranted(): Promise<boolean> {
    const hid = MonarchSession.hid();
    if (!this.supports('hid') || hid === null) {
      return false;
    }
    let granted: HidDevice[];
    try {
      granted = await hid.getDevices();
    } catch {
      // Refused, e.g. by Permissions Policy: nothing to adopt.
      return false;
    }
    for (const device of granted) {
      const shape = MonarchSession.shapeOf(device);
      if (shape === null) {
        continue;
      }
      try {
        await this.takeOver(device, shape);
        return true;
      } catch (error) {
        // An ordinary outcome here rather than a fault to report: a screen
        // reader may be holding the device, and this runs unprompted.
        console.warn('Monarch could not be reconnected:', error instanceof Error ? error.message : error);
        return false;
      }
    }
    return false;
  }

  /**
   * Asks any other chart holding the Monarch to let it go, and opens it here.
   *
   * Should opening fail, the Monarch is given back to the chart that let it
   * go, so a failure here does not leave the reader with no display anywhere.
   *
   * @param device - The device to open
   * @param shape - Where its cells are, already checked
   * @throws When the device will not open
   */
  private async takeOver(device: HidDevice, shape: MonarchShape): Promise<void> {
    const holder = await this.handoff.request();
    try {
      await this.attach(device, shape);
    } catch (error) {
      this.handoff.giveBack(holder);
      throw error;
    }
  }

  /**
   * Opens a device and records the connection.
   * @param device - The device to open
   * @param shape - Where its cells are
   * @throws When the device will not open
   */
  private async attach(device: HidDevice, shape: MonarchShape): Promise<void> {
    if (!device.opened) {
      await device.open();
    }

    const { layout, cells, pinArray } = shape;
    this.watchDisconnects();
    const height = MonarchSession.graphicHeight(shape);
    const geometry: DotPadGeometry = {
      cellColumns: Math.ceil(PIN_COLUMNS / DotPack.PINS_PER_CELL_X),
      cellRows: Math.ceil(height / DotPack.PINS_PER_CELL_Y),
      textCells: CELLS_PER_LINE,
      dotWidth: PIN_COLUMNS,
      dotHeight: height,
    };
    const connection: MonarchConnection = {
      device,
      layout,
      cells,
      pinArray,
      pins: new DotRaster(
        geometry.cellColumns * DotPack.PINS_PER_CELL_X,
        geometry.cellRows * DotPack.PINS_PER_CELL_Y,
      ),
      pictureRows: height,
      text: new Uint8Array(CELLS_PER_LINE),
      sent: new Map(),
      pressed: new Map(),
      padsOnBothSides: MonarchSession.hasPadsOnBothSides(layout),
      chord: new Set(),
      onInputReport: event => this.handleInputReport(connection, event),
      dirty: false,
      flushing: null,
    };
    device.addEventListener('inputreport', connection.onInputReport);
    this.connection = connection;
    this.setState({
      status: 'connected',
      deviceName: device.productName || 'Monarch',
      transport: 'hid',
      geometry,
      message: '',
    });
  }

  /**
   * Closes the connection.
   *
   * The state goes back to disconnected at once, so a caller asking straight
   * after is told the truth and no further write is accepted. The device is
   * closed behind whatever is already being sent to it.
   */
  public disconnect(): void {
    const connection = this.connection;
    this.connection = null;
    this.setDisconnected('');
    if (connection !== null) {
      void this.closeWhenSent(connection);
    }
  }

  /**
   * There is no braille engine for a Monarch; the caller uses MAIDR's own
   * table.
   */
  public async translate(_text: string): Promise<string | null> {
    return null;
  }

  /**
   * Takes a whole graphic frame.
   * @param hex - The frame, packed as `DotPack.graphic` packs it
   */
  public writeGraphic(hex: string): void {
    const connection = this.connection;
    const geometry = this.state.geometry;
    if (connection === null || geometry === null) {
      return;
    }
    connection.pins.clear();
    DotPack.readGraphic(connection.pins, hex, geometry.cellColumns);
    this.scheduleSend(connection);
  }

  /**
   * Takes one row of cells of the graphic area.
   * @param cellRow - Zero-based cell row
   * @param hex - The row, packed as `DotPack.graphicRow` packs it
   */
  public writeGraphicRow(cellRow: number, hex: string): void {
    const connection = this.connection;
    const geometry = this.state.geometry;
    if (connection === null || geometry === null) {
      return;
    }
    DotPack.readGraphic(connection.pins, hex, geometry.cellColumns, cellRow);
    this.scheduleSend(connection);
  }

  /**
   * Takes the text line.
   * @param hex - The line's cells, bit 0 being dot 1
   */
  public writeText(hex: string): void {
    const connection = this.connection;
    if (connection === null) {
      return;
    }
    for (let cell = 0; cell < connection.text.length; cell++) {
      const value = Number.parseInt(hex.slice(cell * 2, cell * 2 + 2), 16);
      connection.text[cell] = Number.isNaN(value) ? 0 : value;
    }
    this.scheduleSend(connection);
  }

  /**
   * The HID braille standard has no way to ask for a buzz.
   * @returns False, so the caller says it instead
   */
  public vibrate(_onFailure?: () => void): boolean {
    return false;
  }

  /**
   * Sends what has been drawn, once the writes of the frame being drawn are
   * all in.
   *
   * The tactile service hands a frame over as several row writes and a text
   * write in one go. Folding and sending after each would send the same line
   * several times over, and a Monarch takes seconds to raise a whole display,
   * so the writes are gathered and the lines that changed go out once.
   *
   * @param connection - The connection drawn on
   */
  private scheduleSend(connection: MonarchConnection): void {
    connection.dirty = true;
    if (connection.flushing === null) {
      connection.flushing = this.send(connection);
    }
  }

  /**
   * Sends every report whose pins changed, until nothing drawn is left
   * unsent.
   *
   * Clears `flushing` itself, synchronously as it finishes: a write made in
   * reaction to a failure here has to start a send of its own rather than be
   * left waiting on this one.
   *
   * @param connection - The connection to send on
   */
  private async send(connection: MonarchConnection): Promise<void> {
    try {
      await Promise.resolve();
      while (connection.dirty) {
        connection.dirty = false;
        const reports = MonarchSession.reportsOf(connection);
        for (const [reportId, data] of reports) {
          if (MonarchSession.same(connection.sent.get(reportId), data)) {
            continue;
          }
          try {
            await connection.device.sendReport(reportId, data);
            connection.sent.set(reportId, data);
          } catch (error) {
            console.error('Monarch write failed:', error instanceof Error ? error.message : error);
            // Nothing sent is known to be on the display any more.
            connection.sent.clear();
            if (this.connection === connection) {
              this.onWriteFailureEmitter.fire();
            }
            return;
          }
        }
      }
    } finally {
      connection.flushing = null;
    }
  }

  /**
   * Closes a device once what is being sent to it has gone out.
   *
   * The last thing a caller does before letting the display go -- lowering
   * every pin -- has not been sent yet when it asks, so closing at once would
   * leave the display holding a chart the reader has left. Bounded, so a
   * device that has stopped answering is closed regardless.
   *
   * @param connection - The connection to close
   */
  private async closeWhenSent(connection: MonarchConnection): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bound = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, CLOSE_FLUSH_TIMEOUT_MS);
    });
    await Promise.race([connection.flushing ?? Promise.resolve(), bound]);
    clearTimeout(timer);
    connection.device.removeEventListener('inputreport', connection.onInputReport);
    // Taken up again in the meantime: closing now would take down the
    // connection the reader has just made.
    if (this.connection?.device === connection.device) {
      return;
    }
    await MonarchSession.close(connection.device);
  }

  /**
   * Fires the keys an input report says have just gone down, and a chord once
   * the braille keyboard is let go of.
   *
   * A key fires as it goes down rather than up, so a pan answers as the key is
   * pressed. A chord cannot: it is only known once every key of it is down,
   * and only certain once they are all up again, which is when braille input
   * is read everywhere else too.
   *
   * @param connection - The connection the report came on
   * @param event - The report
   */
  private handleInputReport(connection: MonarchConnection, event: HidInputReportEvent): void {
    if (this.connection !== connection) {
      return;
    }
    const down = new Map<string, HidKey>();
    for (const key of HidBraille.pressed(connection.layout, event.reportId, event.data)) {
      down.set(MonarchSession.keyId(key), key);
    }
    const before = connection.pressed.get(event.reportId) ?? new Map<string, HidKey>();
    connection.pressed.set(event.reportId, down);
    for (const [id, key] of down) {
      if (before.has(id)) {
        continue;
      }
      if (MonarchSession.isKeyboardKey(key.usage)) {
        connection.chord.add(key.usage);
        continue;
      }
      const job = MonarchSession.jobOf(connection, key);
      if (job !== undefined) {
        this.onKeyEmitter.fire(job);
      }
    }

    const keyboardHeld = Array.from(connection.pressed.values())
      .some(keys => Array.from(keys.values()).some(key => MonarchSession.isKeyboardKey(key.usage)));
    if (connection.chord.size > 0 && !keyboardHeld) {
      const job = MonarchSession.chordJob(connection.chord);
      connection.chord.clear();
      if (job !== undefined) {
        this.onKeyEmitter.fire(job);
      }
    }
  }

  /**
   * Listens for the open device being taken away -- unplugged, switched off,
   * or Braille Terminal closed -- so the reader is told.
   */
  private watchDisconnects(): void {
    const hid = MonarchSession.hid();
    if (this.watchingDisconnects || hid === null) {
      return;
    }
    this.watchingDisconnects = true;
    hid.addEventListener('disconnect', (event: HidConnectionEvent) => {
      const connection = this.connection;
      if (connection === null || connection.device !== event.device) {
        return;
      }
      connection.device.removeEventListener('inputreport', connection.onInputReport);
      this.connection = null;
      this.setDisconnected(t('tactile.monarchDisconnected'));
    });
  }

  /**
   * Publishes a state change.
   * @param patch - Fields to change
   */
  private setState(patch: Partial<DotPadState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChangeEmitter.fire(this.state);
  }

  /**
   * Publishes that nothing is connected.
   * @param message - What to tell the reader, if anything
   */
  private setDisconnected(message: string): void {
    this.setState({ status: 'disconnected', deviceName: null, transport: null, geometry: null, message });
  }

  /**
   * How a device's cells sit on the Monarch's pins, or null when its cells do
   * not fit them -- some other braille display, or one this session does not
   * know how to read.
   *
   * Braille Terminal may report its lines as rows of 32 cells or as one long
   * row; either way the cells run 32 to a line, and the lines are spread down
   * the 40 pins.
   *
   * @param device - The device to measure
   */
  private static shapeOf(device: HidDevice): MonarchShape | null {
    const layout = HidBraille.layout(device.collections);
    if (layout === null || layout.rows.some(row => row.cells % CELLS_PER_LINE !== 0)) {
      return null;
    }
    const lines = layout.totalCells / CELLS_PER_LINE;
    const dotRows = layout.rows.every(row => row.dots === 8) ? 4 : 3;
    const pitchY = Math.floor(PIN_ROWS / lines);
    if (lines < MIN_LINES || lines > MAX_LINES || pitchY < dotRows) {
      return null;
    }
    // Taken only at the Monarch's own size: a run of single bits of another
    // size is some other device's, and not to be sent a picture of 96 by 40.
    const pinArray = HidBraille.outputBits(device.collections, PIN_ARRAY_USAGE);
    return {
      layout,
      cells: {
        columns: CELLS_PER_LINE,
        lines,
        dotRows,
        pitchX: PIN_COLUMNS / CELLS_PER_LINE,
        pitchY,
      },
      pinArray: pinArray?.count === PIN_COLUMNS * PIN_ROWS ? pinArray : null,
    };
  }

  /**
   * Pins down the picture: every pin above the text line and the blank row
   * over it or, written cell by cell, every line but the last.
   * @param shape - How the device is laid out
   */
  private static graphicHeight(shape: MonarchShape): number {
    return shape.pinArray === null
      ? (shape.cells.lines - 1) * shape.cells.pitchY
      : PIN_PICTURE_ROWS;
  }

  /**
   * The reports that put what has been drawn on the display: the pin array
   * where the device has one, its cells where it does not.
   * @param connection - The connection
   * @returns The data of each report, without its ID, by report ID
   */
  private static reportsOf(connection: MonarchConnection): Map<number, Uint8Array> {
    if (connection.pinArray === null) {
      return HidBraille.outputReports(connection.layout, MonarchSession.cellsOf(connection));
    }
    const pins = MonarchSession.pinsOf(connection);
    return new Map([[connection.pinArray.reportId, HidBraille.bitReport(connection.pinArray, pins)]]);
  }

  /**
   * Every pin on the display, packed as the pin array takes them: the picture
   * as it was drawn, and the text line below it.
   *
   * The pin array is a block of 2 by 4 pins to a byte, numbered as the dots of
   * a braille cell, so reading the display as cells with no space between
   * them packs it.
   *
   * @param connection - The connection
   */
  private static pinsOf(connection: MonarchConnection): Uint8Array {
    const surface = new DotRaster(PIN_COLUMNS, PIN_ROWS);
    for (let y = 0; y < connection.pictureRows; y++) {
      for (let x = 0; x < PIN_COLUMNS; x++) {
        if (connection.pins.get(x, y)) {
          surface.set(x, y);
        }
      }
    }
    SpacedCells.draw(surface, TEXT_LINE, connection.text, TEXT_LINE.lines - 1);
    return SpacedCells.fold(surface, PIN_BLOCKS, PIN_BLOCKS.lines);
  }

  /**
   * What a key does, if anything.
   * @param connection - The connection it was pressed on
   * @param key - The key
   */
  private static jobOf(connection: MonarchConnection, key: HidKey): DotPadKey | undefined {
    if (connection.padsOnBothSides && key.side === 'right') {
      const job = RIGHT_PAD_KEYS.get(key.usage);
      if (job !== undefined) {
        return job;
      }
    }
    return KEYS.get(key.usage);
  }

  /**
   * What a chord does: Space with one dot, if that dot does anything.
   * @param chord - The keyboard keys pressed together
   */
  private static chordJob(chord: ReadonlySet<number>): DotPadKey | undefined {
    const dots = Array.from(chord).filter(usage => !SPACES.has(usage));
    if (dots.length !== 1 || dots.length === chord.size) {
      return undefined;
    }
    return CHORD_KEYS.get(dots[0]);
  }

  /**
   * Whether a usage is a key of the braille keyboard: a dot or a space.
   * @param usage - The usage
   */
  private static isKeyboardKey(usage: number): boolean {
    return usage >= BrailleUsage.keyboardDot1 && usage <= BrailleUsage.keyboardRightSpace;
  }

  /**
   * Whether a device has a D-pad on its left and another on its right.
   *
   * Only then is either given anything but the picture: a display with one
   * D-pad, on whichever side, keeps it for panning.
   *
   * @param layout - Where the device keeps its keys
   */
  private static hasPadsOnBothSides(layout: HidBrailleLayout): boolean {
    const sides = new Set(layout.buttonBits.filter(bit => D_PAD.has(bit.usage)).map(bit => bit.side));
    return sides.has('left') && sides.has('right');
  }

  /**
   * A key's identity: its usage and its side, since two keys can share a
   * usage.
   * @param key - The key
   */
  private static keyId(key: HidKey): string {
    return `${key.side ?? ''}:${key.usage}`;
  }

  /**
   * Every cell on the display: the picture folded onto the lines above, and
   * the text line at the bottom.
   * @param connection - The connection
   */
  private static cellsOf(connection: MonarchConnection): Uint8Array {
    const { cells } = connection;
    const all = new Uint8Array(cells.lines * cells.columns);
    all.set(SpacedCells.fold(connection.pins, cells, cells.lines - 1));
    all.set(connection.text.subarray(0, cells.columns), (cells.lines - 1) * cells.columns);
    return all;
  }

  /**
   * Whether two reports' data are the same.
   * @param sent - What went out last, if anything
   * @param next - What would go out now
   */
  private static same(sent: Uint8Array | undefined, next: Uint8Array): boolean {
    return sent !== undefined && sent.length === next.length && sent.every((byte, index) => byte === next[index]);
  }

  /**
   * Closes a device, logging rather than throwing if it will not.
   * @param device - The device
   */
  private static async close(device: HidDevice): Promise<void> {
    try {
      await device.close();
    } catch (error) {
      console.error('Monarch could not be closed:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * `navigator.hid`, or null where the browser has none.
   */
  private static hid(): Hid | null {
    if (typeof navigator === 'undefined') {
      return null;
    }
    return (navigator as unknown as { hid?: Hid }).hid ?? null;
  }
}

/**
 * The page's single Monarch connection.
 */
export const monarchSession = new MonarchSession();
