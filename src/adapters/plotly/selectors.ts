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

import type { PlotlyGraphDiv, PlotlyTrace } from './types';
import { TraceType } from '../../type/grammar';

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

    // A step trace is a scatter trace plotly drew as a staircase, so its
    // markers — when it has any — are the same `.point` elements.
    case TraceType.LINE:
    case TraceType.STEP:
      return lineSelector(prefix, traceData?.mode);

    case TraceType.BOX:
      return `${prefix}.trace.boxes .point > path`;

    case TraceType.HEATMAP:
      return `${prefix}.heatmaplayer image`;

    case TraceType.CANDLESTICK:
      // Candlestick reuses box plot rendering: boxlayer > trace.boxes > path.box
      return `${prefix}.trace.boxes .box`;

    case TraceType.PIE:
      return pieSelector(plotlyGd, traceIndex);

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

/**
 * Pie selector: the wedge paths of one pie trace, in drawing order.
 *
 * A pie has no axes, so plotly draws it in `.pielayer` rather than in a
 * `.subplot.xy` group — the prefix every other selector here is scoped by does
 * not exist for one. It also gives each pie a bare `<g class="trace">` with no
 * uid class (scatter's `trace{uid}` has no pie counterpart), so the only thing
 * distinguishing one pie from another on the same paper is its position among
 * them. Plotly orders those groups to match the traces it drew, skipping the
 * ones it did not, hence counting only the drawn pies before this one.
 */
function pieSelector(gd: PlotlyGraphDiv, traceIndex: number): string {
  const traces = gd._fullData ?? [];
  let drawnBefore = 0;
  for (let i = 0; i < traceIndex; i++) {
    if (isDrawnPie(traces[i])) {
      drawnBefore++;
    }
  }
  return `.pielayer > g.trace:nth-of-type(${drawnBefore + 1}) g.slice path.surface`;
}

/**
 * Whether a trace is a pie plotly put on the paper. A hidden or legend-only
 * trace gets no group in `.pielayer`, so it must not shift the count.
 */
function isDrawnPie(trace: PlotlyTrace | undefined): boolean {
  return trace?.type === 'pie'
    && trace.visible !== false
    && trace.visible !== 'legendonly';
}
