import { getRechartsSelector } from '@adapters/recharts/selectors';

describe('getRechartsSelector', () => {
  describe('single series (no seriesIndex)', () => {
    it('returns bar rectangle selector for bar type', () => {
      expect(getRechartsSelector('bar')).toBe('.recharts-bar-rectangle');
    });

    it('returns bar rectangle selector for stacked_bar type', () => {
      expect(getRechartsSelector('stacked_bar')).toBe('.recharts-bar-rectangle');
    });

    it('returns bar rectangle selector for dodged_bar type', () => {
      expect(getRechartsSelector('dodged_bar')).toBe('.recharts-bar-rectangle');
    });

    it('returns bar rectangle selector for normalized_bar type', () => {
      expect(getRechartsSelector('normalized_bar')).toBe('.recharts-bar-rectangle');
    });

    it('returns bar rectangle selector for histogram type', () => {
      expect(getRechartsSelector('histogram')).toBe('.recharts-bar-rectangle');
    });

    it('returns line dot selector for line type', () => {
      expect(getRechartsSelector('line')).toBe('.recharts-line-dot');
    });

    it('returns area dot selector for area type', () => {
      expect(getRechartsSelector('area')).toBe('.recharts-area-dot');
    });

    it('returns scatter symbol selector for scatter type', () => {
      expect(getRechartsSelector('scatter')).toBe('.recharts-scatter-symbol');
    });

    it('returns pie sector selector for pie type', () => {
      expect(getRechartsSelector('pie')).toBe('.recharts-pie-sector');
    });

    it('returns radar dot selector for radar type', () => {
      expect(getRechartsSelector('radar')).toBe('.recharts-radar-dot');
    });

    it('returns funnel trapezoid selector for funnel type', () => {
      expect(getRechartsSelector('funnel')).toBe('.recharts-funnel-trapezoid');
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

    it('returns undefined for radar with seriesIndex', () => {
      expect(getRechartsSelector('radar', 0)).toBeUndefined();
    });

    it('returns undefined for funnel with seriesIndex', () => {
      expect(getRechartsSelector('funnel', 0)).toBeUndefined();
    });

    it('returns undefined regardless of seriesIndex value', () => {
      expect(getRechartsSelector('bar', 2)).toBeUndefined();
      expect(getRechartsSelector('line', 5)).toBeUndefined();
    });
  });
});
