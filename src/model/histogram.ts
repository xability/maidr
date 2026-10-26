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

    // A bar's height is a count only when it is a whole number. A density, a
    // probability or a weighted histogram draws fractions, and they add up to
    // no number of observations: the densities of 500 samples in bins half a
    // unit wide sum to 2, which was reported as "Total observations: 2".
    const measuredCounts = counts.filter(isMeasured);
    const heightsAreCounts = measuredCounts.every(Number.isInteger);

    const stats: DescriptionState['stats'] = [
      { label: t('model.statNumberOfBins'), value: points.length },
      ...this.heightStats(heightsAreCounts),
      { label: t('model.statBinRange'), value: binRange },
    ];

    if (measuredCounts.length > 0) {
      if (heightsAreCounts) {
        stats.push({
          label: t('model.statTotalObservations'),
          value: measuredCounts.reduce((sum, count) => sum + count, 0),
        });
      }

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
      const narrowest = MathUtil.safeMin(widths);
      const widest = MathUtil.safeMax(widths);
      stats.push({
        label: t('model.statBinWidth'),
        value: Histogram.binsAreEqual(narrowest, widest, [...lows, ...highs])
          ? MathUtil.spanned(narrowest, narrowest)
          : MathUtil.spannedOrMissing(narrowest, widest),
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

  /**
   * The lowest and highest bar, named for what a bar's height is.
   *
   * `count`, not `value`, when the heights are counts: they sit directly
   * above a `Bin range` that is the binned variable, and `Min value` there
   * would be two adjacent lines about two different axes under labels naming
   * neither. Heights that are not counts are named for the axis they are read
   * off ("Maximum Density"), which keeps the two lines apart without calling
   * a density a count.
   *
   * @param heightsAreCounts - Whether every measured height is a whole number
   * @returns The minimum and maximum stats
   */
  private heightStats(heightsAreCounts: boolean): DescriptionState['stats'] {
    if (heightsAreCounts) {
      return this.rangeStats({ min: 'model.statMinCount', max: 'model.statMaxCount' });
    }
    const axis = this.orientation === Orientation.VERTICAL ? this.yAxis : this.xAxis;
    const [lowest, highest] = this.rangeStats();
    return [
      { ...lowest, label: t('model.statMinimumAxis', { axis }) },
      { ...highest, label: t('model.statMaximumAxis', { axis }) },
    ];
  }

  /**
   * Whether bins this narrow and this wide are the same width.
   *
   * Producers compute bin edges in floating point -- numpy as
   * `start + i * step`, R writing its edges out to fifteen significant
   * figures -- so the widths of equal bins agree in every digit a reader is
   * shown and differ in the last few bits: 4.916666666666657 beside
   * 4.916666666666686. Compared exactly, twelve equal bins read
   * "Bin width: 4.92 to 4.92".
   *
   * The noise in a width comes from the edges it is taken from, so the
   * tolerance is scaled by the largest edge rather than by the width: two
   * widths are the same when they differ by less than a billionth of it.
   * Rounding each width instead, the way a single derived length is trimmed
   * elsewhere, would still split two widths either side of a rounding
   * boundary, and R's widths carry noise close to the twelfth figure.
   *
   * It is also capped at a millionth of a width. Far from zero a billionth
   * of an edge can be more than a bin is wide -- 1.7 seconds on an axis of
   * epoch seconds -- and bins a quarter and a half second wide would have
   * read as equal.
   *
   * @param narrowest - The narrowest bin's width
   * @param widest - The widest bin's width
   * @param edges - Every bin edge the widths were taken from
   * @returns True when the bins differ in width by float noise alone
   */
  private static binsAreEqual(narrowest: number, widest: number, edges: number[]): boolean {
    const scale = MathUtil.safeMax(edges.map(Math.abs));
    const tolerance = Math.min(
      scale * 1e-9,
      Math.min(Math.abs(narrowest), Math.abs(widest)) * 1e-6,
    );
    return Number.isFinite(tolerance) && widest - narrowest <= tolerance;
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
}
