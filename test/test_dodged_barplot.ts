import { expect } from '@jest/globals';

interface BarPoint {
  x: string;
  y: number;
  fill: string;
}

interface ChartLayer {
  type: string;
  selector: string;
  axes: {
    x: string;
    y: string;
    fill: string;
  };
  data: BarPoint[][];
}

interface ChartSubplot {
  layers: ChartLayer[];
}

interface MaidrChart {
  id: string;
  title: string;
  subtitle?: string;
  caption?: string;
  subplots: ChartSubplot[][];
}

class DodgedBarDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DodgedBarDataError';
  }
}

const maidrData: MaidrChart = {
  id: 'dodged_bar',
  title: 'Bar Plot',
  subtitle: 'Segmented bar plot of the number of cars in each class by drive type',
  caption: 'Source: mpg dataset from ggplot2 package',
  subplots: [
    [
      {
        layers: [
          {
            type: 'dodged_bar',
            selector: '#dodged_bar g:nth-of-type(2) rect[style*=\'butt\']',
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
          },
        ],
      },
    ],
  ],
};

function getGroupData(
  chart: MaidrChart,
  groupIndex: number,
  subplotIndex = 0,
  subplotColIndex = 0,
  layerIndex = 0,
): BarPoint[] {
  if (!chart.subplots[subplotIndex]
    || !chart.subplots[subplotIndex][subplotColIndex]
    || !chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex]) {
    throw new DodgedBarDataError('Invalid subplot or layer index');
  }

  const layer = chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex];
  if (layer.type !== 'dodged_bar') {
    throw new DodgedBarDataError(`Expected dodged_bar layer, but found ${layer.type}`);
  }

  if (!layer.data[groupIndex]) {
    throw new DodgedBarDataError(`Group index ${groupIndex} does not exist`);
  }

  return layer.data[groupIndex];
}

function getAllCategories(chart: MaidrChart): string[] {
  const allData: BarPoint[] = [];
  const layer = chart.subplots[0][0].layers[0];

  layer.data.forEach((group) => {
    allData.push(...group);
  });

  const uniqueCategories = [...new Set(allData.map(point => point.x))];
  return uniqueCategories;
}

function getGroupLabels(chart: MaidrChart): string[] {
  const layer = chart.subplots[0][0].layers[0];
  return layer.data.map(group => group[0].fill);
}

function getMaximumValue(data: BarPoint[]): number {
  if (data.length === 0) {
    throw new DodgedBarDataError('Cannot get maximum value from empty data array');
  }
  return Math.max(...data.map(point => point.y));
}

function getMinimumValue(data: BarPoint[]): number {
  if (data.length === 0) {
    throw new DodgedBarDataError('Cannot get minimum value from empty data array');
  }
  return Math.min(...data.map(point => point.y));
}

function getTotalByCategory(chart: MaidrChart, category: string): number {
  let total = 0;
  const layer = chart.subplots[0][0].layers[0];

  layer.data.forEach((group) => {
    const categoryPoint = group.find(point => point.x === category);
    if (categoryPoint) {
      total += categoryPoint.y;
    }
  });

  return total;
}

function getMaximumCategory(chart: MaidrChart): string {
  const categories = getAllCategories(chart);
  let maxTotal = -1;
  let maxCategory = '';

  categories.forEach((category) => {
    const total = getTotalByCategory(chart, category);
    if (total > maxTotal) {
      maxTotal = total;
      maxCategory = category;
    }
  });

  return maxCategory;
}

function findPointByCategory(data: BarPoint[], category: string): BarPoint | undefined {
  return data.find(point => point.x === category);
}

function navigateGroup(
  chart: MaidrChart,
  currentGroupIndex: number,
  direction: 1 | -1,
): number {
  const layer = chart.subplots[0][0].layers[0];
  const newIndex = currentGroupIndex + direction;

  if (newIndex < 0) {
    return layer.data.length - 1;
  } else if (newIndex >= layer.data.length) {
    return 0;
  }

  return newIndex;
}

describe('Dodged Bar Plot Data Tests', () => {
  let rearWheelData: BarPoint[];
  let frontWheelData: BarPoint[];
  let fourWheelData: BarPoint[];

  beforeEach(() => {
    rearWheelData = getGroupData(maidrData, 0);
    frontWheelData = getGroupData(maidrData, 1);
    fourWheelData = getGroupData(maidrData, 2);
  });

  describe('Data Structure Validation', () => {
    test('should have valid dodged bar chart structure', () => {
      const layer = maidrData.subplots[0][0].layers[0];

      expect(layer.type).toBe('dodged_bar');
      expect(maidrData.id).toBeDefined();
      expect(maidrData.title).toBeDefined();
      expect(layer.axes).toHaveProperty('x');
      expect(layer.axes).toHaveProperty('y');
      expect(layer.axes).toHaveProperty('fill');
      expect(Array.isArray(layer.data)).toBe(true);
      expect(layer.data.length).toBe(3);
    });

    test('should contain valid bar data points', () => {
      const allGroups = maidrData.subplots[0][0].layers[0].data;
      allGroups.forEach((group) => {
        group.forEach((point) => {
          expect(point).toHaveProperty('x');
          expect(point).toHaveProperty('y');
          expect(point).toHaveProperty('fill');
          expect(typeof point.y).toBe('number');
        });
      });
    });

    test('should have consistent categories across groups', () => {
      const categories = getAllCategories(maidrData);
      expect(categories.length).toBe(7);

      [rearWheelData, frontWheelData, fourWheelData].forEach((group) => {
        expect(group.length).toBe(categories.length);
        group.forEach((point) => {
          expect(categories).toContain(point.x);
        });
      });
    });
  });

  describe('Data Value Verification', () => {
    test('should have correct values for rear-wheel drive', () => {
      const twoSeater = findPointByCategory(rearWheelData, '2seater');
      const subcompact = findPointByCategory(rearWheelData, 'subcompact');
      const sub = findPointByCategory(rearWheelData, 'sub');

      expect(twoSeater).toBeDefined();
      expect(twoSeater?.y).toBe(5);
      expect(subcompact).toBeDefined();
      expect(subcompact?.y).toBe(9);
      expect(sub).toBeDefined();
      expect(sub?.y).toBe(11);
    });

    test('should have correct values for front-wheel drive', () => {
      const compact = findPointByCategory(frontWheelData, 'compact');
      const midsize = findPointByCategory(frontWheelData, 'midsize');
      const minivan = findPointByCategory(frontWheelData, 'minivan');

      expect(compact).toBeDefined();
      expect(compact?.y).toBe(35);
      expect(midsize).toBeDefined();
      expect(midsize?.y).toBe(38);
      expect(minivan).toBeDefined();
      expect(minivan?.y).toBe(11);
    });

    test('should have correct values for four-wheel drive', () => {
      const pickup = findPointByCategory(fourWheelData, 'pickup');
      const sub = findPointByCategory(fourWheelData, 'sub');

      expect(pickup).toBeDefined();
      expect(pickup?.y).toBe(33);
      expect(sub).toBeDefined();
      expect(sub?.y).toBe(51);
    });

    test('should identify maximum values correctly', () => {
      expect(getMaximumValue(rearWheelData)).toBe(11);
      expect(getMaximumValue(frontWheelData)).toBe(38);
      expect(getMaximumValue(fourWheelData)).toBe(51);
    });

    test('should identify minimum values correctly', () => {
      expect(getMinimumValue(rearWheelData)).toBe(0);
      expect(getMinimumValue(frontWheelData)).toBe(0);
      expect(getMinimumValue(fourWheelData)).toBe(0);
    });
  });

  describe('Category Analysis', () => {
    test('should compute category totals correctly', () => {
      expect(getTotalByCategory(maidrData, '2seater')).toBe(5);
      expect(getTotalByCategory(maidrData, 'compact')).toBe(47);
      expect(getTotalByCategory(maidrData, 'midsize')).toBe(41);
      expect(getTotalByCategory(maidrData, 'sub')).toBe(62);
    });

    test('should identify category with maximum total', () => {
      expect(getMaximumCategory(maidrData)).toBe('sub');
    });

    test('should identify drive types for each group', () => {
      const groups = getGroupLabels(maidrData);
      expect(groups).toEqual(['r', 'f', '4']);
    });
  });

  describe('Navigation Operations', () => {
    test('should navigate to the next group correctly', () => {
      const currentGroupIndex = 0;
      const nextGroupIndex = navigateGroup(maidrData, currentGroupIndex, 1);

      expect(nextGroupIndex).toBe(1);
    });

    test('should navigate to the previous group correctly', () => {
      const currentGroupIndex = 1;
      const prevGroupIndex = navigateGroup(maidrData, currentGroupIndex, -1);

      expect(prevGroupIndex).toBe(0);
    });

    test('should wrap around to the first group when navigating past the last group', () => {
      const currentGroupIndex = 2;
      const nextGroupIndex = navigateGroup(maidrData, currentGroupIndex, 1);

      expect(nextGroupIndex).toBe(0);
    });

    test('should wrap around to the last group when navigating before the first group', () => {
      const currentGroupIndex = 0;
      const prevGroupIndex = navigateGroup(maidrData, currentGroupIndex, -1);

      expect(prevGroupIndex).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('should throw error when getting maximum value from empty data', () => {
      const emptyData: BarPoint[] = [];
      expect(() => getMaximumValue(emptyData)).toThrow(DodgedBarDataError);
    });

    test('should throw error when getting minimum value from empty data', () => {
      const emptyData: BarPoint[] = [];
      expect(() => getMinimumValue(emptyData)).toThrow(DodgedBarDataError);
    });

    test('should throw error for invalid subplot or layer indices', () => {
      expect(() => getGroupData(maidrData, 0, 1)).toThrow(DodgedBarDataError);
      expect(() => getGroupData(maidrData, 0, 0, 1)).toThrow(DodgedBarDataError);
    });

    test('should throw error for invalid group index', () => {
      expect(() => getGroupData(maidrData, 3)).toThrow(DodgedBarDataError);
    });
  });

  describe('Edge Cases', () => {
    test('should handle categories with zero values', () => {
      const rearMidsize = findPointByCategory(rearWheelData, 'midsize');
      const frontPickup = findPointByCategory(frontWheelData, 'pickup');
      const fourMinivan = findPointByCategory(fourWheelData, 'minivan');

      expect(rearMidsize?.y).toBe(0);
      expect(frontPickup?.y).toBe(0);
      expect(fourMinivan?.y).toBe(0);
    });

    test('should handle navigation with single group', () => {
      const singleGroupChart = {
        ...maidrData,
        subplots: [[{
          layers: [{
            ...maidrData.subplots[0][0].layers[0],
            data: [maidrData.subplots[0][0].layers[0].data[0]],
          }],
        }]],
      };

      const nextIndex = navigateGroup(singleGroupChart, 0, 1);
      const prevIndex = navigateGroup(singleGroupChart, 0, -1);

      expect(nextIndex).toBe(0);
      expect(prevIndex).toBe(0);
    });

    test('should return undefined for non-existent category', () => {
      const nonExistent = findPointByCategory(rearWheelData, 'luxury');
      expect(nonExistent).toBeUndefined();
    });
  });
});
