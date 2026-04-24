/**
 * CSS selector helpers for the D3 adapter.
 *
 * Unlike Recharts or Google Charts (which have well-defined SVG class
 * conventions), D3 gives the user complete control over the output DOM.
 * These helpers therefore do not assume any particular class structure —
 * they take user-provided selectors and derive per-element CSS paths
 * that MAIDR can use for visual highlighting.
 */

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
 * Generates a unique CSS selector for an element within its container.
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
    return `#${cssEscape(element.id)}`;
  }

  // Edge case: element IS the container
  if (element === container) {
    return element.tagName.toLowerCase();
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
 * Scopes a user-provided selector to a container.
 * When the container has an `id`, the returned selector is prefixed
 * with `#containerId` so it can be used globally (e.g. via `document.querySelectorAll`)
 * without matching unrelated elements elsewhere on the page.
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
