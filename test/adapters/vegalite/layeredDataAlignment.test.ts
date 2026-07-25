import type { BarPoint, HistogramPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import {
  layeredHistogramDatasets,
  layeredHistogramSpec,
  layeredTwoBarsDatasets,
  layeredTwoBarsSpec,
} from './fixtures/layeredNonLine';
import { makeView } from './fixtures/testView';

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
});
