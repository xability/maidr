import type { ContourPoint, Maidr, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * Wraps layers into a single-subplot chart.
 *
 * @param layers - The layers of the only subplot
 * @returns The chart
 */
function chartOf(...layers: MaidrLayer[]): Maidr {
  return { id: 'type-words', subplots: [[{ layers }]] };
}

/**
 * The instruction a reader hears on entering the chart.
 *
 * @param layers - The layers of the only subplot
 * @returns The instruction, without the click prompt
 */
function instructionFor(...layers: MaidrLayer[]): string {
  return new Context(new Figure(chartOf(...layers))).getInstruction(false);
}

/**
 * A layer of the given type over a two-point grid of numbers, which every
 * type below reads.
 *
 * @param type - The layer's trace type
 * @param data - Its data
 * @returns The layer
 */
function layerOf(type: TraceType, data: MaidrLayer['data']): MaidrLayer {
  return { id: `${type}-layer`, type, axes: { x: { label: 'X' }, y: { label: 'Y' } }, data };
}

/**
 * One closed contour curve at a level.
 *
 * @param level - The curve's level
 * @param radius - How far it runs from the centre
 * @returns The curve
 */
function curve(level: number, radius: number): ContourPoint[] {
  return [
    { x: 5 + radius, y: 5, level },
    { x: 5, y: 5 + radius, level },
    { x: 5 - radius, y: 5, level },
    { x: 5, y: 5 - radius, level },
    { x: 5 + radius, y: 5, level },
  ];
}

describe('the entry instruction names the chart type in words', () => {
  test('a stacked bar chart is a stacked bar, not stacked_bar', () => {
    const layer = layerOf(TraceType.STACKED, [
      [{ x: 'A', y: 1, z: 'North' }, { x: 'B', y: 2, z: 'North' }],
      [{ x: 'A', y: 3, z: 'South' }, { x: 'B', y: 4, z: 'South' }],
    ]);

    expect(instructionFor(layer)).toContain('This is a maidr plot of type: vertical stacked bar.');
  });

  test('a histogram, a heatmap and a scatter plot are named in full', () => {
    const histogram = layerOf(TraceType.HISTOGRAM, [
      { x: 1, y: 2, xMin: 0, xMax: 2, yMin: 0, yMax: 2 },
      { x: 3, y: 4, xMin: 2, xMax: 4, yMin: 0, yMax: 4 },
    ]);
    const heatmap = layerOf(TraceType.HEATMAP, { x: ['a', 'b'], y: ['c', 'd'], points: [[1, 2], [3, 4]] });
    const scatter = layerOf(TraceType.SCATTER, [{ x: 1, y: 2 }, { x: 3, y: 4 }]);

    expect(instructionFor(histogram)).toContain('of type: vertical histogram.');
    expect(instructionFor(heatmap)).toContain('of type: heatmap.');
    expect(instructionFor(scatter)).toContain('of type: scatter.');
  });
});

describe('a contour plot names itself and counts its levels', () => {
  test('four levels are a contour with 4 levels, not a multiline with 4 groups', () => {
    const layer = layerOf(TraceType.CONTOUR, [curve(0.1, 3), curve(0.2, 2), curve(0.3, 1.5), curve(0.4, 1)]);

    const instruction = instructionFor(layer);

    expect(instruction).toContain('This is a maidr plot of type: contour with 4 levels.');
    expect(instruction).not.toContain('multiline');
  });

  test('a level drawn as two islands is counted once', () => {
    const islands = [curve(0.1, 3), curve(0.2, 1), curve(0.2, 0.5)];

    expect(instructionFor(layerOf(TraceType.CONTOUR, islands))).toContain('contour with 2 levels.');
  });
});
