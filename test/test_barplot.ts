import type { BarPoint } from '../src/model/grammar';
import { expect } from '@jest/globals';

/**
 * Interface representing a bar chart configuration
 * @interface BarChart
 */
interface BarChart {
  type: string;
  id: string;
  selector: string;
  title: string;
  axes: {
    x: string;
    y: string;
  };
  data: BarPoint[];
}

/**
 * Test mockup of bar chart data based on sample JSON
 */
const mockBarData: BarChart = {
  type: 'bar',
  id: 'bar',
  selector: 'path[clip-path=\'url(#p0f12ed050e)\']',
  title: 'The Number of Tips by Day',
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
};

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
  describe('Data Structure Validation', () => {
    test('should have valid bar chart structure', () => {
      expect(mockBarData.type).toBe('bar');
      expect(mockBarData.id).toBeDefined();
      expect(mockBarData.title).toBeDefined();
      expect(mockBarData.axes).toHaveProperty('x');
      expect(mockBarData.axes).toHaveProperty('y');
      expect(Array.isArray(mockBarData.data)).toBe(true);
    });

    test('should contain valid data points', () => {
      mockBarData.data.forEach((point) => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');

        const yValue = typeof point.y === 'string' ? Number.parseFloat(point.y) : point.y;
        expect(Number.isNaN(yValue)).toBe(false);
      });
    });
  });

  describe('Data Value Verification', () => {
    test('should have correct number of data points', () => {
      expect(mockBarData.data.length).toBe(4);
    });

    test('should have correct days in the data', () => {
      const days = mockBarData.data.map(point => point.x);
      expect(days).toEqual(['Sat', 'Sun', 'Thur', 'Fri']);
    });

    test('should have correct counts for each day', () => {
      expect(mockBarData.data[0].y).toBe(87);
      expect(mockBarData.data[1].y).toBe(76);
      expect(mockBarData.data[2].y).toBe(62);
      expect(mockBarData.data[3].y).toBe(19);
    });

    test('should identify maximum value correctly', () => {
      const maxValue = getMaximumValue(mockBarData.data);
      expect(maxValue).toBe(87);
    });

    test('should identify minimum value correctly', () => {
      const minValue = getMinimumValue(mockBarData.data);
      expect(minValue).toBe(19);
    });
  });

  describe('Navigation Operations', () => {
    test('should navigate to the next bar correctly', () => {
      const currentIndex = 0;
      const nextIndex = navigateBar(mockBarData.data, currentIndex, 1);
      expect(nextIndex).toBe(1);
      expect(mockBarData.data[nextIndex].x).toBe('Sun');
    });

    test('should navigate to the previous bar correctly', () => {
      const currentIndex = 1;
      const prevIndex = navigateBar(mockBarData.data, currentIndex, -1);
      expect(prevIndex).toBe(0);
      expect(mockBarData.data[prevIndex].x).toBe('Sat');
    });

    test('should wrap around to the first bar when navigating past the last bar', () => {
      const currentIndex = mockBarData.data.length - 1;
      const nextIndex = navigateBar(mockBarData.data, currentIndex, 1);
      expect(nextIndex).toBe(0);
      expect(mockBarData.data[nextIndex].x).toBe('Sat');
    });

    test('should wrap around to the last bar when navigating before the first bar', () => {
      const currentIndex = 0;
      const prevIndex = navigateBar(mockBarData.data, currentIndex, -1);
      expect(prevIndex).toBe(mockBarData.data.length - 1);
      expect(mockBarData.data[prevIndex].x).toBe('Fri');
    });
  });

  describe('Search Operations', () => {
    test('should find bar by x value', () => {
      const thurIndex = findBarByXValue(mockBarData.data, 'Thur');
      expect(thurIndex).toBe(2);
      expect(mockBarData.data[thurIndex].y).toBe(62);
    });

    test('should return -1 for non-existent x value', () => {
      const nonExistentIndex = findBarByXValue(mockBarData.data, 'Mon');
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
  });
});
