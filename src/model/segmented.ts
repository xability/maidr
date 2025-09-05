import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { HighlightState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractBarPlot } from './bar';

const SUM = 'Sum';
const LEVEL = 'Level';
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

      const point
        = this.orientation === Orientation.VERTICAL
          ? {
            x: this.points[0][i].x,
            y: sum,
            fill: SUM,
          }
          : {
            x: sum,
            y: this.points[0][i].y,
            fill: SUM,
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

      // For dodged/stacked plots, use the fill value as group identifier
      if (firstPoint.fill) {
        return `${this.getFillAxisLabel()}: '${firstPoint.fill}'`;
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
   * Get the label for the fill axis (e.g., "Drive", "Survival Status")
   * @returns The fill axis label
   */
  private getFillAxisLabel(): string {
    // Try to get from the layer axes, fallback to generic label
    return 'Category';
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

  protected text(): TextState {
    return {
      ...super.text(),
      fill: {
        label: LEVEL,
        value: this.points[this.row][this.col].fill ?? UNDEFINED,
      },
    };
  }

  protected highlight(): HighlightState {
    if (this.highlightValues === null || this.row === this.barValues.length - 1) {
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
        audio: {
          index: 0,
          size: 0,
          groupIndex: 0,
        },
      };
    }

    return {
      empty: false,
      elements: this.highlightValues[this.row][this.col],
    };
  }

  protected hasMultiPoints(): boolean {
    // Stacked bar plots should not use combined/separate audio modes
    return false;
  }

  protected mapToSvgElements(selector?: string): SVGElement[][] {
    if (!selector) {
      return new Array<Array<SVGElement>>();
    }

    const domElements = Svg.selectAllElements(selector);
    if (domElements.length === 0) {
      return new Array<Array<SVGElement>>();
    }

    const svgElements = new Array<Array<SVGElement>>();
    if (domElements[0] instanceof SVGPathElement) {
      for (let r = 0, domIndex = 0; r < this.barValues.length; r++) {
        const row = new Array<SVGElement>();
        for (let c = 0; c < this.barValues[r].length; c++) {
          if (domIndex >= domElements.length) {
            return new Array<Array<SVGElement>>();
          } else if (this.barValues[r][c] === 0) {
            row.push(Svg.createEmptyElement());
          } else {
            row.push(domElements[domIndex++]);
          }
        }
        svgElements.push(row);
      }
    } else if (domElements[0] instanceof SVGRectElement) {
      for (let r = 0; r < this.barValues.length; r++) {
        svgElements.push(new Array<SVGElement>());
      }
      for (let c = 0, domIndex = 0; c < this.barValues[0].length; c++) {
        for (let r = this.barValues.length - 1; r >= 0; r--) {
          if (domIndex >= domElements.length) {
            return new Array<Array<SVGElement>>();
          } else if (this.barValues[r][c] === 0) {
            svgElements[r].push(Svg.createEmptyElement());
          } else {
            svgElements[r].push(domElements[domIndex++]);
          }
        }
      }
    }
    return svgElements;
  }
}
