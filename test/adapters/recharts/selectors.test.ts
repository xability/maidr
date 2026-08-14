import { getRechartsSelector } from '@adapters/recharts/selectors';

describe('getRechartsSelector', () => {
  describe('single series (no seriesIndex)', () => {
    it('returns scoped bar rectangle selector for bar type', () => {
      expect(getRechartsSelector('bar')).toBe('.recharts-bar-rectangle .recharts-rectangle');
    });

    it('returns scoped bar rectangle selector for stacked_bar type', () => {
      expect(getRechartsSelector('stacked_bar')).toBe('.recharts-bar-rectangle .recharts-rectangle');
    });

    it('returns scoped bar rectangle selector for dodged_bar type', () => {
      expect(getRechartsSelector('dodged_bar')).toBe('.recharts-bar-rectangle .recharts-rectangle');
    });

    it('returns scoped bar rectangle selector for normalized_bar type', () => {
      expect(getRechartsSelector('normalized_bar')).toBe('.recharts-bar-rectangle .recharts-rectangle');
    });

    it('returns scoped bar rectangle selector for histogram type', () => {
      expect(getRechartsSelector('histogram')).toBe('.recharts-bar-rectangle .recharts-rectangle');
    });

    it('returns scoped line dot selector for line type', () => {
      expect(getRechartsSelector('line')).toBe('.recharts-line-dots .recharts-line-dot');
    });

    it('returns scoped area dot selector for the whole area family', () => {
      expect(getRechartsSelector('area')).toBe('.recharts-area-dots .recharts-area-dot');
      expect(getRechartsSelector('stacked_area')).toBe('.recharts-area-dots .recharts-area-dot');
      expect(getRechartsSelector('normalized_area')).toBe('.recharts-area-dots .recharts-area-dot');
    });

    it('returns scoped radar dot selector for radar type', () => {
      expect(getRechartsSelector('radar')).toBe('.recharts-radar-dots .recharts-radar-dot');
    });

    it('returns scoped line dot selector for bump type', () => {
      // A bump chart is a <LineChart> of ranks, so it draws line dots.
      expect(getRechartsSelector('bump')).toBe('.recharts-line-dots .recharts-line-dot');
    });

    it('returns scoped scatter symbol selector for scatter type', () => {
      expect(getRechartsSelector('scatter')).toBe('.recharts-scatter-symbol .recharts-symbols');
    });

    it('returns scoped scatter symbol selector for dot and lollipop types', () => {
      // Both are drawn with <Scatter>; the lollipop's stem <Bar> is not the
      // mark a reader takes the value off.
      expect(getRechartsSelector('dot')).toBe('.recharts-scatter-symbol .recharts-symbols');
      expect(getRechartsSelector('lollipop')).toBe('.recharts-scatter-symbol .recharts-symbols');
    });

    it('returns scoped line dot selector for survival type', () => {
      // A Kaplan-Meier curve is a <Line type="stepAfter">, so it draws line dots.
      expect(getRechartsSelector('survival')).toBe('.recharts-line-dots .recharts-line-dot');
    });

    it('returns scoped scatter symbol selector for volcano, manhattan and forest types', () => {
      // The first two are literally scatters; a forest plot is a
      // <ScatterChart> whose symbols carry the study weights.
      expect(getRechartsSelector('volcano')).toBe('.recharts-scatter-symbol .recharts-symbols');
      expect(getRechartsSelector('manhattan')).toBe('.recharts-scatter-symbol .recharts-symbols');
      expect(getRechartsSelector('forest')).toBe('.recharts-scatter-symbol .recharts-symbols');
    });

    it('returns scoped trapezoid selector for funnel type', () => {
      expect(getRechartsSelector('funnel')).toBe('.recharts-funnel-trapezoid .recharts-trapezoid');
    });

    it('returns scoped whisker selector for error_bar type', () => {
      // The whiskers, not the host mark: the estimate may be drawn by a bar,
      // a line dot or a scatter symbol, and only the author knows which.
      expect(getRechartsSelector('error_bar')).toBe('.recharts-errorBars .recharts-errorBar');
    });

    it('returns scoped sankey link selector for alluvial and sankey types', () => {
      // Both are drawn by the same `<Sankey>`, so both highlight its ribbons.
      expect(getRechartsSelector('alluvial')).toBe('.recharts-sankey-links .recharts-sankey-link');
      expect(getRechartsSelector('sankey')).toBe('.recharts-sankey-links .recharts-sankey-link');
    });

    it('returns scoped pie sector selector for pie and polar_area types', () => {
      // A coxcomb is a `<Pie>` of equal-angle slices with a per-datum radius,
      // so its wedges are the same sectors a pie's slices are.
      expect(getRechartsSelector('pie')).toBe('.recharts-pie-sector .recharts-sector');
      expect(getRechartsSelector('polar_area')).toBe('.recharts-pie-sector .recharts-sector');
    });

    it('returns scoped bar rectangle selector for diverging_bar type', () => {
      expect(getRechartsSelector('diverging_bar')).toBe('.recharts-bar-rectangle .recharts-rectangle');
    });

    it('returns scoped bar rectangle selector for the floating-bar types', () => {
      // A waterfall step, a gantt interval, a dumbbell connector and an icicle
      // band are each one `<Bar>` rectangle that does not start at the
      // baseline. Recharts draws no icicle of its own, so that is the recipe.
      expect(getRechartsSelector('waterfall')).toBe('.recharts-bar-rectangle .recharts-rectangle');
      expect(getRechartsSelector('gantt')).toBe('.recharts-bar-rectangle .recharts-rectangle');
      expect(getRechartsSelector('dumbbell')).toBe('.recharts-bar-rectangle .recharts-rectangle');
      expect(getRechartsSelector('icicle')).toBe('.recharts-bar-rectangle .recharts-rectangle');
    });

    it('returns scoped radial bar sector selector for gauge type', () => {
      expect(getRechartsSelector('gauge')).toBe('.recharts-radial-bar-sectors .recharts-radial-bar-sector');
    });

    it('excludes the synthetic root rectangle for treemap type', () => {
      // Recharts wraps the data array in a root node and draws it full-plot;
      // counting it would be one element more than the layer has nodes.
      expect(getRechartsSelector('treemap')).toBe(
        'g[class*="recharts-treemap-depth-"]:not(.recharts-treemap-depth-0) > g > g > path.recharts-rectangle',
      );
    });

    it('returns scoped sunburst sector selector for sunburst type', () => {
      expect(getRechartsSelector('sunburst')).toBe('.recharts-sunburst .recharts-sector');
    });
  });

  describe('multi-series (with seriesIndex)', () => {
    it('returns undefined for bar with seriesIndex', () => {
      expect(getRechartsSelector('bar', 0)).toBeUndefined();
    });

    it('returns undefined for line with seriesIndex', () => {
      expect(getRechartsSelector('line', 1)).toBeUndefined();
    });

    it('returns undefined for scatter with seriesIndex', () => {
      expect(getRechartsSelector('scatter', 0)).toBeUndefined();
    });

    it('returns undefined regardless of seriesIndex value', () => {
      expect(getRechartsSelector('bar', 2)).toBeUndefined();
      expect(getRechartsSelector('line', 5)).toBeUndefined();
    });
  });
});
