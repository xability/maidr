import type { ExtremaTarget } from '@type/extrema';
import type { LinePoint, MaidrLayer, PercentileBandPoint } from '@type/grammar';
import type { AudioState, BrailleState, DescriptionState, TextState, TraceState } from '@type/state';
import { defaultLabelFormat, FormatUtil } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { MAX_DESCRIPTION_TABLE_ROWS } from './abstract';
import { isMeasured, toBarValue } from './bar';
import { percentileLabel } from './boxen';
import { LineTrace } from './line';

/**
 * How close two levels have to be to count as one. Producers write the same
 * quantile as `0.1587` in one point and `0.15870000000000001` in the next
 * when they compute it, and those are one row, not two.
 */
const LEVEL_TOLERANCE = 1e-9;

/** The level a band surrounds. */
const MEDIAN_LEVEL = 0.5;

/**
 * The share of the distribution the band announced beside the median covers.
 * One standard deviation either side of a normal median holds 68.27% of it,
 * which is the band TensorBoard, `fan_chart` and most quantile bands draw
 * darkest and the one a reader asks about first.
 */
const REFERENCE_COVERAGE = 0.6827;

/** A value formatter, as an axis format resolves to one. */
type FormatFunction = (value: number | string) => string;

/**
 * One nested band: the rows of its lower and upper bound, which sit at the
 * same distance from the ends of the sorted levels.
 */
interface Band {
  lower: number;
  upper: number;
}

/**
 * The layer's quantile levels: every level any point declares, from 0 to 1,
 * sorted and with near-equal ones merged.
 *
 * @param points - The band's points
 * @returns The levels, lowest first
 */
function levelsOf(points: readonly PercentileBandPoint[]): number[] {
  const all = points
    .flatMap(point => (Array.isArray(point?.quantiles) ? point.quantiles : []))
    .map(quantile => quantile?.level)
    .filter((level): level is number =>
      typeof level === 'number' && Number.isFinite(level) && level >= 0 && level <= 1)
    .sort((a, b) => a - b);

  const levels: number[] = [];
  for (const level of all) {
    if (levels.length === 0 || level - levels[levels.length - 1] > LEVEL_TOLERANCE) {
      levels.push(level);
    }
  }
  return levels;
}

/**
 * The value a point declares at one level, or `null` when it declares none
 * or declares a gap.
 *
 * @param point - The point
 * @param level - The level to read
 * @returns The value, or `null`
 */
function valueAt(point: PercentileBandPoint | undefined, level: number): number | null {
  const quantiles = Array.isArray(point?.quantiles) ? point.quantiles : [];
  const quantile = quantiles.find(q => typeof q?.level === 'number' && Math.abs(q.level - level) <= LEVEL_TOLERANCE);
  const value = toBarValue(quantile?.value);
  return isMeasured(value) ? value : null;
}

/**
 * The band's points, read defensively: a payload that is not a list of
 * points is an empty band rather than a throw that takes the figure down.
 *
 * @param layer - The layer as the producer declared it
 * @returns Its points
 */
function pointsOf(layer: MaidrLayer): PercentileBandPoint[] {
  return Array.isArray(layer.data) ? layer.data as PercentileBandPoint[] : [];
}

/**
 * The band as a multi-line layer: one series per quantile level, lowest
 * first, each sampled at every x of the band.
 *
 * Every row has one entry per x, so a column is the same x in every row and
 * an up or down move never has to search for it; a quantile a point leaves
 * out is a gap at that x rather than a shorter row.
 *
 * @param layer - The layer as the producer declared it
 * @returns The same layer carrying one line per quantile
 */
function asQuantileLines(layer: MaidrLayer): MaidrLayer {
  const points = pointsOf(layer);
  const lines: LinePoint[][] = levelsOf(points).map(level =>
    points.map(point => ({ x: point?.x, y: valueAt(point, level) })));
  return { ...layer, data: lines };
}

/**
 * A quantile level as a reader knows it: minimum, median and maximum by
 * name, and every other level as its percentile.
 *
 * @param level - The level, from 0 to 1
 * @returns Its name
 */
function levelName(level: number): string {
  if (level === 0) {
    return t('model.statMinimum');
  }
  if (level === 1) {
    return t('model.statMaximum');
  }
  if (Math.abs(level - MEDIAN_LEVEL) <= LEVEL_TOLERANCE) {
    return t('model.statMedian');
  }
  return percentileLabel(level);
}

/**
 * A share of the distribution as a whole percentage, which is how a band is
 * named -- "middle 68%" -- unless rounding would claim none or all of it.
 *
 * @param share - The share, from 0 to 1
 * @returns The percentage, without its sign
 */
function sharePercent(share: number): string {
  const percent = share * 100;
  const whole = Math.round(percent);
  return whole === 0 || whole === 100 ? String(Number(percent.toFixed(1))) : String(whole);
}

/**
 * Trace implementation for a percentile band, or fan chart: the
 * distribution of a quantity at each x, drawn as nested shaded bands around
 * its median.
 *
 * Structurally a multi-line layer -- one series per quantile, lowest first --
 * so navigation along x, braille and highlighting transfer from
 * {@link LineTrace}. What is different is that **the series are not
 * independent: they bound nested bands.** Read as nine lines, every quantile
 * was pitched against its own range, so the minimum and the median sounded
 * alike; a reader stepping between them heard nine unrelated series; and the
 * thing the chart is drawn to show -- how wide the distribution is, and where
 * it widens -- was never said.
 *
 * - **The reader starts on the median**, the tone the chart is read by, and
 *   up and down walk to the next quantile above or below at the same x.
 * - **Every quantile is pitched against the whole band's range**, so moving
 *   out from the median to a bound is heard as moving out, and the braille
 *   rows are encoded against the same range.
 * - **Every point says the median and the band around it** ("Middle 68% is
 *   -0.31 to 0.35"): the band the cursor's bound belongs to, or, on the
 *   median, the band nearest one standard deviation either side.
 * - **The description says where the spread widens and narrows most**, and
 *   where it is widest and narrowest, which is what a fan chart is drawn for.
 */
export class PercentileBandTrace extends LineTrace {
  private readonly bandPoints: PercentileBandPoint[];

  /** The level of each row, lowest first. */
  private readonly levels: number[];

  /** The row a reader enters on: the median, or the level nearest it. */
  private readonly medianRow: number;

  /** The nested bands, outermost first. */
  private readonly bands: Band[];

  /**
   * The band announced beside the median and measured in the description:
   * the one whose share of the distribution is nearest one standard
   * deviation either side, or null when there is no band.
   */
  private readonly referenceBand: Band | null;

  /** The range every quantile is pitched and brailled against. */
  private readonly bandMin: number;
  private readonly bandMax: number;

  /**
   * Creates a new percentile band trace.
   *
   * @param layer - The MAIDR layer carrying one {@link PercentileBandPoint} per x
   */
  public constructor(layer: MaidrLayer) {
    super(asQuantileLines(layer));

    this.bandPoints = pointsOf(layer);
    this.levels = levelsOf(this.bandPoints);

    let medianRow = -1;
    for (const [row, level] of this.levels.entries()) {
      if (medianRow === -1
        || Math.abs(level - MEDIAN_LEVEL) < Math.abs(this.levels[medianRow] - MEDIAN_LEVEL) - LEVEL_TOLERANCE) {
        medianRow = row;
      }
    }
    this.medianRow = medianRow;

    const count = this.levels.length;
    this.bands = Array.from({ length: Math.floor(count / 2) }, (_band, k) => ({
      lower: k,
      upper: count - 1 - k,
    }));

    let reference: Band | null = null;
    for (const band of this.bands) {
      // `<=` so a tie takes the inner band, which comes later.
      if (reference === null
        || Math.abs(this.coverage(band) - REFERENCE_COVERAGE)
        <= Math.abs(this.coverage(reference) - REFERENCE_COVERAGE)) {
        reference = band;
      }
    }
    this.referenceBand = reference;

    const measured = this.lineValues.flat().filter(isMeasured);
    this.bandMin = MathUtil.safeMin(measured);
    this.bandMax = MathUtil.safeMax(measured);
  }

  public override dispose(): void {
    this.bandPoints.length = 0;
    this.levels.length = 0;
    this.bands.length = 0;
    super.dispose();
  }

  /**
   * The share of the distribution a band holds.
   *
   * @param band - The band
   * @returns Its upper level less its lower one
   */
  private coverage(band: Band): number {
    return this.levels[band.upper] - this.levels[band.lower];
  }

  /**
   * What a band is called: "middle 68%" for one symmetric about the median,
   * "full range" for the minimum to the maximum, and its two levels by name
   * otherwise.
   *
   * @param band - The band
   * @returns Its name
   */
  private bandName(band: Band): string {
    const lower = this.levels[band.lower];
    const upper = this.levels[band.upper];
    if (lower === 0 && upper === 1) {
      return t('model.bandFullRange');
    }
    if (Math.abs(lower + upper - 1) <= 1e-6) {
      return t('model.bandMiddle', { percent: sharePercent(upper - lower) });
    }
    return t('model.bandBetween', { lower: levelName(lower), upper: levelName(upper) });
  }

  /**
   * The band a row bounds, or null for the median, which bounds none.
   *
   * @param row - The quantile row
   * @returns The band
   */
  private bandOf(row: number): Band | null {
    return this.bands.find(band => band.lower === row || band.upper === row) ?? null;
  }

  /**
   * The formatter for the value axis, so the median and the bands read as
   * the cross value beside them does.
   *
   * @returns The y axis formatter
   */
  private get formatValue(): FormatFunction {
    return FormatUtil.wrapFormat(FormatUtil.resolveFormat(this.layer.axes?.y?.format));
  }

  /**
   * The formatter for x, for the positions the description names.
   *
   * @returns The x axis formatter, or the label format when the axis has none
   */
  private get formatX(): FormatFunction {
    const format = this.layer.axes?.x?.format;
    return format === undefined
      ? defaultLabelFormat
      : FormatUtil.wrapFormat(FormatUtil.resolveFormat(format));
  }

  /**
   * A band's width at one x, or `NaN` where either bound is a gap.
   *
   * @param band - The band
   * @param col - The x position
   * @returns The upper bound less the lower one
   */
  private widthAt(band: Band, col: number): number {
    const lower = this.lineValues[band.lower]?.[col];
    const upper = this.lineValues[band.upper]?.[col];
    return isMeasured(lower) && isMeasured(upper) ? upper - lower : Number.NaN;
  }

  /**
   * A band at one x as it is announced: its two bounds.
   *
   * @param band - The band
   * @param col - The x position
   * @returns The aside
   */
  private bandAside(band: Band, col: number): { label: string; value: string } {
    const format = this.formatValue;
    return {
      label: this.bandName(band),
      value: t('model.spanRange', {
        min: format(this.lineValues[band.lower][col]),
        max: format(this.lineValues[band.upper][col]),
      }),
    };
  }

  /**
   * Starts on the median, the tone the band is read by, rather than on the
   * lowest quantile.
   */
  protected override enterTrace(): void {
    super.enterTrace();
    if (this.row !== -1 && this.medianRow !== -1) {
      this.row = this.medianRow;
    }
  }

  /**
   * The next quantile up or down at the cursor's own x.
   *
   * Quantiles are ordered by level, so the row above is the bound above; a
   * line looks for the nearest series by value, which on a band whose bounds
   * meet -- every quantile of a constant distribution is one value -- would
   * skip or stall. A gap is stepped over, since it bounds nothing.
   *
   * @param direction - UPWARD for the next quantile above, DOWNWARD for the next below
   * @returns The row and column to move to, or null at the outermost bound
   */
  protected override findVerticalTarget(
    direction: 'UPWARD' | 'DOWNWARD',
  ): { row: number; col: number } | null {
    if (this.lineValues[this.row]?.[this.col] === undefined) {
      return null;
    }
    const step = direction === 'UPWARD' ? 1 : -1;
    for (let row = this.row + step; row >= 0 && row < this.lineValues.length; row += step) {
      if (isMeasured(this.lineValues[row][this.col])) {
        return { row, col: this.col };
      }
    }
    return null;
  }

  protected override get audio(): AudioState {
    const base = super.audio;
    return { ...base, freq: { ...base.freq, min: this.bandMin, max: this.bandMax } };
  }

  protected override get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.lineValues,
      min: this.lineValues.map(() => this.bandMin),
      max: this.lineValues.map(() => this.bandMax),
      row: this.row,
      col: this.col,
    };
  }

  /**
   * The x, the quantile the cursor is on and its value, then the median and
   * the band around the cursor as asides.
   *
   * On a bound, the band is the one it bounds, so a reader walking the 15.9th
   * percentile hears the middle 68% it is the bottom of. On the median it is
   * the band nearest one standard deviation either side, which is what a
   * fan chart is read for first.
   */
  protected override get text(): TextState {
    const row = this.row;
    const col = this.col;
    const format = this.formatValue;
    const asides: { label: string; value: string }[] = [];

    if (row !== this.medianRow && this.medianRow !== -1) {
      asides.push({
        label: levelName(this.levels[this.medianRow]),
        value: format(this.lineValues[this.medianRow][col]),
      });
    }
    const band = row === this.medianRow ? this.referenceBand : this.bandOf(row);
    if (band !== null) {
      asides.push(this.bandAside(band, col));
    }

    return {
      main: { label: this.xAxis, value: this.bandPoints[col]?.x ?? '' },
      cross: { label: this.yAxis, value: this.lineValues[row]?.[col] ?? Number.NaN },
      section: levelName(this.levels[row]),
      ...(asides.length > 0 ? { asides } : {}),
    };
  }

  protected override authoredGroupNameAt(row: number): string | undefined {
    // Read from the layer's own levels rather than a name stamped on each
    // point at construction, so the name follows the reader's language when
    // it changes. Before this class's fields are assigned there is no level.
    const level = this.levels?.[row];
    return level === undefined ? undefined : levelName(level);
  }

  protected override get groupFallbackLabel(): string {
    return t('model.nounQuantile');
  }

  protected override get seriesLabels(): {
    count: string;
    perSeries: string;
    names: string;
    column: string;
  } {
    return {
      count: t('model.statNumberOfQuantiles'),
      perSeries: t('model.statPointsAlongBand'),
      names: t('model.statQuantileLevels'),
      column: t('model.nounQuantile'),
    };
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const formatValue = this.formatValue;
    const formatX = this.formatX;
    const xAt = (col: number): string => formatX(this.bandPoints[col]?.x ?? '');
    const valueAt = (value: number, col: number): string =>
      t('model.bandValueAt', { value: formatValue(value), at: xAt(col) });

    // The line's total counts every quantile at every x, which is the size
    // of nothing a reader navigates; its table cap is replaced below with
    // the one this table needs.
    const stats = base.stats.filter(
      stat => stat.label !== t('model.statTotalPoints')
        && stat.label !== t('model.statTableRows'),
    );

    const median = this.lineValues[this.medianRow] ?? [];
    const lowest = this.extremeColumn(median, (a, b) => a < b);
    const highest = this.extremeColumn(median, (a, b) => a > b);
    if (lowest !== -1 && highest !== -1) {
      // Where the middle of the distribution runs low and high. Named as the
      // median when it is one, and by its percentile when the levels have no
      // 0.5 and the reader entered on the nearest.
      const level = this.levels[this.medianRow];
      const isMedian = Math.abs(level - MEDIAN_LEVEL) <= LEVEL_TOLERANCE;
      const quantile = levelName(level);
      stats.push(
        {
          label: isMedian ? t('model.statLowestMedian') : t('model.statLowestQuantile', { quantile }),
          value: valueAt(median[lowest], lowest),
        },
        {
          label: isMedian ? t('model.statHighestMedian') : t('model.statHighestQuantile', { quantile }),
          value: valueAt(median[highest], highest),
        },
      );
    }

    const band = this.referenceBand;
    if (band !== null) {
      stats.push(...this.spreadStats(band, valueAt, xAt));
    }

    // One row per x, one column per quantile: the band as it is drawn, where
    // the line's table would list every quantile of every x on its own row.
    const headers = [this.xAxis, ...this.levels.map(level => levelName(level))];
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = ['x', ...this.levels.map(() => 'y' as const)];
    const allRows = this.bandPoints.map((point, col) => [
      point?.x ?? '',
      ...this.lineValues.map(line => (isMeasured(line[col]) ? line[col] : '')),
    ]);
    const rows = allRows.slice(0, MAX_DESCRIPTION_TABLE_ROWS);
    if (allRows.length > rows.length) {
      stats.push({
        label: t('model.statTableRows'),
        value: t('model.statTableRowsFirstOf', { shown: rows.length, total: allRows.length }),
      });
    }

    return { ...base, stats, dataTable: { headers, columnAxes, rows } };
  }

  /**
   * Where a band is widest and narrowest, and where it widens and narrows
   * most from one x to the next -- the questions a fan chart is drawn to
   * answer, and the ones a reader walking it one point at a time cannot.
   *
   * A change is measured only between neighbouring x that both have the
   * band, so a gap does not read as the band collapsing. Ties take the
   * earlier x. A band that never widens -- or never narrows -- says nothing
   * about it rather than naming a change of zero.
   *
   * @param band - The band to measure
   * @param valueAt - Formats a value at an x
   * @param xAt - Formats an x
   * @returns The stats
   */
  private spreadStats(
    band: Band,
    valueAt: (value: number, col: number) => string,
    xAt: (col: number) => string,
  ): DescriptionState['stats'] {
    const name = this.bandName(band);
    const widths = this.bandPoints.map((_point, col) => this.widthAt(band, col));
    const stats: DescriptionState['stats'] = [];

    const widest = this.extremeColumn(widths, (a, b) => a > b);
    const narrowest = this.extremeColumn(widths, (a, b) => a < b);
    if (widest === -1 || narrowest === -1) {
      return stats;
    }
    stats.push(
      { label: t('model.statBandWidest', { band: name }), value: valueAt(widths[widest], widest) },
      { label: t('model.statBandNarrowest', { band: name }), value: valueAt(widths[narrowest], narrowest) },
    );

    let widens: { col: number; change: number } | null = null;
    let narrows: { col: number; change: number } | null = null;
    for (let col = 0; col + 1 < widths.length; col++) {
      const change = widths[col + 1] - widths[col];
      if (!isMeasured(change)) {
        continue;
      }
      if (change > 0 && (widens === null || change > widens.change)) {
        widens = { col, change };
      }
      if (change < 0 && (narrows === null || change < narrows.change)) {
        narrows = { col, change };
      }
    }

    const formatValue = this.formatValue;
    const changeText = (found: { col: number; change: number }): string => t('model.bandChange', {
      from: xAt(found.col),
      to: xAt(found.col + 1),
      change: formatValue(Math.abs(found.change)),
    });
    if (widens !== null) {
      stats.push({ label: t('model.statBandWidensMost', { band: name }), value: changeText(widens) });
    }
    if (narrows !== null) {
      stats.push({ label: t('model.statBandNarrowsMost', { band: name }), value: changeText(narrows) });
    }
    return stats;
  }

  /**
   * The first column whose measured value beats every other by a comparison.
   *
   * @param values - The values, `NaN` for a gap
   * @param beats - True when the first value should replace the second
   * @returns The column, or -1 when nothing is measured
   */
  private extremeColumn(values: readonly number[], beats: (a: number, b: number) => boolean): number {
    let best = -1;
    for (const [col, value] of values.entries()) {
      if (isMeasured(value) && (best === -1 || beats(value, values[best]))) {
        best = col;
      }
    }
    return best;
  }

  public override get state(): TraceState {
    const base = super.state;
    if (base.empty) {
      return base;
    }
    // The line calls itself "multiline", which tells a reader nothing about
    // nested bands.
    return { ...base, plotType: t('model.plotTypePercentileBandSpoken') };
  }

  /**
   * The highest and lowest point of the quantile the cursor is on.
   *
   * The line adds the points where its series cross, and a band's quantiles
   * never cross: where two meet, the distribution has no spread between
   * them, which is not a crossing a reader should be sent to.
   *
   * @returns The targets
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    return super.getExtremaTargets().filter(target => target.type !== 'intersection');
  }

  public override supportsIntersectionMode(): boolean {
    return false;
  }

  /**
   * Whether the layer names one element per band rather than one per
   * quantile: as many selectors as there are bands, and optionally one more
   * for the median's line when the levels have a middle one.
   *
   * The two counts never coincide -- a band has two quantiles -- so the
   * shape is read from the count alone. Read off the layer rather than a
   * field, because it is first asked from the parent's constructor.
   *
   * @param selectors - The layer's selectors
   * @returns True for one selector per band
   */
  private namesBands(selectors?: string[]): boolean {
    const rows = this.lineValues.length;
    const bands = Math.floor(rows / 2);
    return selectors !== undefined
      && bands > 0
      && selectors.length !== rows
      && (selectors.length === bands || (rows % 2 === 1 && selectors.length === bands + 1));
  }

  /**
   * The elements to outline for each quantile at each x.
   *
   * One selector per quantile -- each bound drawn as its own line -- is the
   * line's shape, and a marker walks along the bound with the cursor. One
   * selector per band, outermost first, is how a fan chart is usually drawn:
   * a filled polygon per band, and a bound is outlined as the band it
   * bounds. An extra selector after the bands names the median's line; with
   * none, the median outlines the innermost band, the one it sits inside.
   *
   * A band selector that matches nothing leaves that band's quantiles
   * without an outline and every other band with one.
   *
   * @param selectors - The layer's selectors
   * @returns The elements to outline, point by point
   */
  protected override mapToSvgElements(
    selectors?: string[],
  ): (SVGElement[] | SVGElement)[][] | null {
    if (selectors === undefined || !this.namesBands(selectors)) {
      return super.mapToSvgElements(selectors);
    }

    // Without cloning, as the contour resolves its levels: a hidden copy
    // beside each match shifts the positional selectors of every band after
    // it (#1004).
    const resolved = selectors.map(selector => Svg.selectAllElements<SVGElement>(selector, false));
    if (resolved.every(elements => elements.length === 0)) {
      return null;
    }

    const rows = this.lineValues.length;
    const bands = Math.floor(rows / 2);
    const median = resolved[bands] ?? [];
    return this.lineValues.map((values, row) => {
      const isMiddle = rows % 2 === 1 && row === bands;
      const elements = isMiddle
        ? (median.length > 0 ? median : resolved[bands - 1])
        : resolved[Math.min(row, rows - 1 - row)];
      return elements.length === 0 ? [] : values.map(() => elements);
    });
  }

  /**
   * No hover target when the outline is a band: every x of a quantile
   * outlines the same polygon, so its centre says nothing about which x the
   * pointer is over.
   *
   * @returns The centres, or null for band outlines
   */
  protected override mapSvgElementsToCenters(): ReturnType<LineTrace['mapSvgElementsToCenters']> {
    const selectors = typeof this.layer.selectors === 'string'
      ? [this.layer.selectors]
      : this.layer.selectors as string[] | undefined;
    return this.namesBands(selectors) ? null : super.mapSvgElementsToCenters();
  }
}
