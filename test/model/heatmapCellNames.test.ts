import type { ExtremaTarget } from '@type/extrema';
import type { AxisFormat, HeatmapData, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';

/**
 * A heatmap cell is named the same way wherever the reader is sent to it.
 *
 * The description's Highest cell and Lowest cell and every target of the
 * extrema menu named a cell by its raw labels. The menu's view model then
 * formatted the column alone on its way to the dialog. So a heatmap
 * declaring an x format named one column two ways, and one declaring a y
 * format left the row unformatted in both, while the cursor announced both
 * labels through their formats. The description's data table then headed
 * its columns with the raw labels too, beside row labels read through the
 * y format.
 */

/** Columns numbered 1 to 3 and named through the x axis's format. */
const DAYS = 'var days = ["Mon","Tue","Wed"]; var day = days[Number(value) - 1]; '
  + 'return day === undefined ? String(value) : day;';

/** Rows named through the y axis's format. */
const SHIFTS = 'return value + " shift";';

/**
 * A two-row, three-column heatmap whose highest cell is the third column of
 * the top row and whose lowest is the first.
 *
 * @param formats - The x and y axes' formats, if any
 * @param formats.x - The x axis's format
 * @param formats.y - The y axis's format
 * @param x - The column labels
 * @returns The layer
 */
function heatmap(formats: { x?: AxisFormat; y?: AxisFormat }, x: string[]): MaidrLayer {
  return {
    id: 'hm',
    type: TraceType.HEATMAP,
    axes: {
      x: { label: 'Day', ...(formats.x ? { format: formats.x } : {}) },
      y: { label: 'Shift', ...(formats.y ? { format: formats.y } : {}) },
      z: { label: 'Load' },
    },
    data: {
      x,
      y: ['PM', 'AM'],
      points: [[1, 2, 3], [2, 2, 2]],
    } satisfies HeatmapData,
  };
}

/**
 * The value of one stat of the trace's description.
 *
 * @param trace - The heatmap
 * @param label - The stat's label
 * @returns Its value
 */
function statOf(trace: Heatmap, label: string): unknown {
  return trace.description.stats.find(stat => stat.label === label)?.value;
}

/**
 * The extrema menu's target for the grid's maximum or minimum.
 *
 * @param trace - The heatmap
 * @param type - Which extreme
 * @returns The target
 */
function globalTarget(trace: Heatmap, type: 'max' | 'min'): ExtremaTarget | undefined {
  return trace.getExtremaTargets().find(target => target.segment === 'global' && target.type === type);
}

describe('a heatmap whose x and y axes declare a format', () => {
  const layer = heatmap({ x: { function: DAYS }, y: { function: SHIFTS } }, ['1', '2', '3']);

  test('names the highest and lowest cell through both formats', () => {
    const trace = new Heatmap(layer);

    expect(statOf(trace, 'Highest cell')).toBe('Wed, PM shift');
    expect(statOf(trace, 'Lowest cell')).toBe('Mon, PM shift');
  });

  test('names the extrema menu\'s cells in the same words', () => {
    const trace = new Heatmap(layer);

    const max = globalTarget(trace, 'max');
    const min = globalTarget(trace, 'min');

    expect(max?.display).toEqual({ name: 'Global Maximum', x: 'Wed', y: 'PM shift' });
    expect(max?.label).toBe('Global Maximum at Wed, PM shift');
    expect(min?.display).toEqual({ name: 'Global Minimum', x: 'Mon', y: 'PM shift' });
    // Where the menu sends the reader is still the column as the data names it.
    expect(max?.xValue).toBe('3');
  });

  test('names every target of the menu through the formats, each at its own cell', () => {
    const trace = new Heatmap(layer);

    // The cursor starts on the bottom row's first cell, Mon AM, so the row
    // and column targets are that row's and that column's, beside the two
    // global ones.
    const labels = trace.getExtremaTargets().map(target => target.label);

    expect(labels).toEqual([
      'Global Maximum at Wed, PM shift',
      'Global Minimum at Mon, PM shift',
      'Row Maximum at Mon, AM shift',
      'Row Minimum at Mon, AM shift',
      'Column Maximum at Mon, AM shift',
      'Column Minimum at Mon, PM shift',
    ]);
  });
});

describe('the data table of a heatmap whose x axis declares a format', () => {
  test('heads each column as the cursor names it', () => {
    const trace = new Heatmap(heatmap({ x: { function: DAYS }, y: { function: SHIFTS } }, ['1', '2', '3']));

    expect(trace.description.dataTable.headers).toEqual(['Shift', 'Mon', 'Tue', 'Wed']);
  });

  test('still numbers a column its labels do not reach', () => {
    const trace = new Heatmap(heatmap({ x: { function: DAYS } }, ['1', '2']));

    expect(trace.description.dataTable.headers).toEqual(['Shift', 'Mon', 'Tue', 'Column 3']);
  });
});

describe('a heatmap whose axes declare no format', () => {
  test('names its cells by their labels as written', () => {
    const trace = new Heatmap(heatmap({}, ['Mon', 'Tue', 'Wed']));

    expect(statOf(trace, 'Highest cell')).toBe('Wed, PM');
    expect(globalTarget(trace, 'max')?.display).toEqual({ name: 'Global Maximum', x: 'Wed', y: 'PM' });
  });

  test('heads its table\'s columns by their labels as written', () => {
    const trace = new Heatmap(heatmap({}, ['Mon', 'Tue', 'Wed']));

    expect(trace.description.dataTable.headers).toEqual(['Shift', 'Mon', 'Tue', 'Wed']);
  });
});
