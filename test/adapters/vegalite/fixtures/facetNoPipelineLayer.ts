/**
 * A faceted layered spec where **one layer has no transform pipeline of its
 * own**, captured through the real vega-lite compiler.
 *
 * Layer 0 filters; layer 1 reads the faceted source directly. Vega gives
 * layer 1 no pre-facet pipeline, and the `data_<N>` names that remain
 * registered are *cell-scoped leftovers* — here `data_0` holds only South's
 * rows and `data_3` only North's.
 *
 * That is the trap this fixture exists for. Both leftovers carry the facet
 * field and there are exactly two of them, so the field check and the
 * count guard both pass; only the coverage check rejects them, because
 * neither spans every facet value. Without it the mapping hands each layer
 * a single panel's rows and announces confident names over them.
 *
 * The fallback this then takes is itself poor for this shape (the panel
 * comes out empty), which is a pre-existing limitation of name guessing
 * for facets — but an empty panel is the honest failure, and a confidently
 * mislabelled one is not.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';

export const facetNoPipelineSpec: VegaLiteSpec = {
  data: {
    values: [
      {
        site: 'North',
        species: 'Adelie',
        t: 1,
        y: 1,
      },
      {
        site: 'North',
        species: 'Adelie',
        t: 2,
        y: 2,
      },
      {
        site: 'North',
        species: 'Adelie',
        t: 3,
        y: 3,
      },
      {
        site: 'North',
        species: 'Gentoo',
        t: 1,
        y: 100,
      },
      {
        site: 'North',
        species: 'Gentoo',
        t: 2,
        y: 200,
      },
      {
        site: 'North',
        species: 'Gentoo',
        t: 3,
        y: 300,
      },
      {
        site: 'South',
        species: 'Adelie',
        t: 1,
        y: 1,
      },
      {
        site: 'South',
        species: 'Adelie',
        t: 2,
        y: 2,
      },
      {
        site: 'South',
        species: 'Adelie',
        t: 3,
        y: 3,
      },
      {
        site: 'South',
        species: 'Gentoo',
        t: 1,
        y: 100,
      },
      {
        site: 'South',
        species: 'Gentoo',
        t: 2,
        y: 200,
      },
      {
        site: 'South',
        species: 'Gentoo',
        t: 3,
        y: 300,
      },
    ],
  },
  facet: {
    column: {
      field: 'site',
      type: 'nominal',
    },
  },
  spec: {
    layer: [
      {
        transform: [
          {
            filter: {
              field: 'species',
              equal: 'Adelie',
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
            datum: 'Adelie',
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
} as unknown as VegaLiteSpec;

export const facetNoPipelineDatasets: Record<string, Record<string, unknown>[]> = {
  'source_0': [
    {
      site: 'North',
      species: 'Adelie',
      t: 1,
      y: 1,
    },
    {
      site: 'North',
      species: 'Adelie',
      t: 2,
      y: 2,
    },
    {
      site: 'North',
      species: 'Adelie',
      t: 3,
      y: 3,
    },
    {
      site: 'North',
      species: 'Gentoo',
      t: 1,
      y: 100,
    },
    {
      site: 'North',
      species: 'Gentoo',
      t: 2,
      y: 200,
    },
    {
      site: 'North',
      species: 'Gentoo',
      t: 3,
      y: 300,
    },
    {
      site: 'South',
      species: 'Adelie',
      t: 1,
      y: 1,
    },
    {
      site: 'South',
      species: 'Adelie',
      t: 2,
      y: 2,
    },
    {
      site: 'South',
      species: 'Adelie',
      t: 3,
      y: 3,
    },
    {
      site: 'South',
      species: 'Gentoo',
      t: 1,
      y: 100,
    },
    {
      site: 'South',
      species: 'Gentoo',
      t: 2,
      y: 200,
    },
    {
      site: 'South',
      species: 'Gentoo',
      t: 3,
      y: 300,
    },
  ],
  'data_0': [
    {
      site: 'South',
      species: 'Adelie',
      t: 1,
      y: 1,
    },
    {
      site: 'South',
      species: 'Adelie',
      t: 2,
      y: 2,
    },
    {
      site: 'South',
      species: 'Adelie',
      t: 3,
      y: 3,
    },
  ],
  'column_domain': [
    {
      site: 'North',
      count: 6,
    },
    {
      site: 'South',
      count: 6,
    },
  ],
  'data_3': [
    {
      site: 'North',
      species: 'Adelie',
      t: 1,
      y: 1,
    },
    {
      site: 'North',
      species: 'Adelie',
      t: 2,
      y: 2,
    },
    {
      site: 'North',
      species: 'Adelie',
      t: 3,
      y: 3,
    },
    {
      site: 'South',
      species: 'Adelie',
      t: 1,
      y: 1,
    },
    {
      site: 'South',
      species: 'Adelie',
      t: 2,
      y: 2,
    },
    {
      site: 'South',
      species: 'Adelie',
      t: 3,
      y: 3,
    },
  ],
  '_:vega:_0': [
    {
      data: 'Adelie',
    },
  ],
  '_:vega:_1': [
    {
      data: 'All',
    },
  ],
};
