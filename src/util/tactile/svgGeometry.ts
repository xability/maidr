import type { ClientRect, DotPoint, TactileViewport } from './viewport';

/**
 * Whatever maps screen points onto the plane rings are measured in: the
 * viewport, for the pins, or a pass-through that leaves them in screen pixels
 * for a caller that needs a mark's outline where the page draws it.
 */
export type DotProjector = Pick<TactileViewport, 'toDot'>;

/**
 * A run of points in dot coordinates, taken from one SVG shape.
 */
export interface DotRing {
  /**
   * The shape's outline, sampled densely enough that consecutive points land on
   * adjacent pins.
   */
  points: DotPoint[];

  /**
   * True when the last point joins back to the first, which decides whether the
   * shape can be filled.
   */
  closed: boolean;

  /**
   * The pieces of a shape drawn in more than one piece, when it is.
   *
   * One SVG path can hold several subpaths that do not touch: an error bar's
   * two caps and its stem, a box plot's box and its whiskers, a region and its
   * islands. {@link points} then runs through all of them, for measuring, and
   * these say where the pen was lifted -- drawn as one run, the pieces come
   * back joined by straight lines the chart never drew, which at whole-plot
   * zoom land inside the mark but a few steps in cut across it as a slash.
   */
  parts?: { points: DotPoint[]; closed: boolean }[];
}

/**
 * Reduces an SVG shape to dot-coordinate rings.
 *
 * This is the "scale the SVG down" step, done on the chart's geometry rather
 * than on its pixels. Sampling the rendered image and thresholding it cannot
 * survive the reduction — at this size a chart's axis spine covers a fraction
 * of one pin, so any threshold that keeps the spines also fills in the labels
 * and the margins. Working from the shapes keeps every mark at its true
 * position and, more importantly, makes "outline only" expressible at all: a
 * thresholded image has no notion of a mark's boundary, only of its ink.
 *
 * Every shape is transformed through its own `getScreenCTM`, so nested
 * transforms, viewBox scaling and the chart's own layout are all accounted for
 * without this code having to understand any of them.
 */
export abstract class TactileSvgGeometry {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Points sampled along the shortest path worth sampling at all.
   */
  private static readonly MIN_SAMPLES = 8;

  /**
   * Upper bound on samples per path. A path longer than this is being drawn at
   * a scale where extra samples land on pins already raised.
   */
  private static readonly MAX_SAMPLES = 512;

  /**
   * Points used to approximate a circle or ellipse large enough to want them
   * all. A smaller one is sampled to its size — see {@link ellipseSamples}.
   */
  private static readonly ELLIPSE_SAMPLES = 48;

  /**
   * SVG tags that draw nothing on their own — definitions, paint servers and
   * document metadata. Never worth pins, wherever they appear.
   */
  private static readonly NON_GRAPHICAL_TAGS: ReadonlySet<string> = new Set([
    'defs',
    'clippath',
    'mask',
    'marker',
    'pattern',
    'lineargradient',
    'radialgradient',
    'filter',
    'style',
    'title',
    'desc',
    'metadata',
    'symbol',
  ]);

  /**
   * Tags that draw lettering.
   *
   * Skipped when sifting a chart's subtree for its data, and only there. A
   * tick label is about one pin tall at this scale, so raising pins for it
   * produces noise that reads as data; labels belong on the braille text line,
   * where they can be read.
   *
   * But a mark the model hands over is data by definition, whatever it is made
   * of, and a word cloud is made of exactly this: the words *are* the marks and
   * their size is the value. Skipping those left the display flat — not a
   * degraded picture but no picture at all, indistinguishable to a reader from
   * a device that is switched off.
   */
  private static readonly LABEL_TAGS: ReadonlySet<string> = new Set([
    'text',
    'tspan',
    'textpath',
  ]);

  /**
   * Words that name axis furniture rather than data, matched against whole
   * tokens of an element's `id` and `class`.
   *
   * Chart libraries label this part of their output and nothing else does:
   * matplotlib groups every tick under `matplotlib.axis_1`, Plotly classes its
   * ticks `xtick` and its grid lines `xgrid`, D3 and Vega use `tick` and
   * `domain`, Recharts and Highcharts spell out `axis-tick` and `grid-line`.
   *
   * Whole tokens rather than substrings, because `candlestick` contains
   * "tick" and a candlestick chart is data. Splitting on non-alphanumerics
   * first is what keeps the two apart.
   *
   * `axes` is deliberately absent even though `axis` is here. matplotlib names
   * the group holding the entire plot `axes_1`, so matching it would skip the
   * chart itself wherever the fallback walk starts above that group.
   *
   * `text` is here because {@link LABEL_TAGS} does not catch lettering that is
   * not spelt with a `text` tag. matplotlib draws every glyph as a `use` of a
   * cached outline — `<g id="text_5"><use xlink:href="#DejaVuSans-35"/></g>` —
   * so the tag test sees a `use` and keeps it. A scatter plot arrived with
   * sixty-four of those on the pins: the tick labels and the title, each glyph
   * the size of a mark and none of them distinguishable from one by touch.
   * Matching the group is what reaches them, and it is safe on whole tokens —
   * `context` is one token and does not match.
   *
   * `legend` is a key to the chart rather than part of it. Its swatches are
   * drawn with the same marker as the data, so a legend reaching the pins is
   * indistinguishable from a cluster of real points sitting in a corner.
   */
  private static readonly FURNITURE_WORDS: ReadonlySet<string> = new Set([
    'axis',
    'tick',
    'ticks',
    'ticklabel',
    'ticklabels',
    'grid',
    'grids',
    'gridline',
    'gridlines',
    'spine',
    'spines',
    'domain',
    'zeroline',
    'legend',
    'text',
  ]);

  /**
   * Reports whether an `id` or `class` names axis furniture.
   *
   * A leading `x` or `y` is dropped before matching, since that is how the
   * axis it belongs to is spelt — `xtick`, `ygrid` — and it is never a word on
   * its own.
   *
   * @param value - The attribute value to inspect
   */
  private static namesFurniture(value: string): boolean {
    for (const raw of value.toLowerCase().split(/[^a-z0-9]+/)) {
      const token = raw.replace(/\d+$/, '');
      if (this.FURNITURE_WORDS.has(token)) {
        return true;
      }
      if ((token.startsWith('x') || token.startsWith('y')) && this.FURNITURE_WORDS.has(token.slice(1))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Reports whether an element should contribute geometry.
   *
   * Skips MAIDR's own injected shapes — hidden highlight clones, overlay
   * markers — so the tactile view shows the chart rather than a doubled copy of
   * every mark plus whatever the visual highlight is currently drawing.
   *
   * Skips axis furniture too. A tick mark is one or two pins long here, so a
   * row of them reads as a row of marks; and the pins an axis spine takes are
   * pins the data is not using. What the axes mean belongs on the braille line,
   * where it can be read rather than guessed at.
   *
   * @param element - The element to test
   */
  public static isRenderable(element: Element): boolean {
    if (this.LABEL_TAGS.has(element.tagName.toLowerCase())) {
      return false;
    }
    if (element.hasAttribute('data-maidr-owned')) {
      return false;
    }
    if (!this.isDrawable(element)) {
      return false;
    }
    const id = element.getAttribute('id');
    if (id !== null && this.namesFurniture(id)) {
      return false;
    }
    const className = element.getAttribute('class');
    return className === null || !this.namesFurniture(className);
  }

  /**
   * Reports whether an element inside a mark the model supplied is worth
   * drawing.
   *
   * Weaker than {@link isRenderable} on purpose. That one sifts a chart's whole
   * subtree, where furniture and data are mixed and lettering is almost always
   * a label. Here the enclosing mark is already known to be data, so the only
   * things to drop are the tags that draw nothing at all and anything the chart
   * has hidden.
   *
   * @param element - The element to test
   */
  private static isDrawable(element: Element): boolean {
    if (this.NON_GRAPHICAL_TAGS.has(element.tagName.toLowerCase())) {
      return false;
    }
    if (element.getAttribute('visibility') === 'hidden') {
      return false;
    }
    return element.getAttribute('display') !== 'none';
  }

  /**
   * How far apart two screen positions can be and still count as the same edge.
   *
   * A spine is drawn under a pixel wide, and its rect picks up the stroke, so
   * an exact comparison would miss it.
   */
  private static readonly PANEL_TOLERANCE = 2;

  /**
   * Drops the shapes that draw the panel the chart sits in.
   *
   * The plot background and the axis spines carry no data, and between them
   * they cost more pins than the marks do: on a scatter plot the background
   * rectangle, the four spines and the frame around them arrived as a band
   * three pins deep around the whole display, and the window was sized to the
   * panel rather than to the marks, so the points were squeezed into what was
   * left. Removing them lets the marks own the grid.
   *
   * They cannot be found by name here. {@link namesFurniture} handles the
   * libraries that label their output, but a chart that has been through MAIDR
   * has had its groups renamed to `maidr-<uuid>` for selector use, taking
   * matplotlib's `patch_1` with it. What is left is the geometry, and the panel
   * has a shape nothing else does: it either fills the whole extent or traces
   * one of its edges.
   *
   * Never empties the list. A chart drawn as a single shape spanning its own
   * extent — which is what any one shape does, measured against itself — would
   * otherwise vanish entirely, and a blank display is the one outcome a reader
   * cannot tell from a disconnected one.
   *
   * @param shapes - The candidates gathered from the chart's subtree
   * @returns The candidates that are not panel furniture
   */
  public static withoutPanel(shapes: readonly SVGGraphicsElement[]): SVGGraphicsElement[] {
    if (shapes.length < 2) {
      return [...shapes];
    }

    const boxes = shapes.map(shape => shape.getBoundingClientRect());
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const box of boxes) {
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.left + box.width);
      bottom = Math.max(bottom, box.top + box.height);
    }
    if (!Number.isFinite(left) || right <= left || bottom <= top) {
      return [...shapes];
    }

    const kept = shapes.filter((shape, index) => !this.tracesPanel(shape, boxes[index], left, top, right, bottom));
    return kept.length > 0 ? kept : [...shapes];
  }

  /**
   * Reports whether a shape could be the plot background at all.
   *
   * A background has an inside: it is a rectangle, a polygon, an image, or a
   * path that closes on itself. A stroke has none, and a stroke that reaches
   * every edge of the chart is not a panel but the data at its widest -- the
   * series on a bump chart that goes from first place to last runs corner to
   * corner by definition, and the one line spanning a line chart's whole
   * range is the line the chart is about. Dropping those as furniture left a
   * four-series bump chart with one series on the pins and the reader with no
   * way to know three were missing.
   *
   * @param shape - The candidate
   */
  private static canBePanel(shape: SVGGraphicsElement): boolean {
    switch (shape.tagName.toLowerCase()) {
      case 'rect':
      case 'polygon':
      case 'image':
      case 'use':
      case 'g':
        return true;
      case 'path': {
        if (/z\s*$/i.test(shape.getAttribute('d') ?? '')) {
          return true;
        }
        const fill = shape.getAttribute('fill') ?? shape.style.fill;
        return fill !== '' && fill !== 'none';
      }
      default:
        return false;
    }
  }

  /**
   * Reports whether a shape fills the chart's whole extent or runs along one of
   * its edges.
   *
   * Only a shape with an inside can fill the extent; see {@link canBePanel}.
   * Running along an edge is a spine's signature and is tested whatever the
   * shape is drawn with, because a spine is a stroke.
   *
   * @param shape - The shape itself
   * @param box - The shape's screen rect
   * @param left - Left edge of every shape's combined extent
   * @param top - Top edge of that extent
   * @param right - Right edge of that extent
   * @param bottom - Bottom edge of that extent
   */
  private static tracesPanel(
    shape: SVGGraphicsElement,
    box: ClientRect,
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): boolean {
    const tolerance = this.PANEL_TOLERANCE;
    const spansX = box.width >= right - left - tolerance;
    const spansY = box.height >= bottom - top - tolerance;
    if (spansX && spansY) {
      return this.canBePanel(shape);
    }

    const flatX = box.width <= tolerance;
    const flatY = box.height <= tolerance;
    const onLeft = Math.abs(box.left - left) <= tolerance;
    const onRight = Math.abs(box.left + box.width - right) <= tolerance;
    const onTop = Math.abs(box.top - top) <= tolerance;
    const onBottom = Math.abs(box.top + box.height - bottom) <= tolerance;

    return (spansX && flatY && (onTop || onBottom))
      || (spansY && flatX && (onLeft || onRight));
  }

  /**
   * Transforms a point from a shape's own user space into dot coordinates.
   * @param x - Horizontal position in the shape's user space
   * @param y - Vertical position in the shape's user space
   * @param matrix - The shape's screen transform
   * @param viewport - The active zoom and pan
   */
  private static project(x: number, y: number, matrix: DOMMatrix, viewport: DotProjector): DotPoint {
    const screenX = matrix.a * x + matrix.c * y + matrix.e;
    const screenY = matrix.b * x + matrix.d * y + matrix.f;
    return viewport.toDot(screenX, screenY);
  }

  /**
   * Reads the shape's transform into screen space, or null when the shape is
   * not rendered — detached, inside a `display: none` subtree, or in a
   * document that does not implement the SVG geometry interfaces.
   * @param element - The shape to measure
   */
  private static screenMatrix(element: SVGGraphicsElement): DOMMatrix | null {
    try {
      return element.getScreenCTM();
    } catch {
      return null;
    }
  }

  /**
   * Reads a length-valued SVG attribute.
   * @param element - The element to read from
   * @param name - Attribute name
   */
  private static length(element: SVGGraphicsElement, name: string): number {
    const raw = element.getAttribute(name);
    const value = raw === null ? Number.NaN : Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  }

  /**
   * Parses a `points` attribute into user-space coordinate pairs.
   * @param element - A `polyline` or `polygon`
   */
  private static parsePoints(element: SVGGraphicsElement): { x: number; y: number }[] {
    const raw = element.getAttribute('points') ?? '';
    const numbers = raw
      .split(/[\s,]+/)
      .map(Number.parseFloat)
      .filter(Number.isFinite);

    const points: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      points.push({ x: numbers[i], y: numbers[i + 1] });
    }
    return points;
  }

  /**
   * Where each subpath of a path begins, measured along the path, cached
   * against the path data it was measured from.
   */
  private static readonly subpathCache = new WeakMap<Element, { d: string; starts: number[] }>();

  /**
   * The lengths along a path at which each of its subpaths begins, the first
   * always at zero.
   *
   * Measured rather than parsed: each boundary is the length of the path data
   * up to the next move, which a detached path reports exactly, arcs and
   * relative commands included, without MAIDR having to interpret either.
   *
   * @param element - The path to measure
   * @param d - Its path data
   */
  private static subpathStarts(element: SVGPathElement, d: string): number[] {
    const cached = this.subpathCache.get(element);
    if (cached !== undefined && cached.d === d) {
      return cached.starts;
    }
    const starts = [0];
    const moves = Array.from(d.matchAll(/M/gi), match => match.index ?? 0).filter(index => index > 0);
    if (moves.length > 0) {
      try {
        const probe = element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
        for (const index of moves) {
          probe.setAttribute('d', d.slice(0, index));
          const length = probe.getTotalLength();
          if (Number.isFinite(length) && length > starts[starts.length - 1]) {
            starts.push(length);
          }
        }
      } catch {
        // A document that cannot measure a detached path: the path is sampled
        // as one run, as it always was.
        starts.length = 1;
      }
    }
    this.subpathCache.set(element, { d, starts });
    return starts;
  }

  /**
   * Samples a `path` along its length, one run per subpath.
   *
   * @param element - The path to sample
   * @param matrix - The path's screen transform
   * @param viewport - The active zoom and pan
   * @returns One run of points per subpath, with the path data it came from
   */
  private static samplePath(
    element: SVGPathElement,
    matrix: DOMMatrix,
    viewport: DotProjector,
  ): { points: DotPoint[]; d: string }[] {
    let totalLength: number;
    try {
      totalLength = element.getTotalLength();
    } catch {
      return [];
    }
    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      return [];
    }

    const samples = Math.min(
      this.MAX_SAMPLES,
      Math.max(this.MIN_SAMPLES, Math.ceil(totalLength / 2)),
    );

    const d = element.getAttribute('d') ?? '';
    const starts = this.subpathStarts(element, d);
    if (starts.length === 1) {
      const points: DotPoint[] = [];
      for (let i = 0; i <= samples; i++) {
        try {
          const point = element.getPointAtLength((i / samples) * totalLength);
          points.push(this.project(point.x, point.y, matrix, viewport));
        } catch {
          break;
        }
      }
      return [{ points, d }];
    }

    // Each subpath sampled between its own ends, a hair inside them: at a
    // boundary exactly, the length names both the end of one subpath and the
    // start of the next, and either may come back.
    const moves = Array.from(d.matchAll(/M/gi), match => match.index ?? 0).filter(index => index > 0);
    const runs: { points: DotPoint[]; d: string }[] = [];
    for (let part = 0; part < starts.length; part++) {
      const from = starts[part];
      const to = part + 1 < starts.length ? starts[part + 1] : totalLength;
      const length = to - from;
      if (length <= 0) {
        continue;
      }
      const inset = Math.min(1e-3, length / 1000);
      const count = Math.max(1, Math.ceil(samples * length / totalLength));
      const points: DotPoint[] = [];
      for (let i = 0; i <= count; i++) {
        const at = Math.min(to - inset, Math.max(from + inset, from + (i / count) * length));
        try {
          const point = element.getPointAtLength(at);
          points.push(this.project(point.x, point.y, matrix, viewport));
        } catch {
          break;
        }
      }
      const segment = d.slice(part === 0 ? 0 : moves[part - 1], part < moves.length ? moves[part] : undefined);
      runs.push({ points, d: segment });
    }
    return runs;
  }

  /**
   * Largest gap, in dots, between a path's ends that still counts as closed.
   */
  private static readonly CLOSE_TOLERANCE = 0.5;

  /**
   * Reports whether a path encloses an area.
   *
   * A `z` says so outright, but plenty of charts do not write one and simply
   * walk back to where they started. matplotlib's heatmap is the case that
   * matters: every cell is a four-corner path returning to its first point with
   * no `z`, so reading the attribute alone called each cell an open stroke.
   * Two things then went wrong at once — the cell was stroked at the weight
   * meant for lines, tripling its border, and the fill that carries its value
   * was skipped, because only a shape with an inside can be given a texture. A
   * heatmap arrived as a thick lattice with all 64 of its values missing.
   *
   * @param d - The path data, or the part of it one subpath was drawn from
   * @param points - Its sampled points, in dot coordinates
   */
  private static pathCloses(d: string, points: readonly DotPoint[]): boolean {
    if (/z\s*$/i.test(d)) {
      return true;
    }
    if (points.length < 3) {
      return false;
    }
    const first = points[0];
    const last = points[points.length - 1];
    if (!Number.isFinite(first.x) || !Number.isFinite(last.x)) {
      return false;
    }
    return Math.abs(first.x - last.x) <= this.CLOSE_TOLERANCE
      && Math.abs(first.y - last.y) <= this.CLOSE_TOLERANCE;
  }

  /**
   * Falls back to the shape's bounding box when its geometry cannot be read
   * directly — an image, a nested group, a `use` reference.
   * @param element - The shape to measure
   * @param matrix - The shape's screen transform
   * @param viewport - The active zoom and pan
   */
  private static boundingBoxRing(
    element: SVGGraphicsElement,
    matrix: DOMMatrix,
    viewport: DotProjector,
  ): DotRing | null {
    let box: DOMRect;
    try {
      box = element.getBBox();
    } catch {
      return null;
    }
    if (box.width === 0 && box.height === 0) {
      return { points: [this.project(box.x, box.y, matrix, viewport)], closed: false };
    }
    return {
      points: [
        this.project(box.x, box.y, matrix, viewport),
        this.project(box.x + box.width, box.y, matrix, viewport),
        this.project(box.x + box.width, box.y + box.height, matrix, viewport),
        this.project(box.x, box.y + box.height, matrix, viewport),
      ],
      closed: true,
    };
  }

  /**
   * Samples an axis-aligned ellipse in the shape's own user space, so any
   * rotation in the transform carries through to the projected points.
   * @param cx - Centre x in user space
   * @param cy - Centre y in user space
   * @param rx - Horizontal radius in user space
   * @param ry - Vertical radius in user space
   * @param matrix - The shape's screen transform
   * @param viewport - The active zoom and pan
   */
  private static ellipseRing(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    matrix: DOMMatrix,
    viewport: DotProjector,
  ): DotRing {
    const samples = this.ellipseSamples(cx, cy, rx, ry, matrix, viewport);
    const points: DotPoint[] = [];
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      points.push(this.project(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle), matrix, viewport));
    }
    return { points, closed: true };
  }

  /**
   * How finely to sample an ellipse, given the room it takes on the pins.
   *
   * A sample every couple of dots, which is what {@link samplePath} spends on
   * a path, bounded at both ends. The bound that matters is the lower one: a
   * scatter is thousands of circles, every unfocused one is reduced again on
   * every navigation move, and each sample is then stroked as its own segment
   * — so a point that covers a pin or two paid for forty-eight projections and
   * forty-eight Bresenham runs to raise the pin it would have raised with
   * eight. That is per mark, per arrow key, in front of a write the reader is
   * already waiting on.
   *
   * Only the projected size decides it, since that is what the pins can
   * resolve: the same circle wants more samples zoomed in than it does at
   * whole-plot zoom. Three projections answer the question — the centre and
   * one end of each axis — because everything between user space and dots is
   * affine.
   *
   * @param cx - Centre x in user space
   * @param cy - Centre y in user space
   * @param rx - Horizontal radius in user space
   * @param ry - Vertical radius in user space
   * @param matrix - The shape's screen transform
   * @param viewport - The active zoom and pan
   * @returns Points to sample around the ellipse
   */
  private static ellipseSamples(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    matrix: DOMMatrix,
    viewport: DotProjector,
  ): number {
    const centre = this.project(cx, cy, matrix, viewport);
    const across = this.project(cx + rx, cy, matrix, viewport);
    const down = this.project(cx, cy + ry, matrix, viewport);
    const a = Math.hypot(across.x - centre.x, across.y - centre.y);
    const b = Math.hypot(down.x - centre.x, down.y - centre.y);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      // Unmeasurable: spend the samples rather than draw a shape that is not
      // the mark's.
      return this.ELLIPSE_SAMPLES;
    }
    // Exact for a circle, and low by a few percent for an eccentric ellipse —
    // which costs at most a sample or two out of a count already rounded up.
    const perimeter = Math.PI * (a + b);
    return Math.min(
      this.ELLIPSE_SAMPLES,
      Math.max(this.MIN_SAMPLES, Math.ceil(perimeter / 2)),
    );
  }

  /**
   * Reduces one SVG shape to dot-coordinate rings.
   *
   * A group yields the rings of every shape beneath it, so a mark drawn as a
   * `<g>` of parts renders as those parts rather than as its bounding box.
   *
   * @param element - The shape to reduce
   * @param viewport - The active zoom and pan, or a pass-through projector for
   * the outline in screen pixels
   * @returns Rings in dot coordinates; empty when the shape cannot be measured
   */
  public static ringsOf(element: SVGGraphicsElement, viewport: DotProjector): DotRing[] {
    const tag = element.tagName.toLowerCase();

    if (tag === 'g' || tag === 'svg') {
      const rings: DotRing[] = [];
      for (const child of Array.from(element.children)) {
        // `isDrawable`, not `isRenderable`: this group is a mark the model
        // handed over, so its parts are data whatever they are made of.
        if (!this.isDrawable(child)) {
          continue;
        }
        rings.push(...this.ringsOf(child as SVGGraphicsElement, viewport));
      }
      return rings;
    }

    // A definition is drawn only through a `<use>` that places it, and a
    // selector reaching into `<defs>` has found the definition rather than the
    // drawing. Measured where it is declared, it lands wherever its own
    // coordinates happen to point -- matplotlib declares a violin's outline
    // there at negative y and places it with a `<use>`.
    if (element.closest('defs') !== null) {
      return [];
    }

    const matrix = this.screenMatrix(element);
    if (matrix === null) {
      return [];
    }

    if (tag === 'use') {
      return this.useRings(element, matrix, viewport);
    }
    return this.shapeRings(element, tag, matrix, viewport);
  }

  /**
   * Deepest chain of `<use>` and group nesting followed, so a reference that
   * refers back to itself cannot recurse forever.
   */
  private static readonly MAX_USE_DEPTH = 8;

  /**
   * Reduces a `<use>` to the rings of the shape it places.
   *
   * A `<use>` has no geometry of its own. Measured as a box, a violin placed
   * this way arrived as its bounding rectangle, and the outline that is the
   * whole of the chart was nowhere on the pins.
   *
   * @param use - The `<use>` element
   * @param matrix - Its screen transform
   * @param viewport - The active zoom and pan
   * @param depth - How many references deep this is
   */
  private static useRings(
    use: SVGGraphicsElement,
    matrix: DOMMatrix,
    viewport: DotProjector,
    depth: number = 0,
  ): DotRing[] {
    const href = use.getAttribute('href') ?? use.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    const target = href !== null && href.startsWith('#') && depth < this.MAX_USE_DEPTH
      ? use.ownerDocument.getElementById(href.slice(1))
      : null;
    if (target === null) {
      const fallback = this.boundingBoxRing(use, matrix, viewport);
      return fallback === null ? [] : [fallback];
    }
    const placed = matrix.translate(this.length(use, 'x'), this.length(use, 'y'));
    return this.placedRings(target, placed, viewport, depth + 1);
  }

  /**
   * Reduces a referenced element, placed by the `<use>` that refers to it.
   *
   * @param element - The referenced element, or one of its descendants
   * @param matrix - The transform it is placed with, before its own
   * @param viewport - The active zoom and pan
   * @param depth - How many references deep this is
   */
  private static placedRings(
    element: Element,
    matrix: DOMMatrix,
    viewport: DotProjector,
    depth: number,
  ): DotRing[] {
    const own = (element as SVGGraphicsElement).transform?.baseVal?.consolidate()?.matrix;
    const placed = own === undefined ? matrix : matrix.multiply(own);
    const tag = element.tagName.toLowerCase();
    if (tag === 'g' || tag === 'symbol' || tag === 'svg') {
      return Array.from(element.children)
        .filter(child => this.isDrawable(child))
        .flatMap(child => this.placedRings(child, placed, viewport, depth + 1));
    }
    if (tag === 'use') {
      return this.useRings(element as SVGGraphicsElement, placed, viewport, depth);
    }
    return this.shapeRings(element as SVGGraphicsElement, tag, placed, viewport);
  }

  /**
   * Reduces one leaf shape, under a given transform, to rings.
   *
   * @param element - The shape
   * @param tag - Its tag name, lower case
   * @param matrix - Its screen transform
   * @param viewport - The active zoom and pan
   */
  private static shapeRings(
    element: SVGGraphicsElement,
    tag: string,
    matrix: DOMMatrix,
    viewport: DotProjector,
  ): DotRing[] {
    switch (tag) {
      case 'rect': {
        const x = this.length(element, 'x');
        const y = this.length(element, 'y');
        const width = this.length(element, 'width');
        const height = this.length(element, 'height');
        if (width === 0 && height === 0) {
          break;
        }
        return [{
          points: [
            this.project(x, y, matrix, viewport),
            this.project(x + width, y, matrix, viewport),
            this.project(x + width, y + height, matrix, viewport),
            this.project(x, y + height, matrix, viewport),
          ],
          closed: true,
        }];
      }

      case 'circle': {
        const r = this.length(element, 'r');
        return [this.ellipseRing(
          this.length(element, 'cx'),
          this.length(element, 'cy'),
          r,
          r,
          matrix,
          viewport,
        )];
      }

      case 'ellipse':
        return [this.ellipseRing(
          this.length(element, 'cx'),
          this.length(element, 'cy'),
          this.length(element, 'rx'),
          this.length(element, 'ry'),
          matrix,
          viewport,
        )];

      case 'line':
        return [{
          points: [
            this.project(this.length(element, 'x1'), this.length(element, 'y1'), matrix, viewport),
            this.project(this.length(element, 'x2'), this.length(element, 'y2'), matrix, viewport),
          ],
          closed: false,
        }];

      case 'polyline':
      case 'polygon': {
        const points = this.parsePoints(element)
          .map(point => this.project(point.x, point.y, matrix, viewport));
        if (points.length === 0) {
          break;
        }
        return [{ points, closed: tag === 'polygon' }];
      }

      case 'path': {
        const runs = this.samplePath(element as SVGPathElement, matrix, viewport)
          .filter(run => run.points.length > 0);
        if (runs.length === 0) {
          break;
        }
        if (runs.length === 1) {
          return [{ points: runs[0].points, closed: this.pathCloses(element.getAttribute('d') ?? '', runs[0].points) }];
        }
        const parts = runs.map(run => ({ points: run.points, closed: this.pathCloses(run.d, run.points) }));
        return [{
          points: parts.flatMap(part => part.points),
          closed: parts.some(part => part.closed),
          parts,
        }];
      }
    }

    const fallback = this.boundingBoxRing(element, matrix, viewport);
    return fallback === null ? [] : [fallback];
  }
}
