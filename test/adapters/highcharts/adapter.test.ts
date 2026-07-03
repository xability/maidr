import type { BarPoint, HeatmapData, LinePoint, SegmentedPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { categoryPoints, fakeAxis, fakeChart, fakeSeries } from './helpers';

describe('highchartsToMaidr', () => {
  describe('single-pane charts (existing behavior)', () => {
    it('converts a simple column chart into a 1x1 subplot grid', () => {
      const chart = fakeChart({
        title: 'Tips by Day',
        type: 'column',
        renderToId: 'bar-chart',
        series: [fakeSeries({
          index: 0,
          name: 'Tips',
          data: categoryPoints([20, 14, 23], ['Mon', 'Tue', 'Wed']),
        })],
      });

      const result = highchartsToMaidr(chart, { id: 'test-bar' });

      expect(result.id).toBe('test-bar');
      expect(result.title).toBe('Tips by Day');
      expect(result.subplots).toHaveLength(1);
      expect(result.subplots[0]).toHaveLength(1);

      const layer = result.subplots[0][0].layers[0];
      expect(layer.id).toBe('0');
      expect(layer.type).toBe(TraceType.BAR);
      expect(layer.selectors).toBe(
        '#bar-chart .highcharts-series-group .highcharts-series-0 .highcharts-point',
      );

      const data = layer.data as BarPoint[];
      expect(data).toEqual([
        { x: 'Mon', y: 20 },
        { x: 'Tue', y: 14 },
        { x: 'Wed', y: 23 },
      ]);
    });

    it('keeps a dual-axis overlay (coinciding bands) as a single subplot', () => {
      const xAxis = fakeAxis({ left: 60, width: 600 });
      const yAxisLeft = fakeAxis({ top: 40, height: 300 });
      const yAxisRight = fakeAxis({ top: 40, height: 300 });
      const chart = fakeChart({
        type: 'line',
        series: [
          fakeSeries({ index: 0, type: 'line', xAxis, yAxis: yAxisLeft, data: categoryPoints([1, 2], ['a', 'b']) }),
          fakeSeries({ index: 1, type: 'column', xAxis, yAxis: yAxisRight, data: categoryPoints([3, 4], ['a', 'b']) }),
        ],
      });

      const result = highchartsToMaidr(chart);

      expect(result.subplots).toHaveLength(1);
      expect(result.subplots[0]).toHaveLength(1);
      expect(result.subplots[0][0].layers).toHaveLength(2);
    });

    it('falls back to a single subplot when axis bands overlap ambiguously', () => {
      const xAxis = fakeAxis({ left: 60, width: 600 });
      const chart = fakeChart({
        type: 'line',
        series: [
          fakeSeries({
            index: 0,
            type: 'line',
            xAxis,
            yAxis: fakeAxis({ top: 0, height: 300 }),
            data: categoryPoints([1, 2], ['a', 'b']),
          }),
          fakeSeries({
            index: 1,
            type: 'line',
            xAxis,
            yAxis: fakeAxis({ top: 150, height: 300 }),
            data: categoryPoints([3, 4], ['a', 'b']),
          }),
        ],
      });

      const result = highchartsToMaidr(chart);

      expect(result.subplots).toHaveLength(1);
      expect(result.subplots[0]).toHaveLength(1);
    });

    it('falls back to a single subplot when axis geometry is missing', () => {
      const xAxis = fakeAxis();
      const chart = fakeChart({
        type: 'line',
        series: [
          fakeSeries({ index: 0, type: 'line', xAxis, yAxis: fakeAxis(), data: categoryPoints([1], ['a']) }),
          fakeSeries({ index: 1, type: 'line', xAxis, yAxis: fakeAxis(), data: categoryPoints([2], ['a']) }),
        ],
      });

      const result = highchartsToMaidr(chart);

      expect(result.subplots).toHaveLength(1);
      expect(result.subplots[0]).toHaveLength(1);
    });
  });

  describe('internal series exclusion', () => {
    it('excludes navigator/internal series from conversion', () => {
      const chart = fakeChart({
        type: 'line',
        series: [
          fakeSeries({
            index: 0,
            type: 'line',
            name: 'Price',
            data: categoryPoints([10, 12], ['a', 'b']),
          }),
          fakeSeries({
            index: 1,
            type: 'line',
            name: 'Navigator',
            options: { isInternal: true, className: 'highcharts-navigator-series' },
            data: categoryPoints([10, 12], ['a', 'b']),
          }),
        ],
      });

      const result = highchartsToMaidr(chart);
      const layer = result.subplots[0][0].layers[0];

      expect(result.subplots[0][0].layers).toHaveLength(1);
      expect(layer.type).toBe(TraceType.LINE);
      // Only the real series remains in the multi-line layer.
      expect((layer.data as LinePoint[][])).toHaveLength(1);
      expect(layer.title).toBe('Price');
    });
  });

  describe('pane detection (stacked yAxis bands)', () => {
    function stockStyleChart(): ReturnType<typeof fakeChart> {
      const xAxis = fakeAxis({ left: 60, width: 600 });
      const priceAxis = fakeAxis({ top: 40, height: 250, options: { title: { text: 'Price' } } });
      const volumeAxis = fakeAxis({ top: 310, height: 100, options: { title: { text: 'Volume' } } });
      return fakeChart({
        title: 'AAPL',
        type: 'line',
        renderToId: 'stock-chart',
        series: [
          fakeSeries({
            index: 0,
            type: 'line',
            name: 'AAPL Price',
            xAxis,
            yAxis: priceAxis,
            data: categoryPoints([150, 152, 149], ['d1', 'd2', 'd3']),
          }),
          fakeSeries({
            index: 1,
            type: 'column',
            name: 'AAPL Volume',
            xAxis,
            yAxis: volumeAxis,
            data: categoryPoints([1000, 1400, 900], ['d1', 'd2', 'd3']),
          }),
        ],
      });
    }

    it('emits one subplot per pane, top pane first', () => {
      const result = highchartsToMaidr(stockStyleChart());

      expect(result.subplots).toHaveLength(2);
      expect(result.subplots[0]).toHaveLength(1);
      expect(result.subplots[1]).toHaveLength(1);

      const topLayers = result.subplots[0][0].layers;
      const bottomLayers = result.subplots[1][0].layers;
      expect(topLayers).toHaveLength(1);
      expect(topLayers[0].type).toBe(TraceType.LINE);
      expect(bottomLayers).toHaveLength(1);
      expect(bottomLayers[0].type).toBe(TraceType.BAR);
    });

    it('orders rows by visual position even when series come bottom-pane first', () => {
      const xAxis = fakeAxis({ left: 60, width: 600 });
      const topAxis = fakeAxis({ top: 40, height: 250 });
      const bottomAxis = fakeAxis({ top: 310, height: 100 });
      const chart = fakeChart({
        type: 'line',
        series: [
          fakeSeries({
            index: 0,
            type: 'column',
            name: 'Bottom',
            xAxis,
            yAxis: bottomAxis,
            data: categoryPoints([1, 2], ['a', 'b']),
          }),
          fakeSeries({
            index: 1,
            type: 'line',
            name: 'Top',
            xAxis,
            yAxis: topAxis,
            data: categoryPoints([3, 4], ['a', 'b']),
          }),
        ],
      });

      const result = highchartsToMaidr(chart);

      expect(result.subplots).toHaveLength(2);
      expect(result.subplots[0][0].layers[0].title).toBe('Top');
      expect(result.subplots[1][0].layers[0].title).toBe('Bottom');
    });

    it('keeps layer ids unique across panes and selectors series-scoped', () => {
      const result = highchartsToMaidr(stockStyleChart());

      const allLayers = result.subplots.flat().flatMap(subplot => subplot.layers);
      const ids = allLayers.map(layer => layer.id);
      expect(new Set(ids).size).toBe(ids.length);

      // Each pane's selector targets only its own series index within the
      // shared container.
      expect(allLayers[0].selectors).toEqual([
        '#stock-chart .highcharts-series-group .highcharts-series-0 path.highcharts-graph',
      ]);
      expect(allLayers[1].selectors).toBe(
        '#stock-chart .highcharts-series-group .highcharts-series-1 .highcharts-point',
      );
    });

    it('does not fuse bar series from different panes into one dodged layer', () => {
      const xAxis = fakeAxis({ left: 60, width: 600 });
      const chart = fakeChart({
        type: 'column',
        series: [
          fakeSeries({
            index: 0,
            name: 'Pane A bars',
            xAxis,
            yAxis: fakeAxis({ top: 40, height: 200 }),
            data: categoryPoints([1, 2], ['a', 'b']),
          }),
          fakeSeries({
            index: 1,
            name: 'Pane B bars',
            xAxis,
            yAxis: fakeAxis({ top: 260, height: 200 }),
            data: categoryPoints([3, 4], ['a', 'b']),
          }),
        ],
      });

      const result = highchartsToMaidr(chart);

      expect(result.subplots).toHaveLength(2);
      expect(result.subplots[0][0].layers[0].type).toBe(TraceType.BAR);
      expect(result.subplots[1][0].layers[0].type).toBe(TraceType.BAR);
    });

    it('still groups multiple bar series within the same pane as dodged', () => {
      const xAxis = fakeAxis({ left: 60, width: 600 });
      const topAxis = fakeAxis({ top: 40, height: 200 });
      const bottomAxis = fakeAxis({ top: 260, height: 200 });
      const chart = fakeChart({
        type: 'column',
        series: [
          fakeSeries({ index: 0, name: 'A', xAxis, yAxis: topAxis, data: categoryPoints([1, 2], ['a', 'b']) }),
          fakeSeries({ index: 1, name: 'B', xAxis, yAxis: topAxis, data: categoryPoints([3, 4], ['a', 'b']) }),
          fakeSeries({ index: 2, name: 'C', xAxis, yAxis: bottomAxis, data: categoryPoints([5, 6], ['a', 'b']) }),
        ],
      });

      const result = highchartsToMaidr(chart);

      expect(result.subplots).toHaveLength(2);
      const topLayer = result.subplots[0][0].layers[0];
      expect(topLayer.type).toBe(TraceType.DODGED);
      expect((topLayer.data as SegmentedPoint[][])).toHaveLength(2);
      expect(result.subplots[1][0].layers[0].type).toBe(TraceType.BAR);
    });

    it('uses the pane yAxis title as panel name when the series is unnamed', () => {
      const xAxis = fakeAxis({ left: 60, width: 600 });
      const chart = fakeChart({
        type: 'line',
        series: [
          fakeSeries({
            index: 0,
            type: 'line',
            name: '',
            xAxis,
            yAxis: fakeAxis({ top: 40, height: 250, options: { title: { text: 'Price' } } }),
            data: categoryPoints([1, 2], ['a', 'b']),
          }),
          fakeSeries({
            index: 1,
            type: 'column',
            name: '',
            xAxis,
            yAxis: fakeAxis({ top: 310, height: 100, options: { title: { text: 'Volume' } } }),
            data: categoryPoints([3, 4], ['a', 'b']),
          }),
        ],
      });

      const result = highchartsToMaidr(chart);

      expect(result.subplots[0][0].layers[0].title).toBe('Price');
      expect(result.subplots[1][0].layers[0].title).toBe('Volume');
    });
  });

  describe('pane detection (side-by-side xAxis bands)', () => {
    it('emits a 2x2 grid for two yAxis bands crossed with two xAxis bands', () => {
      const leftX = fakeAxis({ left: 60, width: 280 });
      const rightX = fakeAxis({ left: 380, width: 280 });
      const topY = fakeAxis({ top: 40, height: 200 });
      const bottomY = fakeAxis({ top: 260, height: 200 });
      const chart = fakeChart({
        type: 'column',
        series: [
          fakeSeries({ index: 0, name: 'TL', xAxis: leftX, yAxis: topY, data: categoryPoints([1], ['a']) }),
          fakeSeries({ index: 1, name: 'TR', xAxis: rightX, yAxis: topY, data: categoryPoints([2], ['a']) }),
          fakeSeries({ index: 2, name: 'BL', xAxis: leftX, yAxis: bottomY, data: categoryPoints([3], ['a']) }),
          fakeSeries({ index: 3, name: 'BR', xAxis: rightX, yAxis: bottomY, data: categoryPoints([4], ['a']) }),
        ],
      });

      const result = highchartsToMaidr(chart);

      expect(result.subplots).toHaveLength(2);
      expect(result.subplots[0]).toHaveLength(2);
      expect(result.subplots[1]).toHaveLength(2);
      expect(result.subplots[0][0].layers[0].title).toBe('TL');
      expect(result.subplots[0][1].layers[0].title).toBe('TR');
      expect(result.subplots[1][0].layers[0].title).toBe('BL');
      expect(result.subplots[1][1].layers[0].title).toBe('BR');
    });

    it('compacts ragged rows instead of emitting empty subplot cells', () => {
      const leftX = fakeAxis({ left: 60, width: 280 });
      const rightX = fakeAxis({ left: 380, width: 280 });
      const topY = fakeAxis({ top: 40, height: 200 });
      const bottomY = fakeAxis({ top: 260, height: 200 });
      const chart = fakeChart({
        type: 'column',
        series: [
          fakeSeries({ index: 0, name: 'TL', xAxis: leftX, yAxis: topY, data: categoryPoints([1], ['a']) }),
          fakeSeries({ index: 1, name: 'TR', xAxis: rightX, yAxis: topY, data: categoryPoints([2], ['a']) }),
          fakeSeries({ index: 2, name: 'BR', xAxis: rightX, yAxis: bottomY, data: categoryPoints([3], ['a']) }),
        ],
      });

      const result = highchartsToMaidr(chart);

      expect(result.subplots).toHaveLength(2);
      expect(result.subplots[0]).toHaveLength(2);
      // Bottom row is ragged: only the occupied cell survives.
      expect(result.subplots[1]).toHaveLength(1);
      expect(result.subplots[1][0].layers[0].title).toBe('BR');
      for (const row of result.subplots) {
        for (const subplot of row) {
          expect(subplot.layers.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('heatmap axis resolution', () => {
    it('reads categories from the series\' own axes, not chart.xAxis[0]', () => {
      const seriesXAxis = fakeAxis({ categories: ['Mon', 'Tue'] });
      const seriesYAxis = fakeAxis({ categories: ['AM', 'PM'] });
      const heatmap = fakeSeries({
        index: 0,
        type: 'heatmap',
        name: 'Activity',
        xAxis: seriesXAxis,
        yAxis: seriesYAxis,
        data: [
          { x: 0, y: 0, options: { value: 5 } },
          { x: 1, y: 0, options: { value: 6 } },
          { x: 0, y: 1, options: { value: 7 } },
          { x: 1, y: 1, options: { value: 8 } },
        ],
      });
      const chart = fakeChart({
        type: 'heatmap',
        series: [heatmap],
        // A different primary axis pair on the chart itself: the wrong source.
        xAxis: [fakeAxis({ categories: ['WRONG-X'] }), seriesXAxis],
        yAxis: [fakeAxis({ categories: ['WRONG-Y'] }), seriesYAxis],
      });

      const result = highchartsToMaidr(chart);
      const data = result.subplots[0][0].layers[0].data as HeatmapData;

      expect(data.x).toEqual(['Mon', 'Tue']);
      expect(data.y).toEqual(['AM', 'PM']);
      expect(data.points).toEqual([[5, 6], [7, 8]]);
    });
  });
});
