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

    it('returns scoped pie sector selector for pie type', () => {
      expect(getRechartsSelector('pie')).toBe('.recharts-pie-sector .recharts-sector');
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
