import type { MaidrLayer } from '@type/grammar';
import type { AudioState, TraceState } from '@type/state';
import { TraceType } from '@type/grammar';
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
const PLOT_TYPE_LABEL: Record<RadarVariant, string> = {
  radar: 'radar',
  polar: 'polar area',
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

  protected override get audio(): AudioState {
    const base = super.audio;
    const angle = this.spokeAngles[this.col];
    if (angle === undefined) {
      return base;
    }

    // `AudioService` reads the pan as `interpolate(x, 0, cols - 1, -1, 1)`, so
    // `cols: 2` makes the mapping `2x - 1`, and `x = (sin θ + 1) / 2` lands the
    // pan on `sin θ` exactly. The same arithmetic `PieTrace` uses, and the
    // reason neither needs a new state field to express an angle.
    //
    // `y` and `rows` stay honest rather than being zeroed: the stereo position
    // is computed from `x` and `cols` alone, so the series index costs nothing
    // to keep and is the truth about where the cursor is.
    return {
      ...base,
      panning: {
        x: (Math.sin(angle) + 1) / 2,
        y: this.row,
        rows: this.lineValues.length,
        cols: 2,
      },
    };
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
    return {
      count: 'Number of series',
      perSeries: 'Spokes per series',
      names: 'Series names',
      column: 'Series',
    };
  }

  public override get state(): TraceState {
    const base = super.state;
    if (base.empty) {
      return base;
    }

    // `LineTrace` reports itself as a 'single line' or 'multiline' plot, which
    // is what the instruction text and the layer-switch cue announce. A reader
    // told they are on a line plot has been told the wrong chart.
    return { ...base, plotType: PLOT_TYPE_LABEL[this.variant] };
  }
}
