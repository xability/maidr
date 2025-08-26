import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { XValue } from '@type/navigation';
import type { HighlightState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractBarPlot } from './bar';

const SUM = 'Sum';
const LEVEL = 'Level';
const UNDEFINED = 'undefined';

export class SegmentedTrace extends AbstractBarPlot<SegmentedPoint> {
  protected readonly supportsExtrema = true;
  public constructor(layer: MaidrLayer) {
    super(layer, layer.data as SegmentedPoint[][]);
    this.createSummaryLevel();
    this.buildNavigableReferences();
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
   * Build navigation references for this segmented trace
   */
  protected buildNavigableReferences(): void {
    this.navigableReferences = [];

    for (let row = 0; row < this.points.length; row++) {
      for (let col = 0; col < this.points[row].length; col++) {
        const point = this.points[row][col];
        const xValue = this.orientation === Orientation.VERTICAL ? point.x : point.y;

        // Get proper group label
        const groupLabel = this.getGroupLabel(row);

        this.navigableReferences.push({
          id: `segmented-${row}-${col}`,
          value: xValue,
          type: typeof xValue === 'number' ? 'coordinate' : 'category',
          position: { row, col },
          context: {
            plotType: this.type,
            orientation: this.orientation,
            groupIndex: row,
          },
          accessibility: {
            description: `Segmented bar at ${xValue} in ${groupLabel}`,
            shortLabel: String(xValue),
            valueType: typeof xValue === 'number' ? 'numeric' : 'categorical',
          },
        });
      }
    }
  }

  /**
   * Override getAvailableXValues to return deduplicated X values with combined group information
   * This prevents showing the same X value multiple times for different groups
   * @returns Array of unique X values with combined group context
   */
  public override getAvailableXValues(): XValue[] {
    // Group references by X value to deduplicate
    const groupedByValue = new Map<any, Array<{ group: string; description: string; position: any }>>();

    // Filter out the Total row (last row) and process only actual group data
    const groupRows = this.navigableReferences.filter(ref =>
      ref.position.row < this.barValues.length - 1, // Exclude the Total row
    );

    groupRows.forEach((ref) => {
      const value = ref.value;
      const groupLabel = this.getGroupLabel(ref.position.row);

      if (!groupedByValue.has(value)) {
        groupedByValue.set(value, []);
      }

      groupedByValue.get(value)!.push({
        group: groupLabel,
        description: ref.accessibility?.description || ref.accessibility?.shortLabel || String(ref.value),
        position: ref.position,
      });
    });

    // Create deduplicated result - return only the X values (not the enhanced objects)
    // The enhanced information will be available through getNavigableReferences
    const result = Array.from(groupedByValue.keys());

    return result;
  }

  /**
   * Get X values with group information for the UI
   * This provides the deduplicated X values with combined group context for stacked/dodged bar plots
   * @returns Array of X values with group information
   */
  public getXValuesWithGroups(): Array<{ value: XValue; group: string; description: string }> {
    // Check if this is a simple bar plot (only 1 group + summary) or stacked/dodged (multiple groups + summary)
    const actualGroups = this.barValues.length - 1; // Exclude the summary row
    const isSimpleBarPlot = actualGroups <= 1;

    // For simple bar plots, don't show group information
    if (isSimpleBarPlot) {
      const result = this.getAvailableXValues().map(value => ({
        value,
        group: '', // Empty group for simple bar plots
        description: String(value),
      }));
      return result;
    }

    // For stacked/dodged plots, show group information
    // Group references by X value to deduplicate
    const groupedByValue = new Map<XValue, Array<{ group: string; description: string; position: any }>>();

    // Filter out the Total row (last row) and process only actual group data
    const groupRows = this.navigableReferences.filter(ref =>
      ref.position.row < this.barValues.length - 1, // Exclude the Total row
    );

    groupRows.forEach((ref) => {
      const value = ref.value;
      const groupLabel = this.getGroupLabel(ref.position.row);

      if (!groupedByValue.has(value)) {
        groupedByValue.set(value, []);
      }

      groupedByValue.get(value)!.push({
        group: groupLabel,
        description: ref.accessibility?.description || ref.accessibility?.shortLabel || String(ref.value),
        position: ref.position,
      });
    });

    // Create deduplicated result with combined group information
    const result = Array.from(groupedByValue.entries()).map(([value, groups]) => {
      const groupNames = groups.map(g => g.group).filter(Boolean);
      const combinedGroup = groupNames.length > 0 ? groupNames.join(', ') : 'No groups';
      return { value, group: combinedGroup, description: String(value) };
    });

    return result;
  }

  /**
   * Get extrema targets for the current segmented bar plot trace
   * Returns min and max values within the current group
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
    // Call base implementation which handles initial entry and basic navigation
    super.navigateToExtrema(target);
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

      // For dodged/stacked plots, use just the fill value as group identifier
      if (firstPoint.fill) {
        return firstPoint.fill; // Just return "Above", "Below" etc.
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
    // Use the fill axis label stored from the layer
    if (this.fill && this.fill !== 'unavailable') {
      return this.fill;
    }
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
