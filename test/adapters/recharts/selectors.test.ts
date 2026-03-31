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

    it('returns scoped scatter symbol selector for scatter type', () => {
      expect(getRechartsSelector('scatter')).toBe('.recharts-scatter-symbol .recharts-symbols');
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
