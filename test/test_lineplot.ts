import { expect } from '@jest/globals';

/**
 * Extended LinePoint interface for date-based time series data
 * @interface TimeSeriesPoint
 */
interface TimeSeriesPoint {
  x: string; // Date string in YYYY-MM-DD format
  y: number; // Unemployment count value
}

/**
 * Interface representing a line chart configuration
 * @interface LineChart
 */
interface LineChart {
  type: string;
  id: string;
  selector: string;
  title: string;
  axes: {
    x: string;
    y: string;
  };
  data: TimeSeriesPoint[][];
}

/**
 * Custom error class for line chart data operations
 */
class LineChartDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LineChartDataError';
  }
}

/**
 * Test mockup of line chart data based on sample JSON
 */
const mockLineData: LineChart = {
  type: 'line',
  id: 'line',
  title: 'Unemployment Rate Over Time',
  selector: 'g[clip-path="url(#cpNDcuODN8NzE0LjUyfDM4Ljg1fDUzMC44Nw==)"] > polyline',
  axes: {
    x: 'Year',
    y: 'Unemployment Rate',
  },
  data: [
    [
      { x: '1967-07-01', y: 2944 },
      { x: '1967-08-01', y: 2945 },
      { x: '1967-09-01', y: 2958 },
      { x: '1967-10-01', y: 3143 },
      { x: '1967-11-01', y: 3066 },
      { x: '1967-12-01', y: 3018 },
      { x: '1968-01-01', y: 2878 },
      { x: '1968-02-01', y: 3001 },
      { x: '1968-03-01', y: 2877 },
      { x: '1968-04-01', y: 2709 },
      { x: '1968-05-01', y: 2740 },
      { x: '1968-06-01', y: 2938 },
      { x: '1968-07-01', y: 2883 },
      { x: '1968-08-01', y: 2768 },
      { x: '1968-09-01', y: 2686 },
      { x: '1968-10-01', y: 2689 },
      { x: '1968-11-01', y: 2715 },
      { x: '1968-12-01', y: 2685 },
      { x: '1969-01-01', y: 2718 },
      { x: '1969-02-01', y: 2692 },
      { x: '1969-03-01', y: 2712 },
      { x: '1969-04-01', y: 2758 },
      { x: '1969-05-01', y: 2713 },
      { x: '1969-06-01', y: 2816 },
      { x: '1969-07-01', y: 2868 },
      { x: '1969-08-01', y: 2856 },
      { x: '1969-09-01', y: 3040 },
      { x: '1969-10-01', y: 3049 },
      { x: '1969-11-01', y: 2856 },
      { x: '1969-12-01', y: 2884 },
      { x: '1970-01-01', y: 3201 },
    ],
  ],
};

/**
 * Gets the maximum y-value from the line data series
 * @param data - Array of time series data points
 * @returns The maximum y value as a number
 * @throws {LineChartDataError} If data array is empty
 *
 * @example
 * ```typescript
 * const maxValue = getMaximumValue(lineData[0]);
 * // maxValue = 15352 (highest unemployment count)
 * ```
 */
function getMaximumValue(data: TimeSeriesPoint[]): number {
  if (data.length === 0) {
    throw new LineChartDataError('Cannot get maximum value from empty data array');
  }

  return Math.max(...data.map(point => point.y));
}

/**
 * Gets the minimum y-value from the line data series
 * @param data - Array of time series data points
 * @returns The minimum y value as a number
 * @throws {LineChartDataError} If data array is empty
 *
 * @example
 * ```typescript
 * const minValue = getMinimumValue(lineData[0]);
 * // minValue = 2685 (lowest unemployment count)
 * ```
 */
function getMinimumValue(data: TimeSeriesPoint[]): number {
  if (data.length === 0) {
    throw new LineChartDataError('Cannot get minimum value from empty data array');
  }

  return Math.min(...data.map(point => point.y));
}

/**
 * Calculates the average y-value from the line data series
 * @param data - Array of time series data points
 * @returns The average y value as a number
 * @throws {LineChartDataError} If data array is empty
 *
 * @example
 * ```typescript
 * const avgValue = getAverageValue(lineData[0]);
 * // avgValue = Average unemployment rate across all time points
 * ```
 */
function getAverageValue(data: TimeSeriesPoint[]): number {
  if (data.length === 0) {
    throw new LineChartDataError('Cannot calculate average from empty data array');
  }

  const sum = data.reduce((total, point) => total + point.y, 0);

  return sum / data.length;
}

/**
 * Finds a data point by date
 * @param data - Array of time series data points
 * @param date - The date to search for (in string format)
 * @returns The found data point or undefined if not found
 *
 * @example
 * ```typescript
 * const dataPoint = findDataPointByDate(lineData[0], '1970-01-01');
 * // Returns the data point for January 1970
 * ```
 */
function findDataPointByDate(data: TimeSeriesPoint[], date: string): TimeSeriesPoint | undefined {
  return data.find(point => point.x === date);
}

/**
 * Navigates to the next point in line data
 * @param data - Array of time series data points
 * @param currentIndex - Current index in the data array
 * @param direction - Direction to move (1 for right, -1 for left)
 * @returns The new index after navigation
 *
 * @example
 * ```typescript
 * const nextIdx = navigateLine(lineData[0], 5, 1); // Move to next point from index 5
 * ```
 */
function navigateLine(data: TimeSeriesPoint[], currentIndex: number, direction: 1 | -1): number {
  const newIndex = currentIndex + direction;

  // Handle boundary conditions with wraparound
  if (newIndex < 0) {
    return data.length - 1;
  } else if (newIndex >= data.length) {
    return 0;
  }

  return newIndex;
}

/**
 * Extracts year from date string
 * @param dateStr - Date string in format 'YYYY-MM-DD'
 * @returns Year as number
 *
 * @example
 * ```typescript
 * const year = extractYear('1970-01-01');
 * // year = 1970
 * ```
 */
function extractYear(dateStr: string): number {
  return Number.parseInt(dateStr.split('-')[0], 10);
}

/**
 * Finds data points for a specific year
 * @param data - Array of time series data points
 * @param year - Year to filter by
 * @returns Array of data points for the specified year
 *
 * @example
 * ```typescript
 * const points1970 = findPointsByYear(lineData[0], 1970);
 * // Returns all data points from 1970
 * ```
 */
function findPointsByYear(data: TimeSeriesPoint[], year: number): TimeSeriesPoint[] {
  return data.filter(point => extractYear(point.x) === year);
}

/**
 * Calculates the yearly average values
 * @param data - Array of time series data points
 * @returns Map of year to average value
 *
 * @example
 * ```typescript
 * const yearlyAverages = calculateYearlyAverages(lineData[0]);
 * // Returns a map with each year as key and average unemployment rate as value
 * ```
 */
function calculateYearlyAverages(data: TimeSeriesPoint[]): Map<number, number> {
  if (data.length === 0) {
    throw new LineChartDataError('Cannot calculate yearly averages from empty data array');
  }
  const yearlyGroups: Map<number, TimeSeriesPoint[]> = new Map();
  data.forEach((point) => {
    const year = extractYear(point.x);
    if (!yearlyGroups.has(year)) {
      yearlyGroups.set(year, []);
    }
    yearlyGroups.get(year)?.push(point);
  });
  const yearlyAverages: Map<number, number> = new Map();
  yearlyGroups.forEach((points, year) => {
    const sum = points.reduce((total, point) => total + point.y, 0);
    yearlyAverages.set(year, sum / points.length);
  });

  return yearlyAverages;
}

describe('Line Plot Data Tests', () => {
  describe('Data Structure Validation', () => {
    test('should have valid line chart structure', () => {
      // Arrange & Act & Assert
      expect(mockLineData.type).toBe('line');
      expect(mockLineData.id).toBeDefined();
      expect(mockLineData.title).toBe('Unemployment Rate Over Time');
      expect(mockLineData.axes).toHaveProperty('x');
      expect(mockLineData.axes).toHaveProperty('y');
      expect(Array.isArray(mockLineData.data)).toBe(true);
      expect(mockLineData.data.length).toBeGreaterThan(0);
      expect(Array.isArray(mockLineData.data[0])).toBe(true);
    });

    test('should contain valid line data points', () => {
      const series = mockLineData.data[0];
      series.forEach((point) => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');
        expect(typeof point.y).toBe('number');
        expect(point.x).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    test('should have chronologically ordered data', () => {
      const series = mockLineData.data[0];
      for (let i = 1; i < series.length; i++) {
        const currentDate = new Date(series[i].x);
        const prevDate = new Date(series[i - 1].x);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(prevDate.getTime());
      }
    });
  });

  describe('Data Value Verification', () => {
    test('should have correct data points for specific dates', () => {
      const series = mockLineData.data[0];
      const july1967 = findDataPointByDate(series, '1967-07-01');
      const dec1967 = findDataPointByDate(series, '1967-12-01');
      const jan1970 = findDataPointByDate(series, '1970-01-01');
      expect(july1967).toBeDefined();
      expect(july1967?.y).toBe(2944);
      expect(dec1967).toBeDefined();
      expect(dec1967?.y).toBe(3018);
      expect(jan1970).toBeDefined();
      expect(jan1970?.y).toBe(3201);
    });

    test('should identify maximum value correctly', () => {
      const maxValue = getMaximumValue(mockLineData.data[0]);
      expect(maxValue).toBeGreaterThan(3000); // Known to be higher
    });

    test('should identify minimum value correctly', () => {
      const minValue = getMinimumValue(mockLineData.data[0]);
      expect(minValue).toBeLessThan(3000); // Known to be lower
    });

    test('should calculate average value correctly', () => {
      const avgValue = getAverageValue(mockLineData.data[0]);
      expect(avgValue).toBeGreaterThan(0);
      expect(typeof avgValue).toBe('number');
    });
  });

  describe('Time Series Analysis', () => {
    test('should group data points by year correctly', () => {
      const series = mockLineData.data[0];
      const points1967 = findPointsByYear(series, 1967);
      const points1968 = findPointsByYear(series, 1968);
      const points1969 = findPointsByYear(series, 1969);
      expect(points1967.length).toBe(6); // Jul-Dec 1967
      expect(points1968.length).toBe(12); // Full year
      expect(points1969.length).toBe(12); // Full year
    });

    test('should calculate yearly averages correctly', () => {
      const series = mockLineData.data[0];
      const yearlyAverages = calculateYearlyAverages(series);
      expect(yearlyAverages.size).toBeGreaterThan(0);

      if (yearlyAverages.has(1967)) {
        const avg1967 = yearlyAverages.get(1967);
        expect(avg1967).toBeGreaterThan(2900);
        expect(avg1967).toBeLessThan(3100);
      }

      if (yearlyAverages.has(1968)) {
        const avg1968 = yearlyAverages.get(1968);
        expect(avg1968).toBeGreaterThan(2600);
        expect(avg1968).toBeLessThan(3000);
      }
    });

    test('should show increasing trend from 1969 to 1970', () => {
      const series = mockLineData.data[0];
      const points1969 = findPointsByYear(series, 1969);
      const points1970 = findPointsByYear(series, 1970);
      const avg1969 = points1969.reduce((sum, point) => sum + point.y, 0) / points1969.length;
      const avg1970 = points1970.reduce((sum, point) => sum + point.y, 0) / points1970.length;
      expect(avg1970).toBeGreaterThan(avg1969);
    });
  });

  describe('Navigation Operations', () => {
    test('should navigate to the next point correctly', () => {
      const series = mockLineData.data[0];
      const currentIndex = 0;
      const nextIndex = navigateLine(series, currentIndex, 1);
      expect(nextIndex).toBe(1);
      expect(series[nextIndex].x).toBe('1967-08-01');
    });

    test('should navigate to the previous point correctly', () => {
      const series = mockLineData.data[0];
      const currentIndex = 1;
      const prevIndex = navigateLine(series, currentIndex, -1);
      expect(prevIndex).toBe(0);
      expect(series[prevIndex].x).toBe('1967-07-01');
    });

    test('should wrap around to the first point when navigating past the last point', () => {
      const series = mockLineData.data[0];
      const currentIndex = series.length - 1;
      const nextIndex = navigateLine(series, currentIndex, 1);
      expect(nextIndex).toBe(0);
      expect(series[nextIndex].x).toBe('1967-07-01');
    });

    test('should wrap around to the last point when navigating before the first point', () => {
      const series = mockLineData.data[0];
      const currentIndex = 0;
      const prevIndex = navigateLine(series, currentIndex, -1);
      expect(prevIndex).toBe(series.length - 1);
    });
  });

  describe('Edge Cases', () => {
    test('should throw error when getting maximum value from empty data', () => {
      const emptyData: TimeSeriesPoint[] = [];
      expect(() => getMaximumValue(emptyData)).toThrow(LineChartDataError);
    });

    test('should throw error when getting minimum value from empty data', () => {
      const emptyData: TimeSeriesPoint[] = [];
      expect(() => getMinimumValue(emptyData)).toThrow(LineChartDataError);
    });

    test('should throw error when calculating average from empty data', () => {
      const emptyData: TimeSeriesPoint[] = [];
      expect(() => getAverageValue(emptyData)).toThrow(LineChartDataError);
    });

    test('should return undefined when finding nonexistent date', () => {
      const series = mockLineData.data[0];
      const result = findDataPointByDate(series, '1900-01-01');
      expect(result).toBeUndefined();
    });

    test('should handle navigation on single-element array', () => {
      const singleElementData: TimeSeriesPoint[] = [{ x: '2000-01-01', y: 100 }];
      const nextIndex = navigateLine(singleElementData, 0, 1);
      const prevIndex = navigateLine(singleElementData, 0, -1);
      expect(nextIndex).toBe(0);
      expect(prevIndex).toBe(0);
    });
  });
});
