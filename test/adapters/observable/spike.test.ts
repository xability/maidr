/**
 * A spike stands a magnitude at a place (#1098).
 *
 * Both halves are written down: the place is the mark's `transform`, and the
 * magnitude is how far the spike reaches, put back through the `length` scale
 * that sized it. It is announced as a scatter carrying `z`, which the trace
 * speaks alongside the position and scales into an audio intensity — so the
 * magnitude is both said and heard.
 *
 * A vector that points somewhere is refused. A flow field's direction is
 * usually what it was drawn for, and the grammar has no field for a bearing,
 * so reading only the magnitude would announce half a chart without saying
 * which half.
 */

import type { ScatterPoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

function layersOf(key: Parameters<typeof mountFixture>[0]): { type: TraceType; data: unknown }[] {
  const { element } = mountFixture(key);
  return observablePlotToMaidr(element)?.subplots[0][0].layers ?? [];
}

function spikesOf(key: Parameters<typeof mountFixture>[0]): [number, number, number][] {
  const points = layersOf(key)[0]?.data as ScatterPoint[];
  return points.map(point => [point.x, point.y, Number(point.z)]);
}

describe('a spike mark', () => {
  it('reads each spike\'s magnitude through the length scale', () => {
    // Drawn 7.5, 18 and 12 pixels tall against a scale of [0, 12] → [0, 18],
    // which returns 5, 12 and 8 — the magnitudes, not the pixels.
    expect(layersOf('spikeMap')[0]?.type).toBe(TraceType.SCATTER);
    expect(spikesOf('spikeMap')).toEqual([[1, 2, 5], [3, 4, 12], [5, 1, 8]]);
  });

  it('reads a vector the same way when it points nowhere', () => {
    // `Plot.vector` draws a shaft and a head instead of a triangle, and the
    // head is at the far end, so the reach is the same measurement. With no
    // rotation channel there is no direction being dropped.
    expect(spikesOf('plainVector')).toEqual([[1, 2, 5], [3, 4, 12], [5, 1, 8]]);
  });
});

describe('a spike that reaches downward', () => {
  it('keeps the sign the direction carries', () => {
    // 5, -8 and 12. The length scale runs [0, 12] → [0, 18] and sizes a
    // distance, so -8 and 8 are drawn the same twelve pixels apart — one up,
    // one down. Read off the raw pixels, a spike map of net migration would
    // announce every loss as a gain.
    expect(spikesOf('signedSpikes')).toEqual([[1, 2, 5], [3, 4, -8], [5, 1, 12]]);
  });
});

describe('a spike with no magnitude at all', () => {
  it('reads the zero rather than dropping the place', () => {
    // Magnitudes 5, 0 and 12. A magnitude of exactly zero is still drawn --
    // `M-3.5,0L0,0L3.5,0`, a triangle with no height -- so the chart has an
    // answer at that place. Dropped instead, a spike map of net migration
    // would leave out every county with no net change, and a reader sweeping
    // the map would hear a hole where the answer is "none".
    expect(spikesOf('zeroSpike')).toEqual([[1, 2, 5], [3, 4, 0], [5, 1, 12]]);
  });

  it('reads it as a positive zero, not a negative one', () => {
    // The sign comes off the direction of the rise, and a flat spike rises
    // neither way. Signing a magnitude of zero downward would put a minus in
    // front of a number that has no side to be on.
    const [, [, , z]] = spikesOf('zeroSpike');
    expect(Object.is(z, 0)).toBe(true);
  });
});

describe('a vector with no magnitude channel', () => {
  it('is handed back rather than measured in pixels', () => {
    // Every arrow is the same default height and there is no length scale, so
    // the only number available is the mark's own drawn size. Announced, it
    // would be the same value at every point — a reading about the styling.
    expect(layersOf('lengthlessVector')).toHaveLength(0);
  });
});

describe('a vector that points somewhere', () => {
  it('is handed back rather than read as a spike', () => {
    // 0, 45 and 90 degrees. Read as spikes, the magnitudes would be right and
    // the chart would still be misdescribed: a flow field is about where each
    // arrow points.
    expect(layersOf('rotatedVector')).toHaveLength(0);
  });

  it('is handed back even when every rotation is zero', () => {
    // Plot writes `rotate(0)` on every mark here, so the transform says a
    // direction channel was declared whatever its values came to. That a
    // constant direction is still a direction is a judgement the drawing
    // supports — unlike a constant floor, which the drawing cannot tell from
    // a chosen base.
    expect(layersOf('unrotatedVector')).toHaveLength(0);
  });
});
