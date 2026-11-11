/**
 * Reading what a Recharts chart is drawn like out of the elements it was given.
 *
 * Everything here is something Recharts states on a child element and the
 * converter -- which is handed a config, not a React tree -- cannot otherwise
 * see: which end the categories start from, which way a step curve's riser
 * goes, where a pie starts, and which series draw their dots.
 *
 * Lives apart from {@link MaidrRecharts} because these are pure functions over
 * React elements and nothing else -- importing the component to reach them
 * would drag the whole UI tree, and with it the ESM-only markdown stack, into
 * any test that wanted to check a walk.
 */
import type { StepDirection } from '@type/grammar';
import type { ReactNode } from 'react';
import type { RechartsChartType, RechartsPieAngles, RechartsRidgelineArea, RechartsSubplotConfig } from './types';
import { Orientation } from '@type/grammar';
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
 * The components that draw a series along the category axis, and so the ones
 * a reversed category axis turns round: the bars, and the line family --
 * `<Line>` draws the line, step and bump charts, `<Area>` the area charts.
 */
const CATEGORY_SERIES = new Set(['Bar', 'Line', 'Area']);

/**
 * The id an axis or a series is paired by. Recharts gives both 0 unless told
 * otherwise, and looks an axis up in an object keyed by its id, so `1` and
 * `'1'` name the same axis.
 *
 * @param id - The `xAxisId` or `yAxisId` as written, if it was
 * @returns The id as Recharts looks it up
 */
function axisIdOf(id: unknown): string {
  return String(id ?? 0);
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
 * A chart may declare several category axes, and Recharts draws each series
 * on the one its `xAxisId` (on its side, its `yAxisId`) names. So what is
 * asked is whether a `<Bar>`, `<Line>` or `<Area>` is drawn on a reversed
 * one, and a reversed axis carrying no series turns nothing round. Asking
 * whether any category axis was reversed read bars drawn left to right on a
 * plain axis backwards whenever a reversed one was declared beside them. A
 * series naming no axis the chart declares is drawn on the hidden, plain one
 * Recharts supplies, so it turns nothing round either.
 *
 * Series drawn on a reversed axis and on a plain one share this one answer,
 * which cannot be right for both; they are read as reversed, as they were
 * before the series were read. A walk that finds no series at all -- drawn
 * by a component of the chart's own, which it cannot see into -- answers
 * whether any category axis is reversed, as it did then too.
 *
 * The walk is depth-first because an axis is commonly nested -- inside a
 * `<ResponsiveContainer>`, or behind a fragment. Anything it cannot find or
 * cannot read answers `false`, so a chart whose axes are built in a way this
 * does not recognise keeps the reading it has today rather than being turned
 * round on a guess. A ridgeline, whose `<Area>`s share one `<YAxis>`, reads
 * its own ({@link ridgelineAxisReversedFor}).
 *
 * @param children - The chart subtree this component was given
 * @param horizontal - Whether the bars are drawn on their side
 * @returns True when the category axis the series are drawn on is reversed
 */
export function categoryAxisReversedFor(children: ReactNode, horizontal: boolean): boolean {
  const axisName = horizontal ? 'YAxis' : 'XAxis';
  const idKey = horizontal ? 'yAxisId' : 'xAxisId';
  const axes: { id: string; reversed: boolean }[] = [];
  const drawnOn: string[] = [];

  const walk = (nodes: ReactNode): void => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child))
        return;
      const props = child.props as Record<string, unknown> & { children?: ReactNode };
      const name = displayNameOf(child.type);
      if (name === axisName) {
        axes.push({ id: axisIdOf(props[idKey]), reversed: props.reversed === true });
        return;
      }
      if (name !== undefined && CATEGORY_SERIES.has(name)) {
        drawnOn.push(axisIdOf(props[idKey]));
        return;
      }
      walk(props.children);
    });
  };

  walk(children);
  if (drawnOn.length === 0)
    return axes.some(axis => axis.reversed);
  return axes.some(axis => axis.reversed && drawnOn.includes(axis.id));
}

/**
 * The same answer for each panel of a grid, in its row-major order.
 *
 * Which axis carries the categories follows the orientation, and in subplot
 * mode that is the *panel's* — `buildPanelSubplot` resolves it as
 * `panel.orientation ?? config.orientation`. Asking every panel with the
 * grid's own answer reads `reversed` off the wrong axis component for any
 * panel that overrides it: the un-reversed one answers `false`, the payload
 * and the selectors are left as written, and the reader is walked through the
 * categories the opposite way to the way the panel draws them (#1017). The
 * mirror case is worse still — a reversed value axis turning a payload round
 * that should have been left alone.
 *
 * A child with no panel of its own falls back to the grid's orientation, which
 * is also what `buildPanelSubplot` does with a panel that declares none.
 *
 * @param children - One chart per panel, in the grid's row-major order
 * @param panels - The panel configs, flattened into the same order
 * @param gridOrientation - The orientation the grid declares, if any
 * @returns One answer per child, in the same order
 */
export function categoryAxisReversedPerPanelFor(
  children: ReactNode,
  panels: readonly RechartsSubplotConfig[],
  gridOrientation: Orientation | undefined,
): boolean[] {
  return Children.toArray(children).map((child, index) =>
    categoryAxisReversedFor(
      child,
      (panels[index]?.orientation ?? gridOrientation) === Orientation.HORIZONTAL,
    ));
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

/**
 * Where the chart's `<Pie>` starts and ends, when it draws one.
 *
 * `<Pie startAngle={90} endAngle={-270}>` is how Recharts states it, and it
 * lives in the chart subtree {@link MaidrRecharts} renders but never used to
 * read -- so every pie was placed from the top going clockwise, which is
 * neither where Recharts' default starts (3 o'clock) nor the way it goes
 * (counterclockwise). Both angles are returned as written, in Recharts' own
 * terms, for the converter to turn into the grammar's.
 *
 * Depth-first for the same reason the other walks are, and stops at the
 * first `<Pie>`. A tree with none answers `undefined`, and so does a `<Pie>`
 * that sets neither angle: Recharts' defaults then apply, which the converter
 * knows. An angle that is not a number is left out rather than guessed.
 *
 * @param children - The chart subtree this component was given
 * @returns The angles the pie declares, or `undefined` when there is no pie
 */
export function pieAnglesFor(children: ReactNode): RechartsPieAngles | undefined {
  let found: RechartsPieAngles | undefined;

  const walk = (nodes: ReactNode): void => {
    if (found !== undefined)
      return;
    Children.forEach(nodes, (child) => {
      if (found !== undefined || !isValidElement(child))
        return;
      const props = child.props as { startAngle?: unknown; endAngle?: unknown; children?: ReactNode };
      if (displayNameOf(child.type) === 'Pie') {
        found = {
          ...(typeof props.startAngle === 'number' ? { startAngle: props.startAngle } : {}),
          ...(typeof props.endAngle === 'number' ? { endAngle: props.endAngle } : {}),
        };
        return;
      }
      walk(props.children);
    });
  };

  walk(children);
  return found;
}

/**
 * The component that draws each series of a line-family chart type, and
 * whether it draws its dots when `dot` is not set: a `<Line>` does, an
 * `<Area>` and a `<Radar>` do not. The types are those `SERIES_DOTS` in
 * `selectors.ts` names the dots of: a type added to one belongs in the other.
 */
const SERIES_COMPONENT: Partial<Record<RechartsChartType, { name: string; dotsByDefault: boolean }>> = {
  line: { name: 'Line', dotsByDefault: true },
  step: { name: 'Line', dotsByDefault: true },
  bump: { name: 'Line', dotsByDefault: true },
  survival: { name: 'Line', dotsByDefault: true },
  pr_curve: { name: 'Line', dotsByDefault: true },
  area: { name: 'Area', dotsByDefault: false },
  stacked_area: { name: 'Area', dotsByDefault: false },
  normalized_area: { name: 'Area', dotsByDefault: false },
  radar: { name: 'Radar', dotsByDefault: false },
};

/**
 * The series of a line-family chart that draw their dots, by `dataKey`, in
 * the order the chart draws them.
 *
 * Recharts writes nothing on a series' dots that says which series they
 * belong to, so a chart of several series names each series' dots by their
 * place among the series that draw dots (`seriesDotSelectors`). A series
 * drawn without dots -- `dot={false}`, an `<Area>` or `<Radar>` left at its
 * default, or `hide` -- has no place, and leaving it out keeps every series
 * after it at its own. A series whose `dataKey` is not a string still draws
 * its dots, so it holds its place as `null`.
 *
 * Depth-first in the order the elements are written, which is the order
 * Recharts draws the series in, and every series is collected rather than the
 * first. Anything that is not a series element of the chart type is walked
 * through, as the other walks do.
 *
 * @param children - The chart subtree this component was given
 * @param chartType - The chart type, which decides the series component
 * @returns The series that draw dots, or `undefined` for a type that draws none
 */
export function dotSeriesFor(
  children: ReactNode,
  chartType: RechartsChartType | undefined,
): (string | null)[] | undefined {
  const component = chartType === undefined ? undefined : SERIES_COMPONENT[chartType];
  if (component === undefined)
    return undefined;
  const found: (string | null)[] = [];

  const walk = (nodes: ReactNode): void => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child))
        return;
      const props = child.props as { dataKey?: unknown; dot?: unknown; hide?: unknown; children?: ReactNode };
      if (displayNameOf(child.type) === component.name) {
        const drawsDots = props.dot === undefined ? component.dotsByDefault : Boolean(props.dot);
        if (props.hide !== true && drawsDots)
          found.push(typeof props.dataKey === 'string' ? props.dataKey : null);
        return;
      }
      walk(props.children);
    });
  };

  walk(children);
  return found;
}

/**
 * The key a ridgeline's `<Area>`s draw: each group's density with its ridge's
 * offset added.
 *
 * Every `<Area>` of a ridgeline draws the same key, over its own group's
 * rows, so the first one names it. Read so the ridges can be placed where
 * they are drawn: the offset that key adds is how far up the page each ridge
 * sits, and that is the order `RidgelineTrace` walks them in.
 *
 * Depth-first for the same reason the other walks are, and stops at the
 * first `<Area>`. A tree with none, or an `<Area>` whose `dataKey` is not a
 * string, answers `undefined`, and the groups are then read in the order they
 * first appear in `data`.
 *
 * @param children - The chart subtree this component was given
 * @returns The key, or `undefined`
 */
export function areaDataKeyFor(children: ReactNode): string | undefined {
  let found: string | undefined;
  let done = false;

  const walk = (nodes: ReactNode): void => {
    if (done)
      return;
    Children.forEach(nodes, (child) => {
      if (done || !isValidElement(child))
        return;
      const props = child.props as { dataKey?: unknown; children?: ReactNode };
      if (displayNameOf(child.type) === 'Area') {
        done = true;
        found = typeof props.dataKey === 'string' ? props.dataKey : undefined;
        return;
      }
      walk(props.children);
    });
  };

  walk(children);
  return found;
}

/**
 * Whether a ridgeline's ridges are drawn on a reversed `<YAxis>`.
 *
 * A ridgeline's `<Area>`s share one `<YAxis>`, and a reversed one turns the
 * page over: the ridge offset most is drawn lowest. The first `<YAxis>`
 * answers, reversed or not. A reversed one after it belongs to something
 * else, and read as the ridges' own it would list them top first.
 *
 * Read for a ridgeline alone: {@link categoryAxisReversedFor}, which bar and
 * line charts read, answers for the category axis their series are drawn on.
 *
 * @param children - The chart subtree this component was given
 * @returns True when the first `<YAxis>` is reversed
 */
export function ridgelineAxisReversedFor(children: ReactNode): boolean {
  let reversed = false;
  let done = false;

  const walk = (nodes: ReactNode): void => {
    if (done)
      return;
    Children.forEach(nodes, (child) => {
      if (done || !isValidElement(child))
        return;
      const props = child.props as { reversed?: unknown; children?: ReactNode };
      if (displayNameOf(child.type) === 'YAxis') {
        done = true;
        reversed = props.reversed === true;
        return;
      }
      walk(props.children);
    });
  };

  walk(children);
  return reversed;
}

/**
 * A ridgeline's `<Area>`s, in the order they are declared, each by its `name`
 * and its `dataKey`.
 *
 * Recharts writes nothing on a band that says which group it draws, so each
 * ridge is highlighted on the band of the `<Area>` that names its group
 * (`ridgeSelectors`, counting among the `<Area>`s). Every `<Area>` is
 * collected, depth-first in the order they are written, which is the order
 * Recharts draws the bands in. A `name` given as a number is read as the
 * text a group is read as; anything else that is not a string is left out.
 *
 * @param children - The chart subtree this component was given
 * @returns One entry per `<Area>`, in declaration order
 */
export function ridgelineAreasFor(children: ReactNode): RechartsRidgelineArea[] {
  const found: RechartsRidgelineArea[] = [];

  const walk = (nodes: ReactNode): void => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child))
        return;
      const props = child.props as { name?: unknown; dataKey?: unknown; children?: ReactNode };
      if (displayNameOf(child.type) === 'Area') {
        const name = typeof props.name === 'number' ? String(props.name) : props.name;
        found.push({
          ...(typeof name === 'string' ? { name } : {}),
          ...(typeof props.dataKey === 'string' ? { dataKey: props.dataKey } : {}),
        });
        return;
      }
      walk(props.children);
    });
  };

  walk(children);
  return found;
}

/**
 * Where a bump chart draws first place, when its rank axis says so.
 *
 * A bump chart is a `<LineChart>` of ranks, and Recharts draws an ordinary
 * `<YAxis>` with its smallest number at the bottom. Rank 1 goes at the top
 * by `<YAxis reversed>`, which is how a bump chart is usually drawn, and how
 * the Recharts example draws it. The layer said nothing, and with no
 * highlight to measure the drawing by, Up moved to the next larger rank
 * number: down the page, to the place one worse.
 *
 * Only `reversed` is read, on the first `<YAxis>` the chart draws, found
 * depth-first as the other walks find their element. An axis under `hide`
 * is passed over, as one placed ahead of the rank axis to scale another
 * series is; when every axis is hidden, as on a bump chart that labels its
 * lines rather than its axis, the first is read. An axis without `reversed`
 * may still be turned another way, by its `domain` or a scale of its own,
 * which the core can measure from the highlighted dots where it has them
 * and this cannot, so it answers `undefined` and leaves the core to read the
 * drawing. A chart whose rank axis is not the first it draws, or is turned
 * some other way, says where first place is through the config's
 * `firstPlace`.
 *
 * @param children - The chart subtree this component was given
 * @returns `'top'` when that `<YAxis>` is reversed, otherwise `undefined`
 */
export function firstPlaceFor(children: ReactNode): 'top' | undefined {
  const axes: { reversed?: unknown; hide?: unknown }[] = [];

  const walk = (nodes: ReactNode): void => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child))
        return;
      const props = child.props as { reversed?: unknown; hide?: unknown; children?: ReactNode };
      if (displayNameOf(child.type) === 'YAxis') {
        axes.push(props);
        return;
      }
      walk(props.children);
    });
  };

  walk(children);
  const rankAxis = axes.find(axis => axis.hide !== true) ?? axes[0];
  return rankAxis?.reversed === true ? 'top' : undefined;
}

/**
 * Where a sankey draws a node nothing flows out of, when its `<Sankey>` says.
 *
 * `<Sankey align>` is `'justify'` by default, which draws every such node in
 * the last column, or `'left'`, which draws it one column past the furthest
 * node feeding it. Read off the first `<Sankey>`, found depth-first as the
 * other walks find their element; anything else answers `undefined`, and the
 * converter takes Recharts' default.
 *
 * @param children - The chart subtree this component was given
 * @returns The alignment the `<Sankey>` declares, or `undefined`
 */
export function sankeyAlignFor(children: ReactNode): 'justify' | 'left' | undefined {
  let found: 'justify' | 'left' | undefined;
  let done = false;

  const walk = (nodes: ReactNode): void => {
    if (done)
      return;
    Children.forEach(nodes, (child) => {
      if (done || !isValidElement(child))
        return;
      const props = child.props as { align?: unknown; children?: ReactNode };
      if (displayNameOf(child.type) === 'Sankey') {
        done = true;
        found = props.align === 'left' || props.align === 'justify' ? props.align : undefined;
        return;
      }
      walk(props.children);
    });
  };

  walk(children);
  return found;
}
