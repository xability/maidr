import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';

/** Two subcategories over two categories, the minimum a stack can be read on. */
const ROWS = [
  { x: 'a', y: 10, series: 'u' },
  { x: 'a', y: 30, series: 'v' },
  { x: 'b', y: 50, series: 'u' },
  { x: 'b', y: 50, series: 'v' },
];

/**
 * Build a single-view bar spec with a series channel and an explicit stack
 * setting on one axis.
 * @param options Which axis declares `stack`, and what it declares
 * @param options.stack The `stack` value to declare
 * @param options.axis Which axis carries the declaration
 * @param options.offset Whether to add an `xOffset` dodge channel
 * @returns The spec to convert
 */
function barSpec(
  options: { stack?: unknown; axis?: 'x' | 'y'; offset?: boolean } = {},
): VegaLiteSpec {
  const { stack, axis = 'y', offset = false } = options;
  const declare = (on: 'x' | 'y'): object =>
    stack === undefined || axis !== on ? {} : { stack };

  return {
    data: { values: ROWS },
    mark: 'bar',
    encoding: {
      x: { field: 'x', type: 'nominal', ...declare('x') },
      y: { field: 'y', type: 'quantitative', ...declare('y') },
      color: { field: 'series', type: 'nominal' },
      ...(offset ? { xOffset: { field: 'series', type: 'nominal' } } : {}),
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

describe('vega-Lite bar stacking', () => {
  it('stacks by default when a series channel is present', () => {
    expect(onlyLayer(barSpec()).type).toBe(TraceType.STACKED);
  });

  it('reads an explicit stack: false as dodged', () => {
    expect(onlyLayer(barSpec({ stack: false })).type).toBe(TraceType.DODGED);
  });

  it('reads an explicit stack: null as dodged', () => {
    // Vega-Lite spells "do not stack" as either `false` or `null`. A nullish
    // coalesce discards the `null` before the check can see it, falls through
    // to the other axis, and reports `undefined` — which reads as "stack by
    // default", the exact opposite of what the spec asked for.
    expect(onlyLayer(barSpec({ stack: null })).type).toBe(TraceType.DODGED);
  });

  it('reads stack: normalize as the normalized trace', () => {
    expect(onlyLayer(barSpec({ stack: 'normalize' })).type).toBe(TraceType.NORMALIZED);
  });

  it('honours a stack declared on the x axis for a horizontal bar', () => {
    expect(onlyLayer(barSpec({ stack: null, axis: 'x' })).type).toBe(TraceType.DODGED);
    expect(onlyLayer(barSpec({ stack: false, axis: 'x' })).type).toBe(TraceType.DODGED);
  });

  it('treats an offset channel as dodged whatever stack says', () => {
    expect(onlyLayer(barSpec({ offset: true })).type).toBe(TraceType.DODGED);
  });
});
