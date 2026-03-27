/**
 * CSS selector generation for plotly.js SVG elements.
 *
 * Generates selectors matching the py-maidr format, scoped to the
 * subplot container: `.subplot.{id} .trace.{type} .point`
 *
 * Plotly renders each subplot inside `<g class="subplot xy">` (or
 * `x2y2`, `x3y3`, etc.) and each trace type has predictable class
 * names on its `<g>` wrapper.
 *
 * NOTE: UID-based per-trace scoping is intentionally omitted.
 * Plotly concatenates UIDs into compound classes (`trace{uid}`) for
 * scatter, and omits them entirely for bars — making UID selectors
 * unreliable.  Subplot-level scoping is sufficient and matches
 * py-maidr's proven approach.
 */

import type { PlotlyGraphDiv } from './plotly-types';
import { TraceType } from '../type/grammar';

/**
 * Generates CSS selectors for a given trace type and index.
 *
 * @param maidrType   - The MAIDR trace type.
 * @param traceIndex  - The global index of the trace in `gd._fullData`.
 * @param gd          - The plotly graph div element.
 * @returns CSS selector string, or `undefined` if no selector can be generated.
 */
export function generatePlotlySelectors(
  maidrType: TraceType,
  traceIndex: number,
  gd: HTMLElement,
): string | undefined {
  const plotlyGd = gd as unknown as PlotlyGraphDiv;
  const traceData = plotlyGd._fullData?.[traceIndex];

  // Build subplot prefix: `.subplot.xy `, `.subplot.x2y2 `, etc.
  const prefix = subplotCssPrefix(traceData?.xaxis, traceData?.yaxis);

  switch (maidrType) {
    case TraceType.SCATTER:
      return `${prefix}.trace.scatter .point`;

    case TraceType.BAR:
    case TraceType.HISTOGRAM:
    case TraceType.DODGED:
    case TraceType.STACKED:
    case TraceType.NORMALIZED:
      return `${prefix}.trace.bars .point > path`;

    case TraceType.LINE:
      return lineSelector(prefix, traceData?.mode);

    case TraceType.BOX:
      return `${prefix}.trace.boxes .point > path`;

    case TraceType.HEATMAP:
      return `${prefix}.heatmaplayer image`;

    case TraceType.CANDLESTICK:
      // Candlestick reuses box plot rendering: boxlayer > trace.boxes > path.box
      return `${prefix}.trace.boxes .box`;

    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the subplot CSS prefix from trace axis references.
 *
 * Plotly renders each subplot inside `<g class="subplot xy">`.
 * Axis names follow the pattern: `x` → `x`, `x2` → `x2`, etc.
 */
export function subplotCssPrefix(xaxis?: string, yaxis?: string): string {
  const x = xaxis ?? 'x';
  const y = yaxis ?? 'y';
  return `.subplot.${x}${y} `;
}

/**
 * Line selector: returns a selector only when markers are present.
 *
 * `mode: 'lines'` produces a single `<path class="js-line">` per series
 * with no individual point elements — per-point highlighting is not
 * possible. When markers exist (`mode` includes `'markers'`), plotly
 * renders `<path class="point">` elements that can be highlighted.
 */
function lineSelector(prefix: string, mode?: string): string | undefined {
  if (mode?.includes('markers')) {
    return `${prefix}.trace.scatter .point`;
  }
  // Lines-only mode: no per-point SVG elements to highlight.
  return undefined;
}
