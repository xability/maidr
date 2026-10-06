import type { HidCollectionInfo, HidReportInfo, HidReportItem } from '@type/hid';

/**
 * The HID Braille Display usage page (HUTRR78), and the usages on it this
 * module reads.
 */
const BRAILLE_PAGE = 0x41;
const BRAILLE_ROW = 0x02;

/**
 * Extended usages, the usage page in the high sixteen bits, as WebHID reports
 * them.
 */
export const BrailleUsage = {
  eightDotCell: 0x41_0003,
  sixDotCell: 0x41_0004,
  joystickUp: 0x41_0211,
  joystickDown: 0x41_0212,
  joystickLeft: 0x41_0213,
  joystickRight: 0x41_0214,
  dPadUp: 0x41_0216,
  dPadDown: 0x41_0217,
  dPadLeft: 0x41_0218,
  dPadRight: 0x41_0219,
  panLeft: 0x41_021A,
  panRight: 0x41_021B,
  rockerUp: 0x41_021C,
  rockerDown: 0x41_021D,
} as const;

/**
 * One row of braille cells, as one output report carries it.
 */
export interface HidBrailleRow {
  /**
   * The report the row is sent in; zero when the device does not number its
   * reports.
   */
  readonly reportId: number;

  /**
   * Where the row's first cell starts, in bits from the start of the report's
   * data.
   */
  readonly bitOffset: number;

  /**
   * Cells in the row.
   */
  readonly cells: number;

  /**
   * Dots in each cell.
   */
  readonly dots: 6 | 8;
}

/**
 * A key the device reports as a bit of its own.
 */
export interface HidButtonBit {
  readonly reportId: number;
  readonly bitOffset: number;
  readonly usage: number;
}

/**
 * Keys the device reports as a list: each field holds the index of one usage
 * that is down.
 */
export interface HidButtonArray {
  readonly reportId: number;
  readonly bitOffset: number;
  readonly size: number;
  readonly count: number;
  readonly item: HidReportItem;
}

/**
 * Where a HID braille display keeps its cells and its keys.
 */
export interface HidBrailleLayout {
  /**
   * The cell rows, top to bottom.
   */
  readonly rows: readonly HidBrailleRow[];

  /**
   * Cells on the whole display.
   */
  readonly totalCells: number;

  /**
   * Bytes in each output report that carries cells, by report ID.
   */
  readonly outputLengths: ReadonlyMap<number, number>;

  readonly buttonBits: readonly HidButtonBit[];
  readonly buttonArrays: readonly HidButtonArray[];
}

/**
 * A cell field found in an output report, before it is known which row it is.
 */
interface CellField {
  readonly bitOffset: number;
  readonly cells: number;
  readonly dots: 6 | 8;
}

/**
 * Reads the layout of a braille display that speaks the USB HID braille
 * standard, and writes and reads its reports.
 *
 * The standard leaves the report layout to the device: which report each row of
 * cells goes in, where in it, and how the keys are packed. A screen reader asks
 * the operating system, which parses the report descriptor; a page asks WebHID,
 * which hands over the same parse as collections of items. Everything here is
 * read from those, so a display that numbers its reports differently, or puts
 * its rows in one report or in several, is driven the same way.
 */
export abstract class HidBraille {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Reports whether a device describes itself as a braille display.
   * @param collections - The device's top-level collections
   */
  public static isBrailleDisplay(collections: readonly HidCollectionInfo[]): boolean {
    return collections.some(collection => collection.usagePage === BRAILLE_PAGE);
  }

  /**
   * Reads where a braille display keeps its cells and its keys.
   *
   * The rows come out top to bottom: in the order the descriptor declares its
   * Braille Row collections, which is the order a screen reader fills them.
   * WebHID lists a report's items under the top-level collection in the order
   * they are declared, which gives each cell field its place in its report,
   * but it does not keep the reports themselves in order; the row collections
   * are what say which field is which row. Cells declared outside any row
   * collection follow, by report ID.
   *
   * @param collections - The device's top-level collections
   * @returns The layout, or null when the device has no braille cells
   */
  public static layout(collections: readonly HidCollectionInfo[]): HidBrailleLayout | null {
    const displays = collections.filter(collection => collection.usagePage === BRAILLE_PAGE);

    const fields = new Map<number, CellField[]>();
    const outputLengths = new Map<number, number>();
    const buttonBits: HidButtonBit[] = [];
    const buttonArrays: HidButtonArray[] = [];
    for (const display of displays) {
      for (const report of display.outputReports ?? []) {
        const found = HidBraille.cellFields(report);
        if (found.fields.length > 0) {
          const reportId = report.reportId ?? 0;
          fields.set(reportId, found.fields);
          outputLengths.set(reportId, Math.ceil(found.bits / 8));
        }
      }
      for (const report of display.inputReports ?? []) {
        HidBraille.buttons(report, buttonBits, buttonArrays);
      }
    }
    if (fields.size === 0) {
      return null;
    }

    const rows: HidBrailleRow[] = [];
    const taken = new Map<number, number>();
    for (const reportId of displays.flatMap(display => HidBraille.rowReportIds(display))) {
      const index = taken.get(reportId) ?? 0;
      const field = fields.get(reportId)?.[index];
      if (field !== undefined) {
        taken.set(reportId, index + 1);
        rows.push({ reportId, ...field });
      }
    }
    for (const reportId of Array.from(fields.keys()).sort((a, b) => a - b)) {
      const remaining = (fields.get(reportId) ?? []).slice(taken.get(reportId) ?? 0);
      rows.push(...remaining.map(field => ({ reportId, ...field })));
    }

    return {
      rows,
      totalCells: rows.reduce((sum, row) => sum + row.cells, 0),
      outputLengths,
      buttonBits,
      buttonArrays,
    };
  }

  /**
   * Builds the output reports that put a set of cells on the display.
   *
   * @param layout - Where the display keeps its cells
   * @param cells - Every cell on the display, row after row, bit 0 being dot 1
   * @returns The data of each report, without its ID, by report ID
   */
  public static outputReports(layout: HidBrailleLayout, cells: Uint8Array): Map<number, Uint8Array> {
    const reports = new Map<number, Uint8Array>();
    for (const [reportId, length] of layout.outputLengths) {
      reports.set(reportId, new Uint8Array(length));
    }
    let next = 0;
    for (const row of layout.rows) {
      const data = reports.get(row.reportId);
      // A six-dot cell has no dots 7 and 8, and a device may refuse a value
      // above its logical maximum rather than ignore the extra bits.
      const mask = row.dots === 6 ? 0x3F : 0xFF;
      for (let cell = 0; cell < row.cells; cell++, next++) {
        if (data !== undefined) {
          HidBraille.writeBits(data, row.bitOffset + cell * 8, 8, (cells[next] ?? 0) & mask);
        }
      }
    }
    return reports;
  }

  /**
   * The keys an input report says are down.
   *
   * @param layout - Where the display keeps its keys
   * @param reportId - The report's ID
   * @param data - The report's bytes, without the ID
   * @returns The extended usages of every key held down
   */
  public static pressed(layout: HidBrailleLayout, reportId: number, data: DataView): Set<number> {
    const down = new Set<number>();
    for (const button of layout.buttonBits) {
      if (button.reportId === reportId && HidBraille.readBits(data, button.bitOffset, 1) === 1) {
        down.add(button.usage);
      }
    }
    for (const array of layout.buttonArrays) {
      if (array.reportId !== reportId) {
        continue;
      }
      for (let field = 0; field < array.count; field++) {
        const value = HidBraille.readBits(data, array.bitOffset + field * array.size, array.size);
        const usage = HidBraille.usageAt(array.item, value - (array.item.logicalMinimum ?? 0));
        if (usage !== null) {
          down.add(usage);
        }
      }
    }
    return down;
  }

  /**
   * The cell fields of one output report, and its length in bits.
   * @param report - The report, as the top-level collection lists it
   */
  private static cellFields(report: HidReportInfo): { fields: CellField[]; bits: number } {
    const fields: CellField[] = [];
    let bits = 0;
    for (const item of report.items ?? []) {
      const size = item.reportSize ?? 0;
      const count = item.reportCount ?? 0;
      const dots = HidBraille.cellDots(item);
      if (dots !== null && size === 8 && count > 0) {
        fields.push({ bitOffset: bits, cells: count, dots });
      }
      bits += size * count;
    }
    return { fields, bits };
  }

  /**
   * Gathers the keys of one input report.
   * @param report - The report, as the top-level collection lists it
   * @param bits - Collects the keys reported one bit each
   * @param arrays - Collects the keys reported as lists
   */
  private static buttons(report: HidReportInfo, bits: HidButtonBit[], arrays: HidButtonArray[]): void {
    const reportId = report.reportId ?? 0;
    let offset = 0;
    for (const item of report.items ?? []) {
      const size = item.reportSize ?? 0;
      const count = item.reportCount ?? 0;
      if (!item.isConstant && size > 0 && count > 0) {
        if (item.isArray) {
          arrays.push({ reportId, bitOffset: offset, size, count, item });
        } else if (size === 1) {
          for (let field = 0; field < count; field++) {
            const usage = HidBraille.usageAt(item, field);
            if (usage !== null) {
              bits.push({ reportId, bitOffset: offset + field, usage });
            }
          }
        }
      }
      offset += size * count;
    }
  }

  /**
   * The report IDs of the cell fields inside each Braille Row collection, in
   * the order the rows are declared.
   * @param collection - The collection to walk
   */
  private static rowReportIds(collection: HidCollectionInfo): number[] {
    if (collection.usagePage === BRAILLE_PAGE && collection.usage === BRAILLE_ROW) {
      return (collection.outputReports ?? []).flatMap(report =>
        HidBraille.cellFields(report).fields.map(() => report.reportId ?? 0),
      );
    }
    return (collection.children ?? []).flatMap(child => HidBraille.rowReportIds(child));
  }

  /**
   * Whether an item is a run of braille cells, and of how many dots.
   * @param item - The item to test
   */
  private static cellDots(item: HidReportItem): 6 | 8 | null {
    if (item.isConstant) {
      return null;
    }
    // Both forms are checked whatever `isRange` says: Chromium counts a
    // minimum equal to its maximum as no range, and then lists no usages
    // either, so a row declared that way is only found by its bounds.
    const names = (usage: number): boolean => (item.usages ?? []).includes(usage)
      || (item.usageMinimum !== undefined && item.usageMaximum !== undefined
        && item.usageMinimum <= usage && usage <= item.usageMaximum);
    if (names(BrailleUsage.eightDotCell)) {
      return 8;
    }
    if (names(BrailleUsage.sixDotCell)) {
      return 6;
    }
    return null;
  }

  /**
   * The usage of one field of an item, or null when it names none.
   *
   * Past the end of a usage list the last usage repeats, as the HID
   * specification has it; past the end of a range there is nothing.
   *
   * @param item - The item
   * @param index - The field, or for a list the index the field holds
   */
  private static usageAt(item: HidReportItem, index: number): number | null {
    if (index < 0) {
      return null;
    }
    const usages = item.usages ?? [];
    if (usages.length > 0) {
      return item.isArray
        ? usages[index] ?? null
        : usages[Math.min(index, usages.length - 1)];
    }
    if (item.usageMinimum === undefined || item.usageMaximum === undefined) {
      return null;
    }
    const usage = item.usageMinimum + index;
    return usage <= item.usageMaximum ? usage : null;
  }

  /**
   * Reads an unsigned field, least significant bit first.
   * @param data - The report's bytes
   * @param offset - Bits from the start
   * @param size - Bits in the field
   */
  private static readBits(data: DataView, offset: number, size: number): number {
    let value = 0;
    for (let bit = 0; bit < size; bit++) {
      const at = offset + bit;
      const byte = at >> 3;
      if (byte < data.byteLength && (data.getUint8(byte) >> (at & 7)) & 1) {
        value += 2 ** bit;
      }
    }
    return value;
  }

  /**
   * Writes an unsigned field, least significant bit first.
   * @param data - The report's bytes
   * @param offset - Bits from the start
   * @param size - Bits in the field
   * @param value - The value to write
   */
  private static writeBits(data: Uint8Array, offset: number, size: number, value: number): void {
    for (let bit = 0; bit < size; bit++) {
      const at = offset + bit;
      const byte = at >> 3;
      if (byte >= data.length) {
        return;
      }
      if ((value >> bit) & 1) {
        data[byte] |= 1 << (at & 7);
      } else {
        data[byte] &= ~(1 << (at & 7));
      }
    }
  }
}
