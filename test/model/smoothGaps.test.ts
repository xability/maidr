import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
/**
 * How a fitted curve with a gap sounds.
 *
 * A smooth layer's audio carries the neighbouring samples so the service can
 * play a glissando, and the service hands them to `setValueCurveAtTime`, which
 * throws on a non-finite value. A gap (`y: null`, stored as NaN) inside that
 * array silenced the tone and, through the throw, every observer after audio.
 */
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

const GAPPED: LinePoint[] = [
  { x: 1, y: 2 },
  { x: 2, y: null },
  { x: 3, y: 4 },
];

/**
 * Build a smooth layer over one curve. `selectors` is omitted so the trace
 * needs no DOM.
 *
 * @param data - The curve's samples
 * @returns A layer definition
 */
function layer(data: LinePoint[]): MaidrLayer {
  return {
    id: 'smooth-gaps-layer',
    type: TraceType.SMOOTH,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: [data],
  };
}

/**
 * The audio frequency the trace reports at a column.
 *
 * @param data - The curve's samples
 * @param col - The column to move to
 * @returns The frequency part of the audio state
 */
function freqAt(data: LinePoint[], col: number): NonEmptyTraceState['audio']['freq'] {
  const trace = TraceFactory.create(layer(data));
  trace.moveOnce('FORWARD');
  for (let i = 0; i < col; i++) trace.moveOnce('FORWARD');
  return (trace.state as NonEmptyTraceState).audio.freq;
}

describe('a fitted curve with a gap', () => {
  test('beside the gap the glissando carries only finite samples', () => {
    expect(freqAt(GAPPED, 0).raw).toEqual([2, 2, 2]);
    expect(freqAt(GAPPED, 2).raw).toEqual([4, 4, 4]);
  });

  test('on the gap the value is a plain NaN, which the service plays as the empty tone', () => {
    const raw = freqAt(GAPPED, 1).raw;
    expect(typeof raw).toBe('number');
    expect(Number.isNaN(raw)).toBe(true);
  });

  test('a curve with no gap still carries its neighbours', () => {
    const whole: LinePoint[] = [
      { x: 1, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 4 },
    ];
    expect(freqAt(whole, 1).raw).toEqual([2, 3, 4]);
  });
});
