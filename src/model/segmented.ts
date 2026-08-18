import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { DescriptionState, HighlightState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractBarPlot, isMeasured } from './bar';

const SUM = 'Sum';
const UNDEFINED = 'undefined';

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
    for (let i = 0; i < this.barValues[0].length; i++) {
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
            z: SUM,
          }
        : {
            x: sum,
            y: this.points[0][i].y,
            z: SUM,
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
      label: `Max ${groupLabel} at ${maxCategoryLabel}`,
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
      label: `Min ${groupLabel} at ${minCategoryLabel}`,
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
  private getGroupLabel(groupIndex: number): string {
    if (this.points[groupIndex] && this.points[groupIndex].length > 0) {
      const firstPoint = this.points[groupIndex][0];

      // Check if this is the summary level
      if (groupIndex === this.barValues.length - 1) {
        return 'Total';
      }

      // For dodged/stacked plots, use the z value as group identifier
      if (firstPoint.z) {
        return `${this.getZAxisLabel()}: '${firstPoint.z}'`;
      }
    }

    return `Group ${groupIndex}`;
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
    return `Category ${categoryIndex}`;
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

    const zCategories = [
      ...new Set(
        dataPoints.map(row => row[0]?.z).filter(Boolean),
      ),
    ] as string[];

    const stats: DescriptionState['stats'] = [
      { label: 'Number of bars', value: this.points[0].length },
      ...this.rangeStats(),
      { label: 'Number of groups', value: dataPoints.length },
      { label: `${this.z} categories`, value: zCategories.join(', ') },
    ];

    const headers = isVertical
      ? [this.xAxis, this.yAxis, this.z]
      : [this.yAxis, this.xAxis, this.z];

    const rows: (string | number)[][] = dataPoints.flatMap(group =>
      group.map((p) => {
        const main = isVertical ? p.x : p.y;
        const cross = isVertical ? p.y : p.x;
        return [main, cross, p.z ?? UNDEFINED];
      }),
    );

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  protected override get text(): TextState {
    return {
      ...super.text,
      z: {
        label: this.z,
        value: this.points[this.row][this.col].z ?? UNDEFINED,
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

    const domElements = Svg.selectAllElements(selector);
    if (domElements.length === 0) {
      return null;
    }

    // Count total expected data points (excluding summary row added later).
    const totalExpected = this.barValues.reduce((sum, row) => sum + row.length, 0);
    // Only skip zeros when DOM has fewer elements than data points
    // (e.g. Plotly histograms omit zero-height bins). When counts match
    // (e.g. Plotly stacked bars render zero-height segments), map 1:1.
    const skipZeros = domElements.length < totalExpected;

    const isRowMajor = this.layer.domMapping?.order === 'row';
    const isForward = this.groupsRunForward;

    const svgElements = new Array<Array<SVGElement>>();
    if (domElements[0] instanceof SVGPathElement) {
      // Path-element branch (used by Vega-Lite, which renders bars as
      // `<path>` elements). Honour `domMapping` the same way the rect
      // branch below does, so adapters that detect runtime DOM order
      // can correctly align segmented data with the rendered chart.
      for (let r = 0; r < this.barValues.length; r++) {
        svgElements.push(new Array<SVGElement>());
      }

      if (isRowMajor || !this.layer.domMapping) {
        // Row-major DOM order (default for path marks): DOM is laid out
        // [series0-all-cats, series1-all-cats, ...]. This was the
        // pre-existing behaviour and is preserved as the fallback when
        // no `domMapping` hint is supplied by an adapter.
        for (let r = 0, domIndex = 0; r < this.barValues.length; r++) {
          for (let c = 0; c < this.barValues[r].length; c++) {
            if (skipZeros && isDomOmittable(this.barValues[r][c])) {
              svgElements[r].push(Svg.createEmptyElement());
            } else if (domIndex >= domElements.length) {
              svgElements[r].push(Svg.createEmptyElement());
            } else {
              svgElements[r].push(domElements[domIndex++]);
            }
          }
        }
      } else {
        // Column-major DOM order: DOM is laid out
        // [cat0-all-series, cat1-all-series, ...].
        if (!this.barValues[0]) {
          return null;
        }
        for (let c = 0, domIndex = 0; c < this.barValues[0].length; c++) {
          if (isForward) {
            for (let r = 0; r < this.barValues.length; r++) {
              if (skipZeros && isDomOmittable(this.barValues[r][c])) {
                svgElements[r].push(Svg.createEmptyElement());
              } else if (domIndex >= domElements.length) {
                svgElements[r].push(Svg.createEmptyElement());
              } else {
                svgElements[r].push(domElements[domIndex++]);
              }
            }
          } else {
            for (let r = this.barValues.length - 1; r >= 0; r--) {
              if (skipZeros && isDomOmittable(this.barValues[r][c])) {
                svgElements[r].push(Svg.createEmptyElement());
              } else if (domIndex >= domElements.length) {
                svgElements[r].push(Svg.createEmptyElement());
              } else {
                svgElements[r].push(domElements[domIndex++]);
              }
            }
          }
        }
      }
    } else if (domElements[0] instanceof SVGRectElement) {
      // Safety check: ensure barValues is valid
      if (!this.barValues || this.barValues.length === 0) {
        return null;
      }

      for (let r = 0; r < this.barValues.length; r++) {
        svgElements.push(new Array<SVGElement>());
      }

      const isRowMajor = this.layer.domMapping?.order === 'row';
      const isForward = this.groupsRunForward;

      if (isRowMajor) {
        // Row-major DOM order: DOM elements are [series0-all-cats, series1-all-cats, ...]
        // This matches Google Charts rendering order.
        for (let r = 0, domIndex = 0; r < this.barValues.length; r++) {
          if (!this.barValues[r]) {
            continue;
          }
          for (let c = 0; c < this.barValues[r].length; c++) {
            if (skipZeros && isDomOmittable(this.barValues[r][c])) {
              svgElements[r].push(Svg.createEmptyElement());
            } else if (domIndex >= domElements.length) {
              // Fill with empty element instead of returning empty array
              svgElements[r].push(Svg.createEmptyElement());
            } else {
              svgElements[r].push(domElements[domIndex++]);
            }
          }
        }
      } else {
        // Column-major DOM order (default): DOM elements are [cat0-all-series, cat1-all-series, ...]
        if (!this.barValues[0]) {
          return null;
        }
        for (let c = 0, domIndex = 0; c < this.barValues[0].length; c++) {
          if (isForward) {
            for (let r = 0; r < this.barValues.length; r++) {
              if (skipZeros && isDomOmittable(this.barValues[r][c])) {
                svgElements[r].push(Svg.createEmptyElement());
              } else if (domIndex >= domElements.length) {
                // Fill with empty element instead of returning empty array
                svgElements[r].push(Svg.createEmptyElement());
              } else {
                svgElements[r].push(domElements[domIndex++]);
              }
            }
          } else {
            for (let r = this.barValues.length - 1; r >= 0; r--) {
              if (skipZeros && isDomOmittable(this.barValues[r][c])) {
                svgElements[r].push(Svg.createEmptyElement());
              } else if (domIndex >= domElements.length) {
                // Fill with empty element instead of returning empty array
                svgElements[r].push(Svg.createEmptyElement());
              } else {
                svgElements[r].push(domElements[domIndex++]);
              }
            }
          }
        }
      }
    }
    return svgElements;
  }
}
