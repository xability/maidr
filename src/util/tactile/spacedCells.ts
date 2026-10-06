import type { DotRaster } from './raster';

/**
 * How braille cells sit on a display whose pins are evenly spaced.
 *
 * On such a display a braille cell is not a part of its own but a patch of the
 * pin grid, and text needs space around each one: a blank column between
 * cells, and a blank row between lines once there is room for it. A Monarch
 * shows 32 cells across its 96 pins, so each cell is three pins wide and one of
 * the three is always down.
 */
export interface SpacedCellLayout {
  /**
   * Cells across each line.
   */
  readonly columns: number;

  /**
   * Lines of cells.
   */
  readonly lines: number;

  /**
   * Dots down each cell: 4 for eight-dot braille, 3 for six-dot.
   */
  readonly dotRows: 3 | 4;

  /**
   * Pins from the left edge of one cell to the left edge of the next.
   */
  readonly pitchX: number;

  /**
   * Pins from the top of one line to the top of the next.
   */
  readonly pitchY: number;
}

/**
 * Reads a picture drawn on a display's own pins into braille cells that sit
 * apart on them.
 *
 * The picture is drawn as though every pin could be raised, at the display's
 * true resolution and proportions, so a circle stays round and a mark lands
 * where it belongs. The pins between cells cannot be raised, so each is folded
 * into the dot beside it: a column of gap pins into the cell's right-hand dots,
 * a row of gap pins into its bottom dots. A line that falls on a gap is then
 * felt one pin to the side rather than lost, and nothing drawn disappears.
 */
export abstract class SpacedCells {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Bit of each dot in braille dot order (ISO/TR 11548-1, as Unicode's Braille
   * Patterns encode it), indexed `[column][row]`: dots 1, 2, 3 and 7 down the
   * left, 4, 5, 6 and 8 down the right.
   */
  private static readonly DOT_BITS: readonly (readonly number[])[] = [
    [0x01, 0x02, 0x04, 0x40],
    [0x08, 0x10, 0x20, 0x80],
  ];

  /**
   * Pins across the area the cells cover.
   * @param layout - How the cells sit on the pins
   */
  public static pinWidth(layout: SpacedCellLayout): number {
    return layout.columns * layout.pitchX;
  }

  /**
   * Reads lines of cells from the top of a picture.
   *
   * @param raster - The picture, one entry per pin
   * @param layout - How the cells sit on the pins
   * @param lines - How many lines to read
   * @returns The cells, line after line, bit 0 being dot 1
   */
  public static fold(raster: DotRaster, layout: SpacedCellLayout, lines: number): Uint8Array {
    const cells = new Uint8Array(lines * layout.columns);
    for (let line = 0; line < lines; line++) {
      for (let column = 0; column < layout.columns; column++) {
        cells[line * layout.columns + column] = SpacedCells.cell(raster, layout, line, column);
      }
    }
    return cells;
  }

  /**
   * Draws lines of cells onto a picture, each dot on the pin it sits on: the
   * way back from {@link fold}, for text on a display whose every pin can be
   * raised.
   *
   * @param raster - The picture
   * @param layout - How the cells sit on the pins
   * @param cells - The cells, line after line, bit 0 being dot 1
   * @param firstLine - The line the first cell goes on
   */
  public static draw(raster: DotRaster, layout: SpacedCellLayout, cells: Uint8Array, firstLine: number): void {
    for (let index = 0; index < cells.length; index++) {
      const left = (index % layout.columns) * layout.pitchX;
      const top = (firstLine + Math.floor(index / layout.columns)) * layout.pitchY;
      for (let dotColumn = 0; dotColumn < 2; dotColumn++) {
        for (let dotRow = 0; dotRow < layout.dotRows; dotRow++) {
          if (cells[index] & SpacedCells.DOT_BITS[dotColumn][dotRow]) {
            raster.set(left + dotColumn, top + dotRow);
          }
        }
      }
    }
  }

  /**
   * Reads one cell.
   * @param raster - The picture
   * @param layout - How the cells sit on the pins
   * @param line - The cell's line
   * @param column - The cell's place along the line
   */
  private static cell(raster: DotRaster, layout: SpacedCellLayout, line: number, column: number): number {
    const left = column * layout.pitchX;
    const top = line * layout.pitchY;
    let cell = 0;
    for (let dotColumn = 0; dotColumn < 2; dotColumn++) {
      // The right-hand dots take the gap pins after them.
      const xs = SpacedCells.span(left + dotColumn, dotColumn === 1 ? left + layout.pitchX - 1 : left);
      for (let dotRow = 0; dotRow < layout.dotRows; dotRow++) {
        // And the bottom dots the gap rows below them.
        const ys = SpacedCells.span(top + dotRow, dotRow === layout.dotRows - 1 ? top + layout.pitchY - 1 : top + dotRow);
        if (xs.some(x => ys.some(y => raster.get(x, y)))) {
          cell |= SpacedCells.DOT_BITS[dotColumn][dotRow];
        }
      }
    }
    return cell;
  }

  /**
   * The pins from one to another, inclusive; just the first when the second
   * comes before it.
   * @param first - The first pin
   * @param last - The last pin
   */
  private static span(first: number, last: number): number[] {
    const pins = [first];
    for (let pin = first + 1; pin <= last; pin++) {
      pins.push(pin);
    }
    return pins;
  }
}
