/**
 * What reading a categorical axis costs.
 *
 * `valueAtPixel` asks a band scale which category contains a pixel, and the
 * band boundaries are not on the scale — they have to be built by applying it
 * to every category and sorting the results. The adapter asks that question
 * once per drawn element, so rebuilding the boundaries each time makes reading
 * a categorical mark quadratic in the size of its axis: a 20-series by
 * 200-category stack is 4,000 rects over a 200-entry domain, and the watcher
 * re-runs the whole conversion on every OJS reactive redraw — a slider drag
 * re-converts per frame, on the main thread.
 *
 * The boundaries are the same for every element of one conversion, so the
 * count of `apply` calls is the shape worth pinning.
 */

import type { PlotScale } from '@adapters/observable/types';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { mountFixture } from './helpers';

/**
 * Mounts a fixture with its x scale's `apply` counted.
 *
 * @param key - Which fixture to mount.
 * @returns The chart, and a reader for the running count.
 */
function countingX(key: Parameters<typeof mountFixture>[0]): {
  element: Element;
  applyCalls: () => number;
} {
  const { element } = mountFixture(key);
  const source = element as Element & { scale: (name: string) => PlotScale | undefined };
  const read = source.scale.bind(source);
  let calls = 0;
  // Wrapped once per name and cached, so the adapter holds the same scale
  // object throughout a conversion — which is what Plot hands it too.
  const wrapped = new Map<string, PlotScale | undefined>();

  Object.defineProperty(element, 'scale', {
    configurable: true,
    value: (name: string): PlotScale | undefined => {
      if (!wrapped.has(name)) {
        const scale = read(name);
        const apply = scale?.apply;
        wrapped.set(
          name,
          scale && typeof apply === 'function' && name === 'x'
            ? {
                ...scale,
                apply: (value: unknown) => {
                  calls += 1;
                  return apply(value);
                },
              }
            : scale,
        );
      }
      return wrapped.get(name);
    },
  });

  return { element, applyCalls: () => calls };
}

describe('reading a band scale during a conversion', () => {
  it('walks the category domain once, not once per drawn element', () => {
    // Three bars over three categories. Rebuilt per element that is nine
    // `apply` calls and three sorts; built once it is three and one.
    const { element, applyCalls } = countingX('bar');

    observablePlotToMaidr(element);

    expect(applyCalls()).toBe(3);
  });

  it('still reads every bar back to its own category', () => {
    const { element } = countingX('bar');

    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];

    expect((layer?.data as { x: string | number }[]).map(point => point.x))
      .toEqual(['Mon', 'Tue', 'Wed']);
  });
});
