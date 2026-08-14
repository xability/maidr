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
 * Nothing else belongs in this file. Anything that mirrors `MaidrLayer`'s
 * option blocks would become a second grammar that can drift from the first.
 */

import type { AlluvialDeclaration, BoxenDeclaration, ChoroplethDeclaration, ErrorBarDeclaration, FieldRef, ForestDeclaration, HexbinDeclaration, MaidrTraceDeclaration, ManhattanDeclaration, MosaicDeclaration, ParallelDeclaration, RidgelineDeclaration, ScatterDeclaration, SurvivalDeclaration, VolcanoDeclaration } from '../../type/declaration';
import { Orientation, TraceType } from '../../type/grammar';

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
 * name with no entry here — `width`, `x`, `y`, `region` — resolves under its
 * own name and nothing else.
 *
 * The chains are keyed by canonical name across every declared type, so a name
 * borrowed by two of them is shared: `value` carries the ridgeline chain and a
 * choropleth's `value` therefore also answers to `x`, which is called out on
 * {@link ChoroplethDeclaration.value}.
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
 * wrote that misses is their error, and reporting it — with
 * {@link warnUnresolvedRef}, once the series is read — beats papering over it
 * with a column they did not name. Only the defaulted path walks
 * {@link FIELD_REF_FALLBACKS}, trying `canonical` first and then each
 * alternative in order.
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
 * @returns The value read, or `undefined` when nothing resolves.
 */
export function resolveFieldRef<T>(
  row: unknown,
  ref: FieldRef | undefined,
  canonical: string,
): T | undefined {
  if (row === null || typeof row !== 'object') {
    return undefined;
  }

  // The one narrowing this module exists to do: a library's row is an untyped
  // bag of the author's own columns, and the names are resolved from data.
  const record = row as Record<string, unknown>;
  if (typeof ref === 'string') {
    return record[ref] as T | undefined;
  }

  const canonicalValue = record[canonical];
  if (canonicalValue !== undefined) {
    return canonicalValue as T;
  }
  for (const alternative of FIELD_REF_FALLBACKS[canonical] ?? []) {
    const value = record[alternative];
    if (value !== undefined) {
      return value as T;
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
 * The message lives here so all eight adapters print the same sentence; the
 * "at most once per chart per binding" contract is satisfied by calling this
 * once per series per field, since it holds no state of its own.
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
  warn(
    context.adapter,
    `maidr declaration on ${context.seriesRef} names "${ref}" for ${canonical}, `
    + `which no row carries; ${canonical} is left out.`,
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

/** The `type` values {@link MaidrTraceDeclaration} covers. */
type DeclaredType = MaidrTraceDeclaration['type'];

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
 *
 * `undefined` and `null` are "not given" wherever they appear, both as the
 * block and as any key's value.
 *
 * The returned declaration is the block itself where nothing was dropped, and
 * a copy without the dropped keys otherwise: the author's chart config is
 * never mutated.
 *
 * This is the only place an `unknown` from a chart config is narrowed; `any`
 * must not escape it. Calling it once per series per binding is what satisfies
 * the "each distinct warning at most once per chart per binding" contract —
 * this function holds no state of its own.
 *
 * @param raw     - The value at the library's `maidr` slot.
 * @param context - Who is reading, and what they are reading it off.
 * @returns The validated declaration, or `null` when there is none to read.
 */
export function validateDeclaration(
  raw: unknown,
  context: DeclarationContext,
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

  const located = (message: string): void =>
    warn(adapter, `maidr declaration for "${type}" on ${seriesRef} ${message}`);

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
    return block as unknown as MaidrTraceDeclaration;
  }
  const kept = { ...block };
  for (const key of dropped) {
    delete kept[key];
  }
  return kept as unknown as MaidrTraceDeclaration;
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
 * @returns The validated declaration, or `null` when there is none to read.
 */
export function readDeclarationSlot(
  container: unknown,
  context: DeclarationContext,
): MaidrTraceDeclaration | null {
  if (typeof container !== 'object' || container === null || !('maidr' in container)) {
    return null;
  }
  return validateDeclaration(container.maidr, context);
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
