import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { SegmentedPoint } from '@type/grammar';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { BrailleService } from '@service/braille';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A population pyramid on the braille display, driven by the state the real
 * trace emits.
 *
 * The men's bars arrive negative, as the chart draws them, and the longest
 * bar on the chart is on that side. The display has a line per side and one
 * for the balance, and a cell per age band.
 */
const BANDS: SegmentedPoint[][] = [
  [
    { x: '0-24', y: -1200, z: 'Men' },
    { x: '25-44', y: -900, z: 'Men' },
    { x: '45-64', y: -700, z: 'Men' },
  ],
  [
    { x: '0-24', y: 1200, z: 'Women' },
    { x: '25-44', y: 950, z: 'Women' },
    { x: '45-64', y: 800, z: 'Women' },
  ],
];

const disposables: { dispose: () => void }[] = [];

afterEach(() => {
  disposables.splice(0).forEach(one => one.dispose());
});

/**
 * What the braille display shows for a diverging chart, line by line.
 * @param data The sides the chart carries; the pyramid by default
 * @returns One string of cells per line: each side, then the last row
 */
function displayedLines(data: SegmentedPoint[][] = BANDS): string[] {
  const trace = TraceFactory.create({
    id: 'pyramid',
    type: TraceType.DIVERGING,
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Age band' }, y: { label: 'People' } },
    data,
  });
  disposables.push(trace);
  trace.moveOnce('FORWARD');

  const context = { moveToIndex: jest.fn() } as unknown as Context;
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const display = { toggleFocus: jest.fn() } as unknown as DisplayService;
  const settings = {
    get: () => undefined,
    onChange: () => ({ dispose: () => {} }),
  } as unknown as SettingsService;
  const service = new BrailleService(context, notification, display, settings);
  disposables.push(service);

  let shown = '';
  service.onChange((event) => {
    shown = event.value;
  });
  service.toggle(trace.state);
  return shown.split('\n');
}

describe('a population pyramid on the braille display', () => {
  test('a longer bar is a taller cell on the left-hand side too', () => {
    // Encoded signed, each line against its own range, the men's line rose
    // as the bars shrank: the 1,200 bar, the longest, was its lowest cell
    // and the 700 bar its highest (⣀⠒⠉).
    expect(displayedLines()[0]).toBe('⠉⠒⠒');
  });

  test('a bar of the same size is the same height on either side', () => {
    // 1,200 men and 1,200 women in the first band.
    const [men, women] = displayedLines();

    expect(women).toBe('⠉⠉⠒');
    expect(men[0]).toBe(women[0]);
  });

  test('the balance is each band\'s lead on the same scale', () => {
    // Level in the first band, and leads of 50 and 100 after it: small
    // beside a bar of 1,200, as the pitch plays them.
    expect(displayedLines()[2]).toBe(' ⣀⣀');
  });

  test('a gap is a blank cell, and the rest of its line keeps the chart\'s scale', () => {
    // No count for men aged 25-44. Their other two bands read as they do
    // with the count there (⠉⠒⠒).
    const gappy = BANDS.map(side => side.map(point => (
      point.z === 'Men' && point.x === '25-44'
        ? { ...point, y: null as unknown as number }
        : point
    )));

    expect(displayedLines(gappy)[0]).toBe('⠉ ⠒');
  });

  test('the last line of a chart that is not two-sided is its sum\'s size, whatever its sign', () => {
    // Three sides, so the last row is a plain sum rather than a balance:
    // -300 in the first band and 300 in the second, announced with their
    // signs. The cells, like the pitch, show the size, so the two read alike.
    const threeSided: SegmentedPoint[][] = [
      [{ x: 'a', y: -900, z: 'Against' }, { x: 'b', y: -100, z: 'Against' }],
      [{ x: 'a', y: 400, z: 'For' }, { x: 'b', y: 300, z: 'For' }],
      [{ x: 'a', y: 200, z: 'Strongly for' }, { x: 'b', y: 100, z: 'Strongly for' }],
    ];

    expect(displayedLines(threeSided)[3]).toBe('⠤⠤');
  });
});
