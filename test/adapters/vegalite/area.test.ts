import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';

/**
 * Two series over three x values, the shape every spec below is built from.
 * Written inline rather than fixtured because the assertions are about the
 * trace *type* the converter picks, not about the values it carries.
 */
const ROWS = [
  { x: 1, y: 10, series: 'a' },
  { x: 2, y: 20, series: 'a' },
  { x: 3, y: 30, series: 'a' },
  { x: 1, y: 5, series: 'b' },
  { x: 2, y: 15, series: 'b' },
  { x: 3, y: 25, series: 'b' },
];

/**
 * Build a single-view spec for one mark, optionally with a series channel and
 * an explicit stack setting.
 * @param mark The Vega-Lite mark type
 * @param options Encoding fragments that decide the resolved trace type
 * @param options.series Whether to add a colour channel, making it multi-series
 * @param options.stack The `stack` setting to declare on the y channel
 * @param options.interpolate The mark's interpolation, e.g. `step-after`
 * @returns The spec to convert
 */
function spec(
  mark: string,
  options: { series?: boolean; stack?: unknown; interpolate?: string } = {},
): VegaLiteSpec {
  const { series = false, stack, interpolate } = options;
  return {
    data: { values: ROWS },
    mark: interpolate ? { type: mark, interpolate } : mark,
    encoding: {
      x: { field: 'x', type: 'quantitative' },
      y: {
        field: 'y',
        type: 'quantitative',
        ...(stack === undefined ? {} : { stack }),
      },
      ...(series ? { color: { field: 'series', type: 'nominal' } } : {}),
    },
  } as VegaLiteSpec;
}

/**
 * Convert a spec and return its only layer.
 * @param input The spec to convert
 * @returns The single produced layer
 */
function onlyLayer(input: VegaLiteSpec): MaidrLayer {
  const layers = vegaLiteToMaidr(input).subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite area marks', () => {
  it('resolves a single-series area to an area trace, not a line', () => {
    // The regression: `area` used to fall through to the `line` case, so an
    // area chart was announced to the user as a line chart.
    expect(onlyLayer(spec('area')).type).toBe(TraceType.AREA);
  });

  it('resolves a series-encoded area to a stacked area trace', () => {
    // Vega-Lite stacks an area by default as soon as a series channel is
    // present, so this is the common case rather than the exotic one. Read as
    // a line, the announcement carried the band height with nothing to say it
    // was not the stack's top edge.
    expect(onlyLayer(spec('area', { series: true })).type).toBe(TraceType.STACKED_AREA);
  });

  it('resolves an explicitly unstacked area to independent bands', () => {
    expect(onlyLayer(spec('area', { series: true, stack: false })).type).toBe(TraceType.AREA);
    expect(onlyLayer(spec('area', { series: true, stack: null })).type).toBe(TraceType.AREA);
  });

  it('resolves a normalized area to the normalized trace', () => {
    expect(onlyLayer(spec('area', { series: true, stack: 'normalize' })).type)
      .toBe(TraceType.NORMALIZED_AREA);
  });

  it('keeps a single-series area unstacked even when stack is on', () => {
    // `stack: 'zero'` with nothing to stack against is one band on a
    // baseline, which is what a plain area already is.
    expect(onlyLayer(spec('area', { stack: 'zero' })).type).toBe(TraceType.AREA);
  });

  it('leaves the line mark alone', () => {
    expect(onlyLayer(spec('line')).type).toBe(TraceType.LINE);
    expect(onlyLayer(spec('line', { series: true })).type).toBe(TraceType.LINE);
  });

  it('carries the same per-series data shape a line layer does', () => {
    const layer = onlyLayer(spec('area', { series: true }));
    const data = layer.data as LinePoint[][];

    expect(data).toHaveLength(2);
    expect(data[0]).toHaveLength(3);
    // Selectors are per series for the line family, and an area is drawn the
    // same way — one path per band.
    expect(Array.isArray(layer.selectors)).toBe(true);
    expect(layer.selectors).toHaveLength(2);
  });

  describe('stepped interpolation', () => {
    it('keeps an unstacked stepped area as a step trace', () => {
      // Nothing accumulates, so STEP loses nothing that AREA would preserve
      // and the staircase reading is the more specific one.
      expect(onlyLayer(spec('area', { interpolate: 'step-after' })).type)
        .toBe(TraceType.STEP);
    });

    it('prefers the stacked reading when a stepped area also stacks', () => {
      // Losing the staircase costs a nuance; losing the stacking makes the
      // announced number ambiguous, which is the worse failure.
      expect(onlyLayer(spec('area', { series: true, interpolate: 'step-after' })).type)
        .toBe(TraceType.STACKED_AREA);
    });
  });
});
