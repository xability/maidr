import type { GaugeBand, GaugePoint, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
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

    const drawn = typeof selectors === 'string'
      ? Svg.selectAllElements(selectors)
      : (selectors as string[]).flatMap(one => Svg.selectAllElements(one));

    return drawn.length > 0 ? [[drawn[0]]] : null;
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

  protected get text(): TextState {
    const band = bandOf(this.value, this.point.bands);

    const state: TextState = {
      main: {
        label: this.xAxis,
        value: this.point.label ?? this.title,
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
      z: { label: 'Range', value: `${this.min} to ${this.max}` },
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
      { label: 'Range', value: `${this.min} to ${this.max}` },
    ];

    if (this.point.target !== undefined) {
      const target = Number(this.point.target);
      const delta = this.value - target;
      stats.push(
        { label: 'Target', value: target },
        {
          // Named by direction rather than reported as a signed number: "7
          // below target" is what a reader is asking, and a bare "-7" leaves
          // them working out which way it points.
          label: delta >= 0 ? 'Above target by' : 'Below target by',
          value: Math.abs(delta),
        },
      );
    }

    const band = bandOf(this.value, this.point.bands);
    if (band !== null) {
      stats.push({ label: 'Band', value: band });
    }

    const headers = ['Measure', 'Value'];
    const rows: (string | number)[][] = [
      [this.point.label ?? this.title, this.value],
    ];

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
