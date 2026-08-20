import type { MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, it } from '@jest/globals';
import { Histogram } from '@model/histogram';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A histogram turned on its side reads its bins off the axis they run along.
 *
 * `Histogram` branches on `orientation` in both `description` and `text`:
 * vertical takes the bin bounds from `xMin`/`xMax` and the count from `y`,
 * horizontal takes them from `yMin`/`yMax` and the count from `x`. Nothing
 * exercised the second branch — every histogram test in the suite built a
 * vertical layer — while two producers now emit horizontal ones:
 * `seaborn`'s `histplot(y=)` through xability/py-maidr#401, and a ggplot2
 * dot plot binned up the y axis through xability/r-maidr#201.
 *
 * The failure that branch protects against is the one
 * {@link MaidrLayer.orientation} was documented for: a layer that declares
 * `horz` and is read as though it were vertical announces the bin *position*
 * where the count belongs and the count where the range belongs. Every number
 * is present and every number is in the wrong place, so nothing throws and
 * nothing is missing — the reader is simply told a different chart.
 */

/** Three bins running up the y axis, with counts on x. */
const HORIZONTAL: MaidrLayer = {
  id: 'sideways',
  type: TraceType.HISTOGRAM,
  orientation: Orientation.HORIZONTAL,
  axes: { x: { label: 'Count' }, y: { label: 'Petal Length' } },
  data: [
    { x: 4, y: 1, xMin: 0, xMax: 4, yMin: 0, yMax: 2 },
    { x: 33, y: 3, xMin: 0, xMax: 33, yMin: 2, yMax: 4 },
    { x: 12, y: 5, xMin: 0, xMax: 12, yMin: 4, yMax: 6 },
  ],
};

/** The same distribution the ordinary way up, for the contrast. */
const VERTICAL: MaidrLayer = {
  id: 'upright',
  type: TraceType.HISTOGRAM,
  axes: { x: { label: 'Petal Length' }, y: { label: 'Count' } },
  data: [
    { x: 1, y: 4, xMin: 0, xMax: 2, yMin: 0, yMax: 4 },
    { x: 3, y: 33, xMin: 2, xMax: 4, yMin: 0, yMax: 33 },
    { x: 5, y: 12, xMin: 4, xMax: 6, yMin: 0, yMax: 12 },
  ],
};

/**
 * The trace's state at its starting cell.
 * @param layer The layer to read
 * @returns Whatever the trace announces there
 */
function announced(layer: MaidrLayer): TraceState {
  const trace = new Histogram(layer);
  trace.moveToIndex(0, 0);
  return trace.state as TraceState;
}

describe('a histogram binned up the y axis', () => {
  it('takes its bin range from the axis the bins run along', () => {
    // `yMin`/`yMax`, not `xMin`/`xMax`. Read the vertical way this would
    // announce "0 through 4" for the first bin -- which is the count's own
    // extent, a number that is on the chart and means nothing here.
    const state = announced(HORIZONTAL);

    expect(state.empty).toBe(false);
    if (state.empty) {
      return;
    }
    expect(state.text.range).toEqual({ min: 0, max: 2 });
  });

  it('announces the count as the value and the bin as the position', () => {
    const state = announced(HORIZONTAL);

    expect(state.empty).toBe(false);
    if (state.empty) {
      return;
    }
    // The main axis is the one the reader moves along, which is the bins.
    expect(state.text.main).toEqual({ label: 'Petal Length', value: 1 });
    expect(state.text.cross).toEqual({ label: 'Count', value: 4 });
    expect(state.text.mainAxis).toBe('y');
    expect(state.text.crossAxis).toBe('x');
  });

  it('describes the whole bin range from first bin to last', () => {
    // The summary reads the *first* bin's lower bound against the *last*
    // bin's upper one, so a branch that took them off x would report the
    // count axis's extent as the data's range: "0 to 12" for a variable that
    // runs 0 to 6.
    const stats = new Histogram(HORIZONTAL).description.stats;

    expect(stats.find(stat => stat.label === 'Bin range')?.value).toBe('0 to 6');
  });

  it('puts the bins first in its data table, as the reader walks them', () => {
    const table = new Histogram(HORIZONTAL).description.dataTable;

    expect(table.headers).toEqual(['Petal Length', 'Count', 'Bin Min', 'Bin Max']);
    expect(table.rows[1]).toEqual([3, 33, 2, 4]);
  });

  it('leaves the upright reading alone', () => {
    // The other half of every orientation fix: the branch that was already
    // right has to stay right. Same three counts, same three bins, read the
    // ordinary way up.
    const state = announced(VERTICAL);
    const stats = new Histogram(VERTICAL).description.stats;

    expect(state.empty).toBe(false);
    if (state.empty) {
      return;
    }
    expect(state.text.range).toEqual({ min: 0, max: 2 });
    expect(state.text.main).toEqual({ label: 'Petal Length', value: 1 });
    expect(state.text.cross).toEqual({ label: 'Count', value: 4 });
    expect(stats.find(stat => stat.label === 'Bin range')?.value).toBe('0 to 6');
  });
});
