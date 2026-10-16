/**
 * @jest-environment jsdom
 */

/**
 * Component tests for the pre-activation announcement.
 *
 * `Maidr` names and describes the plot wrapper before any Controller exists,
 * so a screen reader can find the chart (NVDA "g") without focusing it first.
 * The name says what the chart is, its title and type (#1384); the
 * description says how to use it. The description is built by a second
 * instruction builder — the model's `Context.getInstruction` produces the
 * post-activation one — and the two have to agree, or the announcement
 * changes the moment the user focuses the chart.
 *
 * The Controller is created on focus-in, not on mount, so rendering here
 * exercises the name and description alone.
 */

import type { BoxPoint, Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { Orientation, TraceType } from '@type/grammar';
import { Maidr } from '../../src/maidr-component';

/**
 * Creates a bar layer, optionally declaring an orientation.
 * @param orientation - The orientation to declare, or undefined to omit it
 * @returns A bar layer definition
 */
function createBarLayer(orientation?: Orientation): MaidrLayer {
  return {
    id: 'bar-layer',
    type: TraceType.BAR,
    axes: { x: { label: 'Category' }, y: { label: 'Value' } },
    orientation,
    data: [
      { x: 'A', y: 1 },
      { x: 'B', y: 2 },
    ],
  };
}

/**
 * Creates a box layer, optionally declaring an orientation.
 * @param orientation - The orientation to declare, or undefined to omit it
 * @returns A box layer definition
 */
function createBoxLayer(orientation?: Orientation): MaidrLayer {
  const point: BoxPoint = {
    z: 'A',
    lowerOutliers: [],
    min: 1,
    q1: 2,
    q2: 3,
    q3: 4,
    max: 5,
    upperOutliers: [],
  };
  return {
    id: 'box-layer',
    type: TraceType.BOX,
    axes: { x: { label: 'Category' }, y: { label: 'Value' } },
    orientation,
    data: [point],
  };
}

/**
 * Creates a single-group line layer, which has no orientation.
 * @returns A line layer definition
 */
function createLineLayer(): MaidrLayer {
  return {
    id: 'line-layer',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]],
  };
}

/**
 * Renders a chart and reads the plot wrapper's pre-activation name and
 * description, the way a screen reader is given them, and its title.
 * @param data - The chart
 * @returns The wrapper's accessible name and description, and its title
 */
function announcementOf(data: MaidrData): { name: string; description: string; title: string | null } {
  const { unmount } = render(
    <Maidr data={data}>
      <svg />
    </Maidr>,
  );
  const plot = screen.getByRole('img');
  const name = plot.getAttribute('aria-label') ?? '';
  const description = (plot.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');
  const title = plot.getAttribute('title');
  unmount();
  return { name, description, title };
}

/**
 * Renders a figure of the given layers and returns its pre-activation
 * instructions.
 * @param layers - The layers of the only subplot
 * @returns The wrapper's accessible description
 */
function labelFor(...layers: MaidrLayer[]): string {
  return announcementOf({ id: 'label-test', subplots: [[{ layers }]] }).description;
}

describe('pre-activation instruction orientation', () => {
  test('announces an undeclared bar orientation as vertical', () => {
    expect(labelFor(createBarLayer())).toContain('type: vertical bar.');
  });

  test('announces a declared horizontal box orientation', () => {
    expect(labelFor(createBoxLayer(Orientation.HORIZONTAL))).toContain(
      'type: horizontal box.',
    );
  });

  test('leaves a trace type that has no orientation unprefixed', () => {
    expect(labelFor(createLineLayer())).toContain('type: single line.');
  });

  test('announces the orientation of layer 1 of a multi-layer plot', () => {
    expect(labelFor(createBarLayer(), createLineLayer())).toContain(
      'layer 1 of 2: vertical bar plot.',
    );
  });
});

describe('pre-activation name', () => {
  test('names the chart by its title and type', () => {
    const { name } = announcementOf({
      id: 'name-test',
      title: 'Tips by day',
      subplots: [[{ layers: [createBarLayer()] }]],
    });

    expect(name).toBe('Tips by day, Bar Chart');
  });

  test('takes the title of a single panel from its layer', () => {
    const { name } = announcementOf({
      id: 'name-test',
      subplots: [[{ layers: [{ ...createBarLayer(), title: 'Tips by day' }] }]],
    });

    expect(name).toBe('Tips by day, Bar Chart');
  });

  test('names a chart with no title by its type alone', () => {
    expect(announcementOf({ id: 'name-test', subplots: [[{ layers: [createLineLayer()] }]] }).name)
      .toBe('Line Chart');
  });

  test('names a chart whose producer sent a title that is not text by its type alone', () => {
    // r-maidr writes a layer with no title as `"title": {}`, R's empty list.
    const layer = { ...createBarLayer(), title: {} } as unknown as MaidrLayer;

    const { name, description } = announcementOf({ id: 'name-test', subplots: [[{ layers: [layer] }]] });

    expect(name).toBe('Bar Chart');
    expect(description).toContain('This is a maidr plot of type: vertical bar.');
  });

  test('names a plot of several layers by their count', () => {
    const { name } = announcementOf({
      id: 'name-test',
      subplots: [[{ layers: [createBarLayer(), createLineLayer()] }]],
    });

    expect(name).toBe('Chart with 2 layers');
  });

  test('names a figure of several panels by their count, not by one panel', () => {
    const { name } = announcementOf({
      id: 'name-test',
      subplots: [[
        { layers: [{ ...createBarLayer(), title: 'Panel A' }] },
        { layers: [{ ...createLineLayer(), title: 'Panel B' }] },
      ]],
    });

    expect(name).toBe('Figure with 2 subplots');
  });

  test('keeps the instructions out of the name and gives them as the description', () => {
    const { name, description, title } = announcementOf({
      id: 'name-test',
      subplots: [[{ layers: [createBarLayer()] }]],
    });

    expect(name).not.toContain('Use Arrows');
    expect(description).toBe(
      'This is a maidr plot of type: vertical bar. Click to activate. Use Arrows to navigate data points. '
      + 'Toggle B for Braille, T for Text, S for Sonification, and R for Review mode. '
      + 'Press Control Slash for keyboard help.',
    );
    // Once: a title would be read as well by some screen readers.
    expect(title).toBeNull();
  });

  test('says a chart with nothing in it has nothing to describe, not how to move through it', () => {
    // A diagram with nothing drawn in it yet -- a gantt with no tasks -- gets
    // no controller until it has layers, so this is all a reader hears.
    const { description } = announcementOf({ id: 'empty-test', subplots: [[{ layers: [] }]] });

    expect(description).toBe(
      'This is a maidr plot with nothing in it to describe yet: it has no data points. Click to activate. '
      + 'Press Control Slash for keyboard help.',
    );
  });

  // Bug (#1418): a figure of several panels, every one empty, also gets no
  // controller, so this is all a reader hears -- and it tells them to move
  // between subplots and press ENTER, which does nothing. The count of
  // subplots wins over the absence of layers.
  test.failing('says a figure whose every panel is empty has nothing to describe', () => {
    const empty = { layers: [] };

    const { description } = announcementOf({ id: 'all-empty-test', subplots: [[empty, empty], [empty]] });

    expect(description).toBe(
      'This is a maidr plot with nothing in it to describe yet: it has no data points. Click to activate. '
      + 'Press Control Slash for keyboard help.',
    );
  });
});

/**
 * Moves a pointer of a given type onto an element. jsdom has no
 * PointerEvent, so the type is set on the plain event it makes instead.
 * @param element - The element the pointer moves onto
 * @param pointerType - The pointer's type: 'mouse', 'pen' or 'touch'
 */
function pointerOnto(element: HTMLElement, pointerType: string): void {
  const event = createEvent.pointerOver(element);
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(element, event);
}

describe('the tooltip a sighted mouse user is shown (#244)', () => {
  /**
   * Renders a bar chart.
   * @returns The plot wrapper, its description, and how to unmount it
   */
  function renderChart(): { plot: HTMLElement; description: string; unmount: () => void } {
    const { unmount } = render(
      <Maidr data={{ id: 'hint-test', subplots: [[{ layers: [createBarLayer()] }]] }}>
        <svg />
      </Maidr>,
    );
    const plot = screen.getByRole('img');
    const description = document.getElementById(plot.getAttribute('aria-describedby') ?? '')
      ?.textContent ?? '';
    return { plot, description, unmount };
  }

  test('is the instructions while a mouse is over the chart, and goes when it leaves', () => {
    const { plot, description, unmount } = renderChart();

    pointerOnto(plot, 'mouse');
    // How to use the chart, "Click to activate." among it.
    expect(plot.getAttribute('title')).toBe(description);
    expect(description).toContain('Click to activate.');

    fireEvent.pointerOut(plot);
    expect(plot.hasAttribute('title')).toBe(false);
    unmount();
  });

  test('is not given for a touch, which has no hover', () => {
    const { plot, unmount } = renderChart();

    pointerOnto(plot, 'touch');

    expect(plot.hasAttribute('title')).toBe(false);
    unmount();
  });
});
