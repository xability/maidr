import type { PlotlyCalcData, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import { claimPlotlyExamination, deferWhilePlotlyDraws, DRAW_WAIT_MS } from '@adapters/plotly/examination';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
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

/** A promise and the means to settle it from outside. */
function pending(): { promise: Promise<void>; resolve: () => void; reject: () => void } {
  let resolve = (): void => {};
  let reject = (): void => {};
  const promise = new Promise<void>((done, fail) => {
    resolve = () => done();
    reject = () => fail(new Error('fetch failed'));
  });
  return { promise, resolve, reject };
}

describe('plotly charts still being drawn', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads a chart plotly has finished drawing at once', () => {
    const gd = createGraphDiv(BAR, [[{ x: 0, y: 1 }]]);
    gd._promises = [];
    const ready = jest.fn();

    expect(deferWhilePlotlyDraws(gd, ready)).toBe(false);
    expect(ready).not.toHaveBeenCalled();
  });

  it('reads a map once plotly has fetched its outlines and drawn it', async () => {
    const gd = createGraphDiv([{ type: 'choropleth' }], [[{}]]);
    const fetch = pending();
    gd._promises = [fetch.promise];
    const ready = jest.fn();

    // Asked again on every mutation of the page while it waits: still waiting,
    // and nothing scheduled twice.
    expect(deferWhilePlotlyDraws(gd, ready)).toBe(true);
    expect(deferWhilePlotlyDraws(gd, ready)).toBe(true);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();

    fetch.resolve();
    await new Promise(setImmediate);

    expect(ready).toHaveBeenCalledTimes(1);
    expect(deferWhilePlotlyDraws(gd, ready)).toBe(false);
  });

  it('reads a map whose outlines could not be fetched once plotly gives up', async () => {
    const gd = createGraphDiv([{ type: 'choropleth' }], [[{}]]);
    const fetch = pending();
    gd._promises = [fetch.promise];
    const ready = jest.fn();
    deferWhilePlotlyDraws(gd, ready);

    fetch.reject();
    await new Promise(setImmediate);

    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('reads a map as it stands when its outlines never arrive', async () => {
    jest.useFakeTimers();
    const gd = createGraphDiv([{ type: 'choropleth' }], [[{}]]);
    gd._promises = [new Promise<void>(() => {})];
    const ready = jest.fn();
    deferWhilePlotlyDraws(gd, ready);

    await jest.advanceTimersByTimeAsync(DRAW_WAIT_MS - 1);
    expect(ready).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(ready).toHaveBeenCalledTimes(1);
    expect(deferWhilePlotlyDraws(gd, ready)).toBe(false);
  });
});
