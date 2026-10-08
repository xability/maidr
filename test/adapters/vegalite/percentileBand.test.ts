/**
 * An interquartile `errorband` with the median line through it is a
 * percentile band.
 *
 * Vega-Lite's recipe for a band around a centre line is a `layer:` of an
 * `errorband` and a `line`. Read layer by layer, the band was announced as
 * an error bar -- an estimate and an interval, which is not what a quartile
 * band is -- and the line as a second series sounding the same median again.
 *
 * The datasets below are what vega-lite 5.23.0 and vega 5.33.1 compile and
 * run the spec into: the band's area is a composite part, nested one level
 * down as `layer_0_layer_0_marks`, and both mark datasets carry the same
 * aggregated rows, `q1`, `median` and `q3` of `loss` at each `step`.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { MaidrLayer, PercentileBandPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

const RAW = [1, 2, 3].flatMap(step => [1, 2, 3, 4, 10].map(v => ({ step, loss: v * step })));

/** Measured: the aggregated row each mark item carries as its `datum`. */
const AGGREGATED = [
  { step: 1, median_loss: 3, center_loss: 3, lower_loss: 2, upper_loss: 4 },
  { step: 2, median_loss: 6, center_loss: 6, lower_loss: 4, upper_loss: 8 },
  { step: 3, median_loss: 9, center_loss: 9, lower_loss: 6, upper_loss: 12 },
];

const X = { field: 'step', type: 'quantitative', title: 'Step' };
const Y = { field: 'loss', type: 'quantitative', title: 'Loss' };

const BAND: VegaLiteSpec = { mark: { type: 'errorband', extent: 'iqr' }, encoding: { x: X, y: Y } };
const MEDIAN: VegaLiteSpec = { mark: 'line', encoding: { x: X, y: { ...Y, aggregate: 'median' } } };

function layered(layer: VegaLiteSpec[]): VegaLiteSpec {
  return { data: { values: RAW }, layer };
}

/** The compiled view: `band` and `line` name the two layers' mark datasets. */
function viewFor(band: string, line: string, rows = AGGREGATED): ReturnType<typeof makeView> {
  return makeView({
    source_0: RAW,
    data_0: rows,
    [band]: rows.map(datum => ({ datum })),
    [line]: rows.map(datum => ({ datum })),
  });
}

function layersOf(spec: VegaLiteSpec, view = viewFor('layer_0_layer_0_marks', 'layer_1_marks')): MaidrLayer[] {
  return vegaLiteToMaidr(spec, view).subplots[0][0].layers;
}

describe('vega-lite interquartile band with its median line', () => {
  it('reads the pair as one percentile band', () => {
    const layers = layersOf(layered([BAND, MEDIAN]));

    expect(layers).toHaveLength(1);
    const [layer] = layers;
    expect(layer.type).toBe(TraceType.PERCENTILE_BAND);
    expect(layer.axes).toEqual({ x: { label: 'Step' }, y: { label: 'Loss' } });
    expect(layer.data as PercentileBandPoint[]).toEqual(AGGREGATED.map(row => ({
      x: row.step,
      quantiles: [
        { level: 0.25, value: row.lower_loss },
        { level: 0.5, value: row.median_loss },
        { level: 0.75, value: row.upper_loss },
      ],
    })));
    // The band, outermost first, then the median's line: the per-band shape.
    expect(layer.selectors).toEqual([
      'g.mark-area.role-mark.layer_0_layer_0_marks > path',
      'g.mark-line.role-mark.layer_1_marks > path',
    ]);
  });

  it('reads the pair with the line drawn first', () => {
    const [layer] = layersOf(
      layered([MEDIAN, BAND]),
      viewFor('layer_1_layer_0_marks', 'layer_0_marks'),
    );

    expect(layer.type).toBe(TraceType.PERCENTILE_BAND);
    expect(layer.selectors).toEqual([
      'g.mark-area.role-mark.layer_1_layer_0_marks > path',
      'g.mark-line.role-mark.layer_0_marks > path',
    ]);
  });

  it('takes a median centre with no extent as the interquartile band it compiles to', () => {
    const band = { ...BAND, mark: { type: 'errorband', center: 'median' } };

    const [layer] = layersOf(layered([band, MEDIAN]));

    expect(layer.type).toBe(TraceType.PERCENTILE_BAND);
  });

  it('orders the points along x, the way the line joins them', () => {
    const [layer] = layersOf(
      layered([BAND, MEDIAN]),
      viewFor('layer_0_layer_0_marks', 'layer_1_marks', [...AGGREGATED].reverse()),
    );

    expect((layer.data as PercentileBandPoint[]).map(point => point.x)).toEqual([1, 2, 3]);
  });

  const NOT_A_BAND: [string, VegaLiteSpec[]][] = [
    ['the band is a standard error', [{ ...BAND, mark: { type: 'errorband', extent: 'stderr' } }, MEDIAN]],
    ['the band declares no extent', [{ ...BAND, mark: 'errorband' }, MEDIAN]],
    ['the line is a mean', [BAND, { ...MEDIAN, encoding: { x: X, y: { ...Y, aggregate: 'mean' } } }]],
    ['the line reads another column', [BAND, { ...MEDIAN, encoding: { x: X, y: { field: 'acc', aggregate: 'median' } } }]],
    ['a colour splits the band into several', [
      { ...BAND, encoding: { x: X, y: Y, color: { field: 'run', type: 'nominal' } } },
      MEDIAN,
    ]],
    ['the line adds a transform of its own', [BAND, { ...MEDIAN, transform: [{ filter: 'datum.step > 1' }] }]],
  ];

  it.each(NOT_A_BAND)('leaves the layers apart when %s', (_case, layer) => {
    const layers = layersOf(layered(layer));

    expect(layers.some(one => one.type === TraceType.PERCENTILE_BAND)).toBe(false);
  });

  it('leaves the layers apart when the line s median is not the band s centre', () => {
    // Two layers that disagree at an x were not drawn from the same rows.
    const view = makeView({
      source_0: RAW,
      data_0: AGGREGATED,
      layer_0_layer_0_marks: AGGREGATED.map(datum => ({ datum })),
      layer_1_marks: AGGREGATED.map(datum => ({ datum: { ...datum, median_loss: datum.median_loss + 1 } })),
    });

    const layers = layersOf(layered([BAND, MEDIAN]), view);

    expect(layers.some(one => one.type === TraceType.PERCENTILE_BAND)).toBe(false);
  });

  it('computes no quartile without a compiled view, and leaves the layers apart', () => {
    const layers = vegaLiteToMaidr(layered([BAND, MEDIAN])).subplots[0][0].layers;

    expect(layers.some(one => one.type === TraceType.PERCENTILE_BAND)).toBe(false);
  });
});
