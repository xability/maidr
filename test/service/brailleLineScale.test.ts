import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { BrailleService } from '@service/braille';
import { TraceType } from '@type/grammar';

/**
 * A multi-series line's braille, driven by the state the real trace emits:
 * one row per series, every row encoded against the range of the whole
 * layer, so the same cell height is the same value on every row.
 */

const disposables: { dispose: () => void }[] = [];

afterEach(() => {
  disposables.splice(0).forEach(one => one.dispose());
});

/**
 * What the display shows for a line layer when braille is turned on.
 * @param data - One row per series
 * @returns The emitted braille text
 */
function brailleOf(data: LinePoint[][]): string {
  const layer: MaidrLayer = {
    id: 'lines',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
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
 * One series sampled at x = 0, 1, 2, ...
 * @param name - The series
 * @param ys - Its values
 * @returns The series' points
 */
function series(name: string, ys: number[]): LinePoint[] {
  return ys.map((y, x) => ({ x, y, z: name }));
}

describe('a multi-series line on the braille display', () => {
  test('writes two series of one shape apart when their values differ', () => {
    // Both rise steadily, one from 10 to 40 and one from 10 to 100. Each row
    // against its own range, both were written ⣀⡠⠔⠊. Against the layer's
    // 10 to 100, the first stays in the bottom quarter until its last cell.
    const lines = [series('Low', [10, 20, 30, 40]), series('High', [10, 40, 70, 100])];

    expect(brailleOf(lines)).toBe('⣀⣀⣀⡠\n⣀⡠⠔⠊\n');
  });

  test('writes a layer of nothing but gaps as blank cells', () => {
    expect(brailleOf([[{ x: 0, y: null }, { x: 1, y: null }]])).toBe('  \n');
  });

  test('writes a series of nothing but gaps as blank cells beside a measured one, which reads as it would alone', () => {
    // The gaps take no part in the range, so the measured series is written
    // against its own 10 to 100, as the second row of the first case is.
    const measured = series('Measured', [10, 40, 70, 100]);
    const missing = measured.map(point => ({ ...point, y: null, z: 'Missing' }));

    expect(brailleOf([missing, measured])).toBe('    \n⣀⡠⠔⠊\n');
  });

  test('writes a flat layer, every series one value, as the lowest cells', () => {
    // A range of zero width puts all four of the encoder's thresholds at the
    // value, and a value at or below the lowest one is the bottom cell.
    expect(brailleOf([series('A', [5, 5, 5]), series('B', [5, 5, 5])])).toBe('⣀⣀⣀\n⣀⣀⣀\n');
  });
});
