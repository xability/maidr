/**
 * @jest-environment jsdom
 */

/**
 * The outliers a boxen draws past each end of its ladder are stops of their
 * own.
 *
 * The walk used to end at the deepest rungs, and the points drawn past them --
 * the extremes of the distribution, the finding a letter-value plot is drawn
 * to show -- were a count said at the end of the ladder and rows of the
 * description's table: a reader could not hear one, feel its braille cell or
 * see it outlined. Each is now a stop, walked on from the deepest rung in
 * value order, with a tone, a cell and an outline of its own.
 */

import type { BoxenTrace } from '@model/boxen';
import type { BoxenPoint, BoxenSelector, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A ladder whose two tails are the same length: its own mirror image. */
const EVEN_TAILS: BoxenPoint['levels'] = [
  { p: 0.25, lo: 40, hi: 60 },
  { p: 0.125, lo: 30, hi: 70 },
];

/** A two-rung ladder from 30 to 75, with two outliers below it and one above. */
const SPREAD: BoxenPoint = {
  z: 'spread',
  median: 50,
  levels: [
    { p: 0.25, lo: 40, hi: 60 },
    { p: 0.125, lo: 30, hi: 75 },
  ],
  // Declared out of order: the walk is in value order whatever the payload's.
  lowerOutliers: [12, 5],
  upperOutliers: [90],
};

/**
 * A boxen layer.
 * @param data - The distributions
 * @param selectors - What names each one's marks, if anything does
 * @returns The trace
 */
function boxen(data: BoxenPoint[], selectors?: MaidrLayer['selectors']): BoxenTrace {
  const layer: MaidrLayer = {
    id: 'boxen',
    type: TraceType.BOXEN,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    ...(selectors === undefined ? {} : { selectors }),
    data,
  };
  return TraceFactory.create(layer) as BoxenTrace;
}

/**
 * The trace's state, which a test expects to be populated.
 * @param trace - The trace
 * @returns Its state
 */
function stateOf(trace: BoxenTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * What is announced at each stop of one distribution, in walking order.
 * @param trace - The trace
 * @param row - Which distribution
 * @returns The name and value of each stop
 */
function readAlong(trace: BoxenTrace, row: number): [string | undefined, unknown][] {
  const read: [string | undefined, unknown][] = [];
  for (let col = 0; trace.moveToIndex(row, col); col++) {
    const { text } = stateOf(trace);
    read.push([text.section, text.cross?.value]);
  }
  return read;
}

describe('the outliers of a distribution', () => {
  test('are walked past each end of the ladder, lowest first', () => {
    const along = readAlong(boxen([SPREAD]), 0);

    expect(along).toEqual([
      ['lower outlier', 5],
      ['lower outlier', 12],
      ['12.5th percentile', 30],
      ['25th percentile', 40],
      ['median', 50],
      ['75th percentile', 60],
      ['87.5th percentile', 75],
      ['upper outlier', 90],
    ]);
  });

  test('each play a tone on a scale that reaches them', () => {
    const trace = boxen([SPREAD]);

    trace.moveToIndex(0, 0);

    expect(stateOf(trace).audio).toMatchObject({ freq: { min: 5, max: 90, raw: 5 } });
  });

  test('each have a braille cell, on the same scale', () => {
    const trace = boxen([SPREAD]);

    trace.moveToIndex(0, 7);

    expect(stateOf(trace).braille).toMatchObject({
      values: [[5, 12, 30, 40, 50, 60, 75, 90]],
      min: [5],
      max: [90],
      col: 7,
    });
  });

  test('are counted at the deepest rung they lie beyond, before the reader steps onto them', () => {
    const trace = boxen([SPREAD]);
    const asidesAt = (col: number): string[] | undefined => {
      trace.moveToIndex(0, col);
      return stateOf(trace).text.asides?.map(aside => aside.value);
    };

    expect(asidesAt(2)).toEqual(['2 lower outliers beyond']);
    expect(asidesAt(6)).toEqual(['1 upper outlier beyond']);
    expect(asidesAt(0)).toBeUndefined();
    expect(asidesAt(7)).toBeUndefined();
  });

  test('end the ladder for the jump to its end', () => {
    const trace = boxen([SPREAD]);
    trace.moveToIndex(0, 4);

    trace.moveToExtreme('FORWARD');

    expect(stateOf(trace).text).toMatchObject({ section: 'upper outlier', cross: { value: 90 } });
  });

  test('stay out of the quantile range the bracket keys go to the ends of', () => {
    const trace = boxen([SPREAD]);

    const targets = trace.getExtremaTargets().map(({ type, value, categoryIndex }) => ({ type, value, categoryIndex }));

    expect(targets).toEqual([
      { type: 'max', value: 75, categoryIndex: 6 },
      { type: 'min', value: 30, categoryIndex: 2 },
    ]);
  });
});

describe('a walk across distributions', () => {
  const ladder = SPREAD.levels;
  const three: BoxenPoint = { z: 'three', median: 50, levels: ladder, lowerOutliers: [1, 2, 3], upperOutliers: [80, 85] };
  const one: BoxenPoint = { z: 'one', median: 50, levels: ladder, lowerOutliers: [10], upperOutliers: [95] };
  const none: BoxenPoint = { z: 'none', median: 50, levels: ladder };

  /**
   * Where the trace stands.
   * @param trace - The trace
   * @returns The distribution's name and the stop's name and value
   */
  function where(trace: BoxenTrace): [unknown, string | undefined, unknown] {
    const { text } = stateOf(trace);
    return [text.main.value, text.section, text.cross?.value];
  }

  test('steps from an outlier to the one as far out on the next distribution', () => {
    const trace = boxen([three, one]);
    trace.moveToIndex(0, 0);

    trace.moveOnce('UPWARD');

    expect(where(trace)).toEqual(['one', 'lower outlier', 10]);
  });

  test('settles for the innermost outlier where the next has fewer, and the deepest rung where it has none', () => {
    const trace = boxen([three, one, none]);
    trace.moveToIndex(0, 2);

    trace.moveOnce('UPWARD');
    const fewer = where(trace);
    trace.moveOnce('UPWARD');
    const noneAtAll = where(trace);

    expect(fewer).toEqual(['one', 'lower outlier', 10]);
    expect(noneAtAll).toEqual(['none', '12.5th percentile', 30]);
  });

  test('comes back to the outlier it set out from', () => {
    const trace = boxen([three, one, none]);
    trace.moveToIndex(0, 1);

    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');

    expect(where(trace)).toEqual(['three', 'lower outlier', 2]);
  });

  test('holds an upper outlier counting from the top', () => {
    const trace = boxen([three, one]);
    trace.moveToIndex(0, 9);

    trace.moveOnce('UPWARD');

    expect(where(trace)).toEqual(['one', 'upper outlier', 95]);
  });

  test('steps from a rung to the nearest rung, never onto an outlier', () => {
    const trace = boxen([one, three]);
    trace.moveToIndex(0, 1);

    trace.moveOnce('UPWARD');

    expect(where(trace)).toEqual(['three', '12.5th percentile', 30]);
  });
});

describe('what an outlier outlines', () => {
  const NOWHERE = { left: 0, right: 0, top: 0, bottom: 0 };
  const layout = new Map<string, typeof NOWHERE>();

  beforeAll(() => {
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const extent = layout.get(this.getAttribute('data-name') ?? '') ?? NOWHERE;
      return {
        ...extent,
        width: extent.right - extent.left,
        height: extent.bottom - extent.top,
        x: extent.left,
        y: extent.top,
        toJSON: () => ({}),
      };
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    layout.clear();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  /**
   * Draw the spread distribution standing up, four pixels to a unit: its
   * ladder as three tiled boxes in a group, and its outliers as dots in a
   * group of their own, in the order given.
   * @param dots - Each dot's name, class and value
   * @param placed - Whether the dots are laid out
   * @param options - How the chart is drawn
   * @param options.inverted - Whether the value axis runs down the page
   * @param options.top - Where the ladder's top box ends, as a value
   */
  function draw(dots: [string, string, number][], placed = true, { inverted = false, top = 75 } = {}): void {
    // Four pixels to a unit, higher values higher on the page -- or lower on
    // it, on an inverted axis.
    const at = (value: number): number => (inverted ? 4 * value : 400 - 4 * value);
    const box = (name: string, from: number, to: number): string => {
      layout.set(name, { left: 90, right: 110, top: Math.min(at(from), at(to)), bottom: Math.max(at(from), at(to)) });
      return `<path data-name="${name}" />`;
    };
    const dot = ([name, kind, value]: [string, string, number]): string => {
      if (placed) {
        layout.set(name, { left: 97, right: 103, top: at(value) - 3, bottom: at(value) + 3 });
      }
      return `<circle class="${kind}" data-name="${name}" />`;
    };
    layout.set('ladder', { left: 90, right: 110, top: Math.min(at(30), at(top)), bottom: Math.max(at(30), at(top)) });
    document.body.innerHTML = `<svg xmlns="${SVG_NS}">`
      + `<g class="ladder" data-name="ladder">${box('low box', 30, 40)}${box('middle box', 40, 60)}${box('high box', 60, top)}</g>`
      + `<g>${dots.map(dot).join('')}</g>`
      + `</svg>`;
  }

  /**
   * What each stop of the first distribution outlines, in walking order.
   * @param trace - The trace
   * @returns The name of each outlined element
   */
  function outlinedAlong(trace: BoxenTrace): (string | null)[] {
    const names: (string | null)[] = [];
    for (let col = 0; trace.moveToIndex(0, col); col++) {
      const { highlight } = stateOf(trace);
      const [element] = highlight.empty ? [] : [highlight.elements].flat();
      names.push(element?.getAttribute('data-name') ?? null);
    }
    return names;
  }

  const DOTS: [string, string, number][] = [['twelve', 'low', 12], ['ninety', 'high', 90], ['five', 'low', 5]];
  // Every dot of the group, both sides and in drawn order, as one selector.
  const NAMED: BoxenSelector[] = [{ ladder: 'g.ladder', outliers: ['circle'] }];

  test('is its own mark, paired with it by where it is drawn', () => {
    draw(DOTS);

    const along = outlinedAlong(boxen([SPREAD], NAMED));

    expect(along).toEqual(['five', 'twelve', 'low box', 'middle box', 'middle box', 'middle box', 'high box', 'ninety']);
  });

  test('is the whole distribution where the layer names a different number of marks', () => {
    draw(DOTS);

    const along = outlinedAlong(boxen([SPREAD], [{ ladder: 'g.ladder', outliers: ['circle.low'] }]));

    expect(along).toEqual(['ladder', 'ladder', 'low box', 'middle box', 'middle box', 'middle box', 'high box', 'ladder']);
  });

  test('is the whole distribution where the layer names the ladder alone', () => {
    draw(DOTS);

    const along = outlinedAlong(boxen([SPREAD], 'g.ladder'));

    expect(along).toEqual(['ladder', 'ladder', 'low box', 'middle box', 'middle box', 'middle box', 'high box', 'ladder']);
  });

  test('is the whole distribution where the marks have not been laid out', () => {
    draw(DOTS, false);

    const along = outlinedAlong(boxen([SPREAD], NAMED));

    expect(along).toEqual(['ladder', 'ladder', 'low box', 'middle box', 'middle box', 'middle box', 'high box', 'ladder']);
  });

  test('is a copy made once, which goes with the trace', () => {
    draw(DOTS);
    const trace = boxen([SPREAD], NAMED);
    const copies = document.querySelectorAll('[data-maidr-owned]').length;

    trace.dispose();

    // Three dots and three boxes; nothing outlines the whole distribution.
    expect(copies).toBe(6);
    expect(document.querySelectorAll('[data-maidr-owned]')).toHaveLength(0);
  });

  test('is paired again while the copies of an earlier reading are still in the chart', () => {
    draw(DOTS);
    boxen([SPREAD], NAMED);

    const along = outlinedAlong(boxen([SPREAD], NAMED));

    expect(along).toEqual(['five', 'twelve', 'low box', 'middle box', 'middle box', 'middle box', 'high box', 'ninety']);
  });

  test('is paired the right way round on a reversed value axis', () => {
    draw(DOTS, true, { inverted: true });

    const along = outlinedAlong(boxen([SPREAD], NAMED));

    expect(along).toEqual(['five', 'twelve', 'low box', 'middle box', 'middle box', 'middle box', 'high box', 'ninety']);
  });

  test('says which end is low where the ladder\'s two tails cannot', () => {
    // Even tails fit the axis either way round; two outliers below the ladder
    // and one above settle it.
    draw(DOTS, true, { top: 70 });

    const along = outlinedAlong(boxen([{ ...SPREAD, levels: EVEN_TAILS }], NAMED));

    expect(along).toEqual(['five', 'twelve', 'low box', 'middle box', 'middle box', 'middle box', 'high box', 'ninety']);
  });

  test('is the whole distribution where nothing says which end is low', () => {
    // Even tails, and as many outliers above as below.
    draw([['five', 'low', 5], ['ninety', 'high', 90]], true, { top: 70 });

    const along = outlinedAlong(boxen([{ ...SPREAD, levels: EVEN_TAILS, lowerOutliers: [5] }], NAMED));

    expect(along).toEqual(Array.from({ length: 7 }, () => 'ladder'));
  });

  test('leaves nothing outlined where a ladder entry names other than one element', () => {
    draw(DOTS);

    const trace = boxen([SPREAD], [{ ladder: 'path', outliers: ['circle'] }]);

    expect(trace.getAllHighlightElements()).toEqual([]);
  });
});
