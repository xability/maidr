import type { Figure } from '@model/plot';
import { describe, expect, test } from '@jest/globals';
import { DEFAULT_SUBPLOT_TITLE } from '@model/abstract';
import { Context } from '@model/context';
import { DEFAULT_CAPTION, DEFAULT_FIGURE_AXIS, DEFAULT_FIGURE_TITLE, DEFAULT_SUBTITLE } from '@model/plot';

/**
 * Minimal Figure stub that takes the empty-state branch in Context's
 * constructor. The isAuthored* predicates do not touch the figure, so
 * this is sufficient for direct predicate coverage.
 */
function createStubFigure(): Figure {
  return {
    id: 'test-figure',
    state: { empty: true, type: 'figure' },
  } as unknown as Figure;
}

describe('Context.isAuthoredTitle', () => {
  const context = new Context(createStubFigure());

  test('returns true for a normal authored title', () => {
    expect(context.isAuthoredTitle('My Plot')).toBe(true);
  });

  test('returns false for the figure-level placeholder default', () => {
    expect(context.isAuthoredTitle(DEFAULT_FIGURE_TITLE)).toBe(false);
  });

  test('returns false for the subplot-level placeholder default', () => {
    expect(context.isAuthoredTitle(DEFAULT_SUBPLOT_TITLE)).toBe(false);
  });

  test('returns false for an empty string', () => {
    expect(context.isAuthoredTitle('')).toBe(false);
  });

  test('returns false for a whitespace-only string', () => {
    expect(context.isAuthoredTitle('   ')).toBe(false);
  });

  test('returns true for a title that happens to contain a placeholder substring', () => {
    expect(context.isAuthoredTitle('MAIDR Plot of Annual Revenue')).toBe(true);
  });
});

describe('Context.isAuthoredSubtitle', () => {
  const context = new Context(createStubFigure());

  test('returns true for a normal authored subtitle', () => {
    expect(context.isAuthoredSubtitle('A subtitle')).toBe(true);
  });

  test('returns false for the subtitle placeholder default', () => {
    expect(context.isAuthoredSubtitle(DEFAULT_SUBTITLE)).toBe(false);
  });

  test('returns false for an empty or whitespace-only string', () => {
    expect(context.isAuthoredSubtitle('')).toBe(false);
    expect(context.isAuthoredSubtitle('   ')).toBe(false);
  });
});

describe('Context.isAuthoredCaption', () => {
  const context = new Context(createStubFigure());

  test('returns true for a normal authored caption', () => {
    expect(context.isAuthoredCaption('A caption')).toBe(true);
  });

  test('returns false for the caption placeholder default', () => {
    expect(context.isAuthoredCaption(DEFAULT_CAPTION)).toBe(false);
  });

  test('returns false for an empty or whitespace-only string', () => {
    expect(context.isAuthoredCaption('')).toBe(false);
    expect(context.isAuthoredCaption('   ')).toBe(false);
  });
});

describe('Context.isAuthoredAxisLabel', () => {
  const context = new Context(createStubFigure());

  test('returns true for a normal authored figure-wide axis label', () => {
    expect(context.isAuthoredAxisLabel('Year')).toBe(true);
  });

  test('returns false for the absent (empty sentinel) default', () => {
    expect(context.isAuthoredAxisLabel(DEFAULT_FIGURE_AXIS)).toBe(false);
  });

  test('returns false for an empty or whitespace-only string', () => {
    expect(context.isAuthoredAxisLabel('')).toBe(false);
    expect(context.isAuthoredAxisLabel('   ')).toBe(false);
  });

  test('with no figure state, figure axis getters return the empty default', () => {
    // The stub figure reports an empty state, so the getters fall through to
    // DEFAULT_FIGURE_AXIS and read as unauthored.
    expect(context.figureXAxis).toBe(DEFAULT_FIGURE_AXIS);
    expect(context.figureYAxis).toBe(DEFAULT_FIGURE_AXIS);
    expect(context.isAuthoredAxisLabel(context.figureXAxis)).toBe(false);
  });
});
