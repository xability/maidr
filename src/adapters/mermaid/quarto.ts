/**
 * Makes the diagrams of Quarto's `{mermaid}` cells accessible.
 *
 * Quarto writes each cell's text into a `<pre class="mermaid mermaid-js">`
 * and, once the page has loaded, draws it with the Mermaid it bundles
 * (`mermaid-init.js`): it renders the text under `mermaid-<n>`, numbering the
 * cells in document order, replaces the `<pre>` with the drawing, and renames
 * the drawing after the cell's label when it has one (`fig-flow-mermaid`).
 * The adapter reads a diagram from its text, which the drawing no longer
 * holds, so this keeps each cell's text on the element the drawing lands in
 * before Quarto draws, and binds the drawings once Quarto has drawn them all.
 *
 * It waits for all of them because some of Mermaid's diagram databases are
 * shared between parses: reading one diagram while Quarto is still parsing
 * the next would read the wrong one.
 */
import type { MermaidApi } from './types';
import { createMaidrFromMermaid } from './converter';

/** Where a cell's text is kept, on the element its drawing is put in. */
const SOURCE = 'data-maidr-mermaid-source';

/** The id Quarto rendered the cell under, which prefixes its element ids. */
const RENDER_ID = 'data-maidr-mermaid-render-id';

/** Set on a cell whose drawing could not be made accessible. */
const FAILED = 'data-maidr-mermaid-failed';

/**
 * How long Quarto's drawing must have been still, after the page has loaded,
 * before whatever it has drawn is bound anyway.
 */
const SETTLE_MS = 2000;

/** The cells Quarto has yet to draw. */
const PENDING = 'pre.mermaid-js';

/**
 * Keeps each undrawn cell's text, and the id Quarto will render it under, on
 * the element its drawing will be put in.
 *
 * Quarto numbers the cells it draws from 1 in document order, and takes the
 * text as `textContent` with every `&nbsp;` replaced by a space; both are
 * followed here, so the text kept is the text Quarto drew.
 *
 * @param root - Where to look
 */
function keepSources(root: ParentNode): void {
  root.querySelectorAll(PENDING).forEach((pre, at) => {
    const host = pre.parentElement;
    if (host === null || host.hasAttribute(SOURCE)) {
      return;
    }
    host.setAttribute(SOURCE, (pre.textContent ?? '').replaceAll('&nbsp;', ' '));
    host.setAttribute(RENDER_ID, `mermaid-${at + 1}`);
  });
}

/**
 * The page's Mermaid: the one Quarto loaded, as a global.
 *
 * @returns The Mermaid API, or undefined when the page has none
 */
function pageMermaid(): MermaidApi | undefined {
  const candidate = (window as Window & { mermaid?: MermaidApi }).mermaid;
  return typeof candidate?.mermaidAPI?.getDiagramFromText === 'function' ? candidate : undefined;
}

/**
 * Binds every drawing Quarto has put in a kept host, one at a time.
 *
 * @param root - Where to look
 * @param mermaid - The page's Mermaid
 * @returns How many drawings were bound
 */
async function bindDrawn(root: ParentNode, mermaid: MermaidApi): Promise<number> {
  let bound = 0;
  for (const host of [...root.querySelectorAll(`[${SOURCE}]`)]) {
    const svg = host.querySelector(':scope > svg');
    if (!(svg instanceof SVGSVGElement) || svg.hasAttribute('maidr') || host.hasAttribute(FAILED)) {
      continue;
    }
    const source = host.getAttribute(SOURCE) ?? '';
    const idPrefix = host.getAttribute(RENDER_ID) ?? svg.id;
    try {
      const maidr = await createMaidrFromMermaid(mermaid, source, svg, { idPrefix });
      svg.setAttribute('maidr', JSON.stringify(maidr));
      bound += 1;
    } catch (error) {
      host.setAttribute(FAILED, '');
      console.error(`[maidr/mermaid] Could not make the Quarto diagram ${svg.id ? `#${svg.id} ` : ''}accessible.`, error);
    }
  }
  return bound;
}

/**
 * Whether a change is Quarto drawing a cell: its `<pre>` taken out of, or its
 * drawing put into, a host whose text was kept.
 *
 * @param mutation - The change
 * @returns True for a change inside a kept host
 */
function isDrawing(mutation: MutationRecord): boolean {
  return mutation.target instanceof Element && mutation.target.closest(`[${SOURCE}]`) !== null;
}

/**
 * Makes the `{mermaid}` cells of a Quarto page accessible as Quarto draws
 * them.
 *
 * Call it before the page's `load` event, which is when Quarto draws: a
 * script in the document's head, where Quarto's `include-in-header` and the
 * `maidr` filter put it, runs in time. Called later, it still binds what is
 * drawn, but only if it was kept before Quarto drew.
 *
 * @param root - Where the cells are. Defaults to the document
 * @returns A function that stops watching
 *
 * @example
 * ```yaml
 * format:
 *   html:
 *     include-in-header:
 *       - text: |
 *           <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 *           <script src="https://cdn.jsdelivr.net/npm/maidr/dist/mermaid.js"></script>
 * ```
 */
export function watchQuartoMermaid(root: ParentNode = document): () => void {
  keepSources(root);

  let stopped = false;
  let running = false;
  let again = false;
  let loaded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const observer = new MutationObserver((mutations) => {
    schedule(false);
    // Only Quarto drawing a cell moves the moment on; the rest of a live page
    // changing would otherwise put it off for good.
    if (loaded && mutations.some(isDrawing)) {
      settle();
    }
  });

  const stop = (): void => {
    stopped = true;
    observer.disconnect();
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    window.removeEventListener('load', onLoad);
  };

  /**
   * Binds what is drawn, once Quarto has drawn everything or, when forced,
   * whatever it has drawn so far: a cell whose text Mermaid rejects stops
   * Quarto's loop, and the cells after it are never drawn.
   *
   * @param force - Bind even while cells are still undrawn
   */
  const run = async (force: boolean): Promise<void> => {
    if (stopped) {
      return;
    }
    if (running) {
      again = true;
      return;
    }
    const undrawn = root.querySelector(PENDING) !== null;
    if (undrawn && !force) {
      return;
    }
    const mermaid = pageMermaid();
    if (mermaid === undefined) {
      return;
    }
    running = true;
    try {
      await bindDrawn(root, mermaid);
    } finally {
      running = false;
    }
    if (again) {
      again = false;
      await run(force);
      return;
    }
    if (!undrawn) {
      stop();
    }
  };

  function schedule(force: boolean): void {
    void run(force);
  }

  /**
   * Binds what is drawn once Quarto's drawing has been still for a while: a
   * slow draw keeps moving the moment on, so the forced pass never parses
   * while Quarto is still parsing.
   */
  function settle(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => schedule(true), SETTLE_MS);
  }

  function onLoad(): void {
    loaded = true;
    settle();
  }

  if (root.querySelector(`[${SOURCE}]`) === null) {
    // Nothing kept: no cells, or Quarto drew them before this ran.
    return stop;
  }
  observer.observe(root, { childList: true, subtree: true });
  if (document.readyState === 'complete') {
    onLoad();
  } else {
    window.addEventListener('load', onLoad, { once: true });
  }
  schedule(false);
  return stop;
}
