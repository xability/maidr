import { expect } from '@jest/globals';

interface Point {
  x: number;
  y: number;
}

interface ChartLayer {
  id: string;
  type: string;
  selectors: string[];
  axes: {
    x: string;
    y: string;
  };
  data: Point[][];
}

interface ChartSubplot {
  layers: ChartLayer[];
}

interface MaidrChart {
  id: string;
  title: string;
  subplots: ChartSubplot[][];
}

class SmoothPlotDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmoothPlotDataError';
  }
}

const maidrData: MaidrChart = {
  id: 'scatter',
  title: 'Highway Mileage by Engine Displacement',
  subplots: [
    [
      {
        layers: [
          {
            id: '0',
            type: 'point',
            selectors: ['g[id^="geom_point"] > use'],
            axes: {
              x: 'Engine Displacement',
              y: 'Highway Mileage',
            },
            data: [[
              {
                x: 1.8,
                y: 29,
              },
              {
                x: 1.8,
                y: 29,
              },
              {
                x: 2,
                y: 31,
              },
              {
                x: 2,
                y: 30,
              },
              {
                x: 2.8,
                y: 26,
              },
              {
                x: 2.8,
                y: 26,
              },
              {
                x: 3.1,
                y: 27,
              },
              {
                x: 1.8,
                y: 26,
              },
              {
                x: 1.8,
                y: 25,
              },
              {
                x: 2,
                y: 28,
              },
              {
                x: 2,
                y: 27,
              },
              {
                x: 2.8,
                y: 25,
              },
              {
                x: 2.8,
                y: 25,
              },
              {
                x: 3.1,
                y: 25,
              },
              {
                x: 3.1,
                y: 25,
              },
              {
                x: 2.8,
                y: 24,
              },
              {
                x: 3.1,
                y: 25,
              },
              {
                x: 4.2,
                y: 23,
              },
              {
                x: 5.3,
                y: 20,
              },
              {
                x: 5.3,
                y: 15,
              },
              {
                x: 5.3,
                y: 20,
              },
              {
                x: 5.7,
                y: 17,
              },
              {
                x: 6,
                y: 17,
              },
              {
                x: 5.7,
                y: 26,
              },
              {
                x: 5.7,
                y: 23,
              },
              {
                x: 6.2,
                y: 26,
              },
              {
                x: 6.2,
                y: 25,
              },
              {
                x: 7,
                y: 24,
              },
              {
                x: 5.3,
                y: 19,
              },
              {
                x: 5.3,
                y: 14,
              },
              {
                x: 5.7,
                y: 15,
              },
              {
                x: 6.5,
                y: 17,
              },
              {
                x: 2.4,
                y: 27,
              },
              {
                x: 2.4,
                y: 30,
              },
              {
                x: 3.1,
                y: 26,
              },
              {
                x: 3.5,
                y: 29,
              },
              {
                x: 3.6,
                y: 26,
              },
              {
                x: 2.4,
                y: 24,
              },
              {
                x: 3,
                y: 24,
              },
              {
                x: 3.3,
                y: 22,
              },
              {
                x: 3.3,
                y: 22,
              },
              {
                x: 3.3,
                y: 24,
              },
              {
                x: 3.3,
                y: 24,
              },
              {
                x: 3.3,
                y: 17,
              },
              {
                x: 3.8,
                y: 22,
              },
              {
                x: 3.8,
                y: 21,
              },
              {
                x: 3.8,
                y: 23,
              },
              {
                x: 4,
                y: 23,
              },
              {
                x: 3.7,
                y: 19,
              },
              {
                x: 3.7,
                y: 18,
              },
              {
                x: 3.9,
                y: 17,
              },
              {
                x: 3.9,
                y: 17,
              },
              {
                x: 4.7,
                y: 19,
              },
              {
                x: 4.7,
                y: 19,
              },
              {
                x: 4.7,
                y: 12,
              },
              {
                x: 5.2,
                y: 17,
              },
              {
                x: 5.2,
                y: 15,
              },
              {
                x: 3.9,
                y: 17,
              },
              {
                x: 4.7,
                y: 17,
              },
              {
                x: 4.7,
                y: 12,
              },
              {
                x: 4.7,
                y: 17,
              },
              {
                x: 5.2,
                y: 16,
              },
              {
                x: 5.7,
                y: 18,
              },
              {
                x: 5.9,
                y: 15,
              },
              {
                x: 4.7,
                y: 16,
              },
              {
                x: 4.7,
                y: 12,
              },
              {
                x: 4.7,
                y: 17,
              },
              {
                x: 4.7,
                y: 17,
              },
              {
                x: 4.7,
                y: 16,
              },
              {
                x: 4.7,
                y: 12,
              },
              {
                x: 5.2,
                y: 15,
              },
              {
                x: 5.2,
                y: 16,
              },
              {
                x: 5.7,
                y: 17,
              },
              {
                x: 5.9,
                y: 15,
              },
              {
                x: 4.6,
                y: 17,
              },
              {
                x: 5.4,
                y: 17,
              },
              {
                x: 5.4,
                y: 18,
              },
              {
                x: 4,
                y: 17,
              },
              {
                x: 4,
                y: 19,
              },
              {
                x: 4,
                y: 17,
              },
              {
                x: 4,
                y: 19,
              },
              {
                x: 4.6,
                y: 19,
              },
              {
                x: 5,
                y: 17,
              },
              {
                x: 4.2,
                y: 17,
              },
              {
                x: 4.2,
                y: 17,
              },
              {
                x: 4.6,
                y: 16,
              },
              {
                x: 4.6,
                y: 16,
              },
              {
                x: 4.6,
                y: 17,
              },
              {
                x: 5.4,
                y: 15,
              },
              {
                x: 5.4,
                y: 17,
              },
              {
                x: 3.8,
                y: 26,
              },
              {
                x: 3.8,
                y: 25,
              },
              {
                x: 4,
                y: 26,
              },
              {
                x: 4,
                y: 24,
              },
              {
                x: 4.6,
                y: 21,
              },
              {
                x: 4.6,
                y: 22,
              },
              {
                x: 4.6,
                y: 23,
              },
              {
                x: 4.6,
                y: 22,
              },
              {
                x: 5.4,
                y: 20,
              },
              {
                x: 1.6,
                y: 33,
              },
              {
                x: 1.6,
                y: 32,
              },
              {
                x: 1.6,
                y: 32,
              },
              {
                x: 1.6,
                y: 29,
              },
              {
                x: 1.6,
                y: 32,
              },
              {
                x: 1.8,
                y: 34,
              },
              {
                x: 1.8,
                y: 36,
              },
              {
                x: 1.8,
                y: 36,
              },
              {
                x: 2,
                y: 29,
              },
              {
                x: 2.4,
                y: 26,
              },
              {
                x: 2.4,
                y: 27,
              },
              {
                x: 2.4,
                y: 30,
              },
              {
                x: 2.4,
                y: 31,
              },
              {
                x: 2.5,
                y: 26,
              },
              {
                x: 2.5,
                y: 26,
              },
              {
                x: 3.3,
                y: 28,
              },
              {
                x: 2,
                y: 26,
              },
              {
                x: 2,
                y: 29,
              },
              {
                x: 2,
                y: 28,
              },
              {
                x: 2,
                y: 27,
              },
              {
                x: 2.7,
                y: 24,
              },
              {
                x: 2.7,
                y: 24,
              },
              {
                x: 2.7,
                y: 24,
              },
              {
                x: 3,
                y: 22,
              },
              {
                x: 3.7,
                y: 19,
              },
              {
                x: 4,
                y: 20,
              },
              {
                x: 4.7,
                y: 17,
              },
              {
                x: 4.7,
                y: 12,
              },
              {
                x: 4.7,
                y: 19,
              },
              {
                x: 5.7,
                y: 18,
              },
              {
                x: 6.1,
                y: 14,
              },
              {
                x: 4,
                y: 15,
              },
              {
                x: 4.2,
                y: 18,
              },
              {
                x: 4.4,
                y: 18,
              },
              {
                x: 4.6,
                y: 15,
              },
              {
                x: 5.4,
                y: 17,
              },
              {
                x: 5.4,
                y: 16,
              },
              {
                x: 5.4,
                y: 18,
              },
              {
                x: 4,
                y: 17,
              },
              {
                x: 4,
                y: 19,
              },
              {
                x: 4.6,
                y: 19,
              },
              {
                x: 5,
                y: 17,
              },
              {
                x: 2.4,
                y: 29,
              },
              {
                x: 2.4,
                y: 27,
              },
              {
                x: 2.5,
                y: 31,
              },
              {
                x: 2.5,
                y: 32,
              },
              {
                x: 3.5,
                y: 27,
              },
              {
                x: 3.5,
                y: 26,
              },
              {
                x: 3,
                y: 26,
              },
              {
                x: 3,
                y: 25,
              },
              {
                x: 3.5,
                y: 25,
              },
              {
                x: 3.3,
                y: 17,
              },
              {
                x: 3.3,
                y: 17,
              },
              {
                x: 4,
                y: 20,
              },
              {
                x: 5.6,
                y: 18,
              },
              {
                x: 3.1,
                y: 26,
              },
              {
                x: 3.8,
                y: 26,
              },
              {
                x: 3.8,
                y: 27,
              },
              {
                x: 3.8,
                y: 28,
              },
              {
                x: 5.3,
                y: 25,
              },
              {
                x: 2.5,
                y: 25,
              },
              {
                x: 2.5,
                y: 24,
              },
              {
                x: 2.5,
                y: 27,
              },
              {
                x: 2.5,
                y: 25,
              },
              {
                x: 2.5,
                y: 26,
              },
              {
                x: 2.5,
                y: 23,
              },
              {
                x: 2.2,
                y: 26,
              },
              {
                x: 2.2,
                y: 26,
              },
              {
                x: 2.5,
                y: 26,
              },
              {
                x: 2.5,
                y: 26,
              },
              {
                x: 2.5,
                y: 25,
              },
              {
                x: 2.5,
                y: 27,
              },
              {
                x: 2.5,
                y: 25,
              },
              {
                x: 2.5,
                y: 27,
              },
              {
                x: 2.7,
                y: 20,
              },
              {
                x: 2.7,
                y: 20,
              },
              {
                x: 3.4,
                y: 19,
              },
              {
                x: 3.4,
                y: 17,
              },
              {
                x: 4,
                y: 20,
              },
              {
                x: 4.7,
                y: 17,
              },
              {
                x: 2.2,
                y: 29,
              },
              {
                x: 2.2,
                y: 27,
              },
              {
                x: 2.4,
                y: 31,
              },
              {
                x: 2.4,
                y: 31,
              },
              {
                x: 3,
                y: 26,
              },
              {
                x: 3,
                y: 26,
              },
              {
                x: 3.5,
                y: 28,
              },
              {
                x: 2.2,
                y: 27,
              },
              {
                x: 2.2,
                y: 29,
              },
              {
                x: 2.4,
                y: 31,
              },
              {
                x: 2.4,
                y: 31,
              },
              {
                x: 3,
                y: 26,
              },
              {
                x: 3,
                y: 26,
              },
              {
                x: 3.3,
                y: 27,
              },
              {
                x: 1.8,
                y: 30,
              },
              {
                x: 1.8,
                y: 33,
              },
              {
                x: 1.8,
                y: 35,
              },
              {
                x: 1.8,
                y: 37,
              },
              {
                x: 1.8,
                y: 35,
              },
              {
                x: 4.7,
                y: 15,
              },
              {
                x: 5.7,
                y: 18,
              },
              {
                x: 2.7,
                y: 20,
              },
              {
                x: 2.7,
                y: 20,
              },
              {
                x: 2.7,
                y: 22,
              },
              {
                x: 3.4,
                y: 17,
              },
              {
                x: 3.4,
                y: 19,
              },
              {
                x: 4,
                y: 18,
              },
              {
                x: 4,
                y: 20,
              },
              {
                x: 2,
                y: 29,
              },
              {
                x: 2,
                y: 26,
              },
              {
                x: 2,
                y: 29,
              },
              {
                x: 2,
                y: 29,
              },
              {
                x: 2.8,
                y: 24,
              },
              {
                x: 1.9,
                y: 44,
              },
              {
                x: 2,
                y: 29,
              },
              {
                x: 2,
                y: 26,
              },
              {
                x: 2,
                y: 29,
              },
              {
                x: 2,
                y: 29,
              },
              {
                x: 2.5,
                y: 29,
              },
              {
                x: 2.5,
                y: 29,
              },
              {
                x: 2.8,
                y: 23,
              },
              {
                x: 2.8,
                y: 24,
              },
              {
                x: 1.9,
                y: 44,
              },
              {
                x: 1.9,
                y: 41,
              },
              {
                x: 2,
                y: 29,
              },
              {
                x: 2,
                y: 26,
              },
              {
                x: 2.5,
                y: 28,
              },
              {
                x: 2.5,
                y: 29,
              },
              {
                x: 1.8,
                y: 29,
              },
              {
                x: 1.8,
                y: 29,
              },
              {
                x: 2,
                y: 28,
              },
              {
                x: 2,
                y: 29,
              },
              {
                x: 2.8,
                y: 26,
              },
              {
                x: 2.8,
                y: 26,
              },
              {
                x: 3.6,
                y: 26,
              },
            ]],
          },
          {
            id: '1',
            type: 'smooth',
            selectors: ['g[id^="geom_smooth.gTree"] > g[id^="GRID.polyline"] > polyline[id^="GRID.polyline"]'],
            axes: {
              x: 'Engine Displacement',
              y: 'Highway Mileage',
            },
            data: [
              [
                {
                  x: 1.6,
                  y: 33.0929,
                },
                {
                  x: 1.6684,
                  y: 32.5108,
                },
                {
                  x: 1.7367,
                  y: 31.9422,
                },
                {
                  x: 1.8051,
                  y: 31.3885,
                },
                {
                  x: 1.8734,
                  y: 30.8509,
                },
                {
                  x: 1.9418,
                  y: 30.33,
                },
                {
                  x: 2.0101,
                  y: 29.8239,
                },
                {
                  x: 2.0785,
                  y: 29.3334,
                },
                {
                  x: 2.1468,
                  y: 28.8584,
                },
                {
                  x: 2.2152,
                  y: 28.3981,
                },
                {
                  x: 2.2835,
                  y: 27.9519,
                },
                {
                  x: 2.3519,
                  y: 27.5189,
                },
                {
                  x: 2.4203,
                  y: 27.0988,
                },
                {
                  x: 2.4886,
                  y: 26.6958,
                },
                {
                  x: 2.557,
                  y: 26.3091,
                },
                {
                  x: 2.6253,
                  y: 25.9356,
                },
                {
                  x: 2.6937,
                  y: 25.5722,
                },
                {
                  x: 2.762,
                  y: 25.2292,
                },
                {
                  x: 2.8304,
                  y: 24.9182,
                },
                {
                  x: 2.8987,
                  y: 24.6299,
                },
                {
                  x: 2.9671,
                  y: 24.3547,
                },
                {
                  x: 3.0354,
                  y: 24.083,
                },
                {
                  x: 3.1038,
                  y: 23.8055,
                },
                {
                  x: 3.1722,
                  y: 23.5296,
                },
                {
                  x: 3.2405,
                  y: 23.2646,
                },
                {
                  x: 3.3089,
                  y: 23.0081,
                },
                {
                  x: 3.3772,
                  y: 22.7575,
                },
                {
                  x: 3.4456,
                  y: 22.5103,
                },
                {
                  x: 3.5139,
                  y: 22.264,
                },
                {
                  x: 3.5823,
                  y: 22.016,
                },
                {
                  x: 3.6506,
                  y: 21.764,
                },
                {
                  x: 3.719,
                  y: 21.5053,
                },
                {
                  x: 3.7873,
                  y: 21.2375,
                },
                {
                  x: 3.8557,
                  y: 20.9581,
                },
                {
                  x: 3.9241,
                  y: 20.6637,
                },
                {
                  x: 3.9924,
                  y: 20.3464,
                },
                {
                  x: 4.0608,
                  y: 20.0114,
                },
                {
                  x: 4.1291,
                  y: 19.6675,
                },
                {
                  x: 4.1975,
                  y: 19.3234,
                },
                {
                  x: 4.2658,
                  y: 18.9875,
                },
                {
                  x: 4.3342,
                  y: 18.6688,
                },
                {
                  x: 4.4025,
                  y: 18.3758,
                },
                {
                  x: 4.4709,
                  y: 18.1171,
                },
                {
                  x: 4.5392,
                  y: 17.9016,
                },
                {
                  x: 4.6076,
                  y: 17.7375,
                },
                {
                  x: 4.6759,
                  y: 17.6039,
                },
                {
                  x: 4.7443,
                  y: 17.4845,
                },
                {
                  x: 4.8127,
                  y: 17.3804,
                },
                {
                  x: 4.881,
                  y: 17.2928,
                },
                {
                  x: 4.9494,
                  y: 17.2228,
                },
                {
                  x: 5.0177,
                  y: 17.1716,
                },
                {
                  x: 5.0861,
                  y: 17.1404,
                },
                {
                  x: 5.1544,
                  y: 17.1304,
                },
                {
                  x: 5.2228,
                  y: 17.1426,
                },
                {
                  x: 5.2911,
                  y: 17.1783,
                },
                {
                  x: 5.3595,
                  y: 17.2365,
                },
                {
                  x: 5.4278,
                  y: 17.3143,
                },
                {
                  x: 5.4962,
                  y: 17.4115,
                },
                {
                  x: 5.5646,
                  y: 17.5283,
                },
                {
                  x: 5.6329,
                  y: 17.6646,
                },
                {
                  x: 5.7013,
                  y: 17.8204,
                },
                {
                  x: 5.7696,
                  y: 17.9957,
                },
                {
                  x: 5.838,
                  y: 18.1904,
                },
                {
                  x: 5.9063,
                  y: 18.4046,
                },
                {
                  x: 5.9747,
                  y: 18.6382,
                },
                {
                  x: 6.043,
                  y: 18.8913,
                },
                {
                  x: 6.1114,
                  y: 19.1637,
                },
                {
                  x: 6.1797,
                  y: 19.4556,
                },
                {
                  x: 6.2481,
                  y: 19.7669,
                },
                {
                  x: 6.3165,
                  y: 20.0975,
                },
                {
                  x: 6.3848,
                  y: 20.4475,
                },
                {
                  x: 6.4532,
                  y: 20.8169,
                },
                {
                  x: 6.5215,
                  y: 21.2057,
                },
                {
                  x: 6.5899,
                  y: 21.6138,
                },
                {
                  x: 6.6582,
                  y: 22.0412,
                },
                {
                  x: 6.7266,
                  y: 22.4879,
                },
                {
                  x: 6.7949,
                  y: 22.9539,
                },
                {
                  x: 6.8633,
                  y: 23.4392,
                },
                {
                  x: 6.9316,
                  y: 23.9438,
                },
                {
                  x: 7,
                  y: 24.4677,
                },
              ],
            ],
          },
        ],
      },
    ],
  ],
};

function getPointData(chart: MaidrChart): Point[] {
  const layer = chart.subplots[0][0].layers[0];
  if (layer.type !== 'point') {
    throw new SmoothPlotDataError(`Expected point layer, but found ${layer.type}`);
  }
  return layer.data.flat();
}

function getSmoothData(chart: MaidrChart): Point[] {
  const layer = chart.subplots[0][0].layers[1];
  if (layer.type !== 'smooth') {
    throw new SmoothPlotDataError(`Expected smooth layer, but found ${layer.type}`);
  }
  return layer.data[0];
}

function getMaximumValue(data: Point[]): number {
  if (data.length === 0) {
    throw new SmoothPlotDataError('Cannot get maximum value from empty data array');
  }
  return Math.max(...data.map(point => point.y));
}

function getMinimumValue(data: Point[]): number {
  if (data.length === 0) {
    throw new SmoothPlotDataError('Cannot get minimum value from empty data array');
  }
  return Math.min(...data.map(point => point.y));
}

function getMaximumX(data: Point[]): number {
  if (data.length === 0) {
    throw new SmoothPlotDataError('Cannot get maximum X value from empty data array');
  }
  return Math.max(...data.map(point => point.x));
}

function getMinimumX(data: Point[]): number {
  if (data.length === 0) {
    throw new SmoothPlotDataError('Cannot get minimum X value from empty data array');
  }
  return Math.min(...data.map(point => point.x));
}

describe('smooth Plot Data Tests', () => {
  let pointData: Point[];
  let smoothData: Point[];

  beforeEach(() => {
    pointData = getPointData(maidrData);
    smoothData = getSmoothData(maidrData);
  });

  describe('data Structure Validation', () => {
    it('should have valid smooth plot chart structure', () => {
      const pointLayer = maidrData.subplots[0][0].layers[0];
      const smoothLayer = maidrData.subplots[0][0].layers[1];

      expect(maidrData.id).toBe('scatter');
      expect(maidrData.title).toBe('Highway Mileage by Engine Displacement');
      expect(pointLayer.type).toBe('point');
      expect(smoothLayer.type).toBe('smooth');
      expect(pointLayer.axes).toHaveProperty('x');
      expect(pointLayer.axes).toHaveProperty('y');
      expect(smoothLayer.axes).toHaveProperty('x');
      expect(smoothLayer.axes).toHaveProperty('y');
    });

    it('should contain valid point data', () => {
      pointData.forEach((point) => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');
        expect(typeof point.x).toBe('number');
        expect(typeof point.y).toBe('number');
      });
    });

    it('should contain valid smooth line data', () => {
      smoothData.forEach((point) => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');
        expect(typeof point.x).toBe('number');
        expect(typeof point.y).toBe('number');
      });
    });
  });

  describe('data Value Verification', () => {
    it('should have correct point data values', () => {
      const firstPoint = pointData[0];
      expect(firstPoint.x).toBe(1.8);
      expect(firstPoint.y).toBe(29);
    });

    it('should have correct smooth line data values', () => {
      const firstSmoothPoint = smoothData[0];
      expect(firstSmoothPoint.x).toBe(1.6);
      expect(firstSmoothPoint.y).toBeCloseTo(33.0929, 4);
    });

    it('should identify maximum values correctly', () => {
      expect(getMaximumValue(pointData)).toBeGreaterThan(0);
      expect(getMaximumValue(smoothData)).toBeGreaterThan(0);
    });

    it('should identify minimum values correctly', () => {
      expect(getMinimumValue(pointData)).toBeGreaterThanOrEqual(0);
      expect(getMinimumValue(smoothData)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('data Range Analysis', () => {
    it('should have valid X-axis range', () => {
      const minX = getMinimumX(pointData);
      const maxX = getMaximumX(pointData);
      expect(minX).toBeLessThan(maxX);
      expect(minX).toBeGreaterThanOrEqual(0);
    });

    it('should have valid Y-axis range', () => {
      const minY = getMinimumValue(pointData);
      const maxY = getMaximumValue(pointData);
      expect(minY).toBeLessThan(maxY);
      expect(minY).toBeGreaterThanOrEqual(0);
    });

    it('should have smooth line data within point data range', () => {
      const pointMinX = getMinimumX(pointData);
      const pointMaxX = getMaximumX(pointData);
      const smoothMinX = getMinimumX(smoothData);
      const smoothMaxX = getMaximumX(smoothData);

      expect(smoothMinX).toBeGreaterThanOrEqual(pointMinX);
      expect(smoothMaxX).toBeLessThanOrEqual(pointMaxX);
    });
  });

  describe('error Handling', () => {
    it('should throw error when getting maximum value from empty data', () => {
      const emptyData: Point[] = [];
      expect(() => getMaximumValue(emptyData)).toThrow(SmoothPlotDataError);
    });

    it('should throw error when getting minimum value from empty data', () => {
      const emptyData: Point[] = [];
      expect(() => getMinimumValue(emptyData)).toThrow(SmoothPlotDataError);
    });

    it('should throw error for invalid layer type', () => {
      const invalidChart = {
        ...maidrData,
        subplots: [[{
          layers: [{
            ...maidrData.subplots[0][0].layers[0],
            type: 'invalid',
          }],
        }]],
      };
      expect(() => getPointData(invalidChart)).toThrow(SmoothPlotDataError);
    });
  });

  describe('edge Cases', () => {
    it('should handle single data point', () => {
      const singlePointChart = {
        ...maidrData,
        subplots: [[{
          layers: [{
            ...maidrData.subplots[0][0].layers[0],
            data: [[maidrData.subplots[0][0].layers[0].data[0][0]]],
          }],
        }]],
      };
      const data = getPointData(singlePointChart);
      expect(data.length).toBe(1);
      expect(getMaximumValue(data)).toBe(getMinimumValue(data));
    });

    it('should handle smooth line with single point', () => {
      const singleSmoothChart = {
        ...maidrData,
        subplots: [[{
          layers: [{
            ...maidrData.subplots[0][0].layers[0],
            data: [[maidrData.subplots[0][0].layers[0].data[0][0]]],
          }, {
            ...maidrData.subplots[0][0].layers[1],
            data: [[maidrData.subplots[0][0].layers[1].data[0][0]]],
          }],
        }]],
      };
      const data = getSmoothData(singleSmoothChart);
      expect(data.length).toBe(1);
      expect(getMaximumValue(data)).toBe(getMinimumValue(data));
    });
  });
});
