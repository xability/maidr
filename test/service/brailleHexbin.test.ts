import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { HexbinPoint, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { BrailleService } from '@service/braille';
import { TraceType } from '@type/grammar';

/**
 * A hexbin's braille, driven by the state the real trace emits: the heatmap
 * encoding, one line per lattice row, top row first, each cell graded by its
 * bin's count against the range of the whole lattice and an empty bin blank.
 */

const disposables: { dispose: () => void }[] = [];

afterEach(() => {
  disposables.splice(0).forEach(one => one.dispose());
});

/**
 * What the display shows for a hexbin when braille is turned on.
 * @param data - The lattice, bottom row first
 * @returns The emitted braille text
 */
function brailleOf(data: HexbinPoint[][]): string {
  const layer: MaidrLayer = {
    id: 'hexbin',
    type: TraceType.HEXBIN,
    axes: { x: { label: 'X' }, y: { label: 'Y' }, z: { label: 'Count' } },
    data,
  };
  const trace = TraceFactory.create(layer);
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
  let value = '';
  service.onChange((event) => {
    value = event.value;
  });

  service.toggle(trace.state);

  return value;
}

/**
 * One lattice row of bins at successive x.
 * @param y - The row's y
 * @param counts - Each bin's count
 * @param from - The first bin's x
 * @returns The row
 */
function row(y: number, counts: number[], from = 0): HexbinPoint[] {
  return counts.map((count, at) => ({ x: from + 2 * at, y, count }));
}

describe('a hexbin on the braille display', () => {
  test('grades each occupied bin by its count', () => {
    // Counts 0 to 12, so a third of the range is 4: up to 4 is ⠤, up to 8
    // is ⠒, and above that ⠉. Every occupied bin was ⠉.
    const lattice = [row(0, [3, 9, 1]), row(1, [5, 12], 1), row(2, [0, 7, 2])];

    expect(brailleOf(lattice)).toBe(' ⠒⠤\n⠒⠉\n⠤⠉⠤\n');
  });
});
