import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { BoxPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { Orientation, TraceType } from '@type/grammar';

describe('vega-Lite converters', () => {
  describe('boxplot orientation detection', () => {
    it('sets orientation HORIZONTAL when x is quantitative and y is nominal', () => {
      // Horizontal boxplot: x is the value axis (quantitative), y is the category axis (nominal)
      const spec: VegaLiteSpec = {
        mark: 'boxplot',
        data: {
          values: [
            { group: 'A', value: 10 },
            { group: 'A', value: 20 },
            { group: 'A', value: 30 },
            { group: 'B', value: 15 },
            { group: 'B', value: 25 },
            { group: 'B', value: 35 },
          ],
        },
        encoding: {
          x: { field: 'value', type: 'quantitative' },
          y: { field: 'group', type: 'nominal' },
        },
      };

      const result = vegaLiteToMaidr(spec);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.BOX);
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    });

    it('leaves orientation undefined for vertical boxplot (x nominal, y quantitative)', () => {
      // Vertical boxplot: x is the category axis (nominal), y is the value axis (quantitative)
      const spec: VegaLiteSpec = {
        mark: 'boxplot',
        data: {
          values: [
            { group: 'A', value: 10 },
            { group: 'A', value: 20 },
            { group: 'A', value: 30 },
            { group: 'B', value: 15 },
            { group: 'B', value: 25 },
            { group: 'B', value: 35 },
          ],
        },
        encoding: {
          x: { field: 'group', type: 'nominal' },
          y: { field: 'value', type: 'quantitative' },
        },
      };

      const result = vegaLiteToMaidr(spec);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.type).toBe(TraceType.BOX);
      // Vertical is the default — orientation should be undefined (or VERTICAL if explicitly set)
      // The BAR case leaves it undefined for vertical, so BOX should match that pattern
      expect(layer.orientation).toBeUndefined();
    });

    it('detects horizontal orientation when x has aggregate', () => {
      // Test that aggregate on x also triggers horizontal orientation
      const spec: VegaLiteSpec = {
        mark: 'boxplot',
        data: {
          values: [
            { group: 'A', value: 10 },
            { group: 'A', value: 20 },
          ],
        },
        encoding: {
          x: { field: 'value', type: 'quantitative', aggregate: 'mean' },
          y: { field: 'group', type: 'nominal' },
        },
      };

      const result = vegaLiteToMaidr(spec);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    });
  });

  describe('extractBoxData', () => {
    it('returns expected quartiles for simple dataset', () => {
      // Test boxplot data extraction indirectly via vegaLiteToMaidr
      // Use a known dataset where we can hand-calculate the expected quartiles
      const spec: VegaLiteSpec = {
        mark: 'boxplot',
        data: {
          values: [
            // Group A: 7 values [10, 20, 30, 40, 50, 60, 70]
            // Sorted: [10, 20, 30, 40, 50, 60, 70]
            // Q1 (25th percentile) ≈ 25, Q2 (median) = 40, Q3 (75th percentile) ≈ 55
            // Min (non-outlier) = 10, Max (non-outlier) = 70
            { group: 'A', value: 10 },
            { group: 'A', value: 20 },
            { group: 'A', value: 30 },
            { group: 'A', value: 40 },
            { group: 'A', value: 50 },
            { group: 'A', value: 60 },
            { group: 'A', value: 70 },
            // Group B: 5 values [5, 10, 15, 20, 25]
            // Q1 ≈ 7.5, Q2 = 15, Q3 ≈ 22.5
            { group: 'B', value: 5 },
            { group: 'B', value: 10 },
            { group: 'B', value: 15 },
            { group: 'B', value: 20 },
            { group: 'B', value: 25 },
          ],
        },
        encoding: {
          x: { field: 'group', type: 'nominal' },
          y: { field: 'value', type: 'quantitative' },
        },
      };

      const result = vegaLiteToMaidr(spec);
      const layer = result.subplots[0][0].layers[0];
      const data = layer.data as BoxPoint[];

      // Should have 2 boxes (one per group)
      expect(data).toHaveLength(2);

      // Check that each box has the expected structure
      expect(data[0]).toHaveProperty('z');
      expect(data[0]).toHaveProperty('min');
      expect(data[0]).toHaveProperty('q1');
      expect(data[0]).toHaveProperty('q2');
      expect(data[0]).toHaveProperty('q3');
      expect(data[0]).toHaveProperty('max');
      expect(data[0]).toHaveProperty('lowerOutliers');
      expect(data[0]).toHaveProperty('upperOutliers');

      // Verify we get numbers for quartiles (exact values depend on percentile implementation)
      const boxA = data.find(b => b.z === 'A');
      const boxB = data.find(b => b.z === 'B');

      expect(boxA).toBeDefined();
      expect(boxB).toBeDefined();

      if (boxA) {
        expect(boxA.min).toBeGreaterThanOrEqual(10);
        expect(boxA.max).toBeLessThanOrEqual(70);
        expect(boxA.q2).toBeGreaterThan(boxA.q1);
        expect(boxA.q3).toBeGreaterThan(boxA.q2);
      }

      if (boxB) {
        expect(boxB.min).toBeGreaterThanOrEqual(5);
        expect(boxB.max).toBeLessThanOrEqual(25);
        expect(boxB.q2).toBeGreaterThan(boxB.q1);
        expect(boxB.q3).toBeGreaterThan(boxB.q2);
      }
    });
  });

  describe('metadata', () => {
    it('passes through title, subtitle, caption', () => {
      const spec: VegaLiteSpec = {
        title: {
          text: 'Test Box Plot',
          subtitle: 'A test subtitle',
        },
        description: 'A test caption',
        mark: 'boxplot',
        data: {
          values: [{ group: 'A', value: 10 }],
        },
        encoding: {
          x: { field: 'group', type: 'nominal' },
          y: { field: 'value', type: 'quantitative' },
        },
      };

      const result = vegaLiteToMaidr(spec);
      expect(result.title).toBe('Test Box Plot');
      expect(result.subtitle).toBe('A test subtitle');
      expect(result.caption).toBe('A test caption');
    });

    it('uses default title when spec.title is omitted', () => {
      const spec: VegaLiteSpec = {
        mark: 'boxplot',
        data: {
          values: [{ group: 'A', value: 10 }],
        },
        encoding: {
          x: { field: 'group', type: 'nominal' },
          y: { field: 'value', type: 'quantitative' },
        },
      };

      const result = vegaLiteToMaidr(spec);
      expect(result.title).toBe('Vega-Lite Chart');
    });
  });

  describe('axis labels', () => {
    it('extracts axis labels from encoding channels', () => {
      const spec: VegaLiteSpec = {
        mark: 'boxplot',
        data: {
          values: [{ group: 'A', value: 10 }],
        },
        encoding: {
          x: { field: 'group', type: 'nominal', title: 'Group Label' },
          y: { field: 'value', type: 'quantitative', title: 'Value Label' },
        },
      };

      const result = vegaLiteToMaidr(spec);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.axes?.x?.label).toBe('Group Label');
      expect(layer.axes?.y?.label).toBe('Value Label');
    });

    it('falls back to field name when title is omitted', () => {
      const spec: VegaLiteSpec = {
        mark: 'boxplot',
        data: {
          values: [{ category: 'A', score: 10 }],
        },
        encoding: {
          x: { field: 'category', type: 'nominal' },
          y: { field: 'score', type: 'quantitative' },
        },
      };

      const result = vegaLiteToMaidr(spec);
      const layer = result.subplots[0][0].layers[0];

      expect(layer.axes?.x?.label).toBe('category');
      expect(layer.axes?.y?.label).toBe('score');
    });
  });

  describe('hconcat boxplot data resolution', () => {
    it('extracts each panel\'s own categorical and quartile data without bleed-over', () => {
      // Validates that buildConcatMaidr correctly processes each concat child
      // independently without data bleed-over. Each child's spec has inline data,
      // so resolveData uses the fallback path (no View needed).
      // Regression test for the bug where panel 2 would incorrectly extract
      // panel 1's data due to naive globalLayerIndex++ logic.

      const spec = {
        hconcat: [
          {
            data: {
              values: [
                { group: 'A', score: 60 },
                { group: 'A', score: 70 },
                { group: 'A', score: 80 },
                { group: 'B', score: 65 },
                { group: 'B', score: 70 },
                { group: 'B', score: 75 },
              ],
            },
            mark: 'boxplot',
            encoding: {
              x: { field: 'group', type: 'nominal' },
              y: { field: 'score', type: 'quantitative' },
            },
          },
          {
            data: {
              values: [
                { category: 'X', rating: 3.5 },
                { category: 'X', rating: 4.0 },
                { category: 'X', rating: 4.5 },
                { category: 'Y', rating: 4.0 },
                { category: 'Y', rating: 4.5 },
                { category: 'Y', rating: 5.0 },
              ],
            },
            mark: 'boxplot',
            encoding: {
              x: { field: 'category', type: 'nominal' },
              y: { field: 'rating', type: 'quantitative' },
            },
          },
        ],
      };

      // No view provided — tests the fallback path where resolveData uses
      // spec.data.values. This exercises buildConcatMaidr without needing
      // to mock Vega's complex dataset structure.
      const result = vegaLiteToMaidr(spec as any);

      // Result shape: subplots[row][col].layers[]
      expect(result.subplots).toHaveLength(1);
      expect(result.subplots[0]).toHaveLength(2);

      const panel1Box = result.subplots[0][0].layers[0].data as Array<{ z: string; q1: number; q2: number }>;
      expect(panel1Box.map(p => p.z).sort()).toEqual(['A', 'B']);
      expect(panel1Box.every(p => p.q1 > 0)).toBe(true);
      expect(panel1Box.every(p => p.q1 >= 60 && p.q1 <= 80)).toBe(true);

      const panel2Box = result.subplots[0][1].layers[0].data as Array<{ z: string; q1: number; q2: number }>;
      // Verify panel 2 extracts its own data (category, rating) not panel 1's (group, score)
      expect(panel2Box.map(p => p.z).sort()).toEqual(['X', 'Y']);
      expect(panel2Box.every(p => p.q1 > 0)).toBe(true);
      expect(panel2Box.every(p => p.q1 >= 3 && p.q1 <= 5)).toBe(true);
    });

    it('handles mixed marks (bar + boxplot) in hconcat', () => {
      // Simplified mock: bar uses data_0, boxplot uses data_1.
      // Verifies that mixed mark types don't break index advancement.
      const spec = {
        hconcat: [
          {
            data: {
              values: [
                { x: 'A', y: 10 },
                { x: 'B', y: 20 },
              ],
            },
            mark: 'bar',
            encoding: {
              x: { field: 'x', type: 'nominal' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
          {
            data: {
              values: [
                { group: 'P', score: 5 },
                { group: 'P', score: 10 },
                { group: 'P', score: 15 },
              ],
            },
            mark: 'boxplot',
            encoding: {
              x: { field: 'group', type: 'nominal' },
              y: { field: 'score', type: 'quantitative' },
            },
          },
        ],
      };

      const result = vegaLiteToMaidr(spec as any);
      expect(result.subplots).toHaveLength(1);
      expect(result.subplots[0]).toHaveLength(2);

      // Panel 1: bar (should be a BAR trace)
      const panel1 = result.subplots[0][0].layers[0];
      expect(panel1.type).toBe(TraceType.BAR);

      // Panel 2: boxplot
      const panel2 = result.subplots[0][1].layers[0];
      expect(panel2.type).toBe(TraceType.BOX);
      const panel2Data = panel2.data as Array<{ z: string }>;
      expect(panel2Data[0].z).toBe('P');
    });

    it('handles vconcat of two boxplots', () => {
      // Validates the fix works for vconcat as well as hconcat.
      // Simplified mock: data_0 for panel 1, data_1 for panel 2.
      const spec = {
        vconcat: [
          {
            data: {
              values: [
                { group: 'A', score: 60 },
                { group: 'A', score: 70 },
                { group: 'A', score: 80 },
              ],
            },
            mark: 'boxplot',
            encoding: {
              x: { field: 'group', type: 'nominal' },
              y: { field: 'score', type: 'quantitative' },
            },
          },
          {
            data: {
              values: [
                { category: 'X', rating: 3.5 },
                { category: 'X', rating: 4.0 },
                { category: 'X', rating: 4.5 },
              ],
            },
            mark: 'boxplot',
            encoding: {
              x: { field: 'category', type: 'nominal' },
              y: { field: 'rating', type: 'quantitative' },
            },
          },
        ],
      };

      const result = vegaLiteToMaidr(spec as any);

      // vconcat: subplots[row][col] where each child is a row
      expect(result.subplots).toHaveLength(2);
      expect(result.subplots[0]).toHaveLength(1);
      expect(result.subplots[1]).toHaveLength(1);

      const panel1Box = result.subplots[0][0].layers[0].data as Array<{ z: string; q1: number }>;
      expect(panel1Box[0].z).toBe('A');
      expect(panel1Box[0].q1).toBeGreaterThan(0);

      const panel2Box = result.subplots[1][0].layers[0].data as Array<{ z: string; q1: number }>;
      expect(panel2Box[0].z).toBe('X');
      expect(panel2Box[0].q1).toBeGreaterThan(0);
    });
  });
});
