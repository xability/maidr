/**
 * The Chart.js adapter refuses word clouds, though the trace exists (#1108).
 *
 * `TraceType.WORD_CLOUD` landed in #796 -- a word cloud being the canonical
 * chart that carries real data while being readable only by eye, its weights
 * encoded as glyph size and written down nowhere -- and AnyChart, amCharts and
 * d3 all read one. Only a Chart.js word cloud raised.
 *
 * Measured on `chartjs-chart-wordcloud@4` with `chart.js@4`. This plugin needs
 * a **real DOM**, unlike the treemap and sankey controllers: it measures text
 * to lay the words out, so the bare headless harness threw `document is not
 * defined` and the probe had to run under jsdom. What it showed is that the
 * reading is the ordinary Chart.js split, kept untouched through `update()`:
 *
 *     data.labels        ["accessible", "chart", "audio"]   (verbatim)
 *     dataset.data       [40, 25, 12]                       (verbatim)
 *     meta.data[i].text  === data.labels[i]
 *
 * So the drawn geometry is never read. Recovering a weight from the element's
 * `scale` would be inverting a rendering when the number is sitting in the
 * dataset -- the same reason the treemap's rectangles go unread.
 */
import type { ChartJsChart, ChartJsDataset } from '@adapters/chartjs/types';
import type { WordCloudPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/**
 * A word cloud chart as Chart.js leaves it after `update()`.
 *
 * @param labels - The terms
 * @param dataset - The dataset carrying their weights
 * @returns The chart
 */
function wordCloudChart(labels: unknown[], dataset: ChartJsDataset): ChartJsChart {
  return {
    canvas: {} as HTMLCanvasElement,
    data: { labels, datasets: [dataset] },
    options: { plugins: {} },
    config: { type: 'wordCloud' },
    getDatasetMeta: () => ({ data: [], type: 'wordCloud' }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/** The three terms the probe measured. */
function termsChart(): ChartJsChart {
  return wordCloudChart(
    ['accessible', 'chart', 'audio'],
    { label: 'Terms', data: [40, 25, 12] } as unknown as ChartJsDataset,
  );
}

/** The single word-cloud layer of a chart. */
function wordCloudLayer(chart: ChartJsChart): { data: WordCloudPoint[]; layer: any } {
  const layer = extractChartData(chart).maidr.subplots[0][0].layers[0];
  return { data: layer.data as WordCloudPoint[], layer };
}

describe('chart.js word cloud', () => {
  it('is read rather than refused', () => {
    const { layer } = wordCloudLayer(termsChart());

    expect(layer.type).toBe(TraceType.WORD_CLOUD);
    expect(layer.title).toBe('Terms');
  });

  it('pairs each term with the weight beside it', () => {
    const { data } = wordCloudLayer(termsChart());

    expect(data).toEqual([
      { x: 'accessible', y: 40 },
      { x: 'chart', y: 25 },
      { x: 'audio', y: 12 },
    ]);
  });

  it('keeps the declared order rather than sorting by weight', () => {
    // The layout reorders on screen -- the largest word is placed first -- but
    // the dataset is the reading, and a reader sweeping the terms gets the
    // order the author wrote. Pinned because "biggest first" is the tempting
    // wrong answer for a chart whose whole point is relative size.
    const chart = wordCloudChart(
      ['small', 'large', 'middling'],
      { label: 'Unsorted', data: [1, 99, 50] } as unknown as ChartJsDataset,
    );

    expect(wordCloudLayer(chart).data.map(p => p.x)).toEqual([
      'small',
      'large',
      'middling',
    ]);
  });

  it('drops a term with no weight rather than calling it zero', () => {
    // `y` is what a reader compares terms by. Inventing a zero makes a term
    // look like the least common one, rather than one the chart has no count
    // for -- the difference `toFiniteNumber` exists to keep.
    const chart = wordCloudChart(
      ['kept', 'gap', 'also kept'],
      { label: 'Gappy', data: [5, null, 3] } as unknown as ChartJsDataset,
    );

    expect(wordCloudLayer(chart).data).toEqual([
      { x: 'kept', y: 5 },
      { x: 'also kept', y: 3 },
    ]);
  });

  it('drops a weight with no term beside it', () => {
    // A dataset longer than its labels. Emitting the weight anyway would put
    // `undefined` where the term goes, and `WordCloudPoint.x` is what the
    // trace announces.
    const chart = wordCloudChart(
      ['only'],
      { label: 'Short labels', data: [5, 3] } as unknown as ChartJsDataset,
    );

    expect(wordCloudLayer(chart).data).toEqual([{ x: 'only', y: 5 }]);
  });

  it('emits no layer for a chart with nothing readable in it', () => {
    const chart = wordCloudChart(
      [],
      { label: 'Empty', data: [] } as unknown as ChartJsDataset,
    );

    expect(extractChartData(chart).maidr.subplots[0][0].layers).toEqual([]);
  });

  it('outlines the word the cursor is on', () => {
    // `WordCloudTrace` is one row of one column per term, and the points are
    // emitted in element order -- so `col` *is* the Chart.js element index and
    // the generic bar/line branch resolves it correctly. Asserted rather than
    // assumed, because it is a fallback rather than a branch written for this
    // trace: the sankey reading had to decline that same fallback because it
    // would have outlined the wrong element.
    const chart = termsChart();
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    const at = (col: number): number[] =>
      resolveActiveTargets(
        layers,
        maps,
        extraction.layerDatasetIndices,
        layers[0].id,
        0,
        col,
      ).map(t => t.index);

    expect(at(0)).toEqual([0]);
    expect(at(1)).toEqual([1]);
    expect(at(2)).toEqual([2]);
  });

  it('still refuses a type nothing reads', () => {
    const chart = termsChart();
    (chart as unknown as { config: { type: string } }).config.type = 'notAChartType';

    expect(() => extractChartData(chart)).toThrow(/unsupported chart type "notAChartType"/);
  });
});
