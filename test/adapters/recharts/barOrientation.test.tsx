/**
 * @jest-environment jsdom
 *
 * A horizontal Recharts bar layer had nothing to pitch (#958).
 *
 * `layerOrientation` passed a config-supplied `orientation` onto the layer for
 * every bar type, while `convertToBarPoints` and the segmented builder took no
 * orientation at all and always wrote `x = data[xKey]`. A `horz` bar layer is
 * read the other way round — `BarTrace` takes its magnitude from `x` — so the
 * key and the payload contradicted each other, `toBarValue('0-9')` answered
 * `NaN`, and `NaN` is how a deliberate gap travels. Nothing raised: the chart
 * loaded, navigated and highlighted, and every bar was silent.
 *
 * The config in the first case is copied verbatim out of the docblock in
 * `src/adapters/recharts/types.ts`, so the adapter's own documented recipe is
 * what this pins.
 *
 * jsdom because a Recharts layer carries selectors, and `TraceFactory` resolves
 * them against a document.
 */
import type { RechartsAdapterConfig } from '@adapters/recharts/types';
import type { BarPoint, MaidrLayer, SegmentedPoint } from '@type/grammar';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation } from '@type/grammar';

// The layer under test warns on purpose when it is wrong, so the spy is
// installed once and cleared per test rather than re-installed.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

/** The documented population-pyramid recipe, from `types.ts`. */
const PYRAMID: RechartsAdapterConfig = {
  id: 'pyramid-chart',
  title: 'Population by Age Band',
  data: [{ band: '0-9', men: -2_100_000, women: 2_000_000 }],
  chartType: 'diverging_bar',
  xKey: 'band',
  yKeys: ['men', 'women'],
  fillKeys: ['Men', 'Women'],
  orientation: Orientation.HORIZONTAL,
  xLabel: 'Age band',
  yLabel: 'People',
};

/** A plain bar chart, the same way round. */
const HORIZONTAL_BAR: RechartsAdapterConfig = {
  id: 'bar-chart',
  title: 'Sales',
  data: [{ fruit: 'Apples', sales: 30 }, { fruit: 'Bananas', sales: 70 }],
  chartType: 'bar',
  xKey: 'fruit',
  yKeys: ['sales'],
  orientation: Orientation.HORIZONTAL,
  xLabel: 'Fruit',
  yLabel: 'Sales',
};

/**
 * The single layer a config converts to.
 * @param config - The adapter config
 * @returns The emitted layer
 */
function layerFor(config: RechartsAdapterConfig): MaidrLayer {
  return convertRechartsToMaidr(config).subplots[0][0].layers[0];
}

/**
 * What the core makes of a layer at its first bar.
 * @param layer - The emitted layer
 * @returns The magnitude it would pitch, and anything it warned about
 */
function readFirstBar(layer: MaidrLayer): { magnitude: unknown; warnings: string[] } {
  const trace = TraceFactory.create(layer);
  const state = (trace as unknown as { state: { audio: { freq: { raw: unknown } } } }).state;
  return {
    magnitude: state.audio.freq.raw,
    warnings: warnSpy.mock.calls.map(call => String(call[0])),
  };
}

describe('the documented population pyramid', () => {
  it('has a magnitude to pitch at its first bar', () => {
    // This answered `null` before the fix — the whole pyramid silent, from
    // the config the adapter's own documentation tells authors to write.
    // 2_100_000 rather than -2_100_000 because `DivergingTrace` pitches the
    // absolute size and announces the sign as the side.
    const { magnitude, warnings } = readFirstBar(layerFor(PYRAMID));

    expect(magnitude).toBe(2_100_000);
    expect(warnings).toEqual([]);
  });

  it('puts the counts in x and the age bands in y', () => {
    const data = layerFor(PYRAMID).data as SegmentedPoint[][];

    expect(data[0][0]).toEqual({ x: -2_100_000, y: '0-9', z: 'Men' });
    expect(data[1][0]).toEqual({ x: 2_000_000, y: '0-9', z: 'Women' });
  });

  it('moves the axis labels with them and keeps the series axis', () => {
    // `BarTrace.text` announces each value under the label of the axis it sits
    // on, so an age band left under 'People' is announced as a population.
    expect(layerFor(PYRAMID).axes).toEqual({
      x: { label: 'People' },
      y: { label: 'Age band' },
      z: { label: 'Series' },
    });
  });
});

describe('a plain horizontal bar layer', () => {
  it('has a magnitude to pitch at its first bar', () => {
    const { magnitude, warnings } = readFirstBar(layerFor(HORIZONTAL_BAR));

    expect(magnitude).toBe(30);
    expect(warnings).toEqual([]);
  });

  it('puts the value in x and the category in y', () => {
    expect(layerFor(HORIZONTAL_BAR).data).toEqual([
      { x: 30, y: 'Apples' },
      { x: 70, y: 'Bananas' },
    ]);
  });

  it('moves its axis labels too', () => {
    expect(layerFor(HORIZONTAL_BAR).axes).toEqual({
      x: { label: 'Sales' },
      y: { label: 'Fruit' },
    });
  });
});

describe('a vertical bar layer is untouched', () => {
  const vertical: RechartsAdapterConfig = { ...HORIZONTAL_BAR, orientation: undefined };

  it('reads as it always did', () => {
    const layer = layerFor(vertical);
    const { magnitude, warnings } = readFirstBar(layer);

    expect(layer.orientation).toBe(Orientation.VERTICAL);
    expect(magnitude).toBe(30);
    expect(warnings).toEqual([]);
  });

  it('keeps its category on x and its labels where they were', () => {
    const layer = layerFor(vertical);

    expect(layer.data).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 70 },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Fruit' }, y: { label: 'Sales' } });
  });
});

describe('a horizontal histogram', () => {
  it('carries its bin edges across with the pair', () => {
    // A bin's span travels as `xMin`/`xMax`. Swapping only `x` and `y` leaves
    // each bin announcing a value from one axis and a width from the other,
    // which reads as a plausible bar and is not one.
    const layer = layerFor({
      id: 'hist',
      title: 'Response times',
      data: [{ bin: '0-5', count: 12, xMin: 0, xMax: 5 }],
      chartType: 'histogram',
      xKey: 'bin',
      yKeys: ['count'],
      binConfig: { xMinKey: 'xMin', xMaxKey: 'xMax' },
      orientation: Orientation.HORIZONTAL,
      xLabel: 'Bin',
      yLabel: 'Count',
    } as RechartsAdapterConfig);

    expect(layer.data).toEqual([
      { x: 12, y: '0-5', xMin: 0, xMax: 12, yMin: 0, yMax: 5 },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Count' }, y: { label: 'Bin' } });
  });
});

describe('types that carry orientation without swapping', () => {
  it('leaves a horizontal gantt alone', () => {
    // `GanttTrace` reads `orientation` as which way navigation and panning
    // run. Its points carry `start`/`end` rather than a magnitude in `y`, so
    // there is nothing to exchange and a swap would corrupt the schedule.
    const layer = layerFor({
      id: 'schedule',
      title: 'Release plan',
      data: [{ task: 'Design', from: 0, to: 3 }],
      chartType: 'gantt',
      xKey: 'task',
      yKeys: ['from', 'to'],
      ganttConfig: { startKey: 'from', endKey: 'to' },
      xLabel: 'Task',
      yLabel: 'Day',
    } as RechartsAdapterConfig);

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.axes).toEqual({ x: { label: 'Task' }, y: { label: 'Day' } });
  });

  it('leaves a line layer alone even when the config says horizontal', () => {
    // `LineTrace` never resolves the key, so declaring it must change nothing.
    const layer = layerFor({
      ...HORIZONTAL_BAR,
      chartType: 'line',
    });

    const [series] = layer.data as BarPoint[][];
    expect(series[0]).toEqual({ x: 'Apples', y: 30 });
    expect(layer.axes).toEqual({ x: { label: 'Fruit' }, y: { label: 'Sales' } });
  });
});
