/**
 * An `hconcat` whose children are themselves layered, captured through the
 * real vega-lite compiler.
 *
 * `buildConcatMaidr` passes `markGroupPrefix: 'concat_<i>_'`, so
 * `convertLayerSpec` derives `concat_<i>_layer_<j>_marks` — but Vega nests a
 * concat child's marks inside its own group, so `view.data()` rejects that
 * name and the mark lookup always fails closed here, exactly as it does for
 * facets and repeats. Concat children also never reach
 * `coalesceSiblingLineLayers`, so their line layers are not merged and no
 * series names are derived.
 *
 * The compiled marks bind `concat_<i>_layer_0_marks` to `data_1` and
 * `concat_<i>_layer_1_marks` to `data_0` — the filtered layer takes the
 * higher* number, the same reversal `repeatLayeredLine.ts` records and the
 * opposite of what facets do. Another reason the faceted ascending-order
 * mapping must not be generalised to other composite shapes.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';

export const concatLayeredLineSpec: VegaLiteSpec = {
  data: {
    values: [
      {
        g: 'A',
        t: 1,
        y: 1,
      },
      {
        g: 'A',
        t: 2,
        y: 2,
      },
      {
        g: 'A',
        t: 3,
        y: 3,
      },
      {
        g: 'B',
        t: 1,
        y: 10,
      },
      {
        g: 'B',
        t: 2,
        y: 20,
      },
      {
        g: 'B',
        t: 3,
        y: 30,
      },
    ],
  },
  hconcat: [
    {
      title: 'Left',
      layer: [
        {
          transform: [
            {
              filter: {
                field: 'g',
                equal: 'A',
              },
            },
          ],
          mark: 'line',
          encoding: {
            x: {
              field: 't',
              type: 'quantitative',
            },
            y: {
              field: 'y',
              type: 'quantitative',
            },
            color: {
              datum: 'Only A',
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
              field: 'y',
              type: 'quantitative',
            },
            color: {
              datum: 'All',
            },
          },
        },
      ],
    },
    {
      title: 'Right',
      layer: [
        {
          transform: [
            {
              filter: {
                field: 'g',
                equal: 'A',
              },
            },
          ],
          mark: 'line',
          encoding: {
            x: {
              field: 't',
              type: 'quantitative',
            },
            y: {
              field: 'y',
              type: 'quantitative',
            },
            color: {
              datum: 'Only A',
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
              field: 'y',
              type: 'quantitative',
            },
            color: {
              datum: 'All',
            },
          },
        },
      ],
    },
  ],
} as unknown as VegaLiteSpec;

export const concatLayeredLineDatasets: Record<string, Record<string, unknown>[]> = {
  'source_0': [
    {
      g: 'A',
      t: 1,
      y: 1,
    },
    {
      g: 'A',
      t: 2,
      y: 2,
    },
    {
      g: 'A',
      t: 3,
      y: 3,
    },
    {
      g: 'B',
      t: 1,
      y: 10,
    },
    {
      g: 'B',
      t: 2,
      y: 20,
    },
    {
      g: 'B',
      t: 3,
      y: 30,
    },
  ],
  'data_0': [
    {
      g: 'A',
      t: 1,
      y: 1,
    },
    {
      g: 'A',
      t: 2,
      y: 2,
    },
    {
      g: 'A',
      t: 3,
      y: 3,
    },
    {
      g: 'B',
      t: 1,
      y: 10,
    },
    {
      g: 'B',
      t: 2,
      y: 20,
    },
    {
      g: 'B',
      t: 3,
      y: 30,
    },
  ],
  'data_1': [
    {
      g: 'A',
      t: 1,
      y: 1,
    },
    {
      g: 'A',
      t: 2,
      y: 2,
    },
    {
      g: 'A',
      t: 3,
      y: 3,
    },
  ],
  '_:vega:_0': [
    {
      data: 'Only A',
    },
  ],
  '_:vega:_1': [
    {
      data: 'All',
    },
  ],
};
