import type { RechartsAdapterConfig } from '@adapters/recharts/types';
import type { BarPoint, HistogramPoint, LinePoint, PiePoint, ScatterPoint, SegmentedPoint } from '@type/grammar';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { Orientation, TraceType } from '@type/grammar';

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
      expect(layer.axes?.x).toEqual({ label: 'Category' });
      expect(layer.axes?.y).toEqual({ label: 'Value' });
      // Selector is scoped to this chart's own article wrapper so multiple
      // Recharts charts on one page cannot cross-highlight.
      expect(layer.selectors).toBe('#maidr-article-test-bar .recharts-bar-rectangle .recharts-rectangle');

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

      // Multi-series selectors are undefined (CSS unreliable)
      expect(layers[0].selectors).toBeUndefined();
      expect(layers[1].selectors).toBeUndefined();

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
      // First series (Product A): all categories
      expect(data[0]).toHaveLength(2);
      expect(data[0][0]).toEqual({ x: 'Jan', y: 10, z: 'Product A' });
      expect(data[0][1]).toEqual({ x: 'Feb', y: 15, z: 'Product A' });
      // Second series (Product B): all categories
      expect(data[1]).toHaveLength(2);
      expect(data[1][0]).toEqual({ x: 'Jan', y: 20, z: 'Product B' });
      expect(data[1][1]).toEqual({ x: 'Feb', y: 25, z: 'Product B' });
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

      expect(data[0][0].z).toBe('s1');
      expect(data[1][0].z).toBe('s2');
    });

    it('falls back to BAR type when stacked_bar has single yKey', () => {
      const config: RechartsAdapterConfig = {
        id: 'stacked-single',
        data: [
          { x: 'A', y: 10 },
          { x: 'B', y: 20 },
        ],
        chartType: 'stacked_bar',
        xKey: 'x',
        yKeys: ['y'],
      };

      const result = convertRechartsToMaidr(config);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.BAR);

      const data = layer.data as BarPoint[];
      expect(data[0]).toEqual({ x: 'A', y: 10 });
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

    it('falls back to BAR type when dodged_bar has single yKey', () => {
      const config: RechartsAdapterConfig = {
        id: 'dodged-single',
        data: [{ x: 'A', y: 10 }],
        chartType: 'dodged_bar',
        xKey: 'x',
        yKeys: ['y'],
      };

      const result = convertRechartsToMaidr(config);
      expect(result.subplots[0][0].layers[0].type).toBe(TraceType.BAR);
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

    it('falls back to BAR type when normalized_bar has single yKey', () => {
      const config: RechartsAdapterConfig = {
        id: 'normalized-single',
        data: [{ x: 'A', y: 10 }],
        chartType: 'normalized_bar',
        xKey: 'x',
        yKeys: ['y'],
      };

      const result = convertRechartsToMaidr(config);
      expect(result.subplots[0][0].layers[0].type).toBe(TraceType.BAR);
    });
  });

  describe('dot plot', () => {
    const dotConfig: RechartsAdapterConfig = {
      id: 'dot',
      title: 'Median Pay by Role',
      data: [
        { role: 'Nurse', pay: 62 },
        { role: 'Teacher', pay: 54 },
      ],
      chartType: 'dot',
      xKey: 'role',
      yKeys: ['pay'],
      xLabel: 'Role',
      yLabel: 'Median pay ($k)',
    };

    it('converts dot data to BarPoint[] with the category x kept as a string', () => {
      const layer = convertRechartsToMaidr(dotConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.DOT);

      // BarPoint, not ScatterPoint: a Cleveland dot plot's x is a category
      // label, which the scatter converter would coerce to 0.
      const data = layer.data as BarPoint[];
      expect(data).toEqual([
        { x: 'Nurse', y: 62 },
        { x: 'Teacher', y: 54 },
      ]);
    });

    it('targets the scatter symbols', () => {
      const layer = convertRechartsToMaidr(dotConfig).subplots[0][0].layers[0];

      expect(layer.selectors).toBe(
        '#maidr-article-dot .recharts-scatter-symbol .recharts-symbols',
      );
    });

    it('emits an orientation, defaulting to vertical', () => {
      const vertical = convertRechartsToMaidr(dotConfig).subplots[0][0].layers[0];
      expect(vertical.orientation).toBe(Orientation.VERTICAL);

      const horizontal = convertRechartsToMaidr({
        ...dotConfig,
        orientation: Orientation.HORIZONTAL,
      }).subplots[0][0].layers[0];
      expect(horizontal.orientation).toBe(Orientation.HORIZONTAL);
    });
  });

  describe('lollipop chart', () => {
    const lollipopConfig: RechartsAdapterConfig = {
      id: 'lollipop',
      data: [
        { country: 'Japan', share: 12 },
        { country: 'Brazil', share: 8 },
      ],
      chartType: 'lollipop',
      xKey: 'country',
      yKeys: ['share'],
    };

    it('converts lollipop data to BarPoint[]', () => {
      const layer = convertRechartsToMaidr(lollipopConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.LOLLIPOP);
      expect(layer.orientation).toBe(Orientation.VERTICAL);

      const data = layer.data as BarPoint[];
      expect(data).toEqual([
        { x: 'Japan', y: 12 },
        { x: 'Brazil', y: 8 },
      ]);
    });

    it('targets the scatter head rather than the bar stem', () => {
      const layer = convertRechartsToMaidr(lollipopConfig).subplots[0][0].layers[0];

      expect(layer.selectors).toBe(
        '#maidr-article-lollipop .recharts-scatter-symbol .recharts-symbols',
      );
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

    it('preserves string x-axis values for line charts', () => {
      const config: RechartsAdapterConfig = {
        id: 'line-string-x',
        data: [
          { month: 'Jan', value: 10 },
          { month: 'Feb', value: 20 },
        ],
        chartType: 'line',
        xKey: 'month',
        yKeys: ['value'],
      };

      const result = convertRechartsToMaidr(config);
      const data = result.subplots[0][0].layers[0].data as LinePoint[][];

      expect(data[0][0]).toEqual({ x: 'Jan', y: 10 });
      expect(data[0][1]).toEqual({ x: 'Feb', y: 20 });
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
      expect(data[0][0]).toEqual({ x: 1, y: 10, z: 's1' });
      expect(data[1][0]).toEqual({ x: 1, y: 20, z: 's2' });
    });

    it('preserves string x-axis values in multi-series line charts', () => {
      const config: RechartsAdapterConfig = {
        id: 'multi-line-string',
        data: [
          { month: 'Jan', s1: 10, s2: 20 },
          { month: 'Feb', s1: 15, s2: 25 },
        ],
        chartType: 'line',
        xKey: 'month',
        yKeys: ['s1', 's2'],
      };

      const result = convertRechartsToMaidr(config);
      const data = result.subplots[0][0].layers[0].data as LinePoint[][];

      expect(data[0][0].x).toBe('Jan');
      expect(data[1][0].x).toBe('Jan');
    });

    it('returns undefined selectors for multi-series line', () => {
      const config: RechartsAdapterConfig = {
        id: 'multi-line',
        data: [
          { x: 1, s1: 10, s2: 20 },
        ],
        chartType: 'line',
        xKey: 'x',
        yKeys: ['s1', 's2'],
      };

      const result = convertRechartsToMaidr(config);
      const selectors = result.subplots[0][0].layers[0].selectors;

      // Multi-series selectors are omitted (undefined) because CSS
      // cannot reliably distinguish series in Recharts SVG
      expect(selectors).toBeUndefined();
    });
  });

  describe('area chart', () => {
    const areaConfig: RechartsAdapterConfig = {
      id: 'area',
      title: 'Rainfall',
      data: [
        { month: 'Jan', mm: 80 },
        { month: 'Feb', mm: 65 },
      ],
      chartType: 'area',
      xKey: 'month',
      yKeys: ['mm'],
      xLabel: 'Month',
      yLabel: 'Rainfall (mm)',
    };

    it('converts single series area data to LinePoint[][]', () => {
      const layer = convertRechartsToMaidr(areaConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.AREA);

      const data = layer.data as LinePoint[][];
      expect(data).toEqual([[
        { x: 'Jan', y: 80 },
        { x: 'Feb', y: 65 },
      ]]);
    });

    it('targets the area dots, as a string[] like every line-family layer', () => {
      const layer = convertRechartsToMaidr(areaConfig).subplots[0][0].layers[0];

      expect(layer.selectors).toEqual([
        '#maidr-article-area .recharts-area-dots .recharts-area-dot',
      ]);
    });

    it('converts multi-series area data to one row per series', () => {
      const layer = convertRechartsToMaidr({
        ...areaConfig,
        data: [{ month: 'Jan', organic: 40, paid: 20 }],
        yKeys: ['organic', 'paid'],
      }).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.AREA);

      const data = layer.data as LinePoint[][];
      expect(data).toEqual([
        [{ x: 'Jan', y: 40, z: 'organic' }],
        [{ x: 'Jan', y: 20, z: 'paid' }],
      ]);
    });
  });

  describe('stacked area chart', () => {
    const stackedAreaConfig: RechartsAdapterConfig = {
      id: 'stacked-area',
      data: [
        { month: 'Jan', organic: 40, paid: 20 },
        { month: 'Feb', organic: 55, paid: 15 },
      ],
      chartType: 'stacked_area',
      xKey: 'month',
      yKeys: ['organic', 'paid'],
    };

    it('passes each band\'s own value, never the accumulated edge', () => {
      const layer = convertRechartsToMaidr(stackedAreaConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.STACKED_AREA);

      // AreaTrace sums the series itself, so the second band carries 20/15
      // rather than the 60/70 the chart draws its top edge at.
      const data = layer.data as LinePoint[][];
      expect(data).toEqual([
        [{ x: 'Jan', y: 40, z: 'organic' }, { x: 'Feb', y: 55, z: 'organic' }],
        [{ x: 'Jan', y: 20, z: 'paid' }, { x: 'Feb', y: 15, z: 'paid' }],
      ]);
    });

    it('produces NORMALIZED_AREA for a 100% stacked area', () => {
      const layer = convertRechartsToMaidr({
        ...stackedAreaConfig,
        chartType: 'normalized_area',
      }).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.NORMALIZED_AREA);

      // Raw values, not the expanded fractions Recharts renders.
      const data = layer.data as LinePoint[][];
      expect(data[0][0]).toEqual({ x: 'Jan', y: 40, z: 'organic' });
    });

    it('falls back to AREA when a stacked area has a single yKey', () => {
      const layer = convertRechartsToMaidr({
        ...stackedAreaConfig,
        yKeys: ['organic'],
      }).subplots[0][0].layers[0];

      // One band is not stacked against anything: as STACKED_AREA every point
      // would announce a total equal to its own value and a 100% share.
      expect(layer.type).toBe(TraceType.AREA);
    });

    it('falls back to AREA when a normalized area has a single yKey', () => {
      const layer = convertRechartsToMaidr({
        ...stackedAreaConfig,
        chartType: 'normalized_area',
        yKeys: ['organic'],
      }).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.AREA);
    });
  });

  describe('radar chart', () => {
    const radarConfig: RechartsAdapterConfig = {
      id: 'radar',
      title: 'Player Attributes',
      data: [
        { attribute: 'Speed', alice: 90, bob: 70 },
        { attribute: 'Power', alice: 60, bob: 85 },
      ],
      chartType: 'radar',
      xKey: 'attribute',
      yKeys: ['alice', 'bob'],
    };

    it('converts radar data to one row per series and one column per spoke', () => {
      const layer = convertRechartsToMaidr(radarConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.RADAR);

      const data = layer.data as LinePoint[][];
      expect(data).toEqual([
        [{ x: 'Speed', y: 90, z: 'alice' }, { x: 'Power', y: 60, z: 'alice' }],
        [{ x: 'Speed', y: 70, z: 'bob' }, { x: 'Power', y: 85, z: 'bob' }],
      ]);
    });

    it('targets the radar dots for a single series', () => {
      const layer = convertRechartsToMaidr({
        ...radarConfig,
        yKeys: ['alice'],
      }).subplots[0][0].layers[0];

      expect(layer.selectors).toEqual([
        '#maidr-article-radar .recharts-radar-dots .recharts-radar-dot',
      ]);
    });

    it('never emits an orientation, even when the config sets one', () => {
      const layer = convertRechartsToMaidr({
        ...radarConfig,
        yKeys: ['alice'],
        orientation: Orientation.HORIZONTAL,
      }).subplots[0][0].layers[0];

      // Spokes sit around a circle, not along an axis — same as a pie.
      expect(layer.orientation).toBeUndefined();
    });
  });

  describe('bump chart', () => {
    const bumpConfig: RechartsAdapterConfig = {
      id: 'bump',
      title: 'League Position by Matchday',
      data: [
        { matchday: 1, arsenal: 3, chelsea: 1 },
        { matchday: 2, arsenal: 1, chelsea: 2 },
      ],
      chartType: 'bump',
      xKey: 'matchday',
      yKeys: ['arsenal', 'chelsea'],
      xLabel: 'Matchday',
      yLabel: 'Position',
    };

    it('passes the ranks through verbatim, one row per competitor', () => {
      const layer = convertRechartsToMaidr(bumpConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.BUMP);

      // BumpTrace derives the best/worst rank and the per-period moves from
      // these numbers, so the adapter must not pre-compute either.
      const data = layer.data as LinePoint[][];
      expect(data).toEqual([
        [{ x: 1, y: 3, z: 'arsenal' }, { x: 2, y: 1, z: 'arsenal' }],
        [{ x: 1, y: 1, z: 'chelsea' }, { x: 2, y: 2, z: 'chelsea' }],
      ]);
    });

    it('targets the line dots for a single series', () => {
      const layer = convertRechartsToMaidr({
        ...bumpConfig,
        yKeys: ['arsenal'],
      }).subplots[0][0].layers[0];

      expect(layer.selectors).toEqual([
        '#maidr-article-bump .recharts-line-dots .recharts-line-dot',
      ]);
    });

    it('omits selectors for a multi-series bump chart', () => {
      const layer = convertRechartsToMaidr(bumpConfig).subplots[0][0].layers[0];

      // The line-family limitation: CSS cannot pick one competitor's dots
      // out of the surface, so highlighting degrades rather than misaligns.
      expect(layer.selectors).toBeUndefined();
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
    const pieConfig: RechartsAdapterConfig = {
      id: 'fruit',
      title: 'Fruit Sales',
      data: [
        { fruit: 'Apples', units: 30 },
        { fruit: 'Bananas', units: 50 },
        { fruit: 'Cherries', units: 20 },
      ],
      chartType: 'pie',
      xKey: 'fruit',
      yKeys: ['units'],
      xLabel: 'Fruit',
      yLabel: 'Units',
    };

    it('converts pie data to a flat PiePoint[]', () => {
      const layer = convertRechartsToMaidr(pieConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.PIE);
      expect(layer.axes?.x).toEqual({ label: 'Fruit' });
      expect(layer.axes?.y).toEqual({ label: 'Units' });

      // Flat, never nested: PieTrace wraps the slices into its single row itself.
      const data = layer.data as PiePoint[];
      expect(data).toEqual([
        { x: 'Apples', y: 30 },
        { x: 'Bananas', y: 50 },
        { x: 'Cherries', y: 20 },
      ]);
    });

    it('targets the sector paths, in slice order', () => {
      const layer = convertRechartsToMaidr(pieConfig).subplots[0][0].layers[0];

      expect(layer.selectors).toBe(
        '#maidr-article-fruit .recharts-pie-sector .recharts-sector',
      );
    });

    it('never emits an orientation, even when the config sets one', () => {
      const layer = convertRechartsToMaidr({
        ...pieConfig,
        orientation: Orientation.HORIZONTAL,
      }).subplots[0][0].layers[0];

      expect(layer.orientation).toBeUndefined();
    });

    it('carries no percentage on the wire (the model derives it)', () => {
      const layer = convertRechartsToMaidr(pieConfig).subplots[0][0].layers[0];

      for (const point of layer.data as PiePoint[]) {
        expect(point).not.toHaveProperty('percentage');
      }
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

    it('wraps an area layer\'s selector in an array, as it does a line\'s', () => {
      const config: RechartsAdapterConfig = {
        id: 'composed-area',
        data: [{ month: 'Jan', revenue: 100, budget: 90 }],
        xKey: 'month',
        layers: [
          { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
          { yKey: 'budget', chartType: 'area', name: 'Budget' },
        ],
      };

      const layers = convertRechartsToMaidr(config).subplots[0][0].layers;

      expect(layers[1].type).toBe(TraceType.AREA);
      expect(layers[1].selectors).toEqual([
        '#maidr-article-composed-area .recharts-area-dots .recharts-area-dot',
      ]);
      expect(layers[1].data).toEqual([[{ x: 'Jan', y: 90 }]]);
    });

    it('returns undefined selectors for multiple same-type layers', () => {
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

      // First bar has seriesIndex 0 → getRechartsSelector returns undefined
      // Second bar has seriesIndex 1 → also undefined
      // (CSS cannot reliably distinguish series in Recharts)
      expect(layers[0].selectors).toBeUndefined();
      expect(layers[1].selectors).toBeUndefined();
    });

    it('returns selector for single-occurrence chart types in composed mode', () => {
      const config: RechartsAdapterConfig = {
        id: 'composed',
        data: [{ x: 'A', y1: 10, y2: 20 }],
        xKey: 'x',
        layers: [
          { yKey: 'y1', chartType: 'bar', name: 'Bar' },
          { yKey: 'y2', chartType: 'line', name: 'Line' },
        ],
      };

      const result = convertRechartsToMaidr(config);
      const layers = result.subplots[0][0].layers;

      // Each type appears only once, so no seriesIndex is passed and
      // getRechartsSelector returns the CSS selector for highlighting,
      // scoped to this chart's own article wrapper.
      expect(layers[0].selectors).toBe('#maidr-article-composed .recharts-bar-rectangle .recharts-rectangle');
      expect(layers[1].selectors).toEqual(['#maidr-article-composed .recharts-line-dots .recharts-line-dot']);
    });
  });

  describe('selectorOverride', () => {
    it('uses selectorOverride for simple bar chart', () => {
      const config: RechartsAdapterConfig = {
        id: 'override',
        data: [{ x: 'A', y: 10 }],
        chartType: 'bar',
        xKey: 'x',
        yKeys: ['y'],
        selectorOverride: '.custom-bar',
      };

      const result = convertRechartsToMaidr(config);
      expect(result.subplots[0][0].layers[0].selectors).toBe('.custom-bar');
    });

    it('uses selectorOverride for multi-series bar chart', () => {
      const config: RechartsAdapterConfig = {
        id: 'override-multi',
        data: [{ x: 'A', s1: 10, s2: 20 }],
        chartType: 'bar',
        xKey: 'x',
        yKeys: ['s1', 's2'],
        selectorOverride: '.custom-bar',
      };

      const result = convertRechartsToMaidr(config);
      const layers = result.subplots[0][0].layers;

      expect(layers[0].selectors).toBe('.custom-bar');
      expect(layers[1].selectors).toBe('.custom-bar');
    });

    it('uses selectorOverride for segmented bar chart', () => {
      const config: RechartsAdapterConfig = {
        id: 'override-stacked',
        data: [{ x: 'A', s1: 10, s2: 20 }],
        chartType: 'stacked_bar',
        xKey: 'x',
        yKeys: ['s1', 's2'],
        selectorOverride: '.custom-stacked',
      };

      const result = convertRechartsToMaidr(config);
      expect(result.subplots[0][0].layers[0].selectors).toBe('.custom-stacked');
    });

    it('uses selectorOverride for histogram', () => {
      const config: RechartsAdapterConfig = {
        id: 'override-hist',
        data: [{ bin: 'A', count: 5 }],
        chartType: 'histogram',
        xKey: 'bin',
        yKeys: ['count'],
        selectorOverride: '.custom-hist',
      };

      const result = convertRechartsToMaidr(config);
      expect(result.subplots[0][0].layers[0].selectors).toBe('.custom-hist');
    });

    it('uses selectorOverride for multi-series line chart', () => {
      const config: RechartsAdapterConfig = {
        id: 'override-line',
        data: [{ x: 1, s1: 10, s2: 20 }],
        chartType: 'line',
        xKey: 'x',
        yKeys: ['s1', 's2'],
        selectorOverride: '.custom-line',
      };

      const result = convertRechartsToMaidr(config);
      const selectors = result.subplots[0][0].layers[0].selectors;
      expect(selectors).toEqual(['.custom-line', '.custom-line']);
    });

    it('uses selectorOverride in composed mode', () => {
      const config: RechartsAdapterConfig = {
        id: 'override-composed',
        data: [{ x: 'A', y1: 10, y2: 20 }],
        xKey: 'x',
        layers: [
          { yKey: 'y1', chartType: 'bar', name: 'Bar' },
          { yKey: 'y2', chartType: 'line', name: 'Line' },
        ],
        selectorOverride: '.custom-selector',
      };

      const result = convertRechartsToMaidr(config);
      const layers = result.subplots[0][0].layers;

      expect(layers[0].selectors).toBe('.custom-selector');
      // Line layers wrap selectors in an array (LineTrace expects string[])
      expect(layers[1].selectors).toEqual(['.custom-selector']);
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
    it('coerces string numbers to numbers for scatter', () => {
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
