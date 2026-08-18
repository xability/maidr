import type { NotificationService } from '@service/notification';
import type { Maidr, MaidrSubplot } from '@type/grammar';
import type { PlotState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * A subplot authored with an empty `layers` array used to throw in
 * `Subplot.activeTrace` while the plot context was being built — before any
 * user interaction — so MAIDR never attached and the *entire* figure went
 * inert, well-formed panels included (issue #749).
 *
 * An empty subplot is a legitimate thing for a producer to emit: an unoccupied
 * cell in a non-rectangular grid, or a panel whose geom is not supported yet.
 * It must read as "this panel has nothing to describe" and leave the rest of
 * the figure navigable.
 */
const EMPTY_SUBPLOT: MaidrSubplot = { layers: [] };

function barSubplot(id: string, value: number): MaidrSubplot {
  return { layers: [{ id, type: TraceType.BAR, data: [{ x: 'A', y: value }] }] };
}

/** First panel empty, second well-formed — the reported reproduction. */
function createFigureWithEmptyFirstPanel(): Figure {
  const maidr: Maidr = {
    id: 'empty-first-panel',
    subplots: [[EMPTY_SUBPLOT], [barSubplot('sp-2', 2)]],
  } as Maidr;
  return new Figure(maidr);
}

/** A single panel with no layers at all — nothing in the figure to describe. */
function createFigureWithOnlyAnEmptyPanel(): Figure {
  const maidr: Maidr = {
    id: 'only-empty-panel',
    subplots: [[EMPTY_SUBPLOT]],
  } as Maidr;
  return new Figure(maidr);
}

describe('subplot with no layers', () => {
  test('reports the empty state instead of throwing on activeTrace', () => {
    const subplot = createFigureWithEmptyFirstPanel().subplots[0][0];

    expect(subplot.activeTrace).toBeNull();
    expect(subplot.state).toEqual({ empty: true, type: 'subplot' });
  });

  test('building the context does not throw and the figure still describes itself', () => {
    const figure = createFigureWithEmptyFirstPanel();

    // The reported crash happened here, in `Context.initializePlotContext` ->
    // `isFigureLevel` -> `figure.state`, before any keystroke.
    const context = new Context(figure);

    const state = context.state;
    expect(state.type).toBe('figure');
    expect(state.empty).toBe(false);
  });

  test('the well-formed sibling panel stays reachable', () => {
    const figure = createFigureWithEmptyFirstPanel();
    const context = new Context(figure);

    // Move off the empty panel onto the bar panel, then enter it.
    expect(figure.moveToIndex(1, 0)).toBe(true);
    expect(context.enterSubplot()).toBe(true);

    const state = context.state;
    expect(state.type).toBe('trace');
    expect(state.empty).toBe(false);
  });

  test('entering an empty panel is refused, leaving the user in the lobby', () => {
    const context = new Context(createFigureWithEmptyFirstPanel());

    expect(context.enterSubplot()).toBe(false);
    // No bare Subplot is left on the stack: the lobby is still the context.
    expect(context.state.type).toBe('figure');
  });

  test('a figure whose only panel is empty starts at figure level without throwing', () => {
    const context = new Context(createFigureWithOnlyAnEmptyPanel());

    expect(context.state.type).toBe('figure');
    expect(context.getInstruction(false)).toContain('maidr figure');
  });

  test('navigating within an empty panel reports out of bounds rather than throwing', () => {
    const subplot = createFigureWithOnlyAnEmptyPanel().subplots[0][0];

    expect(subplot.moveOnce('FORWARD')).toBe(false);
    expect(subplot.moveToExtreme('FORWARD')).toBe(false);
    expect(subplot.isMovable('FORWARD')).toBe(false);
  });
});

describe('TextService wording for a panel with no layers', () => {
  /** A lobby state focused on a panel that contributed no trace types. */
  function emptyPanelLobbyState(): PlotState {
    return {
      empty: false,
      type: 'figure',
      index: 1,
      size: 2,
      traceTypes: [],
      subplot: { empty: true, type: 'subplot' },
    } as unknown as PlotState;
  }

  function createTextService(): TextService {
    return new TextService({ notify: jest.fn() } as unknown as NotificationService);
  }

  test('verbose says the panel is empty instead of listing no plot types', () => {
    const text = createTextService();

    expect(text.format(emptyPanelLobbyState())).toBe(
      'Subplot 1 of 2 is empty, nothing to describe.',
    );
  });

  test('terse marks the panel as empty', () => {
    const text = createTextService();
    text.toggle(); // VERBOSE -> TERSE

    expect(text.format(emptyPanelLobbyState())).toBe('Subplot 1, empty');
  });

  test('says nothing in OFF text mode', () => {
    const text = createTextService();
    text.toggle(); // VERBOSE -> TERSE
    text.toggle(); // TERSE -> OFF

    expect(text.emptySubplotText(1, 2, '')).toBeNull();
  });
});

/**
 * The stricter cousin of the case above: a subplot with no `layers` *key*
 * at all, rather than an empty array.
 *
 * `layers` is required in `MaidrSubplot`, but that is a claim about
 * TypeScript callers and the schema arrives at runtime as JSON — from
 * py-maidr, from r-maidr, from a hand-authored `maidr` attribute. Any of
 * them can emit a cell the type says is impossible; py-maidr did, for
 * every unoccupied position of a sparse subplot grid
 * (xability/py-maidr#512).
 *
 * This one failed earlier and harder than #749 did. `Figure`'s constructor
 * maps every cell through `new Subplot`, which read `layers.length`
 * unguarded — so one bare cell threw during construction and *no* part of
 * the chart initialised. The SVG still drew, so the page looked finished
 * and the key that starts navigation did nothing at all.
 */
describe('subplot with no layers key', () => {
  /** A cell as a producer emits it when it forgets the contract. */
  const BARE_SUBPLOT = {} as unknown as MaidrSubplot;

  function createFigureWithABareCell(): Figure {
    const maidr: Maidr = {
      id: 'bare-cell',
      subplots: [[barSubplot('sp-1', 1), BARE_SUBPLOT, barSubplot('sp-3', 3)]],
    } as Maidr;
    return new Figure(maidr);
  }

  test('constructing the figure does not throw', () => {
    expect(() => createFigureWithABareCell()).not.toThrow();
  });

  test('the well-formed cells either side are still built', () => {
    const [row] = createFigureWithABareCell().subplots;

    expect(row).toHaveLength(3);
    expect(row[0].activeTrace).not.toBeNull();
    expect(row[2].activeTrace).not.toBeNull();
  });

  test('the bare cell reads as empty rather than as something broken', () => {
    const bare = createFigureWithABareCell().subplots[0][1];

    expect(bare.activeTrace).toBeNull();
    expect(bare.state).toEqual({ empty: true, type: 'subplot' });
  });

  test('the figure is navigable, which is the whole point', () => {
    const figure = createFigureWithABareCell();
    const context = new Context(figure);

    expect(context.state.type).toBe('figure');
    // Past the bare cell and into the far one.
    expect(figure.moveToIndex(0, 2)).toBe(true);
    expect(context.enterSubplot()).toBe(true);
    expect(context.state.type).toBe('trace');
  });

  test('the position is named on the console, so a producer can find it', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      createFigureWithABareCell();

      const messages = warn.mock.calls.map(call => String(call[0]));
      const reported = messages.filter(m => m.includes('has no `layers`'));

      expect(reported).toHaveLength(1);
      // The coordinates matter more than the wording: without them the
      // warning cannot be acted on in a grid of any size.
      expect(reported[0]).toContain('[0][1]');
    } finally {
      warn.mockRestore();
    }
  });

  test('a well-formed figure says nothing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const figure = new Figure({
        id: 'all-well-formed',
        subplots: [[barSubplot('sp-1', 1), EMPTY_SUBPLOT]],
      } as Maidr);
      expect(figure.subplots[0]).toHaveLength(2);

      const messages = warn.mock.calls.map(call => String(call[0]));
      expect(messages.filter(m => m.includes('has no `layers`'))).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });
});
