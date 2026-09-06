/**
 * @jest-environment jsdom
 */

import type { RechartsAdapterConfig, RechartsChartType } from '@adapters/recharts/types';
import type { BarPoint, HistogramPoint, MaidrLayer } from '@type/grammar';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * A composed layer is one series of the chart around it, so its payload is a
 * flat `BarPoint[]` whatever bar family the author named. Declaring a trace
 * type that reads a grid over that payload does not fail in conversion — it
 * fails in `TraceFactory.create`, inside the focus-in callback, where nothing
 * catches it and the figure never activates for a keyboard user.
 */

const quarters = [
  { quarter: 'Q1', north: 10, south: 4 },
  { quarter: 'Q2', north: 20, south: 6 },
];

/** The composed chart's first layer, for one declared chart type. */
function firstLayer(chartType: RechartsChartType): MaidrLayer {
  const config: RechartsAdapterConfig = {
    id: 'composed',
    data: quarters,
    xKey: 'quarter',
    layers: [
      { yKey: 'north', chartType, name: 'North' },
      { yKey: 'south', chartType: 'line', name: 'South' },
    ],
  };

  return convertRechartsToMaidr(config).subplots[0][0].layers[0];
}

describe('a composed layer naming a bar family that reads a grid', () => {
  const SEGMENTED: RechartsChartType[] = [
    'stacked_bar',
    'dodged_bar',
    'normalized_bar',
    'diverging_bar',
  ];

  it.each(SEGMENTED)('reads a single %s series as a plain bar', (chartType) => {
    const layer = firstLayer(chartType);

    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Q1', y: 10 },
      { x: 'Q2', y: 20 },
    ]);
  });

  it.each(SEGMENTED)('builds a trace the core can activate from a %s layer', (chartType) => {
    const layer = firstLayer(chartType);

    const state = TraceFactory.create(layer).getStateAt(0, 1);

    expect(state.empty).toBe(false);
    if (state.empty) {
      return;
    }
    expect(state.text.cross).toEqual({ label: 'Y', value: 20 });
  });
});

describe('a composed histogram layer', () => {
  it('carries the bin edges its trace type promises', () => {
    const config: RechartsAdapterConfig = {
      id: 'composed-hist',
      data: [
        { bin: '0-10', count: 5, from: 0, to: 10 },
        { bin: '10-20', count: 9, from: 10, to: 20 },
      ],
      xKey: 'bin',
      layers: [
        { yKey: 'count', chartType: 'histogram', name: 'Counts' },
        { yKey: 'count', chartType: 'line', name: 'Trend' },
      ],
      binConfig: { xMinKey: 'from', xMaxKey: 'to' },
    };

    const layer = convertRechartsToMaidr(config).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.HISTOGRAM);
    expect(layer.data as HistogramPoint[]).toEqual([
      { x: '0-10', y: 5, xMin: 0, xMax: 10, yMin: 0, yMax: 5 },
      { x: '10-20', y: 9, xMin: 10, xMax: 20, yMin: 0, yMax: 9 },
    ]);
  });

  it('announces the bin it is on rather than an undefined range', () => {
    const config: RechartsAdapterConfig = {
      id: 'composed-hist',
      data: [
        { bin: '0-10', count: 5, from: 0, to: 10 },
        { bin: '10-20', count: 9, from: 10, to: 20 },
      ],
      xKey: 'bin',
      layers: [{ yKey: 'count', chartType: 'histogram', name: 'Counts' }],
      binConfig: { xMinKey: 'from', xMaxKey: 'to' },
    };
    const layer = convertRechartsToMaidr(config).subplots[0][0].layers[0];

    const state = TraceFactory.create(layer).getStateAt(0, 1);

    expect(state.empty).toBe(false);
    if (state.empty) {
      return;
    }
    expect(state.text.range).toEqual({ min: 10, max: 20 });
  });
});
