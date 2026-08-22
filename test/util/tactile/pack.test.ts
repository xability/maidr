/**
 * Tests for `src/util/tactile/pack.ts`, the last step before bytes leave for a
 * DotPad.
 *
 * The DotPad speaks two bit orders and neither one is self-describing. Graphic
 * mode numbers the bits by physical pin position inside a cell — the low nibble
 * is the left column read top to bottom, the high nibble the right column — and
 * text mode uses the dot order Unicode's Braille Patterns block encodes, where
 * bit 0 is dot 1. The two differ only by a permutation of `0x08`, `0x10`,
 * `0x20` and `0x40`, and the device accepts either payload in either mode
 * without complaint. A payload packed for the wrong mode, or emitted in the
 * wrong cell order, therefore still raises pins and still draws a picture — the
 * wrong picture, with nothing on the wire, in a log, or on the screen to say
 * so. The only reader is a fingertip, and a fingertip has no way to tell a
 * scrambled chart from a chart of scrambled data.
 *
 * So the tests below pin the bit rule and the cell order from the outside.
 * The anchor is the 300-byte graphic sample that ships in the DotPad SDK's own
 * demo app: it is decoded here with an independently written copy of the
 * documented bit rule, re-packed by `DotPack.graphic` at 30x10 cells, and
 * required to come back byte for byte. Any transposition of the bit table, any
 * column-major cell walk, and any other cell geometry breaks that round trip.
 * The structural assertions that follow it exist so a reader can see what the
 * sample is — a crosshair over a dotted grid — and check the 60x40 pin geometry
 * claim without decoding 600 hex characters by hand.
 *
 * The rest cover the arithmetic around the edges: per-pin bit weights, the
 * row-major cell walk, single-row updates agreeing with the full frame, the
 * changed-row diff that keeps a navigation move down to one line of hardware
 * acknowledgements, cropping and padding a raster sized for a different DotPad
 * model, and the text-mode rule that an out-of-block character becomes a blank
 * cell rather than garbage dots.
 */

import { describe, expect, it } from '@jest/globals';
import { DotPack } from '@util/tactile/pack';
import { DotRaster } from '@util/tactile/raster';

/**
 * The full-screen graphic sample from the DotPad SDK demo application, copied
 * verbatim from `Web/3.0.2/DemoApp/src/App.tsx` line 7, where it is the
 * `CELL300_GRAPHIC_FULL` constant the demo sends to a 300-cell device.
 *
 * 300 bytes, one per braille cell, laid out as 30 cells across by 10 down —
 * 60 pins wide by 40 pins tall.
 */
const CELL300_GRAPHIC_FULL = '0002200002200002200002200042f22f24000220000220000220000220000009900009900009900009900009f88f9000099000099000099000099000000440000440000440404e400004f00f40000440000440000440000440000002200002200002200002200002f00f2000022000022020272000022000888998888998888998888998888df88f988889988889988889988889a88c111991111991111991111991111bf11f91111991111991111991111951130004400004400004400004400004f00f40000440000440000440000440000002200002200002200002200002f00f20000a20000220000220000220000009900009900009900009d80809f00f90101b90000990000990000990000004400004400004400004500004f00f4000044000044000044000044000';

const GOLDEN_CELL_COLUMNS = 30;
const GOLDEN_CELL_ROWS = 10;

/**
 * Bit weight of each pin within a graphic-mode cell, indexed `[column][row]`.
 *
 * Restated from the DotPad documentation rather than imported from the module
 * under test, so the decode below is an independent statement of the rule the
 * round trip is pinning. Importing the production table would let a transposed
 * table decode and re-encode to itself and pass.
 */
const GRAPHIC_BITS: readonly (readonly number[])[] = [
  [0x01, 0x02, 0x04, 0x08],
  [0x10, 0x20, 0x40, 0x80],
];

/**
 * Builds a pin buffer from a graphic-mode hex payload — the inverse of
 * `DotPack.graphic`, written out longhand.
 * @param hex - Graphic-mode payload, two hex digits per cell
 * @param cellColumns - Cells across
 * @param cellRows - Cells down
 */
function decodeGraphic(hex: string, cellColumns: number, cellRows: number): DotRaster {
  const raster = new DotRaster(
    cellColumns * DotPack.PINS_PER_CELL_X,
    cellRows * DotPack.PINS_PER_CELL_Y,
  );

  for (let cellRow = 0; cellRow < cellRows; cellRow++) {
    for (let cellColumn = 0; cellColumn < cellColumns; cellColumn++) {
      const offset = (cellRow * cellColumns + cellColumn) * 2;
      const byte = Number.parseInt(hex.slice(offset, offset + 2), 16);
      for (let column = 0; column < DotPack.PINS_PER_CELL_X; column++) {
        for (let row = 0; row < DotPack.PINS_PER_CELL_Y; row++) {
          if ((byte & GRAPHIC_BITS[column][row]) !== 0) {
            raster.set(
              cellColumn * DotPack.PINS_PER_CELL_X + column,
              cellRow * DotPack.PINS_PER_CELL_Y + row,
              true,
            );
          }
        }
      }
    }
  }

  return raster;
}

/**
 * Builds a single-cell raster with one pin raised.
 * @param x - Dot column within the cell
 * @param y - Dot row within the cell
 */
function singlePinCell(x: number, y: number): DotRaster {
  const raster = new DotRaster(DotPack.PINS_PER_CELL_X, DotPack.PINS_PER_CELL_Y);
  raster.set(x, y, true);
  return raster;
}

describe('dotPack.graphic against the vendor sample', () => {
  it('should re-pack the SDK demo pattern byte for byte at 30 by 10 cells', () => {
    const raster = decodeGraphic(CELL300_GRAPHIC_FULL, GOLDEN_CELL_COLUMNS, GOLDEN_CELL_ROWS);

    const packed = DotPack.graphic(raster, GOLDEN_CELL_COLUMNS, GOLDEN_CELL_ROWS);

    expect(packed).toBe(CELL300_GRAPHIC_FULL);
  });

  it('should decode the sample onto a 60 by 40 pin buffer', () => {
    const raster = decodeGraphic(CELL300_GRAPHIC_FULL, GOLDEN_CELL_COLUMNS, GOLDEN_CELL_ROWS);

    const size = { width: raster.width, height: raster.height };

    expect(size).toEqual({ width: 60, height: 40 });
  });

  it('should raise every pin of the crosshair vertical axis at x of 29 and 30', () => {
    const raster = decodeGraphic(CELL300_GRAPHIC_FULL, GOLDEN_CELL_COLUMNS, GOLDEN_CELL_ROWS);

    const lowered: string[] = [];
    for (let y = 0; y < raster.height; y++) {
      if (!raster.get(29, y)) {
        lowered.push(`(29,${y})`);
      }
      if (!raster.get(30, y)) {
        lowered.push(`(30,${y})`);
      }
    }

    expect(lowered).toEqual([]);
  });

  it('should raise every pin of the crosshair horizontal axis at y of 19 and 20', () => {
    const raster = decodeGraphic(CELL300_GRAPHIC_FULL, GOLDEN_CELL_COLUMNS, GOLDEN_CELL_ROWS);

    const lowered: string[] = [];
    for (let x = 0; x < raster.width; x++) {
      if (!raster.get(x, 19)) {
        lowered.push(`(${x},19)`);
      }
      if (!raster.get(x, 20)) {
        lowered.push(`(${x},20)`);
      }
    }

    expect(lowered).toEqual([]);
  });
});

describe('dotPack.graphic bit weights within a cell', () => {
  it.each([
    { label: 'left column, top pin', x: 0, y: 0, expected: '01' },
    { label: 'right column, top pin', x: 1, y: 0, expected: '10' },
    { label: 'left column, second pin', x: 0, y: 1, expected: '02' },
    { label: 'right column, second pin', x: 1, y: 1, expected: '20' },
    { label: 'left column, third pin', x: 0, y: 2, expected: '04' },
    { label: 'right column, third pin', x: 1, y: 2, expected: '40' },
    { label: 'left column, fourth pin', x: 0, y: 3, expected: '08' },
    { label: 'right column, fourth pin', x: 1, y: 3, expected: '80' },
  ])('should pack the $label at ($x,$y) as $expected', ({ x, y, expected }) => {
    const raster = singlePinCell(x, y);

    const packed = DotPack.graphic(raster, 1, 1);

    expect(packed).toBe(expected);
  });

  it('should pack a cell with every pin raised as ff', () => {
    const raster = new DotRaster(DotPack.PINS_PER_CELL_X, DotPack.PINS_PER_CELL_Y);
    raster.fillRect(0, 0, DotPack.PINS_PER_CELL_X - 1, DotPack.PINS_PER_CELL_Y - 1, true);

    const packed = DotPack.graphic(raster, 1, 1);

    expect(packed).toBe('ff');
  });

  it('should pack a cell with every pin lowered as 00', () => {
    const raster = new DotRaster(DotPack.PINS_PER_CELL_X, DotPack.PINS_PER_CELL_Y);

    const packed = DotPack.graphic(raster, 1, 1);

    expect(packed).toBe('00');
  });
});

describe('dotPack.graphic cell ordering', () => {
  it('should emit cells row-major, putting the second cell of the top row in the second byte', () => {
    const raster = new DotRaster(4, 8);
    raster.set(2, 0, true);

    const packed = DotPack.graphic(raster, 2, 2);

    expect(packed).toBe('00010000');
  });

  it('should place the first cell of the second row in the third byte', () => {
    const raster = new DotRaster(4, 8);
    raster.set(0, 4, true);

    const packed = DotPack.graphic(raster, 2, 2);

    expect(packed).toBe('00000100');
  });
});

describe('dotPack.graphicRow', () => {
  it('should return exactly cellColumns bytes', () => {
    const raster = new DotRaster(8, 8);
    raster.fillRect(0, 0, 7, 7, true);

    const packed = DotPack.graphicRow(raster, 0, 4);

    expect(packed).toHaveLength(8);
  });

  it('should match the corresponding slice of the full graphic payload for every row', () => {
    const cellColumns = 4;
    const cellRows = 3;
    const raster = new DotRaster(8, 12);
    raster.strokeRect(1, 1, 6, 10, true);
    raster.line(0, 0, 7, 11, true);
    const full = DotPack.graphic(raster, cellColumns, cellRows);

    const rows = [
      DotPack.graphicRow(raster, 0, cellColumns),
      DotPack.graphicRow(raster, 1, cellColumns),
      DotPack.graphicRow(raster, 2, cellColumns),
    ];

    expect(rows).toEqual([
      full.slice(0, 8),
      full.slice(8, 16),
      full.slice(16, 24),
    ]);
    expect(rows.join('')).toBe(full);
  });

  it('should pack a row past the bottom of the raster as lowered pins', () => {
    const raster = new DotRaster(4, 4);
    raster.fillRect(0, 0, 3, 3, true);

    const packed = DotPack.graphicRow(raster, 1, 2);

    expect(packed).toBe('0000');
  });
});

describe('dotPack.changedRows', () => {
  it('should report no rows when the two frames are identical', () => {
    const previous = new DotRaster(8, 16);
    previous.fillEllipse(4, 8, 3, 5, true);
    const next = previous.clone();

    const changed = DotPack.changedRows(previous, next, 4);

    expect(changed).toEqual([]);
  });

  it('should report only the cell row containing the changed pins', () => {
    const previous = new DotRaster(8, 16);
    const next = previous.clone();
    next.set(5, 9, true);

    const changed = DotPack.changedRows(previous, next, 4);

    expect(changed).toEqual([2]);
  });

  it('should report every changed cell row in ascending order', () => {
    const previous = new DotRaster(8, 16);
    previous.set(0, 0, true);
    const next = previous.clone();
    next.set(0, 0, false);
    next.set(7, 13, true);

    const changed = DotPack.changedRows(previous, next, 4);

    expect(changed).toEqual([0, 3]);
  });

  it('should report the first and last cell rows when only their edge pins differ', () => {
    const previous = new DotRaster(8, 16);
    const next = previous.clone();
    next.set(0, 0, true);
    next.set(7, 15, true);

    const changed = DotPack.changedRows(previous, next, 4);

    expect(changed).toEqual([0, 3]);
  });

  it('should ignore a difference below the cell rows it was asked about', () => {
    const previous = new DotRaster(8, 16);
    const next = previous.clone();
    next.set(0, 12, true);

    const changed = DotPack.changedRows(previous, next, 3);

    expect(changed).toEqual([]);
  });

  it('should report nothing when asked about zero cell rows', () => {
    const previous = new DotRaster(8, 16);
    const next = previous.clone();
    next.fillRect(0, 0, 7, 15, true);

    const changed = DotPack.changedRows(previous, next, 0);

    expect(changed).toEqual([]);
  });
});

describe('dotPack.graphic cropping and padding', () => {
  it('should crop a raster wider and taller than the cell grid', () => {
    const raster = new DotRaster(8, 8);
    raster.set(0, 0, true);
    raster.set(4, 0, true);
    raster.set(0, 4, true);

    const packed = DotPack.graphic(raster, 2, 1);

    expect(packed).toBe('0100');
  });

  it('should pad a raster smaller than the cell grid with lowered pins', () => {
    const raster = new DotRaster(2, 2);
    raster.set(0, 0, true);
    raster.set(1, 1, true);

    const packed = DotPack.graphic(raster, 2, 2);

    expect(packed).toBe('21000000');
  });

  it.each([
    { label: 'a larger raster', width: 60, height: 40 },
    { label: 'an exactly sized raster', width: 8, height: 12 },
    { label: 'a smaller raster', width: 3, height: 2 },
  ])('should emit cellColumns * cellRows * 2 hex characters for $label', ({ width, height }) => {
    const cellColumns = 4;
    const cellRows = 3;
    const raster = new DotRaster(width, height);
    raster.fillRect(0, 0, width - 1, height - 1, true);

    const packed = DotPack.graphic(raster, cellColumns, cellRows);

    expect(packed).toHaveLength(cellColumns * cellRows * 2);
  });

  it('should emit an empty payload for a zero-cell grid', () => {
    const raster = new DotRaster(8, 8);
    raster.fillRect(0, 0, 7, 7, true);

    const packed = DotPack.graphic(raster, 0, 0);

    expect(packed).toBe('');
  });
});

describe('dotPack.brailleCells', () => {
  it('should pad a short cell list with blank cells', () => {
    const packed = DotPack.brailleCells([0x01, 0xFF], 4);

    expect(packed).toBe('01ff0000');
  });

  it('should crop a cell list longer than the line', () => {
    const packed = DotPack.brailleCells([0x01, 0x02, 0x03, 0x04], 2);

    expect(packed).toBe('0102');
  });

  it('should emit an entirely blank line for no cells at all', () => {
    const packed = DotPack.brailleCells([], 3);

    expect(packed).toBe('000000');
  });

  it('should emit nothing for a zero-cell line', () => {
    const packed = DotPack.brailleCells([0x01, 0x02], 0);

    expect(packed).toBe('');
  });
});

describe('dotPack.brailleUnicode', () => {
  it('should map the first braille pattern to 01', () => {
    const packed = DotPack.brailleUnicode('⠁', 1);

    expect(packed).toBe('01');
  });

  it('should map the all-dots braille pattern to ff', () => {
    const packed = DotPack.brailleUnicode('⣿', 1);

    expect(packed).toBe('ff');
  });

  it('should map the blank braille pattern to 00', () => {
    const packed = DotPack.brailleUnicode('⠀', 1);

    expect(packed).toBe('00');
  });

  it('should keep the dot order of a mixed run of braille characters', () => {
    const packed = DotPack.brailleUnicode('⠁⠃⠉⣿', 4);

    expect(packed).toBe('010309ff');
  });

  it.each([
    { label: 'an ASCII letter below the block', character: 'A' },
    { label: 'a code point just below the block', character: '⟿' },
    { label: 'a code point just above the block', character: '⤀' },
    { label: 'an astral emoji far above the block', character: '\u{1F600}' },
  ])('should emit a blank cell for $label rather than garbage dots', ({ character }) => {
    const packed = DotPack.brailleUnicode(character, 1);

    expect(packed).toBe('00');
  });

  it('should blank only the out-of-block character and keep its neighbours', () => {
    const packed = DotPack.brailleUnicode('⠁A⣿', 3);

    expect(packed).toBe('0100ff');
  });

  it('should pad a short braille string out to the full line', () => {
    const packed = DotPack.brailleUnicode('⠁', 3);

    expect(packed).toBe('010000');
  });

  it('should crop a braille string longer than the line', () => {
    const packed = DotPack.brailleUnicode('⠁⠃⠉', 2);

    expect(packed).toBe('0103');
  });

  it('should emit an entirely blank line for an empty string', () => {
    const packed = DotPack.brailleUnicode('', 2);

    expect(packed).toBe('0000');
  });
});
