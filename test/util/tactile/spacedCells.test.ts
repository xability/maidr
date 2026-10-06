import type { SpacedCellLayout } from '@util/tactile/spacedCells';
import { describe, expect, it } from '@jest/globals';
import { DotRaster } from '@util/tactile/raster';
import { SpacedCells } from '@util/tactile/spacedCells';

/**
 * Tests for `src/util/tactile/spacedCells.ts`, which reads a picture drawn on a
 * Monarch's 96 by 40 pins into the braille cells Braille Terminal shows on
 * them.
 *
 * Two things are pinned. The dot order, because the HID braille standard
 * numbers a cell's dots down the left column and then the right, with 7 and 8
 * last -- not the order a DotPad's graphic mode packs pins in -- and a cell
 * packed in the wrong one draws a mirror of the picture with no error
 * anywhere. And the gaps: a cell is three pins wide with the third always down,
 * so a line drawn on that third pin must be felt beside it rather than lost.
 */

/**
 * Eight lines of eight-dot cells on a Monarch: three pins a cell, five a line.
 */
const EIGHT_LINES: SpacedCellLayout = { columns: 32, lines: 8, dotRows: 4, pitchX: 3, pitchY: 5 };

/**
 * Ten lines of six-dot cells: four pins a line, the fourth a gap.
 */
const TEN_SIX_DOT_LINES: SpacedCellLayout = { columns: 32, lines: 10, dotRows: 3, pitchX: 3, pitchY: 4 };

/**
 * A Monarch-sized picture with the given pins raised.
 * @param pins - The pins, as [x, y]
 */
function picture(pins: [number, number][]): DotRaster {
  const raster = new DotRaster(96, 40);
  for (const [x, y] of pins) {
    raster.set(x, y);
  }
  return raster;
}

describe('SpacedCells', () => {
  it('should span the Monarch\'s 96 pins with 32 cells', () => {
    expect(SpacedCells.pinWidth(EIGHT_LINES)).toBe(96);
  });

  it('should number the dots as braille does', () => {
    // Dots 1, 2, 3 and 7 down the left of the first cell, 4, 5, 6 and 8 down
    // its right: bit 0 is dot 1 and bit 7 is dot 8.
    const dots: [[number, number], number][] = [
      [[0, 0], 0x01],
      [[0, 1], 0x02],
      [[0, 2], 0x04],
      [[0, 3], 0x40],
      [[1, 0], 0x08],
      [[1, 1], 0x10],
      [[1, 2], 0x20],
      [[1, 3], 0x80],
    ];

    for (const [pin, bit] of dots) {
      expect(SpacedCells.fold(picture([pin]), EIGHT_LINES, 1)[0]).toBe(bit);
    }
  });

  it('should find a pin in the cell and line it sits on', () => {
    // x 31 is the second column of cell 10; y 12 is the third row of line 2.
    const cells = SpacedCells.fold(picture([[31, 12]]), EIGHT_LINES, 3);

    expect(cells[2 * 32 + 10]).toBe(0x20);
    expect(cells.filter(cell => cell !== 0)).toHaveLength(1);
  });

  it('should fold a pin between cells into the cell\'s right-hand dots', () => {
    // x 2 is the always-down column after the first cell.
    const cells = SpacedCells.fold(picture([[2, 0]]), EIGHT_LINES, 1);

    expect(cells[0]).toBe(0x08);
  });

  it('should fold a pin between lines into the line\'s bottom dots', () => {
    // y 4 is the gap row under the first line.
    const cells = SpacedCells.fold(picture([[0, 4]]), EIGHT_LINES, 1);

    expect(cells[0]).toBe(0x40);
  });

  it('should keep a vertical line that falls on a gap', () => {
    const line: [number, number][] = Array.from({ length: 10 }, (_, y) => [5, y]);

    const cells = SpacedCells.fold(picture(line), EIGHT_LINES, 2);

    // Felt one pin to the left, in the right-hand dots of the second cell of
    // both lines, rather than gone.
    expect(cells[1]).toBe(0x08 | 0x10 | 0x20 | 0x80);
    expect(cells[32 + 1]).toBe(0x08 | 0x10 | 0x20 | 0x80);
  });

  it('should read six-dot cells with no dots 7 and 8', () => {
    // y 3 is the gap row of a six-dot line, folded into dot 3.
    const cells = SpacedCells.fold(picture([[0, 3], [1, 2]]), TEN_SIX_DOT_LINES, 1);

    expect(cells[0]).toBe(0x04 | 0x20);
  });

  it('should read only the lines asked for', () => {
    const cells = SpacedCells.fold(picture([[0, 39]]), EIGHT_LINES, 7);

    expect(cells).toHaveLength(7 * 32);
    expect(cells.every(cell => cell === 0)).toBe(true);
  });

  it('should read cells with no space between them as plain blocks of pins', () => {
    // A pitch of two by four leaves no gap pins to fold, which is how the
    // Monarch's pin array packs its pins.
    const blocks: SpacedCellLayout = { columns: 48, lines: 10, dotRows: 4, pitchX: 2, pitchY: 4 };

    const cells = SpacedCells.fold(picture([[2, 0], [3, 3], [95, 39]]), blocks, 10);

    expect(cells[1]).toBe(0x01 | 0x80);
    expect(cells[10 * 48 - 1]).toBe(0x80);
    expect(cells.filter(cell => cell !== 0)).toHaveLength(2);
  });

  describe('draw', () => {
    it('should put each dot of a cell on the pin it sits on', () => {
      const raster = new DotRaster(96, 40);

      SpacedCells.draw(raster, EIGHT_LINES, Uint8Array.from([0x01 | 0x20 | 0x80]), 0);

      expect(raster.get(0, 0)).toBe(true);
      expect(raster.get(1, 2)).toBe(true);
      expect(raster.get(1, 3)).toBe(true);
      expect(raster.raisedCount).toBe(3);
    });

    it('should space the cells along their line and start on the line asked for', () => {
      const raster = new DotRaster(96, 40);

      SpacedCells.draw(raster, EIGHT_LINES, Uint8Array.from([0, 0x01]), 7);

      // The second cell of the eighth line: three pins along, 35 down.
      expect(raster.get(3, 35)).toBe(true);
      expect(raster.raisedCount).toBe(1);
    });

    it('should give back from fold what it drew', () => {
      const raster = new DotRaster(96, 40);
      const cells = Uint8Array.from(Array.from({ length: 32 }, (_, cell) => (cell * 37) & 0xFF));

      SpacedCells.draw(raster, EIGHT_LINES, cells, 2);

      expect(Array.from(SpacedCells.fold(raster, EIGHT_LINES, 3).subarray(64))).toEqual(Array.from(cells));
    });
  });
});
