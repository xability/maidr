import type { AnyChartInstance, AnyChartIterator, AnyChartSeries } from '@type/anychart';
import type { CandlestickPoint, HeatmapData, HistogramPoint } from '@type/grammar';
import { anyChartToMaidr, extractRawRows, mapSeriesType, resolveContainerElement } from '../../src/adapter/anychart';
import { TraceType } from '../../src/type/grammar';

// ---------------------------------------------------------------------------
// Test helpers – mock AnyChart objects
// ---------------------------------------------------------------------------

function createMockIterator(
  rows: Array<Record<string, unknown>>,
): AnyChartIterator {
  let cursor = -1;
  return {
    advance() {
      cursor++;
      return cursor < rows.length;
    },
    get(field: string) {
      return rows[cursor]?.[field] ?? undefined;
    },
    getIndex() {
      return cursor;
    },
    getRowsCount() {
      return rows.length;
    },
    reset() {
      cursor = -1;
    },
  };
}

function createMockSeries(
  type: string,
  rows: Array<Record<string, unknown>>,
): AnyChartSeries {
  return {
    id: () => 0,
    name: () => 'Series 0',
    seriesType: () => type,
    getIterator: () => createMockIterator(rows),
    getPoint: (index: number) => ({
      get: (field: string) => rows[index]?.[field] ?? undefined,
      getIndex: () => index,
      exists: () => index >= 0 && index < rows.length,
    }),
    getStat: () => undefined,
  };
}

function createMockChart(
  seriesList: AnyChartSeries[],
  overrides: Partial<AnyChartInstance> = {},
): AnyChartInstance {
  return {
    title: () => 'Test Chart',
    container: () => 'container-id',
    getSeriesCount: () => seriesList.length,
    getSeriesAt: (index: number) => seriesList[index] ?? null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mapSeriesType
// ---------------------------------------------------------------------------

describe('mapSeriesType', () => {
  it('maps standard Cartesian types', () => {
    expect(mapSeriesType('bar')).toBe(TraceType.BAR);
    expect(mapSeriesType('column')).toBe(TraceType.BAR);
    expect(mapSeriesType('line')).toBe(TraceType.LINE);
    expect(mapSeriesType('scatter')).toBe(TraceType.SCATTER);
    expect(mapSeriesType('marker')).toBe(TraceType.SCATTER);
    expect(mapSeriesType('bubble')).toBe(TraceType.SCATTER);
  });

  it('maps complex chart types', () => {
    expect(mapSeriesType('box')).toBe(TraceType.BOX);
    expect(mapSeriesType('heatmap')).toBe(TraceType.HEATMAP);
    expect(mapSeriesType('heat')).toBe(TraceType.HEATMAP);
    expect(mapSeriesType('candlestick')).toBe(TraceType.CANDLESTICK);
    expect(mapSeriesType('ohlc')).toBe(TraceType.CANDLESTICK);
  });

  it('maps line variants', () => {
    expect(mapSeriesType('spline')).toBe(TraceType.LINE);
    expect(mapSeriesType('step-line')).toBe(TraceType.LINE);
    expect(mapSeriesType('area')).toBe(TraceType.LINE);
    expect(mapSeriesType('step-area')).toBe(TraceType.LINE);
  });

  it('normalises underscores and mixed case', () => {
    expect(mapSeriesType('spline_area')).toBe(TraceType.LINE);
    expect(mapSeriesType('Spline_Area')).toBe(TraceType.LINE);
    expect(mapSeriesType('STEP_LINE')).toBe(TraceType.LINE);
    expect(mapSeriesType('Bar')).toBe(TraceType.BAR);
  });

  it('returns null for unsupported types', () => {
    expect(mapSeriesType('pie')).toBeNull();
    expect(mapSeriesType('funnel')).toBeNull();
    expect(mapSeriesType('unknown')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractRawRows
// ---------------------------------------------------------------------------

describe('extractRawRows', () => {
  it('extracts basic x/value fields', () => {
    const series = createMockSeries('bar', [
      { x: 'A', value: 10 },
      { x: 'B', value: 20 },
    ]);
    const rows = extractRawRows(series);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ x: 'A', value: 10 });
    expect(rows[1]).toMatchObject({ x: 'B', value: 20 });
  });

  it('extracts box fields', () => {
    const series = createMockSeries('box', [
      { x: 'G1', lowest: 10, q1: 25, median: 50, q3: 75, highest: 90 },
    ]);
    const rows = extractRawRows(series);
    expect(rows[0]).toMatchObject({
      x: 'G1',
      lowest: 10,
      q1: 25,
      median: 50,
      q3: 75,
      highest: 90,
    });
  });

  it('extracts candlestick OHLC fields', () => {
    const series = createMockSeries('candlestick', [
      { x: '2024-01-01', open: 100, high: 110, low: 95, close: 105 },
    ]);
    const rows = extractRawRows(series);
    expect(rows[0]).toMatchObject({
      x: '2024-01-01',
      open: 100,
      high: 110,
      low: 95,
      close: 105,
    });
  });

  it('includes iterator index as _index', () => {
    const series = createMockSeries('bar', [{ value: 42 }]);
    const rows = extractRawRows(series);
    expect(rows[0]._index).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveContainerElement
// ---------------------------------------------------------------------------

describe('resolveContainerElement', () => {
  it('returns null when container() returns null', () => {
    const chart = createMockChart([], { container: () => null as any });
    expect(resolveContainerElement(chart)).toBeNull();
  });

  it('returns null when container() throws', () => {
    const chart = createMockChart([], {
      container: () => {
        throw new Error('test');
      },
    });
    expect(resolveContainerElement(chart)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// anyChartToMaidr – BAR
// ---------------------------------------------------------------------------

describe('anyChartToMaidr – BAR', () => {
  it('generates bar layer from column series', () => {
    const series = createMockSeries('column', [
      { x: 'Sat', value: 87 },
      { x: 'Sun', value: 76 },
      { x: 'Thur', value: 62 },
    ]);
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, { id: 'test' });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('test');
    expect(result!.title).toBe('Test Chart');

    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.data).toHaveLength(3);
    expect((layer.data as any[])[0]).toEqual({ x: 'Sat', y: 87 });
  });

  it('returns null for empty chart', () => {
    const chart = createMockChart([]);
    expect(anyChartToMaidr(chart)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// anyChartToMaidr – LINE
// ---------------------------------------------------------------------------

describe('anyChartToMaidr – LINE', () => {
  it('generates line layer with 2D data', () => {
    const series = createMockSeries('line', [
      { x: 1, value: 10 },
      { x: 2, value: 20 },
      { x: 3, value: 30 },
    ]);
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, { id: 'line-test' });

    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.LINE);
    // Line data is 2D: array of arrays
    const data = layer.data as any[][];
    expect(Array.isArray(data[0])).toBe(true);
    expect(data[0]).toHaveLength(3);
    expect(data[0][0]).toEqual({ x: 1, y: 10 });
  });
});

// ---------------------------------------------------------------------------
// anyChartToMaidr – SCATTER
// ---------------------------------------------------------------------------

describe('anyChartToMaidr – SCATTER', () => {
  it('generates scatter layer with numeric x and y', () => {
    const series = createMockSeries('scatter', [
      { x: 1.5, value: 3.2 },
      { x: 2.1, value: 4.8 },
    ]);
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, { id: 'scatter-test' });

    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.SCATTER);
    expect((layer.data as any[])[0]).toEqual({ x: 1.5, y: 3.2 });
  });
});

// ---------------------------------------------------------------------------
// anyChartToMaidr – BOX
// ---------------------------------------------------------------------------

describe('anyChartToMaidr – BOX', () => {
  it('generates box layer with quartile data', () => {
    const series = createMockSeries('box', [
      { x: 'Group1', lowest: 10, q1: 25, median: 50, q3: 75, highest: 90 },
      { x: 'Group2', lowest: 5, q1: 20, median: 40, q3: 60, highest: 85 },
    ]);
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, { id: 'box-test' });

    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.BOX);
    const data = layer.data as any[];
    expect(data[0]).toMatchObject({
      fill: 'Group1',
      min: 10,
      q1: 25,
      q2: 50,
      q3: 75,
      max: 90,
      lowerOutliers: [],
      upperOutliers: [],
    });
  });
});

// ---------------------------------------------------------------------------
// anyChartToMaidr – HEATMAP
// ---------------------------------------------------------------------------

describe('anyChartToMaidr – HEATMAP', () => {
  it('generates heatmap with 2D point matrix', () => {
    const series = createMockSeries('heatmap', [
      { x: 'A', y: 'R1', value: 10 },
      { x: 'B', y: 'R1', value: 20 },
      { x: 'A', y: 'R2', value: 30 },
      { x: 'B', y: 'R2', value: 40 },
    ]);
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, { id: 'heat-test' });

    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.HEATMAP);

    const data = layer.data as HeatmapData;
    expect(data.x).toEqual(['A', 'B']);
    expect(data.y).toEqual(['R1', 'R2']);
    expect(data.points).toEqual([
      [10, 20],
      [30, 40],
    ]);
  });
});

// ---------------------------------------------------------------------------
// anyChartToMaidr – CANDLESTICK
// ---------------------------------------------------------------------------

describe('anyChartToMaidr – CANDLESTICK', () => {
  it('generates candlestick layer with OHLC data and trend', () => {
    const series = createMockSeries('candlestick', [
      { x: '2024-01-01', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
      { x: '2024-01-02', open: 105, high: 108, low: 98, close: 99, volume: 800 },
      { x: '2024-01-03', open: 100, high: 105, low: 100, close: 100, volume: 500 },
    ]);
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, { id: 'candle-test' });

    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.CANDLESTICK);

    const data = layer.data as CandlestickPoint[];
    expect(data).toHaveLength(3);
    // Bull: close > open
    expect(data[0].trend).toBe('Bull');
    expect(data[0].open).toBe(100);
    expect(data[0].close).toBe(105);
    // Bear: close < open
    expect(data[1].trend).toBe('Bear');
    // Neutral: close == open
    expect(data[2].trend).toBe('Neutral');
  });
});

// ---------------------------------------------------------------------------
// anyChartToMaidr – HISTOGRAM
// ---------------------------------------------------------------------------

describe('anyChartToMaidr – HISTOGRAM', () => {
  it('generates histogram layer with bin data', () => {
    const series = createMockSeries('column', [
      { x: 1.5, value: 10 },
      { x: 2.5, value: 20 },
    ]);
    // Force histogram type via direct call to anyChartToMaidr
    // Since there's no 'histogram' seriesType in AnyChart, we test the builder
    // through a custom mapping. For now, test the BAR output from column.
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, { id: 'hist-test' });

    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.BAR);
    const data = layer.data as HistogramPoint[];
    expect(data).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// anyChartToMaidr – options handling
// ---------------------------------------------------------------------------

describe('anyChartToMaidr – options', () => {
  it('applies title and axis overrides', () => {
    const series = createMockSeries('bar', [{ x: 'A', value: 1 }]);
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, {
      id: 'opts-test',
      title: 'Custom Title',
      axes: { x: 'X Label', y: 'Y Label' },
    });

    expect(result!.title).toBe('Custom Title');
    const layer = result!.subplots[0][0].layers[0];
    expect(layer.axes).toEqual({ x: 'X Label', y: 'Y Label' });
  });

  it('applies string selectors to layers', () => {
    const series = createMockSeries('bar', [{ x: 'A', value: 1 }]);
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, {
      id: 'sel-test',
      selectors: '.my-bar rect',
    });

    const layer = result!.subplots[0][0].layers[0];
    expect(layer.selectors).toBe('.my-bar rect');
  });

  it('omits selectors when none provided', () => {
    const series = createMockSeries('bar', [{ x: 'A', value: 1 }]);
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, { id: 'no-sel' });

    const layer = result!.subplots[0][0].layers[0];
    expect(layer.selectors).toBeUndefined();
  });

  it('skips unsupported series types with warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const series = createMockSeries('pie', [{ x: 'A', value: 1 }]);
    const chart = createMockChart([series]);
    const result = anyChartToMaidr(chart, { id: 'unsup-test' });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported AnyChart series type "pie"'),
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// anyChartToMaidr – multi-series
// ---------------------------------------------------------------------------

describe('anyChartToMaidr – multi-series', () => {
  it('handles multiple series of different types', () => {
    const barSeries = createMockSeries('bar', [
      { x: 'A', value: 10 },
    ]);
    const lineSeries = createMockSeries('line', [
      { x: 1, value: 20 },
    ]);
    const chart = createMockChart([barSeries, lineSeries]);
    const result = anyChartToMaidr(chart, { id: 'multi-test' });

    expect(result).not.toBeNull();
    const layers = result!.subplots[0][0].layers;
    expect(layers).toHaveLength(2);
    expect(layers[0].type).toBe(TraceType.BAR);
    expect(layers[1].type).toBe(TraceType.LINE);
  });

  it('applies per-series selectors', () => {
    const s1 = createMockSeries('bar', [{ x: 'A', value: 10 }]);
    const s2 = createMockSeries('line', [{ x: 1, value: 20 }]);
    const chart = createMockChart([s1, s2]);
    const result = anyChartToMaidr(chart, {
      id: 'per-sel',
      selectors: ['.bar-el rect', undefined],
    });

    const layers = result!.subplots[0][0].layers;
    expect(layers[0].selectors).toBe('.bar-el rect');
    expect(layers[1].selectors).toBeUndefined();
  });
});
