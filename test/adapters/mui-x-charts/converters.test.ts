/**
 * What the converter reads off an MUI X chart's props.
 *
 * The rendered-markup suite checks that the selectors find the marks; this
 * one checks the payload itself -- the values, the names and the layer types
 * -- for the prop shapes a consumer can write: inline `data`, a `dataset`
 * with `dataKey`s, label callbacks, axis formatters, stacks and angles.
 */

import type { MuiChartProps } from '@adapters/mui-x-charts/types';
import type { LinePoint, SegmentedPoint } from '@type/grammar';
import { convertMuiChart, convertMuiChartsToMaidr, findMuiChartElement, muiSeriesId } from '@adapters/mui-x-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { createElement, forwardRef } from 'react';

const SCOPE = '#c ';

describe('findMuiChartElement', () => {
  it('finds the chart through wrapper elements and reads its kind off the forwardRef render name', () => {
    // eslint-disable-next-line prefer-arrow-callback
    const LineChart = forwardRef(function LineChart() {
      return null;
    });
    const tree = createElement('div', null, createElement('section', null, createElement(LineChart, { series: [{ data: [1] }] } as object)));

    const found = findMuiChartElement(tree);
    expect(found?.kind).toBe('line');
    expect(found?.props.series).toEqual([{ data: [1] }]);
  });

  it('recognises the Pro variants by name', () => {
    function BarChartPro(): null {
      return null;
    }
    expect(findMuiChartElement(createElement(BarChartPro, { series: [] } as object))?.kind).toBe('bar');
  });

  it('leaves the kind open when a minifier renamed the component', () => {
    function e(): null {
      return null;
    }
    const found = findMuiChartElement(createElement(e, { series: [] } as object));
    expect(found).toBeDefined();
    expect(found?.kind).toBeUndefined();
  });

  it('returns nothing when no element was given a series array', () => {
    expect(findMuiChartElement(createElement('div', null, 'text'))).toBeUndefined();
  });
});

describe('muiSeriesId', () => {
  it('mirrors the id MUI stamps on the marks', () => {
    expect(muiSeriesId({ id: 'rev' }, 3)).toBe('rev');
    expect(muiSeriesId({ id: 7 }, 3)).toBe('7');
    expect(muiSeriesId({}, 3)).toBe('auto-generated-id-3');
  });
});

describe('bar charts', () => {
  it('reads values and categories from a dataset', () => {
    const props: MuiChartProps = {
      dataset: [{ month: 'Jan', rain: 5 }, { month: 'Feb', rain: 8 }],
      xAxis: [{ dataKey: 'month', label: 'Month' }],
      yAxis: [{ label: 'Rain (mm)' }],
      series: [{ dataKey: 'rain', label: 'Rain' }],
    };

    const [layer] = convertMuiChart('bar', props, SCOPE).layers;
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.data).toEqual([{ x: 'Jan', y: 5 }, { x: 'Feb', y: 8 }]);
    expect(layer.axes).toEqual({ x: { label: 'Month' }, y: { label: 'Rain (mm)' } });
    expect(layer.selectors).toBe('#c g[data-series="auto-generated-id-0"] rect');
  });

  it('leaves an undrawn null bar out of a single series rather than announcing a zero', () => {
    const [layer] = convertMuiChart('bar', {
      xAxis: [{ data: ['A', 'B', 'C'] }],
      series: [{ data: [1, null, 3] }],
    }, SCOPE).layers;

    expect(layer.data).toEqual([{ x: 'A', y: 1 }, { x: 'C', y: 3 }]);
  });

  it('names each series of a grid with its label and lists them in the legend', () => {
    const converted = convertMuiChart('bar', {
      xAxis: [{ data: ['A', 'B'] }],
      series: [{ data: [1, 2], label: 'North' }, { data: [3, 4], label: () => 'South' }],
    }, SCOPE);

    expect(converted.layers[0].type).toBe(TraceType.DODGED);
    const data = converted.layers[0].data as SegmentedPoint[][];
    expect(data.map(row => row[0].z)).toEqual(['North', 'South']);
    expect(converted.legend).toEqual(['North', 'South']);
  });

  it('types a stack by its offset', () => {
    const stacked = convertMuiChart('bar', {
      xAxis: [{ data: ['A'] }],
      series: [{ data: [1], stack: 's' }, { data: [2], stack: 's' }],
    }, SCOPE);
    const expanded = convertMuiChart('bar', {
      xAxis: [{ data: ['A'] }],
      series: [{ data: [1], stack: 's', stackOffset: 'expand' }, { data: [2], stack: 's' }],
    }, SCOPE);

    expect(stacked.layers[0].type).toBe(TraceType.STACKED);
    expect(expanded.layers[0].type).toBe(TraceType.NORMALIZED);
  });

  it('gives each stack group of a grouped-stacked chart its own titled layer', () => {
    const { layers } = convertMuiChart('bar', {
      xAxis: [{ data: ['A'] }],
      series: [
        { data: [1], stack: 'x', label: 'a' },
        { data: [2], label: 'b' },
        { data: [3], stack: 'x', label: 'c' },
      ],
    }, SCOPE);

    expect(layers.map(layer => [layer.type, layer.title])).toEqual([
      [TraceType.STACKED, 'a, c'],
      [TraceType.BAR, 'b'],
    ]);
  });

  it('announces a category through the axis valueFormatter', () => {
    const [layer] = convertMuiChart('bar', {
      xAxis: [{ data: [2020, 2021], valueFormatter: (v: never) => `FY${v}` }],
      series: [{ data: [1, 2] }],
    }, SCOPE).layers;

    expect(layer.data).toEqual([{ x: 'FY2020', y: 1 }, { x: 'FY2021', y: 2 }]);
  });
});

describe('line charts', () => {
  it('keeps a gap in a plain line as null', () => {
    const [layer] = convertMuiChart('line', {
      xAxis: [{ data: [1, 2, 3] }],
      series: [{ data: [4, null, 6], label: 'A' }],
    }, SCOPE).layers;

    expect(layer.type).toBe(TraceType.LINE);
    expect(layer.data).toEqual([[
      { x: 1, y: 4, z: 'A' },
      { x: 2, y: null, z: 'A' },
      { x: 3, y: 6, z: 'A' },
    ]]);
    expect(layer.selectors).toEqual(['#c path.MuiLineChart-line[data-series="auto-generated-id-0"]']);
  });

  it('announces dates in ISO form', () => {
    const [layer] = convertMuiChart('line', {
      xAxis: [{ data: [new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2024, 0, 1, 12))] }],
      series: [{ data: [1, 2] }],
    }, SCOPE).layers;

    expect((layer.data as LinePoint[][])[0].map(p => p.x)).toEqual(['2024-01-01', '2024-01-01T12:00:00.000Z']);
  });

  it('splits plain lines, areas and each stack into their own layers', () => {
    const { layers } = convertMuiChart('line', {
      xAxis: [{ data: [1] }],
      series: [
        { data: [1], label: 'plain' },
        { data: [2], area: true, label: 'filled' },
        { data: [3], stack: 's', area: true, label: 'low' },
        { data: [null], stack: 's', area: true, label: 'high' },
      ],
    }, SCOPE);

    expect(layers.map(layer => layer.type)).toEqual([TraceType.LINE, TraceType.AREA, TraceType.STACKED_AREA]);
    // A missing value adds nothing to a stack.
    expect((layers[2].data as LinePoint[][])[1][0].y).toBe(0);
  });

  it('types an expanded stack as normalized', () => {
    const [layer] = convertMuiChart('line', {
      xAxis: [{ data: [1] }],
      series: [{ data: [1], stack: 's', stackOffset: 'expand' }, { data: [2], stack: 's' }],
    }, SCOPE).layers;

    expect(layer.type).toBe(TraceType.NORMALIZED_AREA);
  });
});

describe('scatter charts', () => {
  it('reads points from a dataset through datasetKeys, dropping incomplete ones', () => {
    const [layer] = convertMuiChart('scatter', {
      dataset: [{ h: 170, w: 65 }, { h: 180, w: null }, { h: 160, w: 55 }],
      xAxis: [{ label: 'Height' }],
      yAxis: [{ label: 'Weight' }],
      series: [{ datasetKeys: { x: 'h', y: 'w' } }],
    }, SCOPE).layers;

    expect(layer.data).toEqual([{ x: 170, y: 65 }, { x: 160, y: 55 }]);
    expect(layer.axes).toEqual({ x: { label: 'Height' }, y: { label: 'Weight' } });
  });
});

describe('pie charts', () => {
  it('declares where a rotated pie starts and which way it runs', () => {
    const [layer] = convertMuiChart('pie', {
      series: [{ startAngle: -90, endAngle: 90, data: [{ id: 'a', value: 1 }] }],
    }, SCOPE).layers;

    expect(layer.startAngle).toBe(270);
    expect(layer.direction).toBeUndefined();
    // No label: the slice is named by its id.
    expect(layer.data).toEqual([{ x: 'a', y: 1 }]);
  });

  it('declares a pie drawn counterclockwise', () => {
    const [layer] = convertMuiChart('pie', {
      series: [{ startAngle: 360, endAngle: 0, data: [{ value: 1, label: 'x' }] }],
    }, SCOPE).layers;

    expect(layer.direction).toBe('counterclockwise');
  });

  it('reads a nested pie ring by ring', () => {
    const { layers } = convertMuiChart('pie', {
      series: [
        { label: 'Inner', data: [{ value: 1, label: 'a' }] },
        { label: 'Outer', data: [{ value: 2, label: 'b' }] },
      ],
    }, SCOPE);

    expect(layers.map(layer => layer.title)).toEqual(['Inner', 'Outer']);
  });
});

describe('convertMuiChartsToMaidr', () => {
  it('keeps the metadata and emits an empty subplot when the kind is unknown', () => {
    expect(convertMuiChartsToMaidr({ id: 'x', title: 'T' }, undefined, { series: [] }, SCOPE)).toEqual({
      id: 'x',
      title: 'T',
      subtitle: undefined,
      caption: undefined,
      subplots: [[{ layers: [] }]],
    });
  });
});
