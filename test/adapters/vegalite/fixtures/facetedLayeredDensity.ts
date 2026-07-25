/**
 * An Altair layered-density chart wrapped in a column facet, captured
 * through the real vega-lite compiler.
 *
 * Two species layers (`color: {datum}` + a per-species filter) faceted by
 * `site`. This is the shape of the chart #648 describes, one composition
 * level up — and the level where the compiled datasets stop being
 * addressable by layer.
 *
 * The compiled view exposes `data_2` (Adelie) and `data_3` (Chinstrap) at
 * the top level, each spanning both facet cells. It exposes **no**
 * `data_0` / `data_1`, and the per-layer mark datasets
 * (`child_layer_<N>_marks`) live inside the facet cell group, so
 * `view.data()` rejects them — which is why the exact mark-dataset lookup
 * used for non-faceted specs cannot serve this case.
 *
 * The two species occupy disjoint mass ranges, so their density curves
 * differ by ~27 orders of magnitude at x=3000; a layer drawing the wrong
 * one is unmistakable.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';

export const facetedDensitySpec: VegaLiteSpec = {
  data: {
    name: 'data-bf9724b3bd8a20d9c036fbc92be4cddd',
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
        mark: {
          type: 'line',
        },
        encoding: {
          color: {
            datum: 'Adelie',
          },
          x: {
            field: 'mass',
            type: 'quantitative',
          },
          y: {
            field: 'density',
            type: 'quantitative',
          },
        },
        transform: [
          {
            filter: '(datum.species === \'Adelie\')',
          },
          {
            density: 'mass',
            extent: [
              3000,
              4500,
            ],
            groupby: [
              'site',
            ],
            steps: 4,
            as: [
              'mass',
              'density',
            ],
          },
        ],
      },
      {
        mark: {
          type: 'line',
        },
        encoding: {
          color: {
            datum: 'Chinstrap',
          },
          x: {
            field: 'mass',
            type: 'quantitative',
          },
          y: {
            field: 'density',
            type: 'quantitative',
          },
        },
        transform: [
          {
            filter: '(datum.species === \'Chinstrap\')',
          },
          {
            density: 'mass',
            extent: [
              3000,
              4500,
            ],
            groupby: [
              'site',
            ],
            steps: 4,
            as: [
              'mass',
              'density',
            ],
          },
        ],
      },
    ],
  },
  $schema: 'https://vega.github.io/schema/vega-lite/v6.4.1.json',
} as VegaLiteSpec;

export const facetedDensityDatasets: Record<string, Record<string, unknown>[]> = {
  'data-bf9724b3bd8a20d9c036fbc92be4cddd': [
    {
      species: 'Adelie',
      site: 'North',
      mass: 3000,
    },
    {
      species: 'Adelie',
      site: 'North',
      mass: 3100,
    },
    {
      species: 'Adelie',
      site: 'North',
      mass: 3200,
    },
    {
      species: 'Adelie',
      site: 'North',
      mass: 3300,
    },
    {
      species: 'Adelie',
      site: 'South',
      mass: 3000,
    },
    {
      species: 'Adelie',
      site: 'South',
      mass: 3100,
    },
    {
      species: 'Adelie',
      site: 'South',
      mass: 3200,
    },
    {
      species: 'Adelie',
      site: 'South',
      mass: 3300,
    },
    {
      species: 'Chinstrap',
      site: 'North',
      mass: 4000,
    },
    {
      species: 'Chinstrap',
      site: 'North',
      mass: 4100,
    },
    {
      species: 'Chinstrap',
      site: 'North',
      mass: 4200,
    },
    {
      species: 'Chinstrap',
      site: 'North',
      mass: 4300,
    },
    {
      species: 'Chinstrap',
      site: 'South',
      mass: 4000,
    },
    {
      species: 'Chinstrap',
      site: 'South',
      mass: 4100,
    },
    {
      species: 'Chinstrap',
      site: 'South',
      mass: 4200,
    },
    {
      species: 'Chinstrap',
      site: 'South',
      mass: 4300,
    },
  ],
  'column_domain': [
    {
      site: 'North',
      count: 8,
    },
    {
      site: 'South',
      count: 8,
    },
  ],
  'data_2': [
    {
      site: 'North',
      mass: 3000,
      density: 0.0018044928155958794,
    },
    {
      site: 'North',
      mass: 3375,
      density: 0.0009607592695315972,
    },
    {
      site: 'North',
      mass: 3750,
      density: 4.056230155292502e-9,
    },
    {
      site: 'North',
      mass: 4125,
      density: 5.862995987590092e-22,
    },
    {
      site: 'North',
      mass: 4500,
      density: 2.379985389387942e-42,
    },
    {
      site: 'South',
      mass: 3000,
      density: 0.0018044928155958794,
    },
    {
      site: 'South',
      mass: 3375,
      density: 0.0009607592695315972,
    },
    {
      site: 'South',
      mass: 3750,
      density: 4.056230155292502e-9,
    },
    {
      site: 'South',
      mass: 4125,
      density: 5.862995987590092e-22,
    },
    {
      site: 'South',
      mass: 4500,
      density: 2.379985389387942e-42,
    },
  ],
  'data_3': [
    {
      site: 'North',
      mass: 3000,
      density: 1.5556728967892208e-30,
    },
    {
      site: 'North',
      mass: 3375,
      density: 3.594173801333252e-14,
    },
    {
      site: 'North',
      mass: 3750,
      density: 0.00002383589667060187,
    },
    {
      site: 'North',
      mass: 4125,
      density: 0.0024393716476717097,
    },
    {
      site: 'North',
      mass: 4500,
      density: 0.00009781211426877458,
    },
    {
      site: 'South',
      mass: 3000,
      density: 1.5556728967892208e-30,
    },
    {
      site: 'South',
      mass: 3375,
      density: 3.594173801333252e-14,
    },
    {
      site: 'South',
      mass: 3750,
      density: 0.00002383589667060187,
    },
    {
      site: 'South',
      mass: 4125,
      density: 0.0024393716476717097,
    },
    {
      site: 'South',
      mass: 4500,
      density: 0.00009781211426877458,
    },
  ],
};
