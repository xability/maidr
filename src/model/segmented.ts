import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { DescriptionState, HighlightState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractBarPlot, isMeasured, missingText } from './bar';

function sumLabel(): string {
  return t('model.asideSum');
}

/**
 * Whether a cell is one the chart library may have left out of the DOM.
 *
 * The `skipZeros` alignment below counts a gap as a zero, which is what it did
 * before gaps became `NaN` — `Number(null)` was `0`, so both matched the same
 * check. Keeping that reading is deliberate: this path decides which rendered
 * element belongs to which datum, not what a value means, and treating a gap
 * differently here would shift every later highlight in the row by one.
 *
 * @param value - A magnitude from `barValues`
 * @returns True when the cell may have no element of its own
 */
function isDomOmittable(value: number): boolean {
  return value === 0 || !isMeasured(value);
}

export class SegmentedTrace extends AbstractBarPlot<SegmentedPoint> {
  public constructor(layer: MaidrLayer) {
    super(layer, layer.data as SegmentedPoint[][]);
    this.createSummaryLevel();
  }

  private createSummaryLevel(): void {
    const summaryValues = new Array<number>();
    const summaryPoints = new Array<SegmentedPoint>();
    // A producer can emit `[]` rather than `[[]]` for a chart with nothing to
    // stack. There is then no row to read the categories off, and the summary
    // is an empty row like every other.
    const categories = this.barValues[0]?.length ?? 0;
    for (let i = 0; i < categories; i++) {
      // Sum the measured segments only. Adding a gap in would make the total
      // NaN, and NaN spreads: it would seed MathUtil.minMax below and, through
      // safeMin/safeMax over every row, hand the whole chart a NaN pitch range.
      // A category is only a gap in the total when every segment in it is one.
      const segments = this.barValues.map(row => row[i]).filter(isMeasured);
      const sum = segments.length > 0
        ? segments.reduce((total, value) => total + value, 0)
        : Number.NaN;
      summaryValues.push(sum);

      const point = this.orientation === Orientation.VERTICAL
        ? {
            x: this.points[0][i].x,
            y: sum,
            z: sumLabel(),
          }
        : {
            x: sum,
            y: this.points[0][i].y,
            z: sumLabel(),
          };
      summaryPoints.push(point);
    }
    this.points.push(summaryPoints);
    this.barValues.push(summaryValues);

    const { min: summaryMin, max: summaryMax } = MathUtil.minMax(
      summaryValues.filter(isMeasured),
    );
    this.min.push(summaryMin);
    this.max.push(summaryMax);
  }

  /**
   * Get extrema targets for the current segmented bar plot trace
   * Returns min and max values within the current group the user is navigating
   * @returns Array of extrema targets for navigation
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const targets: ExtremaTarget[] = [];
    const currentGroup = this.row;

    if (currentGroup < 0 || currentGroup >= this.barValues.length) {
      return targets;
    }

    // Use pre-computed min/max values instead of recalculating
    const groupMin = this.min[currentGroup];
    const groupMax = this.max[currentGroup];
    const groupValues = this.barValues[currentGroup];

    if (!groupValues || groupValues.length === 0) {
      return targets;
    }

    // A row of nothing but gaps leaves the range empty, so safeMin/safeMax
    // return ±Infinity, which indexOf cannot find. There is no extreme to
    // navigate to; offering one would move the cursor to column -1.
    if (!isMeasured(groupMin) || !isMeasured(groupMax)) {
      return targets;
    }

    // Find indices of min/max values
    const maxIndex = groupValues.indexOf(groupMax);
    const minIndex = groupValues.indexOf(groupMin);

    // Get group label and category labels
    const groupLabel = this.getGroupLabel(currentGroup);
    const maxCategoryLabel = this.getCategoryLabel(maxIndex);
    const minCategoryLabel = this.getCategoryLabel(minIndex);

    // Inline raw x-value lookup using currentGroup (avoids hidden this.row dependency)
    const maxPoint = this.points[currentGroup]?.[maxIndex];
    const minPoint = this.points[currentGroup]?.[minIndex];
    const maxXValue = maxPoint
      ? (this.orientation === Orientation.VERTICAL ? maxPoint.x : maxPoint.y)
      : undefined;
    const minXValue = minPoint
      ? (this.orientation === Orientation.VERTICAL ? minPoint.x : minPoint.y)
      : undefined;

    // Add max target
    targets.push({
      label: t('model.extremaMaxGroupAt', { group: groupLabel, category: maxCategoryLabel }),
      value: groupMax,
      pointIndex: maxIndex,
      segment: groupLabel,
      type: 'max',
      groupIndex: currentGroup,
      categoryIndex: maxIndex,
      navigationType: 'group',
      xValue: maxXValue,
    });

    // Add min target
    targets.push({
      label: t('model.extremaMinGroupAt', { group: groupLabel, category: minCategoryLabel }),
      value: groupMin,
      pointIndex: minIndex,
      segment: groupLabel,
      type: 'min',
      groupIndex: currentGroup,
      categoryIndex: minIndex,
      navigationType: 'group',
      xValue: minXValue,
    });

    return targets;
  }

  /**
   * Navigate to a specific extrema target
   * @param target The extrema target to navigate to
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    // For group-based navigation, stay in same group but move to different category
    if (target.groupIndex !== undefined && target.categoryIndex !== undefined) {
      this.row = target.groupIndex;
      this.col = target.categoryIndex;
    } else {
      // Fallback to point-based navigation
      this.col = target.pointIndex;
    }

    // Use common finalization method
    this.finalizeNavigation();
  }

  /**
   * Get a human-readable label for the current group
   * @param groupIndex The index of the group
   * @returns A label for the group
   */
  /**
   * What a series is called, in one place, so the summary, the data table and
   * the spoken announcement cannot come to disagree.
   *
   * The first point that carries a `z` names the series -- not `row[0]` alone,
   * which loses a series whose leading point is unnamed and, worse, made the
   * category list shorter than the count printed above it. A series that names
   * itself nowhere is numbered, rather than given the literal text
   * `'undefined'`: the dialog blanks that string by design, so the table's
   * whole series column came out empty, and the announcement said the word
   * aloud.
   *
   * @param index - Zero-based series index
   * @returns The series name
   */
  private seriesNameAt(index: number): string {
    return this.points[index]?.find(point => point.z?.trim())?.z?.trim()
      ?? t('model.nounSeriesNumbered', { index: index + 1 });
  }

  private getGroupLabel(groupIndex: number): string {
    if (this.points[groupIndex] && this.points[groupIndex].length > 0) {
      const firstPoint = this.points[groupIndex][0];

      // Check if this is the summary level
      if (groupIndex === this.barValues.length - 1) {
        return t('model.segmentedTotalGroup');
      }

      // For dodged/stacked plots, use the z value as group identifier
      if (firstPoint.z) {
        return t('model.segmentedGroupNamed', {
          axis: this.getZAxisLabel(),
          value: firstPoint.z,
        });
      }
    }

    return t('model.fallbackGroupIndexed', { index: groupIndex });
  }

  /**
   * Get a human-readable label for a specific category
   * @param categoryIndex The index of the category
   * @returns A label for the category
   */
  private getCategoryLabel(categoryIndex: number): string {
    if (this.points[0] && this.points[0][categoryIndex]) {
      const point = this.points[0][categoryIndex];
      if (this.orientation === Orientation.VERTICAL) {
        return `${point.x}`;
      } else {
        return `${point.y}`;
      }
    }
    return t('model.fallbackCategory', { index: categoryIndex });
  }

  /**
   * Get the label for the z axis (e.g., "Drive", "Survival Status")
   * @returns The z axis label
   */
  private getZAxisLabel(): string {
    // Use the z-axis label from the layer configuration
    return this.z;
  }

  /**
   * Update the visual position of the current point
   * This method should be called when navigation changes
   */
  protected override updateVisualPointPosition(): void {
    // Ensure we're within bounds
    const { row: safeRow, col: safeCol } = this.getSafeIndices();
    this.row = safeRow;
    this.col = safeCol;
  }

  /**
   * Gets the description state for the segmented bar trace.
   * Overrides bar description to include fill category information.
   * @returns The description state containing chart metadata and data table
   */
  public override get description(): DescriptionState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    // Exclude the summary row (last row) for stats and data
    const dataPoints = this.points.slice(0, -1);
    const segmentValues = this.barValues.slice(0, -1);
    const totals = this.barValues.at(-1) ?? [];

    // One name per series, in series order, so the list can be read against
    // the count on the line above it. `row[0]?.z` alone dropped a series whose
    // first point carried no z -- leaving "Number of series: 2" followed by a
    // list of one -- and consulted only the first point, so a producer that
    // names later points lost the series entirely.
    const seriesNames = dataPoints.map((_, index) => this.seriesNameAt(index));

    // `Number of bars` was the *category* count, which happens to equal the
    // bar count only when the bars are stacked. A 3-series by 4-category
    // dodged chart draws twelve and reported four.
    const zLabel = this.layer.axes?.z?.label?.trim();
    const stats: DescriptionState['stats'] = [
      { label: t('model.statNumberOfCategories'), value: this.points[0].length },
      { label: t('model.statNumberOfSeries'), value: dataPoints.length },
      { label: t('model.statNumberOfSegments'), value: segmentValues.flat().length },
      // Over the segments alone: `barValues` carries a synthetic Total row, so
      // the inherited range spanned a number no drawn bar has.
      ...this.rangeStats(
        { min: 'model.statMinSegmentValue', max: 'model.statMaxSegmentValue' },
        segmentValues,
      ),
      // A fixed word when the layer authored no z label, rather than the
      // 'Level' placeholder `getDescriptionAxes` is careful to suppress.
      {
        label: zLabel
          ? t('model.statAxisCategoriesNamed', { axis: zLabel })
          : t('model.statSeriesNamesFallback'),
        value: seriesNames.join(', '),
      },
    ];

    const measuredTotals = totals.filter(isMeasured);
    if (measuredTotals.length > 0) {
      stats.push({ label: t('model.statLargestBarTotal'), value: MathUtil.safeMax(measuredTotals) });
      stats.push({ label: t('model.statSmallestBarTotal'), value: MathUtil.safeMin(measuredTotals) });
    }

    const gaps = segmentValues.flat().filter(value => !isMeasured(value)).length;
    if (gaps > 0) {
      stats.push({ label: t('model.statSegmentsWithNoValue'), value: gaps });
    }

    const headers = isVertical
      ? [this.xAxis, this.yAxis, zLabel ?? t('model.nounSeries')]
      : [this.yAxis, this.xAxis, zLabel ?? t('model.nounSeries')];

    // Swapped on the same condition as the headers above, so the two cannot
    // fall out of step: the category column sits on whichever axis carries the
    // categories and the magnitude on the other. The series column is the
    // fill, which is the z axis the legend is read off.
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = isVertical
      ? ['x', 'y', 'z']
      : ['y', 'x', 'z'];

    // Every row of the navigable grid, the summary row included: a reader can
    // reach it with PageUp and the chart announces it there, so a table that
    // stops short of it does not describe the chart they are walking. The
    // summary row names itself through the same helper, so the table and the
    // announcement call it the same thing. A series with no name is numbered
    // rather than given the literal text 'undefined', which the dialog is
    // required to blank -- leaving a column of nothing.
    const rows: (string | number)[][] = this.points.flatMap((group, index) =>
      group.map((p, col) => {
        const main = isVertical ? p.x : p.y;
        const value = this.barValues[index]?.[col];
        return [
          main,
          isMeasured(value) ? value : missingText(),
          this.seriesNameAt(index),
        ];
      }),
    );

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, columnAxes, rows },
    };
  }

  protected override get text(): TextState {
    return {
      ...super.text,
      z: {
        label: this.z,
        value: this.seriesNameAt(this.row),
      },
    };
  }

  protected override get highlight(): HighlightState {
    if (this.highlightValues === null || this.row === this.barValues.length - 1) {
      return this.outOfBoundsState;
    }

    // Defensive check: ensure row and col exist in highlightValues
    const rowElements = this.highlightValues[this.row];
    if (!rowElements || !rowElements[this.col]) {
      return this.outOfBoundsState;
    }

    return {
      empty: false,
      elements: rowElements[this.col],
    };
  }

  /**
   * Whether a category's DOM elements run in the order the series are declared.
   *
   * A stacked bar's producers draw its segments bottom-up, so the first
   * element of a category is the *last* series -- which is why the default is
   * reverse, and has been since this was called `domOrder`.
   *
   * Only consulted on a column-major layout, which is now declared rather
   * than inferred: a producer that draws category by category says
   * `order: 'column'`, and this then decides which end of the category its
   * elements start from. It used to be reached by any `<rect>`-marked layer
   * that declared nothing, which is what #1003 was about.
   *
   * A subclass whose chart is not stacked has no such convention to inherit,
   * and overriding this is how it says so. `domMapping.groupDirection`
   * overrides either answer, so a producer that draws the other way round can
   * still declare it.
   *
   * @returns True when a category's first element is its first series
   */
  protected get groupsRunForward(): boolean {
    return this.layer.domMapping?.groupDirection === 'forward';
  }

  /**
   * One element per cell, named outright rather than inferred.
   *
   * `selector[r][c]` is the element for series `r`, category `c` -- the same
   * shape `Heatmap` reads, and the shape the plotly adapter emits once
   * `categoryorder` has moved a chart's bars away from the order its traces
   * were written in (#989). Every cell has to resolve: a grid that half
   * resolves would outline some cells and leave others announced with nothing
   * highlighted, which reads as "this bar has no mark" rather than as a
   * failure.
   *
   * The summary row is not among the rows counted here. It is appended after
   * `super()` returns, so `barValues` still holds the series alone while this
   * runs -- and {@link highlight} declines that row anyway.
   *
   * @param grid - One row of selectors per series
   * @returns One element per cell, or null when the grid does not fit
   */
  private mapGridToSvgElements(
    grid: (string | (string | null)[])[],
  ): SVGElement[][] | null {
    // Nothing has to be undone on a bad grid any more: the lookups all finish
    // before the first clone is inserted, so declining leaves the document
    // exactly as it was found.
    if (grid.length !== this.barValues.length) {
      return null;
    }

    // Resolved in two passes, and it has to be. `Svg.selectElement` inserts
    // its clone straight after the element it matched, so a query that runs
    // after it counts one more sibling than the chart drew -- and a positional
    // selector then answers with the clone of an earlier bar instead. Measured
    // on three points addressed by `:nth-child`, resolving them 1, 2, 3 as the
    // rows are read returns the *first* element three times; only 3, 2, 1
    // survives, which is a property of the order a caller happens to emit in
    // rather than of the selectors being right. So every cell is looked up
    // before anything is inserted (#1004).
    const originals = new Array<Array<SVGElement | null>>();
    for (let row = 0; row < grid.length; row++) {
      const cells = grid[row];
      if (!Array.isArray(cells) || cells.length !== this.barValues[row]?.length) {
        return null;
      }

      const found = new Array<SVGElement | null>();
      for (const cell of cells) {
        // A `null` cell says the chart drew nothing there -- a category this
        // series has no bar at. It stands in with a placeholder, the same way
        // the inferred path does for a cell it decides was omitted. A cell
        // that names an element and fails to resolve is a different thing: a
        // mistake, and still fatal to the whole grid.
        if (cell === null) {
          found.push(null);
          continue;
        }
        const element = typeof cell === 'string'
          ? Svg.selectElement<SVGElement>(cell, false)
          : null;
        if (element === null) {
          return null;
        }
        found.push(element);
      }
      originals.push(found);
    }

    const svgElements = originals.map(row => row.map((element) => {
      if (element === null) {
        return Svg.createEmptyElement();
      }
      return Svg.cloneHidden(element);
    }));

    return svgElements;
  }

  protected override mapToSvgElements(
    selector?: string | string[] | (string | null)[][],
  ): SVGElement[][] | null {
    if (!selector) {
      return null;
    }

    // A grid names the element for every cell outright, so none of the
    // inference below applies to it: `skipZeros`, row versus column major and
    // which end a category's series start from are all ways of guessing what
    // a grid has already said.
    //
    // A flat list is still declined, and for the same reason it was when this
    // branch declined every array (#990): it says which bars there are but not
    // which cell each one is in, and the chunking below is exactly what would
    // have to answer that.
    if (Array.isArray(selector)) {
      return this.mapGridToSvgElements(selector);
    }

    // Resolved live; `claim` clones each mark as a cell takes it. Cloning
    // every match up front inserted a hidden copy beside each mark, and a
    // selector matching more marks than there are cells left the surplus
    // copies unreferenced -- so `dispose()` never removed them, and the next
    // resolution matched them too.
    const domElements = Svg.selectAllElements(selector, false);
    if (domElements.length === 0) {
      return null;
    }
    if (this.barValues.length === 0) {
      return null;
    }

    // Count total expected data points (excluding summary row added later).
    const totalExpected = this.barValues.reduce((sum, row) => sum + row.length, 0);
    // Only skip zeros when DOM has fewer elements than data points
    // (e.g. Plotly histograms omit zero-height bins). When counts match
    // (e.g. Plotly stacked bars render zero-height segments), map 1:1.
    const skipZeros = domElements.length < totalExpected;

    // Column-major is opted into, not inferred. This used to be read the
    // other way round -- as `order === 'row'` -- in a branch reached only by
    // `<rect>` marks, while a `<path>` branch beside it read `isRowMajor ||
    // !domMapping`. Same layer, same DOM, same absent `domMapping`, opposite
    // pairings, decided by the tag the charting library happened to draw
    // (#1003). Highcharts drew `<rect>` through v10 and `<path>` from v11
    // with no change to its DOM order, so an upgrade flipped it.
    //
    // The tag now decides nothing: one strategy, one default. A mark that is
    // neither tag is paired like any other rather than falling through both
    // branches and leaving the layer with no highlight at all -- silently,
    // which reads as a chart with no marks rather than as a mistake.
    //
    // Row-major is the default because every producer in the tree either
    // declares its order or draws series-major, so nothing here relies on the
    // other answer. A producer that draws each category's segments bottom-up
    // -- the convention `groupsRunForward` describes -- says so with
    // `order: 'column'` and gets exactly what the rect branch used to give it
    // by default.
    const isColumnMajor = this.layer.domMapping?.order === 'column';
    const isForward = this.groupsRunForward;

    const svgElements = this.barValues.map(() => new Array<SVGElement>());

    // One cursor over the DOM, wherever the walk below goes next. A cell whose
    // mark the producer omitted, and a cell the DOM simply ran out for, both
    // take a placeholder and leave the cursor where it was, so the cells after
    // them still land on their own marks.
    let domIndex = 0;
    const claim = (r: number, c: number): SVGElement => {
      if (skipZeros && isDomOmittable(this.barValues[r][c])) {
        return Svg.createEmptyElement();
      }
      if (domIndex >= domElements.length) {
        return Svg.createEmptyElement();
      }
      return Svg.cloneHidden(domElements[domIndex++]);
    };

    if (!isColumnMajor) {
      // [series0-all-cats, series1-all-cats, ...]
      for (let r = 0; r < this.barValues.length; r++) {
        for (let c = 0; c < this.barValues[r].length; c++) {
          svgElements[r].push(claim(r, c));
        }
      }
    } else {
      // [cat0-all-series, cat1-all-series, ...], each category walked from
      // whichever end `groupsRunForward` says its producer starts at.
      for (let c = 0; c < this.barValues[0].length; c++) {
        for (let i = 0; i < this.barValues.length; i++) {
          const r = isForward ? i : this.barValues.length - 1 - i;
          svgElements[r].push(claim(r, c));
        }
      }
    }

    return svgElements;
  }
}
