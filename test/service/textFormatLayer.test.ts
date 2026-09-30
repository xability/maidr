import type { NotificationService } from '@service/notification';
import type { AxisFormat, Maidr, MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { FormatterService } from '@service/formatter';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * `TextService.format(state)` is called directly by ANNOUNCE_POINT, the goTo
 * commands, review mode and tactile, none of which go through `update()`
 * first. It has to format a state with that state's own layer formatter, not
 * with whichever layer the last navigation update happened to name, or with
 * none at all on a freshly built service.
 */

/** Minimal NotificationService stub whose notify is a jest mock. */
function createMockNotificationService(): NotificationService {
  return {
    notify: jest.fn(),
  } as unknown as NotificationService;
}

/** A one-bar layer whose y axis optionally carries a format. */
function barLayer(id: string, format?: AxisFormat): MaidrLayer {
  return {
    id,
    type: TraceType.BAR,
    axes: {
      x: { label: 'Quarter' },
      y: { label: 'Share', ...(format ? { format } : {}) },
    },
    data: [{ x: 'Q1', y: 57.14285714285714 }],
  };
}

/** A figure carrying the given layers in one subplot each. */
function figureOf(...layers: MaidrLayer[]): Maidr {
  return {
    id: 'figure',
    subplots: [layers.map(layer => ({ layers: [layer] }))],
  } as unknown as Maidr;
}

describe('format() without a preceding update()', () => {
  test('formats with the state\'s layer on a freshly built service', () => {
    const layer = barLayer('fixed', { type: 'fixed', decimals: 4 });
    const text = new TextService(createMockNotificationService(), new FormatterService(figureOf(layer)));
    const state = new BarTrace(layer).getStateAt(0, 0);

    expect(text.format(state)).toBe('Quarter is Q1, Share is 57.1429');
  });

  test('formats with the state\'s layer, not the last one navigated', () => {
    const fixed = barLayer('fixed', { type: 'fixed', decimals: 4 });
    const plain = barLayer('plain');
    const text = new TextService(createMockNotificationService(), new FormatterService(figureOf(fixed, plain)));

    text.update(new BarTrace(fixed).getStateAt(0, 0));

    expect(text.format(new BarTrace(plain).getStateAt(0, 0))).toBe('Quarter is Q1, Share is 57.14');
  });
});
