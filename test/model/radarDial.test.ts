/**
 * @jest-environment jsdom
 */

/**
 * A radar or polar area read round the dial its layer declares.
 *
 * Right moves clockwise round a pie, and each slice is panned to where it is
 * drawn, because the layer says where the ring starts and which way it runs.
 * A radar and a polar area take the same two keys. Recharts draws a coxcomb
 * as a `<Pie>` left at its defaults, counterclockwise from 3 o'clock, and read
 * as clockwise from 12 its Right walked the wedges counterclockwise and
 * panned March, drawn at 10 o'clock, to the right.
 */

import type { RadarTrace } from '@model/radar';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { AudioState, NonEmptyTraceState } from '@type/state';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { PieDirection, TraceType } from '@type/grammar';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const DEATHS = [120, 84, 61, 39, 27, 18];

/** The six months of the Recharts coxcomb example, one series. */
const COXCOMB: LinePoint[][] = [MONTHS.map((x, index) => ({ x, y: DEATHS[index] }))];

/** sin 60°: a spoke at 2, 4, 8 or 10 o'clock, panned that far off centre. */
const SIN_60 = Math.sqrt(3) / 2;

/**
 * A polar area layer over the six months.
 * @param extra Keys the layer declares beyond its data
 * @param data The spokes the layer carries
 * @returns The layer
 */
function coxcomb(extra: Partial<MaidrLayer> = {}, data: LinePoint[][] = COXCOMB): MaidrLayer {
  return {
    id: 'coxcomb',
    type: TraceType.POLAR_AREA,
    axes: { x: { label: 'Month' }, y: { label: 'Deaths' } },
    data,
    ...extra,
  };
}

/**
 * The stereo position the audio service computes from a state, which reads
 * the pan as `interpolate(x, 0, cols - 1, -1, 1)`.
 * @param audio The audio state to read
 * @returns The pan, from -1 (hard left) to 1 (hard right)
 */
function pan(audio: AudioState): number {
  const { x, cols } = audio.panning;
  return (x / (cols - 1)) * 2 - 1;
}

/**
 * The trace state at one spoke of one series.
 * @param trace The trace to move
 * @param row The series
 * @param col The spoke, in walking order
 * @returns The populated state
 */
function stateAt(trace: RadarTrace, row: number, col: number): NonEmptyTraceState {
  trace.moveToIndex(row, col);
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a populated trace state');
  }
  return state;
}

/**
 * What Right reaches on a series, spoke by spoke: the category and its pan.
 * @param layer The layer to read
 * @param row The series
 * @returns One entry per spoke, in walking order
 */
function walk(layer: MaidrLayer, row = 0): Array<[string, number]> {
  const trace = TraceFactory.create(layer) as RadarTrace;
  const series = (layer.data as LinePoint[][])[row];
  return series.map((_, col) => {
    const state = stateAt(trace, row, col);
    return [String(state.text.main.value), pan(state.audio)];
  });
}

/**
 * Asserts a walk visits these categories, panned to these positions.
 * @param actual What the walk reached
 * @param expected The categories and pans, in walking order
 */
function expectWalk(actual: Array<[string, number]>, expected: Array<[string, number]>): void {
  expect(actual.map(([category]) => category)).toEqual(expected.map(([category]) => category));
  actual.forEach(([, actualPan], index) => {
    expect(actualPan).toBeCloseTo(expected[index][1], 10);
  });
}

describe('a radar or polar area read round the dial it declares', () => {
  it('declaring nothing, starts at 12 o\'clock and runs clockwise, as before', () => {
    expectWalk(walk(coxcomb()), [
      ['Jan', 0],
      ['Feb', SIN_60],
      ['Mar', SIN_60],
      ['Apr', 0],
      ['May', -SIN_60],
      ['Jun', -SIN_60],
    ]);
  });

  it('walks a counterclockwise coxcomb clockwise, each wedge panned where it is drawn', () => {
    // The Recharts example: six wedges from 3 o'clock, counterclockwise, so
    // January is centred at 2 o'clock, February at 12, March at 10, April at
    // 8, May at 6 and June at 4. Right starts at June, the first wedge
    // clockwise of 3 o'clock, and goes round to January.
    expectWalk(walk(coxcomb({ startAngle: 60, direction: PieDirection.COUNTERCLOCKWISE })), [
      ['Jun', SIN_60],
      ['May', 0],
      ['Apr', -SIN_60],
      ['Mar', -SIN_60],
      ['Feb', 0],
      ['Jan', SIN_60],
    ]);
  });

  it('turns every spoke with the start angle', () => {
    // From 3 o'clock, clockwise: 3, 5, 7, 9, 11 and 1 o'clock.
    expectWalk(walk(coxcomb({ startAngle: 90 })), [
      ['Jan', 1],
      ['Feb', 0.5],
      ['Mar', -0.5],
      ['Apr', -1],
      ['May', -0.5],
      ['Jun', 0.5],
    ]);
  });

  it('reads the two keys on a radar as well', () => {
    expectWalk(walk({ ...coxcomb({ direction: PieDirection.COUNTERCLOCKWISE }), type: TraceType.RADAR }), [
      ['Jun', SIN_60],
      ['May', SIN_60],
      ['Apr', 0],
      ['Mar', -SIN_60],
      ['Feb', -SIN_60],
      ['Jan', 0],
    ]);
  });

  it('reads a start angle and a counterclockwise direction together on a radar', () => {
    // From 3 o'clock, counterclockwise: January at 3, February at 1, March at
    // 11, April at 9, May at 7 and June at 5. Right starts at June.
    const layer = { ...coxcomb({ startAngle: 90, direction: PieDirection.COUNTERCLOCKWISE }), type: TraceType.RADAR };

    expectWalk(walk(layer), [
      ['Jun', 0.5],
      ['May', -0.5],
      ['Apr', -1],
      ['Mar', -0.5],
      ['Feb', 0.5],
      ['Jan', 1],
    ]);
  });

  it('reads a start angle that is not a number as 12 o\'clock', () => {
    const asDeclaredNothing = walk(coxcomb());

    expectWalk(walk(coxcomb({ startAngle: Number.NaN })), asDeclaredNothing);
    expectWalk(walk(coxcomb({ startAngle: Number.POSITIVE_INFINITY })), asDeclaredNothing);
  });

  it('turns the braille row with the walk', () => {
    const trace = TraceFactory.create(coxcomb({ startAngle: 60, direction: PieDirection.COUNTERCLOCKWISE })) as RadarTrace;

    const { braille } = stateAt(trace, 0, 0);

    expect(braille).toMatchObject({ values: [[...DEATHS].reverse()], col: 0 });
  });

  it('turns a shorter series round within its own length', () => {
    // A ragged layer lists a short series as the first spokes of the
    // drawing. Turned round, its first column is its own last spoke, April,
    // which must be heard where the full series' April is.
    const ragged: LinePoint[][] = [
      MONTHS.map((x, index) => ({ x, y: DEATHS[index], z: 'All' })),
      MONTHS.slice(0, 4).map((x, index) => ({ x, y: DEATHS[index] / 2, z: 'Some' })),
    ];
    const layer = coxcomb({ startAngle: 60, direction: PieDirection.COUNTERCLOCKWISE }, ragged);

    expectWalk(walk(layer, 1), [
      ['Apr', -SIN_60],
      ['Mar', -SIN_60],
      ['Feb', 0],
      ['Jan', SIN_60],
    ]);
  });

  it('keeps the outline on the wedge being read', () => {
    // The wedges are matched in the order they are drawn, which is the
    // order the layer lists them; turned round, the first stop is June's.
    document.body.innerHTML = '';
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    for (const month of MONTHS) {
      const wedge = document.createElementNS(SVG_NAMESPACE, 'path');
      wedge.setAttribute('class', 'wedge');
      wedge.setAttribute('data-month', month);
      wedge.setAttribute('d', 'M 0 0 L 10 0 L 10 10 Z');
      svg.appendChild(wedge);
    }
    document.body.appendChild(svg);

    const trace = TraceFactory.create(coxcomb({
      startAngle: 60,
      direction: PieDirection.COUNTERCLOCKWISE,
      selectors: ['svg path.wedge'],
    })) as RadarTrace;

    const outlined = MONTHS.map((_, col) => {
      const { highlight } = stateAt(trace, 0, col);
      if (highlight.empty) {
        throw new Error(`Expected a highlight at column ${col}`);
      }
      const element = Array.isArray(highlight.elements) ? highlight.elements[0] : highlight.elements;
      return element.getAttribute('data-month');
    });

    expect(outlined).toEqual(['Jun', 'May', 'Apr', 'Mar', 'Feb', 'Jan']);
  });
});
