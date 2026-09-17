import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { BarPoint, MaidrLayer, RugPoint, ScatterPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A Vega-Lite `tick` bound to one positional channel is a rug: every mark
 * stands on that axis at its observation's value, and the other axis
 * carries nothing (#1132).
 *
 * It resolved to a scatter, which put a constant on the unbound axis and
 * pitched every tick at the same note. These cases pin the rug reading, and
 * that a tick with both channels bound -- a strip plot against a category,
 * or a scatter drawn with ticks -- still reads as it always did.
 */

const LATENCIES = {
  values: [
    { seconds: 2.2 },
    { seconds: 1.5 },
    { seconds: 9.4 },
    { seconds: 3.1 },
  ],
};

/**
 * The one layer a spec converts to.
 * @param spec - The spec to convert
 * @returns Its layer
 */
function onlyLayer(spec: VegaLiteSpec): MaidrLayer {
  const layers = vegaLiteToMaidr(spec).subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite tick marks on one axis', () => {
  it('converts a tick bound to x alone into a vertical rug', () => {
    const layer = onlyLayer({
      data: LATENCIES,
      mark: 'tick',
      encoding: { x: { field: 'seconds', type: 'quantitative', title: 'Seconds' } },
    });

    expect(layer.type).toBe(TraceType.RUG);
    expect(layer.orientation).toBeUndefined();
    // The producer's order, not sorted: the trace sorts, and the selector
    // pairs elements in document order, which is this order.
    expect(layer.data as RugPoint[]).toEqual([
      { x: 2.2 },
      { x: 1.5 },
      { x: 9.4 },
      { x: 3.1 },
    ]);
    expect(layer.axes?.x?.label).toBe('Seconds');
    // Vega-Lite compiles a tick to a thin rect, drawn as a path.
    expect(layer.selectors).toBe(
      'g.mark-rect.role-mark.marks path, g.mark-rect.role-mark.layer_0_marks path',
    );
  });

  it('converts a tick bound to y alone into a horizontal rug reading y', () => {
    const layer = onlyLayer({
      data: LATENCIES,
      mark: 'tick',
      encoding: { y: { field: 'seconds', type: 'quantitative', title: 'Seconds' } },
    });

    expect(layer.type).toBe(TraceType.RUG);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as RugPoint[]).toEqual([
      { y: 2.2 },
      { y: 1.5 },
      { y: 9.4 },
      { y: 3.1 },
    ]);
    expect(layer.axes?.y?.label).toBe('Seconds');
  });

  it('still reads a tick against a category as a dot plot', () => {
    const layer = onlyLayer({
      data: { values: [{ group: 'a', v: 1 }, { group: 'b', v: 2 }] },
      mark: 'tick',
      encoding: {
        x: { field: 'v', type: 'quantitative' },
        y: { field: 'group', type: 'nominal' },
      },
    });

    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.data as BarPoint[]).toEqual([{ x: 1, y: 'a' }, { x: 2, y: 'b' }]);
  });

  it('still reads a tick on two quantitative axes as a scatter', () => {
    const layer = onlyLayer({
      data: { values: [{ a: 1, b: 2 }, { a: 3, b: 4 }] },
      mark: 'tick',
      encoding: {
        x: { field: 'a', type: 'quantitative' },
        y: { field: 'b', type: 'quantitative' },
      },
    });

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data as ScatterPoint[]).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  });

  it('does not read a tick on one categorical axis as a rug of nothing', () => {
    // A name is not a position. Such a chart has nothing to sonify either
    // way; what matters is that it is not announced as a rug and then read
    // as an empty one.
    const layer = onlyLayer({
      data: { values: [{ group: 'a' }, { group: 'b' }] },
      mark: 'tick',
      encoding: { x: { field: 'group', type: 'nominal' } },
    });

    expect(layer.type).not.toBe(TraceType.RUG);
  });

  it('leaves a point mark on one axis as a scatter, since only a tick draws a rug', () => {
    // A lone point on one axis is unusual, and the point reading is what it
    // has always had; the rug reading is claimed by the mark a rug is drawn
    // with, so a chart is not re-read on the strength of a missing channel.
    const layer = onlyLayer({
      data: LATENCIES,
      mark: 'point',
      encoding: { x: { field: 'seconds', type: 'quantitative' } },
    });

    expect(layer.type).toBe(TraceType.SCATTER);
  });
});
