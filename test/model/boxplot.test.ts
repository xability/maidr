import type { BoxPoint } from '@model/grammar';
import { expect } from '@jest/globals';

interface ChartLayer {
  type: string;
  orientation: string;
  selector: string;
  axes: {
    x: string;
    y: string;
  };
  data: BoxPoint[];
}

interface ChartSubplot {
  layers: ChartLayer[];
}

interface MaidrChart {
  id: string;
  subplots: ChartSubplot[][];
}

const maidrData: MaidrChart = {
  id: 'boxplot1',
  subplots: [
    [
      {
        layers: [
          {
            type: 'box',
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
          },
        ],
      },
    ],
  ],
};

function getBoxData(
  chart: MaidrChart,
  subplotIndex = 0,
  subplotColIndex = 0,
  layerIndex = 0,
): BoxPoint[] {
  if (!chart.subplots[subplotIndex]
    || !chart.subplots[subplotIndex][subplotColIndex]
    || !chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex]) {
    throw new Error('Invalid subplot or layer index');
  }

  const layer = chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex];
  if (layer.type !== 'box') {
    throw new Error(`Expected box layer, but found ${layer.type}`);
  }

  return layer.data;
}

function getMaximumMedian(data: BoxPoint[]): number {
  if (data.length === 0) {
    throw new Error('Cannot get maximum median from empty data array');
  }
  return Math.max(...data.map(point => point.q2));
}

function getMinimumMedian(data: BoxPoint[]): number {
  if (data.length === 0) {
    throw new Error('Cannot get minimum median from empty data array');
  }
  return Math.min(...data.map(point => point.q2));
}

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

function findBoxByFill(data: BoxPoint[], fillValue: string): BoxPoint | undefined {
  return data.find(point => point.fill === fillValue);
}

function countOutliers(point: BoxPoint): number {
  return (point.lowerOutliers?.length || 0) + (point.upperOutliers?.length || 0);
}

function navigateBox(data: BoxPoint[], currentIndex: number, direction: 1 | -1): number {
  const newIndex = currentIndex + direction;
  if (newIndex < 0) {
    return data.length - 1;
  } else if (newIndex >= data.length) {
    return 0;
  }

  return newIndex;
}

describe('box Plot Data Tests', () => {
  let boxData: BoxPoint[];

  beforeEach(() => {
    boxData = getBoxData(maidrData);
  });

  describe('data Structure Validation', () => {
    it('should have valid boxplot chart structure', () => {
      const layer = maidrData.subplots[0][0].layers[0];

      expect(layer.type).toBe('box');
      expect(maidrData.id).toBeDefined();
      expect(layer.orientation).toBeDefined();
      expect(layer.selector).toBeDefined();
      expect(layer.axes).toHaveProperty('x');
      expect(layer.axes).toHaveProperty('y');
      expect(Array.isArray(layer.data)).toBe(true);
    });

    it('should have valid box points in data array', () => {
      boxData.forEach((point) => {
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

    it('should have expected number of continents', () => {
      expect(boxData.length).toBe(5);

      const continents = boxData.map(point => point.fill);
      expect(continents).toContain('Africa');
      expect(continents).toContain('Americas');
      expect(continents).toContain('Asia');
      expect(continents).toContain('Europe');
      expect(continents).toContain('Oceania');
    });
  });

  describe('data Value Verification', () => {
    it('should have correct quartile values for Africa', () => {
      const africa = findBoxByFill(boxData, 'Africa');
      expect(africa).toBeDefined();
      expect(africa!.min).toBe(30);
      expect(africa!.q1).toBe(42.361);
      expect(africa!.q2).toBe(47.792);
      expect(africa!.q3).toBe(54.416);
      expect(africa!.max).toBe(72.301);
    });

    it('should have correct number of outliers for each continent', () => {
      const africa = findBoxByFill(boxData, 'Africa')!;
      expect(countOutliers(africa)).toBe(10);

      const europe = findBoxByFill(boxData, 'Europe')!;
      expect(countOutliers(europe)).toBe(14);

      const oceania = findBoxByFill(boxData, 'Oceania')!;
      expect(countOutliers(oceania)).toBe(0);
    });

    it('should identify maximum median value correctly', () => {
      const maxMedian = getMaximumMedian(boxData);
      expect(maxMedian).toBe(73.665);
    });

    it('should identify minimum median value correctly', () => {
      const minMedian = getMinimumMedian(boxData);
      expect(minMedian).toBe(47.792);
    });
  });

  describe('navigation Operations', () => {
    it('should navigate to the next box correctly', () => {
      const currentIndex = 0;
      const nextIndex = navigateBox(boxData, currentIndex, 1);
      expect(nextIndex).toBe(1);
      expect(boxData[nextIndex].fill).toBe('Americas');
    });

    it('should navigate to the previous box correctly', () => {
      const currentIndex = 1;
      const prevIndex = navigateBox(boxData, currentIndex, -1);
      expect(prevIndex).toBe(0);
      expect(boxData[prevIndex].fill).toBe('Africa');
    });

    it('should wrap around to the first box when navigating past the last box', () => {
      const currentIndex = boxData.length - 1;
      const nextIndex = navigateBox(boxData, currentIndex, 1);
      expect(nextIndex).toBe(0);
      expect(boxData[nextIndex].fill).toBe('Africa');
    });

    it('should wrap around to the last box when navigating before the first box', () => {
      const currentIndex = 0;
      const prevIndex = navigateBox(boxData, currentIndex, -1);
      expect(prevIndex).toBe(boxData.length - 1);
      expect(boxData[prevIndex].fill).toBe('Oceania');
    });
  });

  describe('search Operations', () => {
    it('should find box by fill value', () => {
      const asia = findBoxByFill(boxData, 'Asia');
      expect(asia).toBeDefined();
      expect(asia!.min).toBe(28.801);
      expect(asia!.max).toBe(82.603);
    });

    it('should return undefined for non-existent fill value', () => {
      const nonExistent = findBoxByFill(boxData, 'Antarctica');
      expect(nonExistent).toBeUndefined();
    });
  });

  describe('error Handling', () => {
    it('should throw error when getting max median with empty data', () => {
      const emptyData: BoxPoint[] = [];
      expect(() => getMaximumMedian(emptyData)).toThrow();
    });

    it('should throw error when getting min median with empty data', () => {
      const emptyData: BoxPoint[] = [];
      expect(() => getMinimumMedian(emptyData)).toThrow();
    });

    it('should throw error when getting highest IQR with empty data', () => {
      const emptyData: BoxPoint[] = [];
      expect(() => getHighestIQR(emptyData)).toThrow();
    });

    it('should throw error when getting lowest IQR with empty data', () => {
      const emptyData: BoxPoint[] = [];
      expect(() => getLowestIQR(emptyData)).toThrow();
    });

    it('should throw error for invalid subplot or layer indices', () => {
      expect(() => getBoxData(maidrData, 1)).toThrow('Invalid subplot or layer index');
      expect(() => getBoxData(maidrData, 0, 1)).toThrow('Invalid subplot or layer index');
    });
  });
});
