import type { VictoryLayerInfo } from './types';

/**
 * Data-attribute prefix used to tag Victory-rendered SVG elements so that
 * MAIDR's `Svg.selectAllElements()` can reliably select them later.
 */
const ATTR_PREFIX = 'data-maidr-victory';

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

  const attrName = `${ATTR_PREFIX}-${layerIndex}`;
  const { victoryType } = layer;

  // Line and area charts: single <path> representing the full series
  if (victoryType === 'VictoryLine' || victoryType === 'VictoryArea') {
    return tagLineOrAreaElements(svg, layer, attrName, claimed);
  }

  // Box, candlestick: complex multi-element compositions that don't map
  // cleanly to a single selector strategy. Skip selector tagging so that
  // MAIDR's audio/text/braille still work (highlighting degrades).
  if (victoryType === 'VictoryBoxPlot' || victoryType === 'VictoryCandlestick') {
    return undefined;
  }

  // Discrete-element charts: one SVG element per data point
  const tag = victoryType === 'VictoryBar' || victoryType === 'VictoryHistogram'
    ? 'rect'
    : 'path';

  return tagDiscreteElements(svg, tag, layer, attrName, claimed);
}

/**
 * Tags discrete SVG elements (one element per data point) for bar,
 * histogram, scatter, pie, and segmented (stacked/dodged) charts.
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

  if (candidates.length === 0) return undefined;

  // Heuristic: pick the first path whose `d` attribute contains enough
  // SVG commands to plausibly represent the data points.
  for (const candidate of candidates) {
    const d = candidate.getAttribute('d') ?? '';
    const commandCount = (d.match(/[MLCQTSA]/gi) ?? []).length;
    if (commandCount >= layer.dataCount) {
      candidate.setAttribute(attrName, '');
      claimed.add(candidate);
      return `[${attrName}]`;
    }
  }

  // Fallback: use the first unclaimed path.
  const fallback = candidates[0];
  fallback.setAttribute(attrName, '');
  claimed.add(fallback);
  return `[${attrName}]`;
}
