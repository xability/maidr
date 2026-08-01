import type React from 'react';

/**
 * Style that keeps an element in the accessibility tree but off the screen.
 *
 * The standard clip pattern. Used rather than a `.sr-only` class because MAIDR
 * has no stylesheet to put one in: `dist/maidr.css` is a placeholder emitted so
 * integrations that link it by name keep working, and the UI is styled at
 * runtime by emotion (see `scripts/vite-plugin-math-stylesheet.js`).
 *
 * Shipping a global `.sr-only` rule instead would be worse than merely
 * inconvenient. MAIDR embeds in pages it does not control, and `sr-only` is a
 * common name — Bootstrap 4 and Tailwind both define it — so a global rule
 * would either be overridden by the host's or silently override the host's for
 * the rest of the page. An inline style on the elements MAIDR owns cannot
 * reach anything outside them.
 */
export const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  // `clip` is deprecated and `clipPath` is its replacement, but both are here
  // on purpose: this is the one idiom every browser still honours `clip` for,
  // and dropping it would silently widen the set of engines where the element
  // becomes visible. Belt and braces is the standard form of this pattern.
  clip: 'rect(0, 0, 0, 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};
