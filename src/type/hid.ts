/**
 * The parts of WebHID MAIDR reads, declared structurally.
 *
 * TypeScript's DOM library carries no WebHID types, and the API exists only in
 * desktop Chromium, so these are the contract MAIDR holds `navigator.hid` to
 * rather than an import -- the same way `dotPad.ts` declares the parts of the
 * DotPad SDK it uses. Every field a browser might leave out is optional, and
 * the code that reads them treats a missing one as nothing there.
 */

/**
 * One main item of a report: a run of `reportCount` fields of `reportSize`
 * bits each.
 */
export interface HidReportItem {
  /**
   * True when each field holds the index of a usage that is active, rather
   * than one field per usage.
   */
  readonly isArray?: boolean;

  /**
   * True for padding: the bits are there, and carry nothing.
   */
  readonly isConstant?: boolean;

  /**
   * True when the usages are the range `usageMinimum`..`usageMaximum` rather
   * than the list in `usages`.
   */
  readonly isRange?: boolean;

  /**
   * Extended usages, the usage page in the high sixteen bits.
   */
  readonly usages?: readonly number[];
  readonly usageMinimum?: number;
  readonly usageMaximum?: number;

  /**
   * Bits in each field.
   */
  readonly reportSize?: number;

  /**
   * Fields in the item.
   */
  readonly reportCount?: number;
  readonly logicalMinimum?: number;
  readonly logicalMaximum?: number;
}

/**
 * One report, as one collection describes it.
 */
export interface HidReportInfo {
  /**
   * Zero when the device does not number its reports.
   */
  readonly reportId?: number;

  /**
   * The report's items in the order the descriptor declares them, which is the
   * order their bits are packed in.
   */
  readonly items?: readonly HidReportItem[];
}

/**
 * One collection of the report descriptor.
 *
 * Chromium attaches every item to the collection it is declared in and to each
 * collection around it, so a top-level collection lists all of its reports'
 * items in declaration order -- which is what lets a report's layout be read
 * from it alone.
 */
export interface HidCollectionInfo {
  readonly usagePage?: number;
  readonly usage?: number;
  readonly children?: readonly HidCollectionInfo[];
  readonly inputReports?: readonly HidReportInfo[];
  readonly outputReports?: readonly HidReportInfo[];
}

/**
 * A report the device sent.
 */
export interface HidInputReportEvent {
  readonly device: HidDevice;
  readonly reportId: number;

  /**
   * The report's bytes, without the report ID.
   */
  readonly data: DataView;
}

/**
 * A device the page was granted.
 */
export interface HidDevice {
  readonly opened: boolean;
  readonly productName: string;
  readonly collections: readonly HidCollectionInfo[];
  open: () => Promise<void>;
  close: () => Promise<void>;
  sendReport: (reportId: number, data: Uint8Array) => Promise<void>;
  addEventListener: (type: 'inputreport', listener: (event: HidInputReportEvent) => void) => void;
  removeEventListener: (type: 'inputreport', listener: (event: HidInputReportEvent) => void) => void;
}

/**
 * Narrows the browser's device picker.
 */
export interface HidDeviceFilter {
  readonly vendorId?: number;
  readonly productId?: number;
  readonly usagePage?: number;
  readonly usage?: number;
}

/**
 * A device being plugged in or taken away.
 */
export interface HidConnectionEvent {
  readonly device: HidDevice;
}

/**
 * `navigator.hid`.
 */
export interface Hid {
  requestDevice: (options: { filters: readonly HidDeviceFilter[] }) => Promise<HidDevice[]>;
  getDevices: () => Promise<HidDevice[]>;
  addEventListener: (type: 'disconnect', listener: (event: HidConnectionEvent) => void) => void;
}
