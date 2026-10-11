/**
 * @jest-environment jsdom
 */

/**
 * The plot is named by what the chart is and described by how to use it
 * (#1384). `maidr-component.tsx` gives it the name and the instructions it
 * starts with; DisplayService keeps the description in step with the reader
 * from the first focus on, and never touches the name.
 */

import type { Context } from '@model/context';
import type { TextService } from '@service/text';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { DisplayService } from '@service/display';

const NAME = 'Tips by day, Bar Chart';
const HELP = 'Press Control Slash for keyboard help.';

/**
 * Builds the figure `maidr-component.tsx` renders for a chart: the plot, named
 * and described by the initial instructions, and the element they are in.
 * @param chartId - The chart's id
 * @param describedBy - What the plot's aria-describedby starts as
 * @returns The plot element
 */
function renderFigure(chartId: string, describedBy = `maidr-instruction-${chartId}`): HTMLElement {
  const figure = document.createElement('figure');
  const plot = document.createElement('div');
  plot.tabIndex = 0;
  plot.setAttribute('role', 'img');
  plot.setAttribute('aria-label', NAME);
  plot.setAttribute('aria-describedby', describedBy);
  const initial = document.createElement('div');
  initial.id = `maidr-instruction-${chartId}`;
  initial.hidden = true;
  initial.textContent = `Initial instruction. ${HELP}`;
  figure.append(plot, initial);
  document.body.append(figure);
  return plot;
}

/**
 * A context whose instructions say whether they carry the click prompt.
 * @param chartId - The chart's id
 * @returns The context
 */
function contextFor(chartId: string): Context {
  return {
    id: chartId,
    scope: 'TRACE',
    getInstruction: jest.fn((includeClickPrompt: boolean) =>
      includeClickPrompt ? 'Click to activate. Use Arrows.' : 'Use Arrows.'),
    toggleScope: jest.fn(),
    active: { notifyStateUpdate: jest.fn() },
  } as unknown as Context;
}

/**
 * A text service that hands back the listener DisplayService registers, so a
 * test can play the first navigation update.
 * @returns The service and a function that fires its change event
 */
function textServiceWithTrigger(): { textService: TextService; navigate: () => void } {
  let listener: (() => void) | null = null;
  const textService = {
    onChange: jest.fn((callback: () => void) => {
      listener = callback;
      return { dispose: jest.fn() };
    }),
    format: jest.fn(() => ''),
  } as unknown as TextService;
  return { textService, navigate: () => listener?.() };
}

/**
 * The text the plot's aria-describedby points to, in order.
 * @param plot - The plot element
 * @returns The description a screen reader is given
 */
function descriptionOf(plot: HTMLElement): string {
  return (plot.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

describe('DisplayService describes the plot by its instructions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  test('describes the focused plot without the click prompt, and keeps its name', () => {
    const plot = renderFigure('c1');
    const { textService } = textServiceWithTrigger();

    const service = new DisplayService(contextFor('c1'), plot, textService);

    expect(plot.getAttribute('aria-label')).toBe(NAME);
    expect(plot.getAttribute('role')).toBe('application');
    expect(plot.getAttribute('aria-describedby')).toBe('maidr-instruction-c1-current');
    expect(descriptionOf(plot)).toBe(`Use Arrows. ${HELP}`);
    service.dispose();
  });

  test('stops describing the plot once the reader moves, and keeps its name', () => {
    const plot = renderFigure('c1');
    const { textService, navigate } = textServiceWithTrigger();
    const service = new DisplayService(contextFor('c1'), plot, textService);

    navigate();

    expect(plot.hasAttribute('aria-describedby')).toBe(false);
    expect(plot.getAttribute('aria-label')).toBe(NAME);
    service.dispose();
  });

  test('describes the plot with the click prompt again once the reader leaves', () => {
    const plot = renderFigure('c1');
    const { textService, navigate } = textServiceWithTrigger();
    const service = new DisplayService(contextFor('c1'), plot, textService);
    navigate();

    service.dispose();

    expect(plot.getAttribute('role')).toBe('img');
    expect(plot.getAttribute('aria-label')).toBe(NAME);
    expect(descriptionOf(plot)).toBe(`Click to activate. Use Arrows. ${HELP}`);
    expect(plot.getAttribute('title')).toBe('Click to activate. Use Arrows.');
  });

  test('leaves the description a page gave the plot first', () => {
    const plot = renderFigure('c1', 'author-alt maidr-instruction-c1');
    const { textService, navigate } = textServiceWithTrigger();
    const service = new DisplayService(contextFor('c1'), plot, textService);

    expect(plot.getAttribute('aria-describedby')).toBe('author-alt maidr-instruction-c1-current');

    navigate();

    expect(plot.getAttribute('aria-describedby')).toBe('author-alt');

    service.dispose();

    expect(plot.getAttribute('aria-describedby')).toBe('author-alt maidr-instruction-c1-current');
  });

  test('reuses its element for the next focus', () => {
    const plot = renderFigure('c1');
    const { textService } = textServiceWithTrigger();

    new DisplayService(contextFor('c1'), plot, textService).dispose();
    const second = new DisplayService(contextFor('c1'), plot, textService);

    expect(plot.parentElement?.querySelectorAll('[id="maidr-instruction-c1-current"]')).toHaveLength(1);
    second.dispose();
  });

  test('writes into its own figure when another chart shares its id', () => {
    const first = renderFigure('same');
    const second = renderFigure('same');
    const { textService } = textServiceWithTrigger();

    const service = new DisplayService(contextFor('same'), second, textService);

    expect(first.parentElement?.querySelector('[id="maidr-instruction-same-current"]')).toBeNull();
    expect(second.parentElement?.querySelector('[id="maidr-instruction-same-current"]')?.textContent)
      .toBe(`Use Arrows. ${HELP}`);
    service.dispose();
  });
});
