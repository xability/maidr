import type { PlotlyCalcData, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import { claimPlotlyExamination } from '@adapters/plotly/examination';
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';

/** Builds a rendered plotly graph div holding the given internals. */
function createGraphDiv(
  traces: PlotlyTrace[],
  calcdata?: PlotlyCalcData[][],
): PlotlyGraphDiv {
  const dom = new JSDOM('<!doctype html><body></body>');
  const div = dom.window.document.createElement('div');
  div.className = 'js-plotly-plot';
  dom.window.document.body.appendChild(div);

  const gd = div as unknown as PlotlyGraphDiv;
  gd._fullData = traces;
  gd.calcdata = calcdata;
  return gd;
}

const BAR: PlotlyTrace[] = [{ type: 'bar', x: ['a'], y: [1] }];

describe('plotly examination', () => {
  it('claims a chart once for the inputs it holds', () => {
    const gd = createGraphDiv(BAR, [[{ x: 0, y: 1 }]]);

    expect(claimPlotlyExamination(gd)).toBe(true);

    // The DOM mutating around an untouched chart is not a reason to look at
    // it again — the repeated warnings came from doing exactly that.
    expect(claimPlotlyExamination(gd)).toBe(false);
    expect(claimPlotlyExamination(gd)).toBe(false);
  });

  it('does not claim a chart plotly has not computed yet', () => {
    const gd = createGraphDiv(BAR);

    expect(claimPlotlyExamination(gd)).toBe(false);

    // Nothing was recorded for it, so it is claimed once the calc data lands.
    gd.calcdata = [[{ x: 0, y: 1 }]];
    expect(claimPlotlyExamination(gd)).toBe(true);
  });

  it('claims a chart again once plotly recomputes its points', () => {
    const gd = createGraphDiv(BAR, [[]]);
    claimPlotlyExamination(gd);

    // A chart drawn empty and filled in later: same traces, new calc data.
    gd.calcdata = [[{ x: 0, y: 1 }]];

    expect(claimPlotlyExamination(gd)).toBe(true);
  });

  it('claims a chart again once plotly replaces its traces', () => {
    const gd = createGraphDiv([{ type: 'pie', y: [1, 2] }], [[{}]]);
    claimPlotlyExamination(gd);

    // What `Plotly.react` does to a chart swapped in place.
    gd._fullData = [{ type: 'violin', y: [1, 2] }];
    gd.calcdata = [[{ min: 1, max: 2 }]];

    expect(claimPlotlyExamination(gd)).toBe(true);
  });

  it('keeps charts apart', () => {
    const first = createGraphDiv(BAR, [[{ x: 0, y: 1 }]]);
    const second = createGraphDiv(BAR, [[{ x: 0, y: 1 }]]);

    expect(claimPlotlyExamination(first)).toBe(true);
    expect(claimPlotlyExamination(second)).toBe(true);
    expect(claimPlotlyExamination(first)).toBe(false);
  });
});
