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
  subtitle?: string;
  caption?: string;
  subplots: MaidrPlotSubplot[][];
}

const maidrData: MaidrPlot = {
  id: 'dodged_bar',
  title: 'Bar Plot',
  subtitle: 'Segmented bar plot of the number of cars in each class by drive type',
  caption: 'Source: mpg dataset from ggplot2 package',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'dodged_bar',
      selectors: '#dodged_bar g:nth-of-type(2) rect[style*=\'butt\']',
      axes: {
        x: 'Class',
        y: 'Count',
        fill: 'Drive',
      },
      data: [
        [
          { x: '2seater', y: 5, fill: 'r' },
          { x: 'compact', y: 0, fill: 'r' },
          { x: 'midsize', y: 0, fill: 'r' },
          { x: 'minivan', y: 0, fill: 'r' },
          { x: 'pickup', y: 0, fill: 'r' },
          { x: 'subcompact', y: 9, fill: 'r' },
          { x: 'sub', y: 11, fill: 'r' },
        ],
        [
          { x: '2seater', y: 0, fill: 'f' },
          { x: 'compact', y: 35, fill: 'f' },
          { x: 'midsize', y: 38, fill: 'f' },
          { x: 'minivan', y: 11, fill: 'f' },
          { x: 'pickup', y: 0, fill: 'f' },
          { x: 'subcompact', y: 22, fill: 'f' },
          { x: 'sub', y: 0, fill: 'f' },
        ],
        [
          { x: '2seater', y: 0, fill: '4' },
          { x: 'compact', y: 12, fill: '4' },
          { x: 'midsize', y: 3, fill: '4' },
          { x: 'minivan', y: 0, fill: '4' },
          { x: 'pickup', y: 33, fill: '4' },
          { x: 'subcompact', y: 4, fill: '4' },
          { x: 'sub', y: 51, fill: '4' },
        ],
      ],
    }],
  }]],
};

function getDodgedBarData(dodgedBarData: MaidrPlot): MaidrPlot {
  if (!dodgedBarData.subplots || dodgedBarData.subplots.length === 0) {
    throw new Error('Cannot find dodged bar data in empty dodgedBarData');
  }
  return dodgedBarData;
}

describe('Dodged Bar Data Tests', () => {
  let dodgedBarData: MaidrPlot;

  describe('Data Structure Validation', () => {
    beforeEach(() => {
      dodgedBarData = getDodgedBarData(maidrData);
    });

    it('should have valid dodged bar chart structure', () => {
      const layer = dodgedBarData.subplots[0][0].layers[0];

      expect(layer.type).toBe('dodged_bar');
      expect(dodgedBarData.id).toBeDefined();
      expect(dodgedBarData.title).toBeDefined();
      expect(dodgedBarData.subtitle).toBeDefined();
      expect(dodgedBarData.caption).toBeDefined();
      expect(layer.axes).toHaveProperty('x');
      expect(layer.axes).toHaveProperty('y');
      expect(layer.axes).toHaveProperty('fill');
      expect(layer.data).toBeDefined();
    });

    it('should have valid data arrays', () => {
      const layer = dodgedBarData.subplots[0][0].layers[0];
      expect(Array.isArray(layer.data)).toBe(true);
      expect(layer.data.length).toBe(3); // Three drive types: r, f, 4
      layer.data.forEach((category) => {
        expect(Array.isArray(category)).toBe(true);
        expect(category.length).toBe(7); // Seven car classes
      });
    });

    it('should have valid points with x, y, and fill properties', () => {
      const layer = dodgedBarData.subplots[0][0].layers[0];
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
      dodgedBarData = getDodgedBarData(maidrData);
    });

    it('should have consistent car classes across drive types', () => {
      const layer = dodgedBarData.subplots[0][0].layers[0];
      const expectedClasses = ['2seater', 'compact', 'midsize', 'minivan', 'pickup', 'subcompact', 'sub'];

      layer.data.forEach((driveType) => {
        const classes = driveType.map(point => point.x);
        expect(classes).toEqual(expectedClasses);
      });
    });

    it('should have valid car counts', () => {
      const layer = dodgedBarData.subplots[0][0].layers[0];
      layer.data.forEach((category) => {
        category.forEach((point) => {
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(point.y)).toBe(true);
        });
      });
    });

    it('should have correct drive type labels', () => {
      const layer = dodgedBarData.subplots[0][0].layers[0];
      const driveTypes = ['r', 'f', '4'];

      layer.data.forEach((category, index) => {
        category.forEach((point) => {
          expect(point.fill).toBe(driveTypes[index]);
        });
      });
    });

    it('should have correct total counts per car class', () => {
      const layer = dodgedBarData.subplots[0][0].layers[0];
      const expectedTotals: Record<string, number> = {
        '2seater': 5,
        'compact': 47,
        'midsize': 41,
        'minivan': 11,
        'pickup': 33,
        'subcompact': 35,
        'sub': 62,
      };

      const classes = ['2seater', 'compact', 'midsize', 'minivan', 'pickup', 'subcompact', 'sub'];
      classes.forEach((className) => {
        const total = layer.data.reduce((sum, driveType) => {
          const count = driveType.find(p => p.x === className)?.y || 0;
          return sum + count;
        }, 0);
        expect(total).toBe(expectedTotals[className]);
      });
    });
  });
});
