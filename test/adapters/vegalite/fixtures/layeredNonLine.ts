/**
 * Layered **non-line** specs captured through the real vega-lite compiler,
 * covering the trace types the per-layer mark-dataset lookup also reaches.
 *
 * Both shapes expose the same sequential-numbering trap the line fixture
 * does, and the compiled mark datasets resolve it:
 *
 * - `layeredTwoBars` aggregates one layer by `cat` (`data_1`) and the
 *   other by `grp` (`data_2`). Guessing by name resolves layer 0 to
 *   `data_0` — the raw, *unaggregated* rows — and layer 1 to `data_1`,
 *   the other layer's totals. Both layers draw the wrong data.
 * - `layeredHistogram` compiles to `data_1` (binned counts) and
 *   `data_2` (the mean rule), with no `data_0`. Guessing resolves layer 0
 *   to `source_0` — the raw, *unbinned* rows.
 *
 * In both, each `layer_<N>_marks` item's `datum` is exactly the row from
 * the pipeline dataset that mark is bound to, so it carries the compiled
 * field names the extractors expect — binned `bin_maxbins_10_n` /
 * `__count`, aggregate `sum_v` / `max_v`.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';

export const layeredTwoBarsSpec: VegaLiteSpec = {
  data: {
    values: [
      {
        cat: 'A',
        grp: 'x',
        v: 3,
      },
      {
        cat: 'A',
        grp: 'y',
        v: 5,
      },
      {
        cat: 'B',
        grp: 'x',
        v: 7,
      },
      {
        cat: 'B',
        grp: 'y',
        v: 2,
      },
    ],
  },
  layer: [
    {
      mark: 'bar',
      encoding: {
        x: {
          field: 'cat',
          type: 'nominal',
        },
        y: {
          field: 'v',
          type: 'quantitative',
          aggregate: 'sum',
        },
      },
    },
    {
      mark: 'bar',
      encoding: {
        x: {
          field: 'grp',
          type: 'nominal',
        },
        y: {
          field: 'v',
          type: 'quantitative',
          aggregate: 'max',
        },
      },
    },
  ],
} as VegaLiteSpec;

export const layeredTwoBarsDatasets: Record<string, Record<string, unknown>[]> = {
  source_0: [
    {
      cat: 'A',
      grp: 'x',
      v: 3,
    },
    {
      cat: 'A',
      grp: 'y',
      v: 5,
    },
    {
      cat: 'B',
      grp: 'x',
      v: 7,
    },
    {
      cat: 'B',
      grp: 'y',
      v: 2,
    },
  ],
  data_0: [
    {
      cat: 'A',
      grp: 'x',
      v: 3,
    },
    {
      cat: 'A',
      grp: 'y',
      v: 5,
    },
    {
      cat: 'B',
      grp: 'x',
      v: 7,
    },
    {
      cat: 'B',
      grp: 'y',
      v: 2,
    },
  ],
  data_1: [
    {
      cat: 'A',
      sum_v: 8,
    },
    {
      cat: 'B',
      sum_v: 9,
    },
  ],
  data_2: [
    {
      grp: 'x',
      max_v: 7,
    },
    {
      grp: 'y',
      max_v: 5,
    },
  ],
  layer_0_marks: [
    {
      datum: {
        cat: 'A',
        sum_v: 8,
      },
    },
    {
      datum: {
        cat: 'B',
        sum_v: 9,
      },
    },
  ],
  layer_1_marks: [
    {
      datum: {
        grp: 'x',
        max_v: 7,
      },
    },
    {
      datum: {
        grp: 'y',
        max_v: 5,
      },
    },
  ],
};

export const layeredHistogramSpec: VegaLiteSpec = {
  data: {
    values: [
      {
        n: 1,
      },
      {
        n: 2,
      },
      {
        n: 2,
      },
      {
        n: 3,
      },
      {
        n: 7,
      },
      {
        n: 8,
      },
    ],
  },
  layer: [
    {
      mark: 'bar',
      encoding: {
        x: {
          field: 'n',
          type: 'quantitative',
          bin: true,
        },
        y: {
          aggregate: 'count',
          type: 'quantitative',
        },
      },
    },
    {
      mark: 'rule',
      encoding: {
        x: {
          field: 'n',
          type: 'quantitative',
          aggregate: 'mean',
        },
      },
    },
  ],
} as VegaLiteSpec;

export const layeredHistogramDatasets: Record<string, Record<string, unknown>[]> = {
  source_0: [
    {
      n: 1,
    },
    {
      n: 2,
    },
    {
      n: 2,
    },
    {
      n: 3,
    },
    {
      n: 7,
    },
    {
      n: 8,
    },
  ],
  data_1: [
    {
      bin_maxbins_10_n: 1,
      bin_maxbins_10_n_end: 2,
      __count: 1,
    },
    {
      bin_maxbins_10_n: 2,
      bin_maxbins_10_n_end: 3,
      __count: 2,
    },
    {
      bin_maxbins_10_n: 3,
      bin_maxbins_10_n_end: 4,
      __count: 1,
    },
    {
      bin_maxbins_10_n: 7,
      bin_maxbins_10_n_end: 8,
      __count: 2,
    },
  ],
  data_2: [
    {
      mean_n: 3.8333333333333335,
    },
  ],
  layer_0_marks: [
    {
      datum: {
        bin_maxbins_10_n: 1,
        bin_maxbins_10_n_end: 2,
        __count: 1,
      },
    },
    {
      datum: {
        bin_maxbins_10_n: 2,
        bin_maxbins_10_n_end: 3,
        __count: 2,
      },
    },
    {
      datum: {
        bin_maxbins_10_n: 3,
        bin_maxbins_10_n_end: 4,
        __count: 1,
      },
    },
    {
      datum: {
        bin_maxbins_10_n: 7,
        bin_maxbins_10_n_end: 8,
        __count: 2,
      },
    },
  ],
  layer_1_marks: [
    {
      datum: {
        mean_n: 3.8333333333333335,
      },
    },
  ],
};
