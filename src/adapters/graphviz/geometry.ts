/**
 * Where Graphviz drew something, read from the drawing's own coordinates.
 *
 * Graphviz writes every shape in one coordinate system -- the graph group's
 * -- with absolute coordinates: an ellipse's centre and radii, a polygon's
 * points, a path of `M` and `C` commands. Reading them back needs no layout
 * engine and no `getBBox()`, which only a rendering browser has.
 */

/** An axis-aligned rectangle. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The numbers in an attribute, in order.
 *
 * @param value - A `points` or `d` attribute
 * @returns Its numbers
 */
function numbersIn(value: string | null): number[] {
  return (value ?? '').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
}

/**
 * The points one shape element spans.
 *
 * @param element - An `ellipse`, `polygon`, `polyline`, `path`, `rect` or `text`
 * @returns Its corner points, or none for any other element
 */
function pointsOf(element: Element): [number, number][] {
  const number = (name: string): number => Number(element.getAttribute(name) ?? Number.NaN);
  switch (element.localName) {
    case 'ellipse':
    case 'circle': {
      const cx = number('cx');
      const cy = number('cy');
      const rx = element.localName === 'circle' ? number('r') : number('rx');
      const ry = element.localName === 'circle' ? number('r') : number('ry');
      return [[cx - rx, cy - ry], [cx + rx, cy + ry]];
    }
    case 'rect': {
      const x = number('x');
      const y = number('y');
      return [[x, y], [x + number('width'), y + number('height')]];
    }
    case 'polygon':
    case 'polyline':
    case 'path': {
      // Graphviz writes only absolute commands, so the numbers pair up as
      // points -- a Bezier's control points included, which never stray
      // outside a cluster's box.
      const numbers = numbersIn(element.getAttribute(element.localName === 'path' ? 'd' : 'points'));
      const pairs: [number, number][] = [];
      for (let at = 0; at + 1 < numbers.length; at += 2) {
        pairs.push([numbers[at], numbers[at + 1]]);
      }
      return pairs;
    }
    case 'text':
      return [[number('x'), number('y')]];
    default:
      return [];
  }
}

/**
 * The box around every shape inside an element.
 *
 * @param element - A node or cluster group
 * @param shapesOnly - Whether to leave out text, which for a cluster is its
 *   label and already inside its outline
 * @returns The box, or null when the element draws nothing with coordinates
 */
export function boundsOf(element: Element, shapesOnly = false): Bounds | null {
  const selector = shapesOnly
    ? 'ellipse, circle, rect, polygon, polyline, path'
    : 'ellipse, circle, rect, polygon, polyline, path, text';
  let bounds: Bounds | null = null;
  for (const shape of element.querySelectorAll(selector)) {
    for (const [x, y] of pointsOf(shape)) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      bounds = bounds === null
        ? { minX: x, minY: y, maxX: x, maxY: y }
        : {
            minX: Math.min(bounds.minX, x),
            minY: Math.min(bounds.minY, y),
            maxX: Math.max(bounds.maxX, x),
            maxY: Math.max(bounds.maxY, y),
          };
    }
  }
  return bounds;
}

/**
 * A box's area.
 *
 * @param bounds - The box
 * @returns Its area
 */
export function areaOf(bounds: Bounds): number {
  return (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
}

/**
 * Whether a point lies inside a box, edges included.
 *
 * @param bounds - The box
 * @param x - The point's x
 * @param y - The point's y
 * @returns Whether it is inside
 */
export function contains(bounds: Bounds, x: number, y: number): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}
