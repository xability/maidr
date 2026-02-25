/**
 * Utility functions for the D3 binder.
 * Handles extracting data from D3.js-bound DOM elements.
 */

import type { DataAccessor } from './types';

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
 */
export function queryD3Elements(
  container: Element,
  selector: string,
): { element: Element; datum: unknown; index: number }[] {
  const elements = Array.from(container.querySelectorAll(selector));
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
 * 2. Use combination of tag name, classes, and `nth-child` for uniqueness.
 *
 * @param element - The SVG element to generate a selector for.
 * @param container - The root container element.
 * @returns A CSS selector string targeting the element.
 */
export function generateSelector(
  element: Element,
  container: Element,
): string {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  // Build a selector based on the element's parent chain relative to container
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== container) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)} > ${part}`);
      break;
    }

    // Add classes if present
    const classes = Array.from(current.classList)
      .map(c => `.${CSS.escape(c)}`)
      .join('');
    if (classes) {
      part += classes;
    }

    // Add nth-child for disambiguation (more reliable than nth-of-type
    // in deeply nested SVG structures)
    const parent = current.parentElement;
    if (parent) {
      const childIndex = Array.from(parent.children).indexOf(current) + 1;
      part += `:nth-child(${childIndex})`;
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
    return `#${CSS.escape(container.id)} ${selector}`;
  }
  return selector;
}

/**
 * Generates a unique ID string for use in MAIDR data structures.
 */
export function generateId(): string {
  return `d3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
