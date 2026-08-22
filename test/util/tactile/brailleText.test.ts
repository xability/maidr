/**
 * MAIDR ships its own uncontracted braille table because a full translator
 * such as liblouis is tens of megabytes of static assets a single inlined
 * bundle cannot carry. Nothing else validates the table for us: if a dot
 * pattern is wrong, or the number sign is emitted before every digit instead
 * of once per run, the DotPad still shows twenty confident-looking cells and
 * the reader has no way to tell the line is lying. The bug is silent at every
 * layer above this file.
 *
 * These tests pin the rules that carry state across characters, which are the
 * ones a refactor breaks first: the number sign opening a digit run and
 * closing at the first non-digit, and the period that means "decimal" between
 * two digits and "full stop" everywhere else. They also pin the two refusals
 * the table makes on purpose — a space and an unmapped character both come out
 * blank, because a blank reads as absence while an approximate substitution
 * reads as data and is indistinguishable from a real value.
 *
 * The windowing half is pinned because the device never scrolls its own
 * buffer: it reports panning keys and MAIDR re-sends the whole line. So
 * `window` must hand back exactly `cellCount` cells every time — padded when
 * the text is short, sliced when it is long — and must mark the last cell as a
 * continuation whenever more text follows, or a reader stops panning and
 * treats a truncated value as the whole one.
 *
 * Expected cells are built here from dot numbers rather than written as hex,
 * so an assertion that fails names the dots a braille reader would name.
 */

import { describe, expect, it } from '@jest/globals';
import { TactileBraille } from '@util/tactile/brailleText';

/**
 * Builds the cell byte for a dot-number string, bit 0 being dot 1.
 * @param numbers Dot numbers as a braille reader names them, e.g. `'1345'`
 * @returns The cell bit pattern
 */
function dots(numbers: string): number {
  return [...numbers].reduce((cell, dot) => cell | (1 << (Number(dot) - 1)), 0);
}

/** A cell with no dots raised. */
const BLANK = 0;
/** Dot 6, the prefix marking the next cell as a capital. */
const CAPITAL_SIGN = dots('6');
/** Dots 3456, the prefix opening a run of digits. */
const NUMBER_SIGN = dots('3456');
/** Cells on a DotPad's braille text line. */
const CELL_COUNT = 20;

describe('tactileBraille.toCells', () => {
  it('should map lowercase letters to their dot patterns', () => {
    const text = 'dot';

    const cells = TactileBraille.toCells(text);

    // d is dots 145, o is dots 135, t is dots 2345.
    expect(cells).toEqual([dots('145'), dots('135'), dots('2345')]);
    expect(cells[0]).toBe(0b001_1001);
  });

  it('should raise dots 7 and 8 together for the continuation marker', () => {
    const expected = dots('78');

    const marker = TactileBraille.CONTINUATION_CELL;

    expect(marker).toBe(expected);
  });

  it('should prefix a capital letter with a dot-6 cell', () => {
    const text = 'Apples';

    const cells = TactileBraille.toCells(text);

    expect(cells).toHaveLength(7);
    expect(cells[0]).toBe(CAPITAL_SIGN);
    expect(cells.slice(1)).toEqual([
      dots('1'),
      dots('1234'),
      dots('1234'),
      dots('123'),
      dots('15'),
      dots('234'),
    ]);
  });

  it('should emit the number sign once for a whole run of digits', () => {
    const text = '30';

    const cells = TactileBraille.toCells(text);

    // Digits reuse a-j, so 3 is c (dots 14) and 0 is j (dots 245).
    expect(cells).toEqual([NUMBER_SIGN, dots('14'), dots('245')]);
    expect(cells).toHaveLength(3);
  });

  it('should re-emit the number sign after a non-digit breaks the run', () => {
    const text = '3 0';

    const cells = TactileBraille.toCells(text);

    expect(cells).toEqual([NUMBER_SIGN, dots('14'), BLANK, NUMBER_SIGN, dots('245')]);
    expect(cells).toHaveLength(5);
  });

  it('should read a period between digits as a decimal and elsewhere as a period', () => {
    const text = '3.5.';

    const cells = TactileBraille.toCells(text);

    expect(cells).toEqual([
      NUMBER_SIGN,
      dots('14'),
      dots('46'),
      dots('15'),
      dots('256'),
    ]);
  });

  it('should emit a blank cell for a space and for an unmapped character', () => {
    const text = 'a #b';

    const cells = TactileBraille.toCells(text);

    // A blank reads as absence; a substitution would read as data.
    expect(cells).toEqual([dots('1'), BLANK, BLANK, dots('12')]);
  });

  it('should emit both cells of a two-cell punctuation mark', () => {
    const text = '%';

    const cells = TactileBraille.toCells(text);

    expect(cells).toHaveLength(2);
    expect(cells).toEqual([dots('46'), dots('356')]);
  });

  it('should return no cells for empty text', () => {
    const text = '';

    const cells = TactileBraille.toCells(text);

    expect(cells).toEqual([]);
  });

  it('should return one cell for a single letter', () => {
    const text = 'a';

    const cells = TactileBraille.toCells(text);

    expect(cells).toEqual([dots('1')]);
  });
});

describe('tactileBraille.windowCount', () => {
  it('should report one window for an empty buffer', () => {
    const cells = TactileBraille.toCells('');

    const count = TactileBraille.windowCount(cells, CELL_COUNT);

    expect(count).toBe(1);
  });

  it('should report one window when the buffer exactly fills the line', () => {
    const cells = Array.from({ length: CELL_COUNT }, () => dots('1'));

    const count = TactileBraille.windowCount(cells, CELL_COUNT);

    expect(count).toBe(1);
  });

  it('should report two windows when the buffer overruns the line by one cell', () => {
    const cells = Array.from({ length: CELL_COUNT + 1 }, () => dots('1'));

    const count = TactileBraille.windowCount(cells, CELL_COUNT);

    expect(count).toBe(2);
  });
});

describe('tactileBraille.window', () => {
  it('should pad a short buffer with blanks to exactly the line width', () => {
    const cells = TactileBraille.toCells('ab');

    const window = TactileBraille.window(cells, CELL_COUNT, 0);

    expect(window).toHaveLength(CELL_COUNT);
    expect(window[0]).toBe(dots('1'));
    expect(window[1]).toBe(dots('12'));
    expect(window.slice(2)).toEqual(Array.from({ length: CELL_COUNT - 2 }, () => BLANK));
  });

  it('should slice a long buffer down to exactly the line width', () => {
    const cells = Array.from({ length: 25 }, (_, i) => i + 1);

    const window = TactileBraille.window(cells, 10, 1);

    // Windows advance by the nine cells a marked window actually carries, not
    // by the full ten, so cell 10 — displaced by window 0's marker — leads here
    // instead of being skipped.
    expect(window).toHaveLength(10);
    expect(window.slice(0, 9)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('should show every cell of the buffer across its windows', () => {
    const cells = Array.from({ length: 25 }, (_, i) => i + 1);
    const count = TactileBraille.windowCount(cells, 10);

    const seen = new Set<number>();
    for (let i = 0; i < count; i++) {
      for (const cell of TactileBraille.window(cells, 10, i)) {
        if (cell !== BLANK && cell !== TactileBraille.CONTINUATION_CELL) {
          seen.add(cell);
        }
      }
    }

    // The marker overwrites a cell of content, so a stride of the full line
    // width would drop exactly one cell per boundary — silently, and only for
    // labels long enough to need panning.
    expect(seen.size).toBe(cells.length);
  });

  it('should mark the last cell of a window with more text after it', () => {
    const cells = Array.from({ length: 25 }, (_, i) => i + 1);

    const window = TactileBraille.window(cells, 10, 0);

    // The marker replaces the tenth cell rather than being appended, so the
    // window still measures exactly the line width.
    expect(window[9]).toBe(TactileBraille.CONTINUATION_CELL);
    expect(window).toHaveLength(10);
  });

  it('should leave the final window unmarked', () => {
    const cells = Array.from({ length: 25 }, (_, i) => i + 1);

    const lastWindow = TactileBraille.windowCount(cells, 10) - 1;
    const window = TactileBraille.window(cells, 10, lastWindow);

    expect(window[9]).not.toBe(TactileBraille.CONTINUATION_CELL);
    expect(window).toEqual([19, 20, 21, 22, 23, 24, 25, BLANK, BLANK, BLANK]);
  });

  it('should clamp a negative window index to the first window', () => {
    const cells = Array.from({ length: 25 }, (_, i) => i + 1);

    const window = TactileBraille.window(cells, 10, -5);

    expect(window.slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(window[9]).toBe(TactileBraille.CONTINUATION_CELL);
  });

  it('should clamp a window index past the end to the last window', () => {
    const cells = Array.from({ length: 25 }, (_, i) => i + 1);

    const window = TactileBraille.window(cells, 10, 99);

    expect(window).toEqual(TactileBraille.window(cells, 10, 2));
  });
});

describe('tactileBraille line sizing', () => {
  it('should fit a short data label inside one twenty-cell line', () => {
    const label = 'Apples 30';

    const cells = TactileBraille.toCells(label);

    // Capital sign + 6 letters + blank + number sign + 2 digits.
    expect(cells).toHaveLength(11);
    expect(cells.length).toBeLessThan(CELL_COUNT);
    expect(TactileBraille.windowCount(cells, CELL_COUNT)).toBe(1);
  });

  it('should spill a full sentence label past the line and mark it continued', () => {
    const label = 'Fruit is Apples, Units is 30';

    const cells = TactileBraille.toCells(label);

    expect(cells).toHaveLength(32);
    expect(cells.length).toBeGreaterThan(CELL_COUNT);
    expect(TactileBraille.windowCount(cells, CELL_COUNT)).toBe(2);
    expect(TactileBraille.window(cells, CELL_COUNT, 0)[CELL_COUNT - 1])
      .toBe(TactileBraille.CONTINUATION_CELL);
    expect(TactileBraille.window(cells, CELL_COUNT, 1)[CELL_COUNT - 1])
      .not
      .toBe(TactileBraille.CONTINUATION_CELL);
  });
});
