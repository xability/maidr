import type { Rgb } from '@type/color';
import { Color } from './color';
import { Constant } from './constant';
import { SELECTOR_CONTRACT_URL } from './selectors';

/**
 * Edge positions for SVG bounding box calculations.
 */
export type Edge = 'top' | 'bottom' | 'left' | 'right';

/**
 * Somewhere a chart's selectors are matched: the chart's own element, a layer
 * it draws outside that element, or the whole page.
 */
export type QueryRoot = Element | Document;

/**
 * One line to draw along one edge of one element's bounding box.
 */
export interface LineRequest {
  /** The element to measure and draw along. */
  readonly box: SVGElement;
  /** Which of its edges the line runs along. */
  readonly edge: Edge;
}

/**
 * One whisker to draw between a cap and the box it belongs to.
 */
export interface WhiskerRequest {
  /** The whisker's end. */
  readonly cap: SVGElement;
  /** The box the whisker joins, and the element it is inserted beside. */
  readonly body: SVGElement;
  /** Whether the box stands upright, so the whisker does too. */
  readonly vertical: boolean;
}

/** What one anchor was measured to be, read once and reused. */
interface Measured {
  readonly bBox: DOMRect;
  readonly stroke: string;
  readonly strokeWidth: string;
}

/**
 * Abstract utility class for SVG element manipulation, conversion, and highlighting operations.
 */
export abstract class Svg {
  /**
   * The vertices of a path `d` attribute, in the path's own user units.
   *
   * Shared by the line family, which places a marker on each vertex, and the
   * scatter, which centres an inline marker on the box they span.
   */
  public static pathVertices(pathD: string): Array<{ x: number; y: number }> {
    return pathVertices(pathD);
  }

  private constructor() { /* Prevent instantiation */ }

  /**
   * SVG namespace URI for creating SVG elements.
   */
  private static SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  /**
   * Attribute stamped on every element MAIDR creates (hidden clones, markers,
   * overlay shapes). Distinguishes MAIDR-owned elements from the chart's own
   * live geometry so disposal can remove the former without deleting the latter.
   */
  private static readonly OWNED_ATTRIBUTE = 'data-maidr-owned';

  /**
   * Marks an element as created (and therefore owned) by MAIDR.
   * Public so trace code that clones or synthesizes highlight elements
   * outside this utility can participate in ownership-aware disposal.
   * @param element - The element to mark
   * @returns The same element, for chaining
   */
  public static markOwned<T extends SVGElement>(element: T): T {
    element.setAttribute(this.OWNED_ATTRIBUTE, 'true');
    return element;
  }

  /**
   * Returns true if the element was created by MAIDR (safe to remove on
   * disposal). Original chart elements referenced for in-place highlighting
   * are not owned and must never be removed.
   * @param element - The element to check
   */
  public static isOwned(element: Element): boolean {
    return element.hasAttribute(this.OWNED_ATTRIBUTE);
  }

  /**
   * Converts an SVG element to a Base64-encoded JPEG data URL.
   * @param svg - The SVG element to convert
   * @returns A promise resolving to the Base64 data URL, or empty string on error
   */
  public static async toBase64(svg: HTMLElement): Promise<string> {
    try {
      // Serialize and optimize SVG
      const svgString = new XMLSerializer()
        .serializeToString(svg)
        .replace(/>\s+</g, '> <') // Safer whitespace handling
        .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
        .trim();

      // Create SVG data URL with proper encoding
      const encodedSVG = encodeURIComponent(svgString)
        .replace(/'/g, '%27')
        .replace(/"/g, '%22');
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodedSVG}`;

      // Create and load image
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load SVG image'));
        img.src = svgDataUrl;
      });

      // Create canvas with proper scaling
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = [img.naturalWidth, img.naturalHeight];

      // Draw to canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Error converting SVG to Base 64: Canvas context unavailable');
        return '';
      }

      // Convert to JPEG with quality setting
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch (error) {
      console.error('Error converting SVG to Base 64:', error instanceof Error ? error.message : error);
      return '';
    }
  }

  /**
   * Reports whether a value can be handed to `querySelector`/`querySelectorAll`.
   *
   * Selectors reach MAIDR through parsed JSON and are cast to `string` at the
   * call site, so the declared type gives no runtime protection. A producer
   * that resolves no elements for a layer emits `[]`, which is truthy — it
   * passes every `if (!selector)` guard in the model layer and only fails once
   * the DOM coerces it to `''` and throws `SyntaxError`. That exception escapes
   * figure construction, so one unresolvable layer leaves the whole figure
   * inert. Treating an unusable query as "matches nothing" keeps the failure
   * local: that layer loses its highlight, every other layer still works.
   *
   * @param query - The value supplied as a CSS selector
   * @returns True when the value is a non-empty selector string
   */
  private static isUsableSelector(query: unknown): query is string {
    return typeof query === 'string' && query.trim() !== '';
  }

  /**
   * Where the chart whose model is being built is drawn, or null outside
   * {@link withQueryRoots}.
   */
  private static queryRoots: readonly QueryRoot[] | null = null;

  /**
   * Builds a chart's model with its selectors resolved inside the chart.
   *
   * Every selector a model reads is looked up while `new Figure()` runs, so
   * the chart's roots are set for that call rather than threaded through
   * every trace constructor, and the model stays free of the DOM. Two charts
   * whose producer gave them the same ids, or Plotly charts whose selectors
   * name no chart at all, each find their own marks this way instead of the
   * first chart's.
   *
   * @param roots - The chart's own element, and any layer it draws outside it
   * @param build - Builds the model
   * @returns What `build` returned
   */
  public static withQueryRoots<R>(roots: readonly QueryRoot[], build: () => R): R {
    const previous = this.queryRoots;
    this.queryRoots = roots;
    try {
      return build();
    } finally {
      this.queryRoots = previous;
    }
  }

  /**
   * The elements a selector matches, in document order.
   *
   * Inside `roots` when anything there matches. The selector is still matched
   * against the whole document, so a part naming an ancestor of the chart --
   * `#vl-1 svg rect`, `[id="svg-id"] path` -- matches as before. When nothing
   * inside matches, the rest of the page is searched, leaving out what lies
   * inside another chart, and the console says so once per selector: a chart
   * whose marks sit outside its own element reads them as it always did.
   *
   * @param query - A usable CSS selector
   * @param roots - Where the chart is drawn; null, the default outside
   *   {@link withQueryRoots}, searches the whole page
   * @returns The matches
   */
  public static queryAll<T extends Element>(
    query: string,
    roots: readonly QueryRoot[] | null = this.queryRoots,
  ): T[] {
    if (roots === null) {
      return Array.from(document.querySelectorAll<T>(query));
    }
    const ordered = inDocumentOrder(roots);
    const inside = ordered.flatMap(root => Array.from(root.querySelectorAll<T>(query)));
    return inside.length > 0 ? inside : this.queryOutside<T>(query, ordered);
  }

  /**
   * The first element {@link queryAll} would return, without collecting the
   * rest.
   *
   * @param query - A usable CSS selector
   * @returns The first match, or null
   */
  private static queryFirst<T extends Element>(query: string): T | null {
    const roots = this.queryRoots;
    if (roots === null) {
      return document.querySelector<T>(query);
    }
    const ordered = inDocumentOrder(roots);
    for (const root of ordered) {
      const found = root.querySelector<T>(query);
      if (found !== null) {
        return found;
      }
    }
    return this.queryOutside<T>(query, ordered)[0] ?? null;
  }

  /**
   * The matches of a selector outside a chart that has none of its own,
   * leaving out every element inside another chart.
   *
   * @param query - A usable CSS selector
   * @param roots - Where the chart is drawn
   * @returns The matches
   */
  private static queryOutside<T extends Element>(query: string, roots: readonly QueryRoot[]): T[] {
    const found = Array
      .from(document.querySelectorAll<T>(query))
      .filter(element => !insideAnotherChart(element, roots));
    if (found.length > 0) {
      warnResolvedOutside(query);
    }
    return found;
  }

  /**
   * Selects all SVG elements matching a query and optionally clones them.
   * @template T - The type of SVG element to select
   * @param query - CSS selector string to query elements
   * @param shouldClone - Whether to clone elements and insert them as hidden copies (default: true)
   * @returns Array of selected (or cloned) SVG elements, empty when the query is not a usable selector
   */
  public static selectAllElements<T extends SVGElement>(query: string, shouldClone: boolean = true): T[] {
    if (!this.isUsableSelector(query)) {
      return [];
    }

    return this.queryAll<T>(query)
      .map((element) => {
        if (!shouldClone) {
          return element;
        }

        const clone = element.cloneNode(true) as T;
        clone.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
        this.markOwned(clone);
        element.insertAdjacentElement(Constant.AFTER_END, clone);
        return clone;
      });
  }

  /**
   * Selects a single SVG element matching a query and optionally clones it.
   * @template T - The type of SVG element to select
   * @param query - CSS selector string to query the element
   * @param shouldClone - Whether to clone the element and insert it as a hidden copy (default: true)
   * @returns The selected (or cloned) SVG element, or null when nothing matches or the query is not a usable selector
   */
  public static selectElement<T extends SVGElement>(query: string, shouldClone: boolean = true): T | null {
    if (!this.isUsableSelector(query)) {
      return null;
    }

    const element = this.queryFirst<T>(query);
    if (!shouldClone) {
      return element;
    }

    if (!element) {
      return null;
    }

    return this.cloneHidden(element);
  }

  /**
   * Clones an element, hides the copy, and inserts it straight after the
   * original.
   *
   * This is the side effect {@link selectElement} performs once it has found
   * its element, split out so a caller can do the finding first. Resolving a
   * positional* selector -- `:nth-child(N)` and friends -- while earlier
   * clones are already in the DOM counts siblings the chart never drew, and
   * answers with the clone of an earlier element; a caller with a list of such
   * selectors has to look them all up before inserting anything (#1004).
   *
   * @param element - The live element to stand a highlight copy beside
   * @returns The inserted clone
   */
  public static cloneHidden<T extends SVGElement>(element: T): T {
    const clone = this.markOwned(element.cloneNode(true) as T);
    clone.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
    element.insertAdjacentElement(Constant.AFTER_END, clone);
    return clone;
  }

  /**
   * Select the Nth element matching a query, in document order.
   *
   * Useful when a single CSS selector matches multiple sibling elements
   * (e.g. multi-series Vega-Lite line charts where each series renders as
   * a separate `<g class="mark-line role-mark layer_0_marks">` group, all
   * with the same class). CSS `:nth-child(N)` cannot address the Nth
   * matching group when classes differ; this helper does it via JS.
   *
   * Always returns the live DOM element (no cloning side-effects), since
   * the indexed-selection use case is for resolving live DOM nodes that
   * downstream code (highlight pipeline, etc.) operates on directly.
   *
   * @template T - The type of SVG element to select
   * @param query - CSS selector string
   * @param n - Zero-based index into the query results
   * @returns The Nth matching element, or null if no Nth match exists or the query is not a usable selector
   */
  public static selectNthElement<T extends SVGElement>(
    query: string,
    n: number,
  ): T | null {
    if (!this.isUsableSelector(query)) {
      return null;
    }

    return this.queryAll<T>(query)[n] ?? null;
  }

  /**
   * Creates an empty, hidden, transparent SVG element of the specified type.
   * @param type - The SVG element type to create (default: 'rect')
   * @returns The newly created SVG element
   */
  public static createEmptyElement(type: string = 'rect'): SVGElement {
    const element = document.createElementNS(this.SVG_NAMESPACE, type) as SVGElement;
    element.setAttribute(Constant.FILL, Constant.TRANSPARENT);
    element.setAttribute(Constant.STROKE, Constant.TRANSPARENT);
    element.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
    return this.markOwned(element);
  }

  /**
   * Creates one circle element per centre, styled to match the parent
   * element's stroke or fill.
   *
   * A whole series at once rather than a point at a time, because the two
   * expensive parts of the job are per-series rather than per-point: the
   * paint is one computed style for a line all of whose markers share it,
   * and the insertion is one fragment. Reading a style back after inserting
   * an element is what forces the browser to recalculate it, so a loop
   * alternating the two paid a recalculation per point of every line, at
   * construction and again on every live-data rebuild.
   *
   * @param centres - Where to put each circle, in order
   * @param parent - The SVG element to inherit styling from and sit beside
   * @returns The circles, in the order the centres were given
   */
  public static createCircleElements(
    centres: readonly { cx: string | number; cy: string | number }[],
    parent: SVGElement,
  ): SVGElement[] {
    const style = window.getComputedStyle(parent);
    const color = style.stroke || style.fill;
    const strokeWidth = style.strokeWidth || '2';
    const radius = Number.parseFloat(strokeWidth) * 2;

    const fragment = document.createDocumentFragment();
    const elements = centres.map(({ cx, cy }) => {
      const element = document.createElementNS(this.SVG_NAMESPACE, Constant.CIRCLE) as SVGElement;

      element.setAttribute(Constant.CIRCLE_X, String(cx));
      element.setAttribute(Constant.CIRCLE_Y, String(cy));
      element.setAttribute(Constant.RADIUS, String(radius));
      element.setAttribute(Constant.FILL, color);
      element.setAttribute(Constant.STROKE, color);
      element.setAttribute(Constant.STROKE_WIDTH, strokeWidth);
      element.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
      this.markOwned(element);
      fragment.appendChild(element);
      return element;
    });

    parent.parentElement?.appendChild(fragment);
    return elements;
  }

  /**
   * Minimum span (in SVG user units) used when getBBox() returns a
   * zero-width or zero-height bounding box — e.g. a vertical `<path>`
   * line drawn for the IQ range inside a violin plot.
   */
  private static readonly MIN_LINE_SPAN = 10;

  /**
   * Builds one line per request, each along one edge of one element's
   * bounding box, and returns them **detached**.
   *
   * A whole batch at once rather than a line at a time, for the reason given
   * on {@link createCircleElements}: measuring an element after inserting a
   * node beside it is what forces the browser to lay the chart out again, and
   * a loop that alternated the two paid a layout per line. Reading every
   * anchor first and building from the numbers costs one layout for the batch
   * however many lines it holds -- and a candlestick or a box plot builds two
   * per candle or per box, at construction and again on every live-data
   * rebuild.
   *
   * Building is split from inserting because *where* a line lands among its
   * siblings is behaviour, not bookkeeping: an anchor that is also the
   * original of a hidden clone pairs with that clone by
   * `previousElementSibling`, so a line inserted between them changes which
   * elements a trace reports as its originals and therefore what a
   * high-contrast reader is shown. The caller inserts with
   * {@link insertDerived}, at the point in its own writes where the line
   * belongs.
   *
   * Each anchor is measured and styled once even when several lines are drawn
   * along it: inserting a hidden sibling does not move the anchor, so the
   * second read only ever returned what the first did.
   *
   * When a bounding box has zero width (vertical path) or zero height
   * (horizontal path), a minimum span is used so the resulting line is
   * visible.
   *
   * @param requests - The lines to draw, in the order they should be made
   * @returns The lines, index-aligned with the requests, not yet in the document
   */
  public static buildLineElements(requests: readonly LineRequest[]): SVGElement[] {
    if (requests.length === 0) {
      return [];
    }

    // READ. Every measurement the batch needs, before anything is inserted.
    const measured = new Map<SVGElement, Measured>();
    for (const { box } of requests) {
      if (measured.has(box)) {
        continue;
      }
      const bBox = (box as SVGGraphicsElement).getBBox();
      const style = window.getComputedStyle(box);
      measured.set(box, {
        bBox,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth || '2',
      });
    }

    // BUILD. Arithmetic only; nothing enters the document yet.
    const lines = requests.map(({ box, edge }) => {
      const { bBox, stroke, strokeWidth } = measured.get(box)!;
      const [x1, y1, x2, y2] = this.edgeOf(bBox, edge);

      const line = document.createElementNS(this.SVG_NAMESPACE, Constant.LINE) as SVGElement;
      line.setAttribute(Constant.X1, String(x1));
      line.setAttribute(Constant.Y1, String(y1));
      line.setAttribute(Constant.X2, String(x2));
      line.setAttribute(Constant.Y2, String(y2));
      line.setAttribute(Constant.STROKE, stroke);
      line.setAttribute(Constant.STROKE_WIDTH, strokeWidth);
      line.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
      return this.markOwned(line);
    });

    return lines;
  }

  /**
   * Where one edge of a measured box runs.
   *
   * A zero-width or zero-height box -- a vertical or horizontal `<path>`, as
   * a violin plot draws its IQ range -- is given {@link MIN_LINE_SPAN} along
   * the degenerate axis so the edge is still a visible line rather than a
   * point.
   *
   * @param bBox - The measured box
   * @param edge - Which edge
   * @returns The line's `[x1, y1, x2, y2]`
   */
  private static edgeOf(bBox: DOMRect, edge: Edge): [number, number, number, number] {
    const effectiveWidth = bBox.width || this.MIN_LINE_SPAN;
    const effectiveHeight = bBox.height || this.MIN_LINE_SPAN;
    const cx = bBox.x + bBox.width / 2;
    const cy = bBox.y + bBox.height / 2;

    switch (edge) {
      case 'top':
        return bBox.width === 0
          ? [cx - effectiveWidth / 2, bBox.y, cx + effectiveWidth / 2, bBox.y]
          : [bBox.x, bBox.y, bBox.x + bBox.width, bBox.y];
      case 'bottom':
        return bBox.width === 0
          ? [cx - effectiveWidth / 2, bBox.y + bBox.height, cx + effectiveWidth / 2, bBox.y + bBox.height]
          : [bBox.x, bBox.y + bBox.height, bBox.x + bBox.width, bBox.y + bBox.height];
      case 'left':
        return bBox.height === 0
          ? [bBox.x, cy - effectiveHeight / 2, bBox.x, cy + effectiveHeight / 2]
          : [bBox.x, bBox.y, bBox.x, bBox.y + bBox.height];
      case 'right':
        return bBox.height === 0
          ? [bBox.x + bBox.width, cy - effectiveHeight / 2, bBox.x + bBox.width, cy + effectiveHeight / 2]
          : [bBox.x + bBox.width, bBox.y, bBox.x + bBox.width, bBox.y + bBox.height];
    }
  }

  /**
   * Puts derived nodes into the document directly after the element they were
   * derived from, one at a time and in the order they were built.
   *
   * `insertAdjacentElement(AFTER_END, ...)` puts each node straight after the
   * anchor, so building `a` then `b` and inserting both leaves `[anchor, b,
   * a]`. That reversal is the child order every renderer, highlight and
   * high-contrast pass has always seen, so it is reproduced exactly rather
   * than tidied: the caller passes the nodes in the order it built them.
   *
   * Where the caller makes this call matters as much as the order within it.
   * A node inserted after an anchor that is itself the original of a hidden
   * clone lands between the two, and `AbstractTrace.getAllOriginalElements`
   * pairs a clone to its original by `previousElementSibling`; inserting
   * earlier or later than the chart's own clones therefore changes which
   * elements `HighContrastService` recolours. Callers insert at the point
   * their one-at-a-time predecessor did.
   *
   * An anchor with no parent inserts nothing, exactly as
   * `insertAdjacentElement` does.
   *
   * @param anchor - The element the nodes were derived from and sit beside
   * @param nodes - The nodes, in the order they were built; nulls are skipped
   */
  public static insertDerived(
    anchor: SVGElement,
    ...nodes: readonly (SVGElement | null)[]
  ): void {
    for (const node of nodes) {
      if (node !== null) {
        anchor.insertAdjacentElement(Constant.AFTER_END, node);
      }
    }
  }

  /**
   * Draws the whiskers between box plots' caps and their boxes.
   *
   * A box plot's selectors name the caps and the box, and a highlight only
   * ever needs those. A renderer showing the chart's shape needs the whisker
   * between them as well, or a box arrives as a rectangle with two detached
   * dashes floating beyond it. The whisker runs from the cap's centre to the
   * nearer edge of the box, and it is hidden: it is geometry for a renderer
   * to read, not a mark for the chart to show.
   *
   * A whole batch at once for the reason given on
   * {@link buildLineElements}: one box plot's whiskers used to be measured
   * after the previous one's had been inserted, so every box cost the browser
   * two more layouts. The same element is measured once however many whiskers
   * touch it -- a box and both its caps were read four times per box. The
   * whiskers come back detached, for the caller to insert with
   * {@link insertDerived} where its one-at-a-time predecessor did.
   *
   * @param requests - The whiskers to draw, in the order they should be made
   * @returns One entry per request, index-aligned and not yet in the document:
   *   the hidden line, or null when the cap and the box do not sit apart along
   *   the box's axis, or when the document cannot measure them
   */
  public static buildWhiskerElements(
    requests: readonly WhiskerRequest[],
  ): (SVGElement | null)[] {
    if (requests.length === 0) {
      return [];
    }

    // READ. `getBBox` throws on an element the document cannot measure, and
    // that stays a per-request failure: null for the whisker that asked, and
    // nothing built or inserted for it.
    const measured = new Map<SVGElement, DOMRect | null>();
    const measure = (element: SVGElement): DOMRect | null => {
      if (measured.has(element)) {
        return measured.get(element)!;
      }
      let bBox: DOMRect | null;
      try {
        bBox = (element as SVGGraphicsElement).getBBox();
      } catch {
        bBox = null;
      }
      measured.set(element, bBox);
      return bBox;
    };
    for (const { cap, body } of requests) {
      measure(cap);
      measure(body);
    }

    // BUILD. Arithmetic only; nothing enters the document yet.
    const whiskers = requests.map(({ cap, body, vertical }) => {
      const capBox = measured.get(cap)!;
      const bodyBox = measured.get(body)!;
      if (capBox === null || bodyBox === null) {
        return null;
      }

      const cx = capBox.x + capBox.width / 2;
      const cy = capBox.y + capBox.height / 2;
      let x2: number;
      let y2: number;
      if (vertical) {
        if (cy >= bodyBox.y && cy <= bodyBox.y + bodyBox.height) {
          return null;
        }
        x2 = cx;
        y2 = cy < bodyBox.y ? bodyBox.y : bodyBox.y + bodyBox.height;
      } else {
        if (cx >= bodyBox.x && cx <= bodyBox.x + bodyBox.width) {
          return null;
        }
        x2 = cx < bodyBox.x ? bodyBox.x : bodyBox.x + bodyBox.width;
        y2 = cy;
      }

      const line = document.createElementNS(this.SVG_NAMESPACE, Constant.LINE) as SVGElement;
      line.setAttribute(Constant.X1, String(cx));
      line.setAttribute(Constant.Y1, String(cy));
      line.setAttribute(Constant.X2, String(x2));
      line.setAttribute(Constant.Y2, String(y2));
      line.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
      return this.markOwned(line);
    });

    return whiskers;
  }

  /**
   * Minimum opacity value for fill to be considered visible.
   */
  private static readonly MIN_VISIBLE_FILL_OPACITY = 0.01;
  /**
   * Minimum opacity value for stroke to be considered visible.
   */
  private static readonly MIN_VISIBLE_STROKE_OPACITY = 0.01;
  /**
   * Amount to increase stroke width for highlighting line elements, and the
   * shapes a highlighted group is outlined through.
   */
  private static readonly STROKE_WIDTH_HIGHLIGHT_INCREASE = 2;
  /**
   * The shapes a highlighted group is outlined through.
   */
  private static readonly HIGHLIGHT_SHAPES = 'rect, path, circle, ellipse, polygon, line, polyline';
  /**
   * The contrast a label must reach on a highlight under it: WCAG AA's for
   * text.
   */
  private static readonly LABEL_CONTRAST_RATIO = 4.5;

  /**
   * Adjusts opacity values to ensure visibility, returning '1' if below threshold.
   * @param value - The opacity value string to adjust
   * @param minThreshold - The minimum threshold for visibility
   * @returns Adjusted opacity value as a string
   */
  private static getAdjustedOpacity(value: string | null, minThreshold: number): string {
    const parsed = value ? Number.parseFloat(value) : Number.NaN;
    if (!Number.isNaN(parsed) && parsed > minThreshold) {
      return parsed.toString();
    }
    return '1';
  }

  /**
   * Creates a highlighted clone of an SVG element with enhanced visibility.
   *
   * When the element is too small to see (see {@link isTooSmallToSee}), a
   * visible ``<circle>`` is created at its centre instead: a copy of it would
   * be as invisible as it is.
   *
   * A group that holds shapes, as a Mermaid or Graphviz node, edge or cluster
   * does, is outlined through those shapes instead of painted whole (see
   * {@link outlineShapes}).
   *
   * A line, a polyline, and a path drawn by its stroke alone (see
   * {@link isDrawnByStroke}) are drawn as lines: stroked in the highlight
   * colour, wider than drawn, and filled only where the chart fills them.
   *
   * @param element - The SVG element to highlight
   * @param fallbackColor - Color to use if original color cannot be determined
   * @param options - How the colour is chosen
   * @param options.useColorAsIs - Draw a light mark in `fallbackColor` too,
   *   rather than in a darker shade of its own colour. In high contrast every
   *   mark is painted from the reader's palette, often its light colour on a
   *   dark page, where a darker shade of it is only a dimmer copy of the
   *   labels around it.
   * @returns The highlighted clone element
   */
  public static createHighlightElement(
    element: SVGElement,
    fallbackColor: string,
    options: { useColorAsIs?: boolean } = {},
  ): SVGElement {
    // A mark too small to see gets a circle marker instead of a copy.
    try {
      const bbox = (element as SVGGraphicsElement).getBBox();
      if (this.isTooSmallToSee(element, bbox) && this.isRendered(element)) {
        const style = window.getComputedStyle(element);
        const strokeWidth = Number.parseFloat(style.strokeWidth || '2');
        const radius = Math.max(strokeWidth * 1.5, 4);
        const circle = document.createElementNS(this.SVG_NAMESPACE, 'circle') as SVGElement;
        circle.setAttribute('cx', String(bbox.x + bbox.width / 2));
        circle.setAttribute('cy', String(bbox.y + bbox.height / 2));
        circle.setAttribute('r', String(radius));
        circle.setAttribute(Constant.FILL, fallbackColor);
        circle.setAttribute(Constant.STROKE, fallbackColor);
        circle.setAttribute(Constant.STROKE_WIDTH, '2');
        circle.setAttribute(Constant.VISIBILITY, Constant.VISIBLE);
        this.markOwned(circle);
        element.insertAdjacentElement(Constant.AFTER_END, circle);
        return circle;
      }
    } catch {
      // getBBox may fail for elements not in the DOM; fall through to normal path.
    }

    const clone = this.markOwned(element.cloneNode(true) as SVGElement);
    const computed = window.getComputedStyle(element);
    const fillOpacity = computed.getPropertyValue('fill-opacity');
    const strokeOpacity = computed.getPropertyValue('stroke-opacity');
    clone.style.fillOpacity = this.getAdjustedOpacity(fillOpacity, this.MIN_VISIBLE_FILL_OPACITY);
    clone.style.strokeOpacity = this.getAdjustedOpacity(strokeOpacity, this.MIN_VISIBLE_STROKE_OPACITY);
    clone.setAttribute(Constant.VISIBILITY, Constant.VISIBLE);

    if (this.outlineShapes(element, clone, fallbackColor)) {
      // Last in its parent, so the marks drawn after the group -- the leaves
      // a Graphviz patchwork tiles over its branch -- cannot cover the
      // outline. Its shapes are unfilled, so the group shows through it, and
      // it takes no pointer events from what lies beneath.
      clone.style.pointerEvents = 'none';
      element.parentNode?.appendChild(clone);
      return clone;
    }

    const tag = element.tagName.toLowerCase();
    const drawnByStroke = this.isDrawnByStroke(element, computed);
    const isLineElement = tag === Constant.POLYLINE || tag === Constant.LINE || drawnByStroke;
    // A mark drawn by its stroke alone is all stroke, and its copy is drawn
    // opaque: a Recharts sankey ribbon, stroked at 20%, was highlighted as a
    // slightly deeper tint of the same pale colour, at 1.2:1 against the
    // ribbons beside it. A filled mark keeps its opacity, so that the marks a
    // translucent point or bar is drawn over still show through its copy.
    if (isLineElement) {
      clone.style.strokeOpacity = '1';
    }
    const originalColor = isLineElement
      ? computed.getPropertyValue(Constant.STROKE)
      : computed.getPropertyValue(Constant.FILL);
    const color = options.useColorAsIs
      ? fallbackColor
      : this.getHighlightColor(originalColor, fallbackColor);
    // A filled mark keeps the edge it draws in a colour of its own, a pie
    // slice's black or a gantt task's border, so a pale fill keeps its
    // boundary. Set outright: the clone takes a new id, and a rule naming the
    // mark's id would no longer reach it.
    const stroke = !isLineElement && this.hasOwnEdge(computed)
      ? computed.getPropertyValue(Constant.STROKE)
      : color;
    // A line is filled only where the chart fills it. A fill on an unfilled
    // line covers the region between the line and the chord joining its ends,
    // which the chart never drew.
    const fill = isLineElement
      && (drawnByStroke || !this.isPainted(computed.fill, computed.fillOpacity))
      ? 'none'
      : color;

    clone.setAttribute(Constant.STROKE, stroke);
    clone.setAttribute(Constant.FILL, fill);
    clone.style.fill = fill;
    clone.style.stroke = stroke;

    if (isLineElement) {
      // Read the width from the original, which is in the document. The clone
      // is still detached here, and a detached element resolves no computed
      // style, so reading it there would always fall through to the increment.
      const strokeWidth = computed.getPropertyValue(Constant.STROKE_WIDTH);
      const match = strokeWidth.match(/^([0-9.]+)([a-z%]*)$/i);
      let width: string;
      if (match) {
        const value = Number.parseFloat(match[1]);
        const unit = match[2] || '';
        width = `${value + this.STROKE_WIDTH_HIGHLIGHT_INCREASE}${unit}`;
      } else {
        const parsed = Number.parseFloat(strokeWidth);
        const value = Number.isNaN(parsed)
          ? this.STROKE_WIDTH_HIGHLIGHT_INCREASE
          : parsed + this.STROKE_WIDTH_HIGHLIGHT_INCREASE;
        width = `${value}`;
      }
      // Inline as well: a stylesheet rule, such as Mermaid's
      // `.messageLine0 { stroke-width: 1.5px }`, beats the attribute, and
      // kept the line as thin as it was drawn.
      clone.setAttribute(Constant.STROKE_WIDTH, width);
      clone.style.strokeWidth = width;
    }

    element.insertAdjacentElement(Constant.AFTER_END, clone);
    return clone;
  }

  /**
   * The shapes SVG draws nothing of, fill or stroke, once their width or
   * height is zero.
   */
  private static readonly AREA_SHAPES: ReadonlySet<string> = new Set(['rect', 'circle', 'ellipse']);

  /**
   * The size on the page, in CSS pixels, under which a mark that is that
   * small both ways is too small to see.
   */
  private static readonly MIN_VISIBLE_PX = 1;

  /**
   * Whether a mark is too small to see, so that a copy of it would be too.
   *
   * A point drawn as a zero-length path, such as a violin's median, has no
   * box at all. A mark under a pixel both ways draws a speck at most: a
   * candle's upper wick 0.04 price units long was a tenth of a pixel, and its
   * copy showed nothing, while the zero-length wick of the same candle got a
   * marker. And a rect, circle or ellipse with no width or no height is not
   * drawn at all, stroke included: a spine plot's empty tile, 52 px wide and
   * 0 high, was copied as an invisible rect.
   *
   * @param element - The mark, in the document
   * @param bbox - Its box, in its own user units
   * @returns True when a marker should stand in for the mark
   */
  private static isTooSmallToSee(element: SVGElement, bbox: DOMRect): boolean {
    if (bbox.width === 0 && bbox.height === 0) {
      return true;
    }
    if (this.AREA_SHAPES.has(element.tagName.toLowerCase()) && (bbox.width === 0 || bbox.height === 0)) {
      return true;
    }
    const box = element.getBoundingClientRect();
    return box.width < this.MIN_VISIBLE_PX && box.height < this.MIN_VISIBLE_PX;
  }

  /**
   * Whether a mark is drawn at all: neither it nor anything it is drawn in is
   * `display: none`.
   *
   * A mark that is not drawn measures as nothing -- an empty box on the page,
   * and `getBBox` reporting zeros or throwing -- so it would pass for one too
   * small to see, and the marker standing in for it would be drawn, visible,
   * at that empty box. Its copy is not drawn either, as it never was.
   *
   * @param element - The mark, in the document
   * @returns False when it or an element it is in has `display: none`
   */
  private static isRendered(element: Element): boolean {
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      if (window.getComputedStyle(node).display === 'none') {
        return false;
      }
    }
    return true;
  }

  /**
   * Outlines the shapes inside a highlighted group in the highlight colour.
   *
   * A group's own fill and stroke reach a child only by inheritance, and lose
   * to any paint the child declares: Graphviz writes `stroke="black"` on every
   * polygon and path, Mermaid styles `.node rect` from its stylesheet, and C4
   * inline with `!important`. Painting the group left its shapes as drawn, so
   * a node, an edge or a cluster showed its label in the highlight colour at
   * best, and nothing at all at worst. Each shape is stroked here instead,
   * wider than drawn, as `!important` inline style, the one declaration a
   * stylesheet's `!important` rule cannot beat; and left unfilled, so the
   * group shows through. Text keeps its own colour, and the arrowheads a
   * shape's markers draw are left to the shape under the outline: a marker
   * is scaled by the width of the line it is on, so the outline's copy drew
   * the arrowhead larger, in its own paint, over the line it outlined.
   *
   * The colour is not derived from the group, whose fill is only what it
   * inherited.
   *
   * A shape drawn with no edge of its own, such as a Mermaid architecture
   * service's tile, is outlined twice as wide as the increase. Half of a
   * stroke falls inside the shape, so at the increase alone one unit showed
   * outside the tile, a third of the outline other diagrams' nodes get. And
   * an `<svg>` nested in the group, such as the tile's icon, is let draw
   * past its box in the copy: like every nested `<svg>` it clips what it
   * holds, and cut the outline's outer half, the half on the page, away.
   *
   * @param element - The element highlighted, in the document, so its shapes'
   *   styles resolve
   * @param clone - Its deep clone, whose shapes are its own in the same order
   * @param color - The highlight colour
   * @returns Whether any shape was outlined: never for a shape itself, nor for
   *   a group drawing nothing but text, which is painted whole instead
   */
  private static outlineShapes(element: SVGElement, clone: SVGElement, color: string): boolean {
    if (element.matches(this.HIGHLIGHT_SHAPES)) {
      return false;
    }
    const shapes = clone.querySelectorAll<SVGElement>(this.HIGHLIGHT_SHAPES);
    let outlined = false;
    element.querySelectorAll<SVGElement>(this.HIGHLIGHT_SHAPES).forEach((source, at) => {
      const style = window.getComputedStyle(source);
      const stroked = this.isPainted(style.stroke, style.strokeOpacity)
        && Number.parseFloat(style.strokeWidth) !== 0;
      // A shape the chart draws with no paint, such as a hit area, stays
      // invisible rather than growing an outline nobody saw before.
      if (style.display === 'none' || (!stroked && !this.isPainted(style.fill, style.fillOpacity))) {
        return;
      }
      const width = stroked
        ? (Number.parseFloat(style.strokeWidth) || 0) + this.STROKE_WIDTH_HIGHLIGHT_INCREASE
        : 2 * this.STROKE_WIDTH_HIGHLIGHT_INCREASE;
      const shape = shapes[at];
      shape.style.setProperty(Constant.STROKE, color, 'important');
      shape.style.setProperty('stroke-opacity', '1', 'important');
      shape.style.setProperty(Constant.STROKE_WIDTH, `${width}px`, 'important');
      shape.style.setProperty(Constant.FILL, 'none', 'important');
      for (const marker of ['marker-start', 'marker-mid', 'marker-end']) {
        shape.style.setProperty(marker, 'none', 'important');
      }
      outlined = true;
    });
    if (outlined) {
      clone.querySelectorAll<SVGSVGElement>('svg').forEach((nested) => {
        nested.style.setProperty('overflow', 'visible', 'important');
      });
    }
    return outlined;
  }

  /**
   * Copies the labels drawn over a mark its highlight fills, in the colour that
   * reads on the highlight, each just above the label it copies.
   *
   * A label drawn after its mark stays above the highlight, which is inserted
   * just after the mark, but keeps the colour it was given for the mark: a
   * white label on a red gantt task, or on a packet field high contrast
   * painted black, sat on the highlight colour at 2.27:1. Each such label is
   * copied over itself in whichever of `colors` contrasts more with the
   * highlight, where the label itself falls below 4.5:1 on it; the label is
   * left as the chart and high contrast painted it, and the copies go with
   * the highlight. An outline the label draws round its glyphs is drawn in
   * the other of `colors`, so the glyphs stand out from it as they did from
   * the label's own. A label already readable on the highlight is left alone --
   * the dark label on a light mark's darker shade, which stops at 3:1 for it
   * -- and so is everything that is not text over the filled shape: a label
   * beside it or drawn under it, one on a shape drawn over the mark, as a
   * treemap draws its items over their section, the labels of a group, which
   * is outlined and keeps its fill, and text within a line's box.
   *
   * @param element - The mark highlighted, in the document
   * @param highlight - Its highlight, from {@link createHighlightElement}
   * @param colors - The colours a label may take: black and white, or the
   *   reader's high contrast pair
   * @returns The copies, owned by MAIDR, for removing with the highlight
   */
  public static createLabelHighlights(
    element: SVGElement,
    highlight: SVGElement,
    colors: readonly string[],
  ): SVGElement[] {
    const tag = element.tagName.toLowerCase();
    if (tag === Constant.LINE || tag === Constant.POLYLINE || !element.matches(this.HIGHLIGHT_SHAPES)) {
      return [];
    }
    const fill = Color.parse(highlight.style.fill);
    const style = window.getComputedStyle(element);
    const root = this.outermostSvg(element);
    const box = element.getBoundingClientRect();
    if (fill === null || root === null || !this.isPainted(style.fill, style.fillOpacity)
      || box.width <= 0 || box.height <= 0) {
      return [];
    }
    const contrastOn = (color: string): number => {
      const rgb = Color.parse(color);
      return rgb === null ? 0 : Color.getContrastRatio(rgb, fill);
    };
    const best = colors.reduce<string | null>(
      (chosen, color) => (chosen === null || contrastOn(color) > contrastOn(chosen) ? color : chosen),
      null,
    );
    if (best === null) {
      return [];
    }

    // The shapes drawn between the mark and a label, any of which may cover
    // the highlight where the label is. Read only once a label is over the
    // mark, which on most moves none is.
    let shapes: SVGElement[] | null = null;
    const isCovered = (label: SVGElement, x: number, y: number): boolean => {
      shapes ??= Array.from(root.querySelectorAll<SVGElement>(this.HIGHLIGHT_SHAPES));
      return shapes.some(shape =>
        (element.compareDocumentPosition(shape) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        && (shape.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        && this.fillsOver(shape, x, y));
    };

    const labels = Array.from(root.querySelectorAll<SVGElement>('text')).filter((label) => {
      if ((element.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) {
        return false;
      }
      const rect = label.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (rect.width <= 0 || rect.height <= 0
        || x < box.left || x > box.right || y < box.top || y > box.bottom
        || label.closest(`[${this.OWNED_ATTRIBUTE}]`) !== null
        || !this.fillsPoint(element, x, y)) {
        return false;
      }
      const ink = window.getComputedStyle(label);
      const shown = contrastOn(ink.fill);
      return ink.display !== 'none' && ink.visibility !== Constant.HIDDEN
        && shown < this.LABEL_CONTRAST_RATIO && contrastOn(best) > shown
        && !isCovered(label, x, y);
    });

    // The outline a label draws round its glyphs -- Highcharts' text-outline
    // span, or a stroke painted under the text -- is redrawn in the other
    // colour. Left in its own, a white outline round the white glyphs of a
    // copy filled the letters in, and the label was a white smear.
    const outline = this.outlineColor(best, colors);

    return labels.map((label) => {
      const copy = this.markOwned(label.cloneNode(true) as SVGElement);
      for (const node of [copy, ...Array.from(copy.querySelectorAll('[id]'))]) {
        node.removeAttribute('id');
      }
      copy.setAttribute('aria-hidden', 'true');
      copy.style.pointerEvents = 'none';
      // The copy's spans are the label's own, in the same order: a deep
      // clone keeps them so.
      const drawn = [label, ...Array.from(label.querySelectorAll<SVGElement>('tspan, textPath'))];
      [copy, ...Array.from(copy.querySelectorAll<SVGElement>('tspan, textPath'))].forEach((glyphs, at) => {
        glyphs.style.setProperty(Constant.FILL, best, 'important');
        const source = drawn[at];
        if (source !== undefined && this.drawsOutline(source)) {
          glyphs.style.setProperty(Constant.STROKE, outline, 'important');
        }
      });
      label.insertAdjacentElement(Constant.AFTER_END, copy);
      return copy;
    });
  }

  /**
   * The colour a label copy's outline is drawn in: whichever of `colors`
   * contrasts most with its glyphs, or, where none contrasts at all, black
   * round light glyphs and white round dark ones.
   *
   * A reader can set both high contrast colours to the same one, and then
   * the only colour on offer was the glyphs' own: the outline filled the
   * letters in, as Highcharts' white outline did.
   *
   * @param glyphs - The colour the copy's glyphs are drawn in
   * @param colors - The colours a label may take
   * @returns The outline's colour
   */
  private static outlineColor(glyphs: string, colors: readonly string[]): string {
    const other = colors.reduce(
      (chosen, color) => (this.contrastBetween(color, glyphs) > this.contrastBetween(chosen, glyphs) ? color : chosen),
      glyphs,
    );
    if (this.contrastBetween(other, glyphs) > 1) {
      return other;
    }
    return this.contrastBetween(glyphs, '#ffffff') > this.contrastBetween(glyphs, '#000000') ? '#ffffff' : '#000000';
  }

  /**
   * Whether text draws a stroke round its glyphs.
   *
   * The stroke is not parsed as a colour: Chromium reports the white of
   * Highcharts' text outline as `color(srgb 1 1 1)`, which no parser here
   * reads, and an outline read as unpainted was left white.
   *
   * @param text - A text element or span, in the document
   * @returns True for a stroke that is painted and of some width
   */
  private static drawsOutline(text: SVGElement): boolean {
    const ink = window.getComputedStyle(text);
    return ink.stroke !== ''
      && this.isPainted(ink.stroke, ink.strokeOpacity)
      && Number.parseFloat(ink.strokeWidth) !== 0;
  }

  /**
   * The WCAG contrast between two colours.
   * @param a - One colour
   * @param b - The other
   * @returns The ratio, or 0 when either is not a colour
   */
  private static contrastBetween(a: string, b: string): number {
    const first = Color.parse(a);
    const second = Color.parse(b);
    return first === null || second === null ? 0 : Color.getContrastRatio(first, second);
  }

  /**
   * Whether a shape of the chart's own is drawn filled at a point on screen,
   * covering what lies under it there. A shape in definitions -- a clip path,
   * a marker -- draws nothing where it is, and MAIDR's copies are not the
   * chart's.
   * @param shape - The shape
   * @param x - The point's distance from the viewport's left
   * @param y - The point's distance from the viewport's top
   * @returns True when the shape's fill is drawn at the point
   */
  private static fillsOver(shape: SVGElement, x: number, y: number): boolean {
    if (shape.closest(`[${this.OWNED_ATTRIBUTE}], defs, clipPath, mask, marker, pattern, symbol`) !== null) {
      return false;
    }
    const rect = shape.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0
      || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      return false;
    }
    const style = window.getComputedStyle(shape);
    return style.display !== 'none' && style.visibility !== Constant.HIDDEN
      && this.isPainted(style.fill, style.fillOpacity) && this.fillsPoint(shape, x, y);
  }

  /**
   * The `<svg>` an element is drawn in, past any nested inside it.
   * @param element - The element
   * @returns The outermost `<svg>`, or null for an element outside one
   */
  private static outermostSvg(element: SVGElement): SVGSVGElement | null {
    let root = (element as SVGGraphicsElement).ownerSVGElement ?? null;
    while (root?.ownerSVGElement) {
      root = root.ownerSVGElement;
    }
    return root;
  }

  /**
   * Whether a shape fills a point on screen, rather than only its box. Where
   * the browser cannot say, the box is taken for the shape.
   * @param element - The shape
   * @param x - The point's distance from the viewport's left
   * @param y - The point's distance from the viewport's top
   * @returns False only for a point the shape's fill misses
   */
  private static fillsPoint(element: SVGElement, x: number, y: number): boolean {
    const shape = element as SVGGeometryElement;
    if (typeof shape.isPointInFill !== 'function' || typeof shape.getScreenCTM !== 'function') {
      return true;
    }
    const matrix = shape.getScreenCTM();
    if (matrix === null) {
      return true;
    }
    return shape.isPointInFill(new DOMPoint(x, y).matrixTransform(matrix.inverse()));
  }

  /**
   * Whether a path is drawn by its stroke alone, so that only a stroke can
   * highlight it, as a line's does.
   *
   * Two kinds of path are. One whose fill covers nothing, every run of it
   * straight: Plotly draws an error bar as three strokes and leaves its fill
   * at the default black, and its clone, with the fill recoloured and its own
   * stroke kept, was the bar exactly as drawn. And an unfilled path left
   * open, an arc or a line, which a fill closes with a straight chord: a
   * gauge's arc, a donut's ring and a percentile band's median were filled
   * across the hole, or between the line and the chord joining its ends. An
   * unfilled shape that closes on itself, such as a hollow marker, is still
   * filled: its fill is the shape its stroke draws.
   *
   * @param element - The path, in the document
   * @param style - Its computed style
   * @returns False for anything that is not a path, for a path with no
   *   subpath, and for one whose stroke draws nothing
   */
  private static isDrawnByStroke(element: SVGElement, style: CSSStyleDeclaration): boolean {
    if (element.tagName.toLowerCase() !== 'path'
      || !this.isPainted(style.stroke, style.strokeOpacity)
      || Number.parseFloat(style.strokeWidth) === 0) {
      return false;
    }
    const runs = subpathRuns(element.getAttribute(Constant.D) ?? '');
    return runs.length > 0
      && (runs.every(run => !run.bends)
        || (!this.isPainted(style.fill, style.fillOpacity) && runs.some(run => run.bends && !run.closed)));
  }

  /**
   * Whether a filled mark draws a visible edge in a colour other than its fill.
   * @param style - The mark's computed style
   * @returns False for an unfilled mark, an edge drawn in the fill's own
   *   colour, and an edge that draws nothing
   */
  private static hasOwnEdge(style: CSSStyleDeclaration): boolean {
    const fill = style.getPropertyValue(Constant.FILL);
    const stroke = style.getPropertyValue(Constant.STROKE);
    return Color.parse(fill) !== null
      && Color.parse(stroke) !== null
      && this.isPainted(stroke, style.getPropertyValue('stroke-opacity'))
      && Number.parseFloat(style.getPropertyValue(Constant.STROKE_WIDTH)) !== 0
      && !Color.isEqual(stroke, fill);
  }

  /**
   * Whether a computed fill or stroke draws anything.
   * @param paint - The computed paint
   * @param opacity - Its computed opacity
   * @returns False for `none`, a fully transparent colour, or zero opacity
   */
  private static isPainted(paint: string, opacity: string): boolean {
    return paint !== 'none'
      && paint !== Constant.TRANSPARENT
      && Color.parseRgba(paint)?.a !== 0
      && Number.parseFloat(opacity) !== 0;
  }

  /**
   * Determines an appropriate highlight color based on the original color's luminance.
   *
   * A dark mark is drawn in the fallback colour. A light one is drawn in a
   * darker shade of its own colour, at least `HIGHLIGHT_CONTRAST_RATIO`
   * against the mark and so against a white page as well: scaling only the
   * dominant channel, as this did, moved a lavender pie slice by 1.06:1 and
   * a yellow radar point by 1.17:1, since blue and red carry little of a
   * colour's luminance. It stops at that contrast rather than going to
   * black, so a dark label drawn over the mark stays readable on it. A white
   * or light grey mark, which has no hue of its own, is drawn in a shade of
   * the fallback colour instead, to the same contrast.
   *
   * @param originalColor - The original color to base the highlight on
   * @param fallbackColor - Color to use if original cannot be parsed or is dark
   * @returns The computed highlight color string
   */
  private static getHighlightColor(originalColor: string, fallbackColor: string): string {
    const originalRgb = Color.parse(originalColor);
    if (!originalRgb) {
      return fallbackColor;
    }

    const contrastWithWhite = Color.getContrastRatio(originalRgb, Constant.HIGHLIGHT_BASE_COLOR);
    const isLight = contrastWithWhite < Constant.HIGHLIGHT_CONTRAST_RATIO;

    // For dark colors, just use the fallback color
    if (!isLight) {
      return fallbackColor;
    }

    // A white or light grey mark has no hue to keep, and a darker shade of
    // its own colour is a mid grey, the colour of the axes and gridlines
    // around it: a Recharts line's white dot was highlighted grey inside its
    // unchanged ring. A shade of the highlight colour is taken instead.
    const fallbackRgb = Color.parse(fallbackColor);
    const base = fallbackRgb !== null && this.isGrey(originalRgb) ? fallbackRgb : originalRgb;
    return Color.rgbToString(this.darkenToContrast(base, Constant.HIGHLIGHT_CONTRAST_RATIO, originalRgb));
  }

  /**
   * The most a colour's channels may differ for it to count as a grey: a
   * white or a grey a little off true, as `#fafaf5` is. A cut-off, chosen by
   * eye: a pale tint whose channels spread further, as `#f0f0ff`'s do, is
   * read as having a hue, and keeps a darker shade of its own colour.
   */
  private static readonly GREY_CHANNEL_SPREAD = 8;

  /**
   * Whether a colour is a white, a grey or a black, with no hue of its own.
   * @param rgb - The colour
   * @returns True when its channels are all but equal
   */
  private static isGrey(rgb: Rgb): boolean {
    return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) <= this.GREY_CHANNEL_SPREAD;
  }

  /**
   * The lightest shade of a colour that reaches a given contrast against a
   * light colour, which is the colour itself unless another is given.
   *
   * Every channel is scaled by the same factor, so the hue is kept; the
   * factor is found by halving, since once the shade is darker than the
   * light colour the contrast only grows as it falls. Black always reaches
   * the contrast asked against a light colour, so the search always ends on
   * a shade that does.
   *
   * @param rgb - The colour
   * @param ratio - The contrast the shade must reach
   * @param against - The light colour it must reach it against
   * @returns The shade
   */
  private static darkenToContrast(rgb: Rgb, ratio: number, against: Rgb = rgb): Rgb {
    const scale = (factor: number): Rgb => ({
      r: Math.floor(rgb.r * factor),
      g: Math.floor(rgb.g * factor),
      b: Math.floor(rgb.b * factor),
    });
    let low = 0;
    let high = 1;
    for (let step = 0; step < 16; step++) {
      const middle = (low + high) / 2;
      if (Color.getContrastRatio(scale(middle), against) >= ratio) {
        low = middle;
      } else {
        high = middle;
      }
    }
    return scale(low);
  }

  /**
   * Calculates a contrasting color (black or white) based on the element's fill color.
   * @param element - The SVG element to analyze
   * @returns '#000' for light backgrounds, '#fff' for dark backgrounds
   */
  public static getContrastingColorForElement(element: SVGElement): string {
    const fill = window.getComputedStyle(element).fill || 'rgb(255,255,255)';
    const rgb = Color.parse(fill);
    if (!rgb)
      return '#000';
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance > 0.5 ? '#000' : '#fff';
  }

  /**
   * Applies CSS outline styling to highlight a subplot element.
   * @param element - The SVG element to highlight
   * @param color - The color for the outline
   */
  public static setSubplotHighlightCss(element: SVGElement, color: string): void {
    element.style.outline = `4px solid ${color}`;
    element.style.outlineOffset = '3px';
    element.style.borderRadius = '3px';
    element.style.overflow = 'visible';
  }

  /**
   * Removes CSS outline highlighting from a subplot element.
   * @param element - The SVG element to remove highlighting from
   */
  public static removeSubplotHighlightCss(element: SVGElement): void {
    element.style.removeProperty('outline');
    element.style.removeProperty('outline-offset');
    element.style.removeProperty('border-radius');
    element.style.removeProperty('overflow');
  }

  /**
   * Applies SVG stroke highlighting to a subplot with adaptive color based on background.
   * @param group - The SVG group element to highlight
   * @param fallbackColor - Color to use if background color cannot be determined
   * @param figureBgElement - Optional background element to inherit color from
   */
  public static setSubplotHighlightSvgWithAdaptiveColor(group: SVGElement, fallbackColor: string, figureBgElement?: SVGElement): void {
    const bg = group.querySelector('rect, path') as SVGElement | null;
    let originalColor = '';
    if (bg) {
      originalColor = window.getComputedStyle(bg).getPropertyValue('fill');
      if (!originalColor || originalColor === 'none' || originalColor === 'transparent' || originalColor === 'rgba(0, 0, 0, 0)') {
        if (figureBgElement) {
          originalColor = window.getComputedStyle(figureBgElement).getPropertyValue('fill');
        } else {
          originalColor = fallbackColor;
        }
      }
      const highlightColor = this.getHighlightColor(originalColor, fallbackColor);
      // Stash the element's original stroke attributes before overwriting
      // so removeSubplotHighlightSvg can restore them instead of stripping
      // any pre-existing attribute-based border. Guard against re-saving on
      // repeated highlight calls, which would otherwise capture the
      // highlight values as the "original".
      if (!bg.hasAttribute('data-maidr-orig-stroke')) {
        bg.setAttribute('data-maidr-orig-stroke', bg.getAttribute('stroke') ?? '');
        bg.setAttribute('data-maidr-orig-stroke-width', bg.getAttribute('stroke-width') ?? '');
      }
      bg.setAttribute('stroke', highlightColor);
      bg.setAttribute('stroke-width', '4');
    }
  }

  /**
   * Removes SVG stroke highlighting from a subplot element.
   * @param group - The SVG group element to remove highlighting from
   */
  public static removeSubplotHighlightSvg(group: SVGElement): void {
    const bg = group.querySelector('rect, path') as SVGElement | null;
    if (!bg) {
      return;
    }
    // Restore the original stroke attributes saved when the highlight was
    // applied. Only elements we highlighted carry the data- markers; for
    // those, re-apply the saved value if one existed, otherwise remove the
    // attribute we added. Elements we never highlighted are left untouched
    // so their own attribute-based borders survive.
    if (bg.hasAttribute('data-maidr-orig-stroke')) {
      const origStroke = bg.getAttribute('data-maidr-orig-stroke') ?? '';
      if (origStroke === '') {
        bg.removeAttribute('stroke');
      } else {
        bg.setAttribute('stroke', origStroke);
      }
      bg.removeAttribute('data-maidr-orig-stroke');
    }
    if (bg.hasAttribute('data-maidr-orig-stroke-width')) {
      const origStrokeWidth = bg.getAttribute('data-maidr-orig-stroke-width') ?? '';
      if (origStrokeWidth === '') {
        bg.removeAttribute('stroke-width');
      } else {
        bg.setAttribute('stroke-width', origStrokeWidth);
      }
      bg.removeAttribute('data-maidr-orig-stroke-width');
    }
  }
}

// Reading the vertices out of an SVG path's `d` attribute: shared by the line
// family, which places a marker on each vertex, and the scatter, which centres
// an inline marker on the box they span.

/** One vertex of a path, in the path's own user units. */
interface PathVertex {
  x: number;
  y: number;
}

/**
 * Splits a path `d` attribute into commands, each with its argument text.
 *
 * `A`/`a` is listed here but absent from {@link SVG_PATH_ARITY}, so an arc is
 * recognised and then skipped. Both halves matter. It has to be *recognised*
 * because the argument group runs to the next command letter: leaving `A` out
 * of the class would sweep an arc's flags and coordinates into the preceding
 * command's arguments, where they are consumed as further repetitions of that
 * command's arity. Measured on `M 0 0 L 10 10 A 5 5 0 0 1 20 20 L 30 30`,
 * that fabricated three vertices — `(5,5)`, `(0,0)`, `(1,20)` — rather than
 * leaving the arc merely unread.
 *
 * It is then *skipped* because an arc's flag arguments are legally written
 * without separators — `a1 1 0 011 1` is three flags and a coordinate pair —
 * so a plain number scan cannot tell where the endpoint starts. That leaves
 * the current point stale across an arc, which only misplaces a *relative*
 * command that follows one; line-family geometry contains neither.
 */
const SVG_PATH_COMMAND_REGEX = /([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi;

/** One number of a path argument list, including exponent notation. */
const SVG_PATH_NUMBER_REGEX = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

/**
 * How many numbers each path command takes per repetition.
 *
 * A command may carry several repetitions in one argument list — `L1 2 3 4`
 * is two linetos — so the arity is what the argument list is walked in.
 *
 * `Z` and `A` are absent, and an absent entry contributes no vertices: the
 * walk's bound is `i + arity <= args.length`, and `undefined` makes that
 * comparison false at once. `Z` is handled before the lookup because it still
 * moves the pen; `A` is not, for the reason
 * {@link SVG_PATH_COMMAND_REGEX} gives.
 */
const SVG_PATH_ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
};

/**
 * The vertices an SVG path `d` attribute draws.
 *
 * One vertex per drawing command, taken at that command's endpoint — which
 * for a curve is where it lands, not where its control points sit. The path
 * is walked rather than pattern-matched because the endpoint of `H`, `V`,
 * and every relative command is only defined against the current point,
 * which a regex over the whole string cannot know.
 *
 * That is what this used to be, and it left `H`/`V` unread. A staircase is
 * precisely the shape a renderer draws with them, every segment being
 * axis-aligned, so a Plotly step chart parsed to its single `M` and nothing
 * else: measured, `M0,399H246.67V147H493.33V273H740V21` yielded 1 vertex for
 * 4 samples. `LineTrace.reconcilePathCoordinates` then padded with `NaN`, the series
 * was marked failed, and `mapToSvgElements` returned null — correct audio,
 * braille and text, no highlight, and nothing anywhere saying why (#907).
 *
 * `M`, `L` and `C` behave exactly as they did; a cubic still contributes its
 * endpoint alone.
 *
 * @param pathD - The `d` attribute of the rendered path
 * @returns The vertices, in drawing order
 */
function pathVertices(pathD: string): PathVertex[] {
  const coordinates: PathVertex[] = [];
  let x = 0;
  let y = 0;
  // Where the current subpath began, which is where `Z` returns to.
  let startX = 0;
  let startY = 0;

  SVG_PATH_COMMAND_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = SVG_PATH_COMMAND_REGEX.exec(pathD);
  while (match !== null) {
    const command = match[1];
    const absolute = command.toUpperCase();
    const isRelative = command !== absolute;
    const args = (match[2].match(SVG_PATH_NUMBER_REGEX) ?? []).map(Number);
    match = SVG_PATH_COMMAND_REGEX.exec(pathD);

    if (absolute === 'Z') {
      // A closepath draws back to a vertex already recorded, so it moves the
      // pen without adding a point. Emitting one would duplicate the start.
      x = startX;
      y = startY;
      continue;
    }

    const arity = SVG_PATH_ARITY[absolute];
    for (let i = 0; i + arity <= args.length; i += arity) {
      if (absolute === 'H') {
        x = isRelative ? x + args[i] : args[i];
      } else if (absolute === 'V') {
        y = isRelative ? y + args[i] : args[i];
      } else {
        // The endpoint is the last pair of every remaining command; the
        // control points before it are not on the drawn path.
        const endX = args[i + arity - 2];
        const endY = args[i + arity - 1];
        x = isRelative ? x + endX : endX;
        y = isRelative ? y + endY : endY;
      }

      // Only the first pair of a moveto starts a subpath; the repetitions
      // after it are implicit linetos, per the SVG path grammar.
      if (absolute === 'M' && i === 0) {
        startX = x;
        startY = y;
      }
      coordinates.push({ x, y });
    }
  }

  return coordinates;
}

/** One subpath of a path, as its fill sees it. */
interface SubpathRun {
  /** Whether it ends in a closepath, so that its stroke bounds its fill. */
  closed: boolean;
  /**
   * Whether it encloses anything: a curve, an arc, or a vertex off the line
   * through the others. A straight run's fill covers nothing.
   */
  bends: boolean;
}

/**
 * How far a vertex may lie off the line through its subpath, in the path's
 * user units, and still be on it: enough for the rounding of relative
 * commands, and far below anything a fill could show.
 */
const COLLINEAR_TOLERANCE = 1e-6;

/**
 * The subpaths an SVG path `d` attribute draws, each as its fill sees it.
 *
 * Walked as {@link pathVertices} walks it. An arc is known to bend, but its
 * endpoint is not read, for the reason {@link SVG_PATH_COMMAND_REGEX} gives.
 *
 * @param pathD - The `d` attribute of the rendered path
 * @returns One entry per subpath, in drawing order
 */
function subpathRuns(pathD: string): SubpathRun[] {
  const subpaths: (SubpathRun & { points: PathVertex[] })[] = [];
  let drawing: (SubpathRun & { points: PathVertex[] }) | null = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;

  SVG_PATH_COMMAND_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = SVG_PATH_COMMAND_REGEX.exec(pathD);
  while (match !== null) {
    const command = match[1];
    const absolute = command.toUpperCase();
    const isRelative = command !== absolute;
    const args = (match[2].match(SVG_PATH_NUMBER_REGEX) ?? []).map(Number);
    match = SVG_PATH_COMMAND_REGEX.exec(pathD);

    if (absolute === 'Z') {
      if (drawing !== null) {
        drawing.closed = true;
      }
      // A command after a closepath starts a new subpath where the last began.
      drawing = null;
      x = startX;
      y = startY;
      continue;
    }

    if (drawing === null && absolute !== 'M') {
      drawing = { closed: false, bends: false, points: [{ x, y }] };
      subpaths.push(drawing);
    }
    if (absolute === 'A') {
      if (drawing !== null) {
        drawing.bends = true;
      }
      continue;
    }

    const arity = SVG_PATH_ARITY[absolute];
    for (let i = 0; i + arity <= args.length; i += arity) {
      if (absolute === 'H') {
        x = isRelative ? x + args[i] : args[i];
      } else if (absolute === 'V') {
        y = isRelative ? y + args[i] : args[i];
      } else {
        const endX = args[i + arity - 2];
        const endY = args[i + arity - 1];
        x = isRelative ? x + endX : endX;
        y = isRelative ? y + endY : endY;
      }

      if (absolute === 'M' && i === 0) {
        startX = x;
        startY = y;
        drawing = { closed: false, bends: false, points: [{ x, y }] };
        subpaths.push(drawing);
        continue;
      }
      if (drawing !== null) {
        // A curve bends wherever its endpoints are; a lineto only off the line.
        drawing.bends ||= 'CSQT'.includes(absolute);
        drawing.points.push({ x, y });
      }
    }
  }

  return subpaths.map(subpath => ({
    closed: subpath.closed,
    bends: subpath.bends || !isCollinear(subpath.points),
  }));
}

/**
 * Whether points all lie on one straight line.
 *
 * @param points - The points, in any order
 * @returns True for fewer than three distinct points, too
 */
function isCollinear(points: readonly PathVertex[]): boolean {
  if (points.length === 0) {
    return true;
  }
  const [first] = points;
  const far = points.find(point =>
    Math.hypot(point.x - first.x, point.y - first.y) > COLLINEAR_TOLERANCE);
  if (far === undefined) {
    return true;
  }
  const dx = far.x - first.x;
  const dy = far.y - first.y;
  const length = Math.hypot(dx, dy);
  return points.every(point =>
    Math.abs(dx * (point.y - first.y) - dy * (point.x - first.x)) / length <= COLLINEAR_TOLERANCE);
}

/** The element MAIDR wraps every chart it reads in. */
const CHART_ARTICLE_SELECTOR = 'article[id^="maidr-article-"]';

/**
 * Roots in document order, leaving out any one another of them holds, so that
 * the matches of each, one root after another, are in document order too.
 *
 * @param roots - Where a chart is drawn
 * @returns The outermost roots, in document order
 */
function inDocumentOrder(roots: readonly QueryRoot[]): QueryRoot[] {
  const distinct = Array.from(new Set(roots));
  if (distinct.length === 1) {
    return distinct;
  }
  return distinct
    .filter(root => !distinct.some(other => other !== root && other.contains(root)))
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/**
 * The chart an element is drawn in: the article MAIDR wraps it in, or, for
 * the layers Plotly draws over a chart outside that article, the graph div
 * holding one.
 *
 * @param element - Any element on the page
 * @returns The chart's outermost element, or null when it is in none
 */
function chartOf(element: Element): Element | null {
  const article = element.closest(CHART_ARTICLE_SELECTOR);
  if (article !== null) {
    return article;
  }
  const graph = element.closest('.js-plotly-plot');
  return graph?.querySelector(CHART_ARTICLE_SELECTOR) ? graph : null;
}

/**
 * Whether an element belongs to a chart other than the one drawn in `roots`.
 *
 * @param element - A match found outside `roots`
 * @param roots - Where the chart being built is drawn
 * @returns True when the element is inside another chart
 */
function insideAnotherChart(element: Element, roots: readonly QueryRoot[]): boolean {
  const chart = chartOf(element);
  return chart !== null && !roots.some(root => chart.contains(root));
}

/** Selectors already reported as resolved outside their chart. */
const resolvedOutside = new Set<string>();

/**
 * Tells a producer, once per selector, that a selector matched nothing in its
 * chart and was answered from the rest of the page.
 *
 * @param query - The selector
 */
function warnResolvedOutside(query: string): void {
  if (resolvedOutside.has(query)) {
    return;
  }
  resolvedOutside.add(query);
  console.warn(
    `[MAIDR] Selector "${query}" matches nothing inside its chart, so the elements it `
    + 'matches elsewhere on the page were used. Name elements inside the chart. '
    + `See ${SELECTOR_CONTRACT_URL} for how selectors are resolved.`,
  );
}
