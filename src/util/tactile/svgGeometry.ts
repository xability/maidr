import type { DotPoint, TactileViewport } from './viewport';

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
   * Points used to approximate a full circle or ellipse.
   */
  private static readonly ELLIPSE_SAMPLES = 48;

  /**
   * SVG tags that carry no geometry worth raising pins for.
   *
   * Text is excluded on purpose rather than by omission: a tick label is about
   * one pin tall at this scale, so rendering it produces noise that reads as
   * data. Labels belong on the braille text line, where they can be read.
   */
  private static readonly SKIPPED_TAGS: ReadonlySet<string> = new Set([
    'text',
    'tspan',
    'textpath',
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
   * Reports whether an element should contribute geometry.
   *
   * Skips MAIDR's own injected shapes — hidden highlight clones, overlay
   * markers — so the tactile view shows the chart rather than a doubled copy of
   * every mark plus whatever the visual highlight is currently drawing.
   *
   * @param element - The element to test
   */
  public static isRenderable(element: Element): boolean {
    const tag = element.tagName.toLowerCase();
    if (this.SKIPPED_TAGS.has(tag)) {
      return false;
    }
    if (element.hasAttribute('data-maidr-owned')) {
      return false;
    }
    if (element.getAttribute('visibility') === 'hidden') {
      return false;
    }
    return element.getAttribute('display') !== 'none';
  }

  /**
   * Transforms a point from a shape's own user space into dot coordinates.
   * @param x - Horizontal position in the shape's user space
   * @param y - Vertical position in the shape's user space
   * @param matrix - The shape's screen transform
   * @param viewport - The active zoom and pan
   */
  private static project(x: number, y: number, matrix: DOMMatrix, viewport: TactileViewport): DotPoint {
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
   * Samples a `path` along its length.
   *
   * A path holding several disconnected subpaths is sampled as one run, so the
   * outline picks up a straight segment bridging the gap. Charting libraries
   * emit one path per mark often enough that paying for full subpath parsing
   * is not yet worth it; when it does happen the bridge lands inside the mark's
   * own bounding box and reads as part of the shape.
   *
   * @param element - The path to sample
   * @param matrix - The path's screen transform
   * @param viewport - The active zoom and pan
   */
  private static samplePath(
    element: SVGPathElement,
    matrix: DOMMatrix,
    viewport: TactileViewport,
  ): DotPoint[] {
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

    const points: DotPoint[] = [];
    for (let i = 0; i <= samples; i++) {
      try {
        const point = element.getPointAtLength((i / samples) * totalLength);
        points.push(this.project(point.x, point.y, matrix, viewport));
      } catch {
        break;
      }
    }
    return points;
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
    viewport: TactileViewport,
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
    viewport: TactileViewport,
  ): DotRing {
    const points: DotPoint[] = [];
    for (let i = 0; i < this.ELLIPSE_SAMPLES; i++) {
      const angle = (i / this.ELLIPSE_SAMPLES) * Math.PI * 2;
      points.push(this.project(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle), matrix, viewport));
    }
    return { points, closed: true };
  }

  /**
   * Reduces one SVG shape to dot-coordinate rings.
   *
   * A group yields the rings of every shape beneath it, so a mark drawn as a
   * `<g>` of parts renders as those parts rather than as its bounding box.
   *
   * @param element - The shape to reduce
   * @param viewport - The active zoom and pan
   * @returns Rings in dot coordinates; empty when the shape cannot be measured
   */
  public static ringsOf(element: SVGGraphicsElement, viewport: TactileViewport): DotRing[] {
    const tag = element.tagName.toLowerCase();

    if (tag === 'g' || tag === 'svg') {
      const rings: DotRing[] = [];
      for (const child of Array.from(element.children)) {
        if (!this.isRenderable(child)) {
          continue;
        }
        rings.push(...this.ringsOf(child as SVGGraphicsElement, viewport));
      }
      return rings;
    }

    const matrix = this.screenMatrix(element);
    if (matrix === null) {
      return [];
    }

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
        const points = this.samplePath(element as SVGPathElement, matrix, viewport);
        if (points.length === 0) {
          break;
        }
        const closed = /z\s*$/i.test(element.getAttribute('d') ?? '');
        return [{ points, closed }];
      }
    }

    const fallback = this.boundingBoxRing(element, matrix, viewport);
    return fallback === null ? [] : [fallback];
  }
}
