import type { RechartsAdapterConfig } from '@adapters/recharts/types';
import type { BarPoint, DumbbellData, ErrorBarPoint, FlowPoint, ForestPoint, GanttData, GaugePoint, HistogramPoint, LinePoint, PiePoint, ScatterPoint, SegmentedPoint, SurvivalPoint, TreemapPoint, VolcanoPoint, WaterfallPoint } from '@type/grammar';
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

  describe('diverging bar chart', () => {
    const pyramidConfig: RechartsAdapterConfig = {
      id: 'pyramid',
      title: 'Population by Age Band',
      data: [
        { band: '0-9', men: -2100, women: 2000 },
        { band: '10-19', men: -1900, women: 1850 },
      ],
      chartType: 'diverging_bar',
      xKey: 'band',
      yKeys: ['men', 'women'],
      fillKeys: ['Men', 'Women'],
      orientation: Orientation.HORIZONTAL,
      xLabel: 'Age band',
      yLabel: 'People',
    };

    it('produces DIVERGING trace type with the bar selector', () => {
      const result = convertRechartsToMaidr(pyramidConfig);

      const layer = result.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.DIVERGING);
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      expect(layer.selectors).toBe('#maidr-article-pyramid .recharts-bar-rectangle .recharts-rectangle');
    });

    it('keeps the sides in declaration order, signs and all', () => {
      const result = convertRechartsToMaidr(pyramidConfig);

      // DivergingTrace reads the sides in DECLARATION order rather than the
      // reversed stacking order, and reads the sign as the SIDE — so the left
      // side must stay first and stay negative.
      const data = result.subplots[0][0].layers[0].data as SegmentedPoint[][];
      expect(data).toHaveLength(2);
      expect(data[0][0]).toEqual({ x: '0-9', y: -2100, z: 'Men' });
      expect(data[1][0]).toEqual({ x: '0-9', y: 2000, z: 'Women' });
    });

    it('falls back to BAR type when only one side is declared', () => {
      const result = convertRechartsToMaidr({
        ...pyramidConfig,
        yKeys: ['men'],
        fillKeys: undefined,
      });

      expect(result.subplots[0][0].layers[0].type).toBe(TraceType.BAR);
    });
  });

  describe('waterfall chart', () => {
    const bridgeConfig: RechartsAdapterConfig = {
      id: 'bridge',
      title: 'Revenue Bridge',
      data: [
        { step: 'Opening', change: 1200, restates: true },
        { step: 'New sales', change: 450 },
        { step: 'Churn', change: -180 },
        { step: 'Closing', restates: true },
      ],
      chartType: 'waterfall',
      xKey: 'step',
      yKeys: ['change'],
      waterfallConfig: { totalKey: 'restates' },
      xLabel: 'Step',
      yLabel: 'Revenue',
    };

    it('accumulates the running totals into absolute positions', () => {
      const result = convertRechartsToMaidr(bridgeConfig);

      const layer = result.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.WATERFALL);
      expect(layer.selectors).toBe('#maidr-article-bridge .recharts-bar-rectangle .recharts-rectangle');

      const data = layer.data as WaterfallPoint[];
      expect(data[1]).toEqual({ x: 'New sales', start: 1200, end: 1650, delta: 450, kind: 'increase' });
      expect(data[2]).toEqual({ x: 'Churn', start: 1650, end: 1470, delta: -180, kind: 'decrease' });
    });

    it('sits a restating step on the baseline', () => {
      const result = convertRechartsToMaidr(bridgeConfig);
      const data = result.subplots[0][0].layers[0].data as WaterfallPoint[];

      // The opening declares its own total; the closing carries no number and
      // restates what the steps came to.
      expect(data[0]).toEqual({ x: 'Opening', start: 0, end: 1200, delta: 1200, kind: 'total' });
      expect(data[3]).toEqual({ x: 'Closing', start: 0, end: 1470, delta: 1470, kind: 'total' });
    });

    it('marks restating steps by index when the data carries no flag', () => {
      const result = convertRechartsToMaidr({
        ...bridgeConfig,
        data: [
          { step: 'Opening', change: 1200 },
          { step: 'New sales', change: 450 },
        ],
        waterfallConfig: { totalIndices: [0] },
      });

      const data = result.subplots[0][0].layers[0].data as WaterfallPoint[];
      expect(data[0].kind).toBe('total');
      expect(data[1].kind).toBe('increase');
    });

    it('reads the kind outright when the data names it', () => {
      const result = convertRechartsToMaidr({
        ...bridgeConfig,
        data: [
          { step: 'Opening', change: 1200, how: 'total' },
          { step: 'Rebate', change: 0, how: 'decrease' },
        ],
        waterfallConfig: { kindKey: 'how' },
      });

      const data = result.subplots[0][0].layers[0].data as WaterfallPoint[];
      expect(data[0].kind).toBe('total');
      // A zero-width step reads from the sign as an increase; the declared
      // kind is what the chart drew.
      expect(data[1].kind).toBe('decrease');
    });

    it('carries no orientation', () => {
      const result = convertRechartsToMaidr({
        ...bridgeConfig,
        orientation: Orientation.HORIZONTAL,
      });

      expect(result.subplots[0][0].layers[0].orientation).toBeUndefined();
    });
  });

  describe('dumbbell chart', () => {
    const dumbbellConfig: RechartsAdapterConfig = {
      id: 'life',
      title: 'Life Expectancy',
      data: [
        { country: 'Japan', then: 78.9, now: 84.6 },
        { country: 'Russia', then: 69.2, now: 68.9 },
      ],
      chartType: 'dumbbell',
      xKey: 'country',
      yKeys: ['then', 'now'],
      fillKeys: ['1990', '2020'],
      xLabel: 'Country',
      yLabel: 'Years',
    };

    it('produces a DumbbellData object rather than an array', () => {
      const result = convertRechartsToMaidr(dumbbellConfig);

      const layer = result.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.DUMBBELL);
      expect(layer.selectors).toBe('#maidr-article-life .recharts-bar-rectangle .recharts-rectangle');

      const data = layer.data as DumbbellData;
      expect(Array.isArray(data)).toBe(false);
      expect(data.points).toHaveLength(2);
      // Both directions in one chart: Russia's end sits below its start.
      expect(data.points[0]).toEqual({ x: 'Japan', start: 78.9, end: 84.6 });
      expect(data.points[1]).toEqual({ x: 'Russia', start: 69.2, end: 68.9 });
    });

    it('names the two ends from fillKeys', () => {
      const result = convertRechartsToMaidr(dumbbellConfig);
      const data = result.subplots[0][0].layers[0].data as DumbbellData;

      expect(data.startLabel).toBe('1990');
      expect(data.endLabel).toBe('2020');
    });

    it('leaves the ends unnamed when fillKeys is omitted', () => {
      const result = convertRechartsToMaidr({ ...dumbbellConfig, fillKeys: undefined });
      const data = result.subplots[0][0].layers[0].data as DumbbellData;

      expect(data.startLabel).toBeUndefined();
      expect(data.endLabel).toBeUndefined();
    });

    it('throws when only one end is declared', () => {
      expect(() => convertRechartsToMaidr({
        ...dumbbellConfig,
        yKeys: ['then'],
      })).toThrow('RechartsAdapter');
    });
  });

  describe('gantt chart', () => {
    const planConfig: RechartsAdapterConfig = {
      id: 'plan',
      title: 'Release Plan',
      data: [
        { task: 'Design', from: 0, to: 5, phase: 'Wireframes' },
        { task: 'Build', from: 3, to: 12, phase: 'Alpha' },
        { task: 'Build', from: 14, to: 18, phase: 'Beta' },
      ],
      chartType: 'gantt',
      xKey: 'task',
      yKeys: ['from', 'to'],
      ganttConfig: { lanes: ['Design', 'Build', 'Launch'], labelKey: 'phase', unit: 'days' },
      xLabel: 'Task',
      yLabel: 'Day',
    };

    it('nests the intervals by lane and keeps the empty lane', () => {
      const result = convertRechartsToMaidr(planConfig);

      const layer = result.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.GANTT);
      // A gantt's bars run left to right, which puts the lanes on y.
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);

      const data = layer.data as GanttData;
      expect(data.points).toHaveLength(3);
      expect(data.points[0]).toEqual([{ x: 'Design', start: 0, end: 5, label: 'Wireframes' }]);
      expect(data.points[1]).toHaveLength(2);
      // Nothing booked in Launch — the row exists so the schedule can say so.
      expect(data.points[2]).toEqual([]);
      expect(data.lanes).toEqual(['Design', 'Build', 'Launch']);
      expect(data.unit).toBe('days');
    });

    it('highlights when the rows are already grouped by lane', () => {
      const result = convertRechartsToMaidr(planConfig);

      expect(result.subplots[0][0].layers[0].selectors)
        .toBe('#maidr-article-plan .recharts-bar-rectangle .recharts-rectangle');
    });

    it('drops the selector when the rows interleave lanes', () => {
      // Recharts draws one rectangle per ROW while GanttTrace walks its
      // selectors lane by lane, so interleaved rows would highlight the wrong
      // task rather than none.
      const result = convertRechartsToMaidr({
        ...planConfig,
        data: [
          { task: 'Design', from: 0, to: 5 },
          { task: 'Build', from: 3, to: 12 },
          { task: 'Design', from: 8, to: 9 },
        ],
      });

      expect(result.subplots[0][0].layers[0].selectors).toBeUndefined();
    });

    it('derives the lanes from the data when none are declared', () => {
      const result = convertRechartsToMaidr({
        ...planConfig,
        ganttConfig: undefined,
      });

      const data = result.subplots[0][0].layers[0].data as GanttData;
      expect(data.lanes).toEqual(['Design', 'Build']);
      expect(data.unit).toBeUndefined();
      expect(data.points[0][0].label).toBeUndefined();
    });

    it('appends a lane the data names but the config omits', () => {
      const result = convertRechartsToMaidr({
        ...planConfig,
        ganttConfig: { lanes: ['Design'] },
      });

      const data = result.subplots[0][0].layers[0].data as GanttData;
      expect(data.lanes).toEqual(['Design', 'Build']);
      expect(data.points[1]).toHaveLength(2);
    });

    it('throws when only one end of the interval is declared', () => {
      expect(() => convertRechartsToMaidr({
        ...planConfig,
        yKeys: ['from'],
      })).toThrow('RechartsAdapter');
    });
  });

  describe('gauge chart', () => {
    const gaugeConfig: RechartsAdapterConfig = {
      id: 'nps',
      title: 'Net Promoter Score',
      data: [{ measure: 'NPS', score: 73 }],
      chartType: 'gauge',
      xKey: 'measure',
      yKeys: ['score'],
      gaugeConfig: {
        min: 0,
        max: 100,
        target: 80,
        bands: [{ to: 40, label: 'poor' }, { to: 70, label: 'ok' }, { to: 100, label: 'good' }],
      },
    };

    it('produces a single GaugePoint object with its range', () => {
      const result = convertRechartsToMaidr(gaugeConfig);

      const layer = result.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.GAUGE);
      expect(layer.selectors)
        .toBe('#maidr-article-nps .recharts-radial-bar-sectors .recharts-radial-bar-sector');
      expect(layer.orientation).toBeUndefined();

      const data = layer.data as GaugePoint;
      expect(Array.isArray(data)).toBe(false);
      expect(data).toEqual({
        value: 73,
        min: 0,
        max: 100,
        label: 'NPS',
        target: 80,
        bands: [{ to: 40, label: 'poor' }, { to: 70, label: 'ok' }, { to: 100, label: 'good' }],
      });
    });

    it('omits the target and bands the chart does not declare', () => {
      const result = convertRechartsToMaidr({
        ...gaugeConfig,
        gaugeConfig: { min: 0, max: 100 },
      });

      const data = result.subplots[0][0].layers[0].data as GaugePoint;
      expect(data.target).toBeUndefined();
      expect(data.bands).toBeUndefined();
    });

    it('prefers a declared label over the xKey value', () => {
      const result = convertRechartsToMaidr({
        ...gaugeConfig,
        gaugeConfig: { min: 0, max: 100, label: 'Promoter score' },
      });

      const data = result.subplots[0][0].layers[0].data as GaugePoint;
      expect(data.label).toBe('Promoter score');
    });

    it('throws when the range is not declared', () => {
      expect(() => convertRechartsToMaidr({
        ...gaugeConfig,
        gaugeConfig: undefined,
      })).toThrow('RechartsAdapter');
    });
  });

  describe('treemap and sunburst', () => {
    const hierarchyConfig: RechartsAdapterConfig = {
      id: 'regions',
      title: 'Population by Region',
      data: [
        {
          name: 'Europe',
          people: 999,
          children: [{ name: 'France', people: 67.4 }, { name: 'Spain', people: 47.4 }],
        },
        { name: 'Oceania', children: [{ name: 'Fiji', people: 0.9 }] },
      ],
      chartType: 'treemap',
      xKey: 'name',
      yKeys: ['people'],
    };

    it('flattens the hierarchy depth-first, ancestors named', () => {
      const result = convertRechartsToMaidr(hierarchyConfig);

      const layer = result.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.TREEMAP);

      const data = layer.data as TreemapPoint[];
      expect(data).toEqual([
        { x: 'Europe' },
        { x: 'France', path: ['Europe'], y: 67.4 },
        { x: 'Spain', path: ['Europe'], y: 47.4 },
        { x: 'Oceania' },
        { x: 'Fiji', path: ['Oceania'], y: 0.9 },
      ]);
    });

    it('drops an interior node\'s declared value', () => {
      // Recharts computes an interior node's value as the sum of its children
      // and ignores any value declared on it, so passing Europe's 999 through
      // would announce a magnitude the chart never drew.
      const result = convertRechartsToMaidr(hierarchyConfig);
      const data = result.subplots[0][0].layers[0].data as TreemapPoint[];

      expect(data[0].y).toBeUndefined();
    });

    it('targets the treemap rectangles below the synthetic root', () => {
      const result = convertRechartsToMaidr(hierarchyConfig);

      expect(result.subplots[0][0].layers[0].selectors).toBe(
        '#maidr-article-regions g[class*="recharts-treemap-depth-"]:not(.recharts-treemap-depth-0) > g > g > path.recharts-rectangle',
      );
    });

    it('reads a sunburst as the same hierarchy, drawn as sectors', () => {
      const result = convertRechartsToMaidr({ ...hierarchyConfig, chartType: 'sunburst' });

      const layer = result.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.SUNBURST);
      expect(layer.selectors).toBe('#maidr-article-regions .recharts-sunburst .recharts-sector');
      expect(layer.data).toEqual(
        convertRechartsToMaidr(hierarchyConfig).subplots[0][0].layers[0].data,
      );
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

  describe('funnel chart', () => {
    const funnelConfig: RechartsAdapterConfig = {
      id: 'funnel',
      title: 'Signup Funnel',
      data: [
        { stage: 'Visited', users: 10000 },
        { stage: 'Signed up', users: 2400 },
        { stage: 'Activated', users: 2300 },
        { stage: 'Paid', users: 100 },
      ],
      chartType: 'funnel',
      xKey: 'stage',
      yKeys: ['users'],
      xLabel: 'Stage',
      yLabel: 'Users',
    };

    it('converts the stage counts to BarPoint[] in draw order', () => {
      const layer = convertRechartsToMaidr(funnelConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.FUNNEL);

      // The counts, untouched: FunnelTrace computes the retention and the
      // share it announces from them, so a pre-computed ratio here would be
      // a second source of truth for the same numbers.
      const data = layer.data as BarPoint[];
      expect(data).toEqual([
        { x: 'Visited', y: 10000 },
        { x: 'Signed up', y: 2400 },
        { x: 'Activated', y: 2300 },
        { x: 'Paid', y: 100 },
      ]);
    });

    it('targets the funnel trapezoids', () => {
      const layer = convertRechartsToMaidr(funnelConfig).subplots[0][0].layers[0];

      expect(layer.selectors).toBe(
        '#maidr-article-funnel .recharts-funnel-trapezoid .recharts-trapezoid',
      );
    });

    it('never emits an orientation, even when the config declares one', () => {
      const layer = convertRechartsToMaidr({
        ...funnelConfig,
        orientation: Orientation.HORIZONTAL,
      }).subplots[0][0].layers[0];

      // FunnelTrace is a BarTrace, and a horizontal bar reads its category
      // off `y`. The stage label is always emitted as `x`, so a leaked
      // HORIZONTAL would have every stage announced by its count.
      expect(layer.orientation).toBeUndefined();
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

  describe('survival curve', () => {
    const survivalConfig: RechartsAdapterConfig = {
      id: 'km',
      title: 'Overall Survival',
      data: [
        { months: 0, treated: 1, control: 1, treatedCensored: false },
        { months: 6, treated: 0.88, control: 0.74, treatedCensored: true },
        { months: 12, treated: 0.71, control: 0.52, treatedCensored: false },
      ],
      chartType: 'survival',
      xKey: 'months',
      yKeys: ['treated'],
      survivalConfig: { censoredKeys: ['treatedCensored'] },
      xLabel: 'Months',
      yLabel: 'Survival probability',
    };

    it('marks only the censored times', () => {
      const layer = convertRechartsToMaidr(survivalConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.SURVIVAL);

      // An ordinary time carries no flag at all: `censored: false` on every
      // other point is a claim the data never made.
      const data = layer.data as SurvivalPoint[][];
      expect(data).toEqual([[
        { x: 0, y: 1 },
        { x: 6, y: 0.88, censored: true },
        { x: 12, y: 0.71 },
      ]]);
    });

    it('carries the confidence band as absolute bounds', () => {
      const layer = convertRechartsToMaidr({
        ...survivalConfig,
        data: [
          { months: 0, treated: 1, lo: 1, hi: 1 },
          { months: 6, treated: 0.88, lo: 0.79, hi: 0.97 },
        ],
        survivalConfig: { yMinKeys: ['lo'], yMaxKeys: ['hi'] },
      }).subplots[0][0].layers[0];

      const data = layer.data as SurvivalPoint[][];
      expect(data[0][1]).toEqual({ x: 6, y: 0.88, yMin: 0.79, yMax: 0.97 });
    });

    it('declares the step direction Recharts draws', () => {
      const layer = convertRechartsToMaidr(survivalConfig).subplots[0][0].layers[0];

      // <Line type="stepAfter"> holds the value until the next time, then
      // jumps — which is exactly what a Kaplan-Meier curve means.
      expect(layer.stepDirection).toBe('hv');

      const stepBefore = convertRechartsToMaidr({
        ...survivalConfig,
        survivalConfig: { stepDirection: 'vh' },
      }).subplots[0][0].layers[0];
      expect(stepBefore.stepDirection).toBe('vh');
    });

    it('targets the line dots for a single arm', () => {
      const layer = convertRechartsToMaidr(survivalConfig).subplots[0][0].layers[0];

      // A SurvivalTrace is a LineTrace: selectors are a string[], one per arm.
      expect(layer.selectors).toEqual([
        '#maidr-article-km .recharts-line-dots .recharts-line-dot',
      ]);
    });

    it('builds one row per arm, named, with highlighting off', () => {
      const layer = convertRechartsToMaidr({
        ...survivalConfig,
        yKeys: ['treated', 'control'],
        fillKeys: ['Treatment', 'Control'],
        survivalConfig: { censoredKeys: ['treatedCensored'] },
      }).subplots[0][0].layers[0];

      const data = layer.data as SurvivalPoint[][];
      expect(data).toHaveLength(2);
      expect(data[0][1]).toEqual({ x: 6, y: 0.88, z: 'Treatment', censored: true });
      // The second arm declares no censoring key of its own, so it gets none.
      expect(data[1][1]).toEqual({ x: 6, y: 0.74, z: 'Control' });
      expect(layer.selectors).toBeUndefined();
    });

    it('splats a selectorOverride across the arms', () => {
      const layer = convertRechartsToMaidr({
        ...survivalConfig,
        yKeys: ['treated', 'control'],
        selectorOverride: '.km .recharts-line-dot',
      }).subplots[0][0].layers[0];

      expect(layer.selectors).toEqual([
        '.km .recharts-line-dot',
        '.km .recharts-line-dot',
      ]);
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

  describe('volcano plot', () => {
    const volcanoConfig: RechartsAdapterConfig = {
      id: 'volcano',
      title: 'Differential Expression',
      data: [
        { gene: 'TP53', log2fc: 2.4, negLog10P: 14.1 },
        { gene: 'MYC', log2fc: -0.3, negLog10P: 0.8 },
      ],
      chartType: 'volcano',
      xKey: 'log2fc',
      yKeys: ['negLog10P'],
      volcanoConfig: { labelKey: 'gene', significance: 1.3, effect: 1 },
      xLabel: 'log2 fold change',
      yLabel: '-log10(p)',
    };

    it('carries the point labels alongside the coordinates', () => {
      const layer = convertRechartsToMaidr(volcanoConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.VOLCANO);

      const data = layer.data as VolcanoPoint[];
      expect(data).toEqual([
        { x: 2.4, y: 14.1, label: 'TP53' },
        { x: -0.3, y: 0.8, label: 'MYC' },
      ]);
    });

    it('emits the declared cutoffs as thresholdOptions', () => {
      const layer = convertRechartsToMaidr(volcanoConfig).subplots[0][0].layers[0];

      expect(layer.thresholdOptions).toEqual({ significance: 1.3, effect: 1 });
    });

    it('omits thresholdOptions entirely when no cutoff is declared', () => {
      const layer = convertRechartsToMaidr({
        ...volcanoConfig,
        volcanoConfig: { labelKey: 'gene' },
      }).subplots[0][0].layers[0];

      // A guessed cutoff sorts every point onto the wrong side silently, so
      // an undeclared one stays undeclared.
      expect(layer.thresholdOptions).toBeUndefined();
    });

    it('targets the scatter symbols', () => {
      const layer = convertRechartsToMaidr(volcanoConfig).subplots[0][0].layers[0];

      expect(layer.selectors).toBe(
        '#maidr-article-volcano .recharts-scatter-symbol .recharts-symbols',
      );
    });
  });

  describe('manhattan plot', () => {
    const manhattanConfig: RechartsAdapterConfig = {
      id: 'gwas',
      title: 'Genome-Wide Association',
      data: [
        { snp: 'rs1234', chr: '1', bp: 154_300, cumulative: 154_300, negLog10P: 9.2 },
        { snp: 'rs5678', chr: '2', bp: 88_120, cumulative: 249_388_120, negLog10P: 3.1 },
      ],
      chartType: 'manhattan',
      // The per-chromosome position, NOT the cumulative offset the chart
      // plots: "position 249,388,120" answers nothing a reader asked.
      xKey: 'bp',
      yKeys: ['negLog10P'],
      volcanoConfig: { labelKey: 'snp', groupKey: 'chr', significance: 7.3 },
      xLabel: 'Position',
      yLabel: '-log10(p)',
    };

    it('carries the SNP and its chromosome', () => {
      const layer = convertRechartsToMaidr(manhattanConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.MANHATTAN);

      const data = layer.data as VolcanoPoint[];
      expect(data).toEqual([
        { x: 154_300, y: 9.2, label: 'rs1234', group: '1' },
        { x: 88_120, y: 3.1, label: 'rs5678', group: '2' },
      ]);
    });

    it('emits the genome-wide significance line', () => {
      const layer = convertRechartsToMaidr(manhattanConfig).subplots[0][0].layers[0];

      expect(layer.thresholdOptions?.significance).toBe(7.3);
    });
  });

  describe('error bars', () => {
    const errorConfig: RechartsAdapterConfig = {
      id: 'yield',
      title: 'Yield by Treatment',
      data: [
        { treatment: 'Control', mean: 4.2, sd: 0.6 },
        { treatment: 'Nitrogen', mean: 5.5, sd: 0.5 },
      ],
      chartType: 'error_bar',
      xKey: 'treatment',
      yKeys: ['mean'],
      errorConfig: { errorKey: 'sd' },
      xLabel: 'Treatment',
      yLabel: 'Yield (t/ha)',
    };

    it('resolves a symmetric offset to absolute bounds', () => {
      const layer = convertRechartsToMaidr(errorConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.ERROR_BAR);

      // <ErrorBar dataKey="sd"> is an offset; ErrorBarPoint fixes absolute
      // positions on the value axis, which is the same arithmetic Recharts
      // does to place the whiskers.
      const data = layer.data as ErrorBarPoint[];
      expect(data).toEqual([
        { x: 'Control', y: 4.2, yMin: 3.6, yMax: 4.8 },
        { x: 'Nitrogen', y: 5.5, yMin: 5, yMax: 6 },
      ]);
    });

    it('reads a [lower, upper] pair as an asymmetric offset', () => {
      const layer = convertRechartsToMaidr({
        ...errorConfig,
        data: [{ treatment: 'Control', mean: 10, err: [2, 5] }],
        errorConfig: { errorKey: 'err' },
      }).subplots[0][0].layers[0];

      // Recharts reads the field the same way: value - low, value + high.
      const data = layer.data as ErrorBarPoint[];
      expect(data[0]).toEqual({ x: 'Control', y: 10, yMin: 8, yMax: 15 });
    });

    it('takes absolute bounds straight from the data when declared', () => {
      const layer = convertRechartsToMaidr({
        ...errorConfig,
        data: [{ treatment: 'Control', mean: 4.2, lo: 3.1, hi: 5.0 }],
        errorConfig: { yMinKey: 'lo', yMaxKey: 'hi' },
      }).subplots[0][0].layers[0];

      const data = layer.data as ErrorBarPoint[];
      expect(data[0]).toEqual({ x: 'Control', y: 4.2, yMin: 3.1, yMax: 5.0 });
    });

    it('keeps a one-sided interval one-sided', () => {
      const layer = convertRechartsToMaidr({
        ...errorConfig,
        data: [{ treatment: 'Control', mean: 4.2, hi: 5.0 }],
        errorConfig: { yMaxKey: 'hi' },
      }).subplots[0][0].layers[0];

      // An upper bound with no lower is a real chart, and defaulting the
      // missing half to the estimate would draw an interval nobody measured.
      const data = layer.data as ErrorBarPoint[];
      expect(data[0]).toEqual({ x: 'Control', y: 4.2, yMax: 5.0 });
    });

    it('drops both bounds when the interval is missing', () => {
      const layer = convertRechartsToMaidr({
        ...errorConfig,
        data: [{ treatment: 'Control', mean: 4.2, sd: null }],
      }).subplots[0][0].layers[0];

      const data = layer.data as ErrorBarPoint[];
      expect(data[0]).toEqual({ x: 'Control', y: 4.2 });
    });

    it('targets the whiskers', () => {
      const layer = convertRechartsToMaidr(errorConfig).subplots[0][0].layers[0];

      // The estimate's own mark could be a bar, a line dot or a scatter
      // symbol depending on what the author nested the <ErrorBar> in; the
      // whiskers are the one element a chart of this type always draws.
      expect(layer.selectors).toBe(
        '#maidr-article-yield .recharts-errorBars .recharts-errorBar',
      );
    });
  });

  describe('forest plot', () => {
    const forestConfig: RechartsAdapterConfig = {
      id: 'meta',
      title: 'Effect of the intervention',
      data: [
        { study: 'Silva 2018', or: 0.62, lo: 0.41, hi: 0.94, weight: 0.12 },
        { study: 'Okafor 2022', or: 1.71, lo: 1.22, hi: 2.40, weight: 0.55 },
        { study: 'Pooled', or: 1.28, lo: 1.02, hi: 1.61, summary: true },
      ],
      chartType: 'forest',
      xKey: 'study',
      yKeys: ['or'],
      orientation: Orientation.HORIZONTAL,
      errorConfig: { yMinKey: 'lo', yMaxKey: 'hi' },
      forestConfig: { weightKey: 'weight', pooledKey: 'summary', nullValue: 1 },
      xLabel: 'Study',
      yLabel: 'Odds ratio',
    };

    it('converts the studies with their weights and the pooled row', () => {
      const layer = convertRechartsToMaidr(forestConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.FOREST);

      const data = layer.data as ForestPoint[];
      expect(data).toEqual([
        { x: 'Silva 2018', y: 0.62, yMin: 0.41, yMax: 0.94, weight: 0.12 },
        { x: 'Okafor 2022', y: 1.71, yMin: 1.22, yMax: 2.40, weight: 0.55 },
        { x: 'Pooled', y: 1.28, yMin: 1.02, yMax: 1.61, pooled: true },
      ]);
    });

    it('finds the pooled row by index when the data carries no flag', () => {
      const layer = convertRechartsToMaidr({
        ...forestConfig,
        forestConfig: { weightKey: 'weight', pooledIndex: 2, nullValue: 1 },
      }).subplots[0][0].layers[0];

      const data = layer.data as ForestPoint[];
      expect(data[1].pooled).toBeUndefined();
      expect(data[2].pooled).toBe(true);
    });

    it('emits the null line and keeps the row axis horizontal', () => {
      const layer = convertRechartsToMaidr(forestConfig).subplots[0][0].layers[0];

      expect(layer.forestOptions).toEqual({ nullValue: 1 });
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    });

    it('omits forestOptions when no null value is declared', () => {
      const layer = convertRechartsToMaidr({
        ...forestConfig,
        forestConfig: { weightKey: 'weight' },
      }).subplots[0][0].layers[0];

      // Guessing 0 for a ratio measure reports every study as not crossing,
      // since odds ratios are all positive.
      expect(layer.forestOptions).toBeUndefined();
    });

    it('targets the scatter symbols', () => {
      const layer = convertRechartsToMaidr(forestConfig).subplots[0][0].layers[0];

      expect(layer.selectors).toBe(
        '#maidr-article-meta .recharts-scatter-symbol .recharts-symbols',
      );
    });
  });

  describe('alluvial diagram', () => {
    const nodes = [
      { name: 'Free' },
      { name: 'Trial' },
      { name: 'Paid' },
      { name: 'Churned' },
    ];

    const alluvialConfig: RechartsAdapterConfig = {
      id: 'flow',
      title: 'Cohort Movement',
      data: [
        { source: 0, target: 1, value: 34 },
        { source: 1, target: 2, value: 21 },
        { source: 1, target: 3, value: 13 },
      ],
      chartType: 'alluvial',
      xKey: 'source',
      yKeys: ['value'],
      flowConfig: { targetKey: 'target', nodes },
      xLabel: 'Stage',
      yLabel: 'Users',
    };

    it('resolves the node indices Recharts links carry into names', () => {
      const layer = convertRechartsToMaidr(alluvialConfig).subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.ALLUVIAL);

      // "flow from 1 to 3" names neither end, and the index is a fact about
      // the nodes array rather than about the data.
      const data = layer.data as FlowPoint[];
      expect(data).toEqual([
        { source: 'Free', target: 'Trial', value: 34 },
        { source: 'Trial', target: 'Paid', value: 21 },
        { source: 'Trial', target: 'Churned', value: 13 },
      ]);
    });

    it('passes links that already name their ends through untouched', () => {
      const layer = convertRechartsToMaidr({
        ...alluvialConfig,
        data: [{ source: 'Free', target: 'Paid', value: 8 }],
        flowConfig: { targetKey: 'target' },
      }).subplots[0][0].layers[0];

      const data = layer.data as FlowPoint[];
      expect(data).toEqual([{ source: 'Free', target: 'Paid', value: 8 }]);
    });

    it('keeps an index with no node list behind it as a number', () => {
      const layer = convertRechartsToMaidr({
        ...alluvialConfig,
        flowConfig: { targetKey: 'target' },
      }).subplots[0][0].layers[0];

      const data = layer.data as FlowPoint[];
      expect(data[0]).toEqual({ source: 0, target: 1, value: 34 });
    });

    it('targets the sankey links in declared order', () => {
      const layer = convertRechartsToMaidr(alluvialConfig).subplots[0][0].layers[0];

      expect(layer.selectors).toBe(
        '#maidr-article-flow .recharts-sankey-links .recharts-sankey-link',
      );
      expect(layer.orientation).toBeUndefined();
    });

    it('throws when the flow config is missing', () => {
      expect(() => convertRechartsToMaidr({
        ...alluvialConfig,
        flowConfig: undefined,
      })).toThrow('RechartsAdapter');
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
