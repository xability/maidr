import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';

/**
 * A heatmap with no rows threw in the constructor as soon as it carried a
 * selector. `mapToSvgElements` read the column count off `heatmapValues[0]`
 * before it had checked there was a row to read it from, so the same layer
 * that constructs and reports empty without a selector took the whole figure
 * down with one -- and a producer with nothing to draw still emits the
 * selector its template always emits.
 */
function heatmapLayer(selectors?: MaidrLayer['selectors']): MaidrLayer {
  const data: HeatmapData = { x: [], y: [], points: [] };
  return {
    id: 'empty-heatmap',
    type: TraceType.HEATMAP,
    axes: { x: { label: 'Day' }, y: { label: 'Hour' } },
    data,
    ...(selectors === undefined ? {} : { selectors }),
  };
}

/**
 * A payload whose labels outrun its grid.
 *
 * Three row labels over two rows of points by default. The description counted
 * its rows off `y` and then indexed `heatmapValues` with them, so it threw on
 * the third -- out of a getter the `d` keypress calls with nothing between it
 * and the command, taking the whole interaction down. Everything else in the
 * class counts the grid, which is what the cursor, the braille display and the
 * audio all walk.
 *
 * @param x - The column labels the layer declares
 * @param y - The row labels the layer declares
 * @returns The layer, over a fixed two-by-two grid
 */
function raggedLayer(
  x: string[] = ['Mon', 'Tue'],
  y: string[] = ['Late', 'Mid', 'Early'],
): MaidrLayer {
  const data: HeatmapData = { x, y, points: [[1, 2], [3, 4]] };
  return {
    id: 'ragged-heatmap',
    type: TraceType.HEATMAP,
    axes: { x: { label: 'Day' }, y: { label: 'Shift' } },
    data,
  };
}

describe('a heatmap whose labels outrun its grid', () => {
  test('describes itself rather than throwing out of the keypress', () => {
    const read = (): unknown => new Heatmap(raggedLayer()).description;

    expect(read).not.toThrow();
  });

  test('counts the grid the reader walks, not the labels', () => {
    const description = new Heatmap(raggedLayer()).description;
    const valueOf = (label: string): unknown =>
      description.stats?.find(stat => stat.label === label)?.value;

    expect(valueOf('Rows')).toBe(2);
    expect(valueOf('Columns')).toBe(2);
    expect(description.dataTable.rows).toHaveLength(2);
  });

  test('heads as many columns as it draws, not as many as it labels', () => {
    // The column side of the same defect: `Columns` says two, and a header
    // row taken from `x` named a third that no cell fills -- so the table
    // claimed a reading the cursor cannot reach, in the dialog that had just
    // said the grid is two wide.
    const { headers, rows } = new Heatmap(
      raggedLayer(['Mon', 'Tue', 'Wed']),
    ).description.dataTable;

    expect(headers).toEqual(['Shift', 'Mon', 'Tue']);
    rows.forEach(row => expect(row).toHaveLength(headers.length));
  });

  test('names a column the labels never reached', () => {
    // The other direction. The cursor stands in that column and announces
    // whatever is in it, so leaving its header blank leaves the reading
    // under nothing at all.
    const { headers } = new Heatmap(raggedLayer([])).description.dataTable;

    expect(headers).toEqual(['Shift', 'Column 1', 'Column 2']);
  });
});

describe('a heatmap with no cells', () => {
  test('constructs without a selector and reports empty', () => {
    const trace = new Heatmap(heatmapLayer());

    expect(trace.state.empty).toBe(true);
  });

  test('constructs with a pattern selector and reports empty', () => {
    const build = (): Heatmap => new Heatmap(heatmapLayer('rect'));

    expect(build).not.toThrow();
    expect(build().state.empty).toBe(true);
  });

  test('constructs with a per-cell selector grid and reports empty', () => {
    const build = (): Heatmap => new Heatmap(heatmapLayer([]));

    expect(build).not.toThrow();
    expect(build().state.empty).toBe(true);
  });
});
