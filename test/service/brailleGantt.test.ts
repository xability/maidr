import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { GanttPoint, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { BrailleService } from '@service/braille';
import { TraceType } from '@type/grammar';

/**
 * A gantt's braille, driven by the state the real trace emits: one row per
 * lane, each cell an interval's length, each lane scaled against its own
 * range -- or, when it has none, against the whole chart's.
 */

const disposables: { dispose: () => void }[] = [];

afterEach(() => {
  disposables.splice(0).forEach(one => one.dispose());
});

/**
 * What the display shows for a gantt when braille is turned on.
 * @param points - The lanes
 * @returns The emitted braille text
 */
function brailleOf(points: GanttPoint[][]): string {
  const layer: MaidrLayer = { id: 'gantt', type: TraceType.GANTT, data: { points } };
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
 * One lane of intervals laid end to end.
 * @param name - The lane
 * @param lengths - Each interval's length, in order
 * @param from - Where the first starts
 * @returns The lane
 */
function lane(name: string, lengths: number[], from = 0): GanttPoint[] {
  let at = from;
  return lengths.map((length) => {
    const point = { x: name, start: at, end: at + length };
    at += length;
    return point;
  });
}

describe('a gantt lane with no spread of its own on the braille display', () => {
  test('a packet\'s one 32-bit field reads as the widest, not the lowest', () => {
    // Two rows of two 16-bit fields and a last row of one 32-bit field: the
    // Data field plays the highest tone, and read ⣀ beside it.
    const packet = [lane('Row 1', [16, 16]), lane('Row 2', [16, 16], 32), lane('Row 3', [32], 64)];

    expect(brailleOf(packet)).toBe('⣀⣀\n⣀⣀\n⠉\n');
  });

  test('a schedule of one task a lane reads each task\'s length', () => {
    // How Chart.js, ApexCharts and AnyChart draw a schedule. Every lane read
    // ⣀, whatever its length, while the tones ran from lowest to highest.
    const tasks = [11, 25, 39, 18, 4].map((length, at) => lane(`Task ${at + 1}`, [length]));

    expect(brailleOf(tasks)).toBe('⣀\n⠒\n⠉\n⠤\n⣀\n');
  });

  test('a lane with a spread keeps its own scale beside a lone task scaled to the chart', () => {
    expect(brailleOf([lane('A', [30, 15]), lane('B', [70], 30)])).toBe('⠉⢇\n⠉\n');
  });
});
