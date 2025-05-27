import { describe, expect, it } from '@jest/globals';

interface MaidrPlotLayer {
  id: string;
  type: string;
  selectors: string | string[];
  axes: {
    x: string;
    y: string;
    fill?: string;
  };
  data: { x: string; y: number; fill: string }[][];
}

interface MaidrPlotSubplot {
  layers: MaidrPlotLayer[];
}

interface MaidrPlot {
  id: string;
  title: string;
  subplots: MaidrPlotSubplot[][];
}

const maidrData: MaidrPlot = {
  id: 'stacked_bar',
  title: 'Passenger Count by Class and Survival Status on the Titanic',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'stacked_bar',
      selectors: 'path[clip-path=\'url(#p590fc6c652)\']',
      axes: {
        x: 'Class',
        y: 'Number of Passengers',
        fill: 'Survival Status',
      },
      data: [
        [
          { x: 'First', y: 80, fill: 'Not Survived' },
          { x: 'Second', y: 97, fill: 'Not Survived' },
          { x: 'Third', y: 372, fill: 'Not Survived' },
        ],
        [
          { x: 'First', y: 136, fill: 'Survived' },
          { x: 'Second', y: 87, fill: 'Survived' },
          { x: 'Third', y: 119, fill: 'Survived' },
        ],
      ],
    }],
  }]],
};

function getStackedBarData(stackedBarData: MaidrPlot): MaidrPlot {
  if (!stackedBarData.subplots || stackedBarData.subplots.length === 0) {
    throw new Error('Cannot find stacked bar data in empty stackedBarData');
  }
  return stackedBarData;
}

describe('Stacked Bar Data Tests', () => {
  let stackedBarData: MaidrPlot;

  describe('Data Structure Validation', () => {
    beforeEach(() => {
      stackedBarData = getStackedBarData(maidrData);
    });

    it('should have valid stacked bar chart structure', () => {
      const layer = stackedBarData.subplots[0][0].layers[0];

      expect(layer.type).toBe('stacked_bar');
      expect(stackedBarData.id).toBeDefined();
      expect(stackedBarData.title).toBeDefined();
      expect(layer.axes).toHaveProperty('x');
      expect(layer.axes).toHaveProperty('y');
      expect(layer.axes).toHaveProperty('fill');
      expect(layer.data).toBeDefined();
    });

    it('should have valid data arrays', () => {
      const layer = stackedBarData.subplots[0][0].layers[0];
      expect(Array.isArray(layer.data)).toBe(true);
      expect(layer.data.length).toBe(2);
      layer.data.forEach((category) => {
        expect(Array.isArray(category)).toBe(true);
        expect(category.length).toBe(3);
      });
    });

    it('should have valid points with x, y, and fill properties', () => {
      const layer = stackedBarData.subplots[0][0].layers[0];
      layer.data.forEach((category) => {
        category.forEach((point) => {
          expect(point).toHaveProperty('x');
          expect(point).toHaveProperty('y');
          expect(point).toHaveProperty('fill');
          expect(typeof point.x).toBe('string');
          expect(typeof point.y).toBe('number');
          expect(typeof point.fill).toBe('string');
        });
      });
    });
  });

  describe('Data Integrity', () => {
    beforeEach(() => {
      stackedBarData = getStackedBarData(maidrData);
    });

    it('should have consistent passenger classes across categories', () => {
      const layer = stackedBarData.subplots[0][0].layers[0];
      const [notSurvived, survived] = layer.data;

      const notSurvivedClasses = notSurvived.map(point => point.x);
      const survivedClasses = survived.map(point => point.x);

      expect(notSurvivedClasses).toEqual(['First', 'Second', 'Third']);
      expect(survivedClasses).toEqual(['First', 'Second', 'Third']);
    });

    it('should have valid passenger counts', () => {
      const layer = stackedBarData.subplots[0][0].layers[0];
      layer.data.forEach((category) => {
        category.forEach((point) => {
          expect(point.y).toBeGreaterThan(0);
          expect(Number.isInteger(point.y)).toBe(true);
        });
      });
    });

    it('should have correct survival status labels', () => {
      const layer = stackedBarData.subplots[0][0].layers[0];
      const [notSurvived, survived] = layer.data;

      notSurvived.forEach((point) => {
        expect(point.fill).toBe('Not Survived');
      });

      survived.forEach((point) => {
        expect(point.fill).toBe('Survived');
      });
    });

    it('should have matching total passengers per class', () => {
      const layer = stackedBarData.subplots[0][0].layers[0];
      const [notSurvived, survived] = layer.data;

      const expectedTotals: Record<'First' | 'Second' | 'Third', number> = {
        First: 216,
        Second: 184,
        Third: 491,
      };

      const classes = ['First', 'Second', 'Third'] as const;
      classes.forEach((className) => {
        const notSurvivedCount = notSurvived.find(p => p.x === className)?.y || 0;
        const survivedCount = survived.find(p => p.x === className)?.y || 0;
        expect(notSurvivedCount + survivedCount).toBe(expectedTotals[className]);
      });
    });
  });
});
