/**
 * Physical layout of a connected tactile display, as the device itself reports
 * it.
 *
 * Never hardcode these. Models differ — one DotPad has no text line at all —
 * and a renderer that assumes one geometry silently draws garbage on another.
 */
export interface DotPadGeometry {
  /**
   * Braille cells across the graphic area.
   */
  cellColumns: number;

  /**
   * Braille cells down the graphic area.
   */
  cellRows: number;

  /**
   * Cells on the separate braille text line. Zero on models without one.
   */
  textCells: number;

  /**
   * Pins across the graphic area — `cellColumns * 2`.
   */
  dotWidth: number;

  /**
   * Pins down the graphic area — `cellRows * 4`.
   */
  dotHeight: number;
}

/**
 * Hardware keys MAIDR responds to.
 *
 * The panning keys pan the tactile view horizontally and function keys 1 and 4
 * pan it vertically, which together let a reader reach the whole chart while
 * zoomed in without leaving the display.
 */
export type DotPadKey = 'panLeft' | 'panRight' | 'function1' | 'function2' | 'function3' | 'function4';

/**
 * How MAIDR reaches a tactile display.
 *
 * Not interchangeable, and neither one covers every reader. USB has the
 * headroom — a full frame over Bluetooth costs a second or more, against a
 * reader pressing arrow keys several times a second — and needs no pairing and
 * no charge. Bluetooth is the one that works on Android, where Web Serial does
 * not exist, and the one that leaves the desk free of a cable. So both are
 * offered and the reader picks.
 */
export type DotPadTransport = 'bluetooth' | 'serial';

/**
 * Lifecycle of the connection to a tactile display.
 */
export type DotPadStatus = 'unavailable' | 'disconnected' | 'connecting' | 'connected' | 'failed';

/**
 * Connection state, plus what to tell the user about it.
 */
export interface DotPadState {
  status: DotPadStatus;

  /**
   * Model name reported by the device, or null when nothing is connected.
   */
  deviceName: string | null;

  /**
   * How the connected device is attached, or null when nothing is connected.
   * Worth saying out loud in the UI: the two differ enough in responsiveness
   * that a reader on a slow display should be able to see which one they got.
   */
  transport: DotPadTransport | null;

  /**
   * Layout of the connected device, or null when nothing is connected.
   */
  geometry: DotPadGeometry | null;

  /**
   * Why the last attempt failed, for display next to the connect control.
   * Empty when there is nothing to report.
   */
  message: string;
}

/**
 * The subset of the vendor SDK's device object MAIDR reads.
 *
 * Declared structurally rather than imported. The SDK is not redistributable
 * as part of MAIDR, so it is discovered at runtime and this interface is the
 * contract MAIDR holds it to.
 */
export interface DotPadVendorDevice {
  readonly isConnect: boolean;
  readonly cellType: string;
  readonly numberCellRows: number;
  readonly numberCellColumns: number;
  readonly numberBrailleCellColumns: number;
}

/**
 * The subset of the vendor SDK's scanner MAIDR calls.
 */
export interface DotPadVendorScanner {
  startBleScan: () => Promise<unknown>;
  startUsbScan: () => Promise<unknown>;
}

/**
 * The subset of the vendor SDK MAIDR calls.
 */
export interface DotPadVendorSdk {
  getConnectedDevices: () => DotPadVendorDevice[];
  connectBleDevice: (device: unknown) => Promise<DotPadVendorDevice | null | undefined>;
  connectUsbDevice: (device: unknown) => Promise<DotPadVendorDevice | null | undefined>;
  disconnect: (device?: DotPadVendorDevice | null) => void;
  displayGraphicData: (hexData: string, device?: DotPadVendorDevice | null, displayMode?: string) => void;
  displayTextData: (
    inputData: string,
    device?: DotPadVendorDevice | null,
    displayMode?: string,
    needsTranslation?: boolean,
    callback?: ((device: DotPadVendorDevice, hex: string) => void) | null,
  ) => Promise<void> | void;
  displayLineData: (
    lineId: number,
    startCellIndex: number,
    hexData: string,
    displayMode: string,
    device?: DotPadVendorDevice | null,
  ) => void;
  setBrailleLanguage: (language: unknown, gradeOption?: number | null) => void;
  setNumberOfBraillePerLine: (count: number) => void;
  translateText: (inputText: string, applyWordWrap?: boolean) => Promise<string>;
  setCallBack: (
    messageCallBack: ((device: DotPadVendorDevice, dataCode: string, msg: string) => void) | null,
    keyCallBack: ((device: DotPadVendorDevice, keyCode: string, msg: string) => void) | null,
    onKeyDownCallBack?: ((device: DotPadVendorDevice, key: string, binary: string) => void) | null,
    onKeyUpCallBack?: ((device: DotPadVendorDevice, key: string, binary: string) => void) | null,
  ) => void;
}

/**
 * The vendor SDK's braille-translation surface.
 *
 * Optional, and checked at runtime rather than required: a host page may supply
 * an older SDK build without it, and the braille line has to keep working when
 * it does. MAIDR falls back to its own uncontracted table in that case.
 */
export interface DotPadVendorTranslation {
  /**
   * Language table entries, keyed by display name -- `English`, `한국어`, and
   * the rest. Passed straight back to `setBrailleLanguage`; MAIDR never looks
   * inside one.
   */
  BrailleLanguage?: Readonly<Record<string, unknown>>;

  /**
   * Contraction grades, positional per language.
   */
  GradeOption?: Readonly<{ Grade1: number; Grade2: number; Grade3: number }>;

  /**
   * Points the SDK's liblouis build at the directory serving its `.js`,
   * `.wasm` and `.data` files.
   */
  LiblouisManager?: { setAssetBaseUrl: (url: string) => void };
}

/**
 * The module shape MAIDR expects the vendor SDK to expose.
 */
export interface DotPadVendorModule extends DotPadVendorTranslation {
  DotPadSDK: new () => DotPadVendorSdk;
  DotPadScanner: new () => DotPadVendorScanner;
}
