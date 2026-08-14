/**
 * D3 binder for gantt (timeline, swimlane) charts.
 *
 * Extracts the intervals a band scale of lanes was drawn from and generates the
 * MAIDR JSON schema for accessible interaction. Unlike most binders the emitted
 * `data` is an object rather than an array, and its points are nested **by
 * lane**: an empty lane is a real statement about a schedule — nothing is
 * booked — and a flat list has no way to say it.
 *
 * The grouping is the binder's own work. A chart draws its rects in whatever
 * order the data arrived in, so DOM order is not the payload's order, which is
 * why the highlight selectors are stamped per interval rather than left as one
 * selector matching everything.
 */

import type { GanttData, GanttPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3GanttConfig, DataAccessor } from '../types';
import { Orientation, TraceType } from '../../../type/grammar';
import { scopeSelector, selectorPrefix } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/** Attribute the binder stamps on each interval to key its highlight. */
const INTERVAL_ATTRIBUTE = 'data-maidr-gantt-index';

/**
 * Coerces an interval end to a number on the axis.
 *
 * A schedule is usually drawn against dates, and a `Date` — or the string one
 * was parsed from — cannot be subtracted from another to give a length. So the
 * ends are coerced to epoch milliseconds and the chart is expected to declare
 * `format: { type: 'date' }`, which is what turns them back into dates when
 * they are announced. A numeric string stays the number it reads as: a gantt
 * drawn over day offsets is as real as one drawn over dates.
 *
 * @param value - Whatever the accessor produced
 * @param end - Which end, for the error message
 * @param index - Position of the interval in the selection
 * @returns The position on the axis
 * @throws Error when the value is neither a number nor a parsable date
 */
function coerceTime(value: unknown, end: 'start' | 'end', index: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isFinite(time)) {
      return time;
    }
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (value.trim() !== '' && Number.isFinite(numeric)) {
      return numeric;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(
    `The "${end}" of the interval at index ${index} resolved to `
    + `${String(value)}, which is neither a number nor a parsable date. `
    + `Pass a \`${end}\` accessor that returns one, e.g. `
    + `\`${end}: d => +d.${end}Date\`.`,
  );
}

/**
 * Emits one highlight selector per interval, in the payload's lane-grouped
 * order, by stamping each element with a MAIDR-owned attribute.
 *
 * `GanttTrace` resolves the selectors to a flat list and slices it lane by
 * lane, so the list has to be in the order the payload nests them — which is
 * not the order the chart drew them in unless the data happened to arrive
 * grouped. A bare selector would resolve in DOM order and hand each lane
 * whichever intervals sat at those positions, highlighting one task while
 * announcing another; the trace cannot detect that, because the count matches.
 *
 * @param root - The extraction root (the SVG, or a panel element)
 * @param selector - The user-provided selector matching the intervals
 * @param ordered - The interval elements, in payload order
 * @param panel - Optional panel scope for multi-panel binds
 * @returns One selector per interval, in payload order
 */
function stampIntervalSelectors(
  root: Element,
  selector: string,
  ordered: Element[],
  panel?: D3PanelScope,
): string[] {
  const prefix = selectorPrefix(root, panel);
  return ordered.map((element, index) => {
    // Clear any prior stamp so rebinding after a D3 data update produces a
    // clean, deterministic state.
    element.removeAttribute(INTERVAL_ATTRIBUTE);
    element.setAttribute(INTERVAL_ATTRIBUTE, String(index));
    return `${prefix} ${selector}[${INTERVAL_ATTRIBUTE}="${index}"]`;
  });
}

/**
 * Binds a D3.js gantt chart to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at the interval marks — one `<rect>` per booked interval.
 * The binder groups them into lanes itself, so a lane holding several intervals
 * needs nothing extra; what it cannot discover is an **empty** lane, which has
 * no element in the DOM at all. Declare those with `lanes`.
 *
 * **Dates become epoch milliseconds.** A `Date`, or a string one parses from,
 * is coerced so the trace can measure lengths; pair it with
 * `format: { type: 'date' }` so the ends are announced as dates. `unit` names
 * what a length is counted in, which a bare number cannot say.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** Like every D3 binder, this reads
 * each matched element's D3-bound `__data__`; calling it before
 * `.data().join()` has run (or before the SVG is mounted) throws "No elements
 * found for selector …".
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 gantt chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Gantt(svgElement, {
 *   selector: 'rect.task',
 *   title: 'Project Schedule',
 *   axes: { x: 'Day', y: 'Phase' },
 *   x: 'phase',
 *   start: 'from',
 *   end: 'to',
 *   label: 'task',
 *   lanes: ['Design', 'Build', 'Review', 'Launch'],
 *   unit: 'days',
 * });
 * ```
 */
export function bindD3Gantt(svg: Element, config: D3GanttConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildGanttLayer(svg, config));
}

/**
 * Pure extraction core for gantt charts. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildGanttLayer(root: Element, config: D3GanttConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    lanes: declaredLanes,
    unit,
    orientation = Orientation.HORIZONTAL,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'gantt interval');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<string | number | Date>(
    config,
    'x',
    'x',
    ['lane', 'category', 'label', 'name', 'key', 'group', 'task'],
    firstDatum,
  );
  const startAccessor = inferAccessor<number | string | Date>(
    config,
    'start',
    'start',
    ['from', 'begin', 'x0', 'startDate'],
    firstDatum,
  );
  const endAccessor = inferAccessor<number | string | Date>(
    config,
    'end',
    'end',
    ['to', 'finish', 'x1', 'endDate'],
    firstDatum,
  );
  const labelAccessor: DataAccessor<string> = inferAccessor<string>(
    config,
    'label',
    'label',
    ['name', 'task', 'title', 'activity'],
    firstDatum,
  );

  // The lane order the chart declares comes first, so an empty lane keeps the
  // position it was drawn in; anything the chart draws and the config does not
  // name is appended in the order it was drawn.
  const laneOrder: (string | number)[] = [...(declaredLanes ?? [])];
  const laneAt = new Map<string, number>(
    laneOrder.map((lane, index) => [String(lane), index]),
  );
  const grouped: GanttPoint[][] = laneOrder.map(() => []);
  const groupedElements: Element[][] = laneOrder.map(() => []);

  for (const { element, datum, index } of elements) {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }

    const lane = resolveAccessor<string | number | Date>(datum, xAccessor, index);
    // The lane names the row, so it is announced as it stands rather than
    // coerced; only the key it is grouped by is stringified.
    const laneName = lane instanceof Date ? lane.toISOString() : lane;
    const key = String(laneName);
    let row = laneAt.get(key);
    if (row === undefined) {
      row = laneOrder.length;
      laneAt.set(key, row);
      laneOrder.push(laneName);
      grouped.push([]);
      groupedElements.push([]);
    }

    const point: GanttPoint = {
      x: laneName,
      start: coerceTime(resolveAccessor(datum, startAccessor, index), 'start', index),
      end: coerceTime(resolveAccessor(datum, endAccessor, index), 'end', index),
    };
    // The interval's own name, when the lane is not already it. A lane
    // commonly holds several intervals, and the label is what distinguishes
    // them; omitted when the datum carries none, since an interval labelled
    // with its own lane says nothing twice.
    const label = resolveAccessorOptional<string>(datum, labelAccessor, index);
    if (label !== undefined && label !== null && String(label) !== key) {
      point.label = String(label);
    }

    grouped[row].push(point);
    groupedElements[row].push(element);
  }

  const data: GanttData = {
    points: grouped,
    // Declared lane names travel with the payload only when the chart declared
    // them: they exist for the lanes that carry no interval to name themselves,
    // and the trace prefers a lane's own intervals wherever both are present.
    ...(declaredLanes !== undefined ? { lanes: laneOrder } : {}),
    ...(unit !== undefined ? { unit } : {}),
  };

  const ordered = groupedElements.flat();
  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.GANTT,
    title,
    // One selector per interval, in the payload's lane-grouped order. See
    // {@link stampIntervalSelectors} for why a bare selector will not do —
    // except when there is exactly one interval, where the two agree.
    selectors: ordered.length > 1
      ? stampIntervalSelectors(root, selector, ordered, panel)
      : scopeSelector(root, selector, panel),
    orientation,
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
