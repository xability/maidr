import { Color } from './color';
import { Constant } from './constant';

/**
 * Edge positions for SVG bounding box calculations.
 */
export type Edge = 'top' | 'bottom' | 'left' | 'right';

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

    return Array
      .from(document.querySelectorAll<T>(query))
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

    const element = document.querySelector<T>(query);
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

    const all = document.querySelectorAll<T>(query);
    return all[n] ?? null;
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
   * Creates one line per request, each along one edge of one element's
   * bounding box.
   *
   * A whole batch at once rather than a line at a time, for the reason given
   * on {@link createCircleElements}: measuring an element after inserting a
   * node beside it is what forces the browser to lay the chart out again, and
   * a loop that alternated the two paid a layout per line. Reading every
   * anchor first, building from the numbers, and inserting once per anchor
   * costs one layout for the batch however many lines it holds -- and a
   * candlestick or a box plot builds two per candle or per box, at
   * construction and again on every live-data rebuild.
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
   * @returns The lines, index-aligned with the requests
   */
  public static createLineElements(requests: readonly LineRequest[]): SVGElement[] {
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

    // WRITE. One insertion per anchor, reproducing the order that repeated
    // `insertAdjacentElement(AFTER_END, ...)` left behind.
    this.insertAfterAnchors(requests.map(({ box }) => box), lines);
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
   * Inserts each node directly after its anchor, one DOM call per anchor.
   *
   * `anchor.after(a, b)` leaves `[anchor, a, b]`, where inserting `a` and then
   * `b` with `insertAdjacentElement(AFTER_END, ...)` leaves `[anchor, b, a]`.
   * The batch therefore hands each anchor its nodes reversed, so the child
   * order is the one the one-at-a-time code produced -- which is the order the
   * chart is painted in, and so the order a reader sees a highlight in:
   * {@link createHighlightElement} inserts its visible clone directly after
   * the element it highlights.
   *
   * An anchor with no parent inserts nothing, exactly as
   * `insertAdjacentElement` did.
   *
   * @param anchors - The anchor for each node, index-aligned with `nodes`
   * @param nodes - The nodes to insert, in the order they were made
   */
  private static insertAfterAnchors(
    anchors: readonly SVGElement[],
    nodes: readonly (SVGElement | null)[],
  ): void {
    const byAnchor = new Map<SVGElement, SVGElement[]>();
    anchors.forEach((anchor, index) => {
      const node = nodes[index];
      if (node === null) {
        return;
      }
      const existing = byAnchor.get(anchor);
      if (existing) {
        existing.push(node);
      } else {
        byAnchor.set(anchor, [node]);
      }
    });

    for (const [anchor, group] of byAnchor) {
      anchor.after(...[...group].reverse());
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
   * {@link createLineElements}: one box plot's whiskers used to be measured
   * after the previous one's had been inserted, so every box cost the browser
   * two more layouts. The same element is measured once however many whiskers
   * touch it -- a box and both its caps were read four times per box.
   *
   * @param requests - The whiskers to draw, in the order they should be made
   * @returns One entry per request, index-aligned: the hidden line, or null
   *   when the cap and the box do not sit apart along the box's axis, or when
   *   the document cannot measure them
   */
  public static createWhiskerElements(
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

    // WRITE. Each whisker sits beside the box it joins, as before.
    this.insertAfterAnchors(requests.map(({ body }) => body), whiskers);
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
   * Amount to increase stroke width for highlighting line elements.
   */
  private static readonly STROKE_WIDTH_HIGHLIGHT_INCREASE = 2;

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
    const tag = element.tagName.toLowerCase();
    const isLineElement = tag === Constant.POLYLINE || tag === Constant.LINE;

    const computed = window.getComputedStyle(element);
    const originalColor = isLineElement
      ? computed.getPropertyValue(Constant.STROKE)
      : computed.getPropertyValue(Constant.FILL);
    const color = this.getHighlightColor(originalColor, fallbackColor);

    const fillOpacity = computed.getPropertyValue('fill-opacity');
    const strokeOpacity = computed.getPropertyValue('stroke-opacity');
    clone.style.fillOpacity = this.getAdjustedOpacity(fillOpacity, this.MIN_VISIBLE_FILL_OPACITY);
    clone.style.strokeOpacity = this.getAdjustedOpacity(strokeOpacity, this.MIN_VISIBLE_STROKE_OPACITY);

    clone.setAttribute(Constant.VISIBILITY, Constant.VISIBLE);
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
      if (match) {
        const value = Number.parseFloat(match[1]);
        const unit = match[2] || '';
        clone.setAttribute(Constant.STROKE_WIDTH, `${value + this.STROKE_WIDTH_HIGHLIGHT_INCREASE}${unit}`);
      } else {
        const parsed = Number.parseFloat(strokeWidth);
        const value = Number.isNaN(parsed)
          ? this.STROKE_WIDTH_HIGHLIGHT_INCREASE
          : parsed + this.STROKE_WIDTH_HIGHLIGHT_INCREASE;
        clone.setAttribute(Constant.STROKE_WIDTH, `${value}`);
      }
    }

    element.insertAdjacentElement(Constant.AFTER_END, clone);
    return clone;
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
