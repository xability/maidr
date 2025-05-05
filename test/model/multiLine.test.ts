import { describe, expect, it } from '@jest/globals';

interface MaidrPlotLayer {
  id: string;
  type: string;
  selectors: string | string[];
  axes: {
    x: string;
    y: string;
  };
  data: { fill: string; x: number; y: number }[][];
}

interface MaidrPlotSubplot {
  layers: MaidrPlotLayer[];
}

interface MaidrPlot {
  id: string;
  title: string;
  subplots: MaidrPlotSubplot[][];
}

const maidrData: MaidrPlot = {
  id: 'line',
  title: 'Flipper Length & Bill Length Over Data Points',
  subplots: [
    [
      {
        layers: [
          {
            id: '0',
            type: 'line',
            selectors: ['g#line2d_16 > path', 'g#line2d_17 > path'],
            axes: {
              x: 'Index',
              y: 'Length',
            },
            data: [
              [
                {
                  fill: 'Bill Length',
                  x: 0.0,
                  y: 39.1,
                },
                {
                  fill: 'Bill Length',
                  x: 1.0,
                  y: 39.5,
                },
                {
                  fill: 'Bill Length',
                  x: 2.0,
                  y: 40.3,
                },
                {
                  fill: 'Bill Length',
                  x: 3.0,
                  y: 36.7,
                },
                {
                  fill: 'Bill Length',
                  x: 4.0,
                  y: 39.3,
                },
                {
                  fill: 'Bill Length',
                  x: 5.0,
                  y: 38.9,
                },
                {
                  fill: 'Bill Length',
                  x: 6.0,
                  y: 39.2,
                },
                {
                  fill: 'Bill Length',
                  x: 7.0,
                  y: 41.1,
                },
                {
                  fill: 'Bill Length',
                  x: 8.0,
                  y: 38.6,
                },
                {
                  fill: 'Bill Length',
                  x: 9.0,
                  y: 34.6,
                },
                {
                  fill: 'Bill Length',
                  x: 10.0,
                  y: 36.6,
                },
                {
                  fill: 'Bill Length',
                  x: 11.0,
                  y: 38.7,
                },
                {
                  fill: 'Bill Length',
                  x: 12.0,
                  y: 42.5,
                },
                {
                  fill: 'Bill Length',
                  x: 13.0,
                  y: 34.4,
                },
                {
                  fill: 'Bill Length',
                  x: 14.0,
                  y: 46.0,
                },
                {
                  fill: 'Bill Length',
                  x: 15.0,
                  y: 37.8,
                },
                {
                  fill: 'Bill Length',
                  x: 16.0,
                  y: 37.7,
                },
                {
                  fill: 'Bill Length',
                  x: 17.0,
                  y: 35.9,
                },
                {
                  fill: 'Bill Length',
                  x: 18.0,
                  y: 38.2,
                },
                {
                  fill: 'Bill Length',
                  x: 19.0,
                  y: 38.8,
                },
                {
                  fill: 'Bill Length',
                  x: 20.0,
                  y: 35.3,
                },
                {
                  fill: 'Bill Length',
                  x: 21.0,
                  y: 40.6,
                },
                {
                  fill: 'Bill Length',
                  x: 22.0,
                  y: 40.5,
                },
                {
                  fill: 'Bill Length',
                  x: 23.0,
                  y: 37.9,
                },
                {
                  fill: 'Bill Length',
                  x: 24.0,
                  y: 40.5,
                },
                {
                  fill: 'Bill Length',
                  x: 25.0,
                  y: 39.5,
                },
                {
                  fill: 'Bill Length',
                  x: 26.0,
                  y: 37.2,
                },
                {
                  fill: 'Bill Length',
                  x: 27.0,
                  y: 39.5,
                },
                {
                  fill: 'Bill Length',
                  x: 28.0,
                  y: 40.9,
                },
                {
                  fill: 'Bill Length',
                  x: 29.0,
                  y: 36.4,
                },
                {
                  fill: 'Bill Length',
                  x: 30.0,
                  y: 39.2,
                },
                {
                  fill: 'Bill Length',
                  x: 31.0,
                  y: 38.8,
                },
                {
                  fill: 'Bill Length',
                  x: 32.0,
                  y: 42.2,
                },
                {
                  fill: 'Bill Length',
                  x: 33.0,
                  y: 37.6,
                },
                {
                  fill: 'Bill Length',
                  x: 34.0,
                  y: 39.8,
                },
                {
                  fill: 'Bill Length',
                  x: 35.0,
                  y: 36.5,
                },
                {
                  fill: 'Bill Length',
                  x: 36.0,
                  y: 40.8,
                },
                {
                  fill: 'Bill Length',
                  x: 37.0,
                  y: 36.0,
                },
                {
                  fill: 'Bill Length',
                  x: 38.0,
                  y: 44.1,
                },
                {
                  fill: 'Bill Length',
                  x: 39.0,
                  y: 37.0,
                },
                {
                  fill: 'Bill Length',
                  x: 40.0,
                  y: 39.6,
                },
                {
                  fill: 'Bill Length',
                  x: 41.0,
                  y: 41.1,
                },
                {
                  fill: 'Bill Length',
                  x: 42.0,
                  y: 36.0,
                },
                {
                  fill: 'Bill Length',
                  x: 43.0,
                  y: 42.3,
                },
                {
                  fill: 'Bill Length',
                  x: 44.0,
                  y: 39.6,
                },
                {
                  fill: 'Bill Length',
                  x: 45.0,
                  y: 40.1,
                },
                {
                  fill: 'Bill Length',
                  x: 46.0,
                  y: 35.0,
                },
                {
                  fill: 'Bill Length',
                  x: 47.0,
                  y: 42.0,
                },
                {
                  fill: 'Bill Length',
                  x: 48.0,
                  y: 34.5,
                },
                {
                  fill: 'Bill Length',
                  x: 49.0,
                  y: 41.4,
                },
                {
                  fill: 'Bill Length',
                  x: 50.0,
                  y: 39.0,
                },
                {
                  fill: 'Bill Length',
                  x: 51.0,
                  y: 40.6,
                },
                {
                  fill: 'Bill Length',
                  x: 52.0,
                  y: 36.5,
                },
                {
                  fill: 'Bill Length',
                  x: 53.0,
                  y: 37.6,
                },
                {
                  fill: 'Bill Length',
                  x: 54.0,
                  y: 35.7,
                },
                {
                  fill: 'Bill Length',
                  x: 55.0,
                  y: 41.3,
                },
                {
                  fill: 'Bill Length',
                  x: 56.0,
                  y: 37.6,
                },
                {
                  fill: 'Bill Length',
                  x: 57.0,
                  y: 41.1,
                },
                {
                  fill: 'Bill Length',
                  x: 58.0,
                  y: 36.4,
                },
                {
                  fill: 'Bill Length',
                  x: 59.0,
                  y: 41.6,
                },
                {
                  fill: 'Bill Length',
                  x: 60.0,
                  y: 35.5,
                },
                {
                  fill: 'Bill Length',
                  x: 61.0,
                  y: 41.1,
                },
                {
                  fill: 'Bill Length',
                  x: 62.0,
                  y: 35.9,
                },
                {
                  fill: 'Bill Length',
                  x: 63.0,
                  y: 41.8,
                },
                {
                  fill: 'Bill Length',
                  x: 64.0,
                  y: 33.5,
                },
                {
                  fill: 'Bill Length',
                  x: 65.0,
                  y: 39.7,
                },
                {
                  fill: 'Bill Length',
                  x: 66.0,
                  y: 39.6,
                },
                {
                  fill: 'Bill Length',
                  x: 67.0,
                  y: 45.8,
                },
                {
                  fill: 'Bill Length',
                  x: 68.0,
                  y: 35.5,
                },
                {
                  fill: 'Bill Length',
                  x: 69.0,
                  y: 42.8,
                },
                {
                  fill: 'Bill Length',
                  x: 70.0,
                  y: 40.9,
                },
                {
                  fill: 'Bill Length',
                  x: 71.0,
                  y: 37.2,
                },
                {
                  fill: 'Bill Length',
                  x: 72.0,
                  y: 36.2,
                },
                {
                  fill: 'Bill Length',
                  x: 73.0,
                  y: 42.1,
                },
                {
                  fill: 'Bill Length',
                  x: 74.0,
                  y: 34.6,
                },
                {
                  fill: 'Bill Length',
                  x: 75.0,
                  y: 42.9,
                },
                {
                  fill: 'Bill Length',
                  x: 76.0,
                  y: 36.7,
                },
                {
                  fill: 'Bill Length',
                  x: 77.0,
                  y: 35.1,
                },
                {
                  fill: 'Bill Length',
                  x: 78.0,
                  y: 37.3,
                },
                {
                  fill: 'Bill Length',
                  x: 79.0,
                  y: 41.3,
                },
                {
                  fill: 'Bill Length',
                  x: 80.0,
                  y: 36.3,
                },
                {
                  fill: 'Bill Length',
                  x: 81.0,
                  y: 36.9,
                },
                {
                  fill: 'Bill Length',
                  x: 82.0,
                  y: 38.3,
                },
                {
                  fill: 'Bill Length',
                  x: 83.0,
                  y: 38.9,
                },
                {
                  fill: 'Bill Length',
                  x: 84.0,
                  y: 35.7,
                },
                {
                  fill: 'Bill Length',
                  x: 85.0,
                  y: 41.1,
                },
                {
                  fill: 'Bill Length',
                  x: 86.0,
                  y: 34.0,
                },
                {
                  fill: 'Bill Length',
                  x: 87.0,
                  y: 39.6,
                },
                {
                  fill: 'Bill Length',
                  x: 88.0,
                  y: 36.2,
                },
                {
                  fill: 'Bill Length',
                  x: 89.0,
                  y: 40.8,
                },
                {
                  fill: 'Bill Length',
                  x: 90.0,
                  y: 38.1,
                },
                {
                  fill: 'Bill Length',
                  x: 91.0,
                  y: 40.3,
                },
                {
                  fill: 'Bill Length',
                  x: 92.0,
                  y: 33.1,
                },
                {
                  fill: 'Bill Length',
                  x: 93.0,
                  y: 43.2,
                },
                {
                  fill: 'Bill Length',
                  x: 94.0,
                  y: 35.0,
                },
                {
                  fill: 'Bill Length',
                  x: 95.0,
                  y: 41.0,
                },
                {
                  fill: 'Bill Length',
                  x: 96.0,
                  y: 37.7,
                },
                {
                  fill: 'Bill Length',
                  x: 97.0,
                  y: 37.8,
                },
                {
                  fill: 'Bill Length',
                  x: 98.0,
                  y: 37.9,
                },
                {
                  fill: 'Bill Length',
                  x: 99.0,
                  y: 39.7,
                },
                {
                  fill: 'Bill Length',
                  x: 100.0,
                  y: 38.6,
                },
                {
                  fill: 'Bill Length',
                  x: 101.0,
                  y: 38.2,
                },
                {
                  fill: 'Bill Length',
                  x: 102.0,
                  y: 38.1,
                },
                {
                  fill: 'Bill Length',
                  x: 103.0,
                  y: 43.2,
                },
                {
                  fill: 'Bill Length',
                  x: 104.0,
                  y: 38.1,
                },
                {
                  fill: 'Bill Length',
                  x: 105.0,
                  y: 45.6,
                },
                {
                  fill: 'Bill Length',
                  x: 106.0,
                  y: 39.7,
                },
                {
                  fill: 'Bill Length',
                  x: 107.0,
                  y: 42.2,
                },
                {
                  fill: 'Bill Length',
                  x: 108.0,
                  y: 39.6,
                },
                {
                  fill: 'Bill Length',
                  x: 109.0,
                  y: 42.7,
                },
                {
                  fill: 'Bill Length',
                  x: 110.0,
                  y: 38.6,
                },
                {
                  fill: 'Bill Length',
                  x: 111.0,
                  y: 37.3,
                },
                {
                  fill: 'Bill Length',
                  x: 112.0,
                  y: 35.7,
                },
                {
                  fill: 'Bill Length',
                  x: 113.0,
                  y: 41.1,
                },
                {
                  fill: 'Bill Length',
                  x: 114.0,
                  y: 36.2,
                },
                {
                  fill: 'Bill Length',
                  x: 115.0,
                  y: 37.7,
                },
                {
                  fill: 'Bill Length',
                  x: 116.0,
                  y: 40.2,
                },
                {
                  fill: 'Bill Length',
                  x: 117.0,
                  y: 41.4,
                },
                {
                  fill: 'Bill Length',
                  x: 118.0,
                  y: 35.2,
                },
                {
                  fill: 'Bill Length',
                  x: 119.0,
                  y: 40.6,
                },
                {
                  fill: 'Bill Length',
                  x: 120.0,
                  y: 38.8,
                },
                {
                  fill: 'Bill Length',
                  x: 121.0,
                  y: 41.5,
                },
                {
                  fill: 'Bill Length',
                  x: 122.0,
                  y: 39.0,
                },
                {
                  fill: 'Bill Length',
                  x: 123.0,
                  y: 44.1,
                },
                {
                  fill: 'Bill Length',
                  x: 124.0,
                  y: 38.5,
                },
                {
                  fill: 'Bill Length',
                  x: 125.0,
                  y: 43.1,
                },
                {
                  fill: 'Bill Length',
                  x: 126.0,
                  y: 36.8,
                },
                {
                  fill: 'Bill Length',
                  x: 127.0,
                  y: 37.5,
                },
                {
                  fill: 'Bill Length',
                  x: 128.0,
                  y: 38.1,
                },
                {
                  fill: 'Bill Length',
                  x: 129.0,
                  y: 41.1,
                },
                {
                  fill: 'Bill Length',
                  x: 130.0,
                  y: 35.6,
                },
                {
                  fill: 'Bill Length',
                  x: 131.0,
                  y: 40.2,
                },
                {
                  fill: 'Bill Length',
                  x: 132.0,
                  y: 37.0,
                },
                {
                  fill: 'Bill Length',
                  x: 133.0,
                  y: 39.7,
                },
                {
                  fill: 'Bill Length',
                  x: 134.0,
                  y: 40.2,
                },
                {
                  fill: 'Bill Length',
                  x: 135.0,
                  y: 40.6,
                },
                {
                  fill: 'Bill Length',
                  x: 136.0,
                  y: 32.1,
                },
                {
                  fill: 'Bill Length',
                  x: 137.0,
                  y: 40.7,
                },
                {
                  fill: 'Bill Length',
                  x: 138.0,
                  y: 37.3,
                },
                {
                  fill: 'Bill Length',
                  x: 139.0,
                  y: 39.0,
                },
                {
                  fill: 'Bill Length',
                  x: 140.0,
                  y: 39.2,
                },
                {
                  fill: 'Bill Length',
                  x: 141.0,
                  y: 36.6,
                },
                {
                  fill: 'Bill Length',
                  x: 142.0,
                  y: 36.0,
                },
                {
                  fill: 'Bill Length',
                  x: 143.0,
                  y: 37.8,
                },
                {
                  fill: 'Bill Length',
                  x: 144.0,
                  y: 36.0,
                },
                {
                  fill: 'Bill Length',
                  x: 145.0,
                  y: 41.5,
                },
                {
                  fill: 'Bill Length',
                  x: 146.0,
                  y: 46.5,
                },
                {
                  fill: 'Bill Length',
                  x: 147.0,
                  y: 50.0,
                },
                {
                  fill: 'Bill Length',
                  x: 148.0,
                  y: 51.3,
                },
                {
                  fill: 'Bill Length',
                  x: 149.0,
                  y: 45.4,
                },
                {
                  fill: 'Bill Length',
                  x: 150.0,
                  y: 52.7,
                },
                {
                  fill: 'Bill Length',
                  x: 151.0,
                  y: 45.2,
                },
                {
                  fill: 'Bill Length',
                  x: 152.0,
                  y: 46.1,
                },
                {
                  fill: 'Bill Length',
                  x: 153.0,
                  y: 51.3,
                },
                {
                  fill: 'Bill Length',
                  x: 154.0,
                  y: 46.0,
                },
                {
                  fill: 'Bill Length',
                  x: 155.0,
                  y: 51.3,
                },
                {
                  fill: 'Bill Length',
                  x: 156.0,
                  y: 46.6,
                },
                {
                  fill: 'Bill Length',
                  x: 157.0,
                  y: 51.7,
                },
                {
                  fill: 'Bill Length',
                  x: 158.0,
                  y: 47.0,
                },
                {
                  fill: 'Bill Length',
                  x: 159.0,
                  y: 52.0,
                },
                {
                  fill: 'Bill Length',
                  x: 160.0,
                  y: 45.9,
                },
                {
                  fill: 'Bill Length',
                  x: 161.0,
                  y: 50.5,
                },
                {
                  fill: 'Bill Length',
                  x: 162.0,
                  y: 50.3,
                },
                {
                  fill: 'Bill Length',
                  x: 163.0,
                  y: 58.0,
                },
                {
                  fill: 'Bill Length',
                  x: 164.0,
                  y: 46.4,
                },
                {
                  fill: 'Bill Length',
                  x: 165.0,
                  y: 49.2,
                },
                {
                  fill: 'Bill Length',
                  x: 166.0,
                  y: 42.4,
                },
                {
                  fill: 'Bill Length',
                  x: 167.0,
                  y: 48.5,
                },
                {
                  fill: 'Bill Length',
                  x: 168.0,
                  y: 43.2,
                },
                {
                  fill: 'Bill Length',
                  x: 169.0,
                  y: 50.6,
                },
                {
                  fill: 'Bill Length',
                  x: 170.0,
                  y: 46.7,
                },
                {
                  fill: 'Bill Length',
                  x: 171.0,
                  y: 52.0,
                },
                {
                  fill: 'Bill Length',
                  x: 172.0,
                  y: 50.5,
                },
                {
                  fill: 'Bill Length',
                  x: 173.0,
                  y: 49.5,
                },
                {
                  fill: 'Bill Length',
                  x: 174.0,
                  y: 46.4,
                },
                {
                  fill: 'Bill Length',
                  x: 175.0,
                  y: 52.8,
                },
                {
                  fill: 'Bill Length',
                  x: 176.0,
                  y: 40.9,
                },
                {
                  fill: 'Bill Length',
                  x: 177.0,
                  y: 54.2,
                },
                {
                  fill: 'Bill Length',
                  x: 178.0,
                  y: 42.5,
                },
                {
                  fill: 'Bill Length',
                  x: 179.0,
                  y: 51.0,
                },
                {
                  fill: 'Bill Length',
                  x: 180.0,
                  y: 49.7,
                },
                {
                  fill: 'Bill Length',
                  x: 181.0,
                  y: 47.5,
                },
                {
                  fill: 'Bill Length',
                  x: 182.0,
                  y: 47.6,
                },
                {
                  fill: 'Bill Length',
                  x: 183.0,
                  y: 52.0,
                },
                {
                  fill: 'Bill Length',
                  x: 184.0,
                  y: 46.9,
                },
                {
                  fill: 'Bill Length',
                  x: 185.0,
                  y: 53.5,
                },
                {
                  fill: 'Bill Length',
                  x: 186.0,
                  y: 49.0,
                },
                {
                  fill: 'Bill Length',
                  x: 187.0,
                  y: 46.2,
                },
                {
                  fill: 'Bill Length',
                  x: 188.0,
                  y: 50.9,
                },
                {
                  fill: 'Bill Length',
                  x: 189.0,
                  y: 45.5,
                },
                {
                  fill: 'Bill Length',
                  x: 190.0,
                  y: 50.9,
                },
                {
                  fill: 'Bill Length',
                  x: 191.0,
                  y: 50.8,
                },
                {
                  fill: 'Bill Length',
                  x: 192.0,
                  y: 50.1,
                },
                {
                  fill: 'Bill Length',
                  x: 193.0,
                  y: 49.0,
                },
                {
                  fill: 'Bill Length',
                  x: 194.0,
                  y: 51.5,
                },
                {
                  fill: 'Bill Length',
                  x: 195.0,
                  y: 49.8,
                },
                {
                  fill: 'Bill Length',
                  x: 196.0,
                  y: 48.1,
                },
                {
                  fill: 'Bill Length',
                  x: 197.0,
                  y: 51.4,
                },
                {
                  fill: 'Bill Length',
                  x: 198.0,
                  y: 45.7,
                },
                {
                  fill: 'Bill Length',
                  x: 199.0,
                  y: 50.7,
                },
                {
                  fill: 'Bill Length',
                  x: 200.0,
                  y: 42.5,
                },
                {
                  fill: 'Bill Length',
                  x: 201.0,
                  y: 52.2,
                },
                {
                  fill: 'Bill Length',
                  x: 202.0,
                  y: 45.2,
                },
                {
                  fill: 'Bill Length',
                  x: 203.0,
                  y: 49.3,
                },
                {
                  fill: 'Bill Length',
                  x: 204.0,
                  y: 50.2,
                },
                {
                  fill: 'Bill Length',
                  x: 205.0,
                  y: 45.6,
                },
                {
                  fill: 'Bill Length',
                  x: 206.0,
                  y: 51.9,
                },
                {
                  fill: 'Bill Length',
                  x: 207.0,
                  y: 46.8,
                },
                {
                  fill: 'Bill Length',
                  x: 208.0,
                  y: 45.7,
                },
                {
                  fill: 'Bill Length',
                  x: 209.0,
                  y: 55.8,
                },
                {
                  fill: 'Bill Length',
                  x: 210.0,
                  y: 43.5,
                },
                {
                  fill: 'Bill Length',
                  x: 211.0,
                  y: 49.6,
                },
                {
                  fill: 'Bill Length',
                  x: 212.0,
                  y: 50.8,
                },
                {
                  fill: 'Bill Length',
                  x: 213.0,
                  y: 50.2,
                },
                {
                  fill: 'Bill Length',
                  x: 214.0,
                  y: 46.1,
                },
                {
                  fill: 'Bill Length',
                  x: 215.0,
                  y: 50.0,
                },
                {
                  fill: 'Bill Length',
                  x: 216.0,
                  y: 48.7,
                },
                {
                  fill: 'Bill Length',
                  x: 217.0,
                  y: 50.0,
                },
                {
                  fill: 'Bill Length',
                  x: 218.0,
                  y: 47.6,
                },
                {
                  fill: 'Bill Length',
                  x: 219.0,
                  y: 46.5,
                },
                {
                  fill: 'Bill Length',
                  x: 220.0,
                  y: 45.4,
                },
                {
                  fill: 'Bill Length',
                  x: 221.0,
                  y: 46.7,
                },
                {
                  fill: 'Bill Length',
                  x: 222.0,
                  y: 43.3,
                },
                {
                  fill: 'Bill Length',
                  x: 223.0,
                  y: 46.8,
                },
                {
                  fill: 'Bill Length',
                  x: 224.0,
                  y: 40.9,
                },
                {
                  fill: 'Bill Length',
                  x: 225.0,
                  y: 49.0,
                },
                {
                  fill: 'Bill Length',
                  x: 226.0,
                  y: 45.5,
                },
                {
                  fill: 'Bill Length',
                  x: 227.0,
                  y: 48.4,
                },
                {
                  fill: 'Bill Length',
                  x: 228.0,
                  y: 45.8,
                },
                {
                  fill: 'Bill Length',
                  x: 229.0,
                  y: 49.3,
                },
                {
                  fill: 'Bill Length',
                  x: 230.0,
                  y: 42.0,
                },
                {
                  fill: 'Bill Length',
                  x: 231.0,
                  y: 49.2,
                },
                {
                  fill: 'Bill Length',
                  x: 232.0,
                  y: 46.2,
                },
                {
                  fill: 'Bill Length',
                  x: 233.0,
                  y: 48.7,
                },
                {
                  fill: 'Bill Length',
                  x: 234.0,
                  y: 50.2,
                },
                {
                  fill: 'Bill Length',
                  x: 235.0,
                  y: 45.1,
                },
                {
                  fill: 'Bill Length',
                  x: 236.0,
                  y: 46.5,
                },
                {
                  fill: 'Bill Length',
                  x: 237.0,
                  y: 46.3,
                },
                {
                  fill: 'Bill Length',
                  x: 238.0,
                  y: 42.9,
                },
                {
                  fill: 'Bill Length',
                  x: 239.0,
                  y: 46.1,
                },
                {
                  fill: 'Bill Length',
                  x: 240.0,
                  y: 47.8,
                },
                {
                  fill: 'Bill Length',
                  x: 241.0,
                  y: 48.2,
                },
                {
                  fill: 'Bill Length',
                  x: 242.0,
                  y: 50.0,
                },
                {
                  fill: 'Bill Length',
                  x: 243.0,
                  y: 47.3,
                },
                {
                  fill: 'Bill Length',
                  x: 244.0,
                  y: 42.8,
                },
                {
                  fill: 'Bill Length',
                  x: 245.0,
                  y: 45.1,
                },
                {
                  fill: 'Bill Length',
                  x: 246.0,
                  y: 59.6,
                },
                {
                  fill: 'Bill Length',
                  x: 247.0,
                  y: 49.1,
                },
                {
                  fill: 'Bill Length',
                  x: 248.0,
                  y: 48.4,
                },
                {
                  fill: 'Bill Length',
                  x: 249.0,
                  y: 42.6,
                },
                {
                  fill: 'Bill Length',
                  x: 250.0,
                  y: 44.4,
                },
                {
                  fill: 'Bill Length',
                  x: 251.0,
                  y: 44.0,
                },
                {
                  fill: 'Bill Length',
                  x: 252.0,
                  y: 48.7,
                },
                {
                  fill: 'Bill Length',
                  x: 253.0,
                  y: 42.7,
                },
                {
                  fill: 'Bill Length',
                  x: 254.0,
                  y: 49.6,
                },
                {
                  fill: 'Bill Length',
                  x: 255.0,
                  y: 45.3,
                },
                {
                  fill: 'Bill Length',
                  x: 256.0,
                  y: 49.6,
                },
                {
                  fill: 'Bill Length',
                  x: 257.0,
                  y: 50.5,
                },
                {
                  fill: 'Bill Length',
                  x: 258.0,
                  y: 43.6,
                },
                {
                  fill: 'Bill Length',
                  x: 259.0,
                  y: 45.5,
                },
                {
                  fill: 'Bill Length',
                  x: 260.0,
                  y: 50.5,
                },
                {
                  fill: 'Bill Length',
                  x: 261.0,
                  y: 44.9,
                },
                {
                  fill: 'Bill Length',
                  x: 262.0,
                  y: 45.2,
                },
                {
                  fill: 'Bill Length',
                  x: 263.0,
                  y: 46.6,
                },
                {
                  fill: 'Bill Length',
                  x: 264.0,
                  y: 48.5,
                },
                {
                  fill: 'Bill Length',
                  x: 265.0,
                  y: 45.1,
                },
                {
                  fill: 'Bill Length',
                  x: 266.0,
                  y: 50.1,
                },
                {
                  fill: 'Bill Length',
                  x: 267.0,
                  y: 46.5,
                },
                {
                  fill: 'Bill Length',
                  x: 268.0,
                  y: 45.0,
                },
                {
                  fill: 'Bill Length',
                  x: 269.0,
                  y: 43.8,
                },
                {
                  fill: 'Bill Length',
                  x: 270.0,
                  y: 45.5,
                },
                {
                  fill: 'Bill Length',
                  x: 271.0,
                  y: 43.2,
                },
                {
                  fill: 'Bill Length',
                  x: 272.0,
                  y: 50.4,
                },
                {
                  fill: 'Bill Length',
                  x: 273.0,
                  y: 45.3,
                },
                {
                  fill: 'Bill Length',
                  x: 274.0,
                  y: 46.2,
                },
                {
                  fill: 'Bill Length',
                  x: 275.0,
                  y: 45.7,
                },
                {
                  fill: 'Bill Length',
                  x: 276.0,
                  y: 54.3,
                },
                {
                  fill: 'Bill Length',
                  x: 277.0,
                  y: 45.8,
                },
                {
                  fill: 'Bill Length',
                  x: 278.0,
                  y: 49.8,
                },
                {
                  fill: 'Bill Length',
                  x: 279.0,
                  y: 49.5,
                },
                {
                  fill: 'Bill Length',
                  x: 280.0,
                  y: 43.5,
                },
                {
                  fill: 'Bill Length',
                  x: 281.0,
                  y: 50.7,
                },
                {
                  fill: 'Bill Length',
                  x: 282.0,
                  y: 47.7,
                },
                {
                  fill: 'Bill Length',
                  x: 283.0,
                  y: 46.4,
                },
                {
                  fill: 'Bill Length',
                  x: 284.0,
                  y: 48.2,
                },
                {
                  fill: 'Bill Length',
                  x: 285.0,
                  y: 46.5,
                },
                {
                  fill: 'Bill Length',
                  x: 286.0,
                  y: 46.4,
                },
                {
                  fill: 'Bill Length',
                  x: 287.0,
                  y: 48.6,
                },
                {
                  fill: 'Bill Length',
                  x: 288.0,
                  y: 47.5,
                },
                {
                  fill: 'Bill Length',
                  x: 289.0,
                  y: 51.1,
                },
                {
                  fill: 'Bill Length',
                  x: 290.0,
                  y: 45.2,
                },
                {
                  fill: 'Bill Length',
                  x: 291.0,
                  y: 45.2,
                },
                {
                  fill: 'Bill Length',
                  x: 292.0,
                  y: 49.1,
                },
                {
                  fill: 'Bill Length',
                  x: 293.0,
                  y: 52.5,
                },
                {
                  fill: 'Bill Length',
                  x: 294.0,
                  y: 47.4,
                },
                {
                  fill: 'Bill Length',
                  x: 295.0,
                  y: 50.0,
                },
                {
                  fill: 'Bill Length',
                  x: 296.0,
                  y: 44.9,
                },
                {
                  fill: 'Bill Length',
                  x: 297.0,
                  y: 50.8,
                },
                {
                  fill: 'Bill Length',
                  x: 298.0,
                  y: 43.4,
                },
                {
                  fill: 'Bill Length',
                  x: 299.0,
                  y: 51.3,
                },
                {
                  fill: 'Bill Length',
                  x: 300.0,
                  y: 47.5,
                },
                {
                  fill: 'Bill Length',
                  x: 301.0,
                  y: 52.1,
                },
                {
                  fill: 'Bill Length',
                  x: 302.0,
                  y: 47.5,
                },
                {
                  fill: 'Bill Length',
                  x: 303.0,
                  y: 52.2,
                },
                {
                  fill: 'Bill Length',
                  x: 304.0,
                  y: 45.5,
                },
                {
                  fill: 'Bill Length',
                  x: 305.0,
                  y: 49.5,
                },
                {
                  fill: 'Bill Length',
                  x: 306.0,
                  y: 44.5,
                },
                {
                  fill: 'Bill Length',
                  x: 307.0,
                  y: 50.8,
                },
                {
                  fill: 'Bill Length',
                  x: 308.0,
                  y: 49.4,
                },
                {
                  fill: 'Bill Length',
                  x: 309.0,
                  y: 46.9,
                },
                {
                  fill: 'Bill Length',
                  x: 310.0,
                  y: 48.4,
                },
                {
                  fill: 'Bill Length',
                  x: 311.0,
                  y: 51.1,
                },
                {
                  fill: 'Bill Length',
                  x: 312.0,
                  y: 48.5,
                },
                {
                  fill: 'Bill Length',
                  x: 313.0,
                  y: 55.9,
                },
                {
                  fill: 'Bill Length',
                  x: 314.0,
                  y: 47.2,
                },
                {
                  fill: 'Bill Length',
                  x: 315.0,
                  y: 49.1,
                },
                {
                  fill: 'Bill Length',
                  x: 316.0,
                  y: 46.8,
                },
                {
                  fill: 'Bill Length',
                  x: 317.0,
                  y: 41.7,
                },
                {
                  fill: 'Bill Length',
                  x: 318.0,
                  y: 53.4,
                },
                {
                  fill: 'Bill Length',
                  x: 319.0,
                  y: 43.3,
                },
                {
                  fill: 'Bill Length',
                  x: 320.0,
                  y: 48.1,
                },
                {
                  fill: 'Bill Length',
                  x: 321.0,
                  y: 50.5,
                },
                {
                  fill: 'Bill Length',
                  x: 322.0,
                  y: 49.8,
                },
                {
                  fill: 'Bill Length',
                  x: 323.0,
                  y: 43.5,
                },
                {
                  fill: 'Bill Length',
                  x: 324.0,
                  y: 51.5,
                },
                {
                  fill: 'Bill Length',
                  x: 325.0,
                  y: 46.2,
                },
                {
                  fill: 'Bill Length',
                  x: 326.0,
                  y: 55.1,
                },
                {
                  fill: 'Bill Length',
                  x: 327.0,
                  y: 48.8,
                },
                {
                  fill: 'Bill Length',
                  x: 328.0,
                  y: 47.2,
                },
                {
                  fill: 'Bill Length',
                  x: 329.0,
                  y: 46.8,
                },
                {
                  fill: 'Bill Length',
                  x: 330.0,
                  y: 50.4,
                },
                {
                  fill: 'Bill Length',
                  x: 331.0,
                  y: 45.2,
                },
                {
                  fill: 'Bill Length',
                  x: 332.0,
                  y: 49.9,
                },
              ],
              [
                {
                  fill: 'Flipper Length',
                  x: 0.0,
                  y: 181.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 1.0,
                  y: 186.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 2.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 3.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 4.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 5.0,
                  y: 181.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 6.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 7.0,
                  y: 182.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 8.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 9.0,
                  y: 198.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 10.0,
                  y: 185.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 11.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 12.0,
                  y: 197.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 13.0,
                  y: 184.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 14.0,
                  y: 194.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 15.0,
                  y: 174.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 16.0,
                  y: 180.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 17.0,
                  y: 189.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 18.0,
                  y: 185.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 19.0,
                  y: 180.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 20.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 21.0,
                  y: 183.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 22.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 23.0,
                  y: 172.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 24.0,
                  y: 180.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 25.0,
                  y: 178.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 26.0,
                  y: 178.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 27.0,
                  y: 188.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 28.0,
                  y: 184.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 29.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 30.0,
                  y: 196.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 31.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 32.0,
                  y: 180.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 33.0,
                  y: 181.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 34.0,
                  y: 184.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 35.0,
                  y: 182.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 36.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 37.0,
                  y: 186.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 38.0,
                  y: 196.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 39.0,
                  y: 185.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 40.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 41.0,
                  y: 182.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 42.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 43.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 44.0,
                  y: 186.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 45.0,
                  y: 188.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 46.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 47.0,
                  y: 200.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 48.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 49.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 50.0,
                  y: 186.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 51.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 52.0,
                  y: 181.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 53.0,
                  y: 194.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 54.0,
                  y: 185.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 55.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 56.0,
                  y: 185.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 57.0,
                  y: 192.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 58.0,
                  y: 184.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 59.0,
                  y: 192.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 60.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 61.0,
                  y: 188.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 62.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 63.0,
                  y: 198.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 64.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 65.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 66.0,
                  y: 196.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 67.0,
                  y: 197.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 68.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 69.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 70.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 71.0,
                  y: 184.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 72.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 73.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 74.0,
                  y: 189.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 75.0,
                  y: 196.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 76.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 77.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 78.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 79.0,
                  y: 194.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 80.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 81.0,
                  y: 189.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 82.0,
                  y: 189.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 83.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 84.0,
                  y: 202.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 85.0,
                  y: 205.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 86.0,
                  y: 185.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 87.0,
                  y: 186.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 88.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 89.0,
                  y: 208.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 90.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 91.0,
                  y: 196.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 92.0,
                  y: 178.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 93.0,
                  y: 192.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 94.0,
                  y: 192.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 95.0,
                  y: 203.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 96.0,
                  y: 183.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 97.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 98.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 99.0,
                  y: 184.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 100.0,
                  y: 199.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 101.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 102.0,
                  y: 181.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 103.0,
                  y: 197.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 104.0,
                  y: 198.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 105.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 106.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 107.0,
                  y: 197.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 108.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 109.0,
                  y: 196.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 110.0,
                  y: 188.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 111.0,
                  y: 199.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 112.0,
                  y: 189.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 113.0,
                  y: 189.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 114.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 115.0,
                  y: 198.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 116.0,
                  y: 176.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 117.0,
                  y: 202.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 118.0,
                  y: 186.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 119.0,
                  y: 199.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 120.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 121.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 122.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 123.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 124.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 125.0,
                  y: 197.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 126.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 127.0,
                  y: 199.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 128.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 129.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 130.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 131.0,
                  y: 200.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 132.0,
                  y: 185.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 133.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 134.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 135.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 136.0,
                  y: 188.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 137.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 138.0,
                  y: 192.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 139.0,
                  y: 185.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 140.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 141.0,
                  y: 184.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 142.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 143.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 144.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 145.0,
                  y: 201.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 146.0,
                  y: 192.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 147.0,
                  y: 196.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 148.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 149.0,
                  y: 188.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 150.0,
                  y: 197.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 151.0,
                  y: 198.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 152.0,
                  y: 178.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 153.0,
                  y: 197.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 154.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 155.0,
                  y: 198.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 156.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 157.0,
                  y: 194.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 158.0,
                  y: 185.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 159.0,
                  y: 201.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 160.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 161.0,
                  y: 201.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 162.0,
                  y: 197.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 163.0,
                  y: 181.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 164.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 165.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 166.0,
                  y: 181.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 167.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 168.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 169.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 170.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 171.0,
                  y: 197.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 172.0,
                  y: 200.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 173.0,
                  y: 200.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 174.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 175.0,
                  y: 205.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 176.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 177.0,
                  y: 201.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 178.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 179.0,
                  y: 203.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 180.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 181.0,
                  y: 199.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 182.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 183.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 184.0,
                  y: 192.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 185.0,
                  y: 205.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 186.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 187.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 188.0,
                  y: 196.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 189.0,
                  y: 196.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 190.0,
                  y: 196.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 191.0,
                  y: 201.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 192.0,
                  y: 190.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 193.0,
                  y: 212.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 194.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 195.0,
                  y: 198.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 196.0,
                  y: 199.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 197.0,
                  y: 201.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 198.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 199.0,
                  y: 203.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 200.0,
                  y: 187.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 201.0,
                  y: 197.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 202.0,
                  y: 191.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 203.0,
                  y: 203.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 204.0,
                  y: 202.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 205.0,
                  y: 194.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 206.0,
                  y: 206.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 207.0,
                  y: 189.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 208.0,
                  y: 195.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 209.0,
                  y: 207.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 210.0,
                  y: 202.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 211.0,
                  y: 193.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 212.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 213.0,
                  y: 198.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 214.0,
                  y: 211.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 215.0,
                  y: 230.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 216.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 217.0,
                  y: 218.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 218.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 219.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 220.0,
                  y: 211.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 221.0,
                  y: 219.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 222.0,
                  y: 209.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 223.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 224.0,
                  y: 214.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 225.0,
                  y: 216.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 226.0,
                  y: 214.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 227.0,
                  y: 213.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 228.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 229.0,
                  y: 217.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 230.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 231.0,
                  y: 221.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 232.0,
                  y: 209.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 233.0,
                  y: 222.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 234.0,
                  y: 218.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 235.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 236.0,
                  y: 213.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 237.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 238.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 239.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 240.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 241.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 242.0,
                  y: 220.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 243.0,
                  y: 222.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 244.0,
                  y: 209.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 245.0,
                  y: 207.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 246.0,
                  y: 230.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 247.0,
                  y: 220.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 248.0,
                  y: 220.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 249.0,
                  y: 213.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 250.0,
                  y: 219.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 251.0,
                  y: 208.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 252.0,
                  y: 208.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 253.0,
                  y: 208.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 254.0,
                  y: 225.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 255.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 256.0,
                  y: 216.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 257.0,
                  y: 222.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 258.0,
                  y: 217.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 259.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 260.0,
                  y: 225.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 261.0,
                  y: 213.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 262.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 263.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 264.0,
                  y: 220.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 265.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 266.0,
                  y: 225.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 267.0,
                  y: 217.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 268.0,
                  y: 220.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 269.0,
                  y: 208.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 270.0,
                  y: 220.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 271.0,
                  y: 208.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 272.0,
                  y: 224.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 273.0,
                  y: 208.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 274.0,
                  y: 221.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 275.0,
                  y: 214.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 276.0,
                  y: 231.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 277.0,
                  y: 219.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 278.0,
                  y: 230.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 279.0,
                  y: 229.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 280.0,
                  y: 220.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 281.0,
                  y: 223.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 282.0,
                  y: 216.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 283.0,
                  y: 221.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 284.0,
                  y: 221.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 285.0,
                  y: 217.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 286.0,
                  y: 216.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 287.0,
                  y: 230.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 288.0,
                  y: 209.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 289.0,
                  y: 220.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 290.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 291.0,
                  y: 223.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 292.0,
                  y: 212.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 293.0,
                  y: 221.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 294.0,
                  y: 212.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 295.0,
                  y: 224.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 296.0,
                  y: 212.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 297.0,
                  y: 228.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 298.0,
                  y: 218.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 299.0,
                  y: 218.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 300.0,
                  y: 212.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 301.0,
                  y: 230.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 302.0,
                  y: 218.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 303.0,
                  y: 228.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 304.0,
                  y: 212.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 305.0,
                  y: 224.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 306.0,
                  y: 214.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 307.0,
                  y: 226.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 308.0,
                  y: 216.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 309.0,
                  y: 222.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 310.0,
                  y: 203.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 311.0,
                  y: 225.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 312.0,
                  y: 219.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 313.0,
                  y: 228.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 314.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 315.0,
                  y: 228.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 316.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 317.0,
                  y: 210.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 318.0,
                  y: 219.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 319.0,
                  y: 208.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 320.0,
                  y: 209.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 321.0,
                  y: 216.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 322.0,
                  y: 229.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 323.0,
                  y: 213.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 324.0,
                  y: 230.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 325.0,
                  y: 217.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 326.0,
                  y: 230.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 327.0,
                  y: 222.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 328.0,
                  y: 214.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 329.0,
                  y: 215.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 330.0,
                  y: 222.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 331.0,
                  y: 212.0,
                },
                {
                  fill: 'Flipper Length',
                  x: 332.0,
                  y: 213.0,
                },
              ],
            ],
          },
        ],
      },
    ],
  ],
};

function getMultiLineData(multiLineData: MaidrPlot): MaidrPlot {
  if (!multiLineData.subplots || multiLineData.subplots.length === 0) {
    throw new Error('Cannot find multi-layer data in empty multiLayerData');
  }
  return multiLineData;
}

describe('Multi-Layer Data Tests', () => {
  let multiLayerData: MaidrPlot;

  describe('Data Structure Validation', () => {
    beforeEach(() => {
      multiLayerData = getMultiLineData(maidrData);
    });

    it('should have more than one layer', () => {
      const layers = multiLayerData.subplots[0][0].layers;
      expect(layers.length).toBeGreaterThanOrEqual(1);
    });

    it('should have valid multi-line chart structure', () => {
      const layer = multiLayerData.subplots[0][0].layers[0];

      expect(layer.type).toBe('line');
      expect(multiLayerData.id).toBeDefined();
      expect(multiLayerData.title).toBeDefined();
      expect(layer.axes).toHaveProperty('x');
      expect(layer.axes).toHaveProperty('y');
      expect(layer.data).toBeDefined();
    });

    it('should have valid x and y arrays', () => {
      const layer = multiLayerData.subplots[0][0].layers[0];
      const data = layer.data[0];

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('should have valid points matrix', () => {
      const layer = multiLayerData.subplots[0][0].layers[0];
      const data = layer.data[0];

      expect(Array.isArray(data)).toBe(true);
      data.forEach((point: { x: number; y: number; fill: string }) => {
        expect(typeof point.x).toBe('number');
        expect(typeof point.y).toBe('number');
        expect(typeof point.fill).toBe('string');
      });
    });
  });

  describe('Data Extraction', () => {
    beforeEach(() => {
      multiLayerData = getMultiLineData(maidrData);
    });

    it('should extract data correctly from multiple line plots', () => {
      const layers = multiLayerData.subplots[0][0].layers;

      layers.forEach((layer) => {
        expect(layer.data).toBeDefined();
        expect(Array.isArray(layer.data)).toBe(true);
        expect(layer.data.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Data Integrity', () => {
    beforeEach(() => {
      multiLayerData = getMultiLineData(multiLayerData);
    });

    it('should have consistent x-axis values across different multiple lineplots', () => {
      const layers = multiLayerData.subplots[0][0].layers;
      const xValues = layers[0].data[0].map(point => point.x);

      layers.forEach((layer) => {
        const layerXValues = layer.data[0].map(point => point.x);
        expect(layerXValues).toEqual(xValues);
      });
    });

    it('should have valid y-axis values for each lineplot', () => {
      const layers = multiLayerData.subplots[0][0].layers;

      layers.forEach((layer) => {
        const yValues = layer.data[0].map(point => point.y);
        yValues.forEach((yValue) => {
          expect(typeof yValue).toBe('number');
          expect(yValue).toBeGreaterThan(0);
        });
      });
    });
  });
});
