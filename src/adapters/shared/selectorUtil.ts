/**
 * Shared CSS selector helpers for MAIDR adapters.
 *
 * These utilities were previously re-implemented (with drifting semantics)
 * across several adapters. Centralising them keeps CSS escaping and container
 * id generation consistent everywhere. Adapter-specific id prefixes are passed
 * as arguments so each adapter keeps its own naming while sharing the logic.
 */

/**
 * Monotonic counter backing {@link nextId}. Module-scoped so ids stay unique
 * within a page session without relying on `crypto.randomUUID()`, which is
 * `undefined` in insecure browsing contexts (e.g. plain-HTTP pages).
 */
let idCounter = 0;

/**
 * Generates a unique id string with the given prefix.
 *
 * Combines a module-level counter with a short random suffix so ids remain
 * unique across multiple adapter instances on the same page. Deliberately
 * avoids `crypto.randomUUID()`, which is unavailable outside secure contexts.
 *
 * @param prefix - Adapter-specific id prefix (e.g. `'d3'`).
 * @returns A unique id string, e.g. `'d3-1-k3f9x2'`.
 */
export function nextId(prefix: string): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${idCounter}-${random}`;
}

/**
 * Escapes a string for use in a CSS selector.
 *
 * Uses the native `CSS.escape` when available (browsers), and falls back to a
 * conservative escape for Node.js / SSR environments where `CSS` is undefined.
 *
 * @param value - The raw string to escape.
 * @returns The escaped string, safe to embed in a CSS selector.
 */
export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  // Fallback: escape every character that is special in a CSS identifier.
  return value.replace(/([^\w-])/g, '\\$1');
}

/**
 * Ensures a container element has an `id`, generating one when missing.
 *
 * MAIDR resolves layer selectors via page-global `document.querySelector`, so
 * a bare selector like `"rect.bar"` would collide with any other chart on the
 * page. Stamping the container with a stable id and prefixing emitted
 * selectors with `#<id>` guarantees page-wide uniqueness without requiring
 * users to set the id themselves.
 *
 * Idempotent: re-calling on a container that already has an id is a no-op.
 *
 * @param container - The root container element (or any element).
 * @param prefix    - Adapter-specific id prefix used when generating a new id.
 * @returns The container's id (existing or newly generated).
 */
export function ensureContainerId(container: Element, prefix = 'maidr'): string {
  if (!container.id) {
    container.id = nextId(prefix);
  }
  return container.id;
}
