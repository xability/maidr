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
 * How long a chart plotly is still drawing is waited for, in milliseconds,
 * before it is read as it stands.
 */
export const DRAW_WAIT_MS = 10_000;

/**
 * The charts {@link deferWhilePlotlyDraws} has waited for: true while it is
 * waiting, false once it has.
 */
const waitedCharts = new WeakMap<PlotlyGraphDiv, boolean>();

/**
 * Defers reading a chart until plotly has finished drawing it.
 *
 * `Plotly.newPlot` returns with part of a chart still to come: a map waits for
 * the outlines it fetches over the network, and only then draws the regions
 * and works out each one's centroid. Plotly keeps what it is waiting for in
 * `gd._promises` until it settles. A choropleth read before then had no
 * centroids, so it was read as a list in the order it was declared rather
 * than by compass direction.
 *
 * Waited for once per chart, and for {@link DRAW_WAIT_MS} at most: a chart
 * whose outlines never arrive is read as it stands, as it was before.
 *
 * @param element - Any element inside the plotly graph div, or the div itself.
 * @param ready   - Called once plotly has finished, or the wait has run out.
 * @returns Whether the caller should leave the chart until `ready` is called.
 */
export function deferWhilePlotlyDraws(element: HTMLElement, ready: () => void): boolean {
  const gd = findGraphDiv(element);
  if (!gd)
    return false;

  const waiting = waitedCharts.get(gd);
  if (waiting !== undefined)
    return waiting;

  const pending = gd._promises ?? [];
  if (pending.length === 0)
    return false;

  waitedCharts.set(gd, true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, DRAW_WAIT_MS);
  });
  void Promise.race([Promise.allSettled(pending), timeout]).then(() => {
    clearTimeout(timer);
    waitedCharts.set(gd, false);
    ready();
  });
  return true;
}

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
