/**
 * Keeps the Graphviz drawings on a page accessible as they arrive.
 *
 * A Quarto `{dot}` cell is drawn when the document is rendered, so its SVG is
 * in the page from the start; a drawing made in the page by a WebAssembly
 * build, or an `{ojs}` cell that draws one, arrives later. Watching covers
 * both without the page calling anything.
 */
import type { GraphvizAdapterOptions } from './types';
import { bindGraphviz } from './bind';

/**
 * Binds every Graphviz drawing under a root now and every one added later.
 *
 * Drawings are bound with {@link bindGraphviz}, which leaves one that already
 * carries a `maidr` attribute alone, so a page that also binds some drawings
 * itself, with its own options, keeps them as it bound them -- provided it
 * binds them before they are added, or before this is called.
 *
 * @param root - Where to look. Defaults to the document
 * @param options - Figure options, applied to each drawing
 * @returns A function that stops watching
 */
export function watchGraphviz(
  root: ParentNode = document,
  options: Omit<GraphvizAdapterOptions, 'id'> = {},
): () => void {
  bindGraphviz(root, options);

  let scheduled = false;
  let stopped = false;
  const scan = (): void => {
    scheduled = false;
    if (!stopped) {
      bindGraphviz(root, options);
    }
  };
  // One drawing arrives as a burst of mutations; bind once per burst.
  const observer = new MutationObserver((mutations) => {
    if (scheduled || !mutations.some(mutation => mutation.addedNodes.length > 0)) {
      return;
    }
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(scan);
    } else {
      setTimeout(scan, 0);
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    stopped = true;
    observer.disconnect();
  };
}
