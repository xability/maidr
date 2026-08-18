/**
 * A staircase Plot drew is a step chart, not a chart to skip (#1073).
 *
 * `parsePathVertices` refuses a path whose vertex count does not match the
 * datum indices Plot bound to it, because a `curveBasis` spline draws through
 * control points that are not the data and announcing its corners would be
 * announcing numbers the chart does not contain. A step curve was refused by
 * the same rule and for a reason that does not apply to it: a staircase passes
 * through every sample and adds a corner between each pair, so the samples are
 * all there and the corners say which convention drew them.
 *
 * The whole reading therefore comes off the rendered path, with nothing
 * declared. That is the opposite of the d3 binder (#1066), which has to be
 * told — it reads `__data__` and never looks at the path. What makes the
 * difference here is that Plot binds the datum indices to the path, so how
 * many samples there should be is known, which is what lets the surplus
 * vertices be identified as corners rather than as data.
 *
 * Every assertion below is against a chart the real Plot 0.6.17 drew from the
 * hypnogram written in `fixtures.ts`: hours 0-3 at stages 1, 1, 3, 2.
 */

import type { LinePoint, MaidrLayer } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

/** The hypnogram every step fixture was drawn from. */
const SAMPLES: LinePoint[] = [
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 2, y: 3 },
  { x: 3, y: 2 },
];

function layerOf(key: Parameters<typeof mountFixture>[0]): MaidrLayer | null {
  const { element } = mountFixture(key);
  const maidr = observablePlotToMaidr(element);
  return maidr?.subplots[0][0].layers[0] ?? null;
}

/**
 * Reads a chart whose line was redrawn along `d`.
 *
 * The four samples and both scales stay the fixture's; only the path changes,
 * which is how a shape Plot would never draw can still be put in front of the
 * parser.
 */
function readingOf(d: string): unknown {
  const { element, svg } = mountFixture('stepMidLine');
  svg.querySelector('g[aria-label="line"] path')?.setAttribute('d', d);
  return observablePlotToMaidr(element);
}

describe('a line drawn with a step curve', () => {
  it('is read as a step chart rather than skipped', () => {
    const layer = layerOf('stepAfterLine');

    expect(layer?.type).toBe(TraceType.STEP);
    // The samples are a line's. What a step adds is how the model reads
    // between them: by transition, in runs, rather than sample by sample.
    expect(layer?.data as LinePoint[][]).toEqual([SAMPLES]);
  });

  it('names step-after as a riser at the next sample', () => {
    expect(layerOf('stepAfterLine')?.stepDirection).toBe('hv');
  });

  it('names step-before as a riser at the current sample', () => {
    // Same seven vertices as step-after over the same four samples, and the
    // same samples come back — only the corners are reflected, which is the
    // whole of what tells the two apart.
    const layer = layerOf('stepBeforeLine');

    expect(layer?.stepDirection).toBe('vh');
    expect(layer?.data as LinePoint[][]).toEqual([SAMPLES]);
  });

  it('names a centred curve mid, and substitutes the samples it does not draw', () => {
    // `curve: 'step'` draws eight vertices for four samples and the interior
    // hours are not among them — only the midpoints are. Hours 1 and 2 come
    // back by walking out from the first sample, and the chart still announces
    // 1 and 2 rather than the midpoints it was drawn through.
    const layer = layerOf('stepMidLine');

    expect(layer?.type).toBe(TraceType.STEP);
    expect(layer?.stepDirection).toBe('mid');
    expect(layer?.data as LinePoint[][]).toEqual([SAMPLES]);
  });

  it('tells the conventions apart on a chart where only the corners differ', () => {
    // A flat staircase is the case where the two conventions draw the same
    // levels: every corner sits at the level of the sample behind it either
    // way, so the corner's *x* is the only thing that separates them. Checking
    // the level alone would read this chart as `hv` — the convention tried
    // first — whichever way it was actually drawn.
    expect(layerOf('flatStepBefore')?.stepDirection).toBe('vh');
    expect(layerOf('flatStepAfter')?.stepDirection).toBe('hv');
  });

  it('reads the smallest staircase there is', () => {
    // Two samples and one riser. Nothing about the reading is special, which
    // is the point: the count rule is `2n - 1` all the way down.
    const layer = layerOf('twoSampleStep');

    expect(layer?.type).toBe(TraceType.STEP);
    expect(layer?.stepDirection).toBe('hv');
    expect(layer?.data as LinePoint[][]).toEqual([[{ x: 0, y: 1 }, { x: 1, y: 3 }]]);
  });

  it('refuses a path whose corners are not risers', () => {
    // The two cases below are hand-built rather than captured, because no
    // chart Plot draws reaches them: every gappy and non-interpolating curve
    // measured misses `2n - 1` and `2n` outright, so a bad path of exactly the
    // right length has to be written down. They are worth writing down —
    // between them they are the whole difference between parsing a staircase
    // and assuming one, and each is refused by a different check, so one
    // example would leave the other check deletable with the suite still
    // green.
    //
    // The odd vertices here sit exactly on the midpoints, so the substitution
    // walks out to 620 and lands on the last vertex — the arithmetic check
    // passes. What fails is the shape: the corners step diagonally instead of
    // holding a level and rising, so nothing here is a transition. Accepted,
    // it would announce four samples with levels taken off passing points.
    expect(readingOf('M40,370L136.667,370L200,300L330,300L250,200L523.333,200L300,100L620,100'))
      .toBeNull();
  });

  it('refuses risers that are not midway between the samples', () => {
    // Vertical risers at the right levels, so the shape passes for a centred
    // staircase — but their x are not midpoints, and the substitution walks
    // out to 260 where the path ends at 620. Accepted, it would announce four
    // samples at positions the chart never drew.
    expect(readingOf('M40,370L100,370L100,300L150,300L150,200L200,200L200,100L620,100'))
      .toBeNull();
  });

  it('goes on refusing a curve that does not pass through the data', () => {
    // `curveBasis` is the case the vertex-count rule was written for, and it
    // stays refused: its corners are control points, so reading them would
    // announce values the chart never held. A chart whose only mark is unread
    // produces no schema at all.
    expect(layerOf('basisLine')).toBeNull();
  });
});

describe('a stacked area drawn with a step curve', () => {
  it('reads each band\'s own height, not the running total', () => {
    // The lower edge is the series below rather than the frame, and it is
    // stepped too — so the halves stay aligned and the same sample indices
    // have to cut both. Cutting only the top edge would pair each sample with
    // whichever corner happened to share its index.
    const layer = layerOf('stackedStepArea');

    expect(layer?.stepDirection).toBe('hv');
    expect(layer?.type).toBe(TraceType.STACKED_AREA);
    const bands = layer?.data as LinePoint[][];
    // The `a` band is 1, 2, 3, 4 by construction; `b` is a flat 2 above it.
    // Approximately, because a band's height is the difference of two edges
    // that were each rounded on the way into the `d` attribute — the adapter's
    // documented precision floor for a band, and nothing to do with the step
    // reading. Whole units apart is what distinguishes a baseline cut to the
    // samples from one left as drawn.
    for (const [index, expected] of [1, 2, 3, 4].entries())
      expect(bands[0][index].y).toBeCloseTo(expected, 3);
    for (const point of bands[1])
      expect(point.y).toBeCloseTo(2, 3);
  });
});

describe('an area drawn with a step curve', () => {
  it('stays an area and carries the convention', () => {
    // An area's trace reads `stepDirection` to tell a stepped band's risers
    // from its samples, so the field rides along without changing what the
    // layer is — the same split `bindD3Area` makes.
    const layer = layerOf('steppedArea');

    expect(layer?.type).toBe(TraceType.AREA);
    expect(layer?.stepDirection).toBe('hv');
  });

  it('reads the band heights, not the stepped baseline', () => {
    // The closed loop is the stepped top edge followed by a stepped baseline
    // of equal length, so the two halves stay aligned and the same sample
    // indices cut both. Cutting only one would pair each sample with a corner.
    expect(layerOf('steppedArea')?.data as LinePoint[][]).toEqual([SAMPLES]);
  });
});
