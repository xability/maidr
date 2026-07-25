import type { BarPoint, BoxPoint, HistogramPoint, LinePoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import {
  facetedAsymmetricDatasets,
  facetedAsymmetricSpec,
} from './fixtures/facetedAsymmetricLayers';
import {
  facetedDensityDatasets,
  facetedDensitySpec,
} from './fixtures/facetedLayeredDensity';
import {
  layeredHistogramDatasets,
  layeredHistogramSpec,
  layeredTwoBarsDatasets,
  layeredTwoBarsSpec,
} from './fixtures/layeredNonLine';
import {
  repeatLayeredLineDatasets,
  repeatLayeredLineSpec,
} from './fixtures/repeatLayeredLine';
import { makeView } from './fixtures/testView';
import {
  layeredBoxplotDatasets,
  layeredBoxplotSpec,
  nestedColorLineDatasets,
  nestedColorLineSpec,
} from './fixtures/unreachableMarkDatasets';

/** Strip the compiled mark datasets, leaving only the data pipelines. */
function withoutMarkDatasets(
  datasets: Record<string, Record<string, unknown>[]>,
): Record<string, Record<string, unknown>[]> {
  return Object.fromEntries(
    Object.entries(datasets).filter(([name]) => !name.endsWith('_marks')),
  );
}

function layersOf(
  spec: Parameters<typeof vegaLiteToMaidr>[0],
  datasets: Record<string, Record<string, unknown>[]>,
): ReturnType<typeof vegaLiteToMaidr>['subplots'][0][0]['layers'] {
  return vegaLiteToMaidr(spec, makeView(datasets)).subplots[0][0].layers;
}

/**
 * The per-layer mark-dataset lookup is not line-specific — every layer of a
 * layered spec goes through it. These lock in that the generalisation is
 * safe for compiled shapes whose rows carry transform-mangled field names
 * (aggregate outputs, bin edges), where picking the wrong dataset is both
 * easy and silent.
 */
describe('vega-Lite layered non-line data alignment', () => {
  describe('two bar layers aggregated over different fields', () => {
    it('gives each layer the dataset its own mark draws', () => {
      const layers = layersOf(layeredTwoBarsSpec, layeredTwoBarsDatasets);
      expect(layers).toHaveLength(2);

      // Layer 0 aggregates by `cat`; layer 1 by `grp`. Compiled column
      // names (`sum_v`, `max_v`) survive Vega's aggregate mangling.
      expect(layers[0].data as BarPoint[]).toEqual([
        { x: 'A', y: 8 },
        { x: 'B', y: 9 },
      ]);
      expect(layers[1].data as BarPoint[]).toEqual([
        { x: 'x', y: 7 },
        { x: 'y', y: 5 },
      ]);
    });

    it('draws both layers from the wrong dataset without the mark datasets', () => {
      // Pins the sequential-numbering trap. Guessing sends layer 0 to
      // `data_0` (raw and unaggregated, four rows instead of two), and
      // layer 1 to `data_1` — layer 0's totals, which carry neither `grp`
      // nor `max_v`, so every point degrades to a blank label and zero.
      const layers = layersOf(
        layeredTwoBarsSpec,
        withoutMarkDatasets(layeredTwoBarsDatasets),
      );

      expect(layers[0].data as BarPoint[]).toHaveLength(4);
      expect(layers[1].data as BarPoint[]).toEqual([
        { x: '', y: 0 },
        { x: '', y: 0 },
      ]);
    });
  });

  describe('histogram layered with a mean rule', () => {
    it('reads binned counts rather than the raw source rows', () => {
      const bins = layersOf(
        layeredHistogramSpec,
        layeredHistogramDatasets,
      )[0].data as HistogramPoint[];

      expect(bins).toHaveLength(4);
      // Bin edges survive Vega's `bin_maxbins_10_n` mangling.
      expect(bins[0].xMin).toBe(1);
      expect(bins[0].xMax).toBe(2);
      expect(bins.reduce((total, bin) => total + Number(bin.y), 0)).toBe(6);
    });

    it('falls back to the raw unbinned rows without the mark datasets', () => {
      // There is no `data_0`, so guessing lands on `source_0` — the six raw
      // records, silently presented as if they were bins.
      const bins = layersOf(
        layeredHistogramSpec,
        withoutMarkDatasets(layeredHistogramDatasets),
      )[0].data as HistogramPoint[];

      expect(bins).toHaveLength(6);
    });
  });

  /**
   * `resolveMarkItemData` can never serve these shapes, so they must keep
   * working through the pre-existing name-guessing path. The fail-closed
   * fallback is what makes applying the mark lookup to every layered trace
   * type safe, and it is easy to break silently in a future refactor —
   * these pin it.
   */
  describe('shapes whose mark datasets are unreachable', () => {
    it('falls back for a colour-encoded line nested in a pathgroup', () => {
      // Vega wraps this mark in `layer_0_pathgroup`, so `layer_0_marks` is
      // nested and `view.data()` rejects it.
      const series = layersOf(
        nestedColorLineSpec,
        nestedColorLineDatasets,
      )[0].data as LinePoint[][];

      expect(series.map(s => s[0]?.z)).toEqual(['A', 'B']);
      expect(series.map(s => s.map(p => p.y))).toEqual([[1, 2, 6], [5, 9, 7]]);
    });

    it('falls back for a boxplot expanded into nested sub-layers', () => {
      // Vega-Lite expands a boxplot into `layer_0_layer_0_layer_0_marks`
      // and friends, so the `layer_0_marks` name the adapter derives from
      // the layer index never exists.
      const box = layersOf(
        layeredBoxplotSpec,
        layeredBoxplotDatasets,
      )[0].data as BoxPoint[];

      expect(box.map(b => b.z)).toEqual(['A', 'B']);
      expect(box[0].q2).toBe(2);
      expect(box[1].q2).toBe(7);
    });
  });

  describe('repeated layered spec', () => {
    /**
     * A repeat cell's marks are nested inside its group, so the mark lookup
     * always fails closed here and the pre-existing name guessing stands.
     * These pin that, and pin the residual limitation so it is visible
     * rather than assumed fixed.
     */
    it('falls back to name guessing, leaving per-layer data unresolved', () => {
      const panels = vegaLiteToMaidr(
        repeatLayeredLineSpec,
        makeView(repeatLayeredLineDatasets),
      ).subplots.flat();

      expect(panels).toHaveLength(2);

      // Layer 0 filters to t === 1, layer 1 draws every point. Both resolve
      // to `source_0` — the only dataset reachable at the top level — so the
      // filtered series shows all three points. Pre-existing behaviour that
      // the mark lookup cannot reach; documented, not endorsed.
      const series = panels[0].layers[0].data as LinePoint[][];
      expect(series.map(s => s.map(p => p.y))).toEqual([[1, 2, 5], [1, 2, 5]]);
    });

    it('still refuses a z axis when only one of the layers is named', () => {
      // The unanimity rule carries over: layer 0 resolves "1" from its
      // filter, layer 1 resolves nothing, so no dimension is claimed.
      const layer = vegaLiteToMaidr(
        repeatLayeredLineSpec,
        makeView(repeatLayeredLineDatasets),
      ).subplots.flat()[0].layers[0];

      expect((layer.data as LinePoint[][]).map(s => s[0]?.z)).toEqual(['1', undefined]);
      expect(layer.axes?.z).toBeUndefined();
    });
  });

  describe('faceted layered density chart', () => {
    /**
     * Facets slice a pre-resolved per-layer dataset per cell, so they never
     * reach the mark-dataset lookup — and their own mark datasets are not
     * addressable anyway. Without a separate mapping the merged series get
     * named (this PR) while all drawing layer 0's curve, which is exactly
     * the mislabelling the naming work exists to avoid.
     */
    function panelSeries(
      datasets: Record<string, Record<string, unknown>[]>,
    ): LinePoint[][][] {
      return vegaLiteToMaidr(facetedDensitySpec, makeView(datasets))
        .subplots
        .flat()
        .map(subplot => subplot.layers[0].data as LinePoint[][]);
    }

    it('gives every panel both species curves, each under its own name', () => {
      const panels = panelSeries(facetedDensityDatasets);
      expect(panels).toHaveLength(2);

      for (const series of panels) {
        expect(series.map(s => s[0]?.z)).toEqual(['Adelie', 'Chinstrap']);
        // Disjoint mass ranges: at x=3000 Adelie is near its peak while
        // Chinstrap is vanishingly small. Equal values would mean both
        // series drew the same layer's data.
        expect(Number(series[0][0].y)).toBeGreaterThan(Number(series[1][0].y));
      }
    });

    it('keeps declaration order when the layers transform asymmetrically', () => {
      // The repeat fixture shows a repeat spec numbering its layers in
      // reverse when only one of them filters, so this pins that facets do
      // NOT behave that way. Layer 0 filters to one species and peaks near
      // 3000; layer 1 is a flatter all-species mixture. A swap would put
      // the flat curve first.
      const panels = vegaLiteToMaidr(
        facetedAsymmetricSpec,
        makeView(facetedAsymmetricDatasets),
      ).subplots.flat();

      expect(panels).toHaveLength(2);
      for (const panel of panels) {
        const series = panel.layers[0].data as LinePoint[][];
        expect(series.map(s => s[0]?.z)).toEqual(['Adelie', 'All species']);
        expect(Number(series[0][0].y)).toBeGreaterThan(Number(series[1][0].y));
      }
    });

    it('does not remap when the pipeline count is ambiguous', () => {
      // Fails closed: drop one layer's pipeline and the per-layer mapping
      // no longer matches the layer count, so the previous name-guessing
      // behaviour stands rather than a half-applied guess.
      const { data_3: _dropped, ...ambiguous } = facetedDensityDatasets;
      const panels = panelSeries(ambiguous);

      for (const series of panels) {
        expect(Number(series[0][0].y)).toBe(Number(series[1][0].y));
      }
    });
  });
});
