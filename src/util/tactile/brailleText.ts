/**
 * Translates plain text into braille cells for a tactile display's text line.
 *
 * This is a deliberately small, self-contained uncontracted (grade 1) table
 * rather than a binding to a full translation library. A complete translator
 * such as liblouis ships tens of megabytes of tables and must be served as
 * static assets, which MAIDR — distributed as a single inlined bundle — cannot
 * do. Data labels are short, mostly alphanumeric, and read under a fingertip
 * one line at a time, so a table covering letters, digits and the punctuation
 * that actually appears in axis values buys nearly all of the benefit at none
 * of the distribution cost.
 *
 * A device SDK that can translate is always preferred when one is available;
 * this table is the floor that keeps the text line working when it is not, so
 * the feature never goes silent for want of a translator.
 *
 * Characters with no entry are emitted as blank cells. A blank reads as
 * absence, whereas an approximate substitution reads as data and would be
 * indistinguishable from a real value.
 */
export abstract class TactileBraille {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Dot patterns for lowercase letters, written as the dot numbers a braille
   * reader would name.
   */
  private static readonly LETTERS: Readonly<Record<string, string>> = {
    a: '1',
    b: '12',
    c: '14',
    d: '145',
    e: '15',
    f: '124',
    g: '1245',
    h: '125',
    i: '24',
    j: '245',
    k: '13',
    l: '123',
    m: '134',
    n: '1345',
    o: '135',
    p: '1234',
    q: '12345',
    r: '1235',
    s: '234',
    t: '2345',
    u: '136',
    v: '1236',
    w: '2456',
    x: '1346',
    y: '13456',
    z: '1356',
  };

  /**
   * Digits reuse the patterns of `a` through `j`, disambiguated by a preceding
   * number sign.
   */
  private static readonly DIGITS = 'jabcdefghi';

  /**
   * Prefix marking the following cell as a capital letter.
   */
  private static readonly CAPITAL_SIGN = '6';

  /**
   * Prefix opening a run of digits.
   */
  private static readonly NUMBER_SIGN = '3456';

  /**
   * Prefix closing a run of digits when a letter follows immediately.
   *
   * Digits reuse the patterns of `a` through `j`, so without this a value like
   * `30kg` would put the `k` outside the numeric run but leave `3a` reading as
   * `31` to anyone who met the number sign first. Axis values run letters
   * straight onto digits often enough — units, exponents — that the ambiguity
   * is not theoretical.
   */
  private static readonly LETTER_SIGN = '56';

  /**
   * Decimal point inside a run of digits. Distinct from a sentence period so a
   * reader is not left deciding whether `3.5` ended a sentence.
   */
  private static readonly NUMERIC_DECIMAL = '46';

  /**
   * Punctuation, as one or more cells each. Multi-cell entries are the standard
   * two-cell forms; they cost more of the line but are unambiguous, and these
   * characters are rare in the values this line carries.
   */
  private static readonly PUNCTUATION: Readonly<Record<string, readonly string[]>> = {
    '.': ['256'],
    ',': ['2'],
    ';': ['23'],
    ':': ['25'],
    '-': ['36'],
    '/': ['34'],
    '\'': ['3'],
    '%': ['46', '356'],
    '$': ['4', '234'],
    '+': ['5', '235'],
    '=': ['5', '2356'],
    '*': ['5', '35'],
    '(': ['5', '126'],
    ')': ['5', '345'],
    // Dot 4 rather than dot 5, so a comparison sign is not the same two cells
    // as a bracket. An approximate substitution here would read as a different
    // real character, which is the one failure this table is built to avoid.
    '<': ['4', '126'],
    '>': ['4', '345'],
  };

  /**
   * Dots 7 and 8 together, used to mark that the text continues past the end of
   * the line. Not a letter in any table, so it cannot be mistaken for content.
   */
  public static readonly CONTINUATION_CELL = 0b1100_0000;

  /**
   * Converts a dot-number string such as `'1345'` into a cell bit pattern.
   * @param dots - Dot numbers, `'1'` through `'8'`
   */
  private static toCell(dots: string): number {
    let pattern = 0;
    for (const dot of dots) {
      const index = Number.parseInt(dot, 10);
      if (index >= 1 && index <= 8) {
        pattern |= 1 << (index - 1);
      }
    }
    return pattern;
  }

  /**
   * Translates text into braille cell patterns.
   *
   * A number sign is emitted once at the start of each run of digits rather
   * than before every digit, and a period between two digits is treated as a
   * decimal point.
   *
   * @param text - The text to translate
   * @returns One byte per cell, bit 0 being dot 1
   */
  public static toCells(text: string): number[] {
    const cells: number[] = [];
    const characters = Array.from(text);
    let inNumber = false;

    for (let i = 0; i < characters.length; i++) {
      const character = characters[i];

      if (character >= '0' && character <= '9') {
        if (!inNumber) {
          cells.push(this.toCell(this.NUMBER_SIGN));
          inNumber = true;
        }
        const letter = this.DIGITS[Number.parseInt(character, 10)];
        cells.push(this.toCell(this.LETTERS[letter]));
        continue;
      }

      const next = characters[i + 1];
      const isDecimalPoint = character === '.'
        && inNumber
        && next !== undefined
        && next >= '0'
        && next <= '9';
      if (isDecimalPoint) {
        cells.push(this.toCell(this.NUMERIC_DECIMAL));
        continue;
      }

      const followsDigit = inNumber;
      inNumber = false;

      if (character === ' ') {
        cells.push(0);
        continue;
      }

      const lower = character.toLowerCase();
      const letterDots = this.LETTERS[lower];
      if (letterDots !== undefined) {
        if (followsDigit && lower >= 'a' && lower <= 'j') {
          cells.push(this.toCell(this.LETTER_SIGN));
        }
        if (character !== lower) {
          cells.push(this.toCell(this.CAPITAL_SIGN));
        }
        cells.push(this.toCell(letterDots));
        continue;
      }

      const punctuation = this.PUNCTUATION[character];
      if (punctuation !== undefined) {
        for (const dots of punctuation) {
          cells.push(this.toCell(dots));
        }
        continue;
      }

      cells.push(0);
    }

    return cells;
  }

  /**
   * Number of windows a cell buffer occupies on a line of a given width.
   * @param cells - The full translated buffer
   * @param cellCount - Cells on the device's text line
   */
  public static windowCount(cells: readonly number[], cellCount: number): number {
    if (cellCount <= 0) {
      return 0;
    }
    if (cells.length <= cellCount) {
      return 1;
    }
    // A window that is not the last spends its final cell on the continuation
    // marker, so it carries `cellCount - 1` cells of text. Counting windows at
    // the full width would step past exactly one cell per boundary and that
    // cell would never appear on any window.
    const carried = cellCount - 1;
    if (carried <= 0) {
      return cells.length;
    }
    return Math.ceil((cells.length - 1) / carried);
  }

  /**
   * Slices one window out of a cell buffer, padding the last one with blanks.
   *
   * The device reports its panning keys but never scrolls its own buffer, so
   * every window is re-sent from the first cell of the line. A continuation
   * marker replaces the final cell whenever more text follows, so a reader
   * knows to pan rather than assuming the value ended.
   *
   * @param cells - The full translated buffer
   * @param cellCount - Cells on the device's text line
   * @param windowIndex - Zero-based window to return, clamped into range
   * @returns Exactly `cellCount` cells
   */
  public static window(cells: readonly number[], cellCount: number, windowIndex: number): number[] {
    if (cellCount <= 0) {
      return [];
    }

    const lastWindow = this.windowCount(cells, cellCount) - 1;
    const index = Math.min(Math.max(windowIndex, 0), lastWindow);
    // Windows advance by the number of cells they actually carry, so the cell
    // displaced by a continuation marker reappears at the start of the next
    // window rather than being skipped.
    const carried = Math.max(1, cellCount - 1);
    const start = index === 0 ? 0 : index * carried;

    const window: number[] = [];
    for (let i = 0; i < cellCount; i++) {
      window.push(cells[start + i] ?? 0);
    }

    if (index < lastWindow) {
      window[cellCount - 1] = this.CONTINUATION_CELL;
    }
    return window;
  }
}
