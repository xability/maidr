import type { DotPadGeometry, DotPadKey, DotPadState, DotPadTransport } from '@type/dotPad';
import type { Event } from '@type/event';
import type { TactileDisplayDriver } from '@type/tactileDisplay';
import { Emitter } from '@type/event';
import { tactilePresetFor } from '@util/tactilePreset';
import { dotPadSession } from './dotPadSession';
import { monarchSession } from './monarchSession';
import { loadStoredGeneralSettings } from './settings';
import { LocalStorageService } from './storage';

/**
 * The tactile display the reader is using, whichever kind it is.
 *
 * Each kind of display has a driver of its own, and the reader uses one at a
 * time. This is the one the tactile service draws through and the Settings
 * dialog connects through: it passes everything to the driver in use and
 * passes on only that driver's events, so neither of them has to know which
 * device is on the desk.
 *
 * The driver in use is the one the reader last connected, or the one that last
 * came up on its own. A display that comes up replaces any other that was
 * connected: two would be drawn on at once, and only one of them is under the
 * reader's hands.
 */
export class TactileDisplay {
  private readonly drivers: readonly TactileDisplayDriver[];

  /**
   * The driver in use.
   */
  private active: TactileDisplayDriver;

  /**
   * The adoption in flight, if any, so a second request joins it.
   */
  private adopting: Promise<boolean> | null = null;

  private readonly onStateChangeEmitter = new Emitter<DotPadState>();

  /**
   * Fires whenever the connection state of the display in use changes.
   */
  public readonly onStateChange: Event<DotPadState> = this.onStateChangeEmitter.event;

  private readonly onWriteFailureEmitter = new Emitter<void>();

  /**
   * Fires when a write to the display in use was refused.
   */
  public readonly onWriteFailure: Event<void> = this.onWriteFailureEmitter.event;

  private readonly onKeyEmitter = new Emitter<DotPadKey>();

  /**
   * Fires when a key on the display in use is pressed.
   */
  public readonly onKey: Event<DotPadKey> = this.onKeyEmitter.event;

  /**
   * @param drivers - Every kind of display MAIDR drives; the first is in use
   * until the reader connects another
   */
  public constructor(drivers: readonly [TactileDisplayDriver, ...TactileDisplayDriver[]]) {
    this.drivers = drivers;
    this.active = drivers[0];
    for (const driver of drivers) {
      driver.onStateChange((state) => {
        if (state.status === 'connected') {
          this.switchTo(driver);
        }
        if (driver === this.active) {
          this.onStateChangeEmitter.fire(state);
        }
      });
      driver.onWriteFailure(() => {
        if (driver === this.active) {
          this.onWriteFailureEmitter.fire();
        }
      });
      driver.onKey((key) => {
        if (driver === this.active) {
          this.onKeyEmitter.fire(key);
        }
      });
    }
  }

  /**
   * Connection state of the display in use.
   */
  public get current(): DotPadState {
    return this.active.current;
  }

  /**
   * True when the display in use is connected and ready for output.
   */
  public get isConnected(): boolean {
    return this.active.isConnected;
  }

  /**
   * Layout of the display in use, or null.
   */
  public get geometry(): DotPadGeometry | null {
    return this.active.geometry;
  }

  /**
   * True when the display in use can contract its text line.
   */
  public get canTranslate(): boolean {
    return this.active.canTranslate;
  }

  /**
   * True when this browser can reach any kind of display MAIDR drives.
   */
  public get isSupported(): boolean {
    return this.drivers.some(driver => driver.isSupported);
  }

  /**
   * Reports whether the browser can reach a display over one transport.
   * @param transport - The connection to test
   */
  public supports(transport: DotPadTransport): boolean {
    return this.driverFor(transport).supports(transport);
  }

  /**
   * Fetches what connecting to a device would otherwise wait on.
   * @param deviceId - The device the reader picked, or null when none yet
   */
  public preload(deviceId: string | null = null): Promise<void> {
    return (this.driverForDevice(deviceId) ?? this.drivers[0]).preload();
  }

  /**
   * Opens the browser's device picker for one transport and connects to the
   * chosen display, which becomes the one in use.
   *
   * Must be reached synchronously from the reader's click: nothing is awaited
   * before the driver opens its picker.
   *
   * @param transport - Which way to look for the device
   * @returns The connection state once the attempt settles
   */
  public connect(transport: DotPadTransport): Promise<DotPadState> {
    const driver = this.driverFor(transport);
    this.switchTo(driver);
    return driver.connect(transport);
  }

  /**
   * Takes up a display the page was already granted, quietly.
   *
   * The kind the reader chose in Settings is asked first, then the rest: a
   * page may have been granted more than one, and the reader's choice is the
   * one they are reading with.
   *
   * @returns True when a display was taken up
   */
  public adopt(): Promise<boolean> {
    if (this.isConnected || this.active.current.status === 'connecting') {
      return Promise.resolve(false);
    }
    if (this.adopting === null) {
      this.adopting = this.adoptAny().finally(() => {
        this.adopting = null;
      });
    }
    return this.adopting;
  }

  /**
   * Closes the connection to the display in use.
   */
  public disconnect(): void {
    this.active.disconnect();
  }

  /**
   * Translates text for the display in use's text line.
   * @param text - The text to translate
   * @returns Hex braille cells, or null when the caller should fall back
   */
  public translate(text: string): Promise<string | null> {
    return this.active.translate(text);
  }

  /**
   * Sends a whole graphic frame to the display in use.
   * @param hex - The frame, packed as `DotPack.graphic` packs it
   */
  public writeGraphic(hex: string): void {
    this.active.writeGraphic(hex);
  }

  /**
   * Sends one row of cells of the graphic area to the display in use.
   * @param cellRow - Zero-based cell row
   * @param hex - The row, packed as `DotPack.graphicRow` packs it
   */
  public writeGraphicRow(cellRow: number, hex: string): void {
    this.active.writeGraphicRow(cellRow, hex);
  }

  /**
   * Sends the braille text line to the display in use.
   * @param hex - The line's cells, bit 0 being dot 1
   */
  public writeText(hex: string): void {
    this.active.writeText(hex);
  }

  /**
   * Buzzes the display in use.
   * @param onFailure - Called when the device refused after the request was queued
   * @returns False when the display cannot vibrate
   */
  public vibrate(onFailure?: () => void): boolean {
    return this.active.vibrate(onFailure);
  }

  /**
   * The body of {@link adopt}, run at most once at a time.
   */
  private async adoptAny(): Promise<boolean> {
    const preferred = this.driverForDevice(TactileDisplay.savedDeviceId()) ?? this.active;
    for (const driver of [preferred, ...this.drivers.filter(other => other !== preferred)]) {
      // Coming up makes it the driver in use; see the constructor.
      if (await driver.adopt()) {
        return true;
      }
      // The reader connected a display in Settings while this was asking.
      if (this.isConnected) {
        return false;
      }
    }
    return false;
  }

  /**
   * Makes a driver the one in use, closing the display it replaces.
   * @param driver - The driver
   */
  private switchTo(driver: TactileDisplayDriver): void {
    if (driver === this.active) {
      return;
    }
    const previous = this.active;
    this.active = driver;
    if (previous.isConnected) {
      previous.disconnect();
    }
  }

  /**
   * The driver that connects over a transport.
   * @param transport - The transport
   */
  private driverFor(transport: DotPadTransport): TactileDisplayDriver {
    return this.drivers.find(driver => driver.transports.includes(transport)) ?? this.drivers[0];
  }

  /**
   * The driver for a device the reader picked in Settings, or null when the
   * id names none.
   * @param deviceId - The stored device id
   */
  private driverForDevice(deviceId: string | null): TactileDisplayDriver | null {
    const transport = tactilePresetFor(deviceId)?.transports[0];
    return transport === undefined ? null : this.driverFor(transport);
  }

  /**
   * The device the reader saved in Settings, or null.
   */
  private static savedDeviceId(): string | null {
    const id = loadStoredGeneralSettings(new LocalStorageService()).tactileDisplayDeviceId;
    return typeof id === 'string' ? id : null;
  }
}

/**
 * The page's tactile display, whichever kind it is.
 */
export const tactileDisplay = new TactileDisplay([dotPadSession, monarchSession]);
