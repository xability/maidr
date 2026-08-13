import type { MosaicTrace } from '@model/mosaic';
import type { MaidrLayer, MosaicPoint } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { NotificationService } from '@service/notification';
import { TextService } from '@service/text';
import { Orientation, TraceType } from '@type/grammar';

/**
 * One class of a mosaic, with both off-axis facts present.
 *
 * The cross axis declares a `percent` format, which is entirely plausible for
 * a proportion axis and is what exposes a count announced through an
 * axis-formatted field: 203 would arrive as "20300.0%".
 */
const TABLE: MosaicPoint[][] = [
  [{ x: 'First', y: 0.62, z: 'Survived', width: 0.15, count: 203 }],
  [{ x: 'First', y: 0.38, z: 'Died', width: 0.15, count: 122 }],
];

/**
 * What a reader actually hears at one cell.
 *
 * Asserting the trace's `TextState` is not enough here: the defect this pins
 * lives in how the text service *renders* those fields, so the assertion has
 * to be on the sentence.
 *
 * @param mode The verbosity to read in
 * @param format Whether the cross axis declares a format
 * @returns The announcement
 */
function announcementAt(mode: 'verbose' | 'terse', format = false): string {
  const layer: MaidrLayer = {
    id: 'mosaic-text',
    type: TraceType.MOSAIC,
    title: 'Survival',
    orientation: Orientation.VERTICAL,
    axes: {
      x: { label: 'Class' },
      y: format
        ? { label: 'Proportion', format: { type: 'percent', decimals: 1 } }
        : { label: 'Proportion' },
      z: { label: 'Outcome' },
    },
    data: TABLE,
  };
  const trace = TraceFactory.create(layer) as MosaicTrace;
  trace.moveToIndex(0, 0);

  const notification = new NotificationService();
  const text = new TextService(notification);
  const heard: string[] = [];
  text.onChange(event => heard.push(String(event.value)));
  (text as unknown as { mode: string }).mode = mode;
  text.update(trace.state);

  return heard[heard.length - 1];
}

describe('a mosaic announces its width as its own fact', () => {
  test('verbose keeps the share and the proportion apart', () => {
    // Carried in `section` this read "15.0% of all Proportion is 0.62" --
    // one phrase where there are two facts, and the one it produces says the
    // proportion is the share.
    const heard = announcementAt('verbose');

    expect(heard).toBe(
      'Class is First, Proportion is 0.62, Outcome is Survived, '
      + 'Share of all is 15.0%, Count is 203',
    );
  });

  test('terse keeps them apart too, which is where it read worst', () => {
    // "First, 15.0% of all 0.62, Survived" -- the reading a terse user gets
    // most often, and the exact ambiguity this trace exists to remove.
    expect(announcementAt('terse')).toBe('First, 0.62, Survived, 15.0%, 203');
  });

  test('the count is not run through the cross axis format', () => {
    // A percent format on the proportion axis is plausible, and a count
    // announced through an axis-formatted field would arrive as "20300.0%".
    const heard = announcementAt('verbose', true);

    expect(heard).toContain('Count is 203');
    expect(heard).not.toContain('20300');
  });
});
