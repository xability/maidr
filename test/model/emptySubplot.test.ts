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
