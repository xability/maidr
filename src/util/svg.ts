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
   * When the element has a zero-size bounding box (e.g. a single-point
   * ``<path d="M x y">`` used for median markers in violin plots), a
   * visible ``<circle>`` is created at that position instead.
   *
   * A group that holds shapes, as a Mermaid or Graphviz node, edge or cluster
   * does, is outlined through those shapes instead of painted whole (see
   * {@link outlineShapes}).
   *
   * @param element - The SVG element to highlight
   * @param fallbackColor - Color to use if original color cannot be determined
   * @returns The highlighted clone element
   */
  public static createHighlightElement(element: SVGElement, fallbackColor: string): SVGElement {
    // Handle zero-size elements (e.g. single-point <path> for median markers
    // in violin plots). Create a circle marker instead of cloning.
    try {
      const bbox = (element as SVGGraphicsElement).getBBox();
      if (bbox.width === 0 && bbox.height === 0) {
        const style = window.getComputedStyle(element);
        const strokeWidth = Number.parseFloat(style.strokeWidth || '2');
        const radius = Math.max(strokeWidth * 1.5, 4);
        const circle = document.createElementNS(this.SVG_NAMESPACE, 'circle') as SVGElement;
        circle.setAttribute('cx', String(bbox.x));
        circle.setAttribute('cy', String(bbox.y));
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
    const isLineElement = tag === Constant.POLYLINE || tag === Constant.LINE;
    const originalColor = isLineElement
      ? computed.getPropertyValue(Constant.STROKE)
      : computed.getPropertyValue(Constant.FILL);
    const color = this.getHighlightColor(originalColor, fallbackColor);

    clone.setAttribute(Constant.STROKE, color);
    clone.setAttribute(Constant.FILL, color);
    clone.style.fill = color;
    clone.style.stroke = color;

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
   * group shows through. Text keeps its own colour.
   *
   * The colour is not derived from the group, whose fill is only what it
   * inherited.
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
      const width = (Number.parseFloat(style.strokeWidth) || 0) + this.STROKE_WIDTH_HIGHLIGHT_INCREASE;
      const shape = shapes[at];
      shape.style.setProperty(Constant.STROKE, color, 'important');
      shape.style.setProperty('stroke-opacity', '1', 'important');
      shape.style.setProperty(Constant.STROKE_WIDTH, `${width}px`, 'important');
      shape.style.setProperty(Constant.FILL, 'none', 'important');
      outlined = true;
    });
    return outlined;
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

    const modifiedRgb = { ...originalRgb };

    // Check if the color is grayscale (R=G=B)
    if (originalRgb.r === originalRgb.g && originalRgb.g === originalRgb.b) {
      // For grayscale, modify all channels uniformly
      modifiedRgb.r = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.r * Constant.HIGHLIGHT_COLOR_RATIO));
      modifiedRgb.g = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.g * Constant.HIGHLIGHT_COLOR_RATIO));
      modifiedRgb.b = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.b * Constant.HIGHLIGHT_COLOR_RATIO));
    } else {
      // For non-grayscale colors, modify only the dominant channel
      if (originalRgb.r >= originalRgb.g && originalRgb.r >= originalRgb.b) {
        modifiedRgb.r = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.r * Constant.HIGHLIGHT_COLOR_RATIO));
      } else if (originalRgb.g >= originalRgb.r && originalRgb.g >= originalRgb.b) {
        modifiedRgb.g = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.g * Constant.HIGHLIGHT_COLOR_RATIO));
      } else {
        modifiedRgb.b = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.b * Constant.HIGHLIGHT_COLOR_RATIO));
      }
    }

    return Color.rgbToString(modifiedRgb);
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
