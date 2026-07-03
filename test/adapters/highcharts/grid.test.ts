import type { HighchartsChart } from '@adapters/highcharts/types';
import type { LinePoint } from '@type/grammar';
import { highchartsGridToMaidr } from '@adapters/highcharts/grid';
import { TraceType } from '@type/grammar';
import { categoryPoints, fakeAxis, fakeChart, fakeSeries } from './helpers';

function barChart(name: string, renderToId: string, title?: string): HighchartsChart {
  return fakeChart({
    title,
    type: 'column',
    renderToId,
    series: [fakeSeries({
      index: 0,
      name,
      data: categoryPoints([1, 2, 3], ['a', 'b', 'c']),
    })],
  });
}

describe('highchartsGridToMaidr', () => {
  it('maps a flat chart list to a single subplot row by default', () => {
    const result = highchartsGridToMaidr(
      [barChart('East', 'grid-east', 'East'), barChart('West', 'grid-west', 'West')],
      { id: 'grid-1', title: 'Sales by region' },
    );

    expect(result.id).toBe('grid-1');
    expect(result.title).toBe('Sales by region');
    expect(result.subplots).toHaveLength(1);
    expect(result.subplots[0]).toHaveLength(2);
  });

  it('chunks a flat list into rows via options.layout.columns', () => {
    const charts = [
      barChart('A', 'grid-a'),
      barChart('B', 'grid-b'),
      barChart('C', 'grid-c'),
    ];

    const result = highchartsGridToMaidr(charts, { layout: { columns: 2 } });

    expect(result.subplots).toHaveLength(2);
    expect(result.subplots[0]).toHaveLength(2);
    expect(result.subplots[1]).toHaveLength(1);
  });

  it('derives columns from options.layout.rows when columns is not set', () => {
    const charts = [
      barChart('A', 'grid-ra'),
      barChart('B', 'grid-rb'),
      barChart('C', 'grid-rc'),
      barChart('D', 'grid-rd'),
    ];

    const result = highchartsGridToMaidr(charts, { layout: { rows: 2 } });

    expect(result.subplots).toHaveLength(2);
    expect(result.subplots[0]).toHaveLength(2);
    expect(result.subplots[1]).toHaveLength(2);
  });

  it('maps 2D input 1:1 to the subplot grid, including ragged rows', () => {
    const result = highchartsGridToMaidr([
      [barChart('A', 'grid-2d-a'), barChart('B', 'grid-2d-b')],
      [barChart('C', 'grid-2d-c')],
    ]);

    expect(result.subplots).toHaveLength(2);
    expect(result.subplots[0]).toHaveLength(2);
    expect(result.subplots[1]).toHaveLength(1);
  });

  it('uses each chart title as its panel display name (first layer title)', () => {
    const result = highchartsGridToMaidr([
      barChart('Sales', 'grid-t1', 'East region'),
      barChart('Sales', 'grid-t2', 'West region'),
    ]);

    expect(result.subplots[0][0].layers[0].title).toBe('East region');
    expect(result.subplots[0][1].layers[0].title).toBe('West region');
  });

  it('keeps layer ids unique across panels and selectors container-scoped', () => {
    const result = highchartsGridToMaidr([
      barChart('A', 'grid-u1'),
      barChart('B', 'grid-u2'),
    ]);

    const layers = result.subplots.flat().flatMap(subplot => subplot.layers);
    expect(layers.map(l => l.id)).toEqual(['0_0', '1_0']);
    expect(layers[0].selectors).toBe(
      '#grid-u1 .highcharts-series-group .highcharts-series-0 .highcharts-point',
    );
    expect(layers[1].selectors).toBe(
      '#grid-u2 .highcharts-series-group .highcharts-series-0 .highcharts-point',
    );
  });

  it('skips charts with no convertible series and compacts their rows', () => {
    const empty = fakeChart({ type: 'column', renderToId: 'grid-empty', series: [] });

    const result = highchartsGridToMaidr([
      [barChart('A', 'grid-s1')],
      [empty],
      [barChart('B', 'grid-s2')],
    ]);

    expect(result.subplots).toHaveLength(2);
    expect(result.subplots[0][0].layers[0].title).toBe('A');
    expect(result.subplots[1][0].layers[0].title).toBe('B');
    for (const row of result.subplots) {
      for (const subplot of row) {
        expect(subplot.layers.length).toBeGreaterThan(0);
      }
    }
  });

  it('supports mixed trace types across panels', () => {
    const lineChart = fakeChart({
      title: 'Trend',
      type: 'line',
      renderToId: 'grid-line',
      series: [fakeSeries({
        index: 0,
        type: 'line',
        name: 'Trend',
        data: categoryPoints([5, 7, 6], ['a', 'b', 'c']),
      })],
    });

    const result = highchartsGridToMaidr([barChart('Bars', 'grid-m1', 'Bars'), lineChart]);
    const [barSubplot, lineSubplot] = result.subplots[0];

    expect(barSubplot.layers[0].type).toBe(TraceType.BAR);
    expect(lineSubplot.layers[0].type).toBe(TraceType.LINE);
    expect((lineSubplot.layers[0].data as LinePoint[][])[0]).toHaveLength(3);
  });

  it('emits a container-scoped subplot selector per panel', () => {
    // Each panel's selector lets MAIDR's layout pass measure the chart's own
    // geometry (visual ordering + vertical arrow-key direction for multi-row
    // grids) — Highcharts SVG has no `g[id^="axes_"]` groups to measure.
    const result = highchartsGridToMaidr([
      barChart('A', 'grid-sel-a'),
      barChart('B', 'grid-sel-b'),
    ]);

    expect(result.subplots[0][0].selector).toBe(
      '#grid-sel-a .highcharts-series-group .highcharts-series-0',
    );
    expect(result.subplots[0][1].selector).toBe(
      '#grid-sel-b .highcharts-series-group .highcharts-series-0',
    );
  });

  it('expands a multi-pane member chart into adjacent cells instead of fusing panes', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const xAxis = fakeAxis({ left: 60, width: 600 });
      const paneChart = fakeChart({
        title: 'Metrics',
        type: 'column',
        renderToId: 'grid-panes',
        series: [
          fakeSeries({
            index: 0,
            name: 'Revenue',
            xAxis,
            yAxis: fakeAxis({ top: 40, height: 200 }),
            data: categoryPoints([1, 2], ['a', 'b']),
          }),
          fakeSeries({
            index: 1,
            name: 'Headcount',
            xAxis,
            yAxis: fakeAxis({ top: 260, height: 200 }),
            data: categoryPoints([3, 4], ['a', 'b']),
          }),
        ],
      });

      const result = highchartsGridToMaidr([barChart('A', 'grid-pane-a', 'A'), paneChart]);

      // One row: plain chart cell + one cell per pane of the member chart.
      expect(result.subplots).toHaveLength(1);
      expect(result.subplots[0]).toHaveLength(3);

      const [plainCell, topPane, bottomPane] = result.subplots[0];
      expect(plainCell.layers[0].type).toBe(TraceType.BAR);
      // Cross-pane bar series must stay separate BAR cells, never one DODGED
      // layer mixing unrelated scales.
      expect(topPane.layers[0].type).toBe(TraceType.BAR);
      expect(bottomPane.layers[0].type).toBe(TraceType.BAR);

      // Chart title names the first pane only; other panes keep their names.
      expect(topPane.layers[0].title).toBe('Metrics');
      expect(bottomPane.layers[0].title).toBe('Headcount');

      // Layer ids stay unique across the whole figure.
      const ids = result.subplots.flat().flatMap(subplot => subplot.layers).map(l => l.id);
      expect(new Set(ids).size).toBe(ids.length);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('flattening them into adjacent cells'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('throws on empty input', () => {
    expect(() => highchartsGridToMaidr([])).toThrow(/at least one chart/);
  });

  it('throws when no chart in the grid produces any convertible series', () => {
    // An all-skipped grid must fail loudly at conversion time — an
    // empty-layers subplot would crash MAIDR's Context on first focus.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const noSeries = fakeChart({ type: 'column', renderToId: 'grid-none-1', series: [] });
      const unsupported = fakeChart({
        type: 'pie',
        renderToId: 'grid-none-2',
        series: [fakeSeries({ index: 0, type: 'pie', name: 'Share', data: categoryPoints([1], ['a']) })],
      });

      expect(() => highchartsGridToMaidr([noSeries, unsupported]))
        .toThrow(/no chart in the grid produced any convertible series/);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
