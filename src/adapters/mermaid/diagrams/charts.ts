/**
 * The Mermaid diagrams that are charts: pie, gantt, packet, quadrant, XY,
 * radar, sankey, treemap and user journey. Each becomes the MAIDR layer for
 * the chart it is.
 */

import type {
  BarPoint,
  FlowPoint,
  GanttPoint,
  LinePoint,
  MaidrLayer,
  PiePoint,
  ScatterPoint,
} from '@type/grammar';
import type { Row } from '../read';
import type { TreeNode } from '../tree';
import type { DiagramContext, DiagramConversion } from '../types';
import { Orientation, TraceType } from '@type/grammar';
import { cssEscape } from '../../shared/selectorUtil';
import { all, call, findById, num, plain, rows, selectorsFor, str } from '../read';
import { textMatcher, treeLayer } from '../tree';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** A gantt spanning no more than this is measured in hours rather than days. */
const HOURLY_MAX_SPAN = 2 * MS_PER_DAY;

/**
 * Pie charts: one slice per section.
 *
 * Mermaid leaves out a slice under one percent of the whole. Every section is
 * still read, because it is still data; the highlight is withdrawn instead
 * when a slice was not drawn, since a pie pairs its slices with the drawing
 * one for one.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function pie(context: DiagramContext): DiagramConversion {
  const sections = call(context.db, 'getSections');
  const entries: [unknown, unknown][] = sections instanceof Map
    ? [...sections.entries()]
    : Object.entries((sections as Record<string, unknown> | undefined) ?? {});
  const data: PiePoint[] = entries
    .map(([label, value]) => ({ x: plain(label), y: num(value) ?? Number.NaN }))
    .filter(point => Number.isFinite(point.y));
  const slices = all(context.svg, 'path.pieCircle');
  const layer: MaidrLayer = {
    id: context.layerId('pie'),
    type: TraceType.PIE,
    axes: { x: { label: 'Section' }, y: { label: 'Value' } },
    ...(slices.length === data.length && data.length > 0
      ? { selectors: `#${cssEscape(context.svg.id)} path.pieCircle` }
      : {}),
    data,
  };
  return { layers: data.length > 0 ? [layer] : [] };
}

/**
 * Gantt charts: one lane per section, one interval per task, measured in
 * days -- or hours, for a chart spanning two days or less -- and announced as
 * dates.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function gantt(context: DiagramContext): DiagramConversion {
  const tasks = rows(call(context.db, 'getTasks'));
  const times = tasks.flatMap(task => [task.startTime, task.endTime])
    .filter((time): time is Date => time instanceof Date)
    .map(time => time.getTime());
  if (times.length === 0) {
    return { layers: [] };
  }
  const span = Math.max(...times) - Math.min(...times);
  const hourly = span <= HOURLY_MAX_SPAN;
  const perUnit = hourly ? MS_PER_HOUR : MS_PER_DAY;
  const at = (time: unknown): number =>
    time instanceof Date ? time.getTime() / perUnit : Number.NaN;

  const candidates = all(context.svg, 'rect[id]');
  const used = new Set<Element>();
  const lanes: GanttPoint[][] = [];
  const laneNames: string[] = [];
  const elements: (Element | null)[][] = [];
  for (const task of tasks) {
    const section = plain(task.section) || 'Tasks';
    let lane = laneNames.indexOf(section);
    if (lane < 0) {
      laneNames.push(section);
      lanes.push([]);
      elements.push([]);
      lane = laneNames.length - 1;
    }
    const status = ['done', 'active', 'crit', 'milestone']
      .filter(flag => task[flag] === true)
      .map(flag => (flag === 'crit' ? 'critical' : flag));
    const name = plain(task.task);
    lanes[lane].push({
      x: section,
      start: at(task.startTime),
      end: at(task.endTime),
      label: status.length > 0 ? `${name} (${status.join(', ')})` : name,
    });
    elements[lane].push(findById(candidates, context.svgId, [str(task.id)], used));
  }

  const selectors = selectorsFor(elements.flat());
  const layer: MaidrLayer = {
    id: context.layerId('gantt'),
    type: TraceType.GANTT,
    orientation: Orientation.HORIZONTAL,
    axes: {
      x: {
        label: 'Date',
        format: {
          function: hourly
            ? `return new Date(value * ${MS_PER_HOUR}).toLocaleString()`
            : `return new Date(value * ${MS_PER_DAY}).toLocaleDateString()`,
        },
      },
      y: { label: 'Section' },
    },
    ...(selectors ? { selectors } : {}),
    data: { points: lanes, lanes: laneNames, unit: hourly ? 'hours' : 'days' },
  };
  return { layers: [layer] };
}

/**
 * Packet diagrams: the fields of a network packet, one lane per row of bits,
 * each field an interval of bits.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function packet(context: DiagramContext): DiagramConversion {
  const packetRows = call(context.db, 'getPacket');
  const lines = Array.isArray(packetRows) ? packetRows.map(rows) : [];
  const lanes: GanttPoint[][] = lines.map((fields) => {
    const first = num(fields[0]?.start) ?? 0;
    const last = num(fields[fields.length - 1]?.end) ?? first;
    const lane = `Bits ${first} to ${last}`;
    return fields.map(field => ({
      x: lane,
      start: num(field.start) ?? Number.NaN,
      end: (num(field.end) ?? Number.NaN) + 1,
      label: plain(field.label),
    }));
  }).filter(lane => lane.length > 0);
  const blocks = all(context.svg, 'rect.packetBlock');
  const count = lanes.flat().length;
  const layer: MaidrLayer = {
    id: context.layerId('packet'),
    type: TraceType.GANTT,
    orientation: Orientation.HORIZONTAL,
    axes: { x: { label: 'Bit' }, y: { label: 'Row' } },
    ...(blocks.length === count && count > 0 ? { selectors: selectorsFor(blocks) } : {}),
    data: { points: lanes, unit: 'bits' },
  };
  return { layers: count > 0 ? [layer] : [] };
}

/**
 * Quadrant charts: labelled points on two axes running from 0 to 1, read in
 * the order they were declared, with the quadrants' names in the figure
 * subtitle. Not in the layer title: a chart of one layer is named by its
 * layer's title in place of the diagram's own.
 *
 * Mermaid's database hands the points back already laid out, in pixels and in
 * reverse order, so the values are recovered from the quadrants' own extent.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function quadrant(context: DiagramContext): DiagramConversion {
  const built = call(context.db, 'getQuadrantData') as Row | undefined;
  const quadrants = rows(built?.quadrants);
  if (quadrants.length === 0) {
    return { layers: [] };
  }
  const left = Math.min(...quadrants.map(one => num(one.x) ?? 0));
  const top = Math.min(...quadrants.map(one => num(one.y) ?? 0));
  const right = Math.max(...quadrants.map(one => (num(one.x) ?? 0) + (num(one.width) ?? 0)));
  const bottom = Math.max(...quadrants.map(one => (num(one.y) ?? 0) + (num(one.height) ?? 0)));
  const round = (value: number): number => Math.round(value * 1000) / 1000;

  const points = rows(built?.points).reverse();
  const data: ScatterPoint[] = points.map((point) => {
    const x = right > left ? ((num(point.x) ?? 0) - left) / (right - left) : 0;
    const y = bottom > top ? 1 - ((num(point.y) ?? 0) - top) / (bottom - top) : 0;
    return { x: round(x), y: round(y), label: plain(point.text) };
  });

  const axisLabels = rows(built?.axisLabels).map(one => plain(one.text));
  // Mermaid lays the labels out left, right, bottom, top -- but omits the
  // ones the chart did not declare.
  const xLabel = axisLabels.slice(0, 2).filter(Boolean).join(' to ') || 'x';
  const yLabel = axisLabels.slice(2, 4).filter(Boolean).join(' to ') || 'y';
  const marks = all(context.svg, 'g.data-point');
  // A step of one half makes the scatter's grid the four quadrants, which is
  // how the chart is read. Without a step there is no grid, and so no braille:
  // a scatter has a braille surface only in grid navigation.
  const layer: MaidrLayer = {
    id: context.layerId('quadrant'),
    type: TraceType.SCATTER,
    axes: {
      x: { label: xLabel, min: 0, max: 1, tickStep: 0.5 },
      y: { label: yLabel, min: 0, max: 1, tickStep: 0.5 },
    },
    ...(marks.length === data.length && data.length > 0
      ? { selectors: `#${cssEscape(context.svg.id)} g.data-point circle` }
      : {}),
    data,
  };
  if (data.length === 0) {
    return { layers: [] };
  }
  // Mermaid numbers its quadrants from the top right, anticlockwise.
  const corners = ['top right', 'top left', 'bottom left', 'bottom right'];
  const names = quadrants
    .map((one, at) => (plain(one.text) ? `${plain(one.text)} (${corners[at] ?? ''})` : ''))
    .filter(Boolean);
  return {
    layers: [layer],
    ...(names.length > 0 ? { subtitle: `Quadrants: ${names.join('; ')}` } : {}),
  };
}

/**
 * XY charts: one bar or line layer per plot, against the chart's category or
 * numeric x axis.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function xychart(context: DiagramContext): DiagramConversion {
  const chart = call(context.db, 'getXYChartData') as Row | undefined;
  const xAxis = (chart?.xAxis as Row | undefined) ?? {};
  const yAxis = (chart?.yAxis as Row | undefined) ?? {};
  const config = call(context.db, 'getChartConfig') as Row | undefined;
  const horizontal = str(config?.chartOrientation) === 'horizontal';
  const xLabel = plain(xAxis.title) || (str(xAxis.type) === 'band' ? 'Category' : 'x');
  const yLabel = plain(yAxis.title) || 'y';

  const layers: MaidrLayer[] = [];
  const plots = rows(chart?.plots);
  plots.forEach((plot, index) => {
    const pairs = Array.isArray(plot.data) ? plot.data as unknown[] : [];
    const points = pairs
      .filter((pair): pair is [unknown, unknown] => Array.isArray(pair) && pair.length >= 2)
      .map(([x, y]) => ({ x: num(x) ?? plain(x), y: num(y) ?? Number.NaN }));
    const name = plain(plot.title) || undefined;
    const axes = { x: { label: xLabel }, y: { label: yLabel } };
    if (str(plot.type) === 'line') {
      const path = all(context.svg, `g.line-plot-${index} path`);
      const data: LinePoint[][] = [points.map(point => ({ ...point, ...(name ? { z: name } : {}) }))];
      layers.push({
        id: context.layerId(`line-${index}`),
        type: TraceType.LINE,
        ...(name ? { name } : {}),
        axes,
        ...(path.length === 1 ? { selectors: [`#${cssEscape(context.svg.id)} g.line-plot-${index} path`] } : {}),
        data,
      });
    } else {
      const bars = all(context.svg, `g.bar-plot-${index} rect`);
      const data: BarPoint[] = points;
      layers.push({
        id: context.layerId(`bar-${index}`),
        type: TraceType.BAR,
        ...(name ? { name } : {}),
        ...(horizontal ? { orientation: Orientation.HORIZONTAL } : {}),
        axes,
        ...(bars.length === data.length ? { selectors: selectorsFor(bars) } : {}),
        data,
      });
    }
  });
  return { layers, title: plain(chart?.title) || undefined };
}

/**
 * Radar charts: one curve per series, one spoke per axis.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function radar(context: DiagramContext): DiagramConversion {
  const axes = rows(call(context.db, 'getAxes')).map(axis => plain(axis.label) || plain(axis.name));
  const curves = rows(call(context.db, 'getCurves'));
  const options = call(context.db, 'getOptions') as Row | undefined;
  const data: LinePoint[][] = curves.map((curve) => {
    const name = plain(curve.label) || plain(curve.name);
    const entries = Array.isArray(curve.entries) ? curve.entries : [];
    return axes.map((axis, at) => ({ x: axis, y: num(entries[at]) ?? null, z: name }));
  });
  const paths = curves.map((_, at) => all(context.svg, `.radarCurve-${at}`)[0]);
  const min = num(options?.min);
  const max = num(options?.max);
  const layer: MaidrLayer = {
    id: context.layerId('radar'),
    type: TraceType.RADAR,
    axes: {
      x: { label: 'Axis' },
      y: { label: 'Value', ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) },
    },
    ...(paths.every(Boolean) && paths.length > 0
      ? { selectors: curves.map((_, at) => `#${cssEscape(context.svg.id)} .radarCurve-${at}`) }
      : {}),
    data,
  };
  return { layers: data.length > 0 && axes.length > 0 ? [layer] : [] };
}

/**
 * Sankey diagrams: one flow per link.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function sankey(context: DiagramContext): DiagramConversion {
  const endName = (end: unknown): string =>
    end !== null && typeof end === 'object' ? plain((end as Row).ID ?? (end as Row).id ?? (end as Row).name) : plain(end);
  const data: FlowPoint[] = rows(call(context.db, 'getLinks')).map(link => ({
    source: endName(link.source),
    target: endName(link.target),
    value: num(link.value) ?? Number.NaN,
  })).filter(flow => Number.isFinite(flow.value));
  const links = all(context.svg, '.link');
  const layer: MaidrLayer = {
    id: context.layerId('sankey'),
    type: TraceType.SANKEY,
    axes: { y: { label: 'Value' } },
    ...(links.length === data.length && data.length > 0 ? { selectors: selectorsFor(links) } : {}),
    data,
  };
  return { layers: data.length > 0 ? [layer] : [] };
}

/**
 * Treemaps: sections and the sized items in them.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function treemap(context: DiagramContext): DiagramConversion {
  const root = call(context.db, 'getRoot') as Row | undefined;
  const match = textMatcher(all(context.svg, 'text.treemapSectionLabel, text.treemapLabel'));
  const visit = (node: Row): TreeNode => {
    const name = plain(node.name);
    return {
      name,
      value: num(node.value),
      element: match(name),
      children: rows(node.children).map(visit),
    };
  };
  // The root is the page itself, unnamed, unless the diagram named it.
  const top = root === undefined ? [] : plain(root.name) ? [visit(root)] : rows(root.children).map(visit);
  const layer = treeLayer(context, { roots: top, nodeLabel: 'Item', valueLabel: 'Value', type: TraceType.TREEMAP });
  return { layers: layer ? [layer] : [] };
}

/**
 * The mood Mermaid draws a journey score with.
 *
 * @param score - The score, 1 to 5
 * @returns The mood
 */
function mood(score: number): string {
  if (score >= 4) {
    return 'happy';
  }
  return score >= 3 ? 'neutral' : 'unhappy';
}

/**
 * User journeys: the tasks as one line of satisfaction scores, in the order
 * Mermaid draws them across the journey, each task naming who takes part,
 * the mood the score is drawn with and the section it is in.
 *
 * One line rather than one per section: Mermaid draws a journey as a single
 * timeline, and sections that share no task would be lines a reader could
 * not move between, each pitched on its own range of scores.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function journey(context: DiagramContext): DiagramConversion {
  const tasks = rows(call(context.db, 'getTasks'));
  const line: LinePoint[] = tasks.map((task) => {
    const section = plain(task.section);
    const people = Array.isArray(task.people) ? task.people.map(plain).filter(Boolean) : [];
    const score = num(task.score) ?? null;
    const name = plain(task.task);
    return {
      x: people.length > 0 ? `${name} (${people.join(', ')})` : name,
      y: score,
      ...(section ? { z: section } : {}),
      ...(score === null ? {} : { label: `${score}, ${mood(score)}` }),
    };
  });
  const layer: MaidrLayer = {
    id: context.layerId('journey'),
    type: TraceType.LINE,
    axes: {
      x: { label: 'Task' },
      y: { label: 'Score', min: 1, max: 5 },
      ...(line.some(point => point.z !== undefined) ? { z: { label: 'Section' } } : {}),
    },
    data: [line],
  };
  return { layers: line.length > 0 ? [layer] : [] };
}
