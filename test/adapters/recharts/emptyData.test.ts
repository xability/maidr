import type { RechartsAdapterConfig, RechartsChartType } from '@adapters/recharts/types';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { describe, expect, it } from '@jest/globals';

/**
 * `MaidrRecharts` converts inside `useMemo`, i.e. during render, so a builder
 * that throws on data which is merely empty unwinds the consumer's tree to its
 * nearest error boundary — a blank page for an app without one. The ordinary
 * React fetch pattern renders once with `[]` before the rows arrive, and a
 * filter that matches nothing goes back to it, so the accessibility wrapper
 * would destroy the chart it was added to make readable.
 *
 * `chartType: 'bar'` with no rows already survives this. These four did not.
 */

/** One config per chart type whose builder refuses data it finds no fields in. */
const CONFIGS: Record<string, RechartsAdapterConfig> = {
  gauge: {
    id: 'g',
    data: [],
    chartType: 'gauge',
    xKey: 'k',
    yKeys: ['v'],
    gaugeConfig: { min: 0, max: 100 },
  },
  ridgeline: {
    id: 'r',
    data: [],
    chartType: 'ridgeline',
    xKey: 'temp',
    ridgelineConfig: { groupKey: 'month', valueKey: 'temp', densityKey: 'density' },
  },
  hexbin: {
    id: 'h',
    data: [],
    chartType: 'hexbin',
    xKey: 'cx',
    yKeys: ['cy'],
    hexbinConfig: { countKey: 'count' },
  },
  boxen: {
    id: 'b',
    data: [],
    chartType: 'boxen',
    xKey: 'group',
    boxenConfig: { medianKey: 'median', levelsKey: 'levels' },
  },
};

describe('a recharts chart whose rows have not arrived yet', () => {
  it.each(Object.keys(CONFIGS))('does not throw out of a %s conversion', (chartType) => {
    expect(() => convertRechartsToMaidr(CONFIGS[chartType])).not.toThrow();
  });

  it.each(Object.keys(CONFIGS))('emits no %s layer, which is the core\'s "not ready"', (chartType) => {
    const maidr = convertRechartsToMaidr(CONFIGS[chartType]);

    expect(maidr.subplots[0][0].layers).toEqual([]);
  });

  it('still refuses rows whose declared fields it cannot find', () => {
    // The diagnostic is about a config that does not match the data, and it
    // stays: rows arrived, and none of them carried a centre and a count.
    const config: RechartsAdapterConfig = {
      ...CONFIGS.hexbin,
      data: [{ somethingElse: 1 }],
    };

    expect(() => convertRechartsToMaidr(config)).toThrow('RechartsAdapter');
  });

  it('builds the layer once the rows land', () => {
    const config: RechartsAdapterConfig = {
      ...CONFIGS.gauge,
      data: [{ k: 'Load', v: 42 }],
    };

    const layers = convertRechartsToMaidr(config).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
  });
});

describe('a chart type that never refused empty rows', () => {
  it('keeps emitting its layer, so nothing else changes shape', () => {
    const config: RechartsAdapterConfig = {
      id: 'bars',
      data: [],
      chartType: 'bar' as RechartsChartType,
      xKey: 'name',
      yKeys: ['value'],
    };

    const layers = convertRechartsToMaidr(config).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].data).toEqual([]);
  });
});
