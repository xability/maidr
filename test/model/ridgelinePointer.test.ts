/**
 * @jest-environment jsdom
 */

/**
 * What a pointer move over a ridgeline costs, and where it lands.
 *
 * A ridgeline is drawn as one filled path per group, so `pairWith` gives every
 * sample of a group the *same* element. Scanning the grid sample by sample
 * therefore measures one path over and over: every column of a row answers
 * with the identical rect, and the strict `<` comparison means only the first
 * one can ever win. The extra measurements cannot change the answer -- they
 * are layout reads, taken on every `pointermove`, for a result already known.
 *
 * The assertions below are on the *count* of measurements rather than on the
 * time they take, so the pin says what changed rather than how fast this
 * machine was on the day.
 */

import type { RidgelineTrace } from '@model/ridgeline';
import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace - The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: RidgelineTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

const GROUPS = 3;
const SAMPLES = 40;

/** Where each group's curve is drawn: three bands stacked down the page. */
const BAND_HEIGHT = 60;

/**
 * Groups sampled on their own grids, as a KDE per group produces.
 * @returns One row of samples per group
 */
function buildGroups(): ViolinKdePoint[][] {
  return Array.from({ length: GROUPS }, (_, group) =>
    Array.from({ length: SAMPLES }, (_, sample) => ({
      x: `group-${group}`,
      y: sample * 2,
      density: (sample % 7) / 10,
    })));
}

/**
 * A ridgeline layer whose selectors resolve to one path per group.
 * @param data - The groups the layer carries
 * @returns Ridgeline layer definition
 */
function createLayer(data: ViolinKdePoint[][]): MaidrLayer {
  return {
    id: 'ridgeline-pointer',
    type: TraceType.RIDGELINE,
    title: 'Delivery times by cohort',
    axes: { x: { label: 'Days' }, y: { label: 'Cohort' } },
    selectors: '.ridge',
    data,
  };
}

/**
 * Draws one path per group and gives each its own geometry.
 *
 * The stub sits on the prototype because the highlight mapping resolves
 * selectors through `Svg.selectAllElements`, which hands back clones; the
 * group index survives cloning because it is an attribute.
 * @returns The spy counting the measurements the pointer path takes
 */
function buildChart(): jest.SpiedFunction<() => DOMRect> {
  document.body.innerHTML = `
    <svg id="chart">
      ${Array.from({ length: GROUPS }, (_, group) =>
        `<path class="ridge" data-group="${group}" />`).join('')}
    </svg>
  `;

  return jest
    .spyOn(SVGElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: SVGElement): DOMRect {
      const group = Number(this.getAttribute('data-group') ?? 0);
      const top = group * BAND_HEIGHT;
      return {
        left: 100,
        top,
        width: 400,
        height: BAND_HEIGHT,
        right: 500,
        bottom: top + BAND_HEIGHT,
        x: 100,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    });
}

describe('a pointer move over a ridgeline', () => {
  let measure: jest.SpiedFunction<() => DOMRect>;

  beforeEach(() => {
    measure = buildChart();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('resolves the curves, so the counts below are counting something', () => {
    // Without this the cases below would pass on a null highlight map, which
    // is what a mis-shaped fixture produces.
    const trace = TraceFactory.create(createLayer(buildGroups())) as RidgelineTrace;

    expect(trace.moveToPointAndGetPointerGuidance(300, BAND_HEIGHT / 2)).not.toBeNull();
  });

  test('measures each curve once, not once per sample', () => {
    const trace = TraceFactory.create(createLayer(buildGroups())) as RidgelineTrace;
    measure.mockClear();

    trace.moveToPointAndGetPointerGuidance(300, BAND_HEIGHT * 1.5);

    // One read per drawn curve, plus the single bounds check the guidance
    // state needs. How many samples a curve carries does not enter into it.
    expect(measure).toHaveBeenCalledTimes(GROUPS + 1);
  });

  test('lands on the group whose curve the pointer is over', () => {
    const trace = TraceFactory.create(createLayer(buildGroups())) as RidgelineTrace;

    trace.moveToPointAndGetPointerGuidance(300, BAND_HEIGHT * 2 + BAND_HEIGHT / 2);

    expect(nonEmptyState(trace).text.section).toBe('group-2');
  });
});
