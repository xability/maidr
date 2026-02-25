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
    it('prefixes bar selector with nth-child for series 0', () => {
      expect(getRechartsSelector('bar', 0)).toBe('.recharts-bar:nth-child(1) .recharts-bar-rectangle');
    });

    it('prefixes bar selector with nth-child for series 2', () => {
      expect(getRechartsSelector('bar', 2)).toBe('.recharts-bar:nth-child(3) .recharts-bar-rectangle');
    });

    it('prefixes line selector with nth-child', () => {
      expect(getRechartsSelector('line', 1)).toBe('.recharts-line:nth-child(2) .recharts-line-dot');
    });

    it('prefixes scatter selector with nth-child', () => {
      expect(getRechartsSelector('scatter', 0)).toBe('.recharts-scatter:nth-child(1) .recharts-scatter-symbol');
    });

    it('prefixes radar selector with nth-child', () => {
      expect(getRechartsSelector('radar', 0)).toBe('.recharts-radar:nth-child(1) .recharts-radar-dot');
    });

    it('prefixes funnel selector with nth-child', () => {
      expect(getRechartsSelector('funnel', 0)).toBe('.recharts-trapezoids:nth-child(1) .recharts-funnel-trapezoid');
    });
  });
});
