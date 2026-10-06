import type { DotPadGeometry, DotPadKey, DotPadState, DotPadTransport } from './dotPad';
import type { Event } from './event';

/**
 * What MAIDR needs from the connection to one kind of tactile display.
 *
 * Each kind of device is reached its own way -- a DotPad through its vendor's
 * SDK over Web Bluetooth or Web Serial, a Monarch through WebHID -- and each
 * driver hides that behind this one surface, so the tactile service and the
 * Settings dialog work the same whichever the reader has.
 *
 * The graphic payloads are a DotPad's: cells of two pins by four, packed by
 * `DotPack.graphic`. A driver for a display laid out differently unpacks them
 * into its own pins.
 */
export interface TactileDisplayDriver {
  /**
   * The transports this driver connects over, in the order Settings offers
   * them.
   */
  readonly transports: readonly DotPadTransport[];

  /**
   * Current connection state.
   */
  readonly current: DotPadState;

  /**
   * True when a device is connected and ready for output.
   */
  readonly isConnected: boolean;

  /**
   * Layout of the connected device, or null.
   */
  readonly geometry: DotPadGeometry | null;

  /**
   * True when the text line can be translated into contracted braille.
   */
  readonly canTranslate: boolean;

  /**
   * True when this browser can reach the device over any of its transports.
   */
  readonly isSupported: boolean;

  /**
   * Fires whenever the connection state changes.
   */
  readonly onStateChange: Event<DotPadState>;

  /**
   * Fires when a write was refused before it reached the device.
   */
  readonly onWriteFailure: Event<void>;

  /**
   * Fires when a hardware key MAIDR responds to is pressed.
   */
  readonly onKey: Event<DotPadKey>;

  /**
   * Reports whether the browser can reach the device over one transport.
   * @param transport - The connection to test
   */
  supports: (transport: DotPadTransport) => boolean;

  /**
   * Fetches anything a connect attempt would otherwise wait on.
   */
  preload: () => Promise<void>;

  /**
   * Opens the browser's device picker and connects to the chosen display.
   * Called from a user gesture; returns rather than throws.
   * @param transport - Which way to look for the device
   */
  connect: (transport: DotPadTransport) => Promise<DotPadState>;

  /**
   * Connects to a display the page was already granted, without a picker,
   * quietly.
   * @returns True when a display was taken up
   */
  adopt: () => Promise<boolean>;

  /**
   * Closes the connection.
   */
  disconnect: () => void;

  /**
   * Translates text into contracted braille cells, or null when the caller
   * should fall back to MAIDR's own table.
   * @param text - The text to translate
   */
  translate: (text: string) => Promise<string | null>;

  /**
   * Sends a whole graphic frame.
   * @param hex - `cellColumns * cellRows` cells, as `DotPack.graphic` packs them
   */
  writeGraphic: (hex: string) => void;

  /**
   * Sends one row of cells of the graphic area.
   * @param cellRow - Zero-based cell row
   * @param hex - `cellColumns` cells, as `DotPack.graphicRow` packs them
   */
  writeGraphicRow: (cellRow: number, hex: string) => void;

  /**
   * Sends the braille text line.
   * @param hex - `textCells` cells, bit 0 being dot 1
   */
  writeText: (hex: string) => void;

  /**
   * Buzzes the device to say the reader has reached an edge.
   * @param onFailure - Called when the device refused after the request was queued
   * @returns False when the device cannot vibrate, so the caller says it instead
   */
  vibrate: (onFailure?: () => void) => boolean;
}
