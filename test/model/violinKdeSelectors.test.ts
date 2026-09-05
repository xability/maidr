import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { ViolinKdeTrace } from '@model/violin';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A horizontal violin-KDE layer with no `selectors` threw in the constructor.
 *
 * The horizontal branch reversed the selectors to match the reversed points
 * by spreading them -- `[...layer.selectors]` -- and `selectors` is optional
 * in the grammar, so spreading `undefined` threw `layer.selectors is not
 * iterable`. The vertical branch never spread and reached the guard in
 * `mapToSvgElements`, so the same layer the other way up was fine.
 *
 * The Chart.js extractor emits exactly this shape -- a VIOLIN_KDE layer with
 * an orientation and no selectors -- so a sideways Chart.js violin took the
 * whole figure down with it.
 */
const CURVES: ViolinKdePoint[][] = [
  [
    { x: 'setosa', y: 1, density: 0.2 },
    { x: 'setosa', y: 2, density: 0.8 },
  ],
  [
    { x: 'versicolor', y: 3, density: 0.5 },
    { x: 'versicolor', y: 4, density: 0.3 },
  ],
];

/**
 * Build a violin-KDE layer without any selectors.
 * @param orientation - Which way the violins lie
 * @param selectors - Selectors to carry, when the layer carries any
 * @returns A layer definition
 */
function kdeLayer(orientation: Orientation, selectors?: MaidrLayer['selectors']): MaidrLayer {
  return {
    id: 'kde',
    type: TraceType.VIOLIN_KDE,
    orientation,
    axes: { x: { label: 'Species' }, y: { label: 'Petal length' } },
    data: CURVES,
    ...(selectors === undefined ? {} : { selectors }),
  };
}

describe('a violin-KDE layer without selectors', () => {
  test('constructs when the violins lie horizontally', () => {
    expect(() => new ViolinKdeTrace(kdeLayer(Orientation.HORIZONTAL))).not.toThrow();
  });

  test('still reads its first violin', () => {
    const trace = new ViolinKdeTrace(kdeLayer(Orientation.HORIZONTAL));

    trace.moveOnce('FORWARD');

    expect(trace.state.empty).toBe(false);
  });

  test('constructs when the violins stand vertically', () => {
    expect(() => new ViolinKdeTrace(kdeLayer(Orientation.VERTICAL))).not.toThrow();
  });
});
