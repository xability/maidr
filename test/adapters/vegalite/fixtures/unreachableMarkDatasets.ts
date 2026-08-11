/**
 * Layered specs whose per-layer mark datasets are **not** addressable by
 * name, captured through the real vega-lite compiler.
 *
 * These are the shapes that must keep working via the pre-existing
 * name-guessing path, because `resolveMarkItemData` can never serve them:
 *
 * - `nestedColorLine` — Vega wraps a colour-encoded line in a
 *   `layer_0_pathgroup` facet group, so `layer_0_marks` is nested and
 *   `view.data()` rejects it.
 * - `layeredBoxplot` — Vega-Lite expands a boxplot into nested sub-layers
 *   (`layer_0_layer_0_marks` and friends), so the name the adapter derives
 *   never exists.
 *
 * Both therefore exercise the fail-closed fallback rather than the exact
 * lookup, and both must still produce correct data.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';

export const nestedColorLineSpec: VegaLiteSpec = {
  data: {
    values: [
      {
        x: 1,
        y: 1,
        s: 'A',
      },
      {
        x: 2,
        y: 2,
        s: 'A',
      },
      {
        x: 3,
        y: 6,
        s: 'A',
      },
      {
        x: 1,
        y: 5,
        s: 'B',
      },
      {
        x: 2,
        y: 9,
        s: 'B',
      },
      {
        x: 3,
        y: 7,
        s: 'B',
      },
    ],
  },
  layer: [
    {
      mark: 'line',
      encoding: {
        x: {
          field: 'x',
          type: 'quantitative',
        },
        y: {
          field: 'y',
          type: 'quantitative',
        },
        color: {
          field: 's',
          type: 'nominal',
        },
      },
    },
  ],
} as VegaLiteSpec;

export const nestedColorLineDatasets: Record<string, Record<string, unknown>[]> = {
  source_0: [
    {
      x: 1,
      y: 1,
      s: 'A',
    },
    {
      x: 2,
      y: 2,
      s: 'A',
    },
    {
      x: 3,
      y: 6,
      s: 'A',
    },
    {
      x: 1,
      y: 5,
      s: 'B',
    },
    {
      x: 2,
      y: 9,
      s: 'B',
    },
    {
      x: 3,
      y: 7,
      s: 'B',
    },
  ],
};

export const layeredBoxplotSpec: VegaLiteSpec = {
  data: {
    values: [
      {
        x: 1,
        y: 1,
        s: 'A',
      },
      {
        x: 2,
        y: 2,
        s: 'A',
      },
      {
        x: 3,
        y: 6,
        s: 'A',
      },
      {
        x: 1,
        y: 5,
        s: 'B',
      },
      {
        x: 2,
        y: 9,
        s: 'B',
      },
      {
        x: 3,
        y: 7,
        s: 'B',
      },
    ],
  },
  layer: [
    {
      mark: 'boxplot',
      encoding: {
        x: {
          field: 's',
          type: 'nominal',
        },
        y: {
          field: 'y',
          type: 'quantitative',
        },
      },
    },
  ],
} as VegaLiteSpec;

export const layeredBoxplotDatasets: Record<string, Record<string, unknown>[]> = {
  source_0: [
    {
      x: 1,
      y: 1,
      s: 'A',
    },
    {
      x: 2,
      y: 2,
      s: 'A',
    },
    {
      x: 3,
      y: 6,
      s: 'A',
    },
    {
      x: 1,
      y: 5,
      s: 'B',
    },
    {
      x: 2,
      y: 9,
      s: 'B',
    },
    {
      x: 3,
      y: 7,
      s: 'B',
    },
  ],
};
