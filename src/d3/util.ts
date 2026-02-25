/**
 * Utility functions for the D3 binder.
 * Handles extracting data from D3.js-bound DOM elements.
 */

import type { FormatConfig } from '../type/grammar';
import type { DataAccessor } from './types';

/**
 * Interface for DOM elements with D3's `__data__` property.
 * D3.js binds data to elements via this property during `.data()` joins.
 */
interface D3BoundElement extends Element {
  __data__?: unknown;
}

/**
 * CSS.escape polyfill for SSR environments (Node.js / Next.js / Gatsby).
 * In browsers, delegates to the native `CSS.escape`. In Node.js where
 * `CSS` is not defined, falls back to a basic escaping implementation.
 */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  // Fallback: escape characters that are not valid in CSS identifiers.
  return value.replace(/([^\w-])/g, '\\$1');
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
 *
 * @param datum - The data object bound to a D3 element.
 * @param accessor - Property key or function to extract the value.
 * @param index - The index of the element in its selection.
 * @returns The extracted value, or `undefined` if the property does not exist.
 */
export function resolveAccessor<T>(
  datum: unknown,
  accessor: DataAccessor<T>,
  index: number,
): T | undefined {
  if (typeof accessor === 'function') {
    return accessor(datum, index);
  }
  // String accessor: use as property key
  const record = datum as Record<string, unknown>;
  return record[accessor] as T | undefined;
}

/**
 * Queries all matching elements within a container and returns them with
 * their D3-bound data. Warns if no elements are found.
 *
 * @param container - The root element (typically an SVG) to query within.
 * @param selector - CSS selector for the target elements.
 * @returns Array of `{ element, datum, index }` tuples.
 */
export function queryD3Elements(
  container: Element,
  selector: string,
): { element: Element; datum: unknown; index: number }[] {
  const elements = Array.from(container.querySelectorAll(selector));
  if (elements.length === 0) {
    console.warn(
      `[maidr/d3] No elements found for selector "${selector}" within the container. `
      + `Verify that the selector matches the D3-rendered SVG elements.`,
    );
  }
  return elements.map((element, index) => ({
    element,
    datum: getD3Datum(element),
    index,
  }));
}

/**
 * Generates a unique CSS selector for a D3 element within its container.
 * This creates a selector that MAIDR can use to highlight individual elements.
 *
 * Strategy:
 * 1. Use existing `id` attribute if present.
 * 2. Use combination of tag name, classes, and `nth-of-type` for uniqueness.
 *
 * @param element - The SVG element to generate a selector for.
 * @param container - The root container element.
 * @returns A CSS selector string targeting the element.
 */
export function generateSelector(
  element: Element,
  container: Element,
): string {
  // If the element IS the container, return a tag-based self-selector
  if (element === container) {
    if (element.id) {
      return `#${cssEscape(element.id)}`;
    }
    return element.tagName.toLowerCase();
  }

  if (element.id) {
    return `#${cssEscape(element.id)}`;
  }

  // Build a selector based on the element's parent chain relative to container
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== container) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift(`#${cssEscape(current.id)} > ${part}`);
      break;
    }

    // Add classes if present
    const classes = Array.from(current.classList)
      .map(c => `.${cssEscape(c)}`)
      .join('');
    if (classes) {
      part += classes;
    }

    // Add nth-of-type for disambiguation
    const parent = current.parentElement;
    if (parent) {
      const tagName = current.tagName;
      const siblings = Array.from(parent.children).filter(
        s => s.tagName === tagName,
      );
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }

    parts.unshift(part);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

/**
 * Generates a single CSS selector that matches all elements in the given
 * selector string within the container. This is used for the MAIDR layer
 * `selectors` field.
 *
 * @param container - The root SVG container.
 * @param selector - The user-provided CSS selector.
 * @returns The selector string, scoped if the container has an ID.
 */
export function scopeSelector(container: Element, selector: string): string {
  if (container.id) {
    return `#${cssEscape(container.id)} ${selector}`;
  }
  return selector;
}

/**
 * Monotonic counter to prevent ID collisions during synchronous multi-chart init.
 */
let idCounter = 0;

/**
 * Generates a unique ID string for use in MAIDR data structures.
 * Uses a monotonic counter combined with timestamp and random suffix to
 * avoid collisions when multiple charts are initialized synchronously.
 */
export function generateId(): string {
  return `d3-${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Builds the axes configuration for a MAIDR layer from the common
 * binder config fields.
 *
 * @param axes - Axis labels from the binder config.
 * @param format - Optional format configuration.
 * @returns The axes object for the MAIDR layer, or `undefined` if no axes provided.
 */
export function buildAxes(
  axes: { x?: string; y?: string; fill?: string } | undefined,
  format: FormatConfig | undefined,
): { x?: string; y?: string; fill?: string; format?: FormatConfig } | undefined {
  if (!axes) {
    return undefined;
  }
  return {
    ...axes,
    ...(format ? { format } : {}),
  };
}
