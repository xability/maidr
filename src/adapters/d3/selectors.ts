/**
 * CSS selector helpers for the D3 adapter.
 *
 * Unlike Recharts or Google Charts (which have well-defined SVG class
 * conventions), D3 gives the user complete control over the output DOM.
 * These helpers therefore do not assume any particular class structure —
 * they take user-provided selectors and derive per-element CSS paths
 * that MAIDR can use for visual highlighting.
 *
 * The primitives (`cssEscape`, id generation, `ensureContainerId`) live in the
 * shared `@adapters/shared/selectorUtil` module so every adapter escapes and
 * scopes selectors identically. This module only layers the D3-specific id
 * prefix and the `scopeSelector` convenience on top.
 */

import { cssEscape, ensureContainerId as ensureSharedContainerId } from '@adapters/shared/selectorUtil';

/** Prefix used for auto-generated D3 container ids. */
const D3_ID_PREFIX = 'd3';

export { cssEscape };

/**
 * Ensures a container element has an `id` attribute, generating one (with the
 * D3 prefix) when missing. Returns the (possibly newly assigned) id.
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
  return ensureSharedContainerId(container, D3_ID_PREFIX);
}

/** Attribute stamped on each panel element by the multi-panel binders. */
export const PANEL_ATTRIBUTE = 'data-maidr-panel';

/**
 * Panel scope for multi-panel (faceted / composed) binds.
 *
 * When a binder extracts one panel of a multi-panel figure, its extraction
 * root is the panel element — not the outer SVG. Emitted selectors must still
 * be anchored to the OUTER SVG's page-unique id (MAIDR resolves selectors via
 * `document.querySelector`) and additionally narrowed to the panel via the
 * `data-maidr-panel` attribute, so panel A's selector can never match panel
 * B's marks.
 */
export interface D3PanelScope {
  /** The outer SVG (or container) whose id anchors all emitted selectors. */
  container: Element;
  /** The index stamped on the panel element as `data-maidr-panel`. */
  panelIndex: number;
}

/**
 * Returns the absolute selector prefix for a container — `#<id>` for
 * single-panel binds, `#<id> [data-maidr-panel="<i>"]` when a panel scope is
 * given. Binders that build custom selector strings (line, box) concatenate
 * this prefix with their own per-element attribute selectors.
 *
 * @param container - The extraction root (the SVG, or a panel element).
 * @param panel - Optional panel scope; when present, its `container` (the
 *                outer SVG) supplies the id and the panel segment is appended.
 * @returns The selector prefix, without a trailing space.
 */
export function selectorPrefix(container: Element, panel?: D3PanelScope): string {
  const id = ensureContainerId(panel?.container ?? container);
  const base = `#${cssEscape(id)}`;
  return panel ? `${base} [${PANEL_ATTRIBUTE}="${panel.panelIndex}"]` : base;
}

/**
 * Scopes a user-provided selector to a container, prefixing the result with
 * the container's id so it resolves uniquely under page-global lookups
 * (`document.querySelectorAll`). When the container lacks an id, one is
 * auto-assigned via {@link ensureContainerId} so every binder emits an
 * absolutely-scoped selector without per-binder boilerplate.
 *
 * With a {@link D3PanelScope}, the emitted selector is additionally narrowed
 * to the panel: `#<svgId> [data-maidr-panel="<i>"] <selector>`.
 *
 * @param container - The root SVG container (or panel extraction root).
 * @param selector - The user-provided CSS selector.
 * @param panel - Optional panel scope for multi-panel binds.
 * @returns The id-scoped selector string, e.g. `#<svgId> <selector>`.
 */
export function scopeSelector(container: Element, selector: string, panel?: D3PanelScope): string {
  return `${selectorPrefix(container, panel)} ${selector}`;
}
