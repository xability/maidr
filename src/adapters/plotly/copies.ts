import type { CopyPlace } from '@util/copyPlacement';

/**
 * Where MAIDR puts its copies of a mark plotly drew in a trace's group: after
 * every trace group of the mark's layer.
 *
 * Plotly looks its marks up again inside a trace's group whenever it restyles
 * or redraws it, as `Plotly.relayout`, `restyle` and `react` all do, and reads
 * the datum it bound to each: a bar trace styles every `path` in its
 * `g.points`, a funnel or waterfall every `.point > path`, a pie every
 * `path.surface`, and a scatter trace hands its points out to every
 * `path.point` in turn. MAIDR's copies of the marks, made when the chart takes
 * focus, carry their tags and classes but no datum. So while a reader was on
 * the chart those calls threw on bars, histograms, funnels, waterfalls and
 * pies, and a scatter trace gave half its points to the hidden copies and drew
 * only the rest.
 *
 * After the trace groups no trace's lookup reaches a copy, and the copy is
 * drawn where its mark is, as nothing between the two moves or clips it. A
 * mark under a group that does -- a gauge's arc, a word cloud's word -- keeps
 * its copies beside it.
 *
 * @param mark - An element MAIDR copies
 * @returns The end of the mark's layer, or null to leave the copies beside it
 */
export function plotlyCopyPlace(mark: Element): CopyPlace | null {
  if (mark.closest('.js-plotly-plot') === null) {
    return null;
  }
  const trace = mark.parentElement?.closest('g.trace') ?? null;
  const layer = trace?.parentElement ?? null;
  if (layer === null) {
    return null;
  }
  for (let group = mark.parentElement; group !== null && group !== layer; group = group.parentElement) {
    if (group.hasAttribute('transform') || group.hasAttribute('clip-path')) {
      return null;
    }
  }
  return { parent: layer, before: null };
}
