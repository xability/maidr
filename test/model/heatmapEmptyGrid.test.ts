import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';

/**
 * A heatmap with no rows threw in the constructor as soon as it carried a
 * selector. `mapToSvgElements` read the column count off `heatmapValues[0]`
 * before it had checked there was a row to read it from, so the same layer
 * that constructs and reports empty without a selector took the whole figure
 * down with one -- and a producer with nothing to draw still emits the
 * selector its template always emits.
 */
function heatmapLayer(selectors?: MaidrLayer['selectors']): MaidrLayer {
  const data: HeatmapData = { x: [], y: [], points: [] };
  return {
    id: 'empty-heatmap',
    type: TraceType.HEATMAP,
    axes: { x: { label: 'Day' }, y: { label: 'Hour' } },
    data,
    ...(selectors === undefined ? {} : { selectors }),
  };
}

describe('a heatmap with no cells', () => {
  test('constructs without a selector and reports empty', () => {
    const trace = new Heatmap(heatmapLayer());

    expect(trace.state.empty).toBe(true);
  });

  test('constructs with a pattern selector and reports empty', () => {
    const build = (): Heatmap => new Heatmap(heatmapLayer('rect'));

    expect(build).not.toThrow();
    expect(build().state.empty).toBe(true);
  });

  test('constructs with a per-cell selector grid and reports empty', () => {
    const build = (): Heatmap => new Heatmap(heatmapLayer([]));

    expect(build).not.toThrow();
    expect(build().state.empty).toBe(true);
  });
});
