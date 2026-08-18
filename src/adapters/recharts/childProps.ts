/**
 * Reading what a Recharts chart is drawn like out of the elements it was given.
 *
 * Two things live here, and both are things Recharts states on a child element
 * and the converter -- which is handed a config, not a React tree -- cannot
 * otherwise see: which end the categories start from, and which way a step
 * curve's riser goes.
 *
 * Lives apart from {@link MaidrRecharts} because these are pure functions over
 * React elements and nothing else -- importing the component to reach them
 * would drag the whole UI tree, and with it the ESM-only markdown stack, into
 * any test that wanted to check a walk.
 */
import type { StepDirection } from '@type/grammar';
import type { ReactNode } from 'react';
import { Children, isValidElement } from 'react';

/**
 * What each Recharts curve shape means for the step convention.
 *
 * Measured by rendering the three over the same samples and reading where the
 * riser landed, with samples at x = 65, 190, 315:
 *
 * | `type`       | rendered `d`                                            | riser        |
 * | ------------ | ------------------------------------------------------- | ------------ |
 * | `stepAfter`  | `M65,128.75 L190,128.75 L190,16.25 L315,16.25 L315,72.5` | next sample  |
 * | `stepBefore` | `M65,128.75 L65,16.25 L190,16.25 L190,72.5 L315,72.5`    | this sample  |
 * | `step`       | `M65,128.75 L127.5,128.75 L127.5,16.25 …`                | halfway      |
 *
 * All three have a name. Recharts resolves `type` against d3's curves, and
 * `StepDirection` covers the centred riser as `mid` — matplotlib's
 * `steps-mid`, which `StepTrace` reads. `step` was left out here until #1075
 * on the mistaken belief that the grammar could not name it.
 */
const STEP_DIRECTIONS: Record<string, StepDirection> = {
  step: 'mid',
  stepAfter: 'hv',
  stepBefore: 'vh',
};

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

/**
 * Which way the risers of the chart's step curve go, when it draws one.
 *
 * `<Line type="stepAfter">` is how Recharts states it, and it lives in the
 * chart subtree {@link MaidrRecharts} renders but never used to read -- so a
 * staircase declared as a step announced no direction, having no way to say
 * one (#1059).
 *
 * Depth-first for the same reason the axis walk is -- a curve is commonly
 * nested inside a `<ResponsiveContainer>` or behind a fragment -- and stops at
 * the first curve that names a convention. A chart drawing two curves with
 * different conventions is a composed chart, where each layer declares its own
 * and this is not consulted. Anything it cannot find or cannot read answers
 * `undefined`, which is the same thing a centred `type="step"` answers: a step
 * whose direction goes unannounced rather than one claimed on a guess.
 *
 * @param children - The chart subtree this component was given
 * @returns The convention, or `undefined` when nothing in the tree names one
 */
export function stepDirectionFor(children: ReactNode): StepDirection | undefined {
  let found: StepDirection | undefined;

  const walk = (nodes: ReactNode): void => {
    if (found !== undefined)
      return;
    Children.forEach(nodes, (child) => {
      if (found !== undefined || !isValidElement(child))
        return;
      const props = child.props as { type?: unknown; children?: ReactNode };
      const name = displayNameOf(child.type);
      if (name === 'Line' || name === 'Area') {
        if (typeof props.type === 'string' && props.type in STEP_DIRECTIONS) {
          found = STEP_DIRECTIONS[props.type];
          return;
        }
      }
      walk(props.children);
    });
  };

  walk(children);
  return found;
}
