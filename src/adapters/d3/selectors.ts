/**
 * CSS selector helpers for the D3 adapter.
 *
 * Unlike Recharts or Google Charts (which have well-defined SVG class
 * conventions), D3 gives the user complete control over the output DOM.
 * These helpers therefore do not assume any particular class structure —
 * they take user-provided selectors and derive per-element CSS paths
 * that MAIDR can use for visual highlighting.
 */

import { generateId } from './util';

/**
 * Escapes a string for use in CSS selectors.
 * Uses the native `CSS.escape` when available (browsers), and falls
 * back to a basic escape for Node.js / SSR environments.
 */
export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  // Fallback: escape characters that are special in CSS identifiers
  return value.replace(/([^\w-])/g, '\\$1');
}

/**
 * Ensures a container element has an `id` attribute, generating one when
 * missing. Returns the (possibly newly assigned) id.
 *
 * MAIDR resolves layer selectors via `document.querySelector`, which is
 * page-global — a bare selector like `"rect.bar"` would collide with any
 * other chart on the page. By stamping the container with a stable id and
 * prefixing all emitted selectors with `#<id>`, we guarantee page-wide
 * uniqueness without requiring users to set the id themselves.
 *
 * Idempotent: re-calling on a container that already has an id is a no-op.
 *
 * @param container - The root SVG container (or any element).
 * @returns The container's id (existing or newly generated).
 */
export function ensureContainerId(container: Element): string {
  if (!container.id) {
    container.id = generateId();
  }
  return container.id;
}

/**
 * Scopes a user-provided selector to a container, prefixing the result with
 * the container's id so it resolves uniquely under page-global lookups
 * (`document.querySelectorAll`). When the container lacks an id, one is
 * auto-assigned via {@link ensureContainerId} so every binder emits an
 * absolutely-scoped selector without per-binder boilerplate.
 *
 * @param container - The root SVG container.
 * @param selector - The user-provided CSS selector.
 * @returns The id-scoped selector string, e.g. `#<svgId> <selector>`.
 */
export function scopeSelector(container: Element, selector: string): string {
  const id = ensureContainerId(container);
  return `#${cssEscape(id)} ${selector}`;
}
