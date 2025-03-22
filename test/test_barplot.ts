import type { BarPoint } from '../src/model/grammar';
import { expect } from '@jest/globals';

/**
 * Interface representing a subplot layer in the chart
 * @interface ChartLayer
 */
interface ChartLayer {
  type: string;
  selector: string;
  axes: {
    x: string;
    y: string;
  };
  data: BarPoint[];
}

/**
 * Interface representing a subplot in the chart
 * @interface ChartSubplot
 */
interface ChartSubplot {
  layers: ChartLayer[];
}

/**
 * Interface representing the complete bar chart configuration with subplots
 * @interface MaidrChart
 */
interface MaidrChart {
  id: string;
  title: string;
  subplots: ChartSubplot[][];
}

/**
 * Test mockup of bar chart data based on updated MAIDR format
 */
const maidrData: MaidrChart = {
  id: 'bar',
  title: 'The Number of Tips by Day',
  subplots: [
    [
      {
        layers: [
          {
            type: 'bar',
            selector: 'path[clip-path=\'url(#p0f12ed050e)\']',
            axes: {
              x: 'Day',
              y: 'Count',
            },
            data: [
              {
                x: 'Sat',
                y: 87,
              },
              {
                x: 'Sun',
                y: 76,
              },
              {
                x: 'Thur',
                y: 62,
              },
              {
                x: 'Fri',
                y: 19,
              },
            ],
          },
        ],
      },
    ],
  ],
};

/**
 * Gets the bar data from the MAIDR chart structure
 * @param chart - The MAIDR chart object
 * @param subplotIndex - Row index of the subplot (defaults to 0)
 * @param subplotColIndex - Column index of the subplot (defaults to 0)
 * @param layerIndex - Index of the layer within the subplot (defaults to 0)
 * @returns The bar data points
 * @throws {Error} If the specified indexes don't exist or the layer is not a bar type
 */
function getBarData(
  chart: MaidrChart,
  subplotIndex = 0,
  subplotColIndex = 0,
  layerIndex = 0,
): BarPoint[] {
  if (!chart.subplots[subplotIndex]
    || !chart.subplots[subplotIndex][subplotColIndex]
    || !chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex]) {
    throw new Error('Invalid subplot or layer index');
  }

  const layer = chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex];
  if (layer.type !== 'bar') {
    throw new Error(`Expected bar layer, but found ${layer.type}`);
  }

  return layer.data;
}

/**
 * Returns the maximum y-value from the data
 * @param data - Array of bar data points
 * @returns The maximum y value as a number
 * @throws {Error} If the data array is empty
 */
function getMaximumValue(data: BarPoint[]): number {
  if (data.length === 0) {
    throw new Error('Cannot get maximum value from empty data array');
  }
  return Math.max(...data.map(point => typeof point.y === 'number' ? point.y : Number.parseFloat(point.y)));
}

/**
 * Returns the minimum y-value from the data
 * @param data - Array of bar data points
 * @returns The minimum y value as a number
 * @throws {Error} If the data array is empty
 */
function getMinimumValue(data: BarPoint[]): number {
  if (data.length === 0) {
    throw new Error('Cannot get minimum value from empty data array');
  }
  return Math.min(...data.map(point => typeof point.y === 'number' ? point.y : Number.parseFloat(point.y)));
}

/**
 * Navigates through bar data to find the next element based on current index
 * @param data - Array of bar data points
 * @param currentIndex - Current index in the data array
 * @param direction - Direction to move (1 for right, -1 for left)
 * @returns The new index after navigation
 */
function navigateBar(data: BarPoint[], currentIndex: number, direction: 1 | -1): number {
  const newIndex = currentIndex + direction;
  if (newIndex < 0) {
    return data.length - 1;
  } else if (newIndex >= data.length) {
    return 0;
  }

  return newIndex;
}

/**
 * Finds the index of a bar with a specific x value
 * @param data - Array of bar data points
 * @param xValue - The x value to search for
 * @returns The index of the matching item or -1 if not found
 */
function findBarByXValue(data: BarPoint[], xValue: string | number): number {
  return data.findIndex(point => point.x === xValue);
}

describe('Bar Plot Data Tests', () => {
  let barData: BarPoint[];

  beforeEach(() => {
    barData = getBarData(maidrData);
  });

  describe('Data Structure Validation', () => {
    test('should have valid bar chart structure', () => {
      const layer = maidrData.subplots[0][0].layers[0];

      expect(layer.type).toBe('bar');
      expect(maidrData.id).toBeDefined();
      expect(maidrData.title).toBeDefined();
      expect(layer.axes).toHaveProperty('x');
      expect(layer.axes).toHaveProperty('y');
      expect(Array.isArray(layer.data)).toBe(true);
    });

    test('should contain valid data points', () => {
      barData.forEach((point) => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');

        const yValue = typeof point.y === 'string' ? Number.parseFloat(point.y) : point.y;
        expect(Number.isNaN(yValue)).toBe(false);
      });
    });
  });

  describe('Data Value Verification', () => {
    test('should have correct number of data points', () => {
      expect(barData.length).toBe(4);
    });

    test('should have correct days in the data', () => {
      const days = barData.map(point => point.x);
      expect(days).toEqual(['Sat', 'Sun', 'Thur', 'Fri']);
    });

    test('should have correct counts for each day', () => {
      expect(barData[0].y).toBe(87);
      expect(barData[1].y).toBe(76);
      expect(barData[2].y).toBe(62);
      expect(barData[3].y).toBe(19);
    });

    test('should identify maximum value correctly', () => {
      const maxValue = getMaximumValue(barData);
      expect(maxValue).toBe(87);
    });

    test('should identify minimum value correctly', () => {
      const minValue = getMinimumValue(barData);
      expect(minValue).toBe(19);
    });
  });

  describe('Navigation Operations', () => {
    test('should navigate to the next bar correctly', () => {
      const currentIndex = 0;
      const nextIndex = navigateBar(barData, currentIndex, 1);
      expect(nextIndex).toBe(1);
      expect(barData[nextIndex].x).toBe('Sun');
    });

    test('should navigate to the previous bar correctly', () => {
      const currentIndex = 1;
      const prevIndex = navigateBar(barData, currentIndex, -1);
      expect(prevIndex).toBe(0);
      expect(barData[prevIndex].x).toBe('Sat');
    });

    test('should wrap around to the first bar when navigating past the last bar', () => {
      const currentIndex = barData.length - 1;
      const nextIndex = navigateBar(barData, currentIndex, 1);
      expect(nextIndex).toBe(0);
      expect(barData[nextIndex].x).toBe('Sat');
    });

    test('should wrap around to the last bar when navigating before the first bar', () => {
      const currentIndex = 0;
      const prevIndex = navigateBar(barData, currentIndex, -1);
      expect(prevIndex).toBe(barData.length - 1);
      expect(barData[prevIndex].x).toBe('Fri');
    });
  });

  describe('Search Operations', () => {
    test('should find bar by x value', () => {
      const thurIndex = findBarByXValue(barData, 'Thur');
      expect(thurIndex).toBe(2);
      expect(barData[thurIndex].y).toBe(62);
    });

    test('should return -1 for non-existent x value', () => {
      const nonExistentIndex = findBarByXValue(barData, 'Mon');
      expect(nonExistentIndex).toBe(-1);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty data array', () => {
      const emptyData: BarPoint[] = [];
      expect(() => getMaximumValue(emptyData)).toThrow();
      expect(() => getMinimumValue(emptyData)).toThrow();
    });

    test('should handle navigation on single-element array', () => {
      const singleBarData: BarPoint[] = [{ x: 'Day1', y: 10 }];
      const nextIndex = navigateBar(singleBarData, 0, 1);
      const prevIndex = navigateBar(singleBarData, 0, -1);

      expect(nextIndex).toBe(0);
      expect(prevIndex).toBe(0);
    });

    test('should throw error for invalid subplot or layer indices', () => {
      expect(() => getBarData(maidrData, 1)).toThrow('Invalid subplot or layer index');
      expect(() => getBarData(maidrData, 0, 1)).toThrow('Invalid subplot or layer index');
    });
  });
});
