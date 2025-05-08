import { describe, expect, it } from '@jest/globals';

interface MaidrPlotLayer {
  id: string;
  type: string;
  selectors: string | string[];
  axes: {
    x: string;
    y: string;
  };
  data: { x: string; y: number }[][];
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
  id: 'multi-layer',
  title: 'Diamond Count vs. Average Price by Cut',
  subplots: [
    [
      {
        layers: [
          {
            id: '0',
            type: 'bar',
            selectors: 'g[id^=\"patch\"] > path[clip-path=\"url(#pad0ec08b0e)\"]',
            axes: {
              x: 'Cut',
              y: 'Diamond Count',
            },
            data: [
              [
                { x: 'Ideal', y: 21551 },
                { x: 'Premium', y: 13791 },
                { x: 'Very Good', y: 12082 },
                { x: 'Good', y: 4906 },
                { x: 'Fair', y: 1610 },
              ],
            ],
          },
          {
            id: '1',
            type: 'line',
            selectors: ['g[id="line2d_17"] > path'],
            axes: {
              x: 'Cut',
              y: 'Average Price ($)',
            },
            data: [
              [
                { x: 'Ideal', y: 3457.54 },
                { x: 'Premium', y: 4584.26 },
                { x: 'Very Good', y: 3981.76 },
                { x: 'Good', y: 3928.86 },
                { x: 'Fair', y: 4358.76 },
              ],
            ],
          },
        ],
      },
    ],
  ],
};

function getMultiLayerData(multiLayerData: MaidrPlot): MaidrPlot {
  if (!multiLayerData.subplots || multiLayerData.subplots.length === 0) {
    throw new Error('Cannot find multi-layer data in empty multiLayerData');
  }
  return multiLayerData;
}

describe('Multi-Layer Data Tests', () => {
  let multiLayerData: MaidrPlot;

  describe('Data Structure Validation', () => {
    beforeEach(() => {
      multiLayerData = getMultiLayerData(maidrData);
    });

    it('should have more than one layer', () => {
      const layers = multiLayerData.subplots[0][0].layers;
      expect(layers.length).toBeGreaterThan(1);
    });

    it('should have valid multi-layer chart structure', () => {
      const layer = multiLayerData.subplots[0][0].layers[0];

      expect(layer.type).toBe('bar');
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
      data.forEach((point: { x: string; y: number }) => {
        expect(typeof point.x).toBe('string');
        expect(typeof point.y).toBe('number');
      });
    });
  });

  describe('Data Extraction', () => {
    beforeEach(() => {
      multiLayerData = getMultiLayerData(maidrData);
    });

    it('should extract data correctly from multiple layers', () => {
      const layers = multiLayerData.subplots[0][0].layers;

      layers.forEach((layer) => {
        expect(layer.data).toBeDefined();
        expect(Array.isArray(layer.data)).toBe(true);
        expect(layer.data.length).toBeGreaterThan(0);
      });
    });

    it('should have unique selectors for each layer', () => {
      const layers = multiLayerData.subplots[0][0].layers;
      const selectors = layers.flatMap(layer =>
        Array.isArray(layer.selectors) ? layer.selectors : [layer.selectors],
      );

      const uniqueSelectors = new Set(selectors);
      expect(uniqueSelectors.size).toBe(layers.length);
    });
  });

  describe('Data Integrity', () => {
    beforeEach(() => {
      multiLayerData = getMultiLayerData(multiLayerData);
    });

    it('should have consistent x-axis values across layers', () => {
      const layers = multiLayerData.subplots[0][0].layers;
      const xValues = layers[0].data[0].map(point => point.x);

      layers.forEach((layer) => {
        const layerXValues = layer.data[0].map(point => point.x);
        expect(layerXValues).toEqual(xValues);
      });
    });

    it('should have valid y-axis values for each layer', () => {
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
