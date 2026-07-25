/**
 * A `repeat` spec whose child is itself layered, captured through the real
 * vega-lite compiler.
 *
 * Like facets, a repeat cell's marks are nested inside the cell's group
 * (`child__column_a_group`), so the `${childName}_layer_${j}_marks` name the
 * adapter derives is not a top-level dataset and `view.data()` rejects it.
 * The mark lookup therefore always fails closed here and the pre-existing
 * name guessing stands.
 *
 * Note for anyone tempted to extend the faceted per-layer mapping to
 * repeats: **ascending `data_N` order is not layer order here.** The
 * compiled marks bind `child__column_a_layer_0_marks` to `data_1` and
 * `child__column_a_layer_1_marks` to `data_0` — the filtered layer takes the
 * higher* number. Mapping positionally would swap the two layers.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';

export const repeatLayeredLineSpec: VegaLiteSpec = {
  data: {
    values: [
      {
        t: 1,
        a: 1,
        b: 10,
      },
      {
        t: 2,
        a: 2,
        b: 20,
      },
      {
        t: 3,
        a: 5,
        b: 30,
      },
    ],
  },
  repeat: {
    column: [
      'a',
      'b',
    ],
  },
  spec: {
    layer: [
      {
        mark: 'line',
        transform: [
          {
            filter: {
              field: 't',
              equal: 1,
            },
          },
        ],
        encoding: {
          x: {
            field: 't',
            type: 'quantitative',
          },
          y: {
            field: {
              repeat: 'column',
            },
            type: 'quantitative',
          },
        },
      },
      {
        mark: 'line',
        encoding: {
          x: {
            field: 't',
            type: 'quantitative',
          },
          y: {
            field: {
              repeat: 'column',
            },
            type: 'quantitative',
          },
        },
      },
    ],
  },
} as unknown as VegaLiteSpec;

export const repeatLayeredLineDatasets: Record<string, Record<string, unknown>[]> = {
  source_0: [
    {
      t: 1,
      a: 1,
      b: 10,
    },
    {
      t: 2,
      a: 2,
      b: 20,
    },
    {
      t: 3,
      a: 5,
      b: 30,
    },
  ],
};
