import type { ContourPoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { DescriptionState, TextState, TraceState } from '@type/state';
import { contourCurveLevel, contourLevelCount } from '@util/contourLevel';
import { defaultFormat, defaultLabelFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { LineTrace } from './line';

/** Trims binary floating-point noise from a derived magnitude. */
function withoutFloatNoise(value: number): number {
  return Number(value.toPrecision(12));
}

/** One point of a level, and where it sits in the grid the reader walks. */
interface LevelPoint {
  /** Which curve. */
  row: number;
  /** Which point along it. */
  col: number;
  /** The point itself. */
  point: ContourPoint;
}

/** A gap between two adjacent levels, and the point it was measured from. */
interface Gap {
  /** How far apart the two levels run there. */
  distance: number;
  /** Where along the field it was measured. */
  x: number;
  /** Where along the field it was measured. */
  y: number;
}

/**
 * Trace implementation for contour and filled contour plots.
 *
 * A scalar field drawn as curves of constant value. Structurally that is a
 * multi-line layer -- one curve per level -- so navigation, braille and
 * highlighting all transfer from {@link LineTrace}, and walking a row is
 * walking one iso-value curve.
 *
 * **The level is a first-class object, not a colour.** Read as a plain line
 * layer, the level is a series name at best: the curve announces where it runs
 * and never what value it runs at, which is the first thing anyone asks of a
 * contour plot. So it is announced on the `z` axis -- the field's own axis --
 * where the layer's `z` format applies to it, because it is a value of the
 * field rather than a label for the curve.
 *
 * **Spacing is the gradient.** How densely the curves are drawn is the visual
 * cue for how steeply the field changes, and it is the one thing a reader
 * walking a single curve can never assemble: the curve says nothing about its
 * neighbours. So each point announces the distance to the nearest point on the
 * adjacent level, which is exactly the distance an eye measures between two
 * lines -- tight spacing is a cliff, wide spacing is a plateau.
 *
 * The lattice underneath a contour is a heatmap and {@link Heatmap} reads it,
 * which is the fallback the issue calls the cheap one. What is here is the
 * reading that makes the chart legible.
 */
export class ContourTrace extends LineTrace {
  /** Each curve's level, or NaN where the layer declared none. */
  private readonly levels: number[];

  /** The curves as this trace reads them. */
  private readonly curves: ContourPoint[][];

  /**
   * The declared levels, each once, lowest first. A level drawn as several
   * islands arrives as several curves carrying one number; this is the list
   * of levels the reader moves between.
   */
  private readonly levelOrder: number[];

  /** Every point of each declared level, over all the curves it is drawn as. */
  private readonly levelPoints: Map<number, LevelPoint[]>;

  /**
   * Memoised {@link ContourTrace.spacingExtremes}. `undefined` means not yet
   * computed; `null` is a computed answer of "no gap is measurable".
   */
  private extremes?: { closest: Gap; widest: Gap } | null;

  /**
   * Creates a new contour trace.
   *
   * @param layer - The MAIDR layer carrying one curve per level
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.curves = layer.data as ContourPoint[][];
    this.levels = this.curves.map(curve => contourCurveLevel(curve));
    this.levelOrder = [...new Set(this.levels.filter(Number.isFinite))]
      .sort((a, b) => a - b);
    this.levelPoints = new Map();
    for (const [row, curve] of this.curves.entries()) {
      const level = this.levels[row];
      if (!Number.isFinite(level)) {
        continue;
      }
      const points = this.levelPoints.get(level) ?? [];
      for (const [col, point] of curve.entries()) {
        points.push({ row, col, point });
      }
      this.levelPoints.set(level, points);
    }
  }

  /**
   * Where Up and Down land: the nearest point of the next level up or down.
   *
   * Inherited, Up and Down looked for another curve with a point at the
   * reader's exact x and a larger or smaller y, which is how a line chart's
   * series line up. Contour curves share no x values: each is traced where
   * the field crosses its own level. So a reader could leave a level only
   * from the one or two points where two curves happened to share an x, and
   * heard "No more data" everywhere else. On a contour plot up is the next
   * level up, and the place on it is the one nearest the reader's.
   *
   * A curve that declares no level has no next level, and keeps the line
   * chart's reading.
   *
   * @param direction - UPWARD for the next level up, DOWNWARD for the next down
   * @returns The row and column to move to, or null at the top or bottom level
   */
  protected override findVerticalTarget(
    direction: 'UPWARD' | 'DOWNWARD',
  ): { row: number; col: number } | null {
    const level = this.levels[this.row];
    if (!Number.isFinite(level)) {
      return super.findVerticalTarget(direction);
    }
    const at = this.levelOrder.indexOf(level);
    const next = this.levelOrder[direction === 'UPWARD' ? at + 1 : at - 1];
    return next === undefined ? null : this.nearestPointOf(next);
  }

  /**
   * Control+Up and Control+Down go to the highest and the lowest level, at
   * the point of it nearest the reader's.
   *
   * Inherited, they went to the top or bottom of the reader's column of a
   * line chart, matched by point index -- an index that is a different place
   * on every curve -- so they landed on an arbitrary curve rather than the
   * highest or lowest level, and the next Up or Down still moved.
   *
   * On the highest level already, Control+Up stays and says the point again,
   * as a jump to the end of a grid does on every other chart.
   *
   * @param direction - The direction to jump in
   * @returns Whether the reader moved
   */
  public override moveToExtreme(direction: MovableDirection): boolean {
    if (direction !== 'UPWARD' && direction !== 'DOWNWARD') {
      return super.moveToExtreme(direction);
    }
    if (this.isInitialEntry) {
      // Entering is the first move, as it is for every other jump: the
      // reader lands on the first point, and the jump goes on from there.
      this.enterTrace();
    }
    const level = this.levels[this.row];
    const extreme = direction === 'UPWARD'
      ? this.levelOrder[this.levelOrder.length - 1]
      : this.levelOrder[0];
    if (!Number.isFinite(level) || extreme === undefined) {
      return super.moveToExtreme(direction);
    }
    const target = level === extreme
      ? { row: this.row, col: this.col }
      : this.nearestPointOf(extreme);
    this.row = target.row;
    this.col = target.col;
    this.notifyStateUpdate();
    return true;
  }

  /**
   * The point of a level nearest the reader's, across every curve the level
   * is drawn as.
   *
   * Where nothing can be measured -- the reader's point, or every point of
   * the level, has no position -- the level's first point, so the reader
   * still reaches the level rather than hearing that there is none.
   *
   * @param level - A declared level, to land on
   * @returns Its nearest point
   */
  private nearestPointOf(level: number): { row: number; col: number } {
    const points = this.levelPoints.get(level) ?? [];
    const first = points[0] ?? { row: this.levels.indexOf(level), col: 0 };
    const here = this.curves[this.row]?.[this.col];
    const x = Number(here?.x);
    const y = Number(here?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { row: first.row, col: first.col };
    }

    let best = first;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of points) {
      const dx = Number(candidate.point.x) - x;
      const dy = Number(candidate.point.y) - y;
      const distance = dx * dx + dy * dy;
      if (Number.isFinite(distance) && distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return { row: best.row, col: best.col };
  }

  /**
   * The state the entry instruction is built from names a contour plot and
   * counts its levels: inherited, it said "multiline with 4 groups", which is
   * the line chart this trace is built on, not the chart the reader is on.
   *
   * @returns The line's state, as a contour plot
   */
  public override get state(): TraceState {
    const state = super.state;
    if (state.empty) {
      return state;
    }
    return {
      ...state,
      plotType: this.spokenPlotType(t('model.plotTypeContour')),
      groupCount: contourLevelCount(this.curves),
    };
  }

  /**
   * Where a level's highlight lands.
   *
   * A contour is the one line-shaped trace whose series is not reliably one
   * drawn element. Plotly writes one `<path>` per **curve** under one
   * `g.contourlevel` per **level**, and only the level is dependably
   * addressable. Measured for xability/py-maidr#643 across 33 fields and 207
   * levels -- random sums of gaussians, a saddle, a monkey saddle, ripples, a
   * staircase, noise -- against what `contourpy` traces from the same grid:
   *
   * ```
   * levels where the counts disagreed        0 / 207
   * levels where the order within one did   18 / 207
   * ```
   *
   * Five of the eighteen were ordinary two-peaked gaussian fields, so
   * `g.contourlevel:nth-of-type(k)` is dependable and `... path:nth-of-type(j)`
   * is not. Inherited, that left a producer two options: a per-curve selector
   * that resolves to a real element and the wrong one, or no selector at all
   * and no highlight (xability/maidr#1142).
   *
   * So a selector resolving to **several** elements is read as a level rather
   * than a curve, and every point of that series outlines all of them. That is
   * the reading matplotlib's contour has always given -- it draws one `<path>`
   * per level, so naming the level names an element -- and a reader on one
   * island of the 0.5 contour sees the 0.5 contour outlined.
   *
   * Decided per level rather than per layer, because a field usually has
   * islands at some levels and not others, and a reader on a single-curve
   * level keeps the per-point highlight that walks with them.
   *
   * The selector resolves to the paths rather than naming the `g.contourlevel`
   * itself because, when this was written, `Svg.createHighlightElement` set
   * `stroke` on the group's *clone* alone, and `stroke` is inherited only by a
   * child that declares none -- plotly stamps one on every contour path, so
   * the clone came out colourless. A group is outlined through its shapes
   * now, but producers emit the paths, and this reading is what they emit
   * against.
   *
   * @param selectors - One selector per level, as the layer declared them
   * @returns The elements to outline, point by point
   */
  protected override mapToSvgElements(
    selectors?: string[],
  ): (SVGElement[] | SVGElement)[][] | null {
    const perCurve = super.mapToSvgElements(selectors);
    // The parent answers null when the selectors are unusable at all -- there
    // are not one per series -- and that is a different answer from "one per
    // series, resolving to nothing", so it is passed through rather than
    // turned into a row of empties.
    if (!selectors || perCurve === null) {
      return perCurve;
    }

    // Resolved without cloning, the way `mapViaDomElements` does and for the
    // same reason: a hidden copy beside each match shifts the positional
    // selectors of every level after it (#1004).
    const levels = selectors.map(selector =>
      Svg.selectAllElements<SVGElement>(selector, false),
    );

    return levels.map((elements, row) => {
      if (elements.length < 2) {
        return perCurve[row];
      }
      // The parent has already synthesised a marker per point along whichever
      // island it happened to resolve first -- the wrong-element highlight
      // this override exists to replace. They are appended to the chart, so
      // dropping the reference would leave them in it.
      ContourTrace.discard(perCurve[row]);
      // `lineValues` rather than `curves`: this runs from the parent's
      // constructor, before this class's own fields are assigned.
      return this.lineValues[row].map(() => elements);
    });
  }

  /**
   * Remove markers MAIDR synthesised and is about to stop referencing.
   *
   * Only MAIDR's own: the chart's live elements are highlighted in place and
   * removing one would erase part of the drawing.
   *
   * @param cells - One series' worth of mapped highlight elements
   */
  private static discard(cells?: (SVGElement[] | SVGElement)[]): void {
    for (const cell of cells ?? []) {
      for (const element of Array.isArray(cell) ? cell : [cell]) {
        if (Svg.isOwned(element)) {
          element.remove();
        }
      }
    }
  }

  protected override get groupFallbackLabel(): string {
    return t('model.nounContour');
  }

  /**
   * The vocabulary the description dialog is rendered with.
   *
   * Inherited, a contour's description opens "Number of lines: 3, Points per
   * line: 40, Line names: Line 1, Line 2, Line 3" and its data table has a
   * `Line` column of `Line 1` -- the reading this class exists to replace,
   * printed in the part of the description a reader consults most.
   *
   * @returns The four labels the description uses
   */
  protected override get seriesLabels(): {
    count: string;
    perSeries: string;
    names: string;
    column: string;
  } {
    return {
      count: t('model.statNumberOfLevels'),
      perSeries: t('model.statPointsPerLevel'),
      names: t('model.statLevels'),
      // The layer's own word for the field, which is what the announcement
      // already calls this number: a reader who hears "Density 0.2" walking
      // the chart and then finds a column headed `Level` holding 0.2, with
      // the same dialog listing z as Density, is reading two names for one
      // quantity. `this.z` is the literal `Level` when the layer names no z,
      // so an unlabelled contour is unchanged.
      column: this.z,
    };
  }

  /**
   * What a curve is called wherever the description names one.
   *
   * The level, because that is what the curve *is*. `Line 2` is an index into
   * the order the producer happened to emit the curves in, and a reader given
   * it in a column headed `Level` would reasonably take it for one.
   *
   * Rounded as the announcement rounds it. A producer computing its levels
   * hands over floats -- matplotlib's 0.15 step reaches 0.45 as
   * 0.45000000000000007 -- and in full they were listed beside a `Level
   * range` and a `Level step` the description had rounded, while every point
   * of the curve announced `Level is 0.45`.
   *
   * @param row - Which curve
   * @returns Its level, or the best name available for a curve declaring none
   */
  protected override groupNameAt(row: number): string {
    const level = this.levels[row];
    if (Number.isFinite(level)) {
      // Not grouped in thousands, as an authored numeric name is not: the
      // names are listed with commas between them.
      return defaultLabelFormat(level);
    }
    // No level: an authored name if the layer carried one, and otherwise a
    // noun that at least does not read as a level.
    return this.authoredGroupNameAt(row)
      ?? t('model.fallbackNumbered', { noun: t('model.nounCurve'), index: row + 1 });
  }

  /**
   * The names the description lists the levels under: each declared level
   * once, lowest first, then each curve declaring none, which nothing says
   * shares a level with another.
   *
   * @returns One name per level
   */
  private levelNames(): string[] {
    const names = this.levelOrder.map(level =>
      this.groupNameAt(this.levelPoints.get(level)?.[0]?.row ?? this.levels.indexOf(level)),
    );
    for (const [row, level] of this.levels.entries()) {
      if (!Number.isFinite(level)) {
        names.push(this.groupNameAt(row));
      }
    }
    return names;
  }

  /**
   * How many points each level has, summed over the islands it is drawn as:
   * one number when every level has as many, else the span from the fewest
   * to the most, as the line layer states its series.
   *
   * @returns The count, or its span
   */
  private pointsPerLevel(): number | string {
    const perLevel = new Map<number, number>();
    const lengths: number[] = [];
    for (const [row, curve] of this.curves.entries()) {
      const level = this.levels[row];
      if (Number.isFinite(level)) {
        perLevel.set(level, (perLevel.get(level) ?? 0) + curve.length);
      } else if (curve.length > 0) {
        lengths.push(curve.length);
      }
    }
    lengths.push(...perLevel.values());
    if (lengths.length === 0) {
      return 0;
    }
    const fewest = MathUtil.safeMin(lengths);
    const most = MathUtil.safeMax(lengths);
    return fewest === most ? most : t('model.spanRange', { min: fewest, max: most });
  }

  protected override get text(): TextState {
    const base = super.text;
    const level = this.levels[this.row];
    const state: TextState = { ...base };

    if (Number.isFinite(level)) {
      // On the field's own axis, so the layer's `z` format applies. The level
      // is a value OF the field, not a name for the curve -- which is what a
      // plain line layer would have made it.
      state.z = { label: this.z, value: level };
    }

    const spacing = this.spacingAt(this.row, this.col);
    if (spacing !== null) {
      // Off both axes -- it is a distance in the plane, not a position on
      // either -- so it travels as an aside rather than through a field the
      // text service would format with an axis formatter.
      //
      // The neighbour is named in the same clause rather than in a second
      // aside: terse mode drops aside labels, so two numeric asides would read
      // ", 1, 0.1" and the level would arrive looking like a second distance.
      // It is worth naming at all because the gap is taken to whichever side
      // is closer, so which side that is changes as the reader walks the curve.
      //
      // Rounded here, as the description's own gap stats are: an aside is a
      // composed string, so nothing downstream formats it, and a distance
      // straight out of a square root is a dozen digits spoken on every
      // point of every curve.
      state.asides = [{
        label: t('model.asideSpacing'),
        value: t('model.contourSpacingValue', {
          distance: defaultFormat(spacing.distance),
          level: defaultFormat(spacing.to),
        }),
      }];
    }

    return state;
  }

  /**
   * How far the nearest adjacent level runs from a point.
   *
   * The distance an eye measures between two neighbouring lines, which is the
   * whole of what contour density conveys visually. Taken to whichever
   * neighbour is closer, because a reader looking at a point sees the gap on
   * both sides and takes the tighter one as the gradient there.
   *
   * The neighbours are the next level up and the next level down, over every
   * curve each is drawn as. They used to be the curves emitted just before and
   * just after this one, which are the adjacent levels only when every level
   * is one curve and the curves come in order. A level drawn as islands
   * arrives as several curves in a row, so the gap was measured to another
   * island of the reader's own level and announced as "to level 100" on the
   * level-100 curve; a curve declaring no level has no adjacent level, and
   * says nothing.
   *
   * Measured to the nearest **sampled point** of the neighbouring curve
   * rather than to the nearest place on the segments between its samples.
   * That is an over-estimate bounded by the sampling interval, and it goes
   * to zero as the producer samples more densely -- which contour producers
   * do, since the curve has to look smooth. Pairing by index instead would
   * not be an approximation at all: two curves of a field are not sampled at
   * the same places, so index `n` of one is simply somewhere else than index
   * `n` of the other.
   *
   * @param row - Which curve
   * @param col - Which point along it
   * @returns The distance and the level it was measured to, or null
   */
  private spacingAt(row: number, col: number): { distance: number; to: number } | null {
    const here = this.curves[row]?.[col];
    if (here === null || here === undefined) {
      return null;
    }
    const x = Number(here.x);
    const y = Number(here.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const at = this.levelOrder.indexOf(this.levels[row]);
    if (at === -1) {
      return null;
    }

    let best: { distance: number; to: number } | null = null;
    for (const level of [this.levelOrder[at - 1], this.levelOrder[at + 1]]) {
      if (level === undefined) {
        continue;
      }
      for (const { point } of this.levelPoints.get(level) ?? []) {
        const dx = Number(point.x) - x;
        const dy = Number(point.y) - y;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
          continue;
        }
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (best === null || distance < best.distance) {
          best = { distance: withoutFloatNoise(distance), to: level };
        }
      }
    }
    return best;
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const declared = this.levels.filter(Number.isFinite);
    const labels = this.seriesLabels;

    // Inherited, `Min value` and `Max value` are the line layer's min and max
    // of **y** -- the vertical extent of the drawn vertices. "What range does
    // this field cover?" is the first question a contour is read with, and
    // under the two most value-shaped labels in the dialog, beside a column
    // of levels, they answered it with the height of the plot: a field
    // running 0.1 to 0.3 was stated as 0 to 18. Named for the axis they
    // actually measure, they are a fact about the drawing and read as one.
    //
    // The count, the sizes and the names are the line layer's too, and it
    // counts curves. A level drawn as islands is several curves carrying one
    // number, so the volcano's five levels were "Number of levels: 9" and
    // "Levels: 100, 100, 100, 120, ...". They are counted, sized and named
    // per level here, as the entry instruction already counts them.
    const stats = base.stats.map((stat) => {
      if (stat.label === labels.count) {
        return { ...stat, value: contourLevelCount(this.curves) };
      }
      if (stat.label === labels.perSeries) {
        return { ...stat, value: this.pointsPerLevel() };
      }
      if (stat.label === labels.names) {
        return { ...stat, value: this.levelNames().join(', ') };
      }
      if (stat.label === t('model.statMinValue')) {
        return { ...stat, label: t('model.statMinimumAxis', { axis: this.yAxis }) };
      }
      if (stat.label === t('model.statMaxValue')) {
        return { ...stat, label: t('model.statMaximumAxis', { axis: this.yAxis }) };
      }
      return stat;
    });

    // How many levels there are and what they are -- the first two questions
    // a contour plot is read with, and neither answerable by walking a curve,
    // which knows only its own. Both come from the inherited stats now that
    // `seriesLabels` and `groupNameAt` say level where they used to say line;
    // a single-curve layer is the one case the parent stays silent about,
    // since it has no series list to print.
    if (this.curves.length === 1 && declared.length === 1) {
      stats.push({ label: t('model.statLevel'), value: declared[0] });
    }

    const distinct = this.levelOrder;
    if (distinct.length > 1) {
      // What the field spans, which is what the two relabelled stats sounded
      // like they were saying. Withheld on a single level, whose value is
      // already stated and is not a range.
      stats.push({
        label: t('model.statLevelRange'),
        value: MathUtil.spannedOrMissing(distinct[0], distinct[distinct.length - 1]),
      });
    }

    // Every curve, or none: a step measured across a curve whose level the
    // layer left out is the distance over two gaps announced as one, and the
    // whole point of naming the step is that a reader may rely on it.
    //
    // Over the distinct levels in ascending order, neither of which the
    // payload guarantees: islands of one level diffed in place give a step of
    // 0, and nothing requires a producer to emit its curves in order -- 0.2,
    // 0.3, 0.1 diffed in place is a step that "varies" on a field whose levels
    // are evenly spaced.
    if (distinct.length > 1 && declared.length === this.levels.length) {
      const steps = distinct
        .slice(1)
        .map((level, i) => withoutFloatNoise(level - distinct[i]));
      const uniform = steps.every(step => step === steps[0]);
      if (uniform) {
        // A uniform step is what lets a reader treat spacing as gradient
        // directly: equal value between curves means the distance between
        // them IS the slope. A varying step does not, so it is named as
        // varying rather than averaged into a number that would mislead.
        stats.push({ label: t('model.statLevelStep'), value: steps[0] });
      } else {
        stats.push({ label: t('model.statLevelStep'), value: t('model.contourStepVaries') });
      }
    }

    const spacing = this.spacingExtremes();
    if (spacing !== null) {
      // Where the field changes fastest, which on the page is where the lines
      // crowd together -- and which a reader walking one curve at a time
      // cannot find, because the finding is about the gap between curves.
      stats.push({
        label: t('model.statClosestApproach'),
        value: this.gapPhrase(spacing.closest),
      });
      if (spacing.widest.distance !== spacing.closest.distance) {
        // The other half of the same reading. The class is built on "tight
        // spacing is a cliff, wide spacing is a plateau" and the scan already
        // holds both ends, so reporting only the cliff drops the finding a
        // reader walking one curve can least reconstruct -- on a density
        // field, where the data thins out.
        stats.push({
          label: t('model.statWidestSeparation'),
          value: this.gapPhrase(spacing.widest),
        });
      }
    }

    // The table is capped by `LineTrace`, which builds it, and says so in its
    // own `Table rows` stat -- a second cap here would slice an already-sliced
    // table and count the rows it did not remove.
    return { ...base, stats };
  }

  /**
   * How a gap between two adjacent levels reads.
   *
   * Composed here, so it is rounded here: the description service rounds a
   * numeric stat and passes a composed string through untouched, and neither
   * end of this one survives that. The distance has been through
   * {@link withoutFloatNoise}, which trims binary noise rather than rounding
   * for display, and the coordinates are the producer's own -- so the stat
   * the class exists for was announcing twelve significant digits beside a
   * `Level step` the service had rounded to two.
   *
   * @param gap - The gap and the point it was measured from
   * @returns The phrase the description states
   */
  private gapPhrase(gap: Gap): string {
    return t('model.contourGapPhrase', {
      distance: defaultFormat(gap.distance),
      xAxis: this.xAxis,
      x: defaultFormat(gap.x),
      yAxis: this.yAxis,
      y: defaultFormat(gap.y),
    });
  }

  /**
   * Where two adjacent levels run closest together, and where they run widest.
   *
   * Every point measured against every point of both neighbouring curves, so
   * this is quadratic in sampling density: a twenty-level contour sampled two
   * thousand times per curve is tens of millions of distances. It is computed
   * on demand -- only when the description dialog is opened -- and the result
   * is cached, because the curves are fixed at construction, so a reader who
   * opens the dialog repeatedly pays for it once. Both ends come out of the
   * one scan for the same reason.
   *
   * @returns The tightest and widest gaps, or null when no gap is measurable
   */
  private spacingExtremes(): { closest: Gap; widest: Gap } | null {
    if (this.extremes !== undefined) {
      return this.extremes;
    }

    let closest: Gap | null = null;
    let widest: Gap | null = null;
    for (const [row, curve] of this.curves.entries()) {
      for (const [col, point] of curve.entries()) {
        const spacing = this.spacingAt(row, col);
        if (spacing === null) {
          continue;
        }
        const gap: Gap = {
          distance: spacing.distance,
          x: Number(point.x),
          y: Number(point.y),
        };
        if (closest === null || gap.distance < closest.distance) {
          closest = gap;
        }
        if (widest === null || gap.distance > widest.distance) {
          widest = gap;
        }
      }
    }

    this.extremes = closest === null || widest === null
      ? null
      : { closest, widest };
    return this.extremes;
  }
}
