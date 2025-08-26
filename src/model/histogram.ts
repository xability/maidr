import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import type { TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { AbstractBarPlot } from './bar';

export class Histogram extends AbstractBarPlot<HistogramPoint> {
  protected readonly supportsExtrema = false;
  public constructor(layer: MaidrLayer) {
    super(layer, [layer.data as HistogramPoint[]]);
    this.buildNavigableReferences();
  }

  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = this.points[this.row][this.col];

    const min = isVertical ? point.xMin : point.yMin;
    const max = isVertical ? point.xMax : point.yMax;

    return {
      ...super.text(),
      range: { min, max },
    };
  }

  /**
   * Build navigation references for this histogram
   */
  protected buildNavigableReferences(): void {
    this.navigableReferences = [];

    for (let row = 0; row < this.points.length; row++) {
      for (let col = 0; col < this.points[row].length; col++) {
        const point = this.points[row][col];
        const xValue = this.orientation === Orientation.VERTICAL ? point.x : point.y;

        this.navigableReferences.push({
          id: `histogram-${row}-${col}`,
          value: xValue,
          type: typeof xValue === 'number' ? 'bin' : 'category',
          position: { row, col },
          context: {
            plotType: 'histogram',
            orientation: this.orientation,
            groupIndex: row,
          },
          accessibility: {
            description: `Histogram bin: ${point.xMin} to ${point.xMax}`,
            shortLabel: String(xValue),
            valueType: typeof xValue === 'number' ? 'numeric' : 'categorical',
          },
        });
      }
    }
  }
}
