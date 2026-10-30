import type { MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Histogram } from '@model/histogram';
import { NotificationService } from '@service/notification';
import { TextService } from '@service/text';
import { Orientation, TraceType } from '@type/grammar';

/**
 * How terse mode names a histogram bin.
 *
 * Verbose mode reads a bin by its range ("Petal Length is 2.77 through 3.07,
 * Count is 1"), because the bin is the range. Terse mode read `main.value`
 * instead, which for most producers is the bin's midpoint -- "2.92, 1", a
 * number verbose never says and the chart does not label -- so the same bin
 * was named by different numbers in the two modes.
 */

/** Three bins with the midpoint as `x`, as py-maidr and plotly send them. */
const VERTICAL: MaidrLayer = {
  id: 'upright',
  type: TraceType.HISTOGRAM,
  axes: { x: { label: 'Petal Length' }, y: { label: 'Count' } },
  data: [
    { x: -1.25, y: 37, xMin: -1.5, xMax: -1, yMin: 0, yMax: 37 },
    { x: 2.92, y: 1, xMin: 2.77, xMax: 3.07, yMin: 0, yMax: 1 },
  ],
};

/** The same bins running up the y axis. */
const HORIZONTAL: MaidrLayer = {
  id: 'sideways',
  type: TraceType.HISTOGRAM,
  orientation: Orientation.HORIZONTAL,
  axes: { x: { label: 'Count' }, y: { label: 'Petal Length' } },
  data: [
    { x: 37, y: -1.25, xMin: 0, xMax: 37, yMin: -1.5, yMax: -1 },
    { x: 1, y: 2.92, xMin: 0, xMax: 1, yMin: 2.77, yMax: 3.07 },
  ],
};

/**
 * What a text service in the given mode says at one bin.
 *
 * @param layer - The histogram to read
 * @param bin - The bin to stand on
 * @param toggles - How many times to press T first: 0 verbose, 1 terse
 * @returns The announcement
 */
function heard(layer: MaidrLayer, bin: number, toggles: number): string {
  const trace = new Histogram(layer);
  trace.moveToIndex(0, bin);
  const text = new TextService(new NotificationService());
  for (let i = 0; i < toggles; i++) {
    text.toggle();
  }
  return text.format(trace.state);
}

describe('a histogram bin in terse mode', () => {
  test('is named by its range, as verbose names it', () => {
    expect(heard(VERTICAL, 1, 0)).toBe('Petal Length is 2.77 through 3.07, Count is 1');

    expect(heard(VERTICAL, 1, 1)).toBe('2.77 through 3.07, 1');
  });

  test('keeps a bin below zero readable', () => {
    // Joined with a dash, the way a gantt's span is, this would be
    // "-1.5--1": a minus sign and a dash a listener cannot tell apart.
    expect(heard(VERTICAL, 0, 1)).toBe('-1.5 through -1, 37');
  });

  test('is named by its range on a histogram drawn on its side', () => {
    expect(heard(HORIZONTAL, 1, 1)).toBe('2.77 through 3.07, 1');
  });
});
