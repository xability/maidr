/**
 * A real Altair layered-density chart, captured end to end.
 *
 * Produced by:
 *
 * ```python
 * layers = [
 *     alt.Chart(df)
 *     .transform_filter(alt.datum.species == s)
 *     .transform_density("mass", as_=["mass", "density"], extent=[3000, 5500], steps=5)
 *     .mark_line()
 *     .encode(x="mass:Q", y="density:Q", color=alt.datum(s))
 *     for s in ["Adelie", "Chinstrap", "Gentoo"]
 * ]
 * alt.layer(*layers).properties(title="Penguin body mass density").to_dict()
 * ```
 *
 * over a frame whose three species occupy disjoint mass ranges (Adelie
 * 3000-3500, Chinstrap 4000-4500, Gentoo 5000-5500), so each density curve
 * peaks in a different place and a mis-assigned series is unmistakable.
 *
 * {@link densityViewDatasets} is the state of the compiled Vega view after
 * `runAsync()`, dumped with the real vega-lite compiler. It carries both the
 * data pipelines (`data_1` … `data_3` — note there is no `data_0`) and the
 * per-layer mark datasets whose items back-reference their source row.
 *
 * This is the fixture issue #648 asked for: it settles which of the
 * candidate series-name sources Altair actually emits. The answer is
 * `encoding.color.datum` plus a `transform` filter written as the
 * expression string `(datum.species === 'Adelie')` — NOT the `{field, equal}`
 * predicate object, which Altair only emits for an explicit
 * `alt.FieldEqualPredicate`.
 */

import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';

export const densitySpec: VegaLiteSpec = {
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
          steps: 5,
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
          steps: 5,
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
          steps: 5,
          as: [
            'mass',
            'density',
          ],
        },
      ],
    },
  ],
  data: {
    name: 'data-b987e560b24b5c63490513baf89fe3e9',
  },
  title: 'Penguin body mass density',
  $schema: 'https://vega.github.io/schema/vega-lite/v6.4.1.json',
} as VegaLiteSpec;

export const densityViewDatasets: Record<string, Record<string, unknown>[]> = {
  'data-b987e560b24b5c63490513baf89fe3e9': [
    {
      species: 'Adelie',
      mass: 3000,
    },
    {
      species: 'Adelie',
      mass: 3100,
    },
    {
      species: 'Adelie',
      mass: 3200,
    },
    {
      species: 'Adelie',
      mass: 3300,
    },
    {
      species: 'Adelie',
      mass: 3400,
    },
    {
      species: 'Adelie',
      mass: 3500,
    },
    {
      species: 'Chinstrap',
      mass: 4000,
    },
    {
      species: 'Chinstrap',
      mass: 4100,
    },
    {
      species: 'Chinstrap',
      mass: 4200,
    },
    {
      species: 'Chinstrap',
      mass: 4300,
    },
    {
      species: 'Chinstrap',
      mass: 4400,
    },
    {
      species: 'Chinstrap',
      mass: 4500,
    },
    {
      species: 'Gentoo',
      mass: 5000,
    },
    {
      species: 'Gentoo',
      mass: 5100,
    },
    {
      species: 'Gentoo',
      mass: 5200,
    },
    {
      species: 'Gentoo',
      mass: 5300,
    },
    {
      species: 'Gentoo',
      mass: 5400,
    },
    {
      species: 'Gentoo',
      mass: 5500,
    },
  ],
  'data_1': [
    {
      mass: 3000,
      density: 0.0010738501700693602,
    },
    {
      mass: 3500,
      density: 0.0010738501700693604,
    },
    {
      mass: 4000,
      density: 7.31880011463906e-7,
    },
    {
      mass: 4500,
      density: 2.064218687210785e-15,
    },
    {
      mass: 5000,
      density: 1.2633257189546897e-29,
    },
    {
      mass: 5500,
      density: 1.603868033172209e-49,
    },
  ],
  'data_2': [
    {
      mass: 3000,
      density: 2.064218687210785e-15,
    },
    {
      mass: 3500,
      density: 7.31880011463906e-7,
    },
    {
      mass: 4000,
      density: 0.0010738501700693602,
    },
    {
      mass: 4500,
      density: 0.0010738501700693604,
    },
    {
      mass: 5000,
      density: 7.31880011463906e-7,
    },
    {
      mass: 5500,
      density: 2.064218687210785e-15,
    },
  ],
  'data_3': [
    {
      mass: 3000,
      density: 1.603868033172209e-49,
    },
    {
      mass: 3500,
      density: 1.2633257189546897e-29,
    },
    {
      mass: 4000,
      density: 2.064218687210785e-15,
    },
    {
      mass: 4500,
      density: 7.31880011463906e-7,
    },
    {
      mass: 5000,
      density: 0.0010738501700693602,
    },
    {
      mass: 5500,
      density: 0.0010738501700693604,
    },
  ],
  'layer_0_marks': [
    {
      datum: {
        mass: 3000,
        density: 0.0010738501700693602,
      },
    },
    {
      datum: {
        mass: 3500,
        density: 0.0010738501700693604,
      },
    },
    {
      datum: {
        mass: 4000,
        density: 7.31880011463906e-7,
      },
    },
    {
      datum: {
        mass: 4500,
        density: 2.064218687210785e-15,
      },
    },
    {
      datum: {
        mass: 5000,
        density: 1.2633257189546897e-29,
      },
    },
    {
      datum: {
        mass: 5500,
        density: 1.603868033172209e-49,
      },
    },
  ],
  'layer_1_marks': [
    {
      datum: {
        mass: 3000,
        density: 2.064218687210785e-15,
      },
    },
    {
      datum: {
        mass: 3500,
        density: 7.31880011463906e-7,
      },
    },
    {
      datum: {
        mass: 4000,
        density: 0.0010738501700693602,
      },
    },
    {
      datum: {
        mass: 4500,
        density: 0.0010738501700693604,
      },
    },
    {
      datum: {
        mass: 5000,
        density: 7.31880011463906e-7,
      },
    },
    {
      datum: {
        mass: 5500,
        density: 2.064218687210785e-15,
      },
    },
  ],
  'layer_2_marks': [
    {
      datum: {
        mass: 3000,
        density: 1.603868033172209e-49,
      },
    },
    {
      datum: {
        mass: 3500,
        density: 1.2633257189546897e-29,
      },
    },
    {
      datum: {
        mass: 4000,
        density: 2.064218687210785e-15,
      },
    },
    {
      datum: {
        mass: 4500,
        density: 7.31880011463906e-7,
      },
    },
    {
      datum: {
        mass: 5000,
        density: 0.0010738501700693602,
      },
    },
    {
      datum: {
        mass: 5500,
        density: 0.0010738501700693604,
      },
    },
  ],
};

/**
 * Build a {@link VegaView} stub backed by a dataset dump, mirroring how a
 * live Vega view answers `data(name)` — including throwing for names the
 * compiled spec never registered.
 */
export function makeView(datasets: Record<string, unknown[]>): VegaView {
  const view = {
    data: (name: string): Record<string, unknown>[] => {
      if (!(name in datasets))
        throw new Error(`no dataset ${name}`);
      return datasets[name] as Record<string, unknown>[];
    },
    container: () => null,
    runAsync: async () => view,
    scale: () => undefined,
  };
  return view as unknown as VegaView;
}
