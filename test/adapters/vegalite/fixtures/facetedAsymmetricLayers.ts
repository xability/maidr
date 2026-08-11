/**
 * A faceted layered spec whose layers have **asymmetric** transform
 * pipelines — layer 0 filters to one species before its density, layer 1
 * runs the density over all of them — captured through the real vega-lite
 * compiler.
 *
 * This is the case that decides whether
 * `resolveFacetLayerDatasets`' ascending-`data_N` ordering is safe. The
 * sibling `repeatLayeredLine.ts` fixture shows a repeat spec binding layer 0
 * to `data_1` and layer 1 to `data_0` when its layers differ that way, so
 * the same asymmetry is the obvious candidate for breaking the facet
 * mapping too.
 *
 * It does not: the compiler still numbers these in declaration order
 * (`data_2` → layer 0, `data_3` → layer 1). The two curves are far apart —
 * layer 0 peaks near 3000, layer 1 is a flatter all-species mixture — so a
 * swap would be obvious rather than subtle.
 */

import type { VegaLiteSpec } from '@adapters/vegalite/types';

export const facetedAsymmetricSpec: VegaLiteSpec = {
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
            datum: 'All species',
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
} as unknown as VegaLiteSpec;

export const facetedAsymmetricDatasets: Record<string, Record<string, unknown>[]> = {
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
      density: 0.00047320635996277594,
    },
    {
      site: 'North',
      mass: 3375,
      density: 0.0005021891041240489,
    },
    {
      site: 'North',
      mass: 3750,
      density: 0.0004644341718353575,
    },
    {
      site: 'North',
      mass: 4125,
      density: 0.0005235754016200383,
    },
    {
      site: 'North',
      mass: 4500,
      density: 0.0003420036239898786,
    },
    {
      site: 'South',
      mass: 3000,
      density: 0.00047320635996277594,
    },
    {
      site: 'South',
      mass: 3375,
      density: 0.0005021891041240489,
    },
    {
      site: 'South',
      mass: 3750,
      density: 0.0004644341718353575,
    },
    {
      site: 'South',
      mass: 4125,
      density: 0.0005235754016200383,
    },
    {
      site: 'South',
      mass: 4500,
      density: 0.0003420036239898786,
    },
  ],
  '_:vega:_0': [
    {
      data: 'Adelie',
    },
  ],
  '_:vega:_1': [
    {
      data: 'All species',
    },
  ],
};
