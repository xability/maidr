/**
 * The co-located `maidr` declaration, read off an amCharts 5 series.
 *
 * amCharts draws marks and says nothing about what they mean. A Kaplan-Meier
 * curve is a `StepLineSeries`, an error bar is a second `ColumnSeries` bound to
 * `openValueY`, and a volcano plot is a `LineSeries` with its stroke switched
 * off and bullets pushed on. Every one of those configurations is also worn by
 * an ordinary chart, so the heuristics in `extractor.ts` cannot separate them
 * and must not try: a step line read as a survival curve announces censoring
 * the chart never carried. What separates them is the author saying so, in the
 * slot amCharts documents as "a storage for any custom user data":
 *
 * ```js
 * series.set('userData', { maidr: { type: 'survival', censored: 'cens' } });
 * ```
 *
 * This module turns those blocks into a **plan for a whole chart**: which
 * series declared a layer, which were absorbed into somebody else's layer as a
 * companion or as a further arm, and what each declared layer's fields resolve
 * to. Both the JSON path (`adapter.ts`) and the highlight path (`binder.tsx`)
 * plan the same chart the same way, so the layer a reader hears and the mark
 * the overlay outlines are always the same series.
 *
 * A declaration never throws and never guesses. Anything it cannot honour —
 * a type this adapter has no amCharts construct for, a companion naming no
 * series, a field no row carries — degrades to a truthful smaller reading and
 * says so once, exactly as `src/adapters/shared/traceDeclaration.ts` prescribes.
 */

import type {
  AlluvialDeclaration,
  ChoroplethDeclaration,
  ErrorBarDeclaration,
  ForestDeclaration,
  MaidrTraceDeclaration,
  ManhattanDeclaration,
  ScatterDeclaration,
  SurvivalDeclaration,
  VolcanoDeclaration,
} from '@type/declaration';
import type {
  ErrorBarPoint,
  ForestPoint,
  ScatterPoint,
  SurvivalPoint,
  ThresholdOptions,
  VolcanoPoint,
} from '@type/grammar';
import type { ChoroplethFields } from './extractor';
import type { AmChart, AmDataItem, AmXYSeries } from './types';
import {
  isFlagValue,
  readDeclarationSlot,
  resolveFieldRef,
  warnUnresolvedRef,
} from '@adapters/shared/traceDeclaration';
import { Orientation, TraceType } from '@type/grammar';
import {
  classifySeriesKind,
  extractChoroplethPoints,
  extractFlowPoints,
  isFlowSeries,
  isMapPolygonSeries,
  readXValue,
  toNumber,
  toStringOrNumber,
} from './extractor';

/** How this adapter names itself in every warning it raises. */
const ADAPTER = 'amCharts';

/**
 * The declaration variants an amCharts series can back.
 *
 * The union is smaller than `MaidrTraceDeclaration` because a declaration is
 * still a claim about a drawing: there is no amCharts construct behind a
 * `hexbin`, and a block declaring one is reported rather than read into a
 * layer with nothing in it.
 *
 * `choropleth` is here for the ordinary reason and `alluvial` for a strange
 * one. An `am5map.MapPolygonSeries` bound to a `valueField` is already read as
 * a map with no declaration at all; declaring one says which of the author's
 * own columns carries the region, the value or the centroid pair, for a map
 * that hangs them somewhere amCharts was never told about.
 *
 * `alluvial` is the odd member. Every other entry names a reading amCharts
 * draws with a series class worn by something else; an alluvial has no class
 * of its own at all, because it IS an `am5flow.Sankey` — the same weighted
 * flow, drawn with the nodes repeated across stages rather than budgeted left
 * to right. So the drawing cannot separate the two and the author has to, and
 * the declaration carries nothing but which of the two it is: the nodes, the
 * links and their weights are already in the chart.
 */
export type AmDeclaration
  = | AlluvialDeclaration
    | ChoroplethDeclaration
    | ErrorBarDeclaration
    | ForestDeclaration
    | ManhattanDeclaration
    | ScatterDeclaration
    | SurvivalDeclaration
    | VolcanoDeclaration;

/**
 * One layer an author declared, with everything the chart drew for it.
 *
 * A figure routinely spreads one layer over several series — an estimate and
 * the column drawing its interval, a curve and the ticks marking its censored
 * times, twenty-two chromosomes that are one cloud — and every one of those
 * extra series is here rather than becoming a layer of its own.
 */
export interface AmDeclaredLayer {
  /** The series carrying the block: the estimate, the curve, the cloud. */
  series: AmXYSeries;
  /** The validated block, narrowed to what this adapter can read. */
  declaration: AmDeclaration;
  /** `intervalSeries` — the floating column drawing the interval. */
  interval?: AmXYSeries;
  /** `censoredSeries` — the ticks marking censored times. */
  censored?: AmXYSeries;
  /** `bandSeries` — the confidence band drawn around a curve. */
  band?: AmXYSeries;
  /** `pooledSeries` — the summary mark at the foot of a forest plot. */
  pooled?: AmXYSeries;
  /**
   * Following siblings folded into this layer by `merge`: further arms of one
   * survival figure, or further chromosomes of one Manhattan cloud.
   */
  arms: AmXYSeries[];
}

/** What a chart's declarations come to, resolved together. */
export interface AmDeclarationPlan {
  /** The declared layers, keyed by the series carrying the block. */
  declared: Map<AmXYSeries, AmDeclaredLayer>;
  /**
   * Series that must not become a layer of their own — every companion and
   * every merged sibling. They are drawn, and they are announced, as part of
   * the layer that named them.
   */
  absorbed: Set<AmXYSeries>;
}

/** The interval around one estimate, as absolute positions on the value axis. */
interface Bounds {
  yMin?: number;
  yMax?: number;
}

/** The samples of one declared layer, and the live marks behind them. */
export interface DeclaredSamples<T> {
  data: T[];
  /** The live data items, in the order `data` holds their points. */
  items: AmDataItem[];
  /**
   * Which series drew each mark, index-aligned with `items`.
   *
   * Not always the declaring one: a forest plot's pooled summary is commonly a
   * companion series of its own, and its rows are appended after the studies.
   */
  owners: AmXYSeries[];
}

/** A survival figure's arms: one row of points, and one row of marks, each. */
export interface DeclaredArms {
  data: SurvivalPoint[][];
  items: AmDataItem[][];
}

// ---------------------------------------------------------------------------
// Reading and validating one block
// ---------------------------------------------------------------------------

/**
 * Declarations already validated, keyed by the `userData` object they were
 * read from.
 *
 * A chart is planned twice per binding — once for the layers and once for the
 * highlight — and `validateDeclaration` warns as it goes, so validating twice
 * would say everything twice. Keying the memo on the author's own object is
 * what keeps that from also silencing a *corrected* block: rewriting
 * `userData` produces a new object, which is validated and reported afresh.
 */
const validated = new WeakMap<object, MaidrTraceDeclaration | null>();

/** Problems already reported, per declaration, so each is said once. */
const reported = new WeakMap<object, Set<string>>();

/**
 * Whether a problem has already been reported for a declaration, marking it as
 * reported if not.
 *
 * @param declaration - The block the problem belongs to.
 * @param key         - What the problem is.
 * @returns True when it has been said already.
 */
function alreadyReported(declaration: object, key: string): boolean {
  let seen = reported.get(declaration);
  if (seen === undefined) {
    seen = new Set<string>();
    reported.set(declaration, seen);
  }
  if (seen.has(key)) {
    return true;
  }
  seen.add(key);
  return false;
}

/**
 * Emit one adapter-prefixed warning per declaration per problem.
 *
 * @param declaration - The block the problem belongs to.
 * @param key         - What the problem is, for the once-only check.
 * @param message     - The sentence following the `[MAIDR amCharts]` prefix.
 */
function warnOnce(declaration: object, key: string, message: string): void {
  if (!alreadyReported(declaration, key)) {
    console.warn(`[MAIDR ${ADAPTER}] ${message}`);
  }
}

/**
 * How an author finds a series again, for a warning to point at.
 *
 * The `id` comes first because it is the name a companion is addressed by, so
 * a message about an unresolvable `intervalSeries` prints the same string the
 * author would have to write to fix it.
 *
 * @param series - The series being read.
 * @returns A locating phrase, e.g. `series "estimate"`.
 */
export function describeSeries(series: AmXYSeries): string {
  const id = series.get('id');
  if (typeof id === 'string' && id.length > 0) {
    return `series "${id}"`;
  }
  const name = series.get('name');
  if (typeof name === 'string' && name.length > 0) {
    return `series "${name}"`;
  }
  return `series ${series.className ?? 'of unknown class'}`;
}

/**
 * Read and validate the `maidr` block on one series' `userData`.
 *
 * @param series - The series to read.
 * @returns The validated declaration, or `null` when there is none to read.
 */
function readDeclaration(series: AmXYSeries): MaidrTraceDeclaration | null {
  const slot = series.get('userData');
  if (typeof slot !== 'object' || slot === null) {
    return null;
  }

  const cached = validated.get(slot);
  if (cached !== undefined) {
    return cached;
  }
  const declaration = readDeclarationSlot(slot, {
    adapter: ADAPTER,
    seriesRef: describeSeries(series),
  });
  validated.set(slot, declaration);
  return declaration;
}

/** Whether a validated declaration is one an amCharts series can back. */
function isDeclarable(declaration: MaidrTraceDeclaration): declaration is AmDeclaration {
  switch (declaration.type) {
    case TraceType.ALLUVIAL:
    case TraceType.CHOROPLETH:
    case TraceType.ERROR_BAR:
    case TraceType.FOREST:
    case TraceType.MANHATTAN:
    case TraceType.SCATTER:
    case TraceType.SURVIVAL:
    case TraceType.VOLCANO:
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Reading one row
// ---------------------------------------------------------------------------

/**
 * Convert a value read off an author's row to a finite number.
 *
 * Stricter than the extractor's own conversion, which coerces `null` and `''`
 * to zero because its callers have already established the value is there. A
 * declared field is routinely absent on some rows — a one-sided interval, a
 * study with no weight — and a zero substituted for one is a claim the data
 * does not make. Numeric strings are accepted, since a row that came from a
 * CSV carries every column as one.
 *
 * @param value - Whatever the field resolved to.
 * @returns The number, or `null` when the value is not one.
 */
function declaredNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Strip binary floating-point noise from a bound obtained by arithmetic.
 *
 * An interval given as an offset is announced as its absolute bounds, and
 * `1.4 - 0.2` reads as `1.1999999999999997` otherwise.
 */
function withoutFloatNoise(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * Every field a declaration named explicitly, so one that no row carried can
 * be reported once the series has been read.
 *
 * `resolveFieldRef` answers per row and cannot tell a typo from a row that
 * legitimately lacks the field. The series is the unit that can: entries are
 * deleted as they resolve, and whatever is left named nothing.
 */
type Misses = Map<string, string>;

/**
 * Collect the explicit refs of a declaration, keyed by the field they fill.
 *
 * `fields` is the set the caller is about to read, and only those: a forest
 * plot reads its bounds in one pass and its weights in another, and a ref
 * watched by a pass that never reads it would be reported as missing on every
 * chart that carries it.
 *
 * @param declaration - The block being read.
 * @param fields      - The canonical field names this pass resolves.
 * @returns The refs to watch, to be deleted as each one resolves.
 */
function explicitRefs(declaration: AmDeclaration, fields: readonly string[]): Misses {
  const misses: Misses = new Map();
  const block: Record<string, unknown> = { ...declaration };
  for (const canonical of fields) {
    const ref = block[canonical];
    if (typeof ref === 'string' && ref.trim() !== '') {
      misses.set(canonical, ref);
    }
  }
  return misses;
}

/**
 * Read one declared fact off a row, recording that its explicit name resolved.
 *
 * @param row       - The author's own record behind the mark.
 * @param ref       - The field the declaration named, if any.
 * @param canonical - The grammar field being filled.
 * @param misses    - The explicit refs still waiting to resolve.
 * @returns The value read, or `undefined`.
 */
function readField(
  row: unknown,
  ref: string | undefined,
  canonical: string,
  misses: Misses,
): unknown {
  const value = resolveFieldRef<unknown>(row, ref, canonical);
  if (value !== undefined) {
    misses.delete(canonical);
  }
  return value;
}

/** Report every explicit ref that no row of the series carried. */
function reportMisses(declared: AmDeclaredLayer, misses: Misses): void {
  for (const [canonical, ref] of misses) {
    if (alreadyReported(declared.declaration, `unresolved:${canonical}`)) {
      continue;
    }
    warnUnresolvedRef(
      { adapter: ADAPTER, seriesRef: describeSeries(declared.series) },
      ref,
      canonical,
    );
  }
}

// ---------------------------------------------------------------------------
// Orientation and the fields it decides
// ---------------------------------------------------------------------------

/** Whether a series puts its categories on the Y axis and its values on X. */
function drawsHorizontally(series: AmXYSeries): boolean {
  return typeof series.get('categoryYField') === 'string';
}

/**
 * Which way a declared interval layer runs.
 *
 * A forest plot is horizontal by construction — studies down a category axis,
 * effect running left to right — and amCharts says so by binding `categoryY`.
 * The declaration overrides it for the chart that binds neither.
 */
export function isDeclaredHorizontal(declared: AmDeclaredLayer): boolean {
  return declaredHorizontal(declared.series, declared.declaration);
}

/**
 * The same question, asked while the plan is still being built and there is no
 * {@link AmDeclaredLayer} yet.
 *
 * Kept as one function because the two answers have to agree: the check that a
 * series backs its declared type reads the value axis this decides, and a
 * disagreement would pass a series as readable and then read nothing off it.
 */
function declaredHorizontal(series: AmXYSeries, declaration: AmDeclaration): boolean {
  if (declaration.type === TraceType.ERROR_BAR || declaration.type === TraceType.FOREST) {
    if (declaration.orientation !== undefined) {
      return declaration.orientation === Orientation.HORIZONTAL;
    }
  }
  return drawsHorizontally(series);
}

/** Where a series of the given orientation keeps its estimate and its bounds. */
function valueFields(horizontal: boolean): { value: string; open: string } {
  return horizontal
    ? { value: 'valueX', open: 'openValueX' }
    : { value: 'valueY', open: 'openValueY' };
}

/**
 * The position a mark sits at, on the axis the samples run along.
 *
 * A vertical chart puts it on X, where {@link readXValue} already knows the
 * four places amCharts may keep it; a horizontal one puts it on Y, where a
 * category axis is what a forest plot's study names arrive on.
 */
function readMain(item: AmDataItem, series: AmXYSeries, horizontal: boolean): unknown {
  if (!horizontal) {
    return readXValue(item, series);
  }
  return item.get('categoryY') ?? item.get('valueY');
}

/**
 * The four column names a choropleth declaration renames a region's facts to.
 *
 * Narrowed to plain strings here so that `extractor.ts` — which reads what
 * amCharts drew — never has to know what a declaration is. A slot the author
 * left out stays `undefined`, and the extractor then walks its own chain for
 * that fact rather than treating the omission as a name.
 *
 * Exported because the highlight path needs the same four: they decide which
 * regions the layer kept, and a resolver filtering by a different rule would
 * index a list of a different length.
 *
 * @param declaration - The declared map.
 * @returns The named columns, each omitted when the author named none.
 */
export function choroplethFields(declaration: ChoroplethDeclaration): ChoroplethFields {
  return {
    ...(declaration.region != null ? { region: declaration.region } : {}),
    ...(declaration.value != null ? { value: declaration.value } : {}),
    ...(declaration.lon != null ? { lon: declaration.lon } : {}),
    ...(declaration.lat != null ? { lat: declaration.lat } : {}),
  };
}

// ---------------------------------------------------------------------------
// Planning a chart
// ---------------------------------------------------------------------------

/**
 * Whether a series carries the values its declared type is read from.
 *
 * This is the "wrong construct" check: `type: 'survival'` on a pie series is a
 * mistake worth reporting, not a layer to emit with nothing in it. Asked of the
 * data rather than of the class name, because amCharts draws most of these with
 * whatever series class the author reached for.
 *
 * @param series      - The declaring series.
 * @param declaration - The block it carries.
 * @returns True when at least one mark can be read as the declared type.
 */
function backsDeclaration(series: AmXYSeries, declaration: AmDeclaration): boolean {
  switch (declaration.type) {
    // Both halves are required. The class name is what says the chart drew a
    // weighted flow at all — `type: 'alluvial'` on a pie series is the mistake
    // this check exists to report — and the links are what say there is one to
    // read: a flow series whose ends or weights the adapter cannot resolve
    // would otherwise emit an alluvial layer with nothing in it.
    case TraceType.ALLUVIAL:
      return isFlowSeries(series) && extractFlowPoints(series).length > 0;
    // Both halves again, and for the same reason. The class name says amCharts
    // drew regions at all — `type: 'choropleth'` on a column series is the
    // mistake this reports — and the regions say the named columns resolve to
    // something: a map whose `value` ref names nothing would otherwise emit a
    // layer with no regions in it.
    case TraceType.CHOROPLETH:
      return isMapPolygonSeries(series)
        && extractChoroplethPoints(series, choroplethFields(declaration)).length > 0;
    case TraceType.SURVIVAL:
      return series.dataItems.some(item =>
        readXValue(item, series) != null && item.get('valueY') != null
        && toNumber(item.get('valueY')) != null);
    case TraceType.ERROR_BAR:
    case TraceType.FOREST: {
      const horizontal = declaredHorizontal(series, declaration);
      const { value } = valueFields(horizontal);
      return series.dataItems.some(item =>
        readMain(item, series, horizontal) != null && item.get(value) != null
        && toNumber(item.get(value)) != null);
    }
    default:
      // A cloud is plotted on two value axes, and both coordinates are the
      // payload: a point missing either is not a point on it.
      return series.dataItems.some(item =>
        item.get('valueX') != null && item.get('valueY') != null
        && toNumber(item.get('valueX')) != null && toNumber(item.get('valueY')) != null);
  }
}

/**
 * Whether a declaration absorbs the undeclared siblings that follow it.
 *
 * On by default for the two figures whose series are one thing — a survival
 * plot's arms are read against each other, and a Manhattan's chromosomes are
 * one cloud — and off for the two whose siblings are usually the comparison a
 * reader wants kept apart.
 */
function mergesSiblings(declaration: AmDeclaration): boolean {
  switch (declaration.type) {
    case TraceType.SURVIVAL:
    case TraceType.MANHATTAN:
      return declaration.merge !== false;
    case TraceType.VOLCANO:
    case TraceType.SCATTER:
      return declaration.merge === true;
    default:
      return false;
  }
}

/**
 * Resolve one companion reference to a series, and absorb it.
 *
 * A ref that names nothing, that names a series declaring a layer of its own,
 * or that names a series another declaration has already absorbed, leaves the
 * parent standing without that half — the alternative is silently swallowing
 * somebody else's layer, reading one series' rows into two announced layers,
 * or matching whatever sits at that position today, which is the failure
 * `SeriesRef` exists to remove.
 */
function absorb(
  declared: AmDeclaredLayer,
  ref: string | undefined,
  role: string,
  byId: Map<string, AmXYSeries>,
  plan: AmDeclarationPlan,
): AmXYSeries | undefined {
  if (ref === undefined) {
    return undefined;
  }

  const companion = byId.get(ref);
  const parent = describeSeries(declared.series);
  if (companion === undefined || companion === declared.series) {
    warnOnce(
      declared.declaration,
      `companion:${role}`,
      `maidr declaration on ${parent} names ${role} "${ref}", which is not `
      + `another series' id; the layer is emitted without it.`,
    );
    return undefined;
  }
  if (plan.declared.has(companion)) {
    warnOnce(
      declared.declaration,
      `companion:${role}`,
      `maidr declaration on ${parent} names ${role} "${ref}", which declares a `
      + `layer of its own; it is left as that layer and not absorbed.`,
    );
    return undefined;
  }
  if (plan.absorbed.has(companion)) {
    // Two refs naming one series is an authoring mistake either way round —
    // one layer's interval column doubling as another's, or a single
    // declaration naming the same id twice. Reading those rows into both
    // layers would announce a number twice over with nothing said; the second
    // claim is refused out loud instead, as a ref naming a declared layer is.
    warnOnce(
      declared.declaration,
      `companion:${role}`,
      `maidr declaration on ${parent} names ${role} "${ref}", which another `
      + `declaration already absorbed; the layer is emitted without it.`,
    );
    return undefined;
  }

  plan.absorbed.add(companion);
  return companion;
}

/**
 * Resolve every declaration on a chart into the layers they describe.
 *
 * Runs in three passes, and the order matters: every declaration is read before
 * any companion is resolved, so a companion of a later layer is not swallowed
 * as an earlier layer's merged sibling, and every companion is absorbed before
 * the merge pass, so an absorbed series is never also an arm.
 *
 * @param chart - The chart to plan.
 * @returns The declared layers, and the series they absorbed.
 */
export function planDeclarations(chart: AmChart): AmDeclarationPlan {
  const plan: AmDeclarationPlan = { declared: new Map(), absorbed: new Set() };
  const seriesList = chart.series.values;

  for (const series of seriesList) {
    const declaration = readDeclaration(series);
    if (declaration === null) {
      continue;
    }
    if (!isDeclarable(declaration)) {
      warnOnce(
        declaration,
        'undeclarable',
        `maidr declaration on ${describeSeries(series)} declares "${declaration.type}", `
        + `which no amCharts series draws; reading it as the undeclared chart.`,
      );
      continue;
    }
    if (!backsDeclaration(series, declaration)) {
      warnOnce(
        declaration,
        'unbacked',
        `maidr declaration on ${describeSeries(series)} declares "${declaration.type}", `
        + `but no mark of it carries the values that type is read from; reading it `
        + `as the undeclared chart.`,
      );
      continue;
    }
    plan.declared.set(series, { series, declaration, arms: [] });
  }

  const byId = new Map<string, AmXYSeries>();
  for (const series of seriesList) {
    const id = series.get('id');
    if (typeof id === 'string' && id.length > 0) {
      byId.set(id, series);
    }
  }

  for (const declared of plan.declared.values()) {
    const declaration = declared.declaration;
    switch (declaration.type) {
      case TraceType.SURVIVAL:
        declared.censored = absorb(declared, declaration.censoredSeries, 'censoredSeries', byId, plan);
        declared.band = absorb(declared, declaration.bandSeries, 'bandSeries', byId, plan);
        break;
      case TraceType.FOREST:
        declared.interval = absorb(declared, declaration.intervalSeries, 'intervalSeries', byId, plan);
        declared.pooled = absorb(declared, declaration.pooledSeries, 'pooledSeries', byId, plan);
        break;
      case TraceType.ERROR_BAR:
        declared.interval = absorb(declared, declaration.intervalSeries, 'intervalSeries', byId, plan);
        break;
      default:
        break;
    }
  }

  for (const [series, declared] of plan.declared) {
    if (!mergesSiblings(declared.declaration)) {
      continue;
    }
    // What "the same drawn kind" means here is what the heuristic would have
    // called the series had nobody declared it — which is why the declaration
    // is not hooked into `classifySeriesKind`: the undeclared reading is still
    // the question being asked of the siblings.
    const drawn = classifySeriesKind(series);
    for (const sibling of seriesList.slice(seriesList.indexOf(series) + 1)) {
      if (plan.absorbed.has(sibling) || readDeclaration(sibling) !== null) {
        continue;
      }
      if (classifySeriesKind(sibling) !== drawn) {
        continue;
      }
      declared.arms.push(sibling);
      plan.absorbed.add(sibling);
    }
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Survival
// ---------------------------------------------------------------------------

/**
 * The censored times a companion series draws, as the positions it draws them
 * at.
 *
 * A figure that joins its censoring ticks separately has one mark per censored
 * time and no flag column at all, so the ticks' own x values *are* the flag.
 */
function readCensoredAt(series: AmXYSeries): Set<string> {
  const times = new Set<string>();
  for (const item of series.dataItems) {
    const x = readXValue(item, series);
    if (x != null) {
      times.add(String(toStringOrNumber(x)));
    }
  }
  return times;
}

/**
 * The interval a companion series draws, keyed by the position it is drawn at.
 *
 * amCharts has no error-bar and no band series: both are a second series of
 * floating marks behind the first, whose two ends are the `openValue*` /
 * `value*` pair every floating column in this adapter is read through. The two
 * series are joined on the position rather than by index, because a companion
 * routinely carries fewer rows than the series it decorates.
 */
function readCompanionBounds(series: AmXYSeries, horizontal: boolean): Map<string, Bounds> {
  const { value, open } = valueFields(horizontal);
  const bounds = new Map<string, Bounds>();

  for (const item of series.dataItems) {
    const main = readMain(item, series, horizontal);
    if (main == null) {
      continue;
    }
    const low = item.get(open) != null ? toNumber(item.get(open)) : null;
    const high = item.get(value) != null ? toNumber(item.get(value)) : null;
    if (low == null && high == null) {
      continue;
    }
    bounds.set(String(toStringOrNumber(main)), {
      ...(low != null ? { yMin: low } : {}),
      ...(high != null ? { yMax: high } : {}),
    });
  }

  return bounds;
}

/**
 * Read a declared survival figure: one row of points per arm.
 *
 * The curve itself is read exactly as a step line is — amCharts varies only how
 * it draws between the samples — and everything a survival figure carries
 * beyond one comes off the author's own row, or off the companion series that
 * drew it. The companions decorate the **declaring** arm: a censoring tick or a
 * confidence band is part of the curve that named it, not of every arm folded
 * in after it.
 *
 * @param declared - The declared layer and everything it absorbed.
 * @returns The arms' points, and the live marks behind them.
 */
export function extractSurvivalArms(declared: AmDeclaredLayer): DeclaredArms {
  const declaration = declared.declaration as SurvivalDeclaration;
  const misses = explicitRefs(declaration, ['censored', 'yMin', 'yMax']);
  const censoredAt = declared.censored ? readCensoredAt(declared.censored) : null;
  const band = declared.band ? readCompanionBounds(declared.band, false) : null;

  const data: SurvivalPoint[][] = [];
  const items: AmDataItem[][] = [];

  for (const [arm, series] of [declared.series, ...declared.arms].entries()) {
    const armPoints: SurvivalPoint[] = [];
    const armItems: AmDataItem[] = [];
    const name = series.get('name');

    for (const item of series.dataItems) {
      const x = readXValue(item, series);
      const y = item.get('valueY') != null ? toNumber(item.get('valueY')) : null;
      if (x == null || y == null) {
        continue;
      }

      const at = String(toStringOrNumber(x));
      const row = item.dataContext;
      const point: SurvivalPoint = { x: toStringOrNumber(x), y };
      if (typeof name === 'string' && name.length > 0) {
        point.z = name;
      }

      const censored = readField(row, declaration.censored, 'censored', misses);
      if (censored !== undefined) {
        point.censored = isFlagValue(censored);
      } else if (arm === 0 && censoredAt?.has(at)) {
        point.censored = true;
      }

      const companion = arm === 0 ? band?.get(at) : undefined;
      const yMin = declaredNumber(readField(row, declaration.yMin, 'yMin', misses))
        ?? companion?.yMin ?? null;
      const yMax = declaredNumber(readField(row, declaration.yMax, 'yMax', misses))
        ?? companion?.yMax ?? null;
      if (yMin != null) {
        point.yMin = yMin;
      }
      if (yMax != null) {
        point.yMax = yMax;
      }

      armPoints.push(point);
      armItems.push(item);
    }

    if (armPoints.length > 0) {
      data.push(armPoints);
      items.push(armItems);
    }
  }

  reportMisses(declared, misses);
  return { data, items };
}

// ---------------------------------------------------------------------------
// Error bar and forest
// ---------------------------------------------------------------------------

/**
 * Turn an interval given as an offset from the estimate into absolute bounds.
 *
 * Both forms are positive magnitudes, as `yerr` is: a pair `[0.2, 0.3]` around
 * 1.4 is 1.2 to 1.7. A negative entry is left out rather than flipped, since
 * neither reading is detectable downstream once the bounds are emitted.
 */
function boundsFromOffset(estimate: number, value: unknown): Bounds {
  const [low, high] = Array.isArray(value)
    ? [declaredNumber(value[0]), declaredNumber(value[1])]
    : [declaredNumber(value), declaredNumber(value)];

  return {
    ...(low != null && low >= 0 ? { yMin: withoutFloatNoise(estimate - low) } : {}),
    ...(high != null && high >= 0 ? { yMax: withoutFloatNoise(estimate + high) } : {}),
  };
}

/**
 * The interval around one estimate.
 *
 * Resolved from the row first, then from the offset the row may carry instead,
 * and finally from the companion series drawing the interval — per bound, so a
 * one-sided interval keeps the half it has and a companion fills only what the
 * row left unsaid. The row comes first because a column the author named is the
 * most specific thing said about that point; the companion is what an amCharts
 * chart usually has instead of one.
 */
function readBounds(
  row: unknown,
  declaration: ErrorBarDeclaration | ForestDeclaration,
  estimate: number,
  companion: Bounds | undefined,
  misses: Misses,
): Bounds {
  const offset = boundsFromOffset(
    estimate,
    readField(row, declaration.error, 'error', misses),
  );

  const yMin = declaredNumber(readField(row, declaration.yMin, 'yMin', misses))
    ?? offset.yMin ?? companion?.yMin ?? null;
  const yMax = declaredNumber(readField(row, declaration.yMax, 'yMax', misses))
    ?? offset.yMax ?? companion?.yMax ?? null;

  return {
    ...(yMin != null ? { yMin } : {}),
    ...(yMax != null ? { yMax } : {}),
  };
}

/**
 * Read a declared error-bar layer: one estimate per mark, with its interval.
 *
 * @param declared - The declared layer and the companion drawing its interval.
 * @returns The samples, and the live marks behind them.
 */
export function extractErrorBarSamples(
  declared: AmDeclaredLayer,
): DeclaredSamples<ErrorBarPoint> {
  const declaration = declared.declaration as ErrorBarDeclaration;
  const horizontal = isDeclaredHorizontal(declared);
  const misses = explicitRefs(declaration, ['yMin', 'yMax', 'error']);
  const companion = declared.interval
    ? readCompanionBounds(declared.interval, horizontal)
    : null;

  const { value } = valueFields(horizontal);
  const data: ErrorBarPoint[] = [];
  const items: AmDataItem[] = [];

  for (const item of declared.series.dataItems) {
    const main = readMain(item, declared.series, horizontal);
    const estimate = item.get(value) != null ? toNumber(item.get(value)) : null;
    if (main == null || estimate == null) {
      continue;
    }

    const at = String(toStringOrNumber(main));
    const bounds = readBounds(
      item.dataContext,
      declaration,
      estimate,
      companion?.get(at),
      misses,
    );
    data.push({ x: toStringOrNumber(main), y: estimate, ...bounds });
    items.push(item);
  }

  reportMisses(declared, misses);
  return { data, items, owners: items.map(() => declared.series) };
}

/**
 * Read a declared forest plot: an error bar per study, plus the three things a
 * meta-analysis carries that a row of intervals does not.
 *
 * The pooled summary is whichever the chart says it is: a flag column, the row
 * index for data that carries no such column, or a companion series drawing the
 * summary's own diamond — whose rows are appended after the studies, which is
 * where the figure draws them.
 *
 * @param declared - The declared layer and everything it absorbed.
 * @returns The studies, and the live marks behind them.
 */
export function extractForestSamples(
  declared: AmDeclaredLayer,
): DeclaredSamples<ForestPoint> {
  const declaration = declared.declaration as ForestDeclaration;
  const misses = explicitRefs(declaration, ['weight', 'pooled']);
  const studies = extractErrorBarSamples(declared);

  // `pooledIndex` counts the declaring series' own rows as authored, which is
  // the only sequence an author can see — so it addresses a data item rather
  // than a point, which a dropped row would already have shifted.
  const pooledItem = declaration.pooledIndex === undefined
    ? undefined
    : declared.series.dataItems[declaration.pooledIndex];

  const data: ForestPoint[] = [];
  for (const [at, point] of studies.data.entries()) {
    const item = studies.items[at];
    const row = item.dataContext;
    const study: ForestPoint = { ...point };

    const weight = declaredNumber(readField(row, declaration.weight, 'weight', misses));
    // A fraction of one, never a percentage. Meta-analysis software reports
    // this column as `12.5` for one study in eight, and dividing by 100 would
    // guess that the column sums to 100 while passing it through announces
    // "weight 1250%".
    if (weight != null && weight >= 0 && weight <= 1) {
      study.weight = weight;
    }

    const flag = readField(row, declaration.pooled, 'pooled', misses);
    const byIndex = pooledItem !== undefined && item === pooledItem;
    if (flag !== undefined || byIndex) {
      study.pooled = byIndex || isFlagValue(flag);
    }

    data.push(study);
  }

  const items = [...studies.items];
  const owners = [...studies.owners];
  if (declared.pooled) {
    // The summary is read exactly as a study is, off its own series' rows —
    // and `interval` is deliberately left in scope for it. A companion is
    // joined by position, not by series, so a chart drawing every interval in
    // one column series, the summary's included, has said where the summary's
    // interval is; scoping the companion out would drop a bound the author
    // did draw. The summary's own row fields and `error` offset still win, so
    // a pooled series that spells its interval out is unaffected either way.
    const summary = extractErrorBarSamples({ ...declared, series: declared.pooled });
    for (const point of summary.data) {
      data.push({ ...point, pooled: true });
    }
    items.push(...summary.items);
    owners.push(...summary.owners);
  }

  reportMisses(declared, misses);
  return { data, items, owners };
}

/**
 * The forest options a declaration carries, or nothing at all.
 *
 * `nullValue` has no default on purpose: 0 guessed for a ratio measure reports
 * every study as not crossing, since odds ratios are all positive, which is a
 * confident wrong answer handed to every row. Undeclared, the layer gets the
 * estimate, the interval and the weight, and makes no claim about significance.
 */
export function readForestOptions(declaration: ForestDeclaration): { nullValue: number } | null {
  return declaration.nullValue === undefined ? null : { nullValue: declaration.nullValue };
}

// ---------------------------------------------------------------------------
// Volcano, Manhattan and the plain scatter
// ---------------------------------------------------------------------------

/**
 * Read a declared cloud: one point per mark, on two value axes.
 *
 * amCharts has no scatter series — the recipe is a `LineSeries` with its stroke
 * switched off and bullets pushed on — so the points are read straight off the
 * data items under the declared type rather than through a classification that
 * would call the same drawing a line chart.
 *
 * The identity is the payload on these charts: a reader told "x is 2.3, y is
 * 14.1" has been handed the two numbers whose shape they can already hear and
 * withheld the gene name they came for. It is left out only when nothing
 * resolves.
 *
 * @param declared - The declared layer and the siblings merged into it.
 * @returns One point per readable mark, in chart order.
 */
export function extractVolcanoPoints(declared: AmDeclaredLayer): VolcanoPoint[] {
  const declaration = declared.declaration as ManhattanDeclaration | VolcanoDeclaration;
  const misses = explicitRefs(declaration, ['label', 'group']);
  const points: VolcanoPoint[] = [];

  for (const series of [declared.series, ...declared.arms]) {
    for (const item of series.dataItems) {
      const point = readCloudPoint(item);
      if (point === null) {
        continue;
      }

      const row = item.dataContext;
      const label = readField(row, declaration.label, 'label', misses);
      if (label != null && label !== '') {
        point.label = String(label);
      }
      const group = readField(row, declaration.group, 'group', misses);
      if (group != null && group !== '') {
        point.group = String(group);
      }
      points.push(point);
    }
  }

  reportMisses(declared, misses);
  return points;
}

/**
 * Read a declared plain scatter.
 *
 * `ScatterPoint` has nowhere to put a point's name, so a declared `label` is
 * accepted and not read here — a chart whose points carry an identity declares
 * `volcano` or `manhattan`, which is where the grammar carries one.
 *
 * @param declared - The declared layer and the siblings merged into it.
 * @returns One point per readable mark, in chart order.
 */
export function extractScatterPoints(declared: AmDeclaredLayer): ScatterPoint[] {
  const points: ScatterPoint[] = [];
  for (const series of [declared.series, ...declared.arms]) {
    for (const item of series.dataItems) {
      const point = readCloudPoint(item);
      if (point !== null) {
        points.push(point);
      }
    }
  }
  return points;
}

/**
 * The live marks behind a declared cloud, in the order its points were read.
 *
 * The index-twin of {@link extractScatterPoints} / {@link extractVolcanoPoints}:
 * the same walk over `[series, ...arms]`, keeping exactly the items
 * `readCloudPoint` accepts, so the entry at index `i` is the mark that drew the
 * layer's `data[i]`.
 *
 * It lives beside those two, and is written as the same loop, because the
 * alignment is the entire contract — MAIDR addresses a cloud's highlight by
 * data index, and the two walks drifting apart would outline a confidently
 * wrong point. Keeping them in one file is what makes a drift visible in a
 * side-by-side read.
 *
 * @param declared - The declared layer and the siblings merged into it.
 * @returns One `{ series, item }` per readable mark, in chart order.
 */
export function extractCloudMarks(
  declared: AmDeclaredLayer,
): { series: AmXYSeries; item: AmDataItem }[] {
  const marks: { series: AmXYSeries; item: AmDataItem }[] = [];
  for (const series of [declared.series, ...declared.arms]) {
    for (const item of series.dataItems) {
      if (readCloudPoint(item) !== null) {
        marks.push({ series, item });
      }
    }
  }
  return marks;
}

/** One point of a cloud, or `null` for a mark missing either coordinate. */
function readCloudPoint(item: AmDataItem): VolcanoPoint | null {
  const x = item.get('valueX') != null ? toNumber(item.get('valueX')) : null;
  const y = item.get('valueY') != null ? toNumber(item.get('valueY')) : null;
  return x == null || y == null ? null : { x, y };
}

/**
 * The threshold options a declaration carries, or nothing at all.
 *
 * None of the three has a default, and the omission is the whole point:
 * a guessed significance line sorts every point on the figure onto the wrong
 * side silently, a `significanceDirection` fixed to `'above'` selects precisely
 * the points that failed to reach significance on a raw p axis, and a
 * Manhattan's x-axis lines are chromosome dividers rather than an effect
 * cutoff. Absent, the trace reports no findings, which is the truthful smaller
 * reading.
 *
 * @param declaration - The cloud's declaration.
 * @returns The options block, or `null` when the author declared none.
 */
export function readThresholdOptions(
  declaration: ManhattanDeclaration | VolcanoDeclaration,
): ThresholdOptions | null {
  const options: ThresholdOptions = {
    ...(declaration.significance !== undefined ? { significance: declaration.significance } : {}),
    ...(declaration.significanceDirection !== undefined
      ? { significanceDirection: declaration.significanceDirection }
      : {}),
    ...(declaration.effect !== undefined ? { effect: declaration.effect } : {}),
  };
  return Object.keys(options).length === 0 ? null : options;
}
