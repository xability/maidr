import type {
  DotPadGeometry,
  DotPadKey,
  DotPadState,
  DotPadTransport,
  DotPadVendorDevice,
  DotPadVendorModule,
  DotPadVendorSdk,
} from '@type/dotPad';
import type { Event } from '@type/event';
import { Emitter } from '@type/event';

/**
 * Vendor display-mode names. String constants in the SDK, so MAIDR can pass
 * them without importing anything.
 */
const GRAPHIC_MODE = 'GraphicMode';
const TEXT_MODE = 'TextMode';

/**
 * Vendor key names MAIDR reacts to, mapped to MAIDR's own key vocabulary.
 */
const VENDOR_KEYS: Readonly<Record<string, DotPadKey>> = {
  PanningLeft: 'panLeft',
  PanningRight: 'panRight',
  KeyFunction1: 'function1',
  KeyFunction2: 'function2',
  KeyFunction3: 'function3',
  KeyFunction4: 'function4',
};

/**
 * Where the vendor SDK might be found on the page, in the order tried.
 */
const GLOBAL_KEYS = ['DotPadSDK', 'dotPadSDK', 'DotPad'] as const;

/**
 * Owns the connection to a tactile display, for as long as the page lives.
 *
 * Deliberately a module-level singleton rather than a service on the MAIDR
 * controller. The controller is created when a chart takes focus and disposed
 * when it loses focus, so a connection owned by a controller would drop every
 * time the reader tabbed away — and reconnecting needs a fresh user gesture,
 * which there is no way to ask for mid-navigation. The connection outlives every
 * chart on the page; the per-chart service borrows it.
 *
 * The vendor SDK is loaded at runtime rather than bundled: it ships without a
 * licence permitting redistribution, so MAIDR discovers whatever the host page
 * provides and holds it to a structural contract.
 */
class DotPadSession {
  /**
   * The vendor SDK instance, once loaded.
   */
  private sdk: DotPadVendorSdk | null = null;

  /**
   * The vendor module, cached across connect attempts.
   */
  private vendor: DotPadVendorModule | null = null;

  /**
   * The connected device, or null.
   */
  private device: DotPadVendorDevice | null = null;

  /**
   * URL a host page may set to point MAIDR at the SDK module.
   */
  private moduleUrl: string | null = null;

  private state: DotPadState = {
    status: 'disconnected',
    deviceName: null,
    transport: null,
    geometry: null,
    message: '',
  };

  private readonly onStateChangeEmitter = new Emitter<DotPadState>();

  /**
   * Fires whenever the connection state changes, so settings UI and services
   * can follow along without polling.
   */
  public readonly onStateChange: Event<DotPadState> = this.onStateChangeEmitter.event;

  private readonly onKeyEmitter = new Emitter<DotPadKey>();

  /**
   * Fires on every hardware key press, using key-down rather than the SDK's
   * combination callback so panning responds immediately instead of after the
   * combination debounce.
   */
  public readonly onKey: Event<DotPadKey> = this.onKeyEmitter.event;

  /**
   * Serialises writes. The device acknowledges each line before accepting the
   * next, so overlapping writes interleave and corrupt the frame.
   */
  private writeChain: Promise<void> = Promise.resolve();

  /**
   * Current connection state.
   */
  public get current(): DotPadState {
    return this.state;
  }

  /**
   * True when a device is connected and ready for output.
   */
  public get isConnected(): boolean {
    return this.state.status === 'connected' && this.device !== null;
  }

  /**
   * Layout of the connected device, or null.
   */
  public get geometry(): DotPadGeometry | null {
    return this.state.geometry;
  }

  /**
   * Points MAIDR at an SDK module to import when connecting. Call before the
   * first connect attempt; a host page that instead exposes the SDK as a global
   * needs no configuration.
   * @param url - URL of the vendor SDK ES module
   */
  public setModuleUrl(url: string): void {
    this.moduleUrl = url;
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
   * Reads a candidate vendor module off the page's globals.
   */
  private findGlobalModule(): DotPadVendorModule | null {
    if (typeof window === 'undefined') {
      return null;
    }
    const scope = window as unknown as Record<string, unknown>;
    for (const key of GLOBAL_KEYS) {
      const candidate = scope[key];
      if (this.isVendorModule(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Checks a candidate against the parts of the SDK MAIDR actually uses, so a
   * page exposing something else under the same name fails here rather than
   * halfway through a connection.
   * @param candidate - The value to check
   */
  private isVendorModule(candidate: unknown): candidate is DotPadVendorModule {
    if (typeof candidate !== 'object' || candidate === null) {
      return false;
    }
    const module = candidate as Partial<DotPadVendorModule>;
    return typeof module.DotPadSDK === 'function' && typeof module.DotPadScanner === 'function';
  }

  /**
   * Loads the vendor module from a global or a configured URL.
   */
  private async loadVendor(): Promise<DotPadVendorModule | null> {
    if (this.vendor !== null) {
      return this.vendor;
    }

    const global = this.findGlobalModule();
    if (global !== null) {
      this.vendor = global;
      return global;
    }

    if (this.moduleUrl === null) {
      return null;
    }

    try {
      const imported: unknown = await import(/* @vite-ignore */ this.moduleUrl);
      if (this.isVendorModule(imported)) {
        this.vendor = imported;
        return imported;
      }
    } catch (error) {
      console.error('DotPad SDK could not be loaded:', error instanceof Error ? error.message : error);
    }
    return null;
  }

  /**
   * Reports whether the browser can reach a tactile display over one transport.
   *
   * Both APIs are gated by Permissions Policy, so an iframe without the
   * matching `allow` attribute reports no support even in a browser that has
   * them. Detecting rather than assuming is what keeps the feature from
   * announcing itself where it cannot work — and detecting per transport is
   * what stops a page that permits only one of the two from looking as though
   * it permits neither.
   *
   * @param transport - The connection to test
   */
  public supports(transport: DotPadTransport): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }
    return transport === 'bluetooth' ? 'bluetooth' in navigator : 'serial' in navigator;
  }

  /**
   * Reports whether either transport is available.
   */
  public get isSupported(): boolean {
    return this.supports('bluetooth') || this.supports('serial');
  }

  /**
   * Derives MAIDR's geometry from the device's own report.
   * @param device - The connected vendor device
   */
  private readGeometry(device: DotPadVendorDevice): DotPadGeometry {
    const cellColumns = Math.max(0, Math.trunc(device.numberCellColumns));
    const cellRows = Math.max(0, Math.trunc(device.numberCellRows));
    return {
      cellColumns,
      cellRows,
      textCells: Math.max(0, Math.trunc(device.numberBrailleCellColumns)),
      dotWidth: cellColumns * 2,
      dotHeight: cellRows * 4,
    };
  }

  /**
   * Subscribes to the SDK's callbacks.
   * @param sdk - The vendor SDK instance
   */
  private registerCallbacks(sdk: DotPadVendorSdk): void {
    sdk.setCallBack(
      (device, dataCode) => {
        if (dataCode === 'Disconnected' && device === this.device) {
          this.device = null;
          this.setState({
            status: 'disconnected',
            deviceName: null,
            transport: null,
            geometry: null,
            message: 'DotPad disconnected',
          });
        }
      },
      null,
      (_device, key) => {
        // Own properties only. A plain object inherits from Object.prototype,
        // so a vendor key named `constructor` or `toString` would otherwise
        // resolve to a function and be fired as though it were a DotPadKey,
        // handing every listener a value outside the type it is written against.
        if (!Object.hasOwn(VENDOR_KEYS, key)) {
          return;
        }
        this.onKeyEmitter.fire(VENDOR_KEYS[key]);
      },
      null,
    );
  }

  /**
   * Opens the browser's device picker and connects to the chosen display.
   *
   * Must be called from a user gesture — the browser will not show the picker
   * otherwise. Returns the resulting state rather than throwing, because every
   * failure here is something the user needs told, not an exception to swallow.
   *
   * @param transport - Whether to look for the device over Bluetooth or USB
   */
  public async connect(transport: DotPadTransport = 'bluetooth'): Promise<DotPadState> {
    if (this.isConnected || this.state.status === 'connecting') {
      // A second attempt while a picker is already open would open another one,
      // leaving the reader with two dialogs and no way to tell which took.
      return this.state;
    }
    if (!this.supports(transport)) {
      this.setState({
        status: 'unavailable',
        deviceName: null,
        transport: null,
        geometry: null,
        message: transport === 'bluetooth'
          ? 'This browser cannot reach a DotPad over Bluetooth. Web Bluetooth is available in Chrome and other Chromium browsers, and only on pages permitted to use it.'
          : 'This browser cannot reach a DotPad over USB. Web Serial is available in Chrome and other Chromium browsers on desktop, and only on pages permitted to use it.',
      });
      return this.state;
    }

    this.setState({ status: 'connecting', message: '' });

    const vendor = await this.loadVendor();
    if (vendor === null) {
      this.setState({
        status: 'unavailable',
        deviceName: null,
        transport: null,
        geometry: null,
        message: 'The DotPad SDK was not found on this page.',
      });
      return this.state;
    }

    try {
      const sdk = this.sdk ?? new vendor.DotPadSDK();
      if (this.sdk === null) {
        this.sdk = sdk;
        this.registerCallbacks(sdk);
      }

      const scanner = new vendor.DotPadScanner();
      const selected = transport === 'bluetooth'
        ? await scanner.startBleScan()
        : await scanner.startUsbScan();
      if (selected === undefined || selected === null) {
        this.setState({ status: 'disconnected', message: 'No DotPad was selected.' });
        return this.state;
      }

      const device = transport === 'bluetooth'
        ? await sdk.connectBleDevice(selected)
        : await sdk.connectUsbDevice(selected);
      if (device === null || device === undefined) {
        this.setState({ status: 'failed', message: 'Could not connect to the DotPad.' });
        return this.state;
      }

      this.device = device;
      this.setState({
        status: 'connected',
        deviceName: device.cellType,
        transport,
        geometry: this.readGeometry(device),
        message: '',
      });
    } catch (error) {
      this.device = null;
      this.setState({
        status: 'failed',
        transport: null,
        message: error instanceof Error ? error.message : 'Could not connect to the DotPad.',
      });
    }

    return this.state;
  }

  /**
   * Closes the connection.
   */
  public disconnect(): void {
    if (this.sdk !== null && this.device !== null) {
      try {
        this.sdk.disconnect(this.device);
      } catch (error) {
        console.error('DotPad disconnect failed:', error instanceof Error ? error.message : error);
      }
    }
    this.device = null;
    this.setState({
      status: 'disconnected',
      deviceName: null,
      transport: null,
      geometry: null,
      message: '',
    });
  }

  /**
   * Queues a write behind any write already in flight.
   *
   * Failures are logged and swallowed rather than propagated: a dropped frame
   * is a missing update, not a reason to break the navigation the reader is in
   * the middle of.
   *
   * @param write - The write to perform
   */
  private enqueue(write: () => void | Promise<void>): void {
    this.writeChain = this.writeChain
      .then(() => write())
      .catch((error: unknown) => {
        console.error('DotPad write failed:', error instanceof Error ? error.message : error);
      });
  }

  /**
   * Sends a full graphic frame.
   * @param hex - Hex payload of `cellColumns * cellRows` bytes
   */
  public writeGraphic(hex: string): void {
    const sdk = this.sdk;
    const device = this.device;
    if (sdk === null || device === null) {
      return;
    }
    this.enqueue(() => sdk.displayGraphicData(hex, device, GRAPHIC_MODE));
  }

  /**
   * Sends a single row of the graphic area.
   *
   * Rows are numbered from 1 on the device, with 0 reserved for the text line.
   *
   * @param cellRow - Zero-based cell row
   * @param hex - Hex payload of `cellColumns` bytes
   */
  public writeGraphicRow(cellRow: number, hex: string): void {
    const sdk = this.sdk;
    const device = this.device;
    if (sdk === null || device === null) {
      return;
    }
    this.enqueue(() => sdk.displayLineData(cellRow + 1, 0, hex, GRAPHIC_MODE, device));
  }

  /**
   * Sends braille cells to the text line.
   * @param hex - Hex payload of `textCells` bytes
   */
  public writeText(hex: string): void {
    const sdk = this.sdk;
    const device = this.device;
    if (sdk === null || device === null) {
      return;
    }
    this.enqueue(() => sdk.displayTextData(hex, device, TEXT_MODE));
  }
}

/**
 * The page's single tactile-display connection.
 */
export const dotPadSession = new DotPadSession();
