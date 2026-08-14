import type { VolcanoPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

interface Gene {
  x: number;
  y: number;
  name?: string;
}

/**
 * The volcano Highcharts draws with an ordinary `scatter`: effect size against
 * significance, with the cutoffs as plot lines.
 */
function volcanoChart(clouds: Record<string, Gene[]>): ReturnType<typeof fakeChart> {
  const xAxis = fakeAxis({
    options: {
      title: { text: 'log2 fold change' },
      plotLines: [{ value: -1 }, { value: 1 }],
    },
  });
  const yAxis = fakeAxis({
    options: {
      title: { text: '-log10 p' },
      plotLines: [{ value: 1.3 }],
    },
  });

  return fakeChart({
    title: 'Differential expression',
    renderToId: 'volcano-chart',
    type: 'scatter',
    series: Object.entries(clouds).map(([name, genes], index) => fakeSeries({
      index,
      type: 'scatter',
      name,
      xAxis,
      yAxis,
      data: genes,
    })),
  });
}

const CLOUDS = {
  Up: [
    { x: 2.4, y: 5.1, name: 'BRCA1' },
    { x: 0.2, y: 0.4, name: 'ACTB' },
  ],
  Down: [{ x: -3.1, y: 6.7, name: 'TP53' }],
};

describe('highcharts significance plots', () => {
  it('reads declared scatter series as one volcano layer', () => {
    const chart = volcanoChart(CLOUDS);

    const layer = highchartsToMaidr(chart, {
      significancePlot: { type: 'volcano' },
    }).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.VOLCANO);
    // One cloud, not one layer per series: the threshold spans all of them.
    expect(layer.data as VolcanoPoint[]).toEqual([
      { x: 2.4, y: 5.1, label: 'BRCA1', group: 'Up' },
      { x: 0.2, y: 0.4, label: 'ACTB', group: 'Up' },
      { x: -3.1, y: 6.7, label: 'TP53', group: 'Down' },
    ]);
    expect(layer.axes).toEqual({
      x: { label: 'log2 fold change' },
      y: { label: '-log10 p' },
    });
  });

  it('is one layer spanning every declared series', () => {
    const maidr = highchartsToMaidr(volcanoChart(CLOUDS), {
      significancePlot: { type: 'volcano' },
    });

    expect(maidr.subplots[0][0].layers).toHaveLength(1);
    expect(maidr.subplots[0][0].layers[0].selectors).toBe(
      '#volcano-chart .highcharts-series-group .highcharts-series-0 '
      + '.highcharts-point:not([visibility="hidden"]), '
      + '#volcano-chart .highcharts-series-group .highcharts-series-1 '
      + '.highcharts-point:not([visibility="hidden"])',
    );
  });

  it('reads the cutoffs off the lines the chart already draws', () => {
    const layer = highchartsToMaidr(volcanoChart(CLOUDS), {
      significancePlot: { type: 'volcano' },
    }).subplots[0][0].layers[0];

    // The effect pair is symmetric about zero, so its magnitude is the cutoff.
    expect(layer.thresholdOptions).toEqual({ significance: 1.3, effect: 1 });
  });

  it('lets the caller state the cutoffs outright', () => {
    const layer = highchartsToMaidr(volcanoChart(CLOUDS), {
      significancePlot: {
        type: 'volcano',
        significance: 0.05,
        significanceDirection: 'below',
        effect: 2,
      },
    }).subplots[0][0].layers[0];

    // A raw p axis runs the other way, and must say so: fixed to `above`, the
    // reading would announce exactly the genes that missed significance.
    expect(layer.thresholdOptions).toEqual({
      significance: 0.05,
      significanceDirection: 'below',
      effect: 2,
    });
  });

  it('declares no direction when the caller stated none', () => {
    const layer = highchartsToMaidr(volcanoChart(CLOUDS), {
      significancePlot: { type: 'volcano' },
    }).subplots[0][0].layers[0];

    expect(layer.thresholdOptions).not.toHaveProperty('significanceDirection');
  });

  it('omits the thresholds entirely when nothing declares one', () => {
    const chart = volcanoChart(CLOUDS);
    for (const axis of [...chart.xAxis, ...chart.yAxis]) {
      axis.options.plotLines = undefined;
    }

    const layer = highchartsToMaidr(chart, {
      significancePlot: { type: 'volcano' },
    }).subplots[0][0].layers[0];

    // MAIDR then reads the cloud without making any claim about significance.
    expect(layer.thresholdOptions).toBeUndefined();
  });

  it('merges a Manhattan plot\'s per-chromosome series into one cloud', () => {
    const chart = volcanoChart({
      chr1: [{ x: 1, y: 4.2, name: 'rs1' }, { x: 2, y: 8.9, name: 'rs2' }],
      chr2: [{ x: 3, y: 3.1, name: 'rs3' }],
      chr3: [{ x: 4, y: 9.4, name: 'rs4' }],
    });

    const layers = highchartsToMaidr(chart, {
      significancePlot: { type: 'manhattan', significance: 7.3 },
    }).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.MANHATTAN);
    // The chromosome is the group, and is the second question every one of
    // these charts is read for.
    expect((layers[0].data as VolcanoPoint[]).map(p => p.group))
      .toEqual(['chr1', 'chr1', 'chr2', 'chr3']);
    // No single series names the whole cloud.
    expect(layers[0].title).toBeUndefined();
  });

  it('reads only the series the caller named', () => {
    const chart = volcanoChart({
      Genes: [{ x: 2.4, y: 5.1, name: 'BRCA1' }],
      Controls: [{ x: 0.1, y: 0.2, name: 'SPIKE' }],
    });

    const layers = highchartsToMaidr(chart, {
      significancePlot: { type: 'volcano', seriesIndices: [0] },
    }).subplots[0][0].layers;

    expect(layers.map(l => l.type)).toEqual([TraceType.SCATTER, TraceType.VOLCANO]);
    expect((layers[1].data as VolcanoPoint[]).map(p => p.label)).toEqual(['BRCA1']);
  });

  it('reads the scatters as scatters when nothing declares them', () => {
    const layers = highchartsToMaidr(volcanoChart(CLOUDS)).subplots[0][0].layers;

    // Nothing in the chart object distinguishes a volcano from a scatter of
    // two variables, so silence means scatter.
    expect(layers.map(l => l.type)).toEqual([TraceType.SCATTER, TraceType.SCATTER]);
  });

  it('drops a point Highcharts drew no marker for', () => {
    const chart = volcanoChart({ Up: [{ x: 2.4, y: 5.1, name: 'BRCA1' }] });
    chart.series[0].data.push({
      ...chart.series[0].data[0],
      x: 1.1,
      y: null,
      name: 'MISSING',
    });

    const layer = highchartsToMaidr(chart, {
      significancePlot: { type: 'volcano' },
    }).subplots[0][0].layers[0];

    // Keeping it would slide every later point's highlight onto its neighbour.
    expect((layer.data as VolcanoPoint[]).map(p => p.label)).toEqual(['BRCA1']);
  });
});
