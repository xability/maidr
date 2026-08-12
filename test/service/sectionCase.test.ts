import type { BoxTrace } from '@model/box';
import type { DumbbellTrace } from '@model/dumbbell';
import type { BoxPoint, DumbbellData, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { NotificationService } from '@service/notification';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/** One distribution, with outliers on both ends. */
const BOX: BoxPoint[] = [
  {
    z: 'Setosa',
    lowerOutliers: [1.1],
    min: 2,
    q1: 3,
    q2: 4,
    q3: 5,
    max: 6,
    upperOutliers: [9.4],
  },
];

/**
 * Two ends whose names the producer chose, with case that means something.
 *
 * `Control` and `Q1 2024` are the kind of strings a dumbbell actually carries.
 * Lower-casing them is not a formatting preference -- it destroys a
 * distinction the data made.
 */
const PAIRS: DumbbellData = {
  startLabel: 'Control',
  endLabel: 'Q1 2024',
  points: [{ x: 'Alpha', start: 10, end: 25 }],
};

/**
 * What a reader actually hears at one position, in one mode.
 *
 * The defect lives in how the text service *renders* `state.section`, so the
 * assertion has to be on the sentence rather than on the trace's state.
 *
 * @param layer The layer to build
 * @param at Where to put the cursor
 * @param mode The verbosity to read in
 * @returns The announcement
 */
function announcementAt(
  layer: MaidrLayer,
  at: [number, number],
  mode: 'verbose' | 'terse',
): string {
  const trace = TraceFactory.create(layer) as BoxTrace | DumbbellTrace;
  trace.moveToIndex(at[0], at[1]);

  const notification = new NotificationService();
  const text = new TextService(notification);
  const heard: string[] = [];
  text.onChange(event => heard.push(String(event.value)));
  (text as unknown as { mode: string }).mode = mode;
  text.update(trace.state);

  return heard[heard.length - 1];
}

/**
 * A box layer over the fixture above.
 * @returns The layer
 */
function boxLayer(): MaidrLayer {
  return {
    id: 'section-case-box',
    type: TraceType.BOX,
    title: 'Sepal width',
    axes: { x: { label: 'Species' }, y: { label: 'Value' } },
    data: BOX,
  };
}

/**
 * A dumbbell layer whose end names carry producer-chosen case.
 * @returns The layer
 */
function dumbbellLayer(): MaidrLayer {
  return {
    id: 'section-case-dumbbell',
    type: TraceType.DUMBBELL,
    title: 'Change',
    axes: { x: { label: 'Group' }, y: { label: 'Score' } },
    data: PAIRS,
  };
}

/**
 * Both readings of one position.
 *
 * @param layer The layer to build
 * @param at Where to put the cursor
 * @returns The verbose and terse announcements
 */
function bothModes(layer: MaidrLayer, at: [number, number]): [string, string] {
  return [
    announcementAt(layer, at, 'verbose'),
    announcementAt(layer, at, 'terse'),
  ];
}

describe('a section reads the same way in both modes', () => {
  test('a box plot section keeps its case in verbose, as terse already did', () => {
    // Verbose lower-cased and terse did not, so toggling T changed the
    // capitalisation of a label that came from neither the user nor the data.
    // Row is the section and column the distribution, so row 1 is Minimum.
    const [verbose, terse] = bothModes(boxLayer(), [1, 0]);

    expect(verbose).toContain('Minimum');
    expect(verbose).not.toContain('minimum');
    expect(terse).toContain('Minimum');
  });

  test('an outlier section reads the same way in both modes', () => {
    // The outlier branch lower-cased on both sides, so the two agreed with
    // each other and disagreed with every other section. Now all of them
    // render the label as it was authored.
    const [verbose, terse] = bothModes(boxLayer(), [0, 0]);

    expect(verbose).toContain('Lower outlier(s)');
    expect(terse).toContain('Lower outlier(s)');
  });

  test('a producer-supplied name is announced as the producer wrote it', () => {
    // The reason this is worth changing rather than documenting. A dumbbell's
    // end names are authored strings, and a ridgeline's group names are too.
    const [verbose, terse] = bothModes(dumbbellLayer(), [0, 0]);

    expect(verbose).toContain('Control');
    expect(verbose).not.toContain('control,');
    expect(terse).toContain('Control');
  });

  test('a name whose case carries meaning survives both modes', () => {
    // `Q1 2024` is not a preference about capitalisation; lower-casing it
    // makes a different string.
    const [verbose, terse] = bothModes(dumbbellLayer(), [1, 0]);

    expect(verbose).toContain('Q1 2024');
    expect(terse).toContain('Q1 2024');
  });

  test('a lower-case section is left alone, so nothing else moved', () => {
    // Error bar, waterfall and survival all author their sections in lower
    // case already. Dropping the lower-casing must not have capitalised them.
    const [verbose] = bothModes(boxLayer(), [2, 0]);

    expect(verbose).toContain('25%');
  });
});
