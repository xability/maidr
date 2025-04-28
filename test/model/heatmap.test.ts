import type { HeatmapData } from '../../src/type/grammar';
import { expect } from '@jest/globals';

interface ChartLayer {
  type: string;
  axes: {
    x: string;
    y: string;
    fill: string;
  };
  data: HeatmapData;
}

interface ChartSubplot {
  layers: ChartLayer[];
}

interface MaidrChart {
  id: string;
  title: string;
  subplots: ChartSubplot[][];
}

const maidrData: MaidrChart = {
  id: 'heatmap',
  title: 'Heatmap of Flight Passengers',
  subplots: [
    [
      {
        layers: [
          {
            type: 'heat',
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
          },
        ],
      },
    ],
  ],
};

function getHeatmapData(
  chart: MaidrChart,
  subplotIndex = 0,
  subplotColIndex = 0,
  layerIndex = 0,
): HeatmapData {
  if (!chart.subplots[subplotIndex]
    || !chart.subplots[subplotIndex][subplotColIndex]
    || !chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex]) {
    throw new Error('Invalid subplot or layer index');
  }

  const layer = chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex];
  if (layer.type !== 'heat') {
    throw new Error(`Expected heat layer, but found ${layer.type}`);
  }

  return layer.data;
}

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

function getAverageForYValue(data: HeatmapData, yIndex: number): number | null {
  if (!data.points
    || yIndex < 0
    || yIndex >= data.points.length
    || data.points[yIndex].length === 0) {
    return null;
  }

  const row = data.points[yIndex];
  const sum = row.reduce((acc: any, val: any) => acc + val, 0);

  return sum / row.length;
}

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

describe('heatmap Data Tests', () => {
  let heatmapData: HeatmapData;

  beforeEach(() => {
    heatmapData = getHeatmapData(maidrData);
  });

  describe('data Structure Validation', () => {
    it('should have valid heatmap chart structure', () => {
      const layer = maidrData.subplots[0][0].layers[0];

      expect(layer.type).toBe('heat');
      expect(maidrData.id).toBeDefined();
      expect(maidrData.title).toBeDefined();
      expect(layer.axes).toHaveProperty('x');
      expect(layer.axes).toHaveProperty('y');
      expect(layer.axes).toHaveProperty('fill');
      expect(layer.data).toBeDefined();
    });

    it('should have valid x and y arrays', () => {
      expect(Array.isArray(heatmapData.x)).toBe(true);
      expect(Array.isArray(heatmapData.y)).toBe(true);
      expect(heatmapData.x.length).toBeGreaterThan(0);
      expect(heatmapData.y.length).toBeGreaterThan(0);
    });

    it('should have valid points matrix', () => {
      expect(Array.isArray(heatmapData.points)).toBe(true);
      expect(heatmapData.points.length).toBe(heatmapData.y.length);

      heatmapData.points.forEach((row: string | any[]) => {
        expect(row.length).toBe(heatmapData.x.length);
      });
    });
  });

  describe('value Retrieval Operations', () => {
    it('should get correct value at specific coordinates', () => {
      const janValue = getValueAt(heatmapData, 0, 11);
      expect(janValue).toBe(112.0);

      const decValue = getValueAt(heatmapData, 11, 0);
      expect(decValue).toBe(432.0);
    });

    it('should return null for out-of-bounds coordinates', () => {
      expect(getValueAt(heatmapData, -1, 0)).toBeNull();
      expect(getValueAt(heatmapData, 0, -1)).toBeNull();
      expect(getValueAt(heatmapData, 12, 0)).toBeNull();
      expect(getValueAt(heatmapData, 0, 12)).toBeNull();
    });
  });

  describe('aggregate Operations', () => {
    it('should calculate correct average for a specific year', () => {
      const avg1949 = getAverageForXValue(heatmapData, 0);
      expect(avg1949).toBeCloseTo(126.667, 3);

      const avg1960 = getAverageForXValue(heatmapData, 11);
      expect(avg1960).toBeCloseTo(476.167, 3);
    });
  });

  describe('error Handling', () => {
    it('should throw error when getting max value with empty data', () => {
      const emptyData: HeatmapData = { x: [], y: [], points: [] };
      expect(() => getMaximumValue(emptyData)).toThrow();
    });

    it('should throw error when getting min value with empty data', () => {
      const emptyData: HeatmapData = { x: [], y: [], points: [] };
      expect(() => getMinimumValue(emptyData)).toThrow();
    });

    it('should throw error when finding coordinates with empty data', () => {
      const emptyData: HeatmapData = { x: [], y: [], points: [] };
      expect(() => findMaxValueCoordinates(emptyData)).toThrow();
      expect(() => findMinValueCoordinates(emptyData)).toThrow();
    });

    it('should throw error for invalid subplot or layer indices', () => {
      expect(() => getHeatmapData(maidrData, 1)).toThrow('Invalid subplot or layer index');
      expect(() => getHeatmapData(maidrData, 0, 1)).toThrow('Invalid subplot or layer index');
    });
  });

  describe('edge Cases', () => {
    it('should handle empty rows correctly', () => {
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
      expect(getAverageForYValue(dataWithEmptyRow, 0)).toBe(15);
      expect(getAverageForYValue(dataWithEmptyRow, 2)).toBe(35);
    });

    it('should handle single value heatmap', () => {
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
