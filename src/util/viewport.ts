/**
 * Watching for the viewport moving under coordinates already measured.
 *
 * `getBoundingClientRect()` answers in viewport space, so anything a trace
 * caches from it describes where a mark was *relative to the window at the
 * moment it was measured*. Scroll the page, scroll a container the chart sits
 * in, or resize the window, and every cached coordinate is off by however far
 * the chart moved -- while the pointer coordinates it is compared against
 * (`event.clientX` / `clientY`) are always current.
 *
 * A pointer path that caches centres therefore needs one rule: drop the cache
 * whenever the viewport moves, and measure again on the next hover.
 */

/**
 * Calls `onViewportChange` whenever cached viewport coordinates may have gone
 * stale.
 *
 * Two events say so. `scroll` is watched in the **capture** phase because a
 * scroll event does not bubble: a chart inside its own scrolling container
 * fires on that container and nothing else, and only a capture-phase listener
 * on `window` sees it. `resize` covers the window changing shape, which moves
 * a responsive chart's marks without scrolling anything.
 *
 * A redraw or a live-data update needs no event here: it replaces the trace,
 * and the new one measures for itself.
 *
 * @param onViewportChange - Called on each scroll or resize
 * @returns A function that stops watching; safe to call more than once, and a
 * no-op where there is no `window` (server-side rendering, a `node` test)
 */
export function watchViewport(onViewportChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => { /* Nothing was watched. */ };
  }

  window.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);

  return () => {
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
  };
}
