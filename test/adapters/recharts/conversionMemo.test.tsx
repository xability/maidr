/**
 * @jest-environment jsdom
 *
 * `children` is a JSX element freshly created by the parent on every render, so
 * its identity is never stable. With it in the `useMemo` dependency list the
 * conversion never hits: `convertRechartsToMaidr` walks every row once per
 * `yKey` — plus one selector string per bar on a reversed axis — on every
 * render of the parent, including renders caused by state that has nothing to
 * do with the chart.
 *
 * It also hands `<Maidr>` a new `maidrData` identity each time, which fires
 * `useMaidrController`'s `useEffect([data])` and calls
 * `liveDataManager.updateStoredData` on every one of them.
 *
 * Only two scalar facts are read out of `children`, and those are what the
 * dependency should be.
 */

import type { Maidr as MaidrData } from '@type/grammar';
import type { JSX, ReactNode } from 'react';
import { MaidrRecharts } from '@adapters/recharts/MaidrRecharts';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react';
import { createElement, useState } from 'react';

const seen: MaidrData[] = [];

jest.mock('../../../src/maidr-component', () => ({
  Maidr: ({ data, children }: { data: MaidrData; children: ReactNode }): ReactNode => {
    seen.push(data);
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
const BarChart = stub('BarChart');

const DATA = [
  { quarter: 'Q1', revenue: 100 },
  { quarter: 'Q2', revenue: 200 },
];
// Hoisted because array props are compared by reference, which the hook's own
// documentation says: a fresh `['revenue']` per render would defeat the memo
// on its own and prove nothing about `children`.
const Y_KEYS = ['revenue'];

/** Fires its own state update, exactly as a hover or a resize would. */
let bump: () => void = () => {};

/**
 * A parent whose unrelated state change rebuilds the chart subtree.
 *
 * @param props - What the chart declares
 * @param props.reversed - Whether the category axis is drawn from its far end
 * @returns The wrapped chart
 */
function Host({ reversed }: { reversed: boolean }): JSX.Element {
  const [, setTick] = useState(0);
  bump = () => setTick(tick => tick + 1);

  return createElement(
    MaidrRecharts,
    {
      id: 'chart',
      data: DATA,
      chartType: 'bar' as const,
      xKey: 'quarter',
      yKeys: Y_KEYS,
      // A fresh element every render, which is what JSX in a parent produces.
      children: createElement(BarChart, null, createElement(XAxis, { reversed })),
    },
  );
}

describe('the recharts conversion memo', () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it('holds when only the chart subtree is rebuilt', () => {
    const { rerender } = render(createElement(Host, { reversed: false }));

    rerender(createElement(Host, { reversed: false }));

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });

  it('holds across a parent state change the chart has nothing to do with', () => {
    render(createElement(Host, { reversed: false }));

    act(() => bump());

    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(seen[0]);
  });

  it('still picks up a chart that flips its axis round', () => {
    const { rerender } = render(createElement(Host, { reversed: false }));

    rerender(createElement(Host, { reversed: true }));

    const before = seen[0].subplots[0][0].layers[0].data;
    const after = seen[seen.length - 1].subplots[0][0].layers[0].data;
    expect(before).toEqual([{ x: 'Q1', y: 100 }, { x: 'Q2', y: 200 }]);
    expect(after).toEqual([{ x: 'Q2', y: 200 }, { x: 'Q1', y: 100 }]);
  });
});
