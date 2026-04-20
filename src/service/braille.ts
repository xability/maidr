/**
 * Braille service: encodes plot state into a braille character string plus a
 * bidirectional cursor/index map.
 *
 * Physical braille display constraint
 * -----------------------------------
 * A physical braille display is cursor-tracking hardware that reads ONE flat
 * stream of characters from its host textarea. Newline characters (`\n`) do
 * NOT advance to the next physical display line — the hardware either ignores
 * them or treats the whole buffer as a single paragraph, so anything placed
 * after a `\n` is effectively hidden on the display. The only way to push
 * content onto the next physical line is to pad the preceding line with
 * ASCII spaces up to the hardware's cells-per-line width (`displaySize`).
 *
 * Consequently this service has two distinct output modes:
 *
 *   1. Single-line mode (`displayLines === 1`): the encoded string uses
 *      `\n` as a visual wrap, which is fine for the on-screen textarea that
 *      sighted users or refreshable-line-only displays see — there is no
 *      multi-line physical display to break.
 *
 *   2. Multiline mode (`displayLines > 1`): no `\n` anywhere. Rows are
 *      separated by space-padding each row to a `displaySize` boundary so
 *      every data row occupies exactly one physical braille display line.
 *      Horizontal windowing (below) is also spaces-only for the same reason.
 *
 * Companion textarea detail: the Braille UI component sets `wrap="off"` so
 * the browser does not introduce visual wraps that would desync the firmware's
 * index-based cursor tracking from our `cellToIndex` / `indexToCell` maps.
 */
import type { Context } from '@model/context';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type {
  BarBrailleState,
  BoxBrailleState,
  BrailleState,
  CandlestickBrailleState,
  HeatmapBrailleState,
  LineBrailleState,
  SubplotState,
  TraceEmptyState,
  TraceState,
} from '@type/state';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import type { SettingsService } from './settings';
import { Emitter, Scope } from '@type/event';
import { TraceType } from '@type/grammar';
import { Constant } from '@util/constant';

export const DEFAULT_BRAILLE_SIZE = 32;
export const DEFAULT_BRAILLE_LINES = 1;
export const MAX_BRAILLE_LINES = 20;

/**
 * Normalizes configured braille display size to a safe positive integer.
 * Falls back to default when the value is missing or invalid.
 * @param size - Raw display size value from settings or caller
 * @returns Normalized display size
 */
function normalizeDisplaySize(size: number | undefined): number {
  if (size === undefined || !Number.isFinite(size)) {
    return DEFAULT_BRAILLE_SIZE;
  }

  return Math.max(1, Math.floor(size));
}

const BRAILLE_DISPLAY_SIZE_SETTING = 'general.brailleDisplaySize';
const BRAILLE_DISPLAY_LINES_SETTING = 'general.brailleDisplayLines';

/**
 * Normalizes configured braille display lines to a safe positive integer.
 * Falls back to default when the value is missing or invalid.
 * @param lines - Raw display lines value from settings or caller
 * @returns Normalized display lines
 */
export function normalizeDisplayLines(lines: number | undefined): number {
  if (lines === undefined || !Number.isFinite(lines)) {
    return DEFAULT_BRAILLE_LINES;
  }
  return Math.min(MAX_BRAILLE_LINES, Math.max(1, Math.floor(lines)));
}

/**
 * Represents a cell position in a 2D grid.
 */
interface Cell {
  row: number;
  col: number;
}

/**
 * Non-empty braille state: every concrete variant that an encoder can read.
 * Used to type the heterogeneous encoder map without resorting to `any`.
 */
type NonEmptyBrailleState = Exclude<BrailleState, TraceEmptyState>;

/**
 * Grid-shaped braille states: those whose `values` is a 2D `number[][]`
 * (bar, heatmap, line, candlestick). Excludes box plot, whose `values` is a
 * flat `BoxPoint[]`. Used by {@link isGridBrailleState} to narrow for
 * horizontal-windowing checks that iterate rows.
 */
type GridBrailleState
  = | BarBrailleState
    | CandlestickBrailleState
    | HeatmapBrailleState
    | LineBrailleState;

/**
 * Typed guard: narrows a {@link BrailleState} to the grid-shaped variants
 * that expose `number[][]` rows.
 *
 * Box states are filtered out because `BoxBrailleState.values` is a flat
 * `BoxPoint[]` (one object per row) rather than a `number[][]` grid — so
 * `Array.isArray(values[0])` is true for grid states and false for box
 * states. This distinction matters for horizontal-windowing checks that
 * need to iterate per-row column counts; box plots always fill exactly
 * `displaySize` cells per row and never window, so excluding them here
 * short-circuits the windowing path cleanly.
 * @param state - Any braille state to inspect
 * @returns Whether the state has a 2D numeric value grid
 */
function isGridBrailleState(state: BrailleState): state is GridBrailleState {
  if (state.empty) {
    return false;
  }
  const values = (state as { values: unknown }).values;
  return Array.isArray(values) && values.length > 0 && Array.isArray(values[0]);
}

/**
 * Event emitted when braille display changes.
 */
interface BrailleChangedEvent {
  value: string;
  index: number;
  displaySize: number;
  displayLines: number;
}

/**
 * Represents encoded braille with bidirectional cell-to-index mapping.
 */
interface EncodedBraille {
  value: string;
  cellToIndex: number[][];
  indexToCell: Cell[];
}

/**
 * Encodes a 2D grid of characters into a braille string with display-size wrapping
 * and bidirectional index mapping. This is the shared wrapping logic used by all
 * encoders that operate on row/col grids.
 *
 * Two output modes are supported (see the file header for the physical braille
 * display constraint that drives this split):
 *
 *  - Single-line mode (`multiline=false`): rows are separated by `\n`. Safe
 *    only for the on-screen textarea; a multi-line physical braille display
 *    would hide everything after the first `\n` because the hardware reads a
 *    single flat stream.
 *
 *  - Multiline mode (`multiline=true`): absolutely NO `\n` is emitted. Rows
 *    are separated by padding each row with ASCII spaces up to a `displaySize`
 *    boundary, which is the only way to advance a physical braille display
 *    to the next line.
 *
 * Horizontal windowing (multiline mode only): when any row exceeds
 * `displaySize`, each row is rendered as exactly `displaySize` characters
 * drawn from `[colOffset, colOffset + displaySize)`. Short rows under a wide
 * window are space-padded — again, no `\n` — so every data row still maps to
 * exactly one physical display line. This lets hardware cursor-tracking page
 * horizontally the same way it already pages vertically. Out-of-window
 * columns map to `-1` in `cellToIndex`; the service layer advances
 * `colOffset` before re-encoding so the cursor always lands in the active
 * window.
 *
 * @param rowCount - Number of rows in the data
 * @param colCount - Function returning the number of columns for a given row
 * @param getChar - Function returning the braille character for a given (row, col)
 * @param displaySize - Maximum columns per display line before wrapping
 * @param multiline - When true, emits only spaces (never `\n`) between rows so
 *   physical braille displays advance to the next line; `\n` does not render
 *   on physical hardware.
 * @param colOffset - Horizontal windowing offset; used only when windowing is active
 * @returns Encoded braille with cell mappings
 */
function encodeWithWrapping(
  rowCount: number,
  colCount: (row: number) => number,
  getChar: (row: number, col: number) => string,
  displaySize: number,
  multiline: boolean = false,
  colOffset: number = 0,
): EncodedBraille {
  const values = new Array<string>();
  const cellToIndex = new Array<Array<number>>();
  const indexToCell = new Array<Cell>();

  for (let i = 0; i < rowCount; i++) {
    cellToIndex.push(new Array<number>());
  }

  // Horizontal windowing activates only for multi-row plots in multiline mode
  // where at least one row overflows a single display line. Single-trace and
  // narrow-row cases keep the existing per-row padding behavior. (Windowing is
  // never allowed to insert `\n`; output is always space-only — see file
  // header for why.)
  let windowed = false;
  if (multiline && rowCount > 1) {
    for (let r = 0; r < rowCount; r++) {
      if (colCount(r) > displaySize) {
        windowed = true;
        break;
      }
    }
  }

  // When multiline, encode from the last row to the first so that
  // row 0 (the initially focused / lowest element) appears at the
  // bottom of the physical braille display and UP (row++) moves the
  // cursor upward.
  const start = multiline ? rowCount - 1 : 0;
  const end = multiline ? -1 : rowCount;
  const step = multiline ? -1 : 1;

  // Per-row sentinel semantics differ across the three output modes and are
  // documented here once because all three paths append to
  // `cellToIndex[row]`:
  //
  //   - Single-line (multiline=false): sentinel is a synthetic virtual cell
  //     at `{row, col: cols}` (one past the last data column). It exists
  //     only in `indexToCell`, never in the emitted string.
  //   - Multiline windowed: sentinel points to the LAST cell in the window
  //     (`indexToCell.length - 1`), which is always a real data or padding
  //     cell resolving to `{row, col: lastDataCol}`.
  //   - Multiline non-windowed: sentinel is captured BEFORE padding
  //     (`indexToCell.length` at that moment). If the row requires padding,
  //     it points to the FIRST padding cell and resolves to
  //     `{row, col: lastCol}`. If the row exactly fills `displaySize`
  //     (no padding added), the sentinel points past the end of
  //     `indexToCell` — `moveToIndex` guards against that via its bounds
  //     check, so it is harmless, but callers must treat the sentinel as
  //     advisory only, never as a valid index.
  //
  // The sentinel is never emitted to the onChange event; it is used only to
  // allow internal lookups like `cellToIndex[row][cols]`.
  for (let row = start; row !== end; row += step) {
    const cols = colCount(row);

    if (windowed) {
      // Pre-fill with -1 so any out-of-window col lookup signals that the
      // service must re-encode with a new colOffset before the cursor is
      // valid again.
      for (let c = 0; c < cols; c++) {
        cellToIndex[row].push(-1);
      }
      const lastDataCol = Math.max(0, cols - 1);
      const windowEnd = colOffset + displaySize;
      for (let col = colOffset; col < windowEnd; col++) {
        if (col >= 0 && col < cols) {
          cellToIndex[row][col] = indexToCell.length;
          values.push(getChar(row, col));
          indexToCell.push({ row, col });
        } else {
          // Beyond this row's data (short row under a wide window): pad with
          // a SPACE — not `\n` — because `\n` does not render on a physical
          // braille display. Spaces push the next row onto the next physical
          // display line and keep relative column alignment across rows.
          // Clicks in padding map to the last data cell of the row.
          values.push(Constant.SPACE);
          indexToCell.push({ row, col: lastDataCol });
        }
      }
      cellToIndex[row].push(indexToCell.length - 1);
      continue;
    }

    for (let col = 0; col < cols; col++) {
      values.push(getChar(row, col));

      cellToIndex[row].push(indexToCell.length);
      indexToCell.push({ row, col });

      if (!multiline && (col + 1) % displaySize === 0) {
        values.push(Constant.NEW_LINE);
        indexToCell.push({ row, col });
      }
    }

    if (multiline) {
      // Space-pad the row to the next multiple of displaySize so the NEXT
      // data row begins on the next physical braille display line. A `\n`
      // here would be hidden on the hardware (the display renders only one
      // "paragraph"), so spaces are the only working separator.
      const paddedLength = cols === 0
        ? displaySize
        : Math.ceil(cols / displaySize) * displaySize;
      const sentinelIdx = indexToCell.length;
      const lastCol = Math.max(0, cols - 1);
      for (let p = cols; p < paddedLength; p++) {
        values.push(Constant.SPACE);
        indexToCell.push({ row, col: lastCol });
      }
      cellToIndex[row].push(sentinelIdx);
    } else {
      // Single-line mode: a `\n` is safe and useful here because this output
      // feeds the on-screen textarea (or a one-line braille display that
      // only ever shows one row at a time). Multi-line physical braille
      // displays are never in this branch — they always set multiline=true.
      const sentinelIdx = indexToCell.length;
      indexToCell.push({ row, col: cols });
      if (cols === 0 || cols % displaySize !== 0) {
        values.push(Constant.NEW_LINE);
      }
      cellToIndex[row].push(sentinelIdx);
    }
  }

  return { value: values.join(Constant.EMPTY), cellToIndex, indexToCell };
}

/**
 * Represents time series data with multiple rows of values.
 */
interface TimeSeries {
  values: number[][];
}

/**
 * Interface for encoding plot states into braille representations.
 *
 * The `multiline` flag controls two related behaviors that implementors must
 * keep in sync:
 *   1. Row separation — uses space-padding to the next `displaySize` boundary
 *      and NEVER emits `\n`. Physical multi-line braille displays read a flat
 *      character stream; a `\n` would be swallowed and hide every subsequent
 *      row, so spaces are the only way to push content to the next display
 *      line.
 *   2. Row encoding order — encodes data rows from last to first so that
 *      row 0 (the initially focused / lowest data row) appears at the bottom
 *      of the physical braille display. This makes UP-arrow navigation
 *      (which increments `row`) move the cursor upward on the display.
 *
 * `colOffset` enables horizontal page-windowing for plots wider than the
 * display; it is meaningful only when `multiline=true` and the state has
 * multiple rows with at least one row wider than `size` cells.
 *
 * Note: `BoxBrailleEncoder` intentionally ignores `colOffset` — each box
 * always fills exactly `size` cells, so there is never anything to window
 * horizontally. All other encoders honor it.
 */
interface BrailleEncoder<BrailleState> {
  encode: (
    state: BrailleState,
    size?: number,
    multiline?: boolean,
    /** Horizontal page offset for wide rows. Ignored by BoxBrailleEncoder. */
    colOffset?: number,
  ) => EncodedBraille;
}

/**
 * Encoder for converting bar chart data into braille patterns.
 */
class BarBrailleEncoder implements BrailleEncoder<BarBrailleState> {
  /**
   * Encodes bar chart state into braille representation.
   * @param state - Bar chart braille state
   * @param size - Target display size
   * @param multiline - When true, uses space padding for physical braille displays
   * @returns Encoded braille with cell mappings
   */
  public encode(
    state: BarBrailleState,
    size: number = DEFAULT_BRAILLE_SIZE,
    multiline: boolean = false,
    colOffset: number = 0,
  ): EncodedBraille {
    const displaySize = normalizeDisplaySize(size);

    return encodeWithWrapping(
      state.values.length,
      row => state.values[row].length,
      (row, col) => {
        const range = (state.max[row] - state.min[row]) / 4;
        const low = state.min[row] + range;
        const medium = low + range;
        const high = medium + range;
        const value = state.values[row][col];

        if (value === 0)
          return ' ';
        if (value <= low)
          return '⠤';
        if (value <= medium)
          return '⠤';
        if (value <= high)
          return '⠒';
        return '⠉';
      },
      displaySize,
      multiline,
      colOffset,
    );
  }
}

/**
 * Encoder for converting box plot data into braille patterns.
 */
class BoxBrailleEncoder implements BrailleEncoder<BoxBrailleState> {
  private readonly GLOBAL_MIN = 'globalMin';
  private readonly GLOBAL_MAX = 'globalMax';
  private readonly BLANK = 'blank';

  private readonly LOWER_OUTLIER = 'lowerOutlier';
  private readonly UPPER_OUTLIER = 'upperOutlier';

  private readonly MIN = 'min';
  private readonly MAX = 'max';

  private readonly Q1 = 'q1';
  private readonly Q2 = 'q2';
  private readonly Q3 = 'q3';

  /**
   * Encodes box plot state into braille representation with quartiles and outliers.
   * @param state - Box plot braille state
   * @param size - Target size for braille output
   * @param multiline - When true, uses space padding for physical braille displays
   * @returns Encoded braille with cell mappings
   */
  public encode(
    state: BoxBrailleState,
    size: number = DEFAULT_BRAILLE_SIZE,
    multiline: boolean = false,
    _colOffset: number = 0,
  ): EncodedBraille {
    // colOffset is intentionally ignored: each box always spans exactly
    // displaySize chars, so there is never anything to window horizontally.
    const displaySize = normalizeDisplaySize(size);
    const values = new Array<string>();
    const indexToCell = new Array<Cell>();
    const cellToIndex = new Array<Array<number>>();

    const sections = [
      this.LOWER_OUTLIER,
      this.MIN,
      this.Q1,
      this.Q2,
      this.Q3,
      this.MAX,
      this.UPPER_OUTLIER,
    ];

    const rowCount = state.values.length;
    for (let i = 0; i < rowCount; i++) {
      cellToIndex.push(
        Array.from({ length: sections.length }).fill(-1) as number[],
      );
    }

    // When multiline, encode from the last row to the first so UP
    // moves the cursor upward on the physical braille display.
    const start = multiline ? rowCount - 1 : 0;
    const end = multiline ? -1 : rowCount;
    const step = multiline ? -1 : 1;

    for (let row = start; row !== end; row += step) {
      const rowStartIdx = values.length;
      const box = state.values[row];
      const boxValData = [
        { type: this.GLOBAL_MIN, value: state.min },
        ...box.lowerOutliers.map(v => ({
          type: this.LOWER_OUTLIER,
          value: v,
        })),
        { type: this.MIN, value: box.min },
        { type: this.Q1, value: box.q1 },
        { type: this.Q2, value: box.q2 },
        { type: this.Q3, value: box.q3 },
        { type: this.MAX, value: box.max },
        ...box.upperOutliers.map(v => ({
          type: this.UPPER_OUTLIER,
          value: v,
        })),
        { type: this.GLOBAL_MAX, value: state.max },
      ];

      const lenData = new Array<{
        type: string;
        length: number;
        numChars: number;
      }>();
      let isBeforeMid = true;
      for (let i = 0; i < boxValData.length - 1; i++) {
        const curr = boxValData[i];
        const next = boxValData[i + 1];
        const diff = isBeforeMid
          ? Math.abs(next.value - curr.value)
          : Math.abs(curr.value - boxValData[i - 1].value);

        if (
          curr.type === this.LOWER_OUTLIER
          || curr.type === this.UPPER_OUTLIER
        ) {
          lenData.push({ type: curr.type, length: 0, numChars: 1 });
          lenData.push({ type: this.BLANK, length: diff, numChars: 0 });
        } else if (curr.type === this.Q2) {
          isBeforeMid = false;
          lenData.push({ type: this.Q2, length: 0, numChars: 2 });
        } else if (
          curr.type === this.GLOBAL_MIN
          || curr.type === this.GLOBAL_MAX
        ) {
          lenData.push({ type: this.BLANK, length: diff, numChars: 0 });
        } else {
          lenData.push({ type: curr.type, length: diff, numChars: 1 });
        }
      }

      let preAllocated = lenData.reduce(
        (sum, l) => sum + (l.numChars > 0 ? l.numChars : 0),
        0,
      );
      let [locMin, locMax, locQ1, locQ3] = [-1, -1, -1, -1];
      for (let i = 0; i < lenData.length; i++) {
        if (lenData[i].type === this.MIN && lenData[i].length > 0)
          locMin = i;
        if (lenData[i].type === this.MAX && lenData[i].length > 0)
          locMax = i;
        if (lenData[i].type === this.Q1)
          locQ1 = i;
        if (lenData[i].type === this.Q3)
          locQ3 = i;
      }
      if (
        locMin !== -1
        && locMax !== -1
        && lenData[locMin].length !== lenData[locMax].length
      ) {
        if (lenData[locMin].length > lenData[locMax].length) {
          lenData[locMin].numChars++;
          preAllocated++;
        } else {
          lenData[locMax].numChars++;
          preAllocated++;
        }
      }
      if (
        locQ1 !== -1
        && locQ3 !== -1
        && lenData[locQ1].length !== lenData[locQ3].length
      ) {
        if (lenData[locQ1].length > lenData[locQ3].length) {
          lenData[locQ1].numChars++;
          preAllocated++;
        } else {
          lenData[locQ3].numChars++;
          preAllocated++;
        }
      }

      const available = Math.max(0, displaySize - preAllocated);
      const totalLength = lenData.reduce(
        (sum, l) => sum + (l.type !== this.Q2 && l.length > 0 ? l.length : 0),
        0,
      );
      for (const section of lenData) {
        if (section.type !== this.Q2 && section.length > 0) {
          const allocated = Math.round(
            (section.length / totalLength) * available,
          );
          section.numChars += allocated;
        }
      }

      const totalChars = lenData.reduce((sum, l) => sum + l.numChars, 0);
      let diff = displaySize - totalChars;
      let adjustIndex = 0;
      while (diff !== 0) {
        const section = lenData[adjustIndex % lenData.length];
        if (
          section.type !== this.BLANK
          && section.type !== this.Q2
          && section.length > 0
        ) {
          section.numChars += diff > 0 ? 1 : -1;
          diff += diff > 0 ? -1 : 1;
        }
        adjustIndex++;
      }

      let col = -1;
      for (const section of lenData) {
        if (
          section.type !== this.BLANK
          && section.type !== this.GLOBAL_MIN
          && section.type !== this.GLOBAL_MAX
        ) {
          col = sections.indexOf(section.type);
          cellToIndex[row][col] = values.length;
        }

        for (let j = 0; j < section.numChars; j++) {
          let brailleChar = '⠀';

          if (section.type === this.MIN || section.type === this.MAX) {
            brailleChar = '⠒';
          } else if (section.type === this.Q1 || section.type === this.Q3) {
            brailleChar = '⠿';
          } else if (section.type === this.Q2) {
            brailleChar = j === 0 ? '⠸' : '⠇';
          } else if (
            section.type === this.LOWER_OUTLIER
            || section.type === this.UPPER_OUTLIER
          ) {
            brailleChar = '⠂';
          } else if (section.type === this.BLANK) {
            brailleChar = '⠀';
          }

          values.push(brailleChar);
          indexToCell.push({ row, col });
        }
      }
      for (let s = 0; s < 3; s++) {
        if (cellToIndex[row][s] === -1) {
          for (let t = s + 1; t <= 3; t++) {
            if (cellToIndex[row][t] !== -1) {
              cellToIndex[row][s] = cellToIndex[row][t];
              break;
            }
          }
        }
      }
      for (let s = 6; s > 3; s--) {
        if (cellToIndex[row][s] === -1) {
          for (let t = s - 1; t >= 3; t--) {
            if (cellToIndex[row][t] !== -1) {
              cellToIndex[row][s] = cellToIndex[row][t];
              break;
            }
          }
        }
      }

      if (multiline) {
        // The box encoder already produces exactly `displaySize` characters
        // per row, so the row naturally ends on a display-line boundary.
        // Defensive SPACE padding below covers any future code path that
        // might emit a different number of characters — `\n` would be
        // hidden on a physical braille display, so spaces are the only
        // way to advance to the next display line.
        const rowCharCount = values.length - rowStartIdx;
        const paddedLength = rowCharCount === 0
          ? displaySize
          : Math.ceil(rowCharCount / displaySize) * displaySize;
        const lastCol = Math.max(0, col);
        for (let p = rowCharCount; p < paddedLength; p++) {
          values.push(Constant.SPACE);
          indexToCell.push({ row, col: lastCol });
        }
      } else {
        // Single-line mode: `\n` is safe here because the output feeds the
        // on-screen textarea (or a one-line refreshable display), not a
        // multi-line physical display.
        values.push(Constant.NEW_LINE);
        indexToCell.push({ row, col });
      }
    }

    return { value: values.join(Constant.EMPTY), cellToIndex, indexToCell };
  }
}

/**
 * Encoder for converting heatmap data into braille patterns.
 */
class HeatmapBrailleEncoder implements BrailleEncoder<HeatmapBrailleState> {
  /**
   * Encodes heatmap state into braille representation.
   * @param state - Heatmap braille state
   * @param size - Target display size
   * @param multiline - When true, uses space padding for physical braille displays
   * @returns Encoded braille with cell mappings
   */
  public encode(
    state: HeatmapBrailleState,
    size: number = DEFAULT_BRAILLE_SIZE,
    multiline: boolean = false,
    colOffset: number = 0,
  ): EncodedBraille {
    const displaySize = normalizeDisplaySize(size);
    const range = (state.max - state.min) / 3;
    const low = state.min + range;
    const medium = low + range;

    return encodeWithWrapping(
      state.values.length,
      row => state.values[row].length,
      (row, col) => {
        const value = state.values[row][col];

        if (value === 0)
          return ' ';
        if (value <= low)
          return '⠤';
        if (value <= medium)
          return '⠒';
        return '⠉';
      },
      displaySize,
      multiline,
      colOffset,
    );
  }
}

/**
 * Abstract base encoder for time series data with trend-based braille patterns.
 */
abstract class AbstractTimeSeriesEncoder<T extends TimeSeries>
implements BrailleEncoder<T> {
  /**
   * Encodes a single data point to a braille character.
   * @param state - Time series state
   * @param row - Row index
   * @param col - Column index
   * @returns Encoded braille character for the given point
   */
  protected encodeCell(state: T, row: number, col: number): string {
    const { low, medium, mediumHigh, high } = this.getThresholds(row, state);
    const currentValue = state.values[row][col];
    const prevValue = col > 0 ? state.values[row][col - 1] : null;

    return this.getBrailleChar(
      currentValue,
      prevValue,
      low,
      medium,
      high,
      mediumHigh,
    );
  }

  /**
   * Encodes time series state into braille representation with trend indicators.
   * @param state - Time series braille state
   * @param size - Target display size
   * @param multiline - When true, uses space padding for physical braille displays
   * @returns Encoded braille with cell mappings
   */
  public encode(
    state: T,
    size: number = DEFAULT_BRAILLE_SIZE,
    multiline: boolean = false,
    colOffset: number = 0,
  ): EncodedBraille {
    const displaySize = normalizeDisplaySize(size);

    return encodeWithWrapping(
      state.values.length,
      row => state.values[row].length,
      (row, col) => this.encodeCell(state, row, col),
      displaySize,
      multiline,
      colOffset,
    );
  }

  /**
   * Gets threshold values for categorizing data into braille levels.
   * @param row - Row index
   * @param state - Time series state
   * @returns Threshold values for low, medium, mediumHigh, and high levels
   */
  protected abstract getThresholds(
    row: number,
    state: T,
  ): {
    low: number;
    medium: number;
    mediumHigh?: number;
    high: number;
  };

  /**
   * Gets the appropriate 8-dot braille character based on value and trend.
   * @param current - Current value
   * @param prev - Previous value for trend calculation
   * @param low - Low threshold
   * @param medium - Medium threshold
   * @param high - High threshold
   * @param mediumHigh - Optional medium-high threshold
   * @returns Braille character representing the value and trend
   */
  public getBrailleChar(
    current: number,
    prev: number | null,
    low: number,
    medium: number,
    high: number,
    mediumHigh?: number,
  ): string {
    if (mediumHigh === undefined) {
      mediumHigh = high;
    }
    if (current <= low && prev !== null && prev > low) {
      if (prev <= medium)
        return '⢄';
      else if (prev <= mediumHigh)
        return '⢆';
      else return '⢇';
    } else if (current <= low) {
      return '⣀';
    } else if (prev !== null && prev <= low) {
      if (current <= medium)
        return '⡠';
      else if (current <= mediumHigh)
        return '⡰';
      else return '⡸';
    } else if (current <= medium && prev !== null && prev > medium) {
      if (prev <= mediumHigh)
        return '⠢';
      else return '⠣';
    } else if (current <= medium) {
      return '⠤';
    } else if (prev !== null && prev <= medium) {
      if (current <= mediumHigh)
        return '⠔';
      else return '⠜';
    } else if (current <= mediumHigh && prev !== null && prev > mediumHigh) {
      return '⠑';
    } else if (current <= mediumHigh) {
      return '⠒';
    } else if (prev !== null && prev <= mediumHigh) {
      return '⠊';
    } else if (current <= high) {
      return '⠉';
    }
    return '';
  }

  /**
   * Gets the appropriate 6-dot braille character based on value and trend.
   * @param current - Current value
   * @param prev - Previous value for trend calculation
   * @param low - Low threshold
   * @param medium - Medium threshold
   * @param high - High threshold
   * @returns Braille character representing the value and trend
   */
  public getBraille6Char(
    current: number,
    prev: number | null,
    low: number,
    medium: number,
    high: number,
  ): string {
    const level = (val: number): 'low' | 'medium' | 'high' => {
      if (val <= low)
        return 'low';
      if (val <= medium)
        return 'medium';
      if (val <= high)
        return 'high';
      return 'high';
    };

    const currLevel = level(current);
    const prevLevel = prev !== null ? level(prev) : null;

    const brailleMap: Record<string, string> = {
      'low,medium': '⠢', // down from med
      'low,high': '⠣', // down from high
      'low,null': '⠤', // steady low
      'low,low': '⠤', // steady low (same level)
      'medium,low': '⠔', // up from low
      'medium,high': '⠑', // down from high
      'medium,null': '⠒', // steady medium
      'medium,medium': '⠒', // steady medium (same level)
      'high,low': '⠜', // up from low
      'high,medium': '⠊', // up from med
      'high,null': '⠉', // steady high
      'high,high': '⠉', // steady high (same level)
    };

    const key = `${currLevel},${prevLevel}`;
    return brailleMap[key] || '';
  }

  /**
   * Adds dot 8 to a braille character for additional information encoding.
   * @param char - Base braille character
   * @returns Braille character with dot 8 added
   */
  public addDot8(char: string): string {
    if (!char || char.length === 0) {
      // If no base character, return just dot 8 (⣀)
      return String.fromCharCode(0x2800 + 0x80);
    }
    const code = char.charCodeAt(0);
    const dotPattern = code - 0x2800;
    const withDot8 = dotPattern | 0x80;
    return String.fromCharCode(0x2800 + withDot8);
  }
}

/**
 * Encoder for converting candlestick chart data into braille patterns.
 */
class CandlestickBrailleEncoder extends AbstractTimeSeriesEncoder<CandlestickBrailleState> {
  /**
   * Gets threshold values for candlestick data categorization.
   * @param row - Row index
   * @param state - Candlestick braille state
   * @returns Threshold values for low, medium, and high levels
   */
  protected getThresholds(
    row: number,
    state: CandlestickBrailleState,
  ): {
    low: number;
    medium: number;
    high: number;
  } {
    // Defensive: support both array and single value for min/max
    const min = Array.isArray(state.min) ? state.min[row] : state.min;
    const max = Array.isArray(state.max) ? state.max[row] : state.max;
    const range = (max - min) / 3;
    const low = min + range;
    const medium = low + range;
    const high = max;
    return { low, medium, high };
  }

  /**
   * Encodes a single candlestick point using 6-dot braille and optional bear indicator.
   * @param state - Candlestick braille state
   * @param row - Row index
   * @param col - Column index
   * @returns Encoded braille character for the given point
   */
  protected override encodeCell(
    state: CandlestickBrailleState,
    row: number,
    col: number,
  ): string {
    const { low, medium, high } = this.getThresholds(row, state);
    const currentValue = state.values[row][col];
    const prevValue = col > 0 ? state.values[row][col - 1] : null;

    let brailleChar = this.getBraille6Char(
      currentValue,
      prevValue,
      low,
      medium,
      high,
    );

    if (state.custom?.[col] === 'Bear') {
      brailleChar = this.addDot8(brailleChar);
    }

    return brailleChar;
  }
}

/**
 * Encoder for converting line chart data into braille patterns.
 */
class LineBrailleEncoder extends AbstractTimeSeriesEncoder<LineBrailleState> {
  /**
   * Gets threshold values for line chart data categorization.
   * @param row - Row index
   * @param state - Line chart braille state
   * @returns Threshold values for low, medium, mediumHigh, and high levels
   */
  protected getThresholds(
    row: number,
    state: LineBrailleState,
  ): {
    low: number;
    medium: number;
    mediumHigh: number;
    high: number;
  } {
    const range = (state.max[row] - state.min[row]) / 4;
    const low = state.min[row] + range;
    const medium = low + range;
    const mediumHigh = medium + range;
    const high = state.max[row];
    return { low, medium, mediumHigh, high };
  }
}

/**
 * Service responsible for managing braille display generation and navigation.
 */
export class BrailleService
implements Observer<SubplotState | TraceState>, Disposable {
  private readonly context: Context;
  private readonly notification: NotificationService;
  private readonly display: DisplayService;

  private enabled: boolean;
  private displaySize: number;
  private displayLines: number;
  private colOffset: number;
  private cacheId: string;
  private cache: EncodedBraille | null;
  private readonly disposables: Disposable[];

  private readonly encoders: Map<TraceType, BrailleEncoder<NonEmptyBrailleState>>;
  private readonly onChangeEmitter: Emitter<BrailleChangedEvent>;
  public readonly onChange: Event<BrailleChangedEvent>;

  /**
   * Creates an instance of BrailleService.
   * @param context - Navigation context
   * @param notification - Service for user notifications
   * @param display - Service for managing display focus
   */
  public constructor(
    context: Context,
    notification: NotificationService,
    display: DisplayService,
    settings: SettingsService,
  ) {
    this.context = context;
    this.notification = notification;
    this.display = display;

    this.enabled = false;
    this.displaySize = normalizeDisplaySize(
      settings.get<number>(BRAILLE_DISPLAY_SIZE_SETTING),
    );
    this.displayLines = normalizeDisplayLines(
      settings.get<number>(BRAILLE_DISPLAY_LINES_SETTING),
    );
    this.colOffset = 0;
    this.cacheId = Constant.EMPTY;
    this.cache = null;
    this.disposables = [];

    // Encoders are heterogeneous: each one accepts only its own concrete
    // braille-state variant. Dispatch is by TraceType, so the map's value type
    // is widened to `BrailleEncoder<NonEmptyBrailleState>` via an `unknown`
    // cast at insertion only — the dispatch guarantees the state passed to
    // `encode()` matches the encoder's expected variant.
    const asGeneric = <T extends NonEmptyBrailleState>(
      encoder: BrailleEncoder<T>,
    ): BrailleEncoder<NonEmptyBrailleState> =>
      encoder as unknown as BrailleEncoder<NonEmptyBrailleState>;

    this.encoders = new Map<TraceType, BrailleEncoder<NonEmptyBrailleState>>([
      [TraceType.BAR, asGeneric(new BarBrailleEncoder())],
      [TraceType.BOX, asGeneric(new BoxBrailleEncoder())],
      [TraceType.CANDLESTICK, asGeneric(new CandlestickBrailleEncoder())],
      [TraceType.DODGED, asGeneric(new BarBrailleEncoder())],
      [TraceType.HEATMAP, asGeneric(new HeatmapBrailleEncoder())],
      [TraceType.HISTOGRAM, asGeneric(new BarBrailleEncoder())],
      [TraceType.LINE, asGeneric(new LineBrailleEncoder())],
      [TraceType.NORMALIZED, asGeneric(new BarBrailleEncoder())],
      [TraceType.SCATTER, asGeneric(new HeatmapBrailleEncoder())],
      [TraceType.SMOOTH, asGeneric(new LineBrailleEncoder())],
      [TraceType.STACKED, asGeneric(new BarBrailleEncoder())],
      [TraceType.VIOLIN_KDE, asGeneric(new LineBrailleEncoder())],
      [TraceType.VIOLIN_BOX, asGeneric(new BoxBrailleEncoder())],
    ]);

    this.onChangeEmitter = new Emitter<BrailleChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    this.disposables.push(settings.onChange((event) => {
      const affectsSize = event.affectsSetting(BRAILLE_DISPLAY_SIZE_SETTING);
      const affectsLines = event.affectsSetting(BRAILLE_DISPLAY_LINES_SETTING);

      if (!affectsSize && !affectsLines) {
        return;
      }

      if (affectsSize) {
        this.displaySize = normalizeDisplaySize(
          event.get<number>(BRAILLE_DISPLAY_SIZE_SETTING),
        );
      }
      if (affectsLines) {
        this.displayLines = normalizeDisplayLines(
          event.get<number>(BRAILLE_DISPLAY_LINES_SETTING),
        );
      }

      this.cache = null;
      this.cacheId = Constant.EMPTY;
      this.colOffset = 0;

      if (!this.enabled) {
        return;
      }

      const state = this.context.state;
      if (state != null && (state.type === 'trace' || state.type === 'subplot')) {
        this.update(state);
      }
    }));
  }

  /**
   * Cleans up braille service resources and clears caches.
   */
  public dispose(): void {
    this.onChangeEmitter.dispose();
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables.length = 0;

    this.cache = null;
    this.encoders.clear();
  }

  /**
   * Returns whether braille mode is currently enabled.
   */
  public get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Refreshes the braille display with the given trace state. Called
   * explicitly when entering a new subplot with braille enabled, because
   * the model's {@link notifyStateUpdate} is not invoked on entry (doing
   * so would fan out to all observers, including AudioService, causing
   * an unwanted tone).
   * @param state - The trace state to display
   */
  public refreshDisplay(state: TraceState): void {
    this.update(state);
  }

  /**
   * Updates the braille display based on plot state changes.
   * @param state - Updated subplot or trace state
   */
  public update(state: SubplotState | TraceState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    const trace = state.type === 'subplot' ? state.trace : state;
    if (
      trace.empty
      || trace.braille.empty
      || !this.encoders.has(trace.traceType)
    ) {
      return;
    }

    const braille = trace.braille;
    // multiline=true switches the encoder to physical-display mode:
    //   - row separation uses ONLY ASCII spaces (no `\n`), because `\n` does
    //     not render on a multi-line physical braille display — anything
    //     after a `\n` is hidden. Spaces padded to `displaySize` are the
    //     only way to push content onto the next physical display line.
    //   - row order is reversed so row 0 (initially focused) appears at the
    //     bottom of the display and UP-arrow moves the cursor upward.
    const isMultilineMode = this.displayLines > 1;

    // For plots whose rows can overflow a single display line, compute the
    // page-aligned horizontal window that contains the cursor. When no
    // windowing is needed (box plots, narrow rows, single-row data), this
    // still resolves to zero without affecting the cached output — the
    // encoder simply ignores it.
    const willWindow = isMultilineMode && this.willWindowHorizontally(braille);
    const targetOffset = willWindow
      ? Math.max(0, Math.floor(braille.col / this.displaySize) * this.displaySize)
      : 0;
    const cacheKey = willWindow ? `${braille.id}|${targetOffset}` : braille.id;

    if (this.cache === null || this.cacheId !== cacheKey) {
      const encoder = this.encoders.get(trace.traceType)!;
      this.colOffset = targetOffset;
      this.cache = encoder.encode(
        braille,
        this.displaySize,
        isMultilineMode,
        this.colOffset,
      );
      this.cacheId = cacheKey;
    }

    this.onChangeEmitter.fire({
      value: this.cache.value,
      index: this.cache.cellToIndex[braille.row][braille.col],
      displaySize: this.displaySize,
      displayLines: this.displayLines,
    });
  }

  /**
   * Returns true when the active braille state is wide enough to require
   * horizontal page-windowing in multiline mode. Box-plot style braille
   * states are flat arrays of objects and are excluded — each box already
   * spans exactly one display line.
   * @param braille - Current braille state from the active trace
   * @returns Whether horizontal windowing will apply for this state
   */
  private willWindowHorizontally(braille: NonEmptyBrailleState): boolean {
    if (!isGridBrailleState(braille) || braille.values.length <= 1) {
      return false;
    }
    for (const row of braille.values) {
      if (row.length > this.displaySize) {
        return true;
      }
    }
    return false;
  }

  /**
   * Moves the navigation cursor to a specific braille index position.
   * @param index - Target index in the braille display
   */
  public moveToIndex(index: number): void {
    if (
      !this.enabled
      || this.cache === null
      || index < 0
      || index >= this.cache.indexToCell.length
    ) {
      return;
    }

    const { row, col } = this.cache.indexToCell[index];
    this.context.moveToIndex(row, col);
  }

  /**
   * Toggles braille mode on or off for the current trace.
   * @param state - Current trace state
   */
  public toggle(state: TraceState): void {
    if (state.empty) {
      const noInfo = 'No info for braille';
      this.notification.notify(noInfo);
      return;
    }

    if (state.braille.empty) {
      const notSupported = `Braille is not supported for plot type: ${state.braille.traceType}`;
      this.notification.notify(notSupported);
      return;
    }

    this.enabled = !this.enabled;
    this.update(state);
    this.display.toggleFocus(Scope.BRAILLE);

    const message = `Braille is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
