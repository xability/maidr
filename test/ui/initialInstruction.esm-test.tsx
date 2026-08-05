/**
 * @jest-environment jsdom
 */

/**
 * Component tests for the pre-activation announcement.
 *
 * `Maidr` labels the plot wrapper before any Controller exists, so a screen
 * reader can find the chart (NVDA "g") without focusing it first. That string
 * is built by a second instruction builder — the model's
 * `Context.getInstruction` produces the post-activation one — and the two have
 * to agree, or the announcement changes the moment the user focuses the chart.
 *
 * The Controller is created on focus-in, not on mount, so rendering here
 * exercises the label alone.
 */

import type { BoxPoint, Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';
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
 * Renders a figure of the given layers and returns its pre-activation label.
 * @param layers - The layers of the only subplot
 * @returns The wrapper's accessible name
 */
function labelFor(...layers: MaidrLayer[]): string {
  const data: MaidrData = { id: 'label-test', subplots: [[{ layers }]] };
  const { unmount } = render(
    <Maidr data={data}>
      <svg />
    </Maidr>,
  );
  const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
  unmount();
  return label;
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
