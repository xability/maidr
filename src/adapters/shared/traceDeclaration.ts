/**
 * Shared resolution rules for the co-located `maidr` declaration block.
 *
 * The declaration types themselves live in `src/type/declaration.ts`, beside
 * the grammar they feed. What lives here is the part that must not be
 * re-implemented eight times: how a {@link FieldRef} is read off an author's
 * row, which spellings of a canonical field name are accepted when no ref is
 * given, what counts as a censored observation, and how an untyped block from
 * a chart config is narrowed.
 *
 * Eight independent implementations of the fallback chains would mean an
 * author's `isCensored` column works in d3 and silently does not in Chart.js,
 * which is an accessibility regression class rather than a style question —
 * the same argument `selectorUtil.ts` records for itself.
 *
 * Nothing else belongs in this file. Anything that mirrors `MaidrLayer`'s
 * option blocks would become a second grammar that can drift from the first.
 */

import type { AlluvialDeclaration, BoxenDeclaration, ChoroplethDeclaration, ErrorBarDeclaration, FieldRef, ForestDeclaration, HexbinDeclaration, MaidrTraceDeclaration, ManhattanDeclaration, MosaicDeclaration, ParallelDeclaration, RidgelineDeclaration, ScatterDeclaration, SurvivalDeclaration, VolcanoDeclaration } from '../../type/declaration';
import { TraceType } from '../../type/grammar';

/**
 * Alternative property names accepted for each canonical grammar field name,
 * in priority order.
 *
 * Lifted from the shipped d3 binder configs — `censored` at
 * `d3/binders/survival.ts`, the bounds at `d3/binders/errorBar.ts`, the ladder
 * at `d3/binders/boxen.ts` — so a column that works in one adapter works in
 * all of them. The two bound chains are the union of the survival and
 * error-bar binders' lists, which differ by a name or two each.
 *
 * Consulted **only** when the author named no field: an explicit
 * {@link FieldRef} is used verbatim, per {@link resolveFieldRef}. A canonical
 * name with no entry here — `width`, `x`, `y`, `region` — resolves under its
 * own name and nothing else.
 *
 * `censored` is deliberately not aliased to `event`, which most survival
 * datasets carry with the opposite meaning.
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
 * Reads one declared fact off an author's row.
 *
 * An explicit `ref` is used verbatim with **no fallback**: a name the author
 * wrote that misses is their error, and reporting it — the caller warns per
 * the adapter's `[MAIDR <Adapter>]` contract — beats papering over it with a
 * column they did not name. Only the defaulted path walks
 * {@link FIELD_REF_FALLBACKS}, trying `canonical` first and then each
 * alternative in order.
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
 *                    `dataItem.dataContext`, a d3 `element.__data__`.
 * @param ref       - The field the author named, or `undefined` to default.
 * @param canonical - The grammar field name being filled, e.g. `'yMin'`.
 * @returns The value read, or `undefined` when nothing resolves.
 */
export function resolveFieldRef<T>(
  row: Record<string, unknown> | undefined,
  ref: FieldRef | undefined,
  canonical: string,
): T | undefined {
  if (row === null || typeof row !== 'object') {
    return undefined;
  }
  if (typeof ref === 'string') {
    return row[ref] as T | undefined;
  }

  const canonicalValue = row[canonical];
  if (canonicalValue !== undefined) {
    return canonicalValue as T;
  }
  for (const alternative of FIELD_REF_FALLBACKS[canonical] ?? []) {
    const value = row[alternative];
    if (value !== undefined) {
      return value as T;
    }
  }
  return undefined;
}

/**
 * Whether a resolved value marks a censored observation.
 *
 * Read strictly rather than by truthiness, because survival data carries the
 * flag as a boolean, as a 0/1 indicator, or as the string one of those was
 * parsed from — and `'0'` is truthy in every one of those readings but censors
 * nobody. `true`, `1`, `'1'` and `'true'` count; everything else, `'yes'`
 * included, does not.
 *
 * @param value - Whatever the `censored` field resolved to.
 * @returns True when the value marks a censored time.
 */
export function isCensoredValue(value: unknown): boolean {
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

/** The `type` values {@link MaidrTraceDeclaration} covers. */
type DeclaredType = MaidrTraceDeclaration['type'];

/**
 * Every key a declaration variant accepts, other than its discriminant.
 *
 * `Record` over these is exhaustive in both directions, which is what makes
 * the runtime key sets below provably the compile-time ones: a field added to
 * a variant without being added to its set fails to compile, and so does a set
 * naming a field the variant does not have.
 */
type FieldKeySet<T> = Readonly<Record<Exclude<keyof T, 'type'> & string, true>>;

/**
 * The closed key set of each variant, by declared type.
 *
 * Closedness is the point: it is what makes `significanse: 7.3` detectable in
 * plain JS, where nothing else would catch it. Keying the map by
 * {@link DeclaredType} means a new variant cannot be added to
 * `src/type/declaration.ts` without landing here too.
 */
const DECLARATION_KEYS: Readonly<Record<DeclaredType, Readonly<Record<string, true>>>> = {
  [TraceType.SURVIVAL]: {
    title: true,
    name: true,
    censored: true,
    yMin: true,
    yMax: true,
    stepDirection: true,
    censoredSeries: true,
    bandSeries: true,
  } satisfies FieldKeySet<SurvivalDeclaration>,
  [TraceType.ERROR_BAR]: {
    title: true,
    name: true,
    yMin: true,
    yMax: true,
    error: true,
    intervalSeries: true,
    orientation: true,
  } satisfies FieldKeySet<ErrorBarDeclaration>,
  [TraceType.FOREST]: {
    title: true,
    name: true,
    yMin: true,
    yMax: true,
    error: true,
    intervalSeries: true,
    orientation: true,
    weight: true,
    pooled: true,
    pooledIndex: true,
    pooledSeries: true,
    nullValue: true,
  } satisfies FieldKeySet<ForestDeclaration>,
  [TraceType.MANHATTAN]: {
    title: true,
    name: true,
    label: true,
    group: true,
    significance: true,
    significanceDirection: true,
    effect: true,
    merge: true,
  } satisfies FieldKeySet<ManhattanDeclaration>,
  [TraceType.VOLCANO]: {
    title: true,
    name: true,
    label: true,
    group: true,
    significance: true,
    significanceDirection: true,
    effect: true,
    merge: true,
  } satisfies FieldKeySet<VolcanoDeclaration>,
  [TraceType.SCATTER]: {
    title: true,
    name: true,
    label: true,
    merge: true,
  } satisfies FieldKeySet<ScatterDeclaration>,
  [TraceType.ALLUVIAL]: {
    title: true,
    name: true,
  } satisfies FieldKeySet<AlluvialDeclaration>,
  [TraceType.MOSAIC]: {
    title: true,
    name: true,
    width: true,
    count: true,
  } satisfies FieldKeySet<MosaicDeclaration>,
  [TraceType.CHOROPLETH]: {
    title: true,
    name: true,
    region: true,
    value: true,
    lon: true,
    lat: true,
  } satisfies FieldKeySet<ChoroplethDeclaration>,
  [TraceType.PARALLEL]: {
    title: true,
    name: true,
    dimensions: true,
    label: true,
  } satisfies FieldKeySet<ParallelDeclaration>,
  [TraceType.RIDGELINE]: {
    title: true,
    name: true,
    group: true,
    value: true,
    density: true,
  } satisfies FieldKeySet<RidgelineDeclaration>,
  [TraceType.HEXBIN]: {
    title: true,
    name: true,
    x: true,
    y: true,
    count: true,
    row: true,
  } satisfies FieldKeySet<HexbinDeclaration>,
  [TraceType.BOXEN]: {
    title: true,
    name: true,
    x: true,
    median: true,
    levels: true,
    lowerOutliers: true,
    upperOutliers: true,
    orientation: true,
  } satisfies FieldKeySet<BoxenDeclaration>,
};

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
 * Narrows an unknown value read from a library's pass-through slot into a
 * validated declaration, or `null`.
 *
 * A co-located block is untyped in plain JS, so this read-time check is the
 * only defence an author has against a typo. It warns once per distinct
 * problem — an unknown or missing `type`, a block that is not an object, and
 * each key the declared variant does not accept — and **never throws**: a
 * binder that throws takes the host page down, so every failure degrades to
 * the undeclared reading instead.
 *
 * An unknown key is warned about and left alone; the declaration still stands
 * and its known fields are still read. An unknown `type` rejects the block
 * outright, and the caller falls through to its chart-level declaration and
 * then to its heuristic. A `TraceType` value with no variant in
 * {@link MaidrTraceDeclaration} — `'bar'`, say — is unknown in the same sense:
 * there is nothing here to declare about it.
 *
 * This is the only place an `unknown` from a chart config is narrowed; `any`
 * must not escape it. Calling it once per series per binding is what satisfies
 * the "each distinct warning at most once per chart per binding" contract —
 * this function holds no state of its own.
 *
 * @param raw     - The value at the library's `maidr` slot. `undefined` and
 *                  `null` mean "no declaration" and pass quietly.
 * @param context - Who is reading, and what they are reading it off.
 * @param context.adapter - Names the adapter in the `[MAIDR <Adapter>]`
 *                  warning prefix, e.g. `'Highcharts'`.
 * @param context.seriesRef - How the author can find the series. Printed
 *                  verbatim, so pass a locating phrase — `'series "sales"'`,
 *                  `'dataset 2'` — rather than a bare number.
 * @returns The validated declaration, or `null` when there is none to read.
 */
export function validateDeclaration(
  raw: unknown,
  context: { adapter: string; seriesRef: string },
): MaidrTraceDeclaration | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  const { adapter, seriesRef } = context;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    warn(adapter, `maidr declaration on ${seriesRef} is not an object; ignored.`);
    return null;
  }

  const block = raw as Record<string, unknown>;
  const type = block.type;
  if (typeof type !== 'string' || !isDeclaredType(type)) {
    warn(
      adapter,
      `maidr declaration on ${seriesRef} has unknown type "${String(type)}"; `
      + `reading it as the undeclared chart.`,
    );
    return null;
  }

  const accepted = DECLARATION_KEYS[type];
  for (const key of Object.keys(block)) {
    if (key !== 'type' && !Object.hasOwn(accepted, key)) {
      warn(
        adapter,
        `maidr declaration for "${type}" on ${seriesRef} has unknown key "${key}"; ignored.`,
      );
    }
  }

  return block as unknown as MaidrTraceDeclaration;
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
