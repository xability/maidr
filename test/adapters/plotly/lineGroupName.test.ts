/**
 * @jest-environment jsdom
 */

/**
 * A plotly line is announced with its series' name only where the chart shows
 * that name.
 *
 * Every point of a line-shaped layer carried its trace's name as `z`, which
 * `LineTrace` announces as "Group is <name>" and lists in the dialog. A lone
 * line plotly draws no legend for shows its name nowhere, so the step example
 * read "Hour is 9, Staff is 2, Group is On shift" on every point. A name is now
 * carried by the series of a layer of several, and by a lone line whose legend
 * entry plotly draws.
 */

import type { PlotlyFullLayout, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { TextState } from '@type/state';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A rendered plotly div holding the given traces on one panel.
 * @param traces - The traces, shaped as plotly resolves them
 * @param layout - What plotly resolved the layout's legend to
 * @returns The graph div
 */
function graphDiv(traces: PlotlyTrace[], layout: Partial<PlotlyFullLayout> = {}): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  gd._fullData = traces;
  gd._fullLayout = {
    xaxis: { domain: [0, 1], title: { text: 'Hour' } },
    yaxis: { domain: [0, 1], title: { text: 'Staff' } },
    ...layout,
  };
  gd.calcdata = traces.map(() => []);
  return gd;
}

/**
 * A staircase over four hours, as the step example draws one, listed in the
 * legend as plotly lists a trace unless the page says otherwise.
 */
function stepTrace(name: string, extra: Partial<PlotlyTrace> = {}): PlotlyTrace {
  return {
    type: 'scatter',
    mode: 'lines',
    name,
    showlegend: true,
    x: [9, 10, 11, 12],
    y: [2, 2, 5, 3],
    line: { shape: 'hv' },
    ...extra,
  };
}

/** The only layer of the chart's only panel. */
function onlyLayer(gd: PlotlyGraphDiv): MaidrLayer {
  const layers = extractPlotlyData(gd)?.subplots[0][0].layers ?? [];
  expect(layers).toHaveLength(1);
  return layers[0];
}

/** What is announced for the first point once the reader enters the layer. */
function firstAnnouncement(layer: MaidrLayer): TextState {
  const trace = TraceFactory.create(layer);
  trace.moveOnce('FORWARD');
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a point');
  }
  return state.text;
}

describe('plotly line group name', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('names no group for a lone line plotly draws no legend for', () => {
    const layer = onlyLayer(graphDiv([stepTrace('On shift')], { showlegend: false }));

    expect((layer.data as LinePoint[][])[0].every(point => point.z === undefined)).toBe(true);
    expect(firstAnnouncement(layer).z).toBeUndefined();
  });

  it('names a lone line by its legend entry when plotly draws one', () => {
    const layer = onlyLayer(graphDiv([stepTrace('On shift')], { showlegend: true }));

    expect(firstAnnouncement(layer).z?.value).toBe('On shift');
  });

  it('names no group for a lone line the page keeps out of the legend', () => {
    const layer = onlyLayer(graphDiv(
      [stepTrace('On shift', { showlegend: false })],
      { showlegend: true },
    ));

    expect(firstAnnouncement(layer).z).toBeUndefined();
  });

  it('names each line of several, legend or not', () => {
    const layer = onlyLayer(graphDiv(
      [stepTrace('Weekday'), stepTrace('Weekend', { y: [1, 3, 3, 2] })],
      { showlegend: false },
    ));

    expect((layer.data as LinePoint[][]).map(series => series[0].z)).toEqual(['Weekday', 'Weekend']);
  });

  it('counts only the lines of the layer, not the panel\'s other traces', () => {
    // A bar and a line on one panel are two layers: the line is still the
    // only one of its layer, and with the legend hidden its name is shown
    // nowhere.
    const layers = extractPlotlyData(graphDiv(
      [
        { type: 'bar', name: 'Booked', x: [9, 10, 11, 12], y: [3, 4, 4, 2] },
        stepTrace('On shift'),
      ],
      { showlegend: false },
    ))?.subplots[0][0].layers ?? [];
    const line = layers.find(layer => layer.type === TraceType.STEP);
    if (line === undefined) {
      throw new Error('Expected a layer for the line');
    }

    expect(layers).toHaveLength(2);
    expect(firstAnnouncement(line).z).toBeUndefined();
  });
});
