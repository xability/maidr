import type { MaidrLayer, MosaicPoint } from '@type/grammar';
import type { DescriptionState, TextState } from '@type/state';
import { SegmentedTrace } from './segmented';

/**
 * Formats a fraction as a percentage, to one decimal place.
 *
 * @param fraction - A fraction, where 1 is everything
 * @returns The percentage, as text
 */
function asPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * Trace implementation for mosaic and marimekko plots.
 *
 * A two-way contingency table drawn as tiles: the segments within a column
 * are a category's conditional proportions, and the column's **width** is
 * that category's share of all observations. The segmented bar already
 * navigates category-then-series, so what is new is the width.
 *
 * **The width is data, not layout.** Everywhere else in MAIDR a bar's width
 * is how the chart was drawn and carries nothing; here it is the second
 * magnitude the plot exists to show. A reader given only the heights has
 * half the table -- the conditional proportions without the group sizes they
 * were computed from -- so a category of six people and one of six hundred
 * read identically, and the whole point of a mosaic is that they do not look
 * the same.
 *
 * So every cell announces its column's share alongside its own proportion:
 * "First class, 15% of all, Survived is 62%"*. The cell count travels too
 * when the producer has the table it was drawn from, since a mosaic is drawn
 * from* counts and they are the numbers a reader would quote back.
 */
export class MosaicTrace extends SegmentedTrace {
  /** Each column's share of all observations, or NaN where none was given. */
  private readonly widths: number[];

  /**
   * Creates a new mosaic trace.
   *
   * @param layer - The MAIDR layer carrying the table
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const columns = this.barValues[0]?.length ?? 0;
    this.widths = Array.from({ length: columns }, (_, col) => this.widthAt(col));
  }

  /** The table as this trace reads it, without the appended summary row. */
  private get cells(): MosaicPoint[][] {
    return this.points as MosaicPoint[][];
  }

  /**
   * The share declared for a column.
   *
   * Read from the first series that declares one rather than from a fixed
   * row: the width belongs to the column, so any cell of it carries the same
   * number, and a producer that only put it on the first segment is emitting
   * something perfectly sensible.
   *
   * @param col - Which column
   * @returns The share, or NaN when the column declares none
   */
  private widthAt(col: number): number {
    // The last row is the summary the segmented bar appends, which is not a
    // series of the table and carries no width of its own.
    for (let row = 0; row < this.cells.length - 1; row++) {
      const width = this.cells[row]?.[col]?.width;
      if (typeof width === 'number' && Number.isFinite(width)) {
        return width;
      }
    }
    return Number.NaN;
  }

  /**
   * The total count in a column, when the table carries counts.
   *
   * @param col - Which column
   * @returns The column's total, or null when no cell of it declares a count
   */
  private countAt(col: number): number | null {
    let total: number | null = null;
    for (let row = 0; row < this.cells.length - 1; row++) {
      const count = this.cells[row]?.[col]?.count;
      if (typeof count === 'number' && Number.isFinite(count)) {
        total = (total ?? 0) + count;
      }
    }
    return total;
  }

  protected override get text(): TextState {
    const base = super.text;
    const state: TextState = { ...base };

    // Both of these sit on neither axis -- a share of the whole chart and a
    // tally -- so they travel as asides. `section` fuses onto the cross-axis
    // label whenever `z` is set, and a segmented trace always sets `z`, so a
    // share put there read "15.0% of all Proportion is 0.62": the proportion
    // announced as though it were the share. `stack` would have been
    // formatted with the cross axis's own format, so a percent format
    // declared for a proportion axis would announce a count of 203 as
    // "20300.0%".
    const asides: { label: string; value: string }[] = [];

    const width = this.widths[this.col];
    if (Number.isFinite(width)) {
      asides.push({ label: 'Share of all', value: asPercent(width) });
    }

    // The summary row the segmented bar appends is a column total, not a
    // cell, so it has no count of its own to report.
    const isSummaryRow = this.row === this.barValues.length - 1;
    const cell = this.cells[this.row]?.[this.col];
    if (!isSummaryRow && typeof cell?.count === 'number'
      && Number.isFinite(cell.count)) {
      asides.push({ label: 'Count', value: String(cell.count) });
    }

    if (asides.length > 0) {
      state.asides = asides;
    }

    return state;
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const stats = [...base.stats];

    const named = this.widths
      .map((width, col) => ({ col, width }))
      .filter(entry => Number.isFinite(entry.width));

    if (named.length > 0) {
      // The marginal distribution, which is the axis a mosaic adds and the
      // one a reader cannot accumulate by walking the segments: every column
      // announces its own share, and nothing says how they compare.
      stats.push({
        label: 'Share of all observations',
        value: named
          .map(({ col, width }) => `${this.categoryNameAt(col)} ${asPercent(width)}`)
          .join(', '),
      });

      const widest = named.reduce((a, b) => (a.width > b.width ? a : b));
      const narrowest = named.reduce((a, b) => (a.width < b.width ? a : b));
      if (widest.col !== narrowest.col) {
        // Which group the table mostly describes, and which one its
        // proportions rest on least. A conditional proportion computed from
        // six observations and one computed from six hundred are announced
        // identically, and this is the only thing that separates them.
        stats.push({
          label: 'Largest group',
          value: `${this.categoryNameAt(widest.col)}, ${asPercent(widest.width)}`,
        });
        stats.push({
          label: 'Smallest group',
          value: `${this.categoryNameAt(narrowest.col)}, ${asPercent(narrowest.width)}`,
        });
      }
    }

    const total = this.grandTotal();
    if (total !== null) {
      stats.push({ label: 'Total observations', value: total });
    }

    return { ...base, stats };
  }

  /**
   * What a column is called.
   *
   * @param col - Which column
   * @returns Its name
   */
  private categoryNameAt(col: number): string {
    const point = this.cells[0]?.[col];
    if (point === undefined) {
      return `Category ${col + 1}`;
    }
    const name = this.orientationIsVertical() ? point.x : point.y;
    return name === undefined || name === '' ? `Category ${col + 1}` : String(name);
  }

  /**
   * Whether the chart is drawn with its categories across the page.
   *
   * A horizontal bar layer carries its category on `y` and its magnitude on
   * `x`, so which field names a column depends on how the chart was drawn --
   * and a mosaic is drawn either way.
   *
   * @returns True for a vertical layer
   */
  private orientationIsVertical(): boolean {
    return this.layer.orientation !== 'horz';
  }

  /**
   * Every count in the table, added up.
   *
   * @returns The total, or null when the table carries no counts
   */
  private grandTotal(): number | null {
    let total = 0;
    for (let col = 0; col < this.widths.length; col++) {
      const column = this.countAt(col);
      if (column === null) {
        // A column with no counts makes the sum a partial one, and a partial
        // sum announced as "Total observations" is a number the reader will
        // take for the size of the table. Silence is the honest answer:
        // counts are an all-or-nothing property of having the contingency
        // table the chart was drawn from.
        return null;
      }
      total += column;
    }
    return this.widths.length > 0 ? total : null;
  }
}
