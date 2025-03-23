import { expect } from '@jest/globals';

interface TimeSeriesPoint {
  x: string;
  y: number;
}

interface ChartLayer {
  type: string;
  selector: string;
  axes: {
    x: string;
    y: string;
  };
  data: TimeSeriesPoint[][];
}

interface ChartSubplot {
  layers: ChartLayer[];
}

interface MaidrChart {
  id: string;
  title: string;
  subplots: ChartSubplot[][];
}

class LineChartDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LineChartDataError';
  }
}

const maidrData: MaidrChart = {
  id: 'line',
  title: 'Unemployment Rate Over Time',
  subplots: [
    [
      {
        layers: [
          {
            type: 'line',
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
                { x: '1970-02-01', y: 3453 },
                { x: '1970-03-01', y: 3635 },
                { x: '1970-04-01', y: 3797 },
                { x: '1970-05-01', y: 3919 },
                { x: '1970-06-01', y: 4071 },
                { x: '1970-07-01', y: 4175 },
                { x: '1970-08-01', y: 4256 },
                { x: '1970-09-01', y: 4456 },
                { x: '1970-10-01', y: 4591 },
                { x: '1970-11-01', y: 4898 },
                { x: '1970-12-01', y: 5076 },
              ],
            ],
          },
        ],
      },
    ],
  ],
};

function getLineData(
  chart: MaidrChart,
  subplotIndex = 0,
  subplotColIndex = 0,
  layerIndex = 0,
  seriesIndex = 0,
): TimeSeriesPoint[] {
  if (!chart.subplots[subplotIndex]
    || !chart.subplots[subplotIndex][subplotColIndex]
    || !chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex]) {
    throw new LineChartDataError('Invalid subplot or layer index');
  }

  const layer = chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex];
  if (layer.type !== 'line') {
    throw new LineChartDataError(`Expected line layer, but found ${layer.type}`);
  }

  if (!layer.data[seriesIndex]) {
    throw new LineChartDataError(`Series index ${seriesIndex} does not exist`);
  }

  return layer.data[seriesIndex];
}

function getMaximumValue(data: TimeSeriesPoint[]): number {
  if (data.length === 0) {
    throw new LineChartDataError('Cannot get maximum value from empty data array');
  }

  return Math.max(...data.map(point => point.y));
}

function getMinimumValue(data: TimeSeriesPoint[]): number {
  if (data.length === 0) {
    throw new LineChartDataError('Cannot get minimum value from empty data array');
  }

  return Math.min(...data.map(point => point.y));
}

function getAverageValue(data: TimeSeriesPoint[]): number {
  if (data.length === 0) {
    throw new LineChartDataError('Cannot calculate average from empty data array');
  }

  const sum = data.reduce((total, point) => total + point.y, 0);

  return sum / data.length;
}

function findDataPointByDate(data: TimeSeriesPoint[], date: string): TimeSeriesPoint | undefined {
  return data.find(point => point.x === date);
}

function navigateLine(data: TimeSeriesPoint[], currentIndex: number, direction: 1 | -1): number {
  const newIndex = currentIndex + direction;

  if (newIndex < 0) {
    return data.length - 1;
  } else if (newIndex >= data.length) {
    return 0;
  }

  return newIndex;
}

function extractYear(dateStr: string): number {
  return Number.parseInt(dateStr.split('-')[0], 10);
}

function findPointsByYear(data: TimeSeriesPoint[], year: number): TimeSeriesPoint[] {
  return data.filter(point => extractYear(point.x) === year);
}

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
  let lineData: TimeSeriesPoint[];

  beforeEach(() => {
    lineData = getLineData(maidrData);
  });

  describe('Data Structure Validation', () => {
    test('should have valid line chart structure', () => {
      const layer = maidrData.subplots[0][0].layers[0];

      expect(layer.type).toBe('line');
      expect(maidrData.id).toBeDefined();
      expect(maidrData.title).toBe('Unemployment Rate Over Time');
      expect(layer.axes).toHaveProperty('x');
      expect(layer.axes).toHaveProperty('y');
      expect(Array.isArray(layer.data)).toBe(true);
      expect(layer.data.length).toBeGreaterThan(0);
      expect(Array.isArray(layer.data[0])).toBe(true);
    });

    test('should contain valid line data points', () => {
      lineData.forEach((point) => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');
        expect(typeof point.y).toBe('number');
        expect(point.x).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    test('should have chronologically ordered data', () => {
      for (let i = 1; i < lineData.length; i++) {
        const currentDate = new Date(lineData[i].x);
        const prevDate = new Date(lineData[i - 1].x);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(prevDate.getTime());
      }
    });
  });

  describe('Data Value Verification', () => {
    test('should have correct data points for specific dates', () => {
      const july1967 = findDataPointByDate(lineData, '1967-07-01');
      const dec1967 = findDataPointByDate(lineData, '1967-12-01');
      const jan1970 = findDataPointByDate(lineData, '1970-01-01');

      expect(july1967).toBeDefined();
      expect(july1967?.y).toBe(2944);
      expect(dec1967).toBeDefined();
      expect(dec1967?.y).toBe(3018);
      expect(jan1970).toBeDefined();
      expect(jan1970?.y).toBe(3201);
    });

    test('should identify maximum value correctly', () => {
      const maxValue = getMaximumValue(lineData);
      expect(maxValue).toBeGreaterThan(3000);
      const jan1970 = findDataPointByDate(lineData, '1970-01-01');
      if (jan1970) {
        expect(maxValue).toBeGreaterThanOrEqual(jan1970.y);
      }
    });

    test('should identify minimum value correctly', () => {
      const minValue = getMinimumValue(lineData);
      expect(minValue).toBeLessThan(3000);
      const dec1968 = findDataPointByDate(lineData, '1968-12-01');
      if (dec1968) {
        expect(minValue).toBeLessThanOrEqual(dec1968.y);
      }
    });

    test('should calculate average value correctly', () => {
      const avgValue = getAverageValue(lineData);
      expect(avgValue).toBeGreaterThan(0);
      expect(typeof avgValue).toBe('number');
    });
  });

  describe('Time Series Analysis', () => {
    test('should group data points by year correctly', () => {
      const points1967 = findPointsByYear(lineData, 1967);
      const points1968 = findPointsByYear(lineData, 1968);
      const points1969 = findPointsByYear(lineData, 1969);

      expect(points1967.length).toBe(6);
      expect(points1968.length).toBe(12);
      expect(points1969.length).toBe(12);
    });

    test('should calculate yearly averages correctly', () => {
      const yearlyAverages = calculateYearlyAverages(lineData);
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
      const points1969 = findPointsByYear(lineData, 1969);
      const points1970 = findPointsByYear(lineData, 1970);

      const avg1969 = points1969.reduce((sum, point) => sum + point.y, 0) / points1969.length;
      const avg1970 = points1970.reduce((sum, point) => sum + point.y, 0) / points1970.length;

      expect(avg1970).toBeGreaterThan(avg1969);
    });
  });

  describe('Navigation Operations', () => {
    test('should navigate to the next point correctly', () => {
      const currentIndex = 0;
      const nextIndex = navigateLine(lineData, currentIndex, 1);

      expect(nextIndex).toBe(1);
      expect(lineData[nextIndex].x).toBe('1967-08-01');
    });

    test('should navigate to the previous point correctly', () => {
      const currentIndex = 1;
      const prevIndex = navigateLine(lineData, currentIndex, -1);

      expect(prevIndex).toBe(0);
      expect(lineData[prevIndex].x).toBe('1967-07-01');
    });

    test('should wrap around to the first point when navigating past the last point', () => {
      const currentIndex = lineData.length - 1;
      const nextIndex = navigateLine(lineData, currentIndex, 1);

      expect(nextIndex).toBe(0);
      expect(lineData[nextIndex].x).toBe('1967-07-01');
    });

    test('should wrap around to the last point when navigating before the first point', () => {
      const currentIndex = 0;
      const prevIndex = navigateLine(lineData, currentIndex, -1);

      expect(prevIndex).toBe(lineData.length - 1);
      const lastDate = lineData[prevIndex].x;
      expect(lastDate).toBeDefined();
    });
  });

  describe('Error Handling', () => {
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

    test('should throw error for invalid subplot or layer indices', () => {
      expect(() => getLineData(maidrData, 1)).toThrow(LineChartDataError);
      expect(() => getLineData(maidrData, 0, 1)).toThrow(LineChartDataError);
    });

    test('should return undefined when finding nonexistent date', () => {
      const result = findDataPointByDate(lineData, '1900-01-01');
      expect(result).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    test('should handle navigation on single-element array', () => {
      const singleElementData: TimeSeriesPoint[] = [{ x: '2000-01-01', y: 100 }];
      const nextIndex = navigateLine(singleElementData, 0, 1);
      const prevIndex = navigateLine(singleElementData, 0, -1);

      expect(nextIndex).toBe(0);
      expect(prevIndex).toBe(0);
    });

    test('should handle dates at year boundaries', () => {
      const dec1969 = findDataPointByDate(lineData, '1969-12-01');
      const jan1970 = findDataPointByDate(lineData, '1970-01-01');

      expect(dec1969).toBeDefined();
      expect(jan1970).toBeDefined();
      expect(extractYear(dec1969!.x)).toBe(1969);
      expect(extractYear(jan1970!.x)).toBe(1970);
    });

    test('should handle yearly calculations with partial data', () => {
      const partialData = [
        { x: '1967-01-01', y: 1000 },
        { x: '1967-02-01', y: 1100 },
        { x: '1968-01-01', y: 1200 },
      ];

      const yearlyAverages = calculateYearlyAverages(partialData);
      expect(yearlyAverages.get(1967)).toBe(1050);
      expect(yearlyAverages.get(1968)).toBe(1200);
    });
  });
});
