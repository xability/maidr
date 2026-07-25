/**
 * A **three-layer** faceted density chart, captured through the real
 * vega-lite compiler — the layer count `resolveFacetLayerDatasets` had not
 * been validated at.
 *
 * The answer is that it falls back rather than mapping, and for an
 * instructive reason. Only two of the three layers keep a pre-facet
 * pipeline spanning both sites (`data_3`, `data_4`); layer 0's survives
 * only as a *cell-scoped leftover* holding one panel's rows (`data_2`,
 * South only). The facet-value coverage check rejects that leftover, so
 * two candidates face three layers and the count guard declines.
 *
 * Note what this means for the two guards together: without the coverage
 * check there would have been three candidates for three layers, the count
 * would have matched, and layer 0 would have been handed a single panel's
 * data under a confident name. The 3+-layer case is therefore protected by
 * the same check that protects the 2-layer one, not by the count alone.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';

export const facetedThreeLayerSpec: VegaLiteSpec = {
  data: {
    name: 'data-66e8c8f558ed2ef6195e7a43b9cc3c02',
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
              5500,
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
              5500,
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
            datum: 'Gentoo',
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
            filter: '(datum.species === \'Gentoo\')',
          },
          {
            density: 'mass',
            extent: [
              3000,
              5500,
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
} as unknown as VegaLiteSpec;

export const facetedThreeLayerDatasets: Record<string, Record<string, unknown>[]> = {
  'data-66e8c8f558ed2ef6195e7a43b9cc3c02': [
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
    {
      species: 'Gentoo',
      site: 'North',
      mass: 5000,
    },
    {
      species: 'Gentoo',
      site: 'North',
      mass: 5100,
    },
    {
      species: 'Gentoo',
      site: 'North',
      mass: 5200,
    },
    {
      species: 'Gentoo',
      site: 'North',
      mass: 5300,
    },
    {
      species: 'Gentoo',
      site: 'South',
      mass: 5000,
    },
    {
      species: 'Gentoo',
      site: 'South',
      mass: 5100,
    },
    {
      species: 'Gentoo',
      site: 'South',
      mass: 5200,
    },
    {
      species: 'Gentoo',
      site: 'South',
      mass: 5300,
    },
  ],
  'column_domain': [
    {
      site: 'North',
      count: 12,
    },
    {
      site: 'South',
      count: 12,
    },
  ],
  'data_2': [
    {
      site: 'South',
      mass: 3000,
      density: 4.292990364903103e-111,
    },
    {
      site: 'South',
      mass: 3625,
      density: 1.8876325279292175e-54,
    },
    {
      site: 'South',
      mass: 4250,
      density: 8.71263823706258e-19,
    },
    {
      site: 'South',
      mass: 4875,
      density: 0.0004721852471780763,
    },
    {
      site: 'South',
      mass: 5500,
      density: 0.00009781211426877458,
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
      mass: 3625,
      density: 1.8664778836409083e-7,
    },
    {
      site: 'North',
      mass: 4250,
      density: 0.002199674512976738,
    },
    {
      site: 'North',
      mass: 4875,
      density: 1.4684876981292299e-12,
    },
    {
      site: 'North',
      mass: 5500,
      density: 2.379985389387942e-42,
    },
    {
      site: 'South',
      mass: 3000,
      density: 1.5556728967892208e-30,
    },
    {
      site: 'South',
      mass: 3625,
      density: 1.8664778836409083e-7,
    },
    {
      site: 'South',
      mass: 4250,
      density: 0.002199674512976738,
    },
    {
      site: 'South',
      mass: 4875,
      density: 1.4684876981292299e-12,
    },
    {
      site: 'South',
      mass: 5500,
      density: 2.379985389387942e-42,
    },
  ],
  'data_4': [
    {
      site: 'North',
      mass: 3000,
      density: 4.292990364903103e-111,
    },
    {
      site: 'North',
      mass: 3625,
      density: 1.8876325279292175e-54,
    },
    {
      site: 'North',
      mass: 4250,
      density: 8.71263823706258e-19,
    },
    {
      site: 'North',
      mass: 4875,
      density: 0.0004721852471780763,
    },
    {
      site: 'North',
      mass: 5500,
      density: 0.00009781211426877458,
    },
    {
      site: 'South',
      mass: 3000,
      density: 4.292990364903103e-111,
    },
    {
      site: 'South',
      mass: 3625,
      density: 1.8876325279292175e-54,
    },
    {
      site: 'South',
      mass: 4250,
      density: 8.71263823706258e-19,
    },
    {
      site: 'South',
      mass: 4875,
      density: 0.0004721852471780763,
    },
    {
      site: 'South',
      mass: 5500,
      density: 0.00009781211426877458,
    },
  ],
  '_:vega:_0': [
    {
      data: 'Adelie',
    },
  ],
  '_:vega:_1': [
    {
      data: 'Chinstrap',
    },
  ],
  '_:vega:_2': [
    {
      data: 'Gentoo',
    },
  ],
};
