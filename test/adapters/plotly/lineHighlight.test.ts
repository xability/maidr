/**
 * @jest-environment jsdom
 */

/**
 * A plotly line, step or area drawn with `mode: 'lines'` is highlighted along
 * the line plotly drew.
 *
 * Plotly draws such a trace as a `path.js-line` inside the trace's own
 * `g.trace.scatter.trace{uid}` group, with no element per sample. The layer
 * used to carry a selector only when the trace drew markers, so these charts
 * had no highlight at all while every point was announced. Each series now
 * names its own trace's line, and `LineTrace` puts a marker on each sample
 * along it. The paths below are the ones plotly.js 2.35.2 drew in Chromium for
 * `examples/plotly-line.html` and `examples/plotly-step.html`.
 */

import type { PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Series A of the line example: x 1 to 7, drawn 84.5 px apart. */
const LINE_A = 'M0,232L84.5,160L169,188.8L253.5,131.2L338,59.2L422.5,102.4L507,16';
/** Series B of the same chart. */
const LINE_B = 'M0,145.6L84.5,304L169,217.6L253.5,246.4L338,174.4L422.5,88L507,203.2';
/** The `hv` staircase of the step example: a corner between every two samples. */
const STEP_HV = 'M0,209H67.5V209H135V60.5H202.5V60.5H270V60.5H337.5V159.5H405V159.5H472.5V11H540V11';

const WEEKS = [1, 2, 3, 4, 5, 6, 7];

/**
 * jsdom implements none of the per-tag SVG interfaces, so the
 * `instanceof SVGPathElement` test `LineTrace` reads a path by would throw.
 * Answered by tag, as a browser would.
 */
function defineSvgPathElement(): void {
  if ('SVGPathElement' in globalThis) {
    return;
  }
  Object.defineProperty(globalThis, 'SVGPathElement', {
    configurable: true,
    writable: true,
    value: class SVGPathElementShim {
      public static [Symbol.hasInstance](value: unknown): boolean {
        return value instanceof SVGElement && value.tagName === 'path';
      }
    },
  });
}

/**
 * A rendered plotly chart: each trace's group, holding its `path.js-line`,
 * inside the panel's scatter layer, in the reverse of the trace order, as
 * plotly may sort the groups by fill.
 * @param traces - The resolved traces, each with a uid
 * @param paths  - Each trace's drawn line, in trace order
 * @returns The graph div
 */
function graphDiv(traces: PlotlyTrace[], paths: string[]): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  const subplot = document.createElementNS(SVG_NS, 'g');
  subplot.setAttribute('class', 'subplot xy');
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', 'scatterlayer mlayer');
  traces.forEach((trace, i) => {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', `trace scatter trace${trace.uid}`);
    const lines = document.createElementNS(SVG_NS, 'g');
    lines.setAttribute('class', 'lines');
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', 'js-line');
    line.setAttribute('d', paths[i]);
    line.setAttribute('style', 'fill: none; stroke-width: 2px;');
    lines.appendChild(line);
    group.appendChild(lines);
    layer.prepend(group);
  });
  subplot.appendChild(layer);
  svg.appendChild(subplot);
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  gd._fullData = traces;
  gd._fullLayout = {
    xaxis: { domain: [0, 1], range: [0.6, 7.4], title: { text: 'Week' } },
    yaxis: { domain: [0, 1], title: { text: 'Sales ($K)' } },
  };
  gd.calcdata = traces.map(() => []);
  return gd;
}

/** A scatter trace drawn with lines over the seven weeks. */
function lineTrace(uid: string, y: number[], extra: Partial<PlotlyTrace> = {}): PlotlyTrace {
  return { type: 'scatter', mode: 'lines', uid, name: `Series ${uid}`, x: WEEKS, y, ...extra };
}

/** The only layer of the chart's only panel. */
function onlyLayer(gd: PlotlyGraphDiv): MaidrLayer {
  const layers = extractPlotlyData(gd)?.subplots[0][0].layers ?? [];
  expect(layers).toHaveLength(1);
  return layers[0];
}

/**
 * Where the highlight is after the reader enters the layer and makes the
 * given moves, read off the marker's centre.
 * @param layer - The layer to build the trace from
 * @param moves - The moves made after entering on the first point
 * @returns The highlighted marker's centre
 */
function highlightAfter(layer: MaidrLayer, moves: MovableDirection[]): { x: number; y: number } {
  const trace = TraceFactory.create(layer);
  trace.moveOnce('FORWARD');
  for (const move of moves) {
    trace.moveOnce(move);
  }
  const state = trace.state;
  if (state.empty || state.highlight.empty) {
    throw new Error('Expected a highlighted point');
  }
  const elements = state.highlight.elements;
  const marker = Array.isArray(elements) ? elements[0] : elements;
  return { x: Number(marker.getAttribute('cx')), y: Number(marker.getAttribute('cy')) };
}

describe('plotly line highlight', () => {
  beforeEach(() => {
    defineSvgPathElement();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('names each line\'s own path, by its trace\'s uid', () => {
    const layer = onlyLayer(graphDiv(
      [lineTrace('a1', [10, 15, 13, 17, 22, 19, 25]), lineTrace('b2', [16, 5, 11, 9, 14, 20, 12])],
      [LINE_A, LINE_B],
    ));

    expect(layer.type).toBe(TraceType.LINE);
    expect(layer.selectors).toEqual([
      '.subplot.xy .scatterlayer g.trace.tracea1 path.js-line',
      '.subplot.xy .scatterlayer g.trace.traceb2 path.js-line',
    ]);
  });

  it('marks the point the reader is on, on the line they are on', () => {
    const layer = onlyLayer(graphDiv(
      [lineTrace('a1', [10, 15, 13, 17, 22, 19, 25]), lineTrace('b2', [16, 5, 11, 9, 14, 20, 12])],
      [LINE_A, LINE_B],
    ));

    // Week 2 and week 7 of series A, then week 2 of series B, which is below
    // A there (5 against 15) and so is reached with Down.
    expect(highlightAfter(layer, ['FORWARD'])).toEqual({ x: 84.5, y: 160 });
    expect(highlightAfter(layer, Array.from({ length: 6 }, () => 'FORWARD' as const)))
      .toEqual({ x: 507, y: 16 });
    expect(highlightAfter(layer, ['FORWARD', 'DOWNWARD'])).toEqual({ x: 84.5, y: 304 });
  });

  it('marks a staircase at its samples, not at its corners', () => {
    const layer = onlyLayer(graphDiv(
      [lineTrace('s1', [2, 2, 5, 5, 5, 3, 3, 6, 6], {
        x: [9, 10, 11, 12, 13, 14, 15, 16, 17],
        line: { shape: 'hv' },
      })],
      [STEP_HV],
    ));

    expect(layer.type).toBe(TraceType.STEP);
    // The third sample, at hour 11: plotly's `H135V60.5` lands there, after
    // the corner at (135, 209) that holds the level of hour 10.
    expect(highlightAfter(layer, ['FORWARD', 'FORWARD'])).toEqual({ x: 135, y: 60.5 });
  });

  it.each(['hvh', 'vhv'])('names nothing for a staircase drawn %s, its risers midway between samples', (shape) => {
    // Plotly draws the step between two samples of one value as a riser of
    // no height, which the step model reads as part of the run beside it:
    // each sample would be marked at a neighbour's place.
    const layer = onlyLayer(graphDiv(
      [lineTrace('s1', [2, 2, 5, 5, 5, 3, 3, 6, 6], {
        x: [9, 10, 11, 12, 13, 14, 15, 16, 17],
        line: { shape },
      })],
      [STEP_HV],
    ));

    expect(layer.selectors).toBeUndefined();
  });

  it('keeps the markers of a staircase drawn hvh that draws them', () => {
    const layer = onlyLayer(graphDiv(
      [lineTrace('s1', [2, 2, 5, 5, 5, 3, 3, 6, 6], {
        mode: 'lines+markers',
        x: [9, 10, 11, 12, 13, 14, 15, 16, 17],
        line: { shape: 'hvh' },
      })],
      [STEP_HV],
    ));

    expect(layer.selectors).toEqual(['.subplot.xy .scatterlayer g.trace.traces1 .point']);
  });

  it('marks each stacked band on the line plotly drew along its top', () => {
    const layer = onlyLayer(graphDiv(
      [
        lineTrace('e1', [120, 80, 140, 160, 1, 1, 1], { stackgroup: 'one', fill: 'tonexty' }),
        lineTrace('w2', [90, 70, 60, 110, 1, 1, 1], { stackgroup: 'one', fill: 'tonexty' }),
      ],
      [LINE_B, LINE_A],
    ));

    expect(layer.type).toBe(TraceType.STACKED_AREA);
    expect(layer.selectors).toEqual([
      '.subplot.xy .scatterlayer g.trace.tracee1 path.js-line',
      '.subplot.xy .scatterlayer g.trace.tracew2 path.js-line',
    ]);
    expect(highlightAfter(layer, ['FORWARD', 'FORWARD', 'FORWARD'])).toEqual({ x: 253.5, y: 246.4 });
  });

  it('keeps the markers of a layer whose every line draws them', () => {
    const layer = onlyLayer(graphDiv(
      [
        lineTrace('a1', [10, 15, 13, 17, 22, 19, 25], { mode: 'lines+markers' }),
        lineTrace('b2', [16, 5, 11, 9, 14, 20, 12], { mode: 'lines+markers' }),
      ],
      [LINE_A, LINE_B],
    ));

    expect(layer.selectors).toEqual([
      '.subplot.xy .scatterlayer g.trace.tracea1 .point',
      '.subplot.xy .scatterlayer g.trace.traceb2 .point',
    ]);
  });

  it('reads a layer whose lines are not all marked by its lines', () => {
    const layer = onlyLayer(graphDiv(
      [
        lineTrace('a1', [10, 15, 13, 17, 22, 19, 25], { mode: 'lines+markers' }),
        lineTrace('b2', [16, 5, 11, 9, 14, 20, 12]),
      ],
      [LINE_A, LINE_B],
    ));

    expect(layer.selectors).toEqual([
      '.subplot.xy .scatterlayer g.trace.tracea1 path.js-line',
      '.subplot.xy .scatterlayer g.trace.traceb2 path.js-line',
    ]);
  });

  it('names nothing for a line painted to a canvas', () => {
    const layer = onlyLayer(graphDiv(
      [lineTrace('a1', [10, 15, 13, 17, 22, 19, 25], { type: 'scattergl' })],
      [LINE_A],
    ));

    expect(layer.selectors).toBeUndefined();
  });

  it('names nothing when a uid cannot be written as a class', () => {
    const layer = onlyLayer(graphDiv(
      [
        lineTrace('a1', [10, 15, 13, 17, 22, 19, 25]),
        lineTrace('b 2', [16, 5, 11, 9, 14, 20, 12]),
      ],
      [LINE_A, LINE_B],
    ));

    expect(layer.selectors).toBeUndefined();
  });
});
