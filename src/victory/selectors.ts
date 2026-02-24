import type { VictoryLayerInfo } from './types';

/**
 * Data-attribute prefix used to tag Victory-rendered SVG elements so that
 * MAIDR's `Svg.selectAllElements()` can reliably select them later.
 */
const ATTR_PREFIX = 'data-maidr-victory';

/**
 * Maps a Victory component type to the SVG element tag name it renders
 * for each data point.
 *
 * Victory's default data components produce:
 * - VictoryBar  → `<rect>`  (one per bar)
 * - VictoryLine → `<path>`  (one path for the whole line, handled separately)
 * - VictoryArea → `<path>`  (similar to line)
 * - VictoryScatter → `<path>` (one per point, symbol shapes)
 * - VictoryPie  → `<path>`  (one slice per data point)
 */
function svgTagForVictoryType(victoryType: string): string {
  switch (victoryType) {
    case 'VictoryBar':
      return 'rect';
    default:
      return 'path';
  }
}

/**
 * Finds the Victory data elements inside a container for a given layer,
 * tags them with a unique data attribute, and returns the CSS selector
 * that matches exactly those elements.
 *
 * Strategy:
 * 1. Victory renders each data component's elements with
 *    `role="presentation"` on the individual data shapes.
 * 2. We query for the expected SVG tag (e.g. `rect` for bars) that
 *    carries `role="presentation"`.
 * 3. We skip elements that belong to other layers by tracking which
 *    elements were already claimed.
 * 4. Each claimed element receives a `data-maidr-victory-<layerIndex>`
 *    attribute so MAIDR can select them deterministically.
 *
 * @param container  - The DOM node wrapping the Victory chart
 * @param layer      - The extracted layer info
 * @param layerIndex - Numeric index for generating unique attribute names
 * @param claimed    - Set of elements already claimed by prior layers
 * @returns A CSS selector string, or `undefined` if elements could not be
 *          matched (highlighting will gracefully degrade).
 */
export function tagLayerElements(
  container: HTMLElement,
  layer: VictoryLayerInfo,
  layerIndex: number,
  claimed: Set<Element>,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg) return undefined;

  const tag = svgTagForVictoryType(layer.victoryType);
  const attrName = `${ATTR_PREFIX}-${layerIndex}`;

  // For line and area charts, the entire line/area is a single <path>.
  // MAIDR's line trace handles highlighting by parsing the path's `d`
  // attribute to extract individual point coordinates, so we need the
  // selector to match the line path element.
  if (layer.victoryType === 'VictoryLine' || layer.victoryType === 'VictoryArea') {
    return tagLineOrAreaElements(svg, layer, attrName, claimed);
  }

  // For discrete-element charts (bar, scatter, pie), each data point
  // has its own SVG element.
  return tagDiscreteElements(svg, tag, layer, attrName, claimed);
}

/**
 * Tags discrete SVG elements (one element per data point) for bar,
 * scatter, and pie charts.
 */
function tagDiscreteElements(
  svg: SVGElement,
  tag: string,
  layer: VictoryLayerInfo,
  attrName: string,
  claimed: Set<Element>,
): string | undefined {
  const candidates = Array.from(
    svg.querySelectorAll(`${tag}[role="presentation"]`),
  ).filter(el => !claimed.has(el));

  // Victory renders exactly one element per data point.
  // Take the first `dataCount` unclaimed elements.
  const matched = candidates.slice(0, layer.dataCount);

  if (matched.length !== layer.dataCount) {
    return undefined;
  }

  for (const el of matched) {
    el.setAttribute(attrName, '');
    claimed.add(el);
  }

  return `[${attrName}]`;
}

/**
 * Tags the path element for a VictoryLine or VictoryArea layer.
 *
 * Victory renders a single `<path>` with `role="presentation"` for
 * the line/area. MAIDR's line trace parses the `d` attribute to derive
 * individual point positions.
 */
function tagLineOrAreaElements(
  svg: SVGElement,
  layer: VictoryLayerInfo,
  attrName: string,
  claimed: Set<Element>,
): string | undefined {
  const candidates = Array.from(
    svg.querySelectorAll('path[role="presentation"]'),
  ).filter(el => !claimed.has(el));

  // For line/area, we need exactly one unclaimed path element.
  // Victory renders the line path before any scatter point symbols,
  // so the first unclaimed path is typically the line.
  if (candidates.length === 0) return undefined;

  // Heuristic: pick the first path whose `d` attribute contains enough
  // commands to represent the data (at least dataCount - 1 segments).
  for (const candidate of candidates) {
    const d = candidate.getAttribute('d') ?? '';
    // Count move/line commands (M, L, C, Q, etc.)
    const commandCount = (d.match(/[MLCQTSA]/gi) ?? []).length;
    if (commandCount >= layer.dataCount) {
      candidate.setAttribute(attrName, '');
      claimed.add(candidate);
      return `[${attrName}]`;
    }
  }

  // Fallback: just use the first unclaimed path
  const fallback = candidates[0];
  fallback.setAttribute(attrName, '');
  claimed.add(fallback);
  return `[${attrName}]`;
}
