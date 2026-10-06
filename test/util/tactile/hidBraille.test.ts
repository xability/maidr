import type { HidCollectionInfo, HidReportItem } from '@type/hid';
import type { HidKey } from '@util/tactile/hidBraille';
import { describe, expect, it } from '@jest/globals';
import { BrailleUsage, HidBraille } from '@util/tactile/hidBraille';

/**
 * Tests for `src/util/tactile/hidBraille.ts`, which reads where a HID braille
 * display keeps its cells and keys out of WebHID's parse of its descriptor.
 *
 * The collections below are shaped the way Chromium hands them over, which is
 * the part that is easy to get wrong: every item is listed under its own
 * collection and again under each collection around it, so the top-level
 * collection carries a report's items in declaration order, while the reports
 * themselves come in no particular order. A display that puts each row in a
 * report of its own is the case that shows the difference.
 */

const BRAILLE_DISPLAY = { usagePage: 0x41, usage: 0x01 } as const;
const BRAILLE_ROW = { usagePage: 0x41, usage: 0x02 } as const;

/**
 * A run of eight-dot cells, as `Usage (8 Dot Braille Cell)` with a report
 * count declares it.
 * @param cells - Cells in the run
 * @param usage - The cell usage; six-dot cells are declared with their own
 */
function cellItem(cells: number, usage: number = BrailleUsage.eightDotCell): HidReportItem {
  return { usages: [usage], reportSize: 8, reportCount: cells, logicalMinimum: 0, logicalMaximum: 255 };
}

/**
 * Padding: bits that are there and carry nothing.
 * @param bits - How many
 */
function padding(bits: number): HidReportItem {
  return { isConstant: true, reportSize: bits, reportCount: 1 };
}

/**
 * One-bit keys, one per usage.
 * @param usages - The keys, in the order their bits come
 */
function keyBits(usages: number[]): HidReportItem {
  return { usages, reportSize: 1, reportCount: usages.length, logicalMinimum: 0, logicalMaximum: 1 };
}

/**
 * A display whose rows are all in one report, each in a Braille Row
 * collection of its own -- the shape the HID braille standard's sample takes.
 * @param rows - Rows of cells
 * @param cells - Cells in each row
 */
function oneReportDisplay(rows: number, cells: number): HidCollectionInfo[] {
  const rowItems = Array.from({ length: rows }, () => cellItem(cells));
  return [{
    ...BRAILLE_DISPLAY,
    outputReports: [{ reportId: 2, items: rowItems }],
    inputReports: [{
      reportId: 1,
      items: [
        keyBits([BrailleUsage.dPadUp, BrailleUsage.dPadDown, BrailleUsage.dPadLeft, BrailleUsage.dPadRight]),
        keyBits([BrailleUsage.panLeft, BrailleUsage.panRight]),
        padding(2),
      ],
    }],
    children: rowItems.map(item => ({ ...BRAILLE_ROW, outputReports: [{ reportId: 2, items: [item] }] })),
  }];
}

const FACE_CONTROLS = { usagePage: 0x41, usage: 0x20C } as const;
const LEFT_CONTROLS = { usagePage: 0x41, usage: 0x20D } as const;
const RIGHT_CONTROLS = { usagePage: 0x41, usage: 0x20E } as const;
const D_PAD = [BrailleUsage.dPadUp, BrailleUsage.dPadDown, BrailleUsage.dPadLeft, BrailleUsage.dPadRight];

/**
 * A display with a D-pad on each side, reported the way a Monarch reports
 * them: the same four usages twice in one input report, under right controls
 * and then under left controls.
 * @param unclaimed - Keys declared ahead of both pads, outside any control
 * collection
 */
function twoPadDisplay(unclaimed: number[] = []): HidCollectionInfo[] {
  const right = keyBits(D_PAD);
  const left = keyBits(D_PAD);
  const keyboard = keyBits([BrailleUsage.keyboardDot1, BrailleUsage.keyboardSpace]);
  const ahead = unclaimed.length > 0 ? [keyBits(unclaimed)] : [];
  return [{
    ...BRAILLE_DISPLAY,
    outputReports: [{ reportId: 2, items: [cellItem(32)] }],
    inputReports: [{ reportId: 0x20, items: [...ahead, right, left, keyboard] }],
    children: [
      { ...RIGHT_CONTROLS, inputReports: [{ reportId: 0x20, items: [right] }] },
      { ...LEFT_CONTROLS, inputReports: [{ reportId: 0x20, items: [left] }] },
      { ...FACE_CONTROLS, inputReports: [{ reportId: 0x20, items: [keyboard] }] },
    ],
  }];
}

/**
 * The usages of a set of keys, whichever side each is on.
 * @param keys - The keys
 */
function usagesOf(keys: readonly HidKey[]): Set<number> {
  return new Set(keys.map(key => key.usage));
}

/**
 * Bytes as a DataView, the way an input report arrives.
 * @param bytes - The report's data
 */
function view(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('HidBraille', () => {
  describe('isBrailleDisplay', () => {
    it('should recognise a device by its collection on the braille page', () => {
      expect(HidBraille.isBrailleDisplay(oneReportDisplay(1, 40))).toBe(true);
    });

    it('should not take a keyboard for a braille display', () => {
      const keyboard: HidCollectionInfo[] = [{ usagePage: 0x01, usage: 0x06 }];

      expect(HidBraille.isBrailleDisplay(keyboard)).toBe(false);
    });
  });

  describe('layout', () => {
    it('should read every row of a multi-line display, top to bottom', () => {
      const layout = HidBraille.layout(oneReportDisplay(8, 32));

      expect(layout?.rows).toHaveLength(8);
      expect(layout?.totalCells).toBe(256);
      expect(layout?.rows.map(row => row.bitOffset)).toEqual([0, 256, 512, 768, 1024, 1280, 1536, 1792]);
      expect(layout?.rows.every(row => row.reportId === 2 && row.cells === 32 && row.dots === 8)).toBe(true);
      expect(layout?.outputLengths.get(2)).toBe(256);
    });

    it('should place a row after the padding declared before it', () => {
      // A field's place in its report is the sum of everything declared before
      // it, padding included; skipping the padding writes every cell one byte
      // early.
      const collections: HidCollectionInfo[] = [{
        ...BRAILLE_DISPLAY,
        outputReports: [{ reportId: 0, items: [padding(8), cellItem(20)] }],
      }];

      const layout = HidBraille.layout(collections);

      expect(layout?.rows).toEqual([{ reportId: 0, bitOffset: 8, cells: 20, dots: 8 }]);
      expect(layout?.outputLengths.get(0)).toBe(21);
    });

    it('should order rows by their row collections when each has a report of its own', () => {
      // Chromium keeps a collection's reports in a hash map, so the top-level
      // list comes out in no particular order. The row collections, which are
      // in declaration order, are what say which report is the top row.
      const rowIds = [7, 3, 5];
      const collections: HidCollectionInfo[] = [{
        ...BRAILLE_DISPLAY,
        outputReports: [3, 5, 7].map(reportId => ({ reportId, items: [cellItem(32)] })),
        children: rowIds.map(reportId => ({ ...BRAILLE_ROW, outputReports: [{ reportId, items: [cellItem(32)] }] })),
      }];

      const layout = HidBraille.layout(collections);

      expect(layout?.rows.map(row => row.reportId)).toEqual([7, 3, 5]);
    });

    it('should read cells declared outside any row collection, by report', () => {
      const collections: HidCollectionInfo[] = [{
        ...BRAILLE_DISPLAY,
        outputReports: [
          { reportId: 4, items: [cellItem(32)] },
          { reportId: 3, items: [cellItem(32), cellItem(32)] },
        ],
      }];

      const layout = HidBraille.layout(collections);

      expect(layout?.rows.map(row => [row.reportId, row.bitOffset])).toEqual([[3, 0], [3, 256], [4, 0]]);
    });

    it('should read a row declared by a usage range', () => {
      const collections: HidCollectionInfo[] = [{
        ...BRAILLE_DISPLAY,
        outputReports: [{
          reportId: 0,
          items: [{
            isRange: false,
            usageMinimum: BrailleUsage.eightDotCell,
            usageMaximum: BrailleUsage.eightDotCell,
            reportSize: 8,
            reportCount: 14,
          }],
        }],
      }];

      expect(HidBraille.layout(collections)?.totalCells).toBe(14);
    });

    it('should say which rows have six dots', () => {
      const collections: HidCollectionInfo[] = [{
        ...BRAILLE_DISPLAY,
        outputReports: [{ reportId: 0, items: [cellItem(40, BrailleUsage.sixDotCell)] }],
      }];

      expect(HidBraille.layout(collections)?.rows[0].dots).toBe(6);
    });

    it('should find no layout on a device with no braille cells', () => {
      const collections: HidCollectionInfo[] = [{ ...BRAILLE_DISPLAY, inputReports: [{ reportId: 1, items: [keyBits([BrailleUsage.panLeft])] }] }];

      expect(HidBraille.layout(collections)).toBeNull();
    });

    it('should ignore cells on another usage page', () => {
      const collections: HidCollectionInfo[] = [{ usagePage: 0xFF00, usage: 1, outputReports: [{ reportId: 0, items: [cellItem(40)] }] }];

      expect(HidBraille.layout(collections)).toBeNull();
    });
  });

  describe('outputReports', () => {
    it('should put each cell in its row, in order', () => {
      const layout = HidBraille.layout(oneReportDisplay(2, 3));
      if (layout === null) {
        throw new Error('no layout');
      }

      const reports = HidBraille.outputReports(layout, Uint8Array.from([1, 2, 3, 4, 5, 6]));

      expect(Array.from(reports.get(2) ?? [])).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should leave padding and missing cells blank', () => {
      const layout = HidBraille.layout([{
        ...BRAILLE_DISPLAY,
        outputReports: [{ reportId: 0, items: [padding(8), cellItem(3)] }],
      }]);
      if (layout === null) {
        throw new Error('no layout');
      }

      const reports = HidBraille.outputReports(layout, Uint8Array.from([0xFF]));

      expect(Array.from(reports.get(0) ?? [])).toEqual([0, 0xFF, 0, 0]);
    });

    it('should drop dots 7 and 8 from six-dot cells', () => {
      const layout = HidBraille.layout([{
        ...BRAILLE_DISPLAY,
        outputReports: [{ reportId: 0, items: [cellItem(1, BrailleUsage.sixDotCell)] }],
      }]);
      if (layout === null) {
        throw new Error('no layout');
      }

      const reports = HidBraille.outputReports(layout, Uint8Array.from([0xFF]));

      expect(Array.from(reports.get(0) ?? [])).toEqual([0x3F]);
    });

    it('should write each row to its own report', () => {
      const collections: HidCollectionInfo[] = [{
        ...BRAILLE_DISPLAY,
        outputReports: [3, 4].map(reportId => ({ reportId, items: [cellItem(2)] })),
        children: [4, 3].map(reportId => ({ ...BRAILLE_ROW, outputReports: [{ reportId, items: [cellItem(2)] }] })),
      }];
      const layout = HidBraille.layout(collections);
      if (layout === null) {
        throw new Error('no layout');
      }

      const reports = HidBraille.outputReports(layout, Uint8Array.from([1, 2, 3, 4]));

      // Report 4 is the top row, because its row collection is declared first.
      expect(Array.from(reports.get(4) ?? [])).toEqual([1, 2]);
      expect(Array.from(reports.get(3) ?? [])).toEqual([3, 4]);
    });
  });

  describe('pressed', () => {
    it('should read keys reported one bit each', () => {
      const layout = HidBraille.layout(oneReportDisplay(1, 32));
      if (layout === null) {
        throw new Error('no layout');
      }

      // Bit 2 is D-pad left and bit 5 is pan right.
      const down = HidBraille.pressed(layout, 1, view([0b0010_0100]));

      expect(usagesOf(down)).toEqual(new Set([BrailleUsage.dPadLeft, BrailleUsage.panRight]));
    });

    it('should read nothing from another report', () => {
      const layout = HidBraille.layout(oneReportDisplay(1, 32));
      if (layout === null) {
        throw new Error('no layout');
      }

      expect(HidBraille.pressed(layout, 9, view([0xFF]))).toEqual([]);
    });

    it('should read keys reported by a usage range', () => {
      const layout = HidBraille.layout([{
        ...BRAILLE_DISPLAY,
        outputReports: [{ reportId: 0, items: [cellItem(32)] }],
        inputReports: [{
          reportId: 0,
          items: [{
            isRange: true,
            usageMinimum: BrailleUsage.dPadUp,
            usageMaximum: BrailleUsage.dPadRight,
            reportSize: 1,
            reportCount: 4,
          }, padding(4)],
        }],
      }]);
      if (layout === null) {
        throw new Error('no layout');
      }

      expect(usagesOf(HidBraille.pressed(layout, 0, view([0b1000])))).toEqual(new Set([BrailleUsage.dPadRight]));
    });

    it('should read keys reported as a list of what is down', () => {
      // Two slots, each holding the index of a key that is down; 0 is none,
      // since the list starts at a logical minimum of 1.
      const layout = HidBraille.layout([{
        ...BRAILLE_DISPLAY,
        outputReports: [{ reportId: 0, items: [cellItem(32)] }],
        inputReports: [{
          reportId: 0,
          items: [{
            isArray: true,
            usages: [BrailleUsage.panLeft, BrailleUsage.panRight, BrailleUsage.rockerUp],
            reportSize: 8,
            reportCount: 2,
            logicalMinimum: 1,
            logicalMaximum: 3,
          }],
        }],
      }]);
      if (layout === null) {
        throw new Error('no layout');
      }

      expect(HidBraille.pressed(layout, 0, view([3, 0]))).toEqual([{ usage: BrailleUsage.rockerUp, side: null }]);
    });

    it('should read a report shorter than its layout as nothing pressed past its end', () => {
      const layout = HidBraille.layout(oneReportDisplay(1, 32));
      if (layout === null) {
        throw new Error('no layout');
      }

      expect(HidBraille.pressed(layout, 1, view([]))).toEqual([]);
    });

    it('should tell two D-pads apart by the side each is declared on', () => {
      const layout = HidBraille.layout(twoPadDisplay());
      if (layout === null) {
        throw new Error('no layout');
      }

      // Bit 0 is up on the right pad, bit 4 up on the left: the right pad is
      // declared first, as a Monarch declares it.
      const right = HidBraille.pressed(layout, 0x20, view([0b0000_0001]));
      const left = HidBraille.pressed(layout, 0x20, view([0b0001_0000]));

      expect(right).toEqual([{ usage: BrailleUsage.dPadUp, side: 'right' }]);
      expect(left).toEqual([{ usage: BrailleUsage.dPadUp, side: 'left' }]);
    });

    it('should give a key declared once the side of its collection', () => {
      const layout = HidBraille.layout(twoPadDisplay());
      if (layout === null) {
        throw new Error('no layout');
      }

      // Bit 8 is dot 1 on the keyboard, under face controls.
      expect(HidBraille.pressed(layout, 0x20, view([0, 0b0000_0001])))
        .toEqual([{ usage: BrailleUsage.keyboardDot1, side: 'face' }]);
    });

    it('should give no side to a usage that is also declared outside the control collections', () => {
      // Three D-pad ups and two declarations: which bit belongs to which
      // collection is no longer known, and a guessed side could be the other
      // pad's.
      const layout = HidBraille.layout(twoPadDisplay([BrailleUsage.dPadUp]));
      if (layout === null) {
        throw new Error('no layout');
      }

      const sides = layout.buttonBits.filter(bit => bit.usage === BrailleUsage.dPadUp).map(bit => bit.side);

      expect(sides).toEqual([null, null, null]);
    });
  });
});
