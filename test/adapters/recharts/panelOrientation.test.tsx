/**
 * @jest-environment jsdom
 *
 * Which axis carries the categories follows the *panel's* orientation, and a
 * panel may declare its own: `buildPanelSubplot` resolves it as
 * `panel.orientation ?? config.orientation`. `MaidrRecharts` was passing the
 * grid-wide orientation for every panel, so a panel that overrode it had
 * `reversed` read off the wrong axis component — the un-reversed one answers
 * `false`, and the reader is walked through the categories the opposite way to
 * the way the chart draws them. That is the #1017 regression the per-panel
 * plumbing was added to fix, still present for any panel that overrides
 * orientation.
 *
 * `<Maidr>` is mocked away so the schema the component builds can be read
 * without mounting the whole UI tree (and its ESM-only markdown stack).
 */

import type { Maidr as MaidrData } from '@type/grammar';
import type { JSX, ReactNode } from 'react';
import { MaidrRecharts } from '@adapters/recharts/MaidrRecharts';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react';
import { Orientation } from '@type/grammar';
import { createElement } from 'react';

let captured: MaidrData | null = null;

jest.mock('../../../src/maidr-component', () => ({
  Maidr: ({ data, children }: { data: MaidrData; children: ReactNode }): ReactNode => {
    captured = data;
    return children;
  },
}));

/** A stand-in for a Recharts component: only `displayName` is read. */
function stub(displayName: string): { (): null; displayName: string } {
  const component = (): null => null;
  component.displayName = displayName;
  return component;
}

const XAxis = stub('XAxis');
const YAxis = stub('YAxis');
const BarChart = stub('BarChart');

const LISTED = ['Q1', 'Q2', 'Q3', 'Q4'];
const DRAWN = [...LISTED].reverse();
const DATA = LISTED.map((quarter, i) => ({ quarter, revenue: (i + 1) * 100 }));

/**
 * A panel chart with one axis reversed and the other not.
 *
 * @param reversedAxis - Which axis carries `reversed`
 * @returns The chart subtree for that panel
 */
function panelChart(reversedAxis: 'XAxis' | 'YAxis'): JSX.Element {
  return createElement(
    BarChart,
    null,
    createElement(XAxis, { reversed: reversedAxis === 'XAxis' }),
    createElement(YAxis, { reversed: reversedAxis === 'YAxis' }),
  );
}

/**
 * The categories of the grid's only panel, in the order it announces them.
 *
 * @param panelOrientation - The orientation the panel declares, if any
 * @param gridOrientation - The orientation the grid declares, if any
 * @param reversedAxis - Which axis the panel's chart reverses
 * @returns The categories, in announced order
 */
function categoriesOf(
  panelOrientation: Orientation | undefined,
  gridOrientation: Orientation | undefined,
  reversedAxis: 'XAxis' | 'YAxis',
): (string | number)[] {
  captured = null;
  render(
    createElement(
      MaidrRecharts,
      {
        id: 'grid',
        xKey: 'quarter',
        orientation: gridOrientation,
        subplots: [[{
          chartType: 'bar' as const,
          yKeys: ['revenue'],
          data: DATA,
          ...(panelOrientation === undefined ? {} : { orientation: panelOrientation }),
        }]],
        children: panelChart(reversedAxis),
      },
    ),
  );

  const layer = (captured as unknown as MaidrData).subplots[0][0].layers[0];
  const horizontal = layer.orientation === Orientation.HORIZONTAL;
  return (layer.data as { x: string | number; y: string | number }[])
    .map(point => (horizontal ? point.y : point.x));
}

describe('a subplot panel that declares its own orientation', () => {
  beforeEach(() => {
    captured = null;
  });

  it('reads the reversed axis the panel puts its categories on', () => {
    // The grid says nothing, the panel says horizontal, so the categories are
    // on the `<YAxis>` — and that is the one carrying `reversed`.
    expect(categoriesOf(Orientation.HORIZONTAL, undefined, 'YAxis')).toEqual(DRAWN);
  });

  it('leaves the value axis alone, whichever way the panel is drawn', () => {
    // The mirror case: the grid is horizontal, the panel overrides to
    // vertical, so a reversed `<YAxis>` is the value axis and moves no
    // category.
    expect(categoriesOf(Orientation.VERTICAL, Orientation.HORIZONTAL, 'YAxis'))
      .toEqual(LISTED);
  });

  it('still reads the grid orientation for a panel that declares none', () => {
    expect(categoriesOf(undefined, Orientation.HORIZONTAL, 'YAxis')).toEqual(DRAWN);
    expect(categoriesOf(undefined, undefined, 'XAxis')).toEqual(DRAWN);
  });
});
