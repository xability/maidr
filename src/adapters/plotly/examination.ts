/**
 * Bookkeeping for how often a plotly chart is examined.
 *
 * Deciding whether MAIDR can represent a chart means reading everything plotly
 * computed for it, and a chart it cannot represent says so in the console.
 * Neither belongs on every DOM mutation, so the decision is kept to once per
 * set of inputs.
 */

import type { PlotlyGraphDiv } from './types';
import { findGraphDiv } from './extractor';

/** What a chart was examined against, held for comparison with what it holds now. */
interface ExaminationInputs {
  traces: unknown;
  calcdata: unknown;
}

const examinedCharts = new WeakMap<PlotlyGraphDiv, ExaminationInputs>();

/**
 * Claims a chart for examination, so a caller examines it once per set of
 * inputs rather than once per DOM mutation.
 *
 * A verdict is reached from plotly's `_fullData` and `calcdata`, which it
 * builds afresh whenever it recomputes a chart and leaves alone otherwise — a
 * pan or a zoom keeps them, as does a mutation elsewhere on the page. An
 * unchanged pair therefore means an unchanged verdict and no claim, while new
 * traces, or the points a chart was drawn without, yield a new pair and a
 * fresh one. (Were a future plotly to recompute a chart in place instead, the
 * pair would look unchanged and the chart would stop being re-examined.)
 *
 * A chart plotly has not computed yet is not claimed either, and nothing is
 * recorded for it, so it can be claimed once it has been.
 *
 * @param element - Any element inside the plotly graph div, or the div itself.
 * @returns Whether the caller should examine the chart now.
 */
export function claimPlotlyExamination(element: HTMLElement): boolean {
  const gd = findGraphDiv(element);
  if (!gd?._fullData || !gd.calcdata)
    return false;

  const examined = examinedCharts.get(gd);
  if (examined?.traces === gd._fullData && examined.calcdata === gd.calcdata)
    return false;

  examinedCharts.set(gd, { traces: gd._fullData, calcdata: gd.calcdata });
  return true;
}
