/**
 * A Vega-Lite line of precision against recall is a precision-recall curve.
 *
 * Vega-Lite has no such mark: scikit-learn's `PrecisionRecallDisplay` and
 * TensorBoard's PR Curves dashboard are both redrawn as a `line` over a
 * `recall` and a `precision` column, so the axes are the only thing that
 * says what the chart is. Read as a line, a reader hears two rates as an
 * ordinary series and is never told the average precision or the best F1.
 *
 * The reading is held to what the chart states: recall on x and precision on
 * y by field or title, every point a fraction of one on both, unaggregated.
 * Anything less is still the line it always was.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { LinePoint, MaidrLayer, PrCurvePoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';

const CURVE = [
  { recall: 0, precision: 1, model: 'Logistic' },
  { recall: 0.6, precision: 0.8, model: 'Logistic' },
  { recall: 1, precision: 0.3, model: 'Logistic' },
  { recall: 0, precision: 1, model: 'Forest' },
  { recall: 0.5, precision: 0.9, model: 'Forest' },
  { recall: 1, precision: 0.3, model: 'Forest' },
];

function lineSpec(
  encoding: VegaLiteSpec['encoding'],
  values: Record<string, unknown>[] = CURVE,
  mark: string = 'line',
): VegaLiteSpec {
  return { data: { values }, mark, encoding };
}

function layersOf(spec: VegaLiteSpec): MaidrLayer[] {
  return vegaLiteToMaidr(spec).subplots[0][0].layers;
}

describe('vega-lite precision-recall curve', () => {
  it('reads a line of precision against recall as one curve per series', () => {
    const [layer] = layersOf(lineSpec({
      x: { field: 'recall', type: 'quantitative', title: 'Recall' },
      y: { field: 'precision', type: 'quantitative', title: 'Precision' },
      color: { field: 'model', type: 'nominal' },
    }));

    expect(layer.type).toBe(TraceType.PR_CURVE);
    expect(layer.axes).toEqual({ x: { label: 'Recall' }, y: { label: 'Precision' } });
    expect(layer.data as PrCurvePoint[][]).toEqual([
      [
        { x: 0, y: 1, z: 'Logistic' },
        { x: 0.6, y: 0.8, z: 'Logistic' },
        { x: 1, y: 0.3, z: 'Logistic' },
      ],
      [
        { x: 0, y: 1, z: 'Forest' },
        { x: 0.5, y: 0.9, z: 'Forest' },
        { x: 1, y: 0.3, z: 'Forest' },
      ],
    ]);
    // One selector per curve, exactly as the line it is drawn as.
    expect(layer.selectors).toHaveLength(2);
  });

  it('recognises the rates by their titles when the columns are named otherwise', () => {
    const values = CURVE.slice(0, 3).map(({ recall, precision }) => ({ r: recall, p: precision }));
    const [layer] = layersOf(lineSpec({
      x: { field: 'r', type: 'quantitative', axis: { title: 'RECALL' } },
      y: { field: 'p', type: 'quantitative', title: 'precision' },
    }, values));

    expect(layer.type).toBe(TraceType.PR_CURVE);
  });

  it('reads a trail the same way, since it is the line it draws', () => {
    const [layer] = layersOf(lineSpec({
      x: { field: 'recall', type: 'quantitative' },
      y: { field: 'precision', type: 'quantitative' },
    }, CURVE.slice(0, 3), 'trail'));

    expect(layer.type).toBe(TraceType.PR_CURVE);
  });

  it('merges one curve per layer into one layer of curves', () => {
    const encoding = {
      x: { field: 'recall', type: 'quantitative' },
      y: { field: 'precision', type: 'quantitative' },
    };
    const layers = layersOf({
      layer: [
        { data: { values: CURVE.slice(0, 3) }, mark: 'line', encoding, transform: [{ filter: 'datum.model === \'Logistic\'' }] },
        { data: { values: CURVE.slice(3) }, mark: 'line', encoding, transform: [{ filter: 'datum.model === \'Forest\'' }] },
      ],
    } as VegaLiteSpec);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PR_CURVE);
    expect((layers[0].data as PrCurvePoint[][]).map(curve => curve[0].z)).toEqual(['Logistic', 'Forest']);
  });

  const STILL_LINES: [string, VegaLiteSpec][] = [
    ['the axes are the other way round', lineSpec({
      x: { field: 'precision', type: 'quantitative' },
      y: { field: 'recall', type: 'quantitative' },
    })],
    ['only one axis names its rate', lineSpec({
      x: { field: 'recall', type: 'quantitative' },
      y: { field: 'score', type: 'quantitative' },
    }, CURVE.map(({ recall, precision }) => ({ recall, score: precision })))],
    ['a title only contains the rate', lineSpec({
      x: { field: 'r', type: 'quantitative', title: 'Recall at k' },
      y: { field: 'p', type: 'quantitative', title: 'Precision at k' },
    }, CURVE.map(({ recall, precision }) => ({ r: recall, p: precision })))],
    ['a rate is a percentage rather than a fraction of one', lineSpec({
      x: { field: 'recall', type: 'quantitative' },
      y: { field: 'precision', type: 'quantitative' },
    }, CURVE.map(({ recall, precision }) => ({ recall: recall * 100, precision: precision * 100 })))],
    ['a rate is aggregated', lineSpec({
      x: { field: 'recall', type: 'quantitative' },
      y: { field: 'precision', type: 'quantitative', aggregate: 'mean' },
    })],
    ['the x values are categories', lineSpec({
      x: { field: 'recall', type: 'nominal' },
      y: { field: 'precision', type: 'quantitative' },
    }, CURVE.map(({ recall, precision }) => ({ recall: String(recall), precision })))],
  ];

  it.each(STILL_LINES)('keeps the line reading when %s', (_case, spec) => {
    const [layer] = layersOf(spec);

    expect(layer.type).toBe(TraceType.LINE);
    expect(Array.isArray(layer.data as LinePoint[][])).toBe(true);
  });
});

describe('vega-lite precision-recall curve, declared', () => {
  const SCORED = [
    { r: 0, p: 1, cut: 0.9 },
    { r: 0.6, p: 0.8, cut: 0.5 },
    { r: 1, p: 0.3 },
  ];
  const encoding: VegaLiteSpec['encoding'] = {
    x: { field: 'r', type: 'quantitative' },
    y: { field: 'p', type: 'quantitative' },
  };

  it('reads a line declared a curve as one, whatever its axes are called', () => {
    const [layer] = layersOf({
      ...lineSpec(encoding, SCORED),
      usermeta: { maidr: { type: TraceType.PR_CURVE, threshold: 'cut', prevalence: 0.3, ap: 0.8 } },
    });

    expect(layer.type).toBe(TraceType.PR_CURVE);
    expect(layer.data as PrCurvePoint[][]).toEqual([[
      { x: 0, y: 1, threshold: 0.9, prevalence: 0.3, ap: 0.8 },
      { x: 0.6, y: 0.8, threshold: 0.5 },
      { x: 1, y: 0.3 },
    ]]);
    expect(layer.selectors).toHaveLength(1);
  });

  it('declares a stepped line a curve too', () => {
    const [layer] = layersOf({
      data: { values: SCORED },
      mark: { type: 'line', interpolate: 'step-after' },
      encoding,
      usermeta: { maidr: { type: TraceType.PR_CURVE } },
    });

    expect(layer.type).toBe(TraceType.PR_CURVE);
  });

  it('lends no baseline to the several curves one colour-split layer draws', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const [layer] = layersOf({
      ...lineSpec({
        x: { field: 'recall', type: 'quantitative' },
        y: { field: 'precision', type: 'quantitative' },
        color: { field: 'model', type: 'nominal' },
      }),
      usermeta: { maidr: { type: TraceType.PR_CURVE, prevalence: 0.3 } },
    });

    expect(layer.type).toBe(TraceType.PR_CURVE);
    expect((layer.data as PrCurvePoint[][]).flat().some(point => 'prevalence' in point)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('they describe one curve'));
    warn.mockRestore();
  });

  it('takes in the plain lines layered after it, lending them nothing', () => {
    const [layer, ...rest] = layersOf({
      layer: [
        {
          data: { values: SCORED },
          mark: 'line',
          encoding,
          usermeta: { maidr: { type: TraceType.PR_CURVE, prevalence: 0.3 } },
        },
        { data: { values: SCORED.map(row => ({ ...row, p: row.p / 2 })) }, mark: 'line', encoding },
      ],
    });

    expect(rest).toHaveLength(0);
    expect(layer.type).toBe(TraceType.PR_CURVE);
    const curves = layer.data as PrCurvePoint[][];
    expect(curves).toHaveLength(2);
    expect(curves[1][0]).not.toHaveProperty('prevalence');
  });

  it('keeps the following lines apart when merge is off', () => {
    const layers = layersOf({
      layer: [
        {
          data: { values: SCORED },
          mark: 'line',
          encoding,
          usermeta: { maidr: { type: TraceType.PR_CURVE, merge: false } },
        },
        { data: { values: SCORED }, mark: 'line', encoding },
      ],
    });

    expect(layers.map(layer => layer.type)).toEqual([TraceType.PR_CURVE, TraceType.LINE]);
  });

  it('refuses a curve declared on a mark that draws no line', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const [layer] = layersOf({
      ...lineSpec(encoding, SCORED, 'point'),
      usermeta: { maidr: { type: TraceType.PR_CURVE } },
    });

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('from a "point" mark'));
    warn.mockRestore();
  });

  it('reports a threshold column no row carries', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const [layer] = layersOf({
      ...lineSpec(encoding, SCORED),
      usermeta: { maidr: { type: TraceType.PR_CURVE, threshold: 'score' } },
    });

    expect((layer.data as PrCurvePoint[][])[0][0]).not.toHaveProperty('threshold');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names "score" for threshold'));
    warn.mockRestore();
  });
});
