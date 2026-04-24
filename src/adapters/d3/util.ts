/**
 * Utility functions for the D3 adapter.
 * Handles extracting data from D3.js-bound DOM elements,
 * generating identifiers, and normalizing axis configuration.
 *
 * Selector-specific helpers (cssEscape, generateSelector, scopeSelector)
 * live in ./selectors.ts.
 */

import type { AxisConfig, AxisFormat, Maidr, MaidrLayer } from '../../type/grammar';
import type { D3AxisInput, D3BinderConfig, DataAccessor } from './types';

/**
 * Interface for DOM elements with D3's `__data__` property.
 * D3.js binds data to elements via this property during `.data()` joins.
 */
interface D3BoundElement extends Element {
  __data__?: unknown;
}

/**
 * Extracts the D3-bound datum from a DOM element.
 * D3.js stores bound data on the `__data__` property of DOM elements
 * after a `.data()` join.
 *
 * @param element - The DOM element to extract data from.
 * @returns The bound datum, or `undefined` if no data is bound.
 */
export function getD3Datum(element: Element): unknown {
  return (element as D3BoundElement).__data__;
}

/**
 * Resolves a {@link DataAccessor} to extract a value from a datum.
 * Throws if a string accessor references a property not present on the datum.
 *
 * @param datum - The data object bound to a D3 element.
 * @param accessor - Property key or function to extract the value.
 * @param index - The index of the element in its selection.
 * @returns The extracted value.
 * @throws Error if the string accessor references a missing property.
 */
export function resolveAccessor<T>(
  datum: unknown,
  accessor: DataAccessor<T>,
  index: number,
): T {
  if (typeof accessor === 'function') {
    return accessor(datum, index);
  }
  // String accessor: use as property key
  const record = datum as Record<string, unknown>;
  if (!(accessor in record)) {
    throw new Error(
      `Property "${accessor}" not found on datum at index ${index}. `
      + `Available properties: ${Object.keys(record).join(', ')}`,
    );
  }
  return record[accessor] as T;
}

/**
 * Resolves a string accessor with optional fallback-key inference.
 *
 * Call AFTER {@link queryD3Elements} returns so the first datum can be
 * sampled. When the user did NOT provide an explicit accessor
 * (`config[configKey]` is `undefined`), and the canonical `defaultKey` is
 * missing from the first datum, each name in `alternatives` is tried in
 * order. The first alternative present on the datum is returned. If nothing
 * matches, `defaultKey` is returned — which will trigger the helpful
 * "Available properties: …" error inside {@link resolveAccessor}.
 *
 * When the user DID provide an accessor (string or function), it is
 * returned verbatim — explicit user intent always wins.
 *
 * @param config       - The user's config object, looked up by `configKey`.
 * @param configKey    - The property name on `config` to check.
 * @param defaultKey   - Canonical key used when user is silent.
 * @param alternatives - Alternative keys to try if `defaultKey` is missing.
 * @param firstDatum   - First D3-bound datum; used only when the user was
 *                       silent and the default key is missing.
 * @returns A {@link DataAccessor} ready to pass to {@link resolveAccessor}.
 */
export function inferAccessor<T>(
  config: Record<string, unknown>,
  configKey: string,
  defaultKey: string,
  alternatives: string[],
  firstDatum: unknown,
): DataAccessor<T> {
  const userProvided = config[configKey];
  if (userProvided !== undefined) {
    return userProvided as DataAccessor<T>;
  }
  if (firstDatum && typeof firstDatum === 'object') {
    const record = firstDatum as Record<string, unknown>;
    if (defaultKey in record) {
      return defaultKey as DataAccessor<T>;
    }
    for (const alt of alternatives) {
      if (alt in record) {
        return alt as DataAccessor<T>;
      }
    }
  }
  return defaultKey as DataAccessor<T>;
}

/**
 * Attempts to resolve a {@link DataAccessor}, returning `undefined`
 * instead of throwing when the property is not found.
 * Useful for optional fields like `fill` or outlier arrays.
 */
export function resolveAccessorOptional<T>(
  datum: unknown,
  accessor: DataAccessor<T>,
  index: number,
): T | undefined {
  if (typeof accessor === 'function') {
    return accessor(datum, index);
  }
  const record = datum as Record<string, unknown>;
  if (!(accessor in record)) {
    return undefined;
  }
  return record[accessor] as T;
}

/**
 * Queries all matching elements within a container and returns them with
 * their D3-bound data.
 *
 * @param container - The root element (typically an SVG) to query within.
 * @param selector - CSS selector for the target elements.
 * @returns Array of `{ element, datum, index }` tuples.
 * @throws Error if the selector is empty.
 */
export function queryD3Elements(
  container: Element,
  selector: string,
): { element: Element; datum: unknown; index: number }[] {
  if (!selector) {
    throw new Error('CSS selector must not be empty.');
  }
  const elements = Array.from(container.querySelectorAll(selector));
  return elements.map((element, index) => ({
    element,
    datum: getD3Datum(element),
    index,
  }));
}

/**
 * Builds a richer "no elements matched" error that distinguishes between
 * three common failure modes so users can fix them quickly:
 *
 * 1. Nothing at all was drawn (no SVG children) — likely the binder ran
 *    before D3 rendered.
 * 2. Something was drawn but nothing matches the given selector — likely
 *    a typo, wrong class, or wrong element name.
 * 3. The selector matches elements but none carry a `__data__` binding —
 *    the DOM was drawn by hand (or by a non-D3 library), so the binder
 *    has no data to extract.
 *
 * @param container  - The root element the selector was run against.
 * @param selector   - The CSS selector the user provided.
 * @param elementKind - Human-friendly name for the target elements
 *                     (e.g. "bar", "box group", "cell") used in the
 *                     suggestion text.
 */
export function buildNoElementsError(
  container: Element,
  selector: string,
  elementKind: string,
): Error {
  const hasAnyChildren = container.children && container.children.length > 0;
  if (!hasAnyChildren) {
    return new Error(
      `No elements found for selector "${selector}" and the SVG appears empty. `
      + `This usually means the binder ran before D3 finished rendering. `
      + `Call the binder right after your \`.data(...).join(...)\` chain, or `
      + `inside a React \`useEffect\` (not during render).`,
    );
  }

  // Try to give a hint about what IS present so users can adjust the selector.
  const sampleTagNames = new Set<string>();
  for (let i = 0; i < container.children.length && sampleTagNames.size < 5; i++) {
    sampleTagNames.add(container.children[i].tagName.toLowerCase());
  }
  const hint = sampleTagNames.size > 0
    ? ` Top-level child tags present: ${Array.from(sampleTagNames).join(', ')}.`
    : '';

  return new Error(
    `No elements found for selector "${selector}".${hint} `
    + `Check that the selector matches the ${elementKind} elements you drew with D3.`,
  );
}

/**
 * Builds a richer "element has no D3 data bound" error. Called when
 * `queryD3Elements` returned elements but `__data__` is missing, which
 * almost always means the SVG was built with `.append(...)` alone,
 * without a `.data(...).join(...)` chain.
 *
 * @param selector - The CSS selector that matched the element.
 * @param index    - Position of the offending element in the selection.
 */
export function buildNoDatumError(selector: string, index: number): Error {
  return new Error(
    `Element at index ${index} (matched by "${selector}") has no D3-bound `
    + `\`__data__\` property. The binder relies on D3's data join: ensure you `
    + `built these elements with \`.data(yourData).join(...)\` (or `
    + `\`.data(...).enter().append(...)\`) rather than plain \`.append(...)\`. `
    + `If you are using a non-D3 library, pass the data to the MAIDR schema directly.`,
  );
}

/**
 * Generates a unique ID string for use in MAIDR data structures.
 * Uses `crypto.randomUUID()` when available, with a fallback for
 * environments that lack crypto support.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `d3-${crypto.randomUUID()}`;
  }
  // Fallback: combine timestamp with multiple random segments
  const timestamp = Date.now().toString(36);
  const a = Math.random().toString(36).slice(2, 8);
  const b = Math.random().toString(36).slice(2, 8);
  return `d3-${timestamp}-${a}${b}`;
}

/**
 * Normalizes a single axis input (string shorthand or AxisConfig object)
 * into a canonical AxisConfig. When the user passes a string, it becomes
 * the axis label. A shared `format` is applied only if the axis does not
 * already specify its own.
 */
function normalizeAxis(
  input: D3AxisInput | undefined,
  sharedFormat?: AxisFormat,
): AxisConfig | undefined {
  if (input === undefined)
    return undefined;

  const base: AxisConfig = typeof input === 'string'
    ? { label: input }
    : { ...input };

  if (sharedFormat && base.format === undefined) {
    base.format = sharedFormat;
  }
  return base;
}

/**
 * Builds the axes configuration for a MAIDR layer per the canonical schema:
 * `{ x?: AxisConfig, y?: AxisConfig, z?: AxisConfig }`.
 *
 * Accepts the D3 adapter's user-friendly input (string labels or full
 * {@link AxisConfig} objects) and maps the D3-specific `fill` axis to the
 * canonical `z` axis used internally.
 *
 * @param axes - D3 adapter axis configuration.
 * @param format - Optional shared format applied to axes without own `format`.
 * @returns Canonical layer axes, or `undefined` if no axes provided.
 */
export function buildAxes(
  axes?: D3BinderConfig['axes'],
  format?: AxisFormat,
): MaidrLayer['axes'] | undefined {
  if (!axes)
    return undefined;

  const result: NonNullable<MaidrLayer['axes']> = {};
  const x = normalizeAxis(axes.x, format);
  const y = normalizeAxis(axes.y, format);
  const z = normalizeAxis(axes.fill, format);

  if (x)
    result.x = x;
  if (y)
    result.y = y;
  if (z)
    result.z = z;

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Applies the generated MAIDR schema to the SVG as a `maidr-data` attribute,
 * unless opted out via `autoApply: false`. This removes the boilerplate
 * `svg.setAttribute('maidr-data', JSON.stringify(result.maidr))` call for
 * vanilla-JS users, while staying out of the way of the React adapter
 * (which passes `autoApply: false` and hands the schema straight to
 * `<Maidr>` / `<MaidrD3>`).
 *
 * @param svg       - The target SVG element (or container).
 * @param maidr     - The MAIDR schema produced by a binder.
 * @param autoApply - When `false`, no attribute is set. When `undefined`
 *                    or any other value, the attribute is set.
 */
export function applyMaidrData(
  svg: Element,
  maidr: Maidr,
  autoApply: boolean | undefined,
): void {
  if (autoApply === false)
    return;
  if (typeof svg.setAttribute !== 'function')
    return;
  svg.setAttribute('maidr-data', JSON.stringify(maidr));
}
