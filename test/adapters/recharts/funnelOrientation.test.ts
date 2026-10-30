/**
 * @jest-environment jsdom
 *
 * A Recharts funnel described the way Recharts draws it.
 *
 * `<Funnel>` lays its stages out one row per stage, down the page, each
 * trapezoid as wide as its count. The adapter emitted no orientation, so the
 * core read the layer as a vertical funnel: the description said
 * "Orientation: vertical" with the counts on the y axis, and the chart was
 * entered as a "vertical funnel".
 *
 * jsdom because a Recharts layer carries selectors, and `TraceFactory`
 * resolves them against a document.
 */
import type { RechartsAdapterConfig } from '@adapters/recharts/types';
import type { AbstractTrace } from '@model/abstract';
import type { MaidrLayer } from '@type/grammar';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';

// No chart is drawn here, so the layer's selectors resolve to nothing and the
// factory says so. True, and beside the point of these tests.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

/** The documented funnel recipe, from `docs/recharts.md`. */
const FUNNEL: RechartsAdapterConfig = {
  id: 'funnel-example',
  title: 'Signup Funnel',
  data: [
    { stage: 'Visited', users: 10000 },
    { stage: 'Signed up', users: 2400 },
    { stage: 'Activated', users: 2300 },
    { stage: 'Paid', users: 100 },
  ],
  chartType: 'funnel',
  xKey: 'stage',
  yKeys: ['users'],
  xLabel: 'Stage',
  yLabel: 'Users',
};

/**
 * The single layer the funnel converts to.
 * @returns The emitted layer
 */
function funnelLayer(): MaidrLayer {
  return convertRechartsToMaidr(FUNNEL).subplots[0][0].layers[0];
}

describe('a Recharts funnel', () => {
  it('is described as horizontal, its counts across and its stages down', () => {
    const trace = TraceFactory.create(funnelLayer()) as AbstractTrace;

    expect(trace.orientationLabel).toBe('horizontal');
    expect(trace.description.axes).toEqual({ x: 'Users', y: 'Stage' });
  });

  it('announces each stage by its name and its count under the count axis', () => {
    const state = TraceFactory.create(funnelLayer()).getStateAt(0, 1);

    expect(state.empty).toBe(false);
    if (state.empty) {
      return;
    }
    expect(state.text.main).toEqual({ label: 'Stage', value: 'Signed up' });
    expect(state.text.cross).toEqual({ label: 'Users', value: 2400 });
  });

  it('still sonifies what each stage kept of the one before', () => {
    // The retention is read from the counts, which moved to `x`: a trace
    // reading them from `y` would find the stage names there and fall silent.
    const state = TraceFactory.create(funnelLayer()).getStateAt(0, 1);

    expect(state.empty).toBe(false);
    if (state.empty) {
      return;
    }
    expect(state.audio.freq.raw).not.toBeNaN();
  });
});
