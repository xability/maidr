import type { GaugeBand, GaugePoint, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { defaultFormat } from '@util/format';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace, DEFAULT_SUBPLOT_TITLE } from './abstract';
import { MovableGrid } from './movable';

/**
 * Names the band a value falls in.
 *
 * Bands are bounded above and sorted ascending, so the first whose upper edge
 * the value has not passed is the one it sits in. A value above every band —
 * which a chart can draw, since the bands need not reach `max` — belongs to
 * none rather than to the last one, because saying "in the 'good' band" about
 * a value beyond every declared band would invent a classification.
 *
 * @param value - The measure
 * @param bands - The chart's bands, ascending
 * @returns The band's label, or null when the value falls outside all of them
 */
function bandOf(value: number, bands: GaugeBand[] | undefined): string | null {
  if (!bands || bands.length === 0) {
    return null;
  }

  const found = [...bands]
    .sort((a, b) => Number(a.to) - Number(b.to))
    .find(band => value <= Number(band.to));

  return found ? found.label : null;
}

/**
 * What the measure is called when the layer named neither it nor the chart.
 *
 * `this.title` is not a name in that case: it holds the model's `unavailable`
 * placeholder, which the description dialog erases -- so the one row of the
 * one table a gauge has came out with no header at all, and the announcement
 * read "Progress is unavailable" about a chart that had simply never named
 * its measure.
 */
const MEASURE_FALLBACK = 'Measure';

/** How the value column reads where the layer labelled no y axis. */
const VALUE_FALLBACK = 'Value';

/** Where the needle sits when it has passed every band the chart declares. */
const ABOVE_ALL_BANDS = 'above every band';

/**
 * The bands the chart draws, ascending, each with the edge it reaches.
 *
 * A band's name on its own is unanchored: told the needle is in 'ok', a
 * reader cannot tell whether it sits comfortably inside that band or a point
 * short of the next one. The edges are the qualitative scale a sighted reader
 * takes from the coloured arcs, and they are written nowhere else.
 *
 * Read as upper edges rather than as spans because that is what a band is:
 * one starts where the previous ended, and the first at the dial's floor.
 * A band whose edge is not a number cannot be placed on the dial -- and is
 * never the band {@link bandOf} selects, every comparison against it being
 * false -- so it is left out rather than listed with a gap for its edge.
 *
 * @param bands - The chart's bands, in whatever order they were authored
 * @returns The bands as display text, or the empty string when none can be placed
 */
function describeBands(bands: GaugeBand[]): string {
  return [...bands]
    .filter(band => Number.isFinite(Number(band.to)))
    .sort((a, b) => Number(a.to) - Number(b.to))
    .map(band => `${band.label} up to ${defaultFormat(Number(band.to))}`)
    .join(', ');
}

/**
 * Trace implementation for gauges and bullet charts: one measure read against
 * a range.
 *
 * The reason this is worth a trace type despite drawing a single point is that
 * the point's meaning is **entirely relational**, and none of the relations are
 * written anywhere a screen reader can reach. "73" is not the reading. "73 out
 * of 100, 7 below target, in the 'ok' band" is, and a sighted reader gets all
 * of it from the dial's geometry — the needle's position, the marker beside it,
 * the coloured arc it lands on.
 *
 * So the announcement carries the range, the target and the band alongside the
 * value, rather than leaving the reader to hold a scale in their head.
 *
 * Dashboards are built out of these, and a dashboard whose tiles are each
 * unreadable is unusable however good the charts beside them are.
 */
export class GaugeTrace extends AbstractTrace {
  protected readonly supportsExtrema = false;
  protected readonly movable: Movable;

  private readonly point: GaugePoint;
  private readonly value: number;
  private readonly min: number;
  private readonly max: number;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new gauge trace.
   *
   * @param layer - The MAIDR layer carrying the measure and its range
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.point = layer.data as GaugePoint;
    this.value = Number(this.point.value);
    this.min = Number(this.point.min);
    this.max = Number(this.point.max);

    this.highlightValues = this.mapToSvgElements(layer.selectors);
    this.movable = new MovableGrid<GaugePoint>([[this.point]]);
  }

  /**
   * Resolves the layer's selectors to the drawn needle or bar.
   *
   * @param selectors - The layer's selectors, when it has any
   * @returns A single element in a one-by-one grid, or null when unresolvable
   */
  private mapToSvgElements(
    selectors: MaidrLayer['selectors'],
  ): SVGElement[][] | null {
    if (typeof selectors !== 'string' && !Array.isArray(selectors)) {
      return null;
    }

    // Resolved live, and only the one element kept is cloned. Cloning every
    // match up front inserted a hidden copy of each beside its original, and
    // the copies past the first were never referenced again, so `dispose()`
    // could not remove them.
    const drawn = typeof selectors === 'string'
      ? Svg.selectAllElements(selectors, false)
      : (selectors as string[]).flatMap(one => Svg.selectAllElements(one, false));

    return drawn.length > 0 ? [[Svg.cloneHidden(drawn[0])]] : null;
  }

  /**
   * Whether the rotor should offer its lower/higher compare modes.
   *
   * A gauge is one point, so there is nothing to compare it against -- the
   * same reason {@link GaugeTrace.supportsExtrema} is false. Left at the
   * default the rotor would offer "Navigate to Lower Value" on a chart with
   * no other value to reach.
   *
   * @returns False, always
   */
  public override supportsCompareMode(): boolean {
    return false;
  }

  protected get values(): number[][] {
    return [[this.value]];
  }

  protected get dimension(): Dimension {
    return { rows: 1, cols: 1 };
  }

  protected get audio(): AudioState {
    return {
      freq: {
        // Scaled against the dial rather than against the value itself, which
        // is the whole point: a lone tone with no range behind it says only
        // that a number exists. Against the dial, the pitch is where the
        // needle sits.
        min: this.min,
        max: this.max,
        raw: this.value,
      },
      panning: { x: 0, y: 0, rows: 1, cols: 1 },
    };
  }

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: [[this.value]],
      min: [this.min],
      max: [this.max],
      row: this.row,
      col: this.col,
    };
  }

  /**
   * What the measure is called, wherever it has to be named.
   *
   * The producer's own name for it, then the chart's title, then the fixed
   * word -- and never `this.title`'s placeholder, which is what the layer
   * that authored neither leaves behind. Read by both the announcement and
   * the description's one table row, so the two cannot come to call the same
   * number different things.
   *
   * @returns The measure's name, never blank
   */
  private get measureName(): string {
    return this.point.label
      ?? (this.title === DEFAULT_SUBPLOT_TITLE ? MEASURE_FALLBACK : this.title);
  }

  protected get text(): TextState {
    const band = bandOf(this.value, this.point.bands);

    const state: TextState = {
      main: {
        label: this.xAxis,
        value: this.measureName,
      },
      cross: { label: this.yAxis, value: this.value },
      // What the value is out of. A gauge's reading is a position on a dial,
      // and without the dial's ends the number is unanchored.
      //
      // Carried in `z` -- the slot for a third quantity -- and NOT in `range`,
      // which would look like the natural home. `TextService` treats `range`
      // as *replacing* the main-axis value rather than supplementing it, the
      // way a histogram announces a bin's span instead of a single x. Setting
      // it here would drop the measure's name from every announcement and
      // render the dial's ends through the category axis's formatter.
      //
      // `spannedOrMissing` and not `spanned`: a dial with no declared ends
      // makes both `Number(undefined)`, and `spanned` renders that pair as the
      // *string* "NaN to NaN" -- a value like any other to everything
      // downstream, so it is announced and printed verbatim.
      z: { label: 'Range', value: MathUtil.spannedOrMissing(this.min, this.max) },
      mainAxis: 'x',
      crossAxis: 'y',
    };

    if (this.point.target !== undefined) {
      // The marker a bullet chart draws beside the bar. Carried as a value
      // rather than as "7 below" so the formatter can render it in the axis's
      // own units, and so the reader hears the target itself rather than only
      // a difference they cannot place.
      state.stack = { label: 'Target', value: Number(this.point.target) };
    }
    if (band !== null) {
      state.section = band;
    }

    return state;
  }

  public get description(): DescriptionState {
    const stats: DescriptionState['stats'] = [
      { label: 'Value', value: this.value },
      { label: 'Range', value: MathUtil.spannedOrMissing(this.min, this.max) },
    ];

    // Where the needle sits, which is what a sighted reader takes from the
    // dial and what the pitch already encodes. On a 0-to-100 dial the value
    // doubles as its own proportion and the omission is invisible; on a
    // revenue gauge running 200 to 800, the proportion is the reading and the
    // reader was left to work it out from two numbers.
    const span = this.max - this.min;
    if (Number.isFinite(span) && span !== 0 && Number.isFinite(this.value)) {
      stats.push({
        label: 'Position in range',
        value: `${(((this.value - this.min) / span) * 100).toFixed(1)}%`,
      });
    }

    if (this.point.target !== undefined) {
      const target = Number(this.point.target);
      const delta = this.value - target;
      stats.push({ label: 'Target', value: target });
      if (delta === 0) {
        // Landing on the target is a reading of its own on a KPI dial, not a
        // degenerate case of overshooting it. "Above target by 0" makes a
        // claim about a direction the value does not have, and leaves the
        // reader inferring "so it is exactly on target" -- the inference the
        // direction labels exist to spare them.
        stats.push({ label: 'Versus target', value: 'on target' });
      } else {
        stats.push({
          // Named by direction rather than reported as a signed number: "7
          // below target" is what a reader is asking, and a bare "-7" leaves
          // them working out which way it points.
          label: delta > 0 ? 'Above target by' : 'Below target by',
          value: Math.abs(delta),
        });
      }
    }

    const bands = this.point.bands ?? [];
    if (bands.length > 0) {
      // Stated even when the needle has passed every band: a chart that draws
      // bands and a summary that says nothing about them read alike, and the
      // second is the case where the reader most needs to be told.
      stats.push({ label: 'Band', value: bandOf(this.value, bands) ?? ABOVE_ALL_BANDS });
      const edges = describeBands(bands);
      if (edges !== '') {
        stats.push({ label: 'Bands', value: edges });
      }
    }

    // Headed from the axes the announcement already names these two fields
    // by, so the dialog's Axes block, the spoken sentence and the table do not
    // give the same number three names. The domain words stand in only where
    // the layer labelled nothing, `named()`'s generic 'X' and 'Y' being worse
    // than either in a column header.
    const headers = [
      this.layer.axes?.x?.label?.trim() ? this.xAxis : MEASURE_FALLBACK,
      this.layer.axes?.y?.label?.trim() ? this.yAxis : VALUE_FALLBACK,
    ];
    const rows: (string | number)[][] = [[this.measureName, this.value]];

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  /**
   * Finds the drawn measure under a pointer position.
   *
   * @param x - Viewport x of the pointer
   * @param y - Viewport y of the pointer
   * @returns The measure when the pointer is inside it, otherwise null
   */
  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const element = this.highlightValues?.[0]?.[0];
    if (!element) {
      return null;
    }

    const box = element.getBoundingClientRect();
    if (
      x < box.left
      || x > box.left + box.width
      || y < box.top
      || y > box.top + box.height
    ) {
      return null;
    }

    return {
      element,
      row: 0,
      col: 0,
      centerX: box.left + box.width / 2,
      centerY: box.top + box.height / 2,
    };
  }
}
