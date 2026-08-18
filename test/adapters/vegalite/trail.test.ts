/**
 * A Vega-Lite `trail` is the line it draws (#1063).
 *
 * `resolveTraceType` had no case for the mark, so it fell to `default: null`
 * and the whole chart was dropped — no layers, no announcement, nothing. But
 * Vega-Lite's own description is "similar to the `line` mark but a trail can
 * have variable widths", and the two compile the same way.
 *
 * Measured by compiling and rendering both over the same rows in Chromium
 * against Vega-Lite 5 / Vega 5:
 *
 * | `mark`  | compiled Vega mark | rendered group                        |
 * | ------- | ------------------ | ------------------------------------- |
 * | `trail` | `trail`            | `g.mark-trail.role-mark.marks > path` |
 * | `line`  | `line`             | `g.mark-line.role-mark.marks > path`  |
 *
 * Vega has a `trail` mark of its own, unlike `tick` and `geoshape` — so
 * `markToCssClass` and `markToChildElement` are both already right for it by
 * their default branches, and this is one missing case rather than a new mark
 * the adapter has to learn.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

const VALUES = [
  { t: 1, v: 10, w: 1 },
  { t: 2, v: 30, w: 4 },
  { t: 3, v: 20, w: 2 },
];

function trailSpec(overrides: Partial<VegaLiteSpec> = {}): VegaLiteSpec {
  return {
    data: { values: VALUES },
    mark: 'trail',
    encoding: {
      x: { field: 't', type: 'quantitative' },
      y: { field: 'v', type: 'quantitative' },
      size: { field: 'w', type: 'quantitative' },
    },
    ...overrides,
  } as VegaLiteSpec;
}

function layersOf(spec: VegaLiteSpec): MaidrLayer[] {
  return vegaLiteToMaidr(spec).subplots[0][0].layers;
}

describe('vega-lite trail mark', () => {
  it('reads as the line it draws rather than being dropped', () => {
    const layers = layersOf(trailSpec());

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.LINE);
    expect(layers[0].data as LinePoint[][]).toEqual([[
      { x: 1, y: 10 },
      { x: 2, y: 30 },
      { x: 3, y: 20 },
    ]]);
  });

  it('reads exactly what the same spec drawn as a line reads', () => {
    // The width is the only thing a trail adds, and it has nowhere to go in
    // `LinePoint`. Everything else has to come out identical, or the mark is
    // being read as something other than the line it is.
    const asTrail = layersOf(trailSpec());
    const asLine = layersOf(trailSpec({ mark: 'line' } as Partial<VegaLiteSpec>));

    expect(asTrail[0].data).toEqual(asLine[0].data);
    expect(asTrail[0].axes).toEqual(asLine[0].axes);
  });

  it('highlights through the group Vega renders it into', () => {
    const [layer] = layersOf(trailSpec());

    // Vega has a `trail` mark of its own, so the class is the mark's own name
    // and the child is a `<path>` — neither needs rewriting the way a `tick`
    // or a `geoshape` does. Both group spellings are offered, as they are for
    // every other line-shaped layer, since a spec may or may not be layered.
    //
    // `mark-trail role-mark marks` is the class list Vega really renders, read
    // off the live chart, so the first half of this resolves.
    expect(layer.selectors).toEqual([
      'g.mark-trail.role-mark.marks > path, g.mark-trail.role-mark.layer_0_marks > path',
    ]);
  });

  it('splits a coloured trail into one series per group, as a line does', () => {
    const layers = layersOf(trailSpec({
      data: {
        values: [
          { t: 1, v: 10, g: 'A' },
          { t: 2, v: 30, g: 'A' },
          { t: 1, v: 5, g: 'B' },
          { t: 2, v: 15, g: 'B' },
        ],
      },
      encoding: {
        x: { field: 't', type: 'quantitative' },
        y: { field: 'v', type: 'quantitative' },
        color: { field: 'g', type: 'nominal' },
      },
    } as Partial<VegaLiteSpec>));

    expect(layers[0].type).toBe(TraceType.LINE);
    expect((layers[0].data as LinePoint[][]).map(series => series.map(point => point.y)))
      .toEqual([[10, 30], [5, 15]]);
  });

  it('keeps the staircase reading when a trail is interpolated as steps', () => {
    // The whole line family comes with the case, `stepDirection` included.
    const layers = layersOf(trailSpec({
      mark: { type: 'trail', interpolate: 'step-after' },
    } as Partial<VegaLiteSpec>));

    expect(layers[0].type).toBe(TraceType.STEP);
    expect(layers[0].stepDirection).toBe('hv');
  });
});
