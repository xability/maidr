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
import type { ReactElement } from 'react';
import {
  convertMuiChart,
  convertMuiChartsToMaidr,
  findMuiChartElement,
  muiSeriesId,
  withMuiKeyboardNavigationDisabled,
} from '@adapters/mui-x-charts/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { createElement, forwardRef } from 'react';

// The adapter warns about charts it cannot read faithfully; keep those out of
// the test output, and let a test assert on them.
let warn: ReturnType<typeof jest.spyOn>;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

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

  it('numbers categories from 0 when the band axis has no data, as MUI does', () => {
    const [layer] = convertMuiChart('bar', { series: [{ data: [3, 5] }] }, SCOPE).layers;

    expect(layer.data).toEqual([{ x: 0, y: 3 }, { x: 1, y: 5 }]);
  });

  it('reads a dataKey cell as MUI does: a number, or nothing', () => {
    const [layer] = convertMuiChart('bar', {
      dataset: [{ q: 'Q1', v: '4' }, { q: 'Q2', v: 6 }],
      xAxis: [{ dataKey: 'q' }],
      series: [{ dataKey: 'v' }],
    }, SCOPE).layers;

    // MUI draws no bar for the string '4'.
    expect(layer.data).toEqual([{ x: 'Q2', y: 6 }]);
  });

  it('reads values through a valueGetter before a dataKey', () => {
    const [layer] = convertMuiChart('bar', {
      dataset: [{ q: 'Q1', v: 4 }, { q: 'Q2', v: 6 }],
      xAxis: [{ dataKey: 'q' }],
      series: [{ dataKey: 'nope', valueGetter: ((row: { v: number }) => row.v * 10) as never }],
    }, SCOPE).layers;

    expect(layer.data).toEqual([{ x: 'Q1', y: 40 }, { x: 'Q2', y: 60 }]);
  });

  it('keeps an explicit vertical layout over a series that says horizontal', () => {
    const [layer] = convertMuiChart('bar', {
      layout: 'vertical',
      xAxis: [{ data: ['A'] }],
      series: [{ data: [3], layout: 'horizontal' }],
    }, SCOPE).layers;

    expect(layer.orientation).toBeUndefined();
    expect(layer.data).toEqual([{ x: 'A', y: 3 }]);
  });

  it('announces an undrawn bar of a grid as a gap, not a zero', () => {
    const [layer] = convertMuiChart('bar', {
      xAxis: [{ data: ['A', 'B'] }],
      series: [{ data: [1, null] }, { data: [2, 3] }],
    }, SCOPE).layers;

    expect((layer.data as SegmentedPoint[][])[0][1].y).toBeNaN();
    expect((layer.selectors as (string | null)[][])[0][1]).toBeNull();
  });

  it('skips the bars MUI culls outside an explicit value-axis range', () => {
    const { layers } = convertMuiChart('bar', {
      xAxis: [{ data: ['A', 'B', 'C'] }],
      yAxis: [{ min: 10 }],
      series: [{ data: [5, 20, 30] }, { data: [15, 2, 40] }],
    }, SCOPE);

    const grid = layers[0].selectors as (string | null)[][];
    // Series 0: the 5 bar lies wholly below 10, so the 20 bar is its first rect.
    expect(grid[0][0]).toBeNull();
    expect(grid[0][1]).toContain(':nth-child(1)');
    expect(grid[1][1]).toBeNull();
    expect(grid[1][2]).toContain(':nth-child(2)');
  });

  it('keeps a stacked bar that the running total lifts into range', () => {
    const [layer] = convertMuiChart('bar', {
      xAxis: [{ data: ['A'] }],
      yAxis: [{ min: 10 }],
      series: [{ data: [8], stack: 's' }, { data: [5], stack: 's' }],
    }, SCOPE).layers;

    // 0-8 is culled; 8-13 reaches past 10 and is drawn.
    expect(layer.selectors).toEqual([[null], [expect.stringContaining(':nth-child(1)')]]);
  });

  it('warns that a batch renderer leaves nothing to outline', () => {
    convertMuiChart('bar', { renderer: 'svg-batch', xAxis: [{ data: ['A'] }], series: [{ data: [1] }] }, SCOPE);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('renderer="svg-batch"'));
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

  it('reads a step curve as a step layer in its direction', () => {
    const { layers } = convertMuiChart('line', {
      xAxis: [{ data: [1, 2] }],
      series: [
        { data: [1, 2], curve: 'stepAfter' },
        { data: [3, 4], curve: 'stepBefore' },
        { data: [5, 6] },
      ],
    }, SCOPE);

    expect(layers.map(layer => [layer.type, layer.stepDirection])).toEqual([
      [TraceType.STEP, 'hv'],
      [TraceType.STEP, 'vh'],
      [TraceType.LINE, undefined],
    ]);
  });

  it('reads a line through its own data before a valueGetter', () => {
    const [layer] = convertMuiChart('line', {
      dataset: [{ v: 1 }],
      xAxis: [{ data: [0] }],
      series: [{ data: [7], valueGetter: ((row: { v: number }) => row.v) as never }],
    }, SCOPE).layers;

    expect((layer.data as LinePoint[][])[0][0].y).toBe(7);
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
  it('reads nothing from a dataset without datasetKeys, as MUI draws nothing', () => {
    const [layer] = convertMuiChart('scatter', {
      dataset: [{ x: 1, y: 2 }],
      series: [{ label: 'A' }],
    }, SCOPE).layers;

    expect(layer.data).toEqual([]);
  });

  it('leaves out points MUI does not draw outside an explicit axis range', () => {
    const [layer] = convertMuiChart('scatter', {
      xAxis: [{ min: 0, max: 10 }],
      series: [{ data: [{ x: 5, y: 1 }, { x: 20, y: 2 }, { x: -1, y: 3 }] }],
    }, SCOPE).layers;

    expect(layer.data).toEqual([{ x: 5, y: 1 }]);
  });

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

  it('takes MUI\'s end angle default of 360, not a full turn from the start', () => {
    // Drawn from 400 back to 360: counterclockwise.
    const [layer] = convertMuiChart('pie', {
      series: [{ startAngle: 400, data: [{ value: 1, label: 'x' }] }],
    }, SCOPE).layers;

    expect(layer.direction).toBe('counterclockwise');
  });

  it('reads a sorted pie in the order its slices are drawn, without selectors', () => {
    const [layer] = convertMuiChart('pie', {
      series: [{
        sortingValues: 'desc',
        data: [{ value: 1, label: 'A' }, { value: 5, label: 'B' }, { value: 3, label: 'C' }],
      }],
    }, SCOPE).layers;

    expect(layer.data).toEqual([{ x: 'B', y: 5 }, { x: 'C', y: 3 }, { x: 'A', y: 1 }]);
    expect(layer.selectors).toBeUndefined();
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

describe('mixed series types', () => {
  it('leaves a composition chart unread rather than reading a line as bars', () => {
    const { layers } = convertMuiChart('bar', {
      xAxis: [{ data: ['A'] }],
      series: [{ type: 'bar', data: [1] }, { type: 'line', data: [2] }],
    }, SCOPE);

    expect(layers).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('mix types'));
  });

  it('reads a chart whose series all declare the chart\'s own type', () => {
    const { layers } = convertMuiChart('bar', {
      xAxis: [{ data: ['A'] }],
      series: [{ type: 'bar', data: [1] }],
    }, SCOPE);

    expect(layers).toHaveLength(1);
  });
});

describe('withMuiKeyboardNavigationDisabled', () => {
  function BarChart(): null {
    return null;
  }

  it('turns MUI\'s own keyboard navigation off on the chart, through wrappers', () => {
    const tree = createElement('div', null, createElement(BarChart, { series: [] } as object));
    const out = withMuiKeyboardNavigationDisabled(tree) as ReactElement<{ children: ReactElement<{ disableKeyboardNavigation?: boolean }>[] }>;

    const chart = ([] as ReactElement<{ disableKeyboardNavigation?: boolean }>[]).concat(out.props.children)[0];
    expect(chart.props.disableKeyboardNavigation).toBe(true);
  });

  it('leaves a consumer\'s own choice alone', () => {
    const chart = createElement(BarChart, { series: [], disableKeyboardNavigation: false } as object);
    const out = withMuiKeyboardNavigationDisabled(chart) as ReactElement<{ disableKeyboardNavigation?: boolean }>;

    expect(out.props.disableKeyboardNavigation).toBe(false);
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
