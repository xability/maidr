/**
 * @jest-environment jsdom
 */

/**
 * A pointer landing on a grouped error bar resolves to the group it hit
 * (#942).
 *
 * `findNearestPoint` searched `highlightValues[0]` — the first group's slice
 * of whips, under the group-major layout — and reported every hit on the
 * first group's estimate row. Clicking the second series' whip therefore
 * moved the cursor to the *first* series at the same category, which is the
 * quiet kind of wrong: the announcement names the category the reader
 * clicked, and only the value and the group name are somebody else's.
 *
 * Separate from `errorBarGroups.test.ts` because it needs a DOM: the whips
 * have to exist for the layer's selectors to resolve, and their geometry has
 * to be readable. jsdom returns a zeroed rect from `getBoundingClientRect`,
 * so each element is given its own.
 */

import type { ErrorBarTrace } from '@model/errorBar';
import type { ErrorBarPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

const CONTROL: ErrorBarPoint[] = [
  { x: 'a', y: 2, yMin: 1.5, yMax: 2.9, z: 'control' },
  { x: 'b', y: 4, yMin: 3.2, yMax: 5.5, z: 'control' },
];

const TREATED: ErrorBarPoint[] = [
  { x: 'a', y: 3, yMin: 2.4, yMax: 3.6, z: 'treated' },
  { x: 'b', y: 5, yMin: 4.1, yMax: 6.0, z: 'treated' },
];

/**
 * Where each whip is drawn, in the order the selectors resolve — group-major,
 * so control's two whips then treated's two. The groups are separated on x, as
 * a dodge draws them, and far enough apart that a pointer is unambiguous.
 */
const WHIP_CENTRES = [
  { x: 100, y: 200 }, // control, a
  { x: 300, y: 200 }, // control, b
  { x: 140, y: 200 }, // treated, a
  { x: 340, y: 200 }, // treated, b
];

/**
 * Geometry for a whip, read from the index it carries.
 *
 * Stubbed on the prototype rather than per element, because the highlight
 * mapping resolves selectors through `Svg.selectAllElements`, which hands
 * back *clones*. A stub installed on the elements in the document would
 * therefore never be the one consulted -- the clones would answer jsdom's
 * zeroed rect, every whip would sit at the origin, and the nearest one would
 * always be the first. The index survives cloning because it is an attribute.
 * @param count - How many whips the chart draws
 */
function buildChart(count: number = WHIP_CENTRES.length): void {
  document.body.innerHTML = `
    <svg id="chart">
      ${WHIP_CENTRES.slice(0, count)
        .map((_, i) => `<line class="whip" data-i="${i}" />`)
        .join('')}
    </svg>
  `;

  SVGElement.prototype.getBoundingClientRect = function (this: SVGElement): DOMRect {
    const centre = WHIP_CENTRES[Number(this.getAttribute('data-i') ?? 0)];
    return {
      left: centre.x - 2,
      top: centre.y - 20,
      width: 4,
      height: 40,
      right: centre.x + 2,
      bottom: centre.y + 20,
      x: centre.x - 2,
      y: centre.y - 20,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

function createLayer(data: ErrorBarPoint[][]): MaidrLayer {
  return {
    id: 'grouped-error-bar-pointer',
    type: TraceType.ERROR_BAR,
    title: 'Response by dose and treatment',
    axes: { x: { label: 'Dose' }, y: { label: 'Response' } },
    selectors: '.whip',
    data,
  };
}

function nonEmptyState(trace: ErrorBarTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

describe('a pointer on a grouped error bar', () => {
  beforeEach(() => {
    buildChart();
  });

  test('the whips resolve, so the test is testing something', () => {
    // Without this the cases below would pass on a null highlight map, which
    // is what a mis-shaped fixture produces.
    const trace = TraceFactory.create(createLayer([CONTROL, TREATED])) as ErrorBarTrace;

    expect(trace.moveToPointAndGetPointerGuidance(100, 200)).not.toBeNull();
  });

  test('lands on the first group when the pointer is on its whip', () => {
    const trace = TraceFactory.create(createLayer([CONTROL, TREATED])) as ErrorBarTrace;

    trace.moveToPointAndGetPointerGuidance(300, 200);
    const state = nonEmptyState(trace);

    expect(state.text.z?.value).toBe('control');
    expect(state.audio.freq.raw).toBe(4);
  });

  test('lands on the second group when the pointer is on its whip', () => {
    const trace = TraceFactory.create(createLayer([CONTROL, TREATED])) as ErrorBarTrace;

    trace.moveToPointAndGetPointerGuidance(340, 200);
    const state = nonEmptyState(trace);

    // Before the fix this resolved to control at the same category: the
    // category the reader clicked, and another series' reading.
    expect(state.text.z?.value).toBe('treated');
    expect(state.audio.freq.raw).toBe(5);
  });

  test('resolves to the estimate rather than to a bound', () => {
    const trace = TraceFactory.create(createLayer([CONTROL, TREATED])) as ErrorBarTrace;

    trace.moveToPointAndGetPointerGuidance(140, 200);
    const state = nonEmptyState(trace);

    // A pointer lands on the whip as a whole, and the estimate is what a
    // reader arriving there is asking for.
    expect(state.text.section).toBe('value');
    expect(state.audio.freq.raw).toBe(3);
  });

  test('an ungrouped chart still resolves its own samples', () => {
    buildChart(2);
    const trace = TraceFactory.create(createLayer(CONTROL as never)) as ErrorBarTrace;

    trace.moveToPointAndGetPointerGuidance(300, 200);

    expect(nonEmptyState(trace).audio.freq.raw).toBe(4);
  });
});
