import type { HeatmapData } from '../src/model/grammar';
import { expect } from '@jest/globals';

/**
 * Interface representing a heatmap chart configuration
 * @interface HeatmapChart
 */
interface HeatmapChart {
  type: string;
  id: string;
  selector?: string;
  title: string;
  axes: {
    x: string;
    y: string;
    fill: string;
  };
  data: HeatmapData;
}

/**
 * Test mockup of heatmap chart data based on sample data
 */
const mockHeatmapData: HeatmapChart = {
  type: 'heat',
  id: 'heatmap',
  title: 'Heatmap of Flight Passengers',
  axes: {
    x: 'Year',
    y: 'Month',
    fill: 'Passenger Count',
  },
  data: {
    x: ['1949', '1950', '1951', '1952', '1953', '1954', '1955', '1956', '1957', '1958', '1959', '1960'],
    y: ['Dec', 'Nov', 'Oct', 'Sep', 'Aug', 'Jul', 'Jun', 'May', 'Apr', 'Mar', 'Feb', 'Jan'],
    points: [
      [118.0, 140.0, 166.0, 194.0, 201.0, 229.0, 278.0, 306.0, 336.0, 337.0, 405.0, 432.0],
      [104.0, 114.0, 146.0, 172.0, 180.0, 203.0, 237.0, 271.0, 305.0, 310.0, 362.0, 390.0],
      [119.0, 133.0, 162.0, 191.0, 211.0, 229.0, 274.0, 306.0, 347.0, 359.0, 407.0, 461.0],
      [136.0, 158.0, 184.0, 209.0, 237.0, 259.0, 312.0, 355.0, 404.0, 404.0, 463.0, 508.0],
      [148.0, 170.0, 199.0, 242.0, 272.0, 293.0, 347.0, 405.0, 467.0, 505.0, 559.0, 606.0],
      [148.0, 170.0, 199.0, 230.0, 264.0, 302.0, 364.0, 413.0, 465.0, 491.0, 548.0, 622.0],
      [135.0, 149.0, 178.0, 218.0, 243.0, 264.0, 315.0, 374.0, 422.0, 435.0, 472.0, 535.0],
      [121.0, 125.0, 172.0, 183.0, 229.0, 234.0, 270.0, 318.0, 355.0, 363.0, 420.0, 472.0],
      [129.0, 135.0, 163.0, 181.0, 235.0, 227.0, 269.0, 313.0, 348.0, 348.0, 396.0, 461.0],
      [132.0, 141.0, 178.0, 193.0, 236.0, 235.0, 267.0, 317.0, 356.0, 362.0, 406.0, 419.0],
      [118.0, 126.0, 150.0, 180.0, 196.0, 188.0, 233.0, 277.0, 301.0, 318.0, 342.0, 391.0],
      [112.0, 115.0, 145.0, 171.0, 196.0, 204.0, 242.0, 284.0, 315.0, 340.0, 360.0, 417.0],
    ],
  },
};

/**
 * Returns the maximum value from the heatmap data
 * @param data - Heatmap data containing points matrix
 * @returns The maximum value as a number
 * @throws {Error} If the data has empty points array
 * @example
 * ```
 * const maxValue = getMaximumValue(heatmapData.data);
 * console.log(maxValue); // 622.0
 * ```
 */
function getMaximumValue(data: HeatmapData): number {
  if (!data.points || data.points.length === 0) {
    throw new Error('Cannot get maximum value from empty data array');
  }

  let max = -Infinity;
  for (const row of data.points) {
    for (const value of row) {
      if (value > max) {
        max = value;
      }
    }
  }
  return max;
}

/**
 * Returns the minimum value from the heatmap data
 * @param data - Heatmap data containing points matrix
 * @returns The minimum value as a number
 * @throws {Error} If the data has empty points array
 */
function getMinimumValue(data: HeatmapData): number {
  if (!data.points || data.points.length === 0) {
    throw new Error('Cannot get minimum value from empty data array');
  }

  let min = Infinity;
  for (const row of data.points) {
    for (const value of row) {
      if (value < min) {
        min = value;
      }
    }
  }
  return min;
}

/**
 * Gets the value at a specific x,y coordinate in the heatmap
 * @param data - Heatmap data containing points matrix
 * @param xIndex - Index in the x array
 * @param yIndex - Index in the y array
 * @returns The value at the specified coordinate or null if out of bounds
 */
function getValueAt(data: HeatmapData, xIndex: number, yIndex: number): number | null {
  if (!data.points
    || yIndex < 0
    || yIndex >= data.points.length
    || xIndex < 0
    || xIndex >= (data.points[0]?.length || 0)) {
    return null;
  }

  return data.points[yIndex][xIndex];
}

/**
 * Calculates the average value for a specific x-axis value (e.g., year)
 * @param data - Heatmap data containing points matrix
 * @param xIndex - Index of the x-axis value to average
 * @returns The average value or null if index is invalid
 */
function getAverageForXValue(data: HeatmapData, xIndex: number): number | null {
  if (!data.points
    || data.points.length === 0
    || xIndex < 0
    || xIndex >= (data.points[0]?.length || 0)) {
    return null;
  }

  let sum = 0;
  let count = 0;

  for (const row of data.points) {
    if (xIndex < row.length) {
      sum += row[xIndex];
      count++;
    }
  }

  return count > 0 ? sum / count : null;
}

/**
 * Calculates the average value for a specific y-axis value (e.g., month)
 * @param data - Heatmap data containing points matrix
 * @param yIndex - Index of the y-axis value to average
 * @returns The average value or null if index is invalid
 */
function getAverageForYValue(data: HeatmapData, yIndex: number): number | null {
  if (!data.points
    || yIndex < 0
    || yIndex >= data.points.length
    || data.points[yIndex].length === 0) {
    return null;
  }

  const row = data.points[yIndex];
  const sum = row.reduce((acc, val) => acc + val, 0);

  return sum / row.length;
}

/**
 * Finds coordinates of the cell with the maximum value
 * @param data - Heatmap data containing points matrix
 * @returns Object with x and y indices of the maximum value
 * @throws {Error} If the data has empty points array
 */
function findMaxValueCoordinates(data: HeatmapData): { xIndex: number; yIndex: number } {
  if (!data.points || data.points.length === 0) {
    throw new Error('Cannot find max value coordinates in empty data');
  }

  let maxValue = -Infinity;
  let maxCoords = { xIndex: -1, yIndex: -1 };

  for (let y = 0; y < data.points.length; y++) {
    const row = data.points[y];

    for (let x = 0; x < row.length; x++) {
      if (row[x] > maxValue) {
        maxValue = row[x];
        maxCoords = { xIndex: x, yIndex: y };
      }
    }
  }

  return maxCoords;
}

/**
 * Finds coordinates of the cell with the minimum value
 * @param data - Heatmap data containing points matrix
 * @returns Object with x and y indices of the minimum value
 * @throws {Error} If the data has empty points array
 */
function findMinValueCoordinates(data: HeatmapData): { xIndex: number; yIndex: number } {
  if (!data.points || data.points.length === 0) {
    throw new Error('Cannot find min value coordinates in empty data');
  }

  let minValue = Infinity;
  let minCoords = { xIndex: -1, yIndex: -1 };

  for (let y = 0; y < data.points.length; y++) {
    const row = data.points[y];

    for (let x = 0; x < row.length; x++) {
      if (row[x] < minValue) {
        minValue = row[x];
        minCoords = { xIndex: x, yIndex: y };
      }
    }
  }

  return minCoords;
}

/**
 * Gets label for specific x coordinate
 * @param data - Heatmap data containing x labels
 * @param xIndex - Index in the x array
 * @returns The label at the specified index or null if out of bounds
 */
function getXLabel(data: HeatmapData, xIndex: number): string | null {
  if (!data.x || xIndex < 0 || xIndex >= data.x.length) {
    return null;
  }
  return data.x[xIndex];
}

/**
 * Gets label for specific y coordinate
 * @param data - Heatmap data containing y labels
 * @param yIndex - Index in the y array
 * @returns The label at the specified index or null if out of bounds
 */
function getYLabel(data: HeatmapData, yIndex: number): string | null {
  if (!data.y || yIndex < 0 || yIndex >= data.y.length) {
    return null;
  }
  return data.y[yIndex];
}

describe('Heatmap Data Tests', () => {
  describe('Data Structure Validation', () => {
    test('should have valid heatmap chart structure', () => {
      expect(mockHeatmapData.type).toBe('heat');
      expect(mockHeatmapData.id).toBeDefined();
      expect(mockHeatmapData.title).toBeDefined();
      expect(mockHeatmapData.axes).toHaveProperty('x');
      expect(mockHeatmapData.axes).toHaveProperty('y');
      expect(mockHeatmapData.axes).toHaveProperty('fill');
      expect(mockHeatmapData.data).toBeDefined();
    });

    test('should have valid x and y arrays', () => {
      expect(Array.isArray(mockHeatmapData.data.x)).toBe(true);
      expect(Array.isArray(mockHeatmapData.data.y)).toBe(true);
      expect(mockHeatmapData.data.x.length).toBeGreaterThan(0);
      expect(mockHeatmapData.data.y.length).toBeGreaterThan(0);
    });

    test('should have valid points matrix', () => {
      expect(Array.isArray(mockHeatmapData.data.points)).toBe(true);
      expect(mockHeatmapData.data.points.length).toBe(mockHeatmapData.data.y.length);

      mockHeatmapData.data.points.forEach((row) => {
        expect(row.length).toBe(mockHeatmapData.data.x.length);
      });
    });
  });

  describe('Data Value Verification', () => {
    test('should have correct dimensions in the data', () => {
      expect(mockHeatmapData.data.y.length).toBe(12); // 12 months
      expect(mockHeatmapData.data.x.length).toBe(12); // 12 years
      expect(mockHeatmapData.data.points.length).toBe(12); // 12 rows
      expect(mockHeatmapData.data.points[0].length).toBe(12); // 12 columns
    });

    test('should have correct years in the x array', () => {
      expect(mockHeatmapData.data.x).toEqual([
        '1949',
        '1950',
        '1951',
        '1952',
        '1953',
        '1954',
        '1955',
        '1956',
        '1957',
        '1958',
        '1959',
        '1960',
      ]);
    });

    test('should have correct months in the y array', () => {
      expect(mockHeatmapData.data.y).toEqual([
        'Dec',
        'Nov',
        'Oct',
        'Sep',
        'Aug',
        'Jul',
        'Jun',
        'May',
        'Apr',
        'Mar',
        'Feb',
        'Jan',
      ]);
    });

    test('should identify maximum value correctly', () => {
      const maxValue = getMaximumValue(mockHeatmapData.data);
      expect(maxValue).toBe(622.0);
    });

    test('should identify minimum value correctly', () => {
      const minValue = getMinimumValue(mockHeatmapData.data);
      expect(minValue).toBe(104.0);
    });
  });

  describe('Label Retrieval Operations', () => {
    test('should get correct x-axis labels', () => {
      expect(getXLabel(mockHeatmapData.data, 0)).toBe('1949');
      expect(getXLabel(mockHeatmapData.data, 5)).toBe('1954');
      expect(getXLabel(mockHeatmapData.data, 11)).toBe('1960');
    });

    test('should get correct y-axis labels', () => {
      expect(getYLabel(mockHeatmapData.data, 0)).toBe('Dec');
      expect(getYLabel(mockHeatmapData.data, 5)).toBe('Jul');
      expect(getYLabel(mockHeatmapData.data, 11)).toBe('Jan');
    });

    test('should return null for out-of-bounds label indices', () => {
      expect(getXLabel(mockHeatmapData.data, -1)).toBeNull();
      expect(getXLabel(mockHeatmapData.data, 12)).toBeNull();
      expect(getYLabel(mockHeatmapData.data, -1)).toBeNull();
      expect(getYLabel(mockHeatmapData.data, 12)).toBeNull();
    });
  });

  describe('Value Retrieval Operations', () => {
    test('should get correct value at specific coordinates', () => {
      const janValue = getValueAt(mockHeatmapData.data, 0, 11);
      expect(janValue).toBe(112.0);

      const decValue = getValueAt(mockHeatmapData.data, 11, 0);
      expect(decValue).toBe(432.0);
    });

    test('should return null for out-of-bounds coordinates', () => {
      expect(getValueAt(mockHeatmapData.data, -1, 0)).toBeNull();
      expect(getValueAt(mockHeatmapData.data, 0, -1)).toBeNull();
      expect(getValueAt(mockHeatmapData.data, 12, 0)).toBeNull();
      expect(getValueAt(mockHeatmapData.data, 0, 12)).toBeNull();
    });
  });

  describe('Aggregate Operations', () => {
    test('should calculate correct average for a specific year', () => {
      const avg1949 = getAverageForXValue(mockHeatmapData.data, 0);
      expect(avg1949).toBeCloseTo(126.667, 3);

      const avg1960 = getAverageForXValue(mockHeatmapData.data, 11);
      expect(avg1960).toBeCloseTo(476.167, 3);
    });
  });

  describe('Coordinate Finding Operations', () => {
    test('should find coordinates of maximum value correctly', () => {
      const maxCoords = findMaxValueCoordinates(mockHeatmapData.data);
      expect(maxCoords).toEqual({ xIndex: 11, yIndex: 5 });

      const maxValue = getValueAt(mockHeatmapData.data, maxCoords.xIndex, maxCoords.yIndex);
      expect(maxValue).toBe(622.0);

      const xLabel = getXLabel(mockHeatmapData.data, maxCoords.xIndex);
      const yLabel = getYLabel(mockHeatmapData.data, maxCoords.yIndex);
      expect(xLabel).toBe('1960');
      expect(yLabel).toBe('Jul');
    });

    test('should find coordinates of minimum value correctly', () => {
      const minCoords = findMinValueCoordinates(mockHeatmapData.data);
      expect(minCoords).toEqual({ xIndex: 0, yIndex: 1 });

      const minValue = getValueAt(mockHeatmapData.data, minCoords.xIndex, minCoords.yIndex);
      expect(minValue).toBe(104.0);

      const xLabel = getXLabel(mockHeatmapData.data, minCoords.xIndex);
      const yLabel = getYLabel(mockHeatmapData.data, minCoords.yIndex);
      expect(xLabel).toBe('1949');
      expect(yLabel).toBe('Nov');
    });
  });

  describe('Error Handling', () => {
    test('should throw error when getting max value with empty data', () => {
      const emptyData: HeatmapData = { x: [], y: [], points: [] };
      expect(() => getMaximumValue(emptyData)).toThrow();
    });

    test('should throw error when getting min value with empty data', () => {
      const emptyData: HeatmapData = { x: [], y: [], points: [] };
      expect(() => getMinimumValue(emptyData)).toThrow();
    });

    test('should throw error when finding coordinates with empty data', () => {
      const emptyData: HeatmapData = { x: [], y: [], points: [] };
      expect(() => findMaxValueCoordinates(emptyData)).toThrow();
      expect(() => findMinValueCoordinates(emptyData)).toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty rows correctly', () => {
      const dataWithEmptyRow: HeatmapData = {
        x: ['1', '2'],
        y: ['A', 'B', 'C'],
        points: [
          [10, 20],
          [],
          [30, 40],
        ],
      };

      expect(getAverageForYValue(dataWithEmptyRow, 1)).toBeNull();
      // Averages for other rows should still work
      expect(getAverageForYValue(dataWithEmptyRow, 0)).toBe(15);
      expect(getAverageForYValue(dataWithEmptyRow, 2)).toBe(35);
    });

    test('should handle single value heatmap', () => {
      const singleValueData: HeatmapData = {
        x: ['2023'],
        y: ['Jan'],
        points: [[42]],
      };

      expect(getMaximumValue(singleValueData)).toBe(42);
      expect(getMinimumValue(singleValueData)).toBe(42);
      expect(getAverageForXValue(singleValueData, 0)).toBe(42);
      expect(getAverageForYValue(singleValueData, 0)).toBe(42);
      expect(findMaxValueCoordinates(singleValueData)).toEqual({ xIndex: 0, yIndex: 0 });
      expect(findMinValueCoordinates(singleValueData)).toEqual({ xIndex: 0, yIndex: 0 });
    });
  });
});
