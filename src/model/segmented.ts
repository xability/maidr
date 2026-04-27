import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { DescriptionState, HighlightState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractBarPlot } from './bar';

const SUM = 'Sum';
const UNDEFINED = 'undefined';

export class SegmentedTrace extends AbstractBarPlot<SegmentedPoint> {
  public constructor(layer: MaidrLayer) {
    super(layer, layer.data as SegmentedPoint[][]);
    this.createSummaryLevel();
  }

  private createSummaryLevel(): void {
    const summaryValues = new Array<number>();
    const summaryPoints = new Array<SegmentedPoint>();
    for (let i = 0; i < this.barValues[0].length; i++) {
      const sum = this.barValues.reduce((sum, row) => sum + row[i], 0);
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

    const { min: summaryMin, max: summaryMax } = MathUtil.minMax(summaryValues);
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
    this.finalizeExtremaNavigation();
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
  protected updateVisualPointPosition(): void {
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
      { label: 'Min value', value: MathUtil.safeMin(this.min) },
      { label: 'Max value', value: MathUtil.safeMax(this.max) },
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
      chartType: this.layer.type,
      title: this.title,
      axes: { x: this.xAxis, y: this.yAxis, z: this.z },
      stats,
      dataTable: { headers, rows },
    };
  }

  protected get text(): TextState {
    return {
      ...super.text,
      z: {
        label: this.z,
        value: this.points[this.row][this.col].z ?? UNDEFINED,
      },
    };
  }

  protected get highlight(): HighlightState {
    if (this.highlightValues === null || this.row === this.barValues.length - 1) {
      return this.outOfBoundsState as HighlightState;
    }

    // Defensive check: ensure row and col exist in highlightValues
    const rowElements = this.highlightValues[this.row];
    if (!rowElements || !rowElements[this.col]) {
      return this.outOfBoundsState as HighlightState;
    }

    return {
      empty: false,
      elements: rowElements[this.col],
    };
  }

  protected mapToSvgElements(selector?: string): SVGElement[][] | null {
    if (!selector) {
      return null;
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

    const svgElements = new Array<Array<SVGElement>>();
    if (domElements[0] instanceof SVGPathElement) {
      for (let r = 0, domIndex = 0; r < this.barValues.length; r++) {
        const row = new Array<SVGElement>();
        for (let c = 0; c < this.barValues[r].length; c++) {
          if (skipZeros && this.barValues[r][c] === 0) {
            row.push(Svg.createEmptyElement());
          } else if (domIndex >= domElements.length) {
            return new Array<Array<SVGElement>>();
          } else {
            row.push(domElements[domIndex++]);
          }
        }
        svgElements.push(row);
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
      const isForward = this.layer.domMapping?.groupDirection === 'forward';

      if (isRowMajor) {
        // Row-major DOM order: DOM elements are [series0-all-cats, series1-all-cats, ...]
        // This matches Google Charts rendering order.
        for (let r = 0, domIndex = 0; r < this.barValues.length; r++) {
          if (!this.barValues[r]) {
            continue;
          }
          for (let c = 0; c < this.barValues[r].length; c++) {
            if (skipZeros && this.barValues[r][c] === 0) {
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
              if (skipZeros && this.barValues[r][c] === 0) {
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
              if (skipZeros && this.barValues[r][c] === 0) {
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
