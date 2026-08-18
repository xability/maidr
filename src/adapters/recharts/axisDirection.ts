/**
 * Reading a Recharts chart's axis direction out of the elements it was given.
 *
 * Lives apart from {@link MaidrRecharts} because it is a pure function over
 * React elements and nothing else -- importing the component to reach it would
 * drag the whole UI tree, and with it the ESM-only markdown stack, into any
 * test that wanted to check the walk.
 */
import type { ReactNode } from 'react';
import { Children, isValidElement } from 'react';

/**
 * The `displayName` Recharts gives a component, when it has one.
 *
 * Read rather than compared by identity so the walk does not have to import
 * Recharts, which is a peer dependency this package does not take on.
 *
 * @param type - The element's `type`
 * @returns The name, or `undefined`
 */
function displayNameOf(type: unknown): string | undefined {
  if (typeof type === 'function' || (typeof type === 'object' && type !== null)) {
    const named = (type as { displayName?: unknown }).displayName;
    if (typeof named === 'string')
      return named;
  }
  return undefined;
}

/**
 * Whether the axis carrying the categories is drawn from its far end.
 *
 * `<XAxis reversed />` is how Recharts states it, and it lives in the chart
 * subtree this component renders but never used to read -- so a chart drawn
 * right to left was announced left to right, with nothing to consult (#1017).
 *
 * Which axis carries the categories follows the chart's orientation, exactly
 * as `indexAxis` decides it for Chart.js (#1016): x normally, y once the bars
 * are turned on their side. Reversing the *value* axis moves no category.
 *
 * The walk is depth-first because an axis is commonly nested -- inside a
 * `<ResponsiveContainer>`, or behind a fragment -- and stops at the first
 * matching axis. Anything it cannot find or cannot read answers `false`, so a
 * chart whose axes are built in a way this does not recognise keeps the
 * reading it has today rather than being turned round on a guess.
 *
 * @param children - The chart subtree this component was given
 * @param horizontal - Whether the bars are drawn on their side
 * @returns True when the category axis is reversed
 */
export function categoryAxisReversedFor(children: ReactNode, horizontal: boolean): boolean {
  const wanted = horizontal ? 'YAxis' : 'XAxis';
  let found = false;

  const walk = (nodes: ReactNode): void => {
    if (found)
      return;
    Children.forEach(nodes, (child) => {
      if (found || !isValidElement(child))
        return;
      const props = child.props as { reversed?: unknown; children?: ReactNode };
      if (displayNameOf(child.type) === wanted) {
        found = props.reversed === true;
        return;
      }
      walk(props.children);
    });
  };

  walk(children);
  return found;
}
