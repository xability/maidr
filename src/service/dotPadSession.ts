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
 * Page globals a host sets to serve the SDK itself.
 *
 * The setters below are the same configuration, but `dotPadSession` is not on
 * any of the package's export paths, so an application that installs MAIDR
 * from npm has no way to reach them. These are what such a host actually has:
 * two values assigned before MAIDR loads. Without them the only working
 * escape hatch is pre-defining the whole SDK as {@link GLOBAL_KEYS}, which is
 * a much larger thing to ask of a page that simply wants the file served from
 * its own origin.
 */
/**
 * USB identifiers the SDK's own picker filters by.
 *
 * Duplicated from its `startUsbScan`, which inlines them rather than exposing
 * them. Used only to tell a granted DotPad port from some other device the
 * page happens to have been granted.
 */
const DOTPAD_USB_IDS: readonly { usbVendorId: number; usbProductId: number }[] = [
  { usbVendorId: 1027, usbProductId: 24592 },
  { usbVendorId: 1027, usbProductId: 24597 },
];

/**
 * The part of a Web Serial port MAIDR reads when deciding whether a granted
 * port is a DotPad.
 */
interface SerialPortLike {
  getInfo?: () => { usbVendorId?: number; usbProductId?: number };
}

const CONFIG_KEYS = {
  moduleUrl: 'MAIDR_DOTPAD_SDK_URL',
  assetBaseUrl: 'MAIDR_DOTPAD_ASSET_BASE_URL',
} as const;

/**
 * Reads one of {@link CONFIG_KEYS} off the page, or null when unset.
 * @param key - The global to read
 */
function readGlobalConfig(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = (window as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The vendor's own published copy of the SDK, pinned by commit.
 *
 * MAIDR does not bundle the SDK -- it ships without a licence permitting
 * redistribution -- so this points at the files Dot Inc. publish themselves,
 * mirrored by a CDN. Referencing is not redistributing, and the pin means the
 * bytes cannot change underneath a release: this commit's `DotPadSDK-3.0.2.js`
 * is byte-identical to the one this integration was written against.
 *
 * Only a default. A host page that would rather serve its own copy -- an
 * air-gapped deployment, a page whose Content-Security-Policy admits no
 * third-party origin -- sets {@link CONFIG_KEYS} on the page or exposes the
 * SDK itself as a global, and this is never fetched.
 */
const VENDOR_BASE_URL = 'https://cdn.jsdelivr.net/gh/dotincorp/dotpad-sdk-guide@437210b1e5b3f4cc5aaa8db5759206067b4edd6e/Web/3.0.2';

/**
 * Language table the braille text line is translated with.
 *
 * Contracted braille is what a fluent reader actually reads, and on a
 * twenty-cell line the contractions are not a nicety -- they are most of the
 * difference between a value fitting and needing to be panned.
 */
const BRAILLE_LANGUAGE = 'English';

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
  /**
   * True when the current connection was adopted silently rather than chosen
   * by the reader. Only an adopted one is released again on going idle, so a
   * device the reader deliberately connected is never taken from under them.
   */
  private adopted = false;

  private moduleUrl: string | null = null;

  /**
   * Directory the SDK loads its liblouis build from, alongside the module.
   */
  private assetBaseUrl: string | null = null;

  /**
   * True once the SDK has been pointed at a liblouis build and a grade, so
   * {@link translate} can be trusted to return contracted braille.
   */
  private translationReady = false;

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
   * first connect attempt.
   *
   * Reachable only from inside the bundle. A host page sets
   * `window.MAIDR_DOTPAD_SDK_URL` instead, which this takes precedence over.
   *
   * @param url - URL of the vendor SDK ES module
   */
  public setModuleUrl(url: string): void {
    this.moduleUrl = url;
  }

  /**
   * Points the SDK's braille engine at a directory serving its liblouis build.
   *
   * Defaults to the `lib/` beside the module, which is where the vendor keeps
   * it. A host serving its own copy of the SDK needs this only if it puts the
   * engine somewhere else. From a page, `window.MAIDR_DOTPAD_ASSET_BASE_URL`.
   *
   * @param url - Directory holding `liblouis.js`, `.wasm` and `.data`
   */
  public setAssetBaseUrl(url: string): void {
    this.assetBaseUrl = url;
  }

  /**
   * Where to import the SDK from: what a caller set, else what the page
   * declares, else nothing (the vendor default applies).
   */
  private get configuredModuleUrl(): string | null {
    return this.moduleUrl ?? readGlobalConfig(CONFIG_KEYS.moduleUrl);
  }

  /**
   * Where the braille engine's files are, on the same terms.
   */
  private get configuredAssetBaseUrl(): string | null {
    return this.assetBaseUrl ?? readGlobalConfig(CONFIG_KEYS.assetBaseUrl);
  }

  /**
   * Fetches the SDK ahead of any connect attempt.
   *
   * {@link connect} has to await the module before it can open the device
   * picker, and awaiting a network fetch spends the transient user activation
   * the picker needs — on a cold cache over a slow link the click is consumed
   * and no picker ever appears. Calling this when the settings dialog opens
   * means the module is already in hand by the time the reader presses a
   * button, and the await costs nothing.
   *
   * Safe to call repeatedly and safe to ignore: a failure here just leaves
   * {@link connect} to try again and report it.
   */
  public async preload(): Promise<void> {
    if (this.vendor !== null || !this.isSupported) {
      return;
    }
    await this.loadVendor();
  }

  /**
   * True when the braille line can be translated into contracted braille.
   *
   * False before the first connection, and on a page whose SDK build has no
   * translation surface or whose liblouis assets could not be reached -- where
   * MAIDR falls back to its own uncontracted table rather than going silent.
   */
  public get canTranslate(): boolean {
    return this.translationReady && this.sdk !== null;
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

    const url = this.configuredModuleUrl ?? `${VENDOR_BASE_URL}/DotPadSDK-3.0.2.js`;
    try {
      const imported: unknown = await import(/* @vite-ignore */ url);
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
   * Points the SDK's braille engine at its liblouis build and asks for
   * contracted braille.
   *
   * Failure here is not fatal and is not reported to the reader: the text line
   * falls back to MAIDR's own uncontracted table, which is worse to read but
   * still readable, and the graphic area is unaffected.
   *
   * @param vendor - The loaded vendor module
   * @param sdk - The SDK instance to configure
   */
  private prepareTranslation(vendor: DotPadVendorModule, sdk: DotPadVendorSdk): void {
    const language = vendor.BrailleLanguage?.[BRAILLE_LANGUAGE];
    const grade = vendor.GradeOption?.Grade2;
    if (language === undefined || grade === undefined) {
      return;
    }

    try {
      // A host serving its own SDK and saying nothing about the engine gets
      // nothing rather than the CDN: the reason to serve your own copy is
      // usually a policy that would refuse the CDN anyway, and pointing
      // liblouis at it would fail at the one moment there is no fallback left.
      const assets = this.configuredAssetBaseUrl
        ?? (this.configuredModuleUrl === null ? `${VENDOR_BASE_URL}/lib/` : null);
      if (assets !== null) {
        vendor.LiblouisManager?.setAssetBaseUrl(assets);
      }
      sdk.setBrailleLanguage(language, grade);
      this.translationReady = true;
    } catch (error) {
      console.error('DotPad braille translation unavailable:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Translates text into braille cells using the device SDK's own engine.
   *
   * Returns null rather than throwing when translation is unavailable or
   * fails, so the caller can fall back without having to distinguish the
   * reasons -- from the reader's side they are the same event.
   *
   * @param text - The text to translate
   * @returns Hex braille cells, or null when the caller should fall back
   */
  public async translate(text: string): Promise<string | null> {
    const sdk = this.sdk;
    if (!this.translationReady || sdk === null) {
      return null;
    }
    try {
      // Word wrap off: MAIDR windows the line itself, against the cell count
      // the device reported, and a wrap inserted here would fight that.
      const hex = await sdk.translateText(text, false);
      return typeof hex === 'string' && hex !== '' ? hex : null;
    } catch (error) {
      console.error('DotPad braille translation failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Opens a device the caller has already obtained and records the connection.
   *
   * The half of connecting that is the same whether the device came from a
   * picker or from a permission the origin was granted earlier.
   *
   * @param sdk - The vendor SDK instance
   * @param transport - How the device is attached
   * @param selected - The device or port to open
   * @returns True when the device is connected
   */
  private async attach(
    sdk: DotPadVendorSdk,
    transport: DotPadTransport,
    selected: unknown,
  ): Promise<boolean> {
    const device = transport === 'bluetooth'
      ? await sdk.connectBleDevice(selected)
      : await sdk.connectUsbDevice(selected);
    if (device === null || device === undefined) {
      return false;
    }

    this.device = device;
    this.setState({
      status: 'connected',
      deviceName: device.cellType,
      transport,
      geometry: this.readGeometry(device),
      message: '',
    });
    return true;
  }

  /**
   * Hands back a silently adopted display so another chart can take it.
   *
   * A device can only be open in one frame at a time, and every chart is its
   * own frame. Releasing when this chart stops using the display is what lets
   * the next one adopt it — without this, the first chart a reader opens keeps
   * the device for as long as its frame lives.
   *
   * A connection the reader made themselves is left alone: they chose this
   * chart, and taking the device away because they turned braille off would
   * undo a decision they made deliberately.
   */
  public releaseIfAdopted(): void {
    if (this.adopted) {
      this.disconnect();
    }
  }

  /**
   * Connects to a display this origin was already granted, without a picker.
   *
   * Every chart in a notebook is its own iframe, so every chart is its own
   * copy of this module with its own connection — and a live `BluetoothDevice`
   * or `SerialPort` cannot be passed between frames. What does cross the
   * boundary is the *permission*: `srcdoc` frames inherit the embedder's
   * origin, so a device the reader picked in one chart is already granted to
   * every other chart on the page. `getPorts` and `getDevices` hand it back
   * without a dialog and without a user gesture, which is the difference
   * between pairing once per page and pairing once per chart.
   *
   * Quiet on failure by design: this runs on its own, not because the reader
   * asked, so it must not put an error next to a control they did not touch.
   * The Connect buttons remain the way to be told what went wrong.
   *
   * @returns True when a display was adopted
   */
  public async adopt(): Promise<boolean> {
    if (this.isConnected || this.state.status === 'connecting') {
      return false;
    }

    const vendor = await this.loadVendor();
    if (vendor === null) {
      return false;
    }

    const sdk = this.sdk ?? new vendor.DotPadSDK();
    if (this.sdk === null) {
      this.sdk = sdk;
      this.registerCallbacks(sdk);
      this.prepareTranslation(vendor, sdk);
    }

    for (const transport of ['bluetooth', 'serial'] as const) {
      if (!this.supports(transport)) {
        continue;
      }
      // Caught per transport, not around the loop. The likeliest failure is
      // another frame already holding that device, and that says nothing about
      // the other transport: a reader who granted both should not lose the
      // cabled display because the wireless one is busy.
      try {
        const granted = await this.grantedDevice(vendor, transport);
        if (granted === null) {
          continue;
        }
        if (await this.attach(sdk, transport, granted)) {
          this.adopted = true;
          return true;
        }
      } catch (error) {
        // An ordinary outcome here, not a fault to report: opening a device a
        // second time throws, and this runs unprompted.
        console.error('DotPad could not be reconnected:', error instanceof Error ? error.message : error);
      }
    }
    return false;
  }

  /**
   * A display this origin was granted earlier, or null when there is none.
   *
   * Filtered rather than taken on trust: a page may have been granted some
   * other device entirely, and opening that would be worse than doing nothing.
   * The Bluetooth filter is the SDK's own name prefix, read off its scanner so
   * the two cannot drift.
   *
   * @param vendor - The loaded vendor module
   * @param transport - Which kind of device to look for
   */
  private async grantedDevice(vendor: DotPadVendorModule, transport: DotPadTransport): Promise<unknown> {
    if (transport === 'bluetooth') {
      const bluetooth = (navigator as unknown as {
        bluetooth?: { getDevices?: () => Promise<{ name?: string }[]> };
      }).bluetooth;
      if (bluetooth?.getDevices === undefined) {
        return null;
      }
      const scanner = new vendor.DotPadScanner() as unknown as { DOTPAD_PREFIX?: string };
      const prefix = scanner.DOTPAD_PREFIX ?? 'Dot';
      const devices = await bluetooth.getDevices();
      return devices.find(device => device.name?.startsWith(prefix)) ?? null;
    }

    const serial = (navigator as unknown as {
      serial?: { getPorts?: () => Promise<SerialPortLike[]> };
    }).serial;
    if (serial?.getPorts === undefined) {
      return null;
    }
    const ports = await serial.getPorts();
    return ports.find(port => DotPadSession.isDotPadPort(port)) ?? null;
  }

  /**
   * Reports whether a granted serial port is a DotPad.
   *
   * The identifiers are the ones the SDK's own `startUsbScan` filters its
   * picker by. They are duplicated here because the SDK inlines them rather
   * than exposing them; a port that does not match is some other device the
   * page was granted and must be left alone.
   *
   * @param port - The granted port to test
   */
  private static isDotPadPort(port: SerialPortLike): boolean {
    const info = port.getInfo?.();
    if (info === undefined) {
      return false;
    }
    return DOTPAD_USB_IDS.some(
      id => id.usbVendorId === info.usbVendorId && id.usbProductId === info.usbProductId,
    );
  }

  /**
   * Reports whether the browser can reach a tactile display over one transport.
   *
   * Both APIs are gated by Permissions Policy, and being gated out does not
   * reliably remove them: the policy has to be asked, not inferred from
   * whether the object exists. Detecting rather than assuming is what keeps
   * the feature from announcing itself where it cannot work — and detecting
   * per transport is what stops a page that permits only one of the two from
   * looking as though it permits neither.
   *
   * @param transport - The connection to test
   */
  public supports(transport: DotPadTransport): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }

    const feature = transport === 'bluetooth' ? 'bluetooth' : 'serial';
    // Presence is not permission. A frame denied the feature by Permissions
    // Policy can still expose the API -- measured in Chromium, a cross-origin
    // frame without `allow` keeps `navigator.serial` and only loses
    // `navigator.bluetooth` -- so a presence check alone lets MAIDR offer a
    // control that answers with a raw SecurityError. The policy is the
    // authority where the browser will state it.
    const policy = typeof document === 'undefined'
      ? undefined
      : (document as unknown as {
          featurePolicy?: { allowsFeature: (name: string) => boolean };
        }).featurePolicy;
    if (policy !== undefined) {
      try {
        if (!policy.allowsFeature(feature)) {
          return false;
        }
      } catch {
        // A browser that does not know the feature name throws rather than
        // answering; fall through to the presence check.
      }
    }

    return feature in navigator;
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
          ? 'This page cannot reach a DotPad over Bluetooth. Web Bluetooth needs a Chromium browser, and a page — or an iframe — permitted to use it.'
          : 'This page cannot reach a DotPad over USB. Web Serial needs a Chromium browser on desktop, and a page — or an iframe — permitted to use it.',
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
        this.prepareTranslation(vendor, sdk);
      }

      const scanner = new vendor.DotPadScanner();
      const selected = transport === 'bluetooth'
        ? await scanner.startBleScan()
        : await scanner.startUsbScan();
      if (selected === undefined || selected === null) {
        this.setState({ status: 'disconnected', message: 'No DotPad was selected.' });
        return this.state;
      }

      if (!await this.attach(sdk, transport, selected)) {
        this.setState({ status: 'failed', message: 'Could not connect to the DotPad.' });
        return this.state;
      }
      this.adopted = false;
    } catch (error) {
      this.device = null;
      const denied = error instanceof Error && error.name === 'SecurityError';
      this.setState({
        status: denied ? 'unavailable' : 'failed',
        transport: null,
        // A SecurityError here is the page being refused the device, not the
        // device refusing the page, and "try again" is the wrong advice for it.
        message: denied
          ? 'This page is not permitted to reach a DotPad. It needs to be served over HTTPS, and an iframe needs the matching allow attribute.'
          : error instanceof Error ? error.message : 'Could not connect to the DotPad.',
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
