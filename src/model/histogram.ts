import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import type { DescriptionState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { AbstractBarPlot } from './bar';

export class Histogram extends AbstractBarPlot<HistogramPoint> {
  public constructor(layer: MaidrLayer) {
    super(layer, [layer.data as HistogramPoint[]]);
  }

  /**
   * Gets the description state for the histogram trace.
   * Overrides bar description to include bin range information.
   * @returns The description state containing chart metadata and data table
   */
  public override get description(): DescriptionState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const points = this.points[0] as HistogramPoint[];
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    const binRangeMin = isVertical ? firstPoint.xMin : firstPoint.yMin;
    const binRangeMax = isVertical ? lastPoint.xMax : lastPoint.yMax;

    const stats: DescriptionState['stats'] = [
      { label: 'Number of bins', value: points.length },
      { label: 'Min value', value: MathUtil.safeMin(this.min) },
      { label: 'Max value', value: MathUtil.safeMax(this.max) },
      { label: 'Bin range', value: `${binRangeMin} to ${binRangeMax}` },
    ];

    const headers = isVertical
      ? [this.xAxis, this.yAxis, 'Bin Min', 'Bin Max']
      : [this.yAxis, this.xAxis, 'Bin Min', 'Bin Max'];

    const rows: (string | number)[][] = points.map((p) => {
      const main = isVertical ? p.x : p.y;
      const cross = isVertical ? p.y : p.x;
      const min = isVertical ? p.xMin : p.yMin;
      const max = isVertical ? p.xMax : p.yMax;
      return [main, cross, min, max];
    });

    return {
      chartType: 'hist',
      title: this.title,
      axes: { x: this.xAxis, y: this.yAxis },
      stats,
      dataTable: { headers, rows },
    };
  }

  protected get text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = this.points[this.row][this.col];

    const min = isVertical ? point.xMin : point.yMin;
    const max = isVertical ? point.xMax : point.yMax;

    return {
      ...super.text,
      range: { min, max },
    };
  }

  /**
   * Histogram specific implementation of moving to the next higher/lower value
   * @param direction indicates the direction of search- left (before the current value) and right (after)
   * @param type indicates the value to look for
   * @returns boolean (true: if target was found, false: else)
   */
  public override moveToNextCompareValue(direction: 'left' | 'right', type: 'lower' | 'higher'): boolean {
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.barValues.length) {
      return false;
    }

    const groupValues = this.barValues[currentGroup];
    if (!groupValues || groupValues.length === 0) {
      return false;
    }

    const currentIndex = this.col;
    const step = direction === 'right' ? 1 : -1;
    let i = currentIndex + step;

    while (i >= 0 && i < groupValues.length) {
      if (this.compare(groupValues[i], groupValues[currentIndex], type)) {
        this.col = i;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }
    this.notifyRotorBounds();
    return false;
  }
}
