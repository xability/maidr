import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { AudioState, DescriptionState, TraceState } from '@type/state';
import type { MessageKey } from '@util/i18n';
import { TraceType } from '@type/grammar';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { LineTrace } from './line';

/**
 * How the values are drawn around the spokes.
 *
 * A radar joins them into a closed outline; a polar area draws each as a wedge
 * whose radius is the value. The reading is identical — a spoke and a value —
 * so they share a trace and differ only in what they are called, the way an
 * area and a stacked area do.
 */
type RadarVariant = 'radar' | 'polar';

/** Spoken plot type, per variant, for the instruction and layer-switch cues. */
const PLOT_TYPE_LABEL: Record<RadarVariant, MessageKey> = {
  radar: 'model.plotTypeRadar',
  polar: 'model.plotTypePolarAreaSpoken',
};

/**
 * What one category around the circle is called, per variant.
 *
 * A radar draws a spoke; a polar area draws a wedge. Both share this trace, so
 * a polar area's description counted its "spokes" under a chart type announced
 * as `polar area`.
 */
const SPOKE_NOUN: Record<RadarVariant, MessageKey> = {
  radar: 'model.nounSpokes',
  polar: 'model.nounSectors',
};

/**
 * Reads a layer's type as a {@link RadarVariant}.
 *
 * @param type - The layer's declared trace type
 * @returns The variant, defaulting to `radar`
 */
function variantOf(type: TraceType): RadarVariant {
  return type === TraceType.POLAR_AREA ? 'polar' : 'radar';
}

/**
 * Trace implementation for radar, spider and polar area charts — categories
 * arranged around a circle rather than along an axis.
 *
 * The data is a multi-line layer's: each spoke is a column and each series a
 * row, and navigation, braille and pitch all transfer unchanged. What a circle
 * adds is **where a spoke sits**, and that is carried in the panning.
 *
 * Panning by column index is what a line does — hard left to hard right, a
 * straight sweep — and it makes a radar sound like a row of bars, which is the
 * one thing the layout is chosen to avoid. Panning by the spoke's angle sends
 * the sweep out and back: 12 o'clock centre, 3 o'clock hard right, 6 o'clock
 * centre again, 9 o'clock hard left. That is the same treatment {@link PieTrace}
 * received, and it is what distinguishes a circle from a line by ear.
 */
export class RadarTrace extends LineTrace {
  private readonly variant: RadarVariant;

  /**
   * The angle of each spoke, clockwise from 12 o'clock.
   *
   * Evenly spaced, because a radar's spokes are: unlike a pie's slices, whose
   * angles follow from their shares, a radar puts its categories at equal
   * intervals whatever they measure.
   *
   * Where spoke zero actually sits is a convention rather than something the
   * payload states — the same gap {@link PieTrace} notes. It matters less
   * here: nothing announces an absolute clock position for a radar, so a
   * producer laying its first spoke elsewhere shifts which spoke is heard at
   * centre without making any announcement untrue.
   */
  private readonly spokeAngles: number[];

  /**
   * Creates a new radar trace.
   *
   * @param layer - The MAIDR layer carrying the spoke data
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.variant = variantOf(layer.type);
    this.spokeAngles = this.computeSpokeAngles();
  }

  /**
   * Places each spoke at an equal share of the circle.
   *
   * Taken from the longest series rather than the first, so a chart whose
   * series run to different lengths still has an angle for every column a
   * cursor can reach. Ragged series are not what a radar is for, but a
   * producer can emit them, and an absent angle would pan that spoke to
   * whatever `undefined` interpolates to.
   *
   * @returns One angle per spoke, in radians
   */
  private computeSpokeAngles(): number[] {
    const spokes = this.lineValues.reduce(
      (widest, series) => Math.max(widest, series.length),
      0,
    );
    if (spokes === 0) {
      return [];
    }

    return Array.from({ length: spokes }, (_, index) => (index * 2 * Math.PI) / spokes);
  }

  protected override panningFor(row: number, col: number): AudioState['panning'] {
    const angle = this.spokeAngles[col];
    if (angle === undefined) {
      return super.panningFor(row, col);
    }

    // `AudioService` reads the pan as `interpolate(x, 0, cols - 1, -1, 1)`, so
    // `cols: 2` makes the mapping `2x - 1`, and `x = (sin θ + 1) / 2` lands the
    // pan on `sin θ` exactly. The same arithmetic `PieTrace` uses, and the
    // reason neither needs a new state field to express an angle.
    //
    // `y` and `rows` stay honest rather than being zeroed: the stereo position
    // is computed from `x` and `cols` alone, so the series index costs nothing
    // to keep and is the truth about where the cursor is.
    //
    // Overriding here rather than in `audio` covers the intersection chord as
    // well: two series meeting on a spoke are one point on the circle, and a
    // chord that swept left-to-right while every other tone went out and back
    // would place that point somewhere the chart does not have.
    return {
      x: (Math.sin(angle) + 1) / 2,
      y: row,
      rows: this.lineValues.length,
      cols: 2,
    };
  }

  /**
   * What one series is called wherever an announcement names it.
   *
   * The dialog already called them series; speech did not, so an unlabelled
   * radar announced "Group is model A" on every move under a description
   * headed `Series`. Two words for one referent, which is the defect the
   * labels below were written to remove.
   *
   * @returns The fallback label
   */
  protected override get groupFallbackLabel(): string {
    return t('model.nounSeries');
  }

  protected override get seriesLabels(): {
    count: string;
    perSeries: string;
    names: string;
    column: string;
  } {
    // The description dialog renders these literally, so inheriting the line's
    // wording tells a reader opening it that they are on a chart with "lines"
    // and "points per line" -- the same misdescription the spoken plot type is
    // overridden to avoid, one dialog further along.
    //
    // `variantOf(this.layer.type)` rather than `this.variant`, which is
    // assigned after `super(layer)`: `groupNameAt` reads these labels for its
    // fallback name, so a read during construction would find the field
    // undefined and index the record with it.
    return {
      count: t('model.statNumberOfSeries'),
      perSeries: t('model.statNounPerSeries', {
        noun: t(SPOKE_NOUN[variantOf(this.layer.type)]),
      }),
      names: t('model.statSeriesNames'),
      column: t('model.nounSeries'),
    };
  }

  /**
   * Names the categories around the circle, in the order they are drawn.
   *
   * The order is the chart: which categories sit next to each other decides
   * the outline's shape outright, and it is a choice the author made rather
   * than a property of the data — {@link ParallelTrace} reports its own axis
   * order on the same grounds, and {@link RadarTrace.computeSpokeAngles}
   * already treats the order as load-bearing for the panning. A radar carries
   * few categories and they are its whole vocabulary, so a reader opening `d`
   * before navigating was given a count and no names at all.
   *
   * @returns The description state, carrying the categories in order
   */
  public override get description(): DescriptionState {
    const base = super.description;

    // The widest series, for the reason `computeSpokeAngles` takes it: a
    // ragged layer still has an angle -- and a name -- for every column a
    // cursor can reach.
    const spokes = this.points.reduce(
      (widest, series) => (series.length > widest.length ? series : widest),
      [] as LinePoint[],
    );
    if (spokes.length === 0) {
      return base;
    }

    // The inherited x extent goes with it. It reports the first and last
    // column of the axis, and on a circle those two are neighbours, so
    // "speed to price" names a sweep the chart never makes.
    const xRangeLabel = t('model.statAxisRange', { axis: this.xAxis });
    const stats = base.stats.filter(stat => stat.label !== xRangeLabel);
    stats.push({
      label: t('model.statNounInOrder', { noun: t(SPOKE_NOUN[this.variant]) }),
      // Composed here, so it is rounded here: the description service rounds a
      // bare number and passes a composed string through untouched, and a
      // polar area binned on a numeric axis carries numbers around its circle.
      value: spokes.map(point => defaultFormat(point.x)).join(', '),
    });

    return { ...base, stats };
  }

  public override get state(): TraceState {
    const base = super.state;
    if (base.empty) {
      return base;
    }

    // `LineTrace` reports itself as a 'single line' or 'multiline' plot, which
    // is what the instruction text and the layer-switch cue announce. A reader
    // told they are on a line plot has been told the wrong chart.
    return { ...base, plotType: t(PLOT_TYPE_LABEL[this.variant]) };
  }
}
