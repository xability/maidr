import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import type { DescriptionState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { AbstractBarPlot, isMeasured, missingText } from './bar';

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
    const counts = this.barValues[0] ?? [];

    // The extremes over every bin, not the first bin's low and the last bin's
    // high: bin order is the producer's, and a descending or shuffled layer
    // reported a range running backwards -- or, with one bin missing its
    // bounds, the literal text "constant undefined".
    const lows = points
      .map(point => Number(isVertical ? point.xMin : point.yMin))
      .filter(Number.isFinite);
    const highs = points
      .map(point => Number(isVertical ? point.xMax : point.yMax))
      .filter(Number.isFinite);
    const binRange = MathUtil.spannedOrMissing(
      MathUtil.safeMin(lows),
      MathUtil.safeMax(highs),
    );

    const stats: DescriptionState['stats'] = [
      { label: t('model.statNumberOfBins'), value: points.length },
      // `count`, not `value`: these are bin heights, and they sat directly
      // above a `Bin range` that is the binned variable -- two adjacent lines
      // about two different axes, under labels naming neither.
      ...this.rangeStats({ min: 'model.statMinCount', max: 'model.statMaxCount' }),
      { label: t('model.statBinRange'), value: binRange },
    ];

    const measuredCounts = counts.filter(isMeasured);
    if (measuredCounts.length > 0) {
      stats.push({
        label: t('model.statTotalObservations'),
        value: measuredCounts.reduce((sum, count) => sum + count, 0),
      });

      // Where the distribution peaks -- the question a histogram is drawn to
      // answer, and one a reader could previously only get by walking every
      // bin. Named the way the sibling hexbin names its densest cell.
      const peak = counts.indexOf(MathUtil.safeMax(measuredCounts));
      const peakPoint = points[peak];
      if (peakPoint !== undefined) {
        stats.push({
          label: t('model.statModalBin'),
          value: t('model.statModalBinValue', {
            range: MathUtil.spannedOrMissing(
              Number(isVertical ? peakPoint.xMin : peakPoint.yMin),
              Number(isVertical ? peakPoint.xMax : peakPoint.yMax),
            ),
            count: counts[peak],
          }),
        });
      }
    }

    const widths = points
      .map(point => Number(
        (isVertical ? point.xMax : point.yMax) - (isVertical ? point.xMin : point.yMin),
      ))
      .filter(Number.isFinite);
    if (widths.length > 0) {
      stats.push({
        label: t('model.statBinWidth'),
        value: MathUtil.spannedOrMissing(MathUtil.safeMin(widths), MathUtil.safeMax(widths)),
      });
    }

    const headers = isVertical
      ? [this.xAxis, this.yAxis, t('model.tableBinMin'), t('model.tableBinMax')]
      : [this.yAxis, this.xAxis, t('model.tableBinMin'), t('model.tableBinMax')];

    const rows: (string | number)[][] = points.map((p, col) => {
      const main = isVertical ? p.x : p.y;
      const count = counts[col];
      const min = isVertical ? p.xMin : p.yMin;
      const max = isVertical ? p.xMax : p.yMax;
      return [main, isMeasured(count) ? count : missingText(), min, max];
    });

    // The bin's own value and its two bounds are all read off the binned
    // axis, swapping with the headers above, and the count off the other one:
    // a layer that formats its bin edges as a date says the same thing here as
    // it does when the reader walks the bins.
    const columnAxes: DescriptionState['dataTable']['columnAxes'] = isVertical
      ? ['x', 'y', 'x', 'x']
      : ['y', 'x', 'y', 'y'];

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, columnAxes, rows },
    };
  }

  protected override get text(): TextState {
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
    return this.compareSearchInRow(direction, type);
  }
}
