/**
 * A reversed Chart.js line is read in the order it is drawn (#1029).
 *
 * `extractLineLayers` walked `dataset.data.forEach` and never consulted the
 * axis, so a chart drawn from the far end was announced as its own mirror
 * image: every value right, the shape backwards, and with it the stereo pan,
 * the braille line and the direction autoplay sweeps.
 *
 * Measured in Chromium through the real path, `labels: ['alpha','bravo',
 * 'charlie']` with `scales.x.reverse`:
 *
 *   drawn L→R : charlie, bravo, alpha
 *   payload   : alpha, bravo, charlie     <- before
 *   payload   : charlie, bravo, alpha     <- after
 *
 * Both halves move together. Chart.js paints to canvas and emits no
 * `selectors`, so the highlight is the index table `computeTargetMaps`
 * builds -- reversing the payload alone would trade a correct outline for a
 * wrong one, which is the regression #1024 exists to record. Every case here
 * therefore asks both questions: what order is announced, and does the
 * element the plugin would outline hold the datum just announced.
 */
import type { ChartJsChart, ChartJsData, ChartJsOptions, MaidrPluginOptions } from '@adapters/chartjs/types';
import type { LinePoint, SurvivalPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

const LISTED = ['alpha', 'bravo', 'charlie'];
/** Values keyed to position, so an element index names its own datum. */
const VALUES = [10, 20, 30];

/** The reversed-axis options most cases here are drawn with. */
const REVERSED: ChartJsOptions = { scales: { x: { reverse: true } } } as ChartJsOptions;

/**
 * A drawn chart, as Chart.js leaves it.
 * @param type - The Chart.js chart type
 * @param data - Its data
 * @param options - Its resolved options
 * @returns The chart
 */
function createChart(type: string, data: ChartJsData, options?: ChartJsOptions): ChartJsChart {
  return {
    canvas: { id: 'reversed-line' } as unknown as HTMLCanvasElement,
    data,
    options: options ?? {},
    config: { type },
    getDatasetMeta: () => ({ data: [], type }),
    setActiveElements: () => {},
    update: () => {},
  } as unknown as ChartJsChart;
}

/**
 * Everything the plugin's navigation bridge uses, for one chart.
 * @param chart - The chart to read
 * @param pluginOptions - The chart's declaration, when it carries one
 * @returns The first layer and a resolver for its highlight targets
 */
function setup(chart: ChartJsChart, pluginOptions?: MaidrPluginOptions): {
  layer: { id: string; type: string; data: unknown };
  targetOf: (row: number, col: number) => number | undefined;
} {
  const { maidr, layerDatasetIndices } = extractChartData(chart, pluginOptions);
  const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
  const maps = computeTargetMaps(chart, layers, layerDatasetIndices);
  const layer = layers[0];
  return {
    layer: layer as unknown as { id: string; type: string; data: unknown },
    targetOf: (row, col) =>
      resolveActiveTargets(layers, maps, layerDatasetIndices, layer.id, row, col)[0]?.index,
  };
}

/**
 * Assert every column of one series outlines the datum it announces.
 *
 * @param points - The series as the layer emitted it
 * @param targetOf - The resolver for this layer
 * @param row - Which series
 */
function expectAligned(
  points: LinePoint[],
  targetOf: (row: number, col: number) => number | undefined,
  row = 0,
): void {
  points.forEach((point, col) => {
    expect(VALUES[targetOf(row, col) as number]).toBe(point.y);
  });
}

describe('a reversed line chart', () => {
  it('reads its points in the order they are drawn', () => {
    const { layer } = setup(createChart('line', {
      labels: LISTED,
      datasets: [{ label: 's', data: VALUES }],
    }, REVERSED));

    expect(layer.type).toBe(TraceType.LINE);
    expect((layer.data as LinePoint[][])[0].map(p => p.x))
      .toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('outlines the point it is announcing', () => {
    const { layer, targetOf } = setup(createChart('line', {
      labels: LISTED,
      datasets: [{ label: 's', data: VALUES }],
    }, REVERSED));

    expectAligned((layer.data as LinePoint[][])[0], targetOf);
  });

  it('leaves an ordinary chart alone', () => {
    const { layer, targetOf } = setup(createChart('line', {
      labels: LISTED,
      datasets: [{ label: 's', data: VALUES }],
    }));

    expect((layer.data as LinePoint[][])[0].map(p => p.x)).toEqual(LISTED);
    expectAligned((layer.data as LinePoint[][])[0], targetOf);
  });

  it('turns every series of a multi-line chart round together', () => {
    const { layer } = setup(createChart('line', {
      labels: LISTED,
      datasets: [
        { label: 'a', data: VALUES },
        { label: 'b', data: VALUES },
      ],
    }, REVERSED));

    for (const series of layer.data as LinePoint[][]) {
      expect(series.map(p => p.x)).toEqual(['charlie', 'bravo', 'alpha']);
    }
  });

  it('stays aligned across a gap', () => {
    // A `null` is skipped in the payload but still occupies a Chart.js
    // element, so the two lists are different lengths and the mapping is the
    // only thing keeping them together.
    const { layer, targetOf } = setup(createChart('line', {
      labels: LISTED,
      datasets: [{ label: 's', data: [10, null, 30] }],
    }, REVERSED));
    const series = (layer.data as LinePoint[][])[0];

    expect(series.map(p => p.x)).toEqual(['charlie', 'alpha']);
    expect(targetOf(0, 0)).toBe(2);
    expect(targetOf(0, 1)).toBe(0);
  });
});

describe('the rest of the line family', () => {
  it('turns a filled band round with its line', () => {
    const { layer, targetOf } = setup(createChart('line', {
      labels: LISTED,
      datasets: [{ label: 's', data: VALUES, fill: true }],
    }, REVERSED));

    expect(layer.type).toBe(TraceType.AREA);
    expect((layer.data as LinePoint[][])[0].map(p => p.x))
      .toEqual(['charlie', 'bravo', 'alpha']);
    expectAligned((layer.data as LinePoint[][])[0], targetOf);
  });

  it('turns a staircase round too', () => {
    const { layer, targetOf } = setup(createChart('line', {
      labels: LISTED,
      datasets: [{ label: 's', data: VALUES, stepped: 'after' }],
    }, REVERSED));

    expect(layer.type).toBe(TraceType.STEP);
    expect((layer.data as LinePoint[][])[0].map(p => p.x))
      .toEqual(['charlie', 'bravo', 'alpha']);
    expectAligned((layer.data as LinePoint[][])[0], targetOf);
  });
});

describe('the readings with a walk of their own', () => {
  it('leaves a survival curve in the order its own extractor emits', () => {
    // `extractSurvivalLayer` walks the datasets itself, so turning the map
    // round here would desync it from a payload nothing had turned round.
    const { layer, targetOf } = setup(
      createChart('line', {
        labels: LISTED,
        datasets: [{ label: 'arm', data: [30, 20, 10], stepped: 'after' }],
      }, REVERSED),
      { traceType: TraceType.SURVIVAL },
    );

    expect(layer.type).toBe(TraceType.SURVIVAL);
    const curve = (layer.data as SurvivalPoint[][])[0];
    expect(curve.map(p => p.x)).toEqual(LISTED);
    curve.forEach((point, col) => {
      expect([30, 20, 10][targetOf(0, col) as number]).toBe(point.y);
    });
  });

  it('leaves a radar alone, which has no category axis to reverse', () => {
    const { layer, targetOf } = setup(createChart('radar', {
      labels: LISTED,
      datasets: [{ label: 's', data: VALUES }],
    }, REVERSED));

    expect(layer.type).toBe(TraceType.RADAR);
    expect((layer.data as LinePoint[][])[0].map(p => p.x)).toEqual(LISTED);
    expectAligned((layer.data as LinePoint[][])[0], targetOf);
  });
});
