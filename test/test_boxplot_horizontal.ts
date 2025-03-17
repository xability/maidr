import type { BoxPoint } from '../src/model/grammar';
import { expect } from '@jest/globals';

/**
 * Interface representing a boxplot chart configuration
 * @interface BoxChart
 */
interface BoxChart {
  type: string;
  id: string;
  orientation: string;
  selector: string;
  axes: {
    x: string;
    y: string;
  };
  data: BoxPoint[];
}

/**
 * Test mockup of boxplot chart data based on sample data
 */
const mockBoxData: BoxChart = {
  type: 'box',
  id: 'boxplot1',
  orientation: 'horz',
  selector: '#geom_boxplot\\.gTree\\.177\\.1',
  axes: {
    x: 'Life Expectancy',
    y: 'Continent',
  },
  data: [
    {
      fill: 'Africa',
      lowerOutliers: [23.599],
      min: 30,
      q1: 42.361,
      q2: 47.792,
      q3: 54.416,
      max: 72.301,
      upperOutliers: [72.737, 72.801, 73.042, 73.615, 73.923, 73.952, 74.772, 75.744, 76.442],
    },
    {
      fill: 'Americas',
      lowerOutliers: [37.579],
      min: 40.414,
      q1: 58.373,
      q2: 67.048,
      q3: 71.717,
      max: 80.653,
      upperOutliers: [],
    },
    {
      fill: 'Asia',
      lowerOutliers: [],
      min: 28.801,
      q1: 51.3955,
      q2: 61.7915,
      q3: 69.5105,
      max: 82.603,
      upperOutliers: [],
    },
    {
      fill: 'Europe',
      lowerOutliers: [
        43.585,
        48.079,
        52.098,
        53.82,
        54.336,
        55.23,
        57.005,
        57.996,
        58.45,
        59.164,
        59.28,
        59.507,
        59.6,
        59.82,
      ],
      min: 61.036,
      q1: 69.56,
      q2: 72.241,
      q3: 75.456,
      max: 81.757,
      upperOutliers: [],
    },
    {
      fill: 'Oceania',
      lowerOutliers: [],
      min: 69.12,
      q1: 71.17,
      q2: 73.665,
      q3: 77.555,
      max: 81.235,
      upperOutliers: [],
    },
  ],
};

/**
 * Returns the maximum median (q2) value from the data
 * @param data - Array of box data points
 * @returns The maximum median value as a number
 * @throws {Error} If the data array is empty
 */
function getMaximumMedian(data: BoxPoint[]): number {
  if (data.length === 0) {
    throw new Error('Cannot get maximum median from empty data array');
  }
  return Math.max(...data.map(point => point.q2));
}

/**
 * Returns the minimum median (q2) value from the data
 * @param data - Array of box data points
 * @returns The minimum median value as a number
 * @throws {Error} If the data array is empty
 */
function getMinimumMedian(data: BoxPoint[]): number {
  if (data.length === 0) {
    throw new Error('Cannot get minimum median from empty data array');
  }
  return Math.min(...data.map(point => point.q2));
}

/**
 * Returns the box point with the highest interquartile range (IQR)
 * @param data - Array of box data points
 * @returns The box point with the highest IQR
 * @throws {Error} If the data array is empty
 */
function getHighestIQR(data: BoxPoint[]): BoxPoint {
  if (data.length === 0) {
    throw new Error('Cannot get highest IQR from empty data array');
  }

  let maxIQR = -Infinity;
  let maxIQRPoint: BoxPoint | null = null;

  for (const point of data) {
    const iqr = point.q3 - point.q1;
    if (iqr > maxIQR) {
      maxIQR = iqr;
      maxIQRPoint = point;
    }
  }

  return maxIQRPoint!;
}

/**
 * Returns the box point with the lowest interquartile range (IQR)
 * @param data - Array of box data points
 * @returns The box point with the lowest IQR
 * @throws {Error} If the data array is empty
 */
function getLowestIQR(data: BoxPoint[]): BoxPoint {
  if (data.length === 0) {
    throw new Error('Cannot get lowest IQR from empty data array');
  }

  let minIQR = Infinity;
  let minIQRPoint: BoxPoint | null = null;

  for (const point of data) {
    const iqr = point.q3 - point.q1;
    if (iqr < minIQR) {
      minIQR = iqr;
      minIQRPoint = point;
    }
  }

  return minIQRPoint!;
}

/**
 * Calculates the interquartile range (IQR) for a box point
 * @param point - Box data point
 * @returns The interquartile range (q3 - q1)
 */
function calculateIQR(point: BoxPoint): number {
  return point.q3 - point.q1;
}

/**
 * Finds a box point by its fill value (e.g., continent name)
 * @param data - Array of box data points
 * @param fillValue - The fill value to search for
 * @returns The matching box point or undefined if not found
 */
function findBoxByFill(data: BoxPoint[], fillValue: string): BoxPoint | undefined {
  return data.find(point => point.fill === fillValue);
}

/**
 * Calculates the total number of outliers in a box point
 * @param point - Box data point
 * @returns The total number of outliers (lower + upper)
 */
function countOutliers(point: BoxPoint): number {
  return point.lowerOutliers.length + point.upperOutliers.length;
}

/**
 * Navigates through box data to find the next element based on current index
 * @param data - Array of box data points
 * @param currentIndex - Current index in the data array
 * @param direction - Direction to move (1 for right, -1 for left)
 * @returns The new index after navigation
 */
function navigateBox(data: BoxPoint[], currentIndex: number, direction: 1 | -1): number {
  const newIndex = currentIndex + direction;
  if (newIndex < 0) {
    return data.length - 1;
  } else if (newIndex >= data.length) {
    return 0;
  }

  return newIndex;
}

describe('Box Plot Data Tests', () => {
  describe('Data Structure Validation', () => {
    test('should have valid boxplot chart structure', () => {
      expect(mockBoxData.type).toBe('box');
      expect(mockBoxData.id).toBeDefined();
      expect(mockBoxData.orientation).toBeDefined();
      expect(mockBoxData.selector).toBeDefined();
      expect(mockBoxData.axes).toHaveProperty('x');
      expect(mockBoxData.axes).toHaveProperty('y');
      expect(Array.isArray(mockBoxData.data)).toBe(true);
    });

    test('should have valid box points in data array', () => {
      mockBoxData.data.forEach((point) => {
        expect(point).toHaveProperty('fill');
        expect(point).toHaveProperty('min');
        expect(point).toHaveProperty('q1');
        expect(point).toHaveProperty('q2');
        expect(point).toHaveProperty('q3');
        expect(point).toHaveProperty('max');
        expect(Array.isArray(point.lowerOutliers)).toBe(true);
        expect(Array.isArray(point.upperOutliers)).toBe(true);
      });
    });

    test('should have expected number of continents', () => {
      expect(mockBoxData.data.length).toBe(5);

      const continents = mockBoxData.data.map(point => point.fill);
      expect(continents).toContain('Africa');
      expect(continents).toContain('Americas');
      expect(continents).toContain('Asia');
      expect(continents).toContain('Europe');
      expect(continents).toContain('Oceania');
    });
  });

  describe('Data Value Verification', () => {
    test('should have correct quartile values for Africa', () => {
      const africa = findBoxByFill(mockBoxData.data, 'Africa');
      expect(africa).toBeDefined();
      expect(africa!.min).toBe(30);
      expect(africa!.q1).toBe(42.361);
      expect(africa!.q2).toBe(47.792);
      expect(africa!.q3).toBe(54.416);
      expect(africa!.max).toBe(72.301);
    });

    test('should have correct number of outliers for each continent', () => {
      const africa = findBoxByFill(mockBoxData.data, 'Africa')!;
      expect(countOutliers(africa)).toBe(10);

      const europe = findBoxByFill(mockBoxData.data, 'Europe')!;
      expect(countOutliers(europe)).toBe(14);

      const oceania = findBoxByFill(mockBoxData.data, 'Oceania')!;
      expect(countOutliers(oceania)).toBe(0);
    });

    test('should identify maximum median value correctly', () => {
      const maxMedian = getMaximumMedian(mockBoxData.data);
      expect(maxMedian).toBe(73.665);
    });

    test('should identify minimum median value correctly', () => {
      const minMedian = getMinimumMedian(mockBoxData.data);
      expect(minMedian).toBe(47.792);
    });
  });

  describe('Interquartile Range Operations', () => {
    test('should calculate IQR correctly', () => {
      const asia = findBoxByFill(mockBoxData.data, 'Asia')!;
      const asiaIQR = calculateIQR(asia);
      expect(asiaIQR).toBeCloseTo(18.115, 3);

      const africa = findBoxByFill(mockBoxData.data, 'Africa')!;
      const africaIQR = calculateIQR(africa);
      expect(africaIQR).toBeCloseTo(12.055, 3);
    });

    test('should find continent with highest IQR', () => {
      const highestIQR = getHighestIQR(mockBoxData.data);
      expect(highestIQR.fill).toBe('Asia');
      expect(calculateIQR(highestIQR)).toBeCloseTo(18.115, 3);
    });
  });

  describe('Navigation Operations', () => {
    test('should navigate to the next box correctly', () => {
      const currentIndex = 0;
      const nextIndex = navigateBox(mockBoxData.data, currentIndex, 1);
      expect(nextIndex).toBe(1);
      expect(mockBoxData.data[nextIndex].fill).toBe('Americas');
    });

    test('should navigate to the previous box correctly', () => {
      const currentIndex = 1;
      const prevIndex = navigateBox(mockBoxData.data, currentIndex, -1);
      expect(prevIndex).toBe(0);
      expect(mockBoxData.data[prevIndex].fill).toBe('Africa');
    });

    test('should wrap around to the first box when navigating past the last box', () => {
      const currentIndex = mockBoxData.data.length - 1;
      const nextIndex = navigateBox(mockBoxData.data, currentIndex, 1);
      expect(nextIndex).toBe(0);
      expect(mockBoxData.data[nextIndex].fill).toBe('Africa');
    });

    test('should wrap around to the last box when navigating before the first box', () => {
      const currentIndex = 0;
      const prevIndex = navigateBox(mockBoxData.data, currentIndex, -1);
      expect(prevIndex).toBe(mockBoxData.data.length - 1);
      expect(mockBoxData.data[prevIndex].fill).toBe('Oceania');
    });
  });

  describe('Search Operations', () => {
    test('should find box by fill value', () => {
      const asia = findBoxByFill(mockBoxData.data, 'Asia');
      expect(asia).toBeDefined();
      expect(asia!.min).toBe(28.801);
      expect(asia!.max).toBe(82.603);
    });

    test('should return undefined for non-existent fill value', () => {
      const nonExistent = findBoxByFill(mockBoxData.data, 'Antarctica');
      expect(nonExistent).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    test('should throw error when getting max median with empty data', () => {
      const emptyData: BoxPoint[] = [];
      expect(() => getMaximumMedian(emptyData)).toThrow();
    });

    test('should throw error when getting min median with empty data', () => {
      const emptyData: BoxPoint[] = [];
      expect(() => getMinimumMedian(emptyData)).toThrow();
    });

    test('should throw error when getting highest IQR with empty data', () => {
      const emptyData: BoxPoint[] = [];
      expect(() => getHighestIQR(emptyData)).toThrow();
    });

    test('should throw error when getting lowest IQR with empty data', () => {
      const emptyData: BoxPoint[] = [];
      expect(() => getLowestIQR(emptyData)).toThrow();
    });
  });
});
