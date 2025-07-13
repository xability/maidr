import type { HistogramPoint } from '@type/grammar';
import { expect } from '@jest/globals';

interface ChartLayer {
  type: string;
  selector: string;
  axes: {
    x: string;
    y: string;
  };
  data: HistogramPoint[];
}

interface ChartSubplot {
  layers: ChartLayer[];
}

interface MaidrChart {
  id: string;
  title: string;
  subplots: ChartSubplot[][];
}

class HistogramDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistogramDataError';
  }
}

const maidrData: MaidrChart = {
  id: 'hist',
  title: 'Distribution of Engine Displacement',
  subplots: [
    [
      {
        layers: [
          {
            type: 'hist',
            selector: 'g[id^="geom_rect"] > rect',
            axes: {
              x: 'Displacement',
              y: 'Count',
            },
            data: [
              {
                y: 19,
                x: 1.7053,
                xMin: 1.5632,
                xMax: 1.8474,
                yMin: 0,
                yMax: 19,
              },
              {
                y: 24,
                x: 1.9895,
                xMin: 1.8474,
                xMax: 2.1316,
                yMin: 0,
                yMax: 24,
              },
              {
                y: 19,
                x: 2.2737,
                xMin: 2.1316,
                xMax: 2.4158,
                yMin: 0,
                yMax: 19,
              },
              {
                y: 28,
                x: 2.5579,
                xMin: 2.4158,
                xMax: 2.7,
                yMin: 0,
                yMax: 28,
              },
              {
                y: 10,
                x: 2.8421,
                xMin: 2.7,
                xMax: 2.9842,
                yMin: 0,
                yMax: 10,
              },
              {
                y: 14,
                x: 3.1263,
                xMin: 2.9842,
                xMax: 3.2684,
                yMin: 0,
                yMax: 14,
              },
              {
                y: 18,
                x: 3.4105,
                xMin: 3.2684,
                xMax: 3.5526,
                yMin: 0,
                yMax: 18,
              },
              {
                y: 13,
                x: 3.6947,
                xMin: 3.5526,
                xMax: 3.8368,
                yMin: 0,
                yMax: 13,
              },
              {
                y: 18,
                x: 3.9789,
                xMin: 3.8368,
                xMax: 4.1211,
                yMin: 0,
                yMax: 18,
              },
              {
                y: 5,
                x: 4.2632,
                xMin: 4.1211,
                xMax: 4.4053,
                yMin: 0,
                yMax: 5,
              },
              {
                y: 11,
                x: 4.5474,
                xMin: 4.4053,
                xMax: 4.6895,
                yMin: 0,
                yMax: 11,
              },
              {
                y: 17,
                x: 4.8316,
                xMin: 4.6895,
                xMax: 4.9737,
                yMin: 0,
                yMax: 17,
              },
              {
                y: 7,
                x: 5.1158,
                xMin: 4.9737,
                xMax: 5.2579,
                yMin: 0,
                yMax: 7,
              },
              {
                y: 14,
                x: 5.4,
                xMin: 5.2579,
                xMax: 5.5421,
                yMin: 0,
                yMax: 14,
              },
              {
                y: 9,
                x: 5.6842,
                xMin: 5.5421,
                xMax: 5.8263,
                yMin: 0,
                yMax: 9,
              },
              {
                y: 4,
                x: 5.9684,
                xMin: 5.8263,
                xMax: 6.1105,
                yMin: 0,
                yMax: 4,
              },
              {
                y: 2,
                x: 6.2526,
                xMin: 6.1105,
                xMax: 6.3947,
                yMin: 0,
                yMax: 2,
              },
              {
                y: 1,
                x: 6.5368,
                xMin: 6.3947,
                xMax: 6.6789,
                yMin: 0,
                yMax: 1,
              },
              {
                y: 0,
                x: 6.8211,
                xMin: 6.6789,
                xMax: 6.9632,
                yMin: 0,
                yMax: 0,
              },
              {
                y: 1,
                x: 7.1053,
                xMin: 6.9632,
                xMax: 7.2474,
                yMin: 0,
                yMax: 1,
              },
            ],
          },
        ],
      },
    ],
  ],
};

function getHistogramData(
  chart: MaidrChart,
  subplotIndex = 0,
  subplotColIndex = 0,
  layerIndex = 0,
): HistogramPoint[] {
  if (!chart.subplots[subplotIndex]
    || !chart.subplots[subplotIndex][subplotColIndex]
    || !chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex]) {
    throw new HistogramDataError('Invalid subplot or layer index');
  }

  const layer = chart.subplots[subplotIndex][subplotColIndex].layers[layerIndex];
  if (layer.type !== 'hist') {
    throw new HistogramDataError(`Expected histogram layer, but found ${layer.type}`);
  }

  return layer.data;
}

function getMaximumCount(data: HistogramPoint[]): number {
  if (data.length === 0) {
    throw new HistogramDataError('Cannot get maximum count from empty data array');
  }
  return Math.max(...data.map(point => typeof point.y === 'number' ? point.y : Number.parseFloat(String(point.y))));
}

function getMinimumCount(data: HistogramPoint[]): number {
  if (data.length === 0) {
    throw new HistogramDataError('Cannot get minimum count from empty data array');
  }
  return Math.min(...data.map(point => typeof point.y === 'number' ? point.y : Number.parseFloat(String(point.y))));
}

function getTotalCount(data: HistogramPoint[]): number {
  if (data.length === 0) {
    throw new HistogramDataError('Cannot calculate total from empty data array');
  }
  return data.reduce((total, point) =>
    total + (typeof point.y === 'number' ? point.y : Number.parseFloat(String(point.y))), 0);
}

function getBinWidth(data: HistogramPoint[], index: number): number {
  if (data.length === 0) {
    throw new HistogramDataError('Cannot calculate bin width from empty data array');
  }
  if (index < 0 || index >= data.length) {
    throw new HistogramDataError(`Invalid bin index: ${index}. Valid range is 0-${data.length - 1}`);
  }

  return data[index].xMax - data[index].xMin;
}

function navigateHistogram(data: HistogramPoint[], currentIndex: number, direction: 1 | -1): number {
  const newIndex = currentIndex + direction;

  if (newIndex < 0) {
    return data.length - 1;
  } else if (newIndex >= data.length) {
    return 0;
  }

  return newIndex;
}

function findBinContainingValue(data: HistogramPoint[], xValue: number): number {
  return data.findIndex(bin => xValue >= bin.xMin && xValue < bin.xMax);
}

function findModeIndex(data: HistogramPoint[]): number {
  if (data.length === 0) {
    throw new HistogramDataError('Cannot find mode in empty data array');
  }

  let maxCount = -1;
  let maxIndex = -1;

  data.forEach((bin, index) => {
    const count = typeof bin.y === 'number' ? bin.y : Number.parseFloat(String(bin.y));
    if (count > maxCount) {
      maxCount = count;
      maxIndex = index;
    }
  });

  return maxIndex;
}

describe('histogram Data Tests', () => {
  let histData: HistogramPoint[];

  beforeEach(() => {
    histData = getHistogramData(maidrData);
  });

  describe('data Structure Validation', () => {
    it('should have valid histogram chart structure', () => {
      const layer = maidrData.subplots[0][0].layers[0];

      expect(layer.type).toBe('hist');
      expect(maidrData.id).toBeDefined();
      expect(maidrData.title).toBe('Distribution of Engine Displacement');
      expect(layer.axes).toHaveProperty('x');
      expect(layer.axes).toHaveProperty('y');
      expect(Array.isArray(layer.data)).toBe(true);
    });

    it('should contain valid histogram data points', () => {
      histData.forEach((point) => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');
        expect(point).toHaveProperty('xMin');
        expect(point).toHaveProperty('xMax');
        expect(point).toHaveProperty('yMin');
        expect(point).toHaveProperty('yMax');
        expect(point.xMin).toBeLessThan(point.xMax);
        expect(point.x).toBeGreaterThanOrEqual(point.xMin);
        expect(point.x).toBeLessThanOrEqual(point.xMax);
      });
    });

    it('should have uniform bin widths', () => {
      const firstBinWidth = histData[0].xMax - histData[0].xMin;
      const tolerance = 0.001;

      histData.forEach((bin, index) => {
        const binWidth = bin.xMax - bin.xMin;
        if (index < histData.length - 1) {
          expect(Math.abs(binWidth - firstBinWidth)).toBeLessThanOrEqual(tolerance);
        }
      });
    });
  });

  describe('data Value Verification', () => {
    it('should have correct number of data points', () => {
      expect(histData.length).toBe(20);
    });

    it('should identify maximum count correctly', () => {
      const maxCount = getMaximumCount(histData);
      expect(maxCount).toBe(28);
    });

    it('should identify minimum count correctly', () => {
      const minCount = getMinimumCount(histData);
      expect(minCount).toBe(0);
    });

    it('should calculate bin width correctly', () => {
      const binIndex = 5;
      const expectedWidth = histData[binIndex].xMax - histData[binIndex].xMin;
      const binWidth = getBinWidth(histData, binIndex);
      expect(binWidth).toBeCloseTo(expectedWidth, 5);
      expect(binWidth).toBeCloseTo(0.2842, 4);
    });
  });

  describe('navigation Operations', () => {
    it('should navigate to the next bin correctly', () => {
      const currentIndex = 0;
      const nextIndex = navigateHistogram(histData, currentIndex, 1);
      expect(nextIndex).toBe(1);
      expect(histData[nextIndex].x).toBeCloseTo(1.9895, 4);
    });

    it('should navigate to the previous bin correctly', () => {
      const currentIndex = 1;
      const prevIndex = navigateHistogram(histData, currentIndex, -1);
      expect(prevIndex).toBe(0);
      expect(histData[prevIndex].x).toBeCloseTo(1.7053, 4);
    });

    it('should wrap around to the first bin when navigating past the last bin', () => {
      const currentIndex = histData.length - 1;
      const nextIndex = navigateHistogram(histData, currentIndex, 1);
      expect(nextIndex).toBe(0);
      expect(histData[nextIndex].x).toBeCloseTo(1.7053, 4);
    });

    it('should wrap around to the last bin when navigating before the first bin', () => {
      const currentIndex = 0;
      const prevIndex = navigateHistogram(histData, currentIndex, -1);
      expect(prevIndex).toBe(histData.length - 1);
      expect(histData[prevIndex].x).toBeCloseTo(7.1053, 4);
    });
  });

  describe('search Operations', () => {
    it('should find bin containing specific x value', () => {
      const valueToFind = 3.5;
      const binIndex = findBinContainingValue(histData, valueToFind);
      expect(binIndex).toBe(6);
      expect(histData[binIndex].xMin).toBeLessThanOrEqual(valueToFind);
      expect(histData[binIndex].xMax).toBeGreaterThan(valueToFind);
    });

    it('should return -1 for x value outside range', () => {
      const valueOutsideRange = 10.0;
      const binIndex = findBinContainingValue(histData, valueOutsideRange);
      expect(binIndex).toBe(-1);
    });

    it('should find the mode (bin with highest frequency)', () => {
      const expectedModeIndex = 3;
      const modeIndex = findModeIndex(histData);
      expect(modeIndex).toBe(expectedModeIndex);
    });
  });

  describe('error Handling', () => {
    it('should throw error for empty data array when getting maximum count', () => {
      const emptyData: HistogramPoint[] = [];
      expect(() => getMaximumCount(emptyData)).toThrow(HistogramDataError);
    });

    it('should throw error for empty data array when getting minimum count', () => {
      const emptyData: HistogramPoint[] = [];
      expect(() => getMinimumCount(emptyData)).toThrow(HistogramDataError);
    });

    it('should throw error for invalid bin index', () => {
      const invalidIndex = 50;
      expect(() => getBinWidth(histData, invalidIndex)).toThrow(HistogramDataError);
    });

    it('should correctly handle bins with zero count', () => {
      const zeroBinIndex = 18;
      expect(histData[zeroBinIndex].y).toBe(0);
    });

    it('should throw error for invalid subplot or layer indices', () => {
      expect(() => getHistogramData(maidrData, 1)).toThrow(HistogramDataError);
      expect(() => getHistogramData(maidrData, 0, 1)).toThrow(HistogramDataError);
      expect(() => getHistogramData({ ...maidrData, subplots: [[{ layers: [{ type: 'bar', data: [], selector: '', axes: { x: '', y: '' } }] }]] }, 0, 0, 0))
        .toThrow('Expected histogram layer, but found bar');
    });
  });

  describe('edge Cases', () => {
    it('should handle single-bin histogram', () => {
      const singleBinData: MaidrChart = {
        id: 'single-bin-hist',
        title: 'Single Bin Histogram',
        subplots: [[{
          layers: [{
            type: 'hist',
            selector: '',
            axes: { x: 'X', y: 'Y' },
            data: [{
              y: 10,
              x: 5,
              xMin: 0,
              xMax: 10,
              yMin: 0,
              yMax: 10,
            }],
          }],
        }]],
      };

      const singleBinHistData = getHistogramData(singleBinData);
      expect(singleBinHistData.length).toBe(1);
      expect(getMaximumCount(singleBinHistData)).toBe(10);
      expect(getMinimumCount(singleBinHistData)).toBe(10);
      expect(getTotalCount(singleBinHistData)).toBe(10);
      expect(getBinWidth(singleBinHistData, 0)).toBe(10);
      expect(findModeIndex(singleBinHistData)).toBe(0);
    });

    it('should handle string y-values by parsing them to numbers', () => {
      const stringYData: HistogramPoint[] = [
        { ...histData[0], y: '19' as unknown as number },
        { ...histData[1], y: '24' as unknown as number },
      ];

      expect(getMaximumCount(stringYData)).toBe(24);
      expect(getMinimumCount(stringYData)).toBe(19);
      expect(getTotalCount(stringYData)).toBe(43);
    });
  });
});
