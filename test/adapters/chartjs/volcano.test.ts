import type { ChartJsChart, ChartJsData, ChartJsDataset, ChartJsOptions, MaidrPluginOptions } from '@adapters/chartjs/types';
import type { MaidrLayer, ScatterPoint, VolcanoPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { TraceType } from '@type/grammar';

/**
 * Build a minimal chart for the extractor to read.
 *
 * @param datasets The datasets the chart carries
 * @param type What Chart.js is drawing the chart as
 * @param options Chart options, for the scales
 * @returns A chart object shaped the way the extractor expects
 */
function chartOf(
  datasets: ChartJsDataset[],
  type = 'scatter',
  options: ChartJsOptions = {},
): ChartJsChart {
  const data: ChartJsData = { datasets };
  return {
    canvas: { id: 'test-chart' } as unknown as HTMLCanvasElement,
    data,
    options,
    config: { type },
    getDatasetMeta: () => ({ data: [], type }),
    setActiveElements: () => {},
    update: () => {},
  };
}

/** The layers a chart produces, in emission order. */
function layersOf(chart: ChartJsChart, pluginOptions?: MaidrPluginOptions): MaidrLayer[] {
  return extractChartData(chart, pluginOptions).maidr.subplots[0][0].layers;
}

/** The points of a chart's only layer, as a volcano carries them. */
function pointsOf(chart: ChartJsChart): VolcanoPoint[] {
  return layersOf(chart)[0].data as VolcanoPoint[];
}

/** Everything the plugin's navigation bridge resolves highlights through. */
function highlightsOf(chart: ChartJsChart): (
  layerId: string,
  row: number,
  col: number,
) => { datasetIndex: number; index: number }[] {
  const { maidr, layerDatasetIndices } = extractChartData(chart);
  const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
  const maps = computeTargetMaps(chart, layers, layerDatasetIndices);
  return (layerId, row, col) =>
    resolveActiveTargets(layers, maps, layerDatasetIndices, layerId, row, col);
}

/** Two genes of a differential expression analysis, as a page would write them. */
const genes: ChartJsDataset = {
  label: 'Genes',
  data: [
    { x: -2.4, y: 8.1, gene: 'TP53' },
    { x: 1.1, y: 0.6, gene: 'ACTB' },
  ],
};

describe('chart.js volcano and manhattan extraction', () => {
  let warnings: string[];

  beforeEach(() => {
    warnings = [];
    jest.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('reading the declaration', () => {
    it('reads a declared scatter as a volcano, with the thresholds it declares', () => {
      const chart = chartOf([{
        ...genes,
        maidr: {
          type: TraceType.VOLCANO,
          significance: 1.3,
          effect: 1,
          significanceDirection: 'above',
        },
      }]);

      const layer = layersOf(chart)[0];

      expect(layer.type).toBe(TraceType.VOLCANO);
      expect(layer.thresholdOptions).toEqual({
        significance: 1.3,
        effect: 1,
        significanceDirection: 'above',
      });
    });

    it('carries the identity the declaration names off the datum', () => {
      // Chart.js passes properties it does not know through untouched, which
      // is where the gene name rides; the coordinates alone are the two
      // numbers the axes already describe.
      const chart = chartOf([{
        ...genes,
        maidr: { type: TraceType.VOLCANO, label: 'gene', significance: 1.3 },
      }]);

      expect(pointsOf(chart)).toEqual([
        { x: -2.4, y: 8.1, label: 'TP53' },
        { x: 1.1, y: 0.6, label: 'ACTB' },
      ]);
    });

    it('defaults the identity field to the grammar name and its spellings', () => {
      // `label` falls back to snp, id, name, gene, probe — so a row that
      // already carries one of them needs no field named at all.
      const chart = chartOf([{ ...genes, maidr: { type: TraceType.VOLCANO } }]);

      expect(pointsOf(chart).map(point => point.label)).toEqual(['TP53', 'ACTB']);
    });

    it('uses an explicit field name verbatim, with no fallback', () => {
      // An explicit name that misses is the author's mistake, and resolving
      // `gene` behind their back would hide it.
      const chart = chartOf([{
        data: [{ x: 1, y: 2, gene: 'TP53', symbol: 'p53' }],
        maidr: { type: TraceType.VOLCANO, label: 'symbol', significance: 1.3 },
      }]);

      expect(pointsOf(chart)[0].label).toBe('p53');
    });

    it('omits an identity no row carries, and says so', () => {
      const chart = chartOf([{
        label: 'Genes',
        data: [{ x: 1, y: 2, gene: 'TP53' }],
        maidr: { type: TraceType.VOLCANO, label: 'symbol', significance: 1.3 },
      }]);

      expect(pointsOf(chart)[0]).toEqual({ x: 1, y: 2 });
      expect(warnings).toContainEqual(
        expect.stringContaining('names "symbol" for label, which no row carries'),
      );
    });

    it('reads a chromosome written as a number', () => {
      // `group` falls back to chromosome, chrom, chr, region, and a
      // chromosome is very often authored as the number 7.
      const chart = chartOf([{
        data: [{ x: 1e6, y: 8.2, snp: 'rs123', chr: 7 }],
        maidr: { type: TraceType.MANHATTAN, significance: 7.3 },
      }]);

      expect(pointsOf(chart)[0]).toEqual({
        x: 1e6,
        y: 8.2,
        label: 'rs123',
        group: '7',
      });
    });

    it('leaves an undeclared scatter exactly as it was', () => {
      // The identity fields are read only where a declaration asks for them:
      // a `gene` column on an ordinary scatter is the author's data, not a
      // MAIDR annotation, and reading it would announce it unasked.
      const layer = layersOf(chartOf([genes]))[0];

      expect(layer.type).toBe(TraceType.SCATTER);
      expect(layer.thresholdOptions).toBeUndefined();
      expect(layer.data as ScatterPoint[]).toEqual([
        { x: -2.4, y: 8.1 },
        { x: 1.1, y: 0.6 },
      ]);
    });

    it('keeps a bubble volcano radius on z', () => {
      const chart = chartOf([{
        data: [{ x: 1, y: 2, r: 9, gene: 'TP53' }],
        maidr: { type: TraceType.VOLCANO, significance: 1.3 },
      }], 'bubble');

      expect(pointsOf(chart)[0]).toEqual({ x: 1, y: 2, z: 9, label: 'TP53' });
      expect(layersOf(chart)[0].axes?.z?.label).toBe('Size');
    });
  });

  describe('never defaulting an inversion', () => {
    it('emits no threshold block at all when none is declared', () => {
      // A guessed line sorts every point in the figure onto the wrong side of
      // it, silently, so the layer degrades to a cloud that reports no
      // findings — and says which field it wanted.
      const chart = chartOf([{ ...genes, maidr: { type: TraceType.VOLCANO } }]);

      const layer = layersOf(chart)[0];

      expect(layer.type).toBe(TraceType.VOLCANO);
      expect(layer.thresholdOptions).toBeUndefined();
      expect(warnings).toContainEqual(expect.stringContaining('declares no significance'));
    });

    it('emits an effect cutoff on its own', () => {
      const chart = chartOf([{ ...genes, maidr: { type: TraceType.VOLCANO, effect: 1.5 } }]);

      expect(layersOf(chart)[0].thresholdOptions).toEqual({ effect: 1.5 });
    });

    it('passes a below-the-line reading through', () => {
      // A raw p axis runs the other way: fixed to 'above', the reading would
      // select precisely the points that failed to reach significance.
      const chart = chartOf([{
        ...genes,
        maidr: {
          type: TraceType.VOLCANO,
          significance: 0.05,
          significanceDirection: 'below',
        },
      }]);

      expect(layersOf(chart)[0].thresholdOptions?.significanceDirection).toBe('below');
    });

    it('drops a mis-cased direction rather than reading it as the other one', () => {
      const chart = chartOf([{
        ...genes,
        maidr: {
          type: TraceType.VOLCANO,
          significance: 0.05,
          // Not an Orientation-style typo an author would catch: 'Below' is
          // the plain-JS spelling of the value that inverts the finding.
          significanceDirection: 'Below' as 'below',
        },
      }]);

      // Dropped, so the grammar's own 'above' default applies rather than a
      // wrong reading being carried into the layer.
      expect(layersOf(chart)[0].thresholdOptions).toEqual({ significance: 0.05 });
      expect(warnings).toContainEqual(
        expect.stringContaining('has significanceDirection "Below"'),
      );
    });
  });

  describe('several datasets, one cloud', () => {
    /** A chromosome's worth of points, as a per-chromosome dataset carries them. */
    const chromosome = (label: string, x: number): ChartJsDataset => ({
      label,
      data: [{ x, y: 8, snp: `rs${x}` }],
    });

    it('merges a manhattan chart\'s following datasets into one layer', () => {
      const chart = chartOf([
        { ...chromosome('chr1', 1), maidr: { type: TraceType.MANHATTAN, significance: 7.3 } },
        chromosome('chr2', 2),
        chromosome('chr3', 3),
      ]);

      const layers = layersOf(chart);

      expect(layers).toHaveLength(1);
      expect(layers[0].type).toBe(TraceType.MANHATTAN);
      expect((layers[0].data as VolcanoPoint[]).map(point => point.x)).toEqual([1, 2, 3]);
      // The declaring dataset names one chromosome, not the cloud, so the
      // merged layer does not wear its label as the figure's title.
      expect(layers[0].title).toBeUndefined();
    });

    it('keeps a manhattan chart\'s datasets apart when the page says not to merge', () => {
      const chart = chartOf([
        {
          ...chromosome('chr1', 1),
          maidr: { type: TraceType.MANHATTAN, significance: 7.3, merge: false },
        },
        chromosome('chr2', 2),
      ]);

      const layers = layersOf(chart);

      expect(layers).toHaveLength(2);
      expect(layers.map(layer => layer.type)).toEqual([
        TraceType.MANHATTAN,
        TraceType.SCATTER,
      ]);
      expect(layers[0].title).toBe('chr1');
    });

    it('leaves a volcano\'s siblings alone unless it asks for them', () => {
      // Up-regulated, down-regulated and unchanged are three things a reader
      // wants told apart, not one cloud.
      const chart = chartOf([
        { ...genes, maidr: { type: TraceType.VOLCANO, significance: 1.3 } },
        { label: 'Unchanged', data: [{ x: 0.1, y: 0.2 }] },
      ]);

      expect(layersOf(chart).map(layer => layer.type)).toEqual([
        TraceType.VOLCANO,
        TraceType.SCATTER,
      ]);
    });

    it('stops merging at the next dataset that declares something', () => {
      const chart = chartOf([
        { ...chromosome('chr1', 1), maidr: { type: TraceType.MANHATTAN, significance: 7.3 } },
        chromosome('chr2', 2),
        {
          ...chromosome('replication', 3),
          maidr: { type: TraceType.MANHATTAN, significance: 5, merge: false },
        },
        chromosome('trailing', 4),
      ]);

      const layers = layersOf(chart);

      expect(layers.map(layer => layer.id)).toEqual(['0', '2', '3']);
      expect((layers[0].data as VolcanoPoint[]).map(point => point.x)).toEqual([1, 2]);
      expect((layers[1].data as VolcanoPoint[]).map(point => point.x)).toEqual([3]);
      expect(layers[2].type).toBe(TraceType.SCATTER);
    });

    it('does not absorb a dataset whose own block failed to read', () => {
      // The block did not take, and the author was told so — but they were
      // saying this dataset is not simply more of the cloud before it, and
      // folding it in anyway would answer a mistake with a merge.
      const chart = chartOf([
        { ...chromosome('chr1', 1), maidr: { type: TraceType.MANHATTAN, significance: 7.3 } },
        { ...chromosome('other', 2), maidr: { type: TraceType.HEXBIN } },
      ]);

      const layers = layersOf(chart);

      expect(layers.map(layer => layer.type)).toEqual([
        TraceType.MANHATTAN,
        TraceType.SCATTER,
      ]);
      expect((layers[0].data as VolcanoPoint[]).map(point => point.x)).toEqual([1]);
    });

    it('highlights across every dataset a merged layer was folded from', () => {
      // The whole point of the merge: one navigable trace whose columns still
      // reach the elements Chart.js drew, in whichever dataset they live.
      const chart = chartOf([
        {
          label: 'chr1',
          data: [{ x: 3, y: 8 }, { x: 1, y: 5 }],
          maidr: { type: TraceType.MANHATTAN, significance: 7.3 },
        },
        { label: 'chr2', data: [{ x: 2, y: 6 }, { x: 3, y: 9 }] },
      ]);

      const resolve = highlightsOf(chart);

      // Buckets run in ascending x, as `ScatterTrace` orders its columns:
      // x = 1, x = 2, then the two points sharing x = 3.
      expect(resolve('0', 0, 0)).toEqual([{ datasetIndex: 0, index: 1 }]);
      expect(resolve('0', 0, 1)).toEqual([{ datasetIndex: 1, index: 0 }]);
      expect(resolve('0', 0, 2)).toEqual([
        { datasetIndex: 0, index: 0 },
        { datasetIndex: 1, index: 1 },
      ]);
    });
  });

  describe('a declaration that cannot be honoured', () => {
    it('reads a volcano declared on a bar chart as the bar chart it is', () => {
      const chart = chartOf(
        [{ label: 'Sales', data: [1, 2, 3], maidr: { type: TraceType.VOLCANO } }],
        'bar',
      );

      expect(layersOf(chart)[0].type).toBe(TraceType.BAR);
      expect(warnings).toContainEqual(
        expect.stringContaining('needs a scatter or bubble dataset'),
      );
    });

    it('reads a type this adapter has no construct for as the undeclared chart', () => {
      const chart = chartOf([{ ...genes, maidr: { type: TraceType.HEXBIN } }]);

      expect(layersOf(chart)[0].type).toBe(TraceType.SCATTER);
      expect(warnings).toContainEqual(
        expect.stringContaining('has no reading for'),
      );
    });

    it('keeps the known keys of a block that carries an unknown one', () => {
      const chart = chartOf([{
        ...genes,
        maidr: {
          type: TraceType.VOLCANO,
          significance: 1.3,
          // The typo a plain-JS author has no compiler to catch.
          significanse: 7.3,
        } as never,
      }]);

      expect(layersOf(chart)[0].thresholdOptions).toEqual({ significance: 1.3 });
      expect(warnings).toContainEqual(
        expect.stringContaining('has unknown key "significanse"'),
      );
    });

    it('reads a block that is not an object as no declaration at all', () => {
      const chart = chartOf([{ ...genes, maidr: 'volcano' as never }]);

      expect(layersOf(chart)[0].type).toBe(TraceType.SCATTER);
      expect(warnings).toContainEqual(expect.stringContaining('is not an object'));
    });
  });

  describe('precedence against the chart-wide declaration', () => {
    it('lets a dataset block reach the survival path plugins.maidr.traceType reaches', () => {
      const chart = chartOf([{
        label: 'Treatment',
        data: [{ x: 0, y: 1 }, { x: 6, y: 0.82, censored: true }],
        stepped: 'after',
        maidr: { type: TraceType.SURVIVAL },
      }], 'line', { scales: { x: { type: 'linear' } } });

      const layer = layersOf(chart)[0];

      expect(layer.type).toBe(TraceType.SURVIVAL);
      expect(layer.stepDirection).toBe('vh');
    });

    it('reads the chart-wide traceType where no dataset carries a block', () => {
      // The shorthand names no field and no cutoff, so what it buys is the
      // trace type and whatever the default name chain finds — smaller than a
      // block gives, and still a volcano.
      const layer = layersOf(chartOf([genes]), { traceType: TraceType.VOLCANO })[0];

      expect(layer.type).toBe(TraceType.VOLCANO);
      expect(layer.thresholdOptions).toBeUndefined();
      expect((layer.data as VolcanoPoint[])[0].label).toBe('TP53');
    });

    it('lets a dataset block outrank the chart-wide traceType', () => {
      const chart = chartOf([{
        ...genes,
        maidr: { type: TraceType.MANHATTAN, significance: 7.3 },
      }]);

      expect(layersOf(chart, { traceType: TraceType.VOLCANO })[0].type)
        .toBe(TraceType.MANHATTAN);
    });

    it('lets the dataset block win over plugins.maidr.traceType, naming both', () => {
      const chart = chartOf([{
        label: 'Treatment',
        data: [{ x: 0, y: 1 }],
        stepped: 'after',
        maidr: { type: TraceType.SURVIVAL },
      }], 'line', { scales: { x: { type: 'linear' } } });

      const layer = layersOf(chart, { traceType: TraceType.DOT })[0];

      expect(layer.type).toBe(TraceType.SURVIVAL);
      expect(warnings).toContainEqual(
        expect.stringContaining('the declaration wins'),
      );
    });

    it('names every type where two datasets declare the chart differently', () => {
      // A mixed chart: the survival arm is drawn as a line, the second dataset
      // as a scatter, so both blocks survive their construct check and reach
      // the one whole-chart reading a line chart gets.
      const chart = chartOf([
        {
          label: 'Treatment',
          data: [{ x: 0, y: 1 }],
          stepped: 'after',
          maidr: { type: TraceType.SURVIVAL },
        },
        {
          label: 'Genes',
          type: 'scatter',
          data: [{ x: -2.4, y: 8.1, gene: 'TP53' }],
          maidr: { type: TraceType.VOLCANO },
        },
      ], 'line', { scales: { x: { type: 'linear' } } });

      expect(layersOf(chart)[0].type).toBe(TraceType.SURVIVAL);
      expect(warnings).toContainEqual(
        expect.stringContaining('"survival" and "volcano"'),
      );
    });

    it('stays silent where several datasets declare the same type', () => {
      const arm = (label: string): ChartJsDataset => ({
        label,
        data: [{ x: 0, y: 1 }],
        stepped: 'after',
        maidr: { type: TraceType.SURVIVAL },
      });
      const chart = chartOf(
        [arm('Treatment'), arm('Control')],
        'line',
        { scales: { x: { type: 'linear' } } },
      );

      expect(layersOf(chart)[0].type).toBe(TraceType.SURVIVAL);
      expect(warnings).not.toContainEqual(
        expect.stringContaining('whole-chart reading'),
      );
    });
  });
});
