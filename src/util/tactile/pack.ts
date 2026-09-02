import type { DotRaster } from './raster';

/**
 * Packs pin buffers and braille cells into the hex payloads a DotPad expects.
 *
 * The device uses **two different bit orders**, one per display mode, and they
 * are not interchangeable:
 *
 * - Graphic mode numbers the bits by physical pin position within a cell —
 *   the low nibble is the left column top-to-bottom, the high nibble is the
 *   right column top-to-bottom.
 * - Text mode uses the standard braille dot order that Unicode's Braille
 *   Patterns block encodes, where bit 0 is dot 1 and bit 7 is dot 8.
 *
 * The two differ by a permutation of bits `0x08`, `0x10`, `0x20` and `0x40`, so
 * a payload packed for one mode is silently wrong in the other. They are kept
 * as separate functions here, with separate tests, rather than as one function
 * with a mode flag.
 */
export abstract class DotPack {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Pins across a single braille cell.
   */
  public static readonly PINS_PER_CELL_X = 2;

  /**
   * Pins down a single braille cell.
   */
  public static readonly PINS_PER_CELL_Y = 4;

  /**
   * Bit weight of each pin within a graphic-mode cell, indexed
   * `[column][row]`. Mirrors the SDK's own pin table.
   */
  private static readonly GRAPHIC_BITS: readonly (readonly number[])[] = [
    [0x01, 0x02, 0x04, 0x08],
    [0x10, 0x20, 0x40, 0x80],
  ];

  /**
   * Formats a byte as two lowercase hex digits.
   * @param value - Byte value
   */
  private static toHexByte(value: number): string {
    return (value & 0xFF).toString(16).padStart(2, '0');
  }

  /**
   * Packs a pin buffer into a graphic-mode hex payload.
   *
   * Cells are emitted in row-major order — the full top row of cells left to
   * right, then the next row down — which is the order the device scans them.
   * A raster larger than the cell grid is cropped; a smaller one is padded with
   * lowered pins, so a caller may hand over a buffer sized for a different
   * DotPad model without the payload length changing.
   *
   * @param raster - The pin buffer to pack
   * @param cellColumns - Cells across the device's graphic area
   * @param cellRows - Cells down the device's graphic area
   * @returns Hex string of `cellColumns * cellRows` bytes
   */
  public static graphic(raster: DotRaster, cellColumns: number, cellRows: number): string {
    let hex = '';
    for (let cellRow = 0; cellRow < cellRows; cellRow++) {
      for (let cellColumn = 0; cellColumn < cellColumns; cellColumn++) {
        let cell = 0;
        for (let column = 0; column < this.PINS_PER_CELL_X; column++) {
          for (let row = 0; row < this.PINS_PER_CELL_Y; row++) {
            const x = cellColumn * this.PINS_PER_CELL_X + column;
            const y = cellRow * this.PINS_PER_CELL_Y + row;
            if (raster.get(x, y)) {
              cell |= this.GRAPHIC_BITS[column][row];
            }
          }
        }
        hex += this.toHexByte(cell);
      }
    }
    return hex;
  }

  /**
   * Packs one row of cells from a pin buffer, for a single-line update.
   *
   * Repainting one row instead of the whole frame keeps the device's
   * acknowledgement chain to a single line, which matters because a full frame
   * costs a second or more and the user is pressing arrow keys faster than that.
   *
   * @param raster - The pin buffer to read from
   * @param cellRow - Zero-based cell row to pack
   * @param cellColumns - Cells across the device's graphic area
   * @returns Hex string of `cellColumns` bytes
   */
  public static graphicRow(raster: DotRaster, cellRow: number, cellColumns: number): string {
    let hex = '';
    for (let cellColumn = 0; cellColumn < cellColumns; cellColumn++) {
      let cell = 0;
      for (let column = 0; column < this.PINS_PER_CELL_X; column++) {
        for (let row = 0; row < this.PINS_PER_CELL_Y; row++) {
          const x = cellColumn * this.PINS_PER_CELL_X + column;
          const y = cellRow * this.PINS_PER_CELL_Y + row;
          if (raster.get(x, y)) {
            cell |= this.GRAPHIC_BITS[column][row];
          }
        }
      }
      hex += this.toHexByte(cell);
    }
    return hex;
  }

  /**
   * Reports which cell rows differ between two pin buffers, so only those rows
   * need transmitting.
   * @param previous - The frame currently on the device
   * @param next - The frame to display
   * @param cellRows - Cells down the device's graphic area
   * @returns Ascending list of zero-based cell rows that changed
   */
  public static changedRows(previous: DotRaster, next: DotRaster, cellRows: number): number[] {
    const changed: number[] = [];
    for (let cellRow = 0; cellRow < cellRows; cellRow++) {
      const top = cellRow * this.PINS_PER_CELL_Y;
      // The wider of the two, not just the new frame: `graphic` tolerates a
      // raster that does not match the device by cropping and padding, so a
      // frame can be narrower than the one already displayed. Scanning only the
      // new width would miss pins still raised beyond its right edge and leave
      // them standing.
      const width = Math.max(previous.width, next.width);
      let differs = false;
      for (let y = top; y < top + this.PINS_PER_CELL_Y && !differs; y++) {
        for (let x = 0; x < width; x++) {
          if (previous.get(x, y) !== next.get(x, y)) {
            differs = true;
            break;
          }
        }
      }
      if (differs) {
        changed.push(cellRow);
      }
    }
    return changed;
  }

  /**
   * Packs braille cells given as dot bit patterns into a text-mode hex payload.
   * @param cells - One byte per cell, bit 0 being dot 1
   * @param cellCount - Cells on the device's text line; the input is cropped or
   * padded with blanks to this length
   */
  public static brailleCells(cells: readonly number[], cellCount: number): string {
    let hex = '';
    for (let i = 0; i < cellCount; i++) {
      hex += this.toHexByte(cells[i] ?? 0);
    }
    return hex;
  }
}
