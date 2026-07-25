import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';
import { densitySpec, densityViewDatasets } from './fixtures/altairLayeredDensity';
import { makeView } from './fixtures/testView';

/** Convenience: the single layer a merged multi-series line spec produces. */
function onlyLayer(spec: VegaLiteSpec, view?: ReturnType<typeof makeView>): MaidrLayer {
  const layers = vegaLiteToMaidr(spec, view).subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

function seriesNames(layer: MaidrLayer): (string | undefined)[] {
  return (layer.data as LinePoint[][]).map(series => series[0]?.z);
}

/**
 * Build a layered line spec whose layers differ only in the per-layer
 * fragment under test, so a naming assertion isolates that one source.
 */
function layeredLineSpec(layerFragments: VegaLiteSpec[]): VegaLiteSpec {
  return {
    layer: layerFragments.map((fragment, i) => ({
      mark: 'line',
      data: { values: [{ x: 1, y: i + 1 }, { x: 2, y: i + 2 }] },
      encoding: {
        x: { field: 'x', type: 'quantitative' },
        y: { field: 'y', type: 'quantitative' },
      },
      ...fragment,
    })),
  };
}

describe('vega-Lite merged multi-series line layers', () => {
  describe('real altair layered density chart', () => {
    const view = makeView(densityViewDatasets);

    it('coalesces the three per-species layers into one multi-series line trace', () => {
      const layer = onlyLayer(densitySpec, view);

      expect(layer.type).toBe(TraceType.LINE);
      expect(layer.data as LinePoint[][]).toHaveLength(3);
    });

    it('names each merged series from encoding.color.datum', () => {
      const layer = onlyLayer(densitySpec, view);

      expect(seriesNames(layer)).toEqual(['Adelie', 'Chinstrap', 'Gentoo']);
    });

    it('labels the z axis with the dimension the series vary along', () => {
      const layer = onlyLayer(densitySpec, view);

      expect(layer.axes?.z).toEqual({ label: 'species' });
    });

    it('stamps the series name on every point, not just the first', () => {
      const layer = onlyLayer(densitySpec, view);
      const series = layer.data as LinePoint[][];

      series.forEach((points, i) => {
        const expected = ['Adelie', 'Chinstrap', 'Gentoo'][i];
        expect(points.every(p => p.z === expected)).toBe(true);
      });
    });

    it('gives each named series its own density curve', () => {
      // The three species occupy disjoint mass ranges, so each curve peaks
      // at a different x. If a series were paired with the wrong layer's
      // dataset the peaks would repeat — the name would then be a lie,
      // which is worse for a screen reader user than no name at all.
      const series = onlyLayer(densitySpec, view).data as LinePoint[][];
      const peakX = series.map(points =>
        points.reduce((best, p) => (p.y > best.y ? p : best)).x,
      );

      expect(new Set(peakX).size).toBe(3);
      expect(peakX[0]).toBeLessThan(peakX[1] as number);
      expect(peakX[1]).toBeLessThan(peakX[2] as number);
    });

    it('keeps one highlight selector per merged series', () => {
      const layer = onlyLayer(densitySpec, view);

      expect(layer.selectors).toEqual([
        'g.mark-line.role-mark.layer_0_marks > path',
        'g.mark-line.role-mark.layer_1_marks > path',
        'g.mark-line.role-mark.layer_2_marks > path',
      ]);
    });
  });

  describe('series name sources', () => {
    it('reads encoding.color.datum', () => {
      const layer = onlyLayer(layeredLineSpec([
        { encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { datum: 'Alpha' } } },
        { encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { datum: 'Beta' } } },
      ]));

      expect(seriesNames(layer)).toEqual(['Alpha', 'Beta']);
    });

    it('reads encoding.fill.datum', () => {
      const layer = onlyLayer(layeredLineSpec([
        { encoding: { x: { field: 'x' }, y: { field: 'y' }, fill: { datum: 'Alpha' } } },
        { encoding: { x: { field: 'x' }, y: { field: 'y' }, fill: { datum: 'Beta' } } },
      ]));

      expect(seriesNames(layer)).toEqual(['Alpha', 'Beta']);
    });

    it('reads a {field, equal} filter predicate', () => {
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: { field: 'site', equal: 'Alpha' } }] },
        { transform: [{ filter: { field: 'site', equal: 'Beta' } }] },
      ]));

      expect(seriesNames(layer)).toEqual(['Alpha', 'Beta']);
      expect(layer.axes?.z).toEqual({ label: 'site' });
    });

    it('reads the layer title', () => {
      const layer = onlyLayer(layeredLineSpec([
        { title: 'Alpha' },
        { title: { text: 'Beta' } },
      ]));

      expect(seriesNames(layer)).toEqual(['Alpha', 'Beta']);
    });

    it('reads a lone datum equality expression filter', () => {
      // Altair emits this shape for `transform_filter(alt.datum.f == v)`.
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: '(datum.site === \'Alpha\')' }] },
        { transform: [{ filter: 'datum[\'site\'] == "Beta"' }] },
      ]));

      expect(seriesNames(layer)).toEqual(['Alpha', 'Beta']);
      expect(layer.axes?.z).toEqual({ label: 'site' });
    });

    it('reads an unquoted numeric equality expression filter', () => {
      // Altair emits the literal unquoted for `alt.datum.year == 2020`, so
      // restricting the pattern to strings would silently drop every
      // numerically grouped chart's names.
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: '(datum.year === 2020)' }] },
        { transform: [{ filter: '(datum.year === 2021)' }] },
      ]));

      expect(seriesNames(layer)).toEqual(['2020', '2021']);
      expect(layer.axes?.z).toEqual({ label: 'year' });
    });

    it('reads an unquoted boolean equality expression filter', () => {
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: '(datum.flag === true)' }] },
        { transform: [{ filter: '(datum.flag === false)' }] },
      ]));

      expect(seriesNames(layer)).toEqual(['true', 'false']);
    });

    it('reads a negative or fractional numeric literal', () => {
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: '(datum.offset === -1.5)' }] },
        { transform: [{ filter: '(datum.offset === 2)' }] },
      ]));

      expect(seriesNames(layer)).toEqual(['-1.5', '2']);
    });

    it('coerces a non-string datum to its display form', () => {
      const layer = onlyLayer(layeredLineSpec([
        { encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { datum: 2020 } } },
        { encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { datum: 2021 } } },
      ]));

      expect(seriesNames(layer)).toEqual(['2020', '2021']);
    });

    it('prefers color.datum over a filter and a title', () => {
      const layer = onlyLayer(layeredLineSpec([
        {
          title: 'Titled',
          transform: [{ filter: { field: 'site', equal: 'Filtered' } }],
          encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { datum: 'Datum' } },
        },
        { encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { datum: 'Other' } } },
      ]));

      expect(seriesNames(layer)).toEqual(['Datum', 'Other']);
    });

    it('reads a color encoding hoisted onto the layered parent spec', () => {
      // Vega-Lite lets a shared channel live on the parent instead of being
      // repeated on every child. The merge must see the same merged
      // encoding `convertLayerSpec` already receives.
      const spec: VegaLiteSpec = {
        encoding: { color: { field: 'species', title: 'Species' } },
        layer: [
          {
            mark: 'line',
            data: {
              values: [
                { x: 1, y: 1, species: 'Alpha' },
                { x: 2, y: 2, species: 'Alpha' },
              ],
            },
            transform: [{ filter: { field: 'species', equal: 'Alpha' } }],
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
          {
            mark: 'line',
            data: {
              values: [
                { x: 1, y: 3, species: 'Beta' },
                { x: 2, y: 4, species: 'Beta' },
              ],
            },
            transform: [{ filter: { field: 'species', equal: 'Beta' } }],
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
        ],
      };

      const layer = onlyLayer(spec);
      expect(seriesNames(layer)).toEqual(['Alpha', 'Beta']);
      // The parent's channel `title` is what names the dimension. Without
      // the parent encoding reaching the merge, this falls back to the raw
      // filter field name (`species`) instead.
      expect(layer.axes?.z).toEqual({ label: 'Species' });
    });

    it('prefers a filter predicate over the layer title', () => {
      const layer = onlyLayer(layeredLineSpec([
        { title: 'Titled', transform: [{ filter: { field: 'site', equal: 'Filtered' } }] },
        { title: 'Other' },
      ]));

      expect(seriesNames(layer)).toEqual(['Filtered', 'Other']);
    });
  });

  describe('refuses to invent a name', () => {
    it('leaves z unset when the spec names the series nowhere', () => {
      const layer = onlyLayer(layeredLineSpec([{}, {}]));

      expect(seriesNames(layer)).toEqual([undefined, undefined]);
      expect(layer.axes?.z).toBeUndefined();
    });

    it('ignores a compound expression filter', () => {
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: 'datum.site === \'Alpha\' && datum.year === 2020' }] },
        { transform: [{ filter: 'datum.site === \'Beta\' && datum.year === 2020' }] },
      ]));

      expect(seriesNames(layer)).toEqual([undefined, undefined]);
    });

    it('ignores an identifier right-hand side', () => {
      // A bare identifier is a variable reference, not a literal the layer
      // was narrowed to, so it names nothing.
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: 'datum.site === other' }] },
        { transform: [{ filter: 'datum.site === datum.fallback' }] },
      ]));

      expect(seriesNames(layer)).toEqual([undefined, undefined]);
    });

    it('ignores a non-equality expression filter', () => {
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: 'datum.mass > 3000' }] },
        { transform: [{ filter: 'datum.mass > 4000' }] },
      ]));

      expect(seriesNames(layer)).toEqual([undefined, undefined]);
    });

    it('ignores expression filters when a layer declares more than one', () => {
      // With several, no single filter identifies the series.
      const layer = onlyLayer(layeredLineSpec([
        {
          transform: [
            { filter: 'datum.site === \'Alpha\'' },
            { filter: 'datum.year === \'2020\'' },
          ],
        },
        {
          transform: [
            { filter: 'datum.site === \'Beta\'' },
            { filter: 'datum.year === \'2020\'' },
          ],
        },
      ]));

      expect(seriesNames(layer)).toEqual([undefined, undefined]);
    });

    it('ignores an expression filter with unbalanced parentheses', () => {
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: '(datum.site === \'Alpha\'' }] },
        { transform: [{ filter: '(datum.site === \'Beta\'' }] },
      ]));

      expect(seriesNames(layer)).toEqual([undefined, undefined]);
    });

    it('drops axes.z when sub-layers name different dimensions', () => {
      // The series are still named — each layer's own filter says what it
      // drew — but the run has no single z axis, so labelling it with one
      // layer's field would mislabel the other's series.
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: { field: 'site', equal: 'Alpha' } }] },
        { transform: [{ filter: { field: 'year', equal: '2020' } }] },
      ]));

      expect(seriesNames(layer)).toEqual(['Alpha', '2020']);
      expect(layer.axes?.z).toBeUndefined();
    });

    it('drops axes.z when a sub-layer names a series but no dimension', () => {
      // `Beta` comes from a title, which says nothing about `site`. Titling
      // the axis `site` would assert that Beta is a site.
      const layer = onlyLayer(layeredLineSpec([
        { transform: [{ filter: { field: 'site', equal: 'Alpha' } }] },
        { title: 'Beta' },
      ]));

      expect(seriesNames(layer)).toEqual(['Alpha', 'Beta']);
      expect(layer.axes?.z).toBeUndefined();
    });

    it('ignores a {field, equal} filter when the layer declares several', () => {
      // Both layers agree on `site` and differ only on `year`; naming them
      // from the first filter would collide two distinct series on "Alpha".
      const layer = onlyLayer(layeredLineSpec([
        {
          transform: [
            { filter: { field: 'site', equal: 'Alpha' } },
            { filter: { field: 'year', equal: 2020 } },
          ],
        },
        {
          transform: [
            { filter: { field: 'site', equal: 'Alpha' } },
            { filter: { field: 'year', equal: 2021 } },
          ],
        },
      ]));

      expect(seriesNames(layer)).toEqual([undefined, undefined]);
      expect(layer.axes?.z).toBeUndefined();
    });

    it('still reads a filter that sits alongside non-filter transforms', () => {
      // A `density` / `aggregate` transform narrows nothing, so it must not
      // count toward the compound-filter guard. This is the Altair shape.
      const layer = onlyLayer(layeredLineSpec([
        {
          transform: [
            { filter: { field: 'site', equal: 'Alpha' } },
            { density: 'x', as: ['x', 'density'] },
          ],
        },
        {
          transform: [
            { filter: { field: 'site', equal: 'Beta' } },
            { density: 'x', as: ['x', 'density'] },
          ],
        },
      ]));

      expect(seriesNames(layer)).toEqual(['Alpha', 'Beta']);
      expect(layer.axes?.z).toEqual({ label: 'site' });
    });

    it('drops axes.z when a sub-layer inherits the dimension but stays unnamed', () => {
      // The parent's `color` field makes `extractLineData` group on `site`,
      // so the third layer — whose rows have no `site`, and which the spec
      // names nowhere — comes out blank. It resolves `site` as its
      // dimension all the same, so counting that would title the axis
      // `site` over a series that isn't in it.
      const rows = (site: string): Record<string, unknown>[] =>
        [{ x: 1, y: 1, site }, { x: 2, y: 2, site }];
      const spec: VegaLiteSpec = {
        encoding: { color: { field: 'site', type: 'nominal' } },
        layer: [
          {
            mark: 'line',
            data: { values: rows('Alpha') },
            transform: [{ filter: { field: 'site', equal: 'Alpha' } }],
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
          {
            mark: 'line',
            data: { values: rows('Beta') },
            transform: [{ filter: { field: 'site', equal: 'Beta' } }],
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
          {
            mark: 'line',
            data: { values: [{ x: 1, y: 7 }, { x: 2, y: 8 }] },
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
        ],
      };

      const layer = onlyLayer(spec);
      expect(seriesNames(layer)).toEqual(['Alpha', 'Beta', '']);
      expect(layer.axes?.z).toBeUndefined();
    });

    it('fills a blank inherited z when the layer does resolve a name', () => {
      // Same shape, except the third layer carries a title. `z: ''` is not
      // a real name, so the derived one replaces it rather than being
      // blocked by it.
      const spec: VegaLiteSpec = {
        encoding: { color: { field: 'site', type: 'nominal' } },
        layer: [
          {
            mark: 'line',
            data: { values: [{ x: 1, y: 1, site: 'Alpha' }, { x: 2, y: 2, site: 'Alpha' }] },
            transform: [{ filter: { field: 'site', equal: 'Alpha' } }],
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
          {
            mark: 'line',
            title: 'Baseline',
            data: { values: [{ x: 1, y: 7 }, { x: 2, y: 8 }] },
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
        ],
      };

      expect(seriesNames(onlyLayer(spec))).toEqual(['Alpha', 'Baseline']);
    });

    it('names only the layers that resolve, leaving the rest bare', () => {
      const layer = onlyLayer(layeredLineSpec([
        { encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { datum: 'Alpha' } } },
        {},
      ]));

      expect(seriesNames(layer)).toEqual(['Alpha', undefined]);
    });
  });

  describe('leaves existing series names alone', () => {
    it('keeps the per-point z of a colour-field-encoded layer', () => {
      // This layer already splits into two named series on its own; the
      // merge must not overwrite them with the layer-level name.
      const spec: VegaLiteSpec = {
        layer: [
          {
            mark: 'line',
            title: 'Layer title',
            data: {
              values: [
                { x: 1, y: 1, g: 'Real A' },
                { x: 2, y: 2, g: 'Real A' },
                { x: 1, y: 3, g: 'Real B' },
                { x: 2, y: 4, g: 'Real B' },
              ],
            },
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
              color: { field: 'g', type: 'nominal' },
            },
          },
          {
            mark: 'line',
            title: 'Derived',
            data: { values: [{ x: 1, y: 9 }, { x: 2, y: 8 }] },
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
        ],
      };

      const layer = onlyLayer(spec);
      expect(seriesNames(layer)).toEqual(['Real A', 'Real B', 'Derived']);
      // `Derived` is not a value of `g`, so the run has no shared z axis
      // even though the grouped layer alone would have named one.
      expect(layer.axes?.z).toBeUndefined();
    });

    it('does not stamp a name on a lone line layer that was never merged', () => {
      const spec: VegaLiteSpec = {
        layer: [
          {
            mark: 'line',
            title: 'Trend',
            data: { values: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
          {
            mark: 'point',
            data: { values: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
        ],
      };

      const layers = vegaLiteToMaidr(spec).subplots[0][0].layers;
      expect(layers).toHaveLength(2);
      expect(seriesNames(layers[0])).toEqual([undefined]);
      expect(layers[0].axes?.z).toBeUndefined();
    });
  });
});

describe('vega-Lite per-layer dataset resolution', () => {
  /**
   * The compiled density chart registers `data_1` … `data_3` and no
   * `data_0`, which is what makes name guessing land on the wrong dataset
   * from layer 1 onward.
   */
  it('reads each layer from its own mark dataset', () => {
    const series = onlyLayer(densitySpec, makeView(densityViewDatasets)).data as LinePoint[][];

    series.forEach((points, i) => {
      const expected = densityViewDatasets[`layer_${i}_marks`]
        .map(item => (item as { datum: { mass: number; density: number } }).datum);
      expect(points.map(p => p.x)).toEqual(expected.map(d => d.mass));
      expect(points.map(p => p.y)).toEqual(expected.map(d => d.density));
    });
  });

  it('falls back to pipeline dataset names when no mark dataset exists', () => {
    const pipelinesOnly = Object.fromEntries(
      Object.entries(densityViewDatasets).filter(([name]) => !name.endsWith('_marks')),
    );

    const series = onlyLayer(densitySpec, makeView(pipelinesOnly)).data as LinePoint[][];

    // The legacy guess resolves layer 0 to `data_1`; the assertion pins the
    // fallback as still reachable, not as correct.
    expect(series).toHaveLength(3);
    expect(series[0].map(p => p.y)).toEqual(
      (densityViewDatasets.data_1 as { density: number }[]).map(d => d.density),
    );
  });

  it('falls back when mark items carry no datum back-reference', () => {
    const noDatum = {
      ...densityViewDatasets,
      layer_0_marks: [{ x: 0, y: 0 }],
      layer_1_marks: [{ x: 0, y: 0 }],
      layer_2_marks: [{ x: 0, y: 0 }],
    };

    const series = onlyLayer(densitySpec, makeView(noDatum)).data as LinePoint[][];

    expect(series).toHaveLength(3);
    expect(series[0].map(p => p.y)).toEqual(
      (densityViewDatasets.data_1 as { density: number }[]).map(d => d.density),
    );
  });
});
