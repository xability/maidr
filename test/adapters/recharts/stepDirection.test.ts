/**
 * @jest-environment jsdom
 */
/**
 * A Recharts staircase has to be able to say it is one (#1059).
 *
 * `RechartsChartType` had no `'step'`, and `stepDirection` reached a layer only
 * from inside `SurvivalCurveConfig` — so a `<Line type="stepAfter">` that was
 * not a survival curve could only be declared `'line'`, and came out as
 * `TraceType.LINE`. That loses everything `StepTrace` adds over `LineTrace`:
 * navigation by transition, a description in terms of runs, and the step
 * announcement itself.
 *
 * The conventions are measured, not assumed. Rendering the three Recharts
 * curve shapes over `[{ t: 0, v: 10 }, { t: 1, v: 30 }, { t: 2, v: 20 }]` at
 * 320×220 puts the samples at x = 65, 190, 315 and y = 128.75, 16.25, 72.5,
 * and the `.recharts-curve` paths come out:
 *
 *   stepAfter   M65,128.75 L190,128.75 L190,16.25 L315,16.25 L315,72.5
 *   stepBefore  M65,128.75 L65,16.25 L190,16.25 L190,72.5 L315,72.5
 *   step        M65,128.75 L127.5,128.75 L127.5,16.25 L252.5,16.25 …
 *
 * So `stepAfter` risers at the next sample (`hv`), `stepBefore` at the current
 * one (`vh`), and `step` at 127.5 — the midpoint of 65 and 190, which the
 * grammar names `mid`. That third case was left unmapped until #1075, on the
 * mistaken belief that `StepDirection` had no name for it.
 */

import type { RechartsAdapterConfig } from '@adapters/recharts/types';
import type { LinePoint } from '@type/grammar';
import type { ReactNode } from 'react';
import { stepDirectionFor } from '@adapters/recharts/childProps';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { createElement } from 'react';

const DATA = [
  { t: 0, v: 10 },
  { t: 1, v: 30 },
  { t: 2, v: 20 },
];

/** The single layer a chart config converts to. */
function layerOf(config: Partial<RechartsAdapterConfig>): ReturnType<typeof convertRechartsToMaidr>['subplots'][0][0]['layers'][0] {
  const figure = convertRechartsToMaidr({
    id: 'step',
    data: DATA,
    xKey: 't',
    ...config,
  } as RechartsAdapterConfig);
  return figure.subplots[0][0].layers[0];
}

describe('a step chart type', () => {
  it('reads as a step trace rather than a line', () => {
    const layer = layerOf({ chartType: 'step', yKeys: ['v'] });

    expect(layer.type).toBe(TraceType.STEP);
    // The samples themselves are a line's: what a step adds is how the model
    // reads between them.
    expect(layer.data).toEqual([[{ x: 0, y: 10 }, { x: 1, y: 30 }, { x: 2, y: 20 }]]);
  });

  it('carries the convention it is drawn with', () => {
    expect(layerOf({ chartType: 'step', yKeys: ['v'], stepDirection: 'hv' }).stepDirection)
      .toBe('hv');
    expect(layerOf({ chartType: 'step', yKeys: ['v'], stepDirection: 'vh' }).stepDirection)
      .toBe('vh');
  });

  it('announces no direction when nothing names one', () => {
    // A config that declares no direction and has no `<Line>` to read one off
    // gets none. `StepTrace` is written to expect that rather than a guess —
    // the chart is still read as a step.
    expect(layerOf({ chartType: 'step', yKeys: ['v'] }).stepDirection).toBeUndefined();
  });

  it('carries the centred convention like any other', () => {
    expect(layerOf({ chartType: 'step', yKeys: ['v'], stepDirection: 'mid' }).stepDirection)
      .toBe('mid');
  });

  it('highlights through the dots, one per sample', () => {
    // The curve of a staircase has more vertices than samples; its dots do
    // not, which is what the model pairs its points with.
    expect(layerOf({ chartType: 'step', yKeys: ['v'] }).selectors)
      .toEqual(['#maidr-article-step .recharts-line-dots .recharts-line-dot']);
  });

  it('turns round with the axis it is drawn on', () => {
    const layer = layerOf({ chartType: 'step', yKeys: ['v'], categoryAxisReversed: true });

    expect((layer.data as LinePoint[][])[0].map(point => point.x)).toEqual([2, 1, 0]);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });
});

describe('an area drawn as a staircase', () => {
  it('carries the convention on each of the area types', () => {
    for (const chartType of ['area', 'stacked_area', 'normalized_area'] as const) {
      expect(layerOf({ chartType, yKeys: ['v'], stepDirection: 'vh' }).stepDirection)
        .toBe('vh');
    }
  });

  it('says nothing when the area is an ordinary one', () => {
    expect(layerOf({ chartType: 'area', yKeys: ['v'] }).stepDirection).toBeUndefined();
  });
});

describe('a composed chart', () => {
  it('lets each layer name its own convention', () => {
    // A composed chart is where one curve is a staircase and another is not.
    const figure = convertRechartsToMaidr({
      id: 'mixed',
      data: DATA,
      xKey: 't',
      stepDirection: 'hv',
      layers: [
        { yKey: 'v', chartType: 'step', stepDirection: 'vh' },
        { yKey: 'v', chartType: 'step' },
        { yKey: 'v', chartType: 'line' },
      ],
    } as RechartsAdapterConfig);

    const [own, inherited, plain] = figure.subplots[0][0].layers;
    expect(own.stepDirection).toBe('vh');
    // Nothing of its own, so the chart-wide answer stands.
    expect(inherited.stepDirection).toBe('hv');
    // A line carries no convention however the chart was declared.
    expect(plain.type).toBe(TraceType.LINE);
    expect(plain.stepDirection).toBeUndefined();
  });
});

describe('a grid of step charts', () => {
  it('lets a panel override the grid-wide convention', () => {
    const figure = convertRechartsToMaidr({
      id: 'grid',
      data: DATA,
      xKey: 't',
      stepDirection: 'hv',
      subplots: [[
        { chartType: 'step', yKeys: ['v'] },
        { chartType: 'step', yKeys: ['v'], stepDirection: 'vh' },
      ]],
    } as RechartsAdapterConfig);

    expect(figure.subplots[0][0].layers[0].stepDirection).toBe('hv');
    expect(figure.subplots[0][1].layers[0].stepDirection).toBe('vh');
  });
});

describe('reading the convention out of the children', () => {
  /** A stand-in for a Recharts component: only `displayName` is read. */
  function stub(displayName: string): { (): null; displayName: string } {
    const component = (): null => null;
    component.displayName = displayName;
    return component;
  }

  const Line = stub('Line');
  const Area = stub('Area');
  const Bar = stub('Bar');
  const LineChart = stub('LineChart');
  const Container = stub('ResponsiveContainer');

  function tree(...children: ReactNode[]): ReactNode {
    return createElement(LineChart, null, ...children);
  }

  it('reads stepAfter as a riser at the next sample', () => {
    expect(stepDirectionFor(tree(createElement(Line, { type: 'stepAfter' })))).toBe('hv');
  });

  it('reads stepBefore as a riser at the current sample', () => {
    expect(stepDirectionFor(tree(createElement(Line, { type: 'stepBefore' })))).toBe('vh');
  });

  it('reads an area the same way it reads a line', () => {
    expect(stepDirectionFor(tree(createElement(Area, { type: 'stepAfter' })))).toBe('hv');
  });

  it('reads a centred step as a riser midway between the samples', () => {
    // Recharts resolves `type` against d3's curves, so `type="step"` is
    // `d3.curveStep` — and the grammar names that `mid`, matplotlib's
    // `steps-mid`. This was read as an ordinary line until the third name was
    // noticed (#1075).
    expect(stepDirectionFor(tree(createElement(Line, { type: 'step' })))).toBe('mid');
  });

  it('names no direction for an ordinary curve', () => {
    expect(stepDirectionFor(tree(createElement(Line, { type: 'monotone' })))).toBeUndefined();
    expect(stepDirectionFor(tree(createElement(Line, null)))).toBeUndefined();
  });

  it('finds one nested behind a container', () => {
    const nested = createElement(
      Container,
      null,
      tree(createElement(Line, { type: 'stepBefore' })),
    );

    expect(stepDirectionFor(nested)).toBe('vh');
  });

  it('ignores a type prop on something that draws no curve', () => {
    // Recharts gives several components a `type`, and only a curve's names a
    // step convention.
    expect(stepDirectionFor(tree(createElement(Bar, { type: 'stepAfter' })))).toBeUndefined();
  });

  it('answers nothing for a chart it does not recognise', () => {
    expect(stepDirectionFor(tree())).toBeUndefined();
    expect(stepDirectionFor(null)).toBeUndefined();
  });
});
