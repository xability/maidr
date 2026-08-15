/**
 * Shared resolution rules for the co-located `maidr` declaration block.
 *
 * The declaration types themselves live in `src/type/declaration.ts`, beside
 * the grammar they feed. What lives here is the part that must not be
 * re-implemented eight times: how a {@link FieldRef} is read off an author's
 * row, which spellings of a canonical field name are accepted when no ref is
 * given, what counts as a raised flag, and how an untyped block from a chart
 * config is narrowed and checked.
 *
 * Eight independent implementations of the fallback chains would mean an
 * author's `isCensored` column works in one adapter and silently does not in
 * the next, which is an accessibility regression class rather than a style
 * question — the same argument `selectorUtil.ts` records for itself. The
 * guarantee is over the adapters that read this block: Recharts declares
 * through its own `*Config` props and d3 through which `bindD3*` binder is
 * called, so both keep the readers they shipped and neither is bound by the
 * table below.
 *
 * The same argument covers the two things a reader hears rather than a column
 * name: the sentence an adapter prints when a declaration names a construct
 * the library does not draw ({@link warnUndrawnType},
 * {@link warnWrongConstruct}), and the rule that each distinct problem is said
 * once per binding rather than once per pass over the chart — an adapter that
 * walks the chart twice, once for the payload and once for the highlight,
 * otherwise says everything twice. That is settled here by keying every
 * warning on the author's own block, so no caller has to arrange it.
 *
 * Nothing else belongs in this file. Anything that mirrors `MaidrLayer`'s
 * option blocks would become a second grammar that can drift from the first.
 */

import type { AlluvialDeclaration, BoxenDeclaration, ChoroplethDeclaration, ErrorBarDeclaration, FieldRef, ForestDeclaration, HexbinDeclaration, MaidrTraceDeclaration, ManhattanDeclaration, MosaicDeclaration, ParallelDeclaration, RidgelineDeclaration, ScatterDeclaration, SurvivalDeclaration, VolcanoDeclaration } from '../../type/declaration';
import { Orientation, TraceType } from '../../type/grammar';

/** The `type` values {@link MaidrTraceDeclaration} covers. */
export type DeclaredType = MaidrTraceDeclaration['type'];

/** The declaration variant a declared type names. */
export type DeclarationOf<T extends DeclaredType> = Extract<MaidrTraceDeclaration, { type: T }>;

/**
 * Who is reading a declaration, and what they are reading it off.
 *
 * Every warning this module raises is prefixed and located from one of these,
 * so the eight adapters print one sentence rather than eight spellings of it.
 */
export interface DeclarationContext {
  /**
   * Names the adapter in the `[MAIDR <Adapter>]` warning prefix, e.g.
   * `'Highcharts'`.
   */
  adapter: string;
  /**
   * How the author can find the series. Printed verbatim, so pass a locating
   * phrase — `'series "sales"'`, `'dataset 2'` — rather than a bare number.
   */
  seriesRef: string;
  /**
   * The binding this reading belongs to, for saying each distinct problem
   * once.
   *
   * The spec allows each warning at most once per chart per binding, and an
   * adapter that resolves declarations at two entry points — the payload pass
   * and the highlight pass both re-walk the chart — otherwise says everything
   * twice. Pass any object that lives as long as the binding and no longer:
   * the author's own block, the slot it was read from, the series. Every
   * warning raised against a context carrying one is said once per object.
   *
   * {@link validateDeclaration} needs none, and ignores this when the block it
   * was handed is itself an object: keying on the author's block is what stops
   * a *corrected* block from being silenced, since rewriting it produces a new
   * object that is reported afresh.
   */
  binding?: object;
}

/**
 * Alternative property names accepted for each canonical grammar field name,
 * in priority order.
 *
 * Informed by the shipped d3 binder configs — `censored` at
 * `d3/binders/survival.ts`, the bounds at `d3/binders/errorBar.ts`, the ladder
 * at `d3/binders/boxen.ts` — so a column an author already carries is read
 * without a declaration. The two bound chains are the union of the survival
 * and error-bar binders' lists, which differ by a name or two each; the rest
 * are the chains those binders document, not always the longer lists their
 * implementations accept. Reconciling a d3 binder with its own doc comment is
 * that binder's business, and this table is the one every adapter reading a
 * declaration shares.
 *
 * Consulted **only** when the author named no field: an explicit
 * {@link FieldRef} is used verbatim, per {@link resolveFieldRef}. A canonical
 * name with no entry here — `width`, `x`, `y` — resolves under its own name
 * and nothing else.
 *
 * The chains here are keyed by canonical name across every declared type, so a
 * name borrowed by two of them is shared. Where that sharing would resolve the
 * wrong column, the type says so for itself in
 * {@link DECLARED_FIELD_REF_FALLBACKS}, which replaces the entry below for
 * that type.
 *
 * `censored` is deliberately not aliased to `event`, which most survival
 * datasets carry with the opposite meaning.
 *
 * `error` has **no chain at all**, and that is deliberate rather than an
 * omission: it is an *offset* whose every common spelling is either
 * axis-specific (`yerr`, `xerr` — a row carrying both says nothing about which
 * axis this chart draws its intervals on) or a dispersion statistic a chart
 * commonly draws a multiple of (`sd`, `sem`, `err` — ±1.96 SEM is as ordinary
 * as ±1). Reading one of those as the drawn offset resizes every interval on
 * the figure without saying so, which is the failure this table exists to
 * avoid, so an offset column is named explicitly or spelled exactly `error`.
 */
export const FIELD_REF_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  censored: ['censor', 'isCensored'],
  yMin: ['lower', 'lo', 'ciLower', 'ciLow', 'ci_low', 'low', 'min'],
  yMax: ['upper', 'hi', 'ciUpper', 'ciHigh', 'ci_high', 'high', 'max'],
  weight: ['w', 'share'],
  pooled: ['isPooled', 'summary'],
  label: ['snp', 'id', 'name', 'gene', 'probe'],
  group: ['chromosome', 'chrom', 'chr', 'region'],
  value: ['x', 't', 'position'],
  density: ['kde', 'width', 'p', 'estimate'],
  count: ['length', 'value', 'n', 'total'],
  median: ['q2', 'mid', 'y'],
  levels: ['letterValues', 'letter_values', 'quantiles', 'ladder'],
  lon: ['longitude', 'long'],
  lat: ['latitude'],
};

/**
 * Chains that belong to one declared type, replacing
 * {@link FIELD_REF_FALLBACKS} for it.
 *
 * A canonical name is shared across variants and a chain sometimes cannot be:
 * `value` on a ridgeline is a position on the value axis, so `x` is a fair
 * reading of it, while `value` on a choropleth is the number a region is
 * shaded by and a map's rows routinely put the *place name* in an `x` column.
 * Shared, that chain announces "Texas" as the shaded value of Texas — the one
 * failure mode worse than announcing nothing, since a reader has no way to
 * tell it from a number.
 *
 * So a choropleth reads its own two chains, and they are the shipped d3
 * binder's (`d3/binders/choropleth.ts`), which the same maps have been read
 * through since before this table existed. They are ordered so that the
 * ordinary region table — `{ x: 'Texas', y: 12.4 }` — resolves both halves the
 * right way round: `x` is the **last** name a region answers to and `y` the
 * **first** a value does.
 *
 * A chain here replaces the shared one rather than extending it. Extending
 * would keep exactly the entry the type is here to disown.
 */
export const DECLARED_FIELD_REF_FALLBACKS: Readonly<
  Partial<Record<DeclaredType, Readonly<Record<string, readonly string[]>>>>
> = {
  [TraceType.CHOROPLETH]: {
    region: ['name', 'NAME', 'name_long', 'admin', 'state', 'id', 'label', 'x'],
    value: ['y', 'rate', 'density', 'count'],
  },
};

/**
 * The chain a canonical name is defaulted through, for the type being read.
 *
 * @param canonical - The grammar field name being filled.
 * @param type      - The declared type reading it, when the caller knows it.
 * @returns The alternative names to try, in order.
 */
function fallbacksFor(canonical: string, type: DeclaredType | undefined): readonly string[] {
  const scoped = type === undefined ? undefined : DECLARED_FIELD_REF_FALLBACKS[type]?.[canonical];
  return scoped ?? FIELD_REF_FALLBACKS[canonical] ?? [];
}

/**
 * Reads a name off one lookup surface: the key itself, or the dotted path it
 * spells.
 *
 * The literal key is tried first, so a column genuinely named `a.b` is read as
 * itself before the name is taken apart.
 *
 * @param record - The surface to read.
 * @param name   - The key, or a dotted path through nested objects.
 * @returns The value read, or `undefined` when the surface does not carry it.
 */
function readName<T>(record: Record<string, unknown>, name: string): T | undefined {
  const own = record[name];
  if (own !== undefined) {
    return own as T;
  }
  if (!name.includes('.')) {
    return undefined;
  }

  let step: unknown = record;
  for (const segment of name.split('.')) {
    if (step === null || typeof step !== 'object') {
      return undefined;
    }
    step = (step as Record<string, unknown>)[segment];
  }
  return step as T | undefined;
}

/**
 * Reads a name off a row and, failing that, off the row's `properties`.
 *
 * The second surface is what makes a **map** readable. `element.__data__` on a
 * choropleth is a GeoJSON or TopoJSON feature, which keeps only `type`, `id`,
 * `geometry` and `properties` at the top level: the region's name and the
 * value joined onto it live in `properties`, every time. An author writing
 * `region: 'NAME'` can only mean the property, so making them spell
 * `properties.NAME` would be ceremony over a shape the format fixes — though
 * that path resolves too, per {@link readName}.
 *
 * Second, never first: the row's own key always wins, so this can fill a gap
 * but never overrule what the row itself says.
 *
 * @param row  - The row the charting library bound to the mark.
 * @param name - The key, or a dotted path through nested objects.
 * @returns The value read, or `undefined` when neither surface carries it.
 */
function readFromRow<T>(row: Record<string, unknown>, name: string): T | undefined {
  const own = readName<T>(row, name);
  if (own !== undefined) {
    return own;
  }
  const properties = row.properties;
  return properties === null || typeof properties !== 'object'
    ? undefined
    : readName<T>(properties as Record<string, unknown>, name);
}

/**
 * Reads one declared fact off an author's row.
 *
 * An explicit `ref` is used verbatim with **no fallback**: a name the author
 * wrote that misses is their error, and reporting it — with
 * {@link warnUnresolvedRef}, once the series is read — beats papering over it
 * with a column they did not name. Only the defaulted path walks the chain,
 * trying `canonical` first and then each alternative in order — the type's own
 * chain from {@link DECLARED_FIELD_REF_FALLBACKS} where it has one, and
 * {@link FIELD_REF_FALLBACKS} otherwise.
 *
 * Every name, explicit or defaulted, is looked for in three places in turn:
 * the row's own key, the dotted path it spells, and the row's `properties` —
 * see {@link readFromRow}. Name priority dominates: `properties.name` beats a
 * top-level `id` on a GeoJSON feature, because a region is called by its name
 * rather than by its FIPS code.
 *
 * `undefined` and `null` both mean "no ref given" here, exactly as they do in
 * {@link validateDeclaration}: the slots this rides in are frequently untyped
 * chart config, where `null` is how an author writes "not set", and reading
 * `row['null']` for one would be a puzzle with no explanation attached.
 *
 * Returns `undefined` when nothing resolves, and the field is then **omitted**
 * from the payload. Never substitute a zero, a false or a placeholder: a
 * missing weight is a forest plot without weights, while a weight of 0 is a
 * study that counted for nothing.
 *
 * A falsy value that is present — `0`, `''`, `false`, `null` — resolves and
 * stops the walk. Only an `undefined` reading moves on to the next name.
 *
 * An array counts as a row here rather than being rejected: a d3-hexbin bin
 * **is** the array of points that fell in it, which is why `length` is one of
 * `count`'s fallbacks.
 *
 * @param row       - The row the charting library bound to the mark — a
 *                    Chart.js datum, a Highcharts `point.options`, an amCharts
 *                    `dataItem.dataContext`, a d3 `element.__data__`. Typed
 *                    `unknown` because most of those arrive that way; anything
 *                    that is not an object resolves to nothing.
 * @param ref       - The field the author named, or `undefined` to default.
 * @param canonical - The grammar field name being filled, e.g. `'yMin'`.
 * @param type      - The declared type being read, where one of its fields
 *                    defaults differently from the shared chain — `'value'` on
 *                    a choropleth. Omitted, the shared chain applies.
 * @returns The value read, or `undefined` when nothing resolves.
 */
export function resolveFieldRef<T>(
  row: unknown,
  ref: FieldRef | undefined,
  canonical: string,
  type?: DeclaredType,
): T | undefined {
  if (row === null || typeof row !== 'object') {
    return undefined;
  }

  // The one narrowing this module exists to do: a library's row is an untyped
  // bag of the author's own columns, and the names are resolved from data.
  const record = row as Record<string, unknown>;
  if (typeof ref === 'string') {
    return readFromRow<T>(record, ref);
  }

  const canonicalValue = readFromRow<T>(record, canonical);
  if (canonicalValue !== undefined) {
    return canonicalValue;
  }
  for (const alternative of fallbacksFor(canonical, type)) {
    const value = readFromRow<T>(record, alternative);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/**
 * Reports an explicit {@link FieldRef} that no row in the series carried.
 *
 * {@link resolveFieldRef} answers per row and cannot tell a typo from a row
 * that legitimately lacks the field — a one-sided interval has no `yMin` on
 * some rows and that is not an error. The series is the unit that can:
 * call this once, after reading a series, when an explicit ref resolved on no
 * row of it. The field is then left out of the payload, and the author is told
 * why rather than being handed a chart quietly missing what they declared.
 *
 * The message lives here so all eight adapters print the same sentence. The
 * "at most once per chart per binding" contract is satisfied by calling this
 * once per series per field; an adapter that reads a series at two entry
 * points calls it twice and passes {@link DeclarationContext.binding} — the
 * declaration it is reading — to have the second one swallowed.
 *
 * @param context   - Who is reading, and what they are reading it off.
 * @param ref       - The field name the author wrote.
 * @param canonical - The grammar field it was meant to fill, e.g. `'yMin'`.
 */
export function warnUnresolvedRef(
  context: DeclarationContext,
  ref: FieldRef,
  canonical: string,
): void {
  report(
    context,
    `maidr declaration on ${context.seriesRef} names "${ref}" for ${canonical}, `
    + `which no row carries; ${canonical} is left out.`,
  );
}

/**
 * Reports a declared type this adapter has no reading for — spec §7.1.
 *
 * The declaration is honoured where the library can back it and degrades to
 * the undeclared chart where it cannot, so this is the sentence every adapter
 * needs and none should spell for itself: eight hand-rolled wordings for one
 * fact is eight things an author has to recognise as the same fact.
 *
 * @param context - Who is reading, and what they are reading it off.
 * @param type    - The declared type, printed as the author wrote it.
 */
export function warnUndrawnType(context: DeclarationContext, type: string): void {
  report(
    context,
    `maidr declaration for "${type}" on ${context.seriesRef} names no construct `
    + `this library draws; reading it as the undeclared chart.`,
  );
}

/**
 * Reports a declaration the construct it was written on cannot back — the
 * other half of spec §7.1.
 *
 * Distinct from {@link warnUndrawnType}: the adapter reads this type, but not
 * off *this* series. A survival curve read off a pie is not a degraded
 * announcement, it is a wrong one, so the reading falls through to the
 * undeclared chart and says which construct the declaration wanted.
 *
 * @param context - Who is reading, and what they are reading it off.
 * @param type    - The declared type, printed as the author wrote it.
 * @param needs   - What the type needs, phrased to follow "needs" — `'a "map"
 *                  series'`, `'a bar or line dataset'`.
 * @param drawn   - What the library actually draws this series as, when the
 *                  adapter can name it.
 */
export function warnWrongConstruct(
  context: DeclarationContext,
  type: string,
  needs: string,
  drawn?: string,
): void {
  const found = drawn === undefined ? '' : ` and this one is drawn as "${drawn}"`;
  report(
    context,
    `maidr declaration for "${type}" on ${context.seriesRef} needs ${needs}${found}; `
    + `reading it as the undeclared chart.`,
  );
}

/**
 * Whether a resolved value raises a per-row flag — `censored` on a survival
 * curve, `pooled` on a forest plot.
 *
 * Read strictly rather than by truthiness, because the flag arrives as a
 * boolean, as a 0/1 indicator, or as the string one of those was parsed
 * from — and `'0'` is truthy in every one of those readings while raising
 * nothing. `true`, `1`, `'1'` and `'true'` count; everything else, `'yes'`
 * included, does not.
 *
 * One helper for both flags on purpose. They are the same fact in two charts
 * and the cost of disagreeing is not symmetric: a `pooled` read by truthiness
 * marks every study as the summary the moment a CSV hands over the string
 * `'0'`, which drops the whole body of evidence out of the announcement.
 *
 * @param value - Whatever the flag field resolved to.
 * @returns True when the value raises the flag.
 */
export function isFlagValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    return value === '1' || value === 'true';
  }
  return false;
}

/**
 * What a key's value has to look like for the declaration to keep it.
 *
 * Names rather than predicates, so the key sets below stay a table an author
 * of an adapter can read straight down. `'field'` and `'series'` are both
 * non-empty strings and are distinguished because they say what the string
 * addresses — a column of the author's data, or a sibling series.
 */
type ValueKind
  = | 'field'
    | 'series'
    | 'text'
    | 'number'
    | 'index'
    | 'boolean'
    | 'dimensions'
    | 'orientation'
    | 'stepDirection'
    | 'significanceDirection';

/**
 * A key's value kind, marked `'required'` when the variant cannot be read
 * without it.
 */
type KeyRule = ValueKind | readonly [ValueKind, 'required'];

/** The rule shape a field's own optionality demands. */
type KeyRuleFor<V> = undefined extends V ? ValueKind : readonly [ValueKind, 'required'];

/**
 * Every key a declaration variant accepts, other than its discriminant, with
 * the kind of value each takes.
 *
 * The mapped type is exhaustive in both directions, which is what makes the
 * runtime key sets below provably the compile-time ones: a field added to a
 * variant without being added to its set fails to compile, so does a set
 * naming a field the variant does not have, and so does a set that calls a
 * required field optional or the other way round.
 */
type FieldKeySet<T> = Readonly<{
  [K in Exclude<keyof T, 'type'> & string]-?: KeyRuleFor<T[K]>
}>;

/**
 * The closed key set of each variant, by declared type.
 *
 * Closedness is the point: it is what makes `significanse: 7.3` detectable in
 * plain JS, where nothing else would catch it. Keying the map by
 * {@link DeclaredType} means a new variant cannot be added to
 * `src/type/declaration.ts` without landing here too.
 */
const DECLARATION_KEYS: Readonly<Record<DeclaredType, Readonly<Record<string, KeyRule>>>> = {
  [TraceType.SURVIVAL]: {
    title: 'text',
    name: 'text',
    censored: 'field',
    yMin: 'field',
    yMax: 'field',
    stepDirection: 'stepDirection',
    censoredSeries: 'series',
    bandSeries: 'series',
    merge: 'boolean',
  } satisfies FieldKeySet<SurvivalDeclaration>,
  [TraceType.ERROR_BAR]: {
    title: 'text',
    name: 'text',
    yMin: 'field',
    yMax: 'field',
    error: 'field',
    intervalSeries: 'series',
    orientation: 'orientation',
  } satisfies FieldKeySet<ErrorBarDeclaration>,
  [TraceType.FOREST]: {
    title: 'text',
    name: 'text',
    yMin: 'field',
    yMax: 'field',
    error: 'field',
    intervalSeries: 'series',
    orientation: 'orientation',
    weight: 'field',
    pooled: 'field',
    pooledIndex: 'index',
    pooledSeries: 'series',
    nullValue: 'number',
  } satisfies FieldKeySet<ForestDeclaration>,
  [TraceType.MANHATTAN]: {
    title: 'text',
    name: 'text',
    label: 'field',
    group: 'field',
    significance: 'number',
    significanceDirection: 'significanceDirection',
    effect: 'number',
    merge: 'boolean',
  } satisfies FieldKeySet<ManhattanDeclaration>,
  [TraceType.VOLCANO]: {
    title: 'text',
    name: 'text',
    label: 'field',
    group: 'field',
    significance: 'number',
    significanceDirection: 'significanceDirection',
    effect: 'number',
    merge: 'boolean',
  } satisfies FieldKeySet<VolcanoDeclaration>,
  [TraceType.SCATTER]: {
    title: 'text',
    name: 'text',
    label: 'field',
    merge: 'boolean',
  } satisfies FieldKeySet<ScatterDeclaration>,
  [TraceType.ALLUVIAL]: {
    title: 'text',
    name: 'text',
  } satisfies FieldKeySet<AlluvialDeclaration>,
  [TraceType.MOSAIC]: {
    title: 'text',
    name: 'text',
    width: 'field',
    count: 'field',
  } satisfies FieldKeySet<MosaicDeclaration>,
  [TraceType.CHOROPLETH]: {
    title: 'text',
    name: 'text',
    region: 'field',
    value: 'field',
    lon: 'field',
    lat: 'field',
  } satisfies FieldKeySet<ChoroplethDeclaration>,
  [TraceType.PARALLEL]: {
    title: 'text',
    name: 'text',
    dimensions: ['dimensions', 'required'],
    label: 'field',
  } satisfies FieldKeySet<ParallelDeclaration>,
  [TraceType.RIDGELINE]: {
    title: 'text',
    name: 'text',
    group: ['field', 'required'],
    value: 'field',
    density: 'field',
  } satisfies FieldKeySet<RidgelineDeclaration>,
  [TraceType.HEXBIN]: {
    title: 'text',
    name: 'text',
    x: 'field',
    y: 'field',
    count: 'field',
    row: 'field',
  } satisfies FieldKeySet<HexbinDeclaration>,
  [TraceType.BOXEN]: {
    title: 'text',
    name: 'text',
    x: 'field',
    median: 'field',
    levels: 'field',
    lowerOutliers: 'field',
    upperOutliers: 'field',
    orientation: 'orientation',
  } satisfies FieldKeySet<BoxenDeclaration>,
};

/**
 * What each {@link ValueKind} accepts, phrased to finish the sentence
 * "expected …" in a warning an author reads.
 *
 * The two-value vocabularies are spelled out because their values are the
 * grammar's, not the words they stand for: `Orientation.HORIZONTAL` is
 * `'horz'`, and an author writing `'horizontal'` in plain JS has no compiler
 * to tell them otherwise.
 */
const VALUE_EXPECTATIONS: Readonly<Record<ValueKind, string>> = {
  field: 'a field name',
  series: 'a series id',
  text: 'a string',
  number: 'a number',
  index: 'a row index',
  boolean: 'a boolean',
  dimensions: 'a non-empty list of axes',
  orientation: '"horz" or "vert"',
  stepDirection: '"hv", "vh" or "mid"',
  significanceDirection: '"above" or "below"',
};

/**
 * Whether a value is the kind its key takes.
 *
 * `'dimensions'` is not decided here: its entries are reported one by one, so
 * it goes through {@link isValidDimensions} where the warnings can be raised.
 *
 * @param kind  - The kind the key's rule names.
 * @param value - The value the author wrote.
 * @returns True when the value can be kept.
 */
function isValidValue(kind: Exclude<ValueKind, 'dimensions'>, value: unknown): boolean {
  switch (kind) {
    case 'field':
    case 'series':
      return typeof value === 'string' && value.trim() !== '';
    case 'text':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'index':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0;
    case 'boolean':
      return typeof value === 'boolean';
    case 'orientation':
      return value === Orientation.VERTICAL || value === Orientation.HORIZONTAL;
    case 'stepDirection':
      return value === 'hv' || value === 'vh' || value === 'mid';
    case 'significanceDirection':
      return value === 'above' || value === 'below';
  }
}

/**
 * Whether a parallel-coordinates axis list is usable, reporting each entry
 * that is not.
 *
 * Checked entry by entry because `dimensions` is the one thing a parallel
 * trace cannot degrade without — a guessed order announces the chart's columns
 * in the wrong places — and because the object form's `key` is the field a
 * Recharts- or Highcharts-shaped author is most likely to spell `dataKey`. An
 * entry naming no field makes the whole list unusable rather than leaving a
 * hole in the axis order.
 *
 * @param value  - The value at the `dimensions` key.
 * @param report - Raises one warning, already located on the series. Its
 *                 argument follows "…on <series> ", so each message starts
 *                 with a verb.
 * @returns True when every entry names a field.
 */
function isValidDimensions(value: unknown, report: (message: string) => void): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    report(
      `has dimensions ${describeValue(value)}; `
      + `expected ${VALUE_EXPECTATIONS.dimensions}; ignored.`,
    );
    return false;
  }

  let usable = true;
  value.forEach((entry, index) => {
    if (typeof entry === 'string' && entry.trim() !== '') {
      return;
    }

    const axis = typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : undefined;
    if (axis !== undefined) {
      for (const key of Object.keys(axis)) {
        if (key !== 'key' && key !== 'label') {
          report(`has dimensions[${index}] with unknown key "${key}"; ignored.`);
        }
      }
      if (axis.label !== undefined && axis.label !== null && !isValidValue('text', axis.label)) {
        report(
          `has dimensions[${index}] with label ${describeValue(axis.label)}; `
          + `expected ${VALUE_EXPECTATIONS.text}.`,
        );
        usable = false;
        return;
      }
      if (isValidValue('field', axis.key)) {
        return;
      }
    }

    report(
      `has dimensions[${index}] naming no field; `
      + `expected a field name or { key: 'column' }.`,
    );
    usable = false;
  });
  return usable;
}

/**
 * Whether a string is a type {@link MaidrTraceDeclaration} has a variant for.
 *
 * @param value - The `type` read off the block.
 * @returns True when a variant declares it.
 */
function isDeclaredType(value: string): value is DeclaredType {
  return Object.hasOwn(DECLARATION_KEYS, value);
}

/**
 * Splits a {@link KeyRule} into the two things a check needs.
 *
 * @param rule - The rule a key set gives for one key.
 * @returns Its value kind and whether the key is required.
 */
function readRule(rule: KeyRule): { kind: ValueKind; required: boolean } {
  return typeof rule === 'string'
    ? { kind: rule, required: false }
    : { kind: rule[0], required: true };
}

/**
 * Renders a value for a warning, without ever throwing on one.
 *
 * @param value - Whatever the author wrote.
 * @returns A short phrase naming it.
 */
function describeValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (Array.isArray(value)) {
    return 'a list';
  }
  if (typeof value === 'object' && value !== null) {
    return 'an object';
  }
  if (typeof value === 'function') {
    return 'a function';
  }
  return String(value);
}

/**
 * Narrows an unknown value read from a library's pass-through slot into a
 * validated declaration, or `null`.
 *
 * A co-located block is untyped in plain JS, so this read-time check is the
 * only defence an author has against a typo. It warns once per distinct
 * problem and **never throws**: a binder that throws takes the host page down,
 * so every failure degrades to the undeclared reading instead.
 *
 * What it checks, and what each failure costs:
 *
 * - A block that is not an object, or whose `type` names no variant, is
 *   rejected outright, and the caller falls through to its chart-level
 *   declaration and then to its heuristic. A `TraceType` value with no variant
 *   in {@link MaidrTraceDeclaration} — `'bar'`, say — is unknown in the same
 *   sense: there is nothing here to declare about it.
 * - A key the variant does not accept is warned about and left alone; the
 *   declaration still stands and its known fields are still read.
 * - A key whose **value** is not the kind it takes is warned about and
 *   dropped, so the grammar's own default applies — the truthful smaller
 *   reading. This is what stops `significanceDirection: 'Below'` from being
 *   read as `'above'` and announcing precisely the points that failed to reach
 *   significance as the findings.
 * - A variant missing a key it cannot be read without — `dimensions` on a
 *   parallel plot, `group` on a ridgeline — is rejected. The alternative is
 *   returning a block typed as if the field were there, which is an invitation
 *   to the throw this function exists to prevent.
 * - A variant outside the `reads` set — a choropleth declared on a library
 *   that draws no map — is reported with {@link warnUndrawnType} and rejected.
 *   Every adapter reads some subset and each was otherwise hand-writing the
 *   same narrowing predicate after this returned, along with its own wording
 *   for the one sentence spec §7.1 fixes.
 *
 * `undefined` and `null` are "not given" wherever they appear, both as the
 * block and as any key's value.
 *
 * The returned declaration is the block itself where nothing was dropped, and
 * a copy without the dropped keys otherwise: the author's chart config is
 * never mutated.
 *
 * This is the only place an `unknown` from a chart config is narrowed; `any`
 * must not escape it. The "each distinct warning at most once per chart per
 * binding" contract holds however often this is called, since every warning it
 * raises is keyed on the author's own block — an adapter that resolves
 * declarations at two entry points per binding needs to arrange nothing.
 *
 * @param raw     - The value at the library's `maidr` slot.
 * @param context - Who is reading, and what they are reading it off.
 * @param reads   - The declared types this adapter has a reading for. Omitted,
 *                  every variant is accepted and the caller narrows for
 *                  itself.
 * @returns The validated declaration, or `null` when there is none to read.
 */
export function validateDeclaration<T extends DeclaredType = DeclaredType>(
  raw: unknown,
  context: DeclarationContext,
  reads?: readonly T[],
): DeclarationOf<T> | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  const { adapter, seriesRef } = context;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    // No object to key a once-per-binding gate on, and none needed: a block
    // this shape carries no fields to go on and report a second problem about.
    warn(adapter, `maidr declaration on ${seriesRef} is not an object; ignored.`);
    return null;
  }

  const block = raw as Record<string, unknown>;
  const type = block.type;
  if (typeof type !== 'string' || !isDeclaredType(type)) {
    report(
      context,
      `maidr declaration on ${seriesRef} has unknown type "${String(type)}"; `
      + `reading it as the undeclared chart.`,
      block,
    );
    return null;
  }

  if (reads !== undefined && !(reads as readonly string[]).includes(type)) {
    warnUndrawnType({ ...context, binding: context.binding ?? block }, type);
    return null;
  }

  const located = (message: string): void =>
    report(context, `maidr declaration for "${type}" on ${seriesRef} ${message}`, block);

  const accepted = DECLARATION_KEYS[type];
  const dropped: string[] = [];
  for (const key of Object.keys(block)) {
    if (key === 'type') {
      continue;
    }
    if (!Object.hasOwn(accepted, key)) {
      located(`has unknown key "${key}"; ignored.`);
      continue;
    }

    const value = block[key];
    if (value === undefined || value === null) {
      continue;
    }

    const { kind } = readRule(accepted[key]);
    if (kind === 'dimensions') {
      if (!isValidDimensions(value, located)) {
        dropped.push(key);
      }
      continue;
    }
    if (!isValidValue(kind, value)) {
      located(
        `has ${key} ${describeValue(value)}; expected ${VALUE_EXPECTATIONS[kind]}; ignored.`,
      );
      dropped.push(key);
    }
  }

  for (const [key, rule] of Object.entries(accepted)) {
    const missing = block[key] === undefined || block[key] === null || dropped.includes(key);
    if (readRule(rule).required && missing) {
      located(`is missing required key "${key}"; reading it as the undeclared chart.`);
      return null;
    }
  }

  if (dropped.length === 0) {
    return block as unknown as DeclarationOf<T>;
  }
  const kept = { ...block };
  for (const key of dropped) {
    delete kept[key];
  }
  return kept as unknown as DeclarationOf<T>;
}

/**
 * Reads the `maidr` key off a library's pass-through slot and validates it.
 *
 * Two of the slots arrive as `unknown` — amCharts' `userData`, Plotly's
 * `meta` — so `validateDeclaration(slot?.maidr, …)` does not compile there,
 * and the alternative is each adapter hand-rolling the same container guard or
 * reaching for `any` under deadline. The container is narrowed once, here.
 *
 * A container that is not an object, or that carries no `maidr` key, is no
 * declaration and passes quietly: Plotly's `meta` is very often a plain string
 * that has nothing to do with MAIDR.
 *
 * @param container - The library's slot — `series.options.custom`,
 *                    `series.get('userData')`, `trace.meta`, `usermeta`.
 * @param context   - Who is reading, and what they are reading it off.
 * @param reads     - The declared types this adapter has a reading for, as
 *                    {@link validateDeclaration} takes them.
 * @returns The validated declaration, or `null` when there is none to read.
 */
export function readDeclarationSlot<T extends DeclaredType = DeclaredType>(
  container: unknown,
  context: DeclarationContext,
  reads?: readonly T[],
): DeclarationOf<T> | null {
  const written = declarationIn(container);
  return written === undefined ? null : validateDeclaration(written, context, reads);
}

/**
 * Whether the author wrote a block in this slot at all, readable or not.
 *
 * `null` from {@link readDeclarationSlot} answers two different questions with
 * one word — "nothing was written here" and "something was written and this
 * module rejected it" — and spec §6(b)'s precedence turns on which: a block
 * that was written and rejected is still the author saying something *about
 * this series*, so the reading falls through to the heuristic rather than on
 * to a chart-level declaration meant for the series that said nothing.
 *
 * Shares its guard with {@link readDeclarationSlot} rather than restating it,
 * so the two cannot come to disagree about what a slot is.
 *
 * @param container - The library's slot.
 * @returns True when a `maidr` block was written on it.
 */
export function hasDeclarationSlot(container: unknown): boolean {
  return declarationIn(container) !== undefined;
}

/**
 * The block written in a library's slot, if any.
 *
 * A container that is not an object, that carries no `maidr` key, or whose
 * `maidr` is `null` is no declaration: Plotly's `meta` is very often a plain
 * string that has nothing to do with MAIDR, and `null` is how an author writes
 * "not set".
 *
 * @param container - The library's slot.
 * @returns The block, or `undefined` when none was written.
 */
function declarationIn(container: unknown): unknown {
  if (typeof container !== 'object' || container === null || !('maidr' in container)) {
    return undefined;
  }
  return container.maidr ?? undefined;
}

/**
 * Emits one adapter-prefixed warning.
 *
 * @param adapter - The adapter name, e.g. `'Highcharts'`.
 * @param message - The sentence following the prefix.
 */
function warn(adapter: string, message: string): void {
  console.warn(`[MAIDR ${adapter}] ${message}`);
}

/**
 * Sentences already said, keyed by the binding they were said against.
 *
 * A `WeakMap` so a chart that is thrown away takes its warning history with
 * it, and keyed on the author's own object so a *corrected* block is reported
 * afresh: rewriting a declaration produces a new object, which has said
 * nothing yet. The sentence itself is the key, which makes "each distinct
 * warning" exactly what it says — a second problem on the same block is a
 * different sentence and is still reported.
 */
const said = new WeakMap<object, Set<string>>();

/**
 * Emits one adapter-prefixed warning, at most once per binding.
 *
 * The gate lives here rather than in each adapter because every adapter needs
 * it and only some have noticed: a chart walked twice per binding — once for
 * the payload, once for the highlight — says everything twice, and a reader
 * turning on the console to find out why their chart is silent should not have
 * to read it double.
 *
 * With no binding to key on, the warning is emitted every time. That is the
 * honest default: swallowing a warning on a key that outlives the chart would
 * silence a genuinely new problem.
 *
 * @param context - Who is reading, and the binding to say it once per.
 * @param message - The sentence following the `[MAIDR <Adapter>]` prefix.
 * @param block   - The author's own block, when the caller holds one. Used as
 *                  the binding where the context names none.
 */
function report(context: DeclarationContext, message: string, block?: object): void {
  const binding = context.binding ?? block;
  if (binding === undefined) {
    warn(context.adapter, message);
    return;
  }

  let seen = said.get(binding);
  if (seen === undefined) {
    seen = new Set<string>();
    said.set(binding, seen);
  }
  const sentence = `${context.adapter}: ${message}`;
  if (seen.has(sentence)) {
    return;
  }
  seen.add(sentence);
  warn(context.adapter, message);
}
