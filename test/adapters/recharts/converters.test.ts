import type { RechartsAdapterConfig } from '@adapters/recharts/types';
import type { BarPoint, HistogramPoint, LinePoint, ScatterPoint, SegmentedPoint } from '@type/grammar';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { TraceType } from '@type/grammar';

describe('convertRechartsToMaidr', () => {
  describe('bar chart', () => {
    it('converts simple bar chart data', () => {
      const config: RechartsAdapterConfig = {
        id: 'test-bar',
        title: 'Test Bar',
        data: [
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
          { name: 'C', value: 30 },
        ],
        chartType: 'bar',
        xKey: 'name',
        yKeys: ['value'],
        xLabel: 'Category',
        yLabel: 'Value',
      };

      const result = convertRechartsToMaidr(config);

      expect(result.id).toBe('test-bar');
      expect(result.title).toBe('Test Bar');
      expect(result.subplots).toHaveLength(1);
      expect(result.subplots[0]).toHaveLength(1);

      const layer = result.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.BAR);
      expect(layer.axes?.x).toBe('Category');
      expect(layer.axes?.y).toBe('Value');
      expect(layer.selectors).toBe('.recharts-bar-rectangle');

      const data = layer.data as BarPoint[];
      expect(data).toHaveLength(3);
      expect(data[0]).toEqual({ x: 'A', y: 10 });
      expect(data[1]).toEqual({ x: 'B', y: 20 });
      expect(data[2]).toEqual({ x: 'C', y: 30 });
    });

    it('creates separate layers for multi-series bar chart', () => {
      const config: RechartsAdapterConfig = {
        id: 'multi-bar',
        data: [
          { name: 'A', s1: 10, s2: 20 },
          { name: 'B', s1: 15, s2: 25 },
        ],
        chartType: 'bar',
        xKey: 'name',
        yKeys: ['s1', 's2'],
      };

      const result = convertRechartsToMaidr(config);
      const layers = result.subplots[0][0].layers;

      expect(layers).toHaveLength(2);
      expect(layers[0].title).toBe('s1');
      expect(layers[1].title).toBe('s2');

      const data0 = layers[0].data as BarPoint[];
      expect(data0[0]).toEqual({ x: 'A', y: 10 });

      const data1 = layers[1].data as BarPoint[];
      expect(data1[0]).toEqual({ x: 'A', y: 20 });
    });
  });

  describe('stacked bar chart', () => {
    it('converts stacked bar data to SegmentedPoint[][]', () => {
      const config: RechartsAdapterConfig = {
        id: 'stacked',
        data: [
          { month: 'Jan', a: 10, b: 20 },
          { month: 'Feb', a: 15, b: 25 },
        ],
        chartType: 'stacked_bar',
        xKey: 'month',
        yKeys: ['a', 'b'],
        fillKeys: ['Product A', 'Product B'],
      };

      const result = convertRechartsToMaidr(config);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.STACKED);

      const data = layer.data as SegmentedPoint[][];
      expect(data).toHaveLength(2);
      // First category (Jan): two segments
      expect(data[0]).toHaveLength(2);
      expect(data[0][0]).toEqual({ x: 'Jan', y: 10, fill: 'Product A' });
      expect(data[0][1]).toEqual({ x: 'Jan', y: 20, fill: 'Product B' });
      // Second category (Feb)
      expect(data[1][0]).toEqual({ x: 'Feb', y: 15, fill: 'Product A' });
      expect(data[1][1]).toEqual({ x: 'Feb', y: 25, fill: 'Product B' });
    });

    it('uses yKey names as fill labels when fillKeys omitted', () => {
      const config: RechartsAdapterConfig = {
        id: 'stacked',
        data: [{ x: 'A', s1: 10, s2: 20 }],
        chartType: 'stacked_bar',
        xKey: 'x',
        yKeys: ['s1', 's2'],
      };

      const result = convertRechartsToMaidr(config);
      const data = result.subplots[0][0].layers[0].data as SegmentedPoint[][];

      expect(data[0][0].fill).toBe('s1');
      expect(data[0][1].fill).toBe('s2');
    });
  });

  describe('dodged bar chart', () => {
    it('produces DODGED trace type', () => {
      const config: RechartsAdapterConfig = {
        id: 'dodged',
        data: [{ x: 'A', s1: 10, s2: 20 }],
        chartType: 'dodged_bar',
        xKey: 'x',
        yKeys: ['s1', 's2'],
      };

      const result = convertRechartsToMaidr(config);
      expect(result.subplots[0][0].layers[0].type).toBe(TraceType.DODGED);
    });
  });

  describe('normalized bar chart', () => {
    it('produces NORMALIZED trace type', () => {
      const config: RechartsAdapterConfig = {
        id: 'normalized',
        data: [{ x: 'A', s1: 10, s2: 20 }],
        chartType: 'normalized_bar',
        xKey: 'x',
        yKeys: ['s1', 's2'],
      };

      const result = convertRechartsToMaidr(config);
      expect(result.subplots[0][0].layers[0].type).toBe(TraceType.NORMALIZED);
    });
  });

  describe('histogram', () => {
    it('converts histogram data with bin config', () => {
      const config: RechartsAdapterConfig = {
        id: 'hist',
        data: [
          { bin: '0-10', count: 5, xMin: 0, xMax: 10 },
          { bin: '10-20', count: 8, xMin: 10, xMax: 20 },
        ],
        chartType: 'histogram',
        xKey: 'bin',
        yKeys: ['count'],
        binConfig: { xMinKey: 'xMin', xMaxKey: 'xMax' },
      };

      const result = convertRechartsToMaidr(config);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.HISTOGRAM);

      const data = layer.data as HistogramPoint[];
      expect(data).toHaveLength(2);
      expect(data[0]).toEqual({ x: '0-10', y: 5, xMin: 0, xMax: 10, yMin: 0, yMax: 5 });
      expect(data[1]).toEqual({ x: '10-20', y: 8, xMin: 10, xMax: 20, yMin: 0, yMax: 8 });
    });

    it('defaults bin ranges to 0 when binConfig omitted', () => {
      const config: RechartsAdapterConfig = {
        id: 'hist',
        data: [{ bin: 'A', count: 5 }],
        chartType: 'histogram',
        xKey: 'bin',
        yKeys: ['count'],
      };

      const result = convertRechartsToMaidr(config);
      const data = result.subplots[0][0].layers[0].data as HistogramPoint[];
      expect(data[0].xMin).toBe(0);
      expect(data[0].xMax).toBe(0);
    });
  });

  describe('line chart', () => {
    it('converts single series line data to LinePoint[][]', () => {
      const config: RechartsAdapterConfig = {
        id: 'line',
        data: [
          { x: 1, y: 10 },
          { x: 2, y: 20 },
        ],
        chartType: 'line',
        xKey: 'x',
        yKeys: ['y'],
      };

      const result = convertRechartsToMaidr(config);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.LINE);

      const data = layer.data as LinePoint[][];
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveLength(2);
      expect(data[0][0]).toEqual({ x: 1, y: 10 });
    });

    it('converts multi-series line data with fill labels', () => {
      const config: RechartsAdapterConfig = {
        id: 'multi-line',
        data: [
          { x: 1, s1: 10, s2: 20 },
          { x: 2, s1: 15, s2: 25 },
        ],
        chartType: 'line',
        xKey: 'x',
        yKeys: ['s1', 's2'],
      };

      const result = convertRechartsToMaidr(config);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.LINE);

      const data = layer.data as LinePoint[][];
      expect(data).toHaveLength(2);
      expect(data[0][0]).toEqual({ x: 1, y: 10, fill: 's1' });
      expect(data[1][0]).toEqual({ x: 1, y: 20, fill: 's2' });
    });
  });

  describe('area chart', () => {
    it('maps area to LINE trace type', () => {
      const config: RechartsAdapterConfig = {
        id: 'area',
        data: [{ x: 1, y: 10 }],
        chartType: 'area',
        xKey: 'x',
        yKeys: ['y'],
      };

      const result = convertRechartsToMaidr(config);
      expect(result.subplots[0][0].layers[0].type).toBe(TraceType.LINE);
    });
  });

  describe('scatter chart', () => {
    it('converts scatter data to ScatterPoint[]', () => {
      const config: RechartsAdapterConfig = {
        id: 'scatter',
        data: [
          { x: 1, y: 10 },
          { x: 2, y: 20 },
        ],
        chartType: 'scatter',
        xKey: 'x',
        yKeys: ['y'],
      };

      const result = convertRechartsToMaidr(config);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.SCATTER);

      const data = layer.data as ScatterPoint[];
      expect(data).toHaveLength(2);
      expect(data[0]).toEqual({ x: 1, y: 10 });
    });
  });

  describe('pie chart', () => {
    it('maps pie to BAR trace type', () => {
      const config: RechartsAdapterConfig = {
        id: 'pie',
        data: [
          { name: 'A', value: 30 },
          { name: 'B', value: 70 },
        ],
        chartType: 'pie',
        xKey: 'name',
        yKeys: ['value'],
      };

      const result = convertRechartsToMaidr(config);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.BAR);
      expect(layer.selectors).toBe('.recharts-pie-sector');

      const data = layer.data as BarPoint[];
      expect(data[0]).toEqual({ x: 'A', y: 30 });
    });
  });

  describe('radar chart', () => {
    it('maps radar to LINE trace type', () => {
      const config: RechartsAdapterConfig = {
        id: 'radar',
        data: [
          { subject: 'Math', score: 80 },
          { subject: 'English', score: 90 },
        ],
        chartType: 'radar',
        xKey: 'subject',
        yKeys: ['score'],
      };

      const result = convertRechartsToMaidr(config);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.LINE);
      expect(layer.selectors).toBe('.recharts-radar-dot');
    });
  });

  describe('funnel chart', () => {
    it('maps funnel to BAR trace type', () => {
      const config: RechartsAdapterConfig = {
        id: 'funnel',
        data: [
          { name: 'Visits', value: 1000 },
          { name: 'Signups', value: 500 },
        ],
        chartType: 'funnel',
        xKey: 'name',
        yKeys: ['value'],
      };

      const result = convertRechartsToMaidr(config);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.BAR);
      expect(layer.selectors).toBe('.recharts-funnel-trapezoid');
    });
  });

  describe('composed chart (layers mode)', () => {
    it('creates mixed layers from layer configs', () => {
      const config: RechartsAdapterConfig = {
        id: 'composed',
        data: [
          { month: 'Jan', revenue: 100, trend: 95 },
          { month: 'Feb', revenue: 150, trend: 140 },
        ],
        xKey: 'month',
        layers: [
          { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
          { yKey: 'trend', chartType: 'line', name: 'Trend' },
        ],
        xLabel: 'Month',
        yLabel: 'Value',
      };

      const result = convertRechartsToMaidr(config);
      const layers = result.subplots[0][0].layers;

      expect(layers).toHaveLength(2);
      expect(layers[0].type).toBe(TraceType.BAR);
      expect(layers[0].title).toBe('Revenue');
      expect(layers[1].type).toBe(TraceType.LINE);
      expect(layers[1].title).toBe('Trend');
    });

    it('indexes series correctly with multiple same-type layers', () => {
      const config: RechartsAdapterConfig = {
        id: 'composed',
        data: [{ x: 'A', y1: 10, y2: 20 }],
        xKey: 'x',
        layers: [
          { yKey: 'y1', chartType: 'bar', name: 'Bar 1' },
          { yKey: 'y2', chartType: 'bar', name: 'Bar 2' },
        ],
      };

      const result = convertRechartsToMaidr(config);
      const layers = result.subplots[0][0].layers;

      expect(layers[0].selectors).toBe('.recharts-bar:nth-child(1) .recharts-bar-rectangle');
      expect(layers[1].selectors).toBe('.recharts-bar:nth-child(2) .recharts-bar-rectangle');
    });
  });

  describe('metadata', () => {
    it('passes through title, subtitle, caption', () => {
      const config: RechartsAdapterConfig = {
        id: 'meta',
        title: 'Title',
        subtitle: 'Subtitle',
        caption: 'Caption',
        data: [{ x: 'A', y: 1 }],
        chartType: 'bar',
        xKey: 'x',
        yKeys: ['y'],
      };

      const result = convertRechartsToMaidr(config);
      expect(result.title).toBe('Title');
      expect(result.subtitle).toBe('Subtitle');
      expect(result.caption).toBe('Caption');
    });
  });

  describe('error handling', () => {
    it('throws when chartType and layers are both missing', () => {
      const config: RechartsAdapterConfig = {
        id: 'bad',
        data: [{ x: 'A', y: 1 }],
        xKey: 'x',
      };

      expect(() => convertRechartsToMaidr(config)).toThrow('RechartsAdapter');
    });

    it('throws when yKeys is empty in simple mode', () => {
      const config: RechartsAdapterConfig = {
        id: 'bad',
        data: [{ x: 'A', y: 1 }],
        chartType: 'bar',
        xKey: 'x',
        yKeys: [],
      };

      expect(() => convertRechartsToMaidr(config)).toThrow('RechartsAdapter');
    });

    it('throws when layers is empty in composed mode', () => {
      const config: RechartsAdapterConfig = {
        id: 'bad',
        data: [{ x: 'A', y: 1 }],
        xKey: 'x',
        layers: [],
      };

      expect(() => convertRechartsToMaidr(config)).toThrow('RechartsAdapter');
    });
  });

  describe('data coercion', () => {
    it('coerces string numbers to numbers', () => {
      const config: RechartsAdapterConfig = {
        id: 'coerce',
        data: [{ x: '1', y: '10.5' }],
        chartType: 'scatter',
        xKey: 'x',
        yKeys: ['y'],
      };

      const result = convertRechartsToMaidr(config);
      const data = result.subplots[0][0].layers[0].data as ScatterPoint[];
      expect(data[0]).toEqual({ x: 1, y: 10.5 });
    });

    it('returns 0 for missing or invalid values', () => {
      const config: RechartsAdapterConfig = {
        id: 'coerce',
        data: [{ x: 'A', y: null }],
        chartType: 'scatter',
        xKey: 'x',
        yKeys: ['y'],
      };

      const result = convertRechartsToMaidr(config);
      const data = result.subplots[0][0].layers[0].data as ScatterPoint[];
      expect(data[0]).toEqual({ x: 0, y: 0 });
    });
  });
});
