import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { AudioState, DescriptionState, TraceState } from '@type/state';
import type { MessageKey } from '@util/i18n';
import { PieDirection, TraceType } from '@type/grammar';
import { defaultLabelFormat } from '@util/format';
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
 * Whether a layer's spokes follow one another counterclockwise as drawn.
 *
 * A function of the layer rather than a field, because
 * {@link RadarTrace.listedRightToLeft} needs it while the line trace is still
 * being constructed, before any field of this class is set.
 *
 * @param layer - The layer as declared
 * @returns True when the layer says its spokes run counterclockwise
 */
function drawnCounterclockwise(layer: MaidrLayer): boolean {
  return layer.direction === PieDirection.COUNTERCLOCKWISE;
}

/**
 * Where a layer's first spoke points, in radians clockwise from 12 o'clock.
 *
 * A missing or unusable `startAngle` is 12 o'clock, where every radar and
 * polar area put its first spoke before a layer could say otherwise.
 *
 * @param layer - The layer as declared
 * @returns The first spoke's angle
 */
function firstSpokeAngle(layer: MaidrLayer): number {
  const degrees = layer.startAngle;
  return degrees !== undefined && Number.isFinite(degrees) ? (degrees * Math.PI) / 180 : 0;
}

/**
 * Trace implementation for radar, spider and polar area charts — categories
 * arranged around a circle rather than along an axis.
 *
 * The data is a multi-line layer's: each spoke is a column and each series a
 * row, and braille and pitch transfer unchanged. Navigation does too, except
 * that Up and Down step through the series in the order they are declared
 * ({@link findVerticalTarget}). What a circle adds is **where a spoke sits**,
 * and that is carried in the panning.
 *
 * Panning by column index is what a line does — hard left to hard right, a
 * straight sweep — and it makes a radar sound like a row of bars, which is the
 * one thing the layout is chosen to avoid. Panning by the spoke's angle sends
 * the sweep out and back: 12 o'clock centre, 3 o'clock hard right, 6 o'clock
 * centre again, 9 o'clock hard left. That is the same treatment {@link PieTrace}
 * received, and it is what distinguishes a circle from a line by ear.
 *
 * **Right moves clockwise**, as it does round a pie, and the two keys a pie
 * declares its dial with say where the spokes are: `startAngle` is where the
 * first spoke points (12 o'clock when the layer says nothing), and a layer
 * whose library laid the spokes out counterclockwise declares `direction:
 * 'counterclockwise'` and is walked turned round, its marks with it
 * ({@link RadarTrace.listedRightToLeft}). Recharts draws a coxcomb as a `<Pie>`
 * left at its defaults, counterclockwise from 3 o'clock, and read as clockwise
 * from 12 its Right walked the wedges counterclockwise and panned March, drawn
 * at 10 o'clock, to the right.
 */
export class RadarTrace extends LineTrace {
  private readonly variant: RadarVariant;

  /**
   * The angle of each spoke, clockwise from 12 o'clock, in the order the
   * spokes are drawn.
   *
   * Evenly spaced, because a radar's spokes are: unlike a pie's slices, whose
   * angles follow from their shares, a radar puts its categories at equal
   * intervals whatever they measure.
   *
   * The first points where the layer's `startAngle` says and the rest follow
   * in the layer's `direction`. A layer that says neither is laid out
   * clockwise from 12 o'clock, a convention rather than something it stated
   * -- the gap {@link PieTrace} notes -- and one that matters less here than
   * for a pie: nothing announces an absolute clock position for a radar, so a
   * producer that lays its first spoke elsewhere and does not say so shifts
   * which spoke is heard at centre without making any announcement untrue.
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
    this.spokeAngles = this.computeSpokeAngles(layer);
  }

  /**
   * Places each spoke at an equal share of the circle, from where the layer
   * says the first one points and round the way it says they run.
   *
   * Taken from the longest series rather than the first, so a chart whose
   * series run to different lengths still has an angle for every column a
   * cursor can reach. Ragged series are not what a radar is for, but a
   * producer can emit them, and an absent angle would pan that spoke to
   * whatever `undefined` interpolates to.
   *
   * @param layer - The layer as declared
   * @returns One angle per spoke, in radians, in the order they are drawn
   */
  private computeSpokeAngles(layer: MaidrLayer): number[] {
    const spokes = this.lineValues.reduce(
      (widest, series) => Math.max(widest, series.length),
      0,
    );
    if (spokes === 0) {
      return [];
    }

    const first = firstSpokeAngle(layer);
    const sector = ((drawnCounterclockwise(layer) ? -2 : 2) * Math.PI) / spokes;
    return Array.from({ length: spokes }, (_, index) => first + index * sector);
  }

  /**
   * Whether a series is walked turned round: when the layer says its spokes
   * were laid out counterclockwise.
   *
   * Right moves clockwise round every circle MAIDR reads, so a series drawn
   * the other way is read from its last spoke, which is the first one
   * clockwise from where the drawing starts -- as a counterclockwise pie is.
   * The line trace turns the marks round with the points, so the outline
   * stays on the spoke being read; `data` and `selectors` stay in the order
   * they were drawn.
   *
   * @returns True when the layer was drawn counterclockwise
   */
  protected override listedRightToLeft(): boolean {
    return drawnCounterclockwise(this.layer);
  }

  /**
   * Which spoke of the drawing a cursor column is on.
   *
   * The column itself, unless the series is walked turned round: column `c`
   * of a series is then its spoke `length - 1 - c` as drawn. Counted within
   * the series, so a series shorter than the widest -- the first spokes of
   * the drawing, which is what the angles already assume of it -- turns
   * round within its own length.
   *
   * @param row - The series
   * @param col - The column within it
   * @returns The spoke's index in drawing order
   */
  private drawnSpoke(row: number, col: number): number {
    if (!drawnCounterclockwise(this.layer)) {
      return col;
    }
    return (this.points[row]?.length ?? 0) - 1 - col;
  }

  /**
   * A polar area's wedge is a magnitude, filled out from the centre as a bar
   * is up from its baseline, so a wedge of 0 is no wedge and plays the null
   * tone. A radar's outline is drawn at each value's place on the radial
   * axis, as a line is on its value axis.
   *
   * @returns True for a radar, false for a polar area
   */
  protected override get valuesArePositions(): boolean {
    return this.variant !== 'polar';
  }

  /**
   * The next series up or down at the cursor's spoke, in declared order.
   *
   * A line chart moves to the series with the next higher or lower value,
   * because there the higher line is drawn higher. On a radar a larger value
   * is further out along a spoke, not higher on the screen -- at 6 o'clock it
   * is lower -- and the series cross from spoke to spoke, so value order made
   * Up and Down swap meaning between spokes and answered "No more data to
   * display" with the other series one press away the other way. Series
   * order is the order the braille rows, the legend and "Series k of n" use,
   * Up being the next series as it is on every grid. The percentile band
   * steps by row for the same reason.
   *
   * A series with no point at this spoke is passed over; a gap at it is
   * landed on and announced as missing, as Left and Right land on gaps.
   *
   * @param direction - UPWARD for the next series, DOWNWARD for the one before
   * @returns The row and column to move to, or null past the last series
   */
  protected override findVerticalTarget(
    direction: 'UPWARD' | 'DOWNWARD',
  ): { row: number; col: number } | null {
    const current = this.points[this.row]?.[this.col];
    if (current === undefined) {
      return null;
    }
    const step = direction === 'UPWARD' ? 1 : -1;
    for (let row = this.row + step; row >= 0 && row < this.points.length; row += step) {
      const col = this.findColumnByXValue(row, current.x);
      if (col !== -1) {
        return { row, col };
      }
    }
    return null;
  }

  /**
   * Control + Up and Down go to the last and first series at this spoke.
   *
   * The line chart's extremes are the highest and lowest valued series, which
   * on a radar would contradict Up and Down: from the "top" one, Up could
   * still move. Left and right are the line chart's.
   *
   * @param direction - The key's direction
   * @returns Whether the cursor moved
   */
  public override moveToExtreme(direction: MovableDirection): boolean {
    if (direction !== 'UPWARD' && direction !== 'DOWNWARD') {
      return super.moveToExtreme(direction);
    }
    if (this.isInitialEntry) {
      this.enterTrace();
    }
    if (this.points[this.row]?.[this.col] === undefined) {
      this.notifyOutOfBounds();
      return false;
    }
    for (let target = this.findVerticalTarget(direction); target !== null; target = this.findVerticalTarget(direction)) {
      this.row = target.row;
      this.col = target.col;
    }
    this.notifyStateUpdate();
    return true;
  }

  protected override panningFor(row: number, col: number): AudioState['panning'] {
    const angle = this.spokeAngles[this.drawnSpoke(row, col)];
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
   * Names the categories around the circle, in the order they sit round it
   * clockwise: the order they are drawn, or its reverse for a layer drawn
   * counterclockwise, which is the order Right walks them.
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
      // Not grouped in thousands: the spokes are names, and in a list joined
      // with commas `10,000, 20,000` would be four numbers or two.
      value: spokes.map(point => defaultLabelFormat(point.x)).join(', '),
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
    return { ...base, plotType: this.spokenPlotType(t(PLOT_TYPE_LABEL[this.variant])) };
  }
}
