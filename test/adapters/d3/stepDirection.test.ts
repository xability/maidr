/**
 * A d3 staircase has to be able to say it is one (#1066).
 *
 * `stepDirection` appeared nowhere in this adapter, so two things were lost.
 * A chart drawn with `d3.line().curve(d3.curveStepAfter)` could only be bound
 * with `bindD3Line` and was read as an interpolated line — navigated by sample
 * rather than by transition, described without runs, announced as a line plot.
 * And `bindD3Survival`, whose own file docstring states the curve is
 * `d3.curveStepAfter`, emitted no direction either, though
 * `SurvivalTrace extends StepTrace` and announces one when it is given.
 *
 * The convention is declared rather than derived: `d3.curveStep*` leaves no
 * trace in the rendered path a reader could tell from a line whose samples
 * happen to land on a staircase, and which curve was used is the author's own
 * choice — the same reason every other reading in this adapter arrives through
 * the config.
 */

import type { LinePoint } from '@type/grammar';
import { bindD3Area } from '@adapters/d3/binders/area';
import { bindD3Line } from '@adapters/d3/binders/line';
import { bindD3Survival } from '@adapters/d3/binders/survival';
import { describe, expect, test } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

const LEVELS: unknown[][] = [[
  { hour: 0, stage: 1 },
  { hour: 1, stage: 1 },
  { hour: 2, stage: 3 },
  { hour: 3, stage: 2 },
]];

const ARM = [
  { time: 0, surv: 1, arm: 'Control' },
  { time: 6, surv: 0.71, arm: 'Control' },
  { time: 12, surv: 0.41, arm: 'Control' },
];

/** One `<path>` per series, its samples bound the way `.join()` leaves them. */
function buildSvg(series: unknown[][], cssClass = 'series'): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const points of series) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', cssClass);
    (path as unknown as { __data__: unknown }).__data__ = points;
    svg.appendChild(path);
  }
  return svg;
}

const LINE_BASE = { selector: 'path.series', x: 'hour', y: 'stage' } as const;

describe('bindD3Line with a step convention', () => {
  test('reads as a step trace rather than a line', () => {
    const result = bindD3Line(buildSvg(LEVELS), {
      ...LINE_BASE,
      title: 'Sleep Stage Through the Night',
      stepDirection: 'hv',
    });

    expect(result.layer.type).toBe(TraceType.STEP);
    expect(result.layer.stepDirection).toBe('hv');
    // The samples are a line's: what a step adds is how the model reads
    // between them.
    expect(result.layer.data as LinePoint[][]).toEqual([[
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 3 },
      { x: 3, y: 2 },
    ]]);
  });

  test('carries whichever convention was declared', () => {
    const before = bindD3Line(buildSvg(LEVELS), { ...LINE_BASE, stepDirection: 'vh' });

    expect(before.layer.type).toBe(TraceType.STEP);
    expect(before.layer.stepDirection).toBe('vh');
  });

  test('stays the line it was when nothing declares a convention', () => {
    // `d3.curveStep` puts the riser midway between the samples, which is
    // neither convention and which `StepDirection` cannot name — so a caller
    // with nothing to declare is unchanged rather than guessed at.
    const result = bindD3Line(buildSvg(LEVELS), LINE_BASE);

    expect(result.layer.type).toBe(TraceType.LINE);
    expect(result.layer.stepDirection).toBeUndefined();
  });
});

describe('bindD3Area with a step convention', () => {
  test('stays an area and carries the convention', () => {
    // An area's trace reads `stepDirection` to tell the risers of a stepped
    // band from its samples, so the field rides along without changing what
    // the layer is.
    const result = bindD3Area(buildSvg(LEVELS), {
      ...LINE_BASE,
      stepDirection: 'vh',
    });

    expect(result.layer.type).toBe(TraceType.AREA);
    expect(result.layer.stepDirection).toBe('vh');
  });

  test('says nothing when the area is an ordinary one', () => {
    expect(bindD3Area(buildSvg(LEVELS), LINE_BASE).layer.stepDirection).toBeUndefined();
  });
});

describe('bindD3Survival', () => {
  const SURVIVAL_BASE = { selector: 'path.km', x: 'time', y: 'surv', fill: 'arm' } as const;

  test('announces the step direction a Kaplan-Meier estimate is drawn with', () => {
    // The estimate holds until an event drops it, which is `curveStepAfter` —
    // what this binder's own description says the curve is. Every other
    // adapter emits `hv` for a survival curve; this one emitted nothing.
    const result = bindD3Survival(buildSvg([ARM], 'km'), SURVIVAL_BASE);

    expect(result.layer.type).toBe(TraceType.SURVIVAL);
    expect(result.layer.stepDirection).toBe('hv');
  });

  test('lets a curve drawn the other way round say so', () => {
    const result = bindD3Survival(buildSvg([ARM], 'km'), {
      ...SURVIVAL_BASE,
      stepDirection: 'vh',
    });

    expect(result.layer.stepDirection).toBe('vh');
  });
});
