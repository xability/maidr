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
import { DiagramType, Orientation, TraceType } from '@type/grammar';
import { cssEscape } from '../../shared/selectorUtil';
import { all, call, findById, num, plain, rows, selectorsFor, str } from '../read';
import { treeLayer } from '../tree';

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
 * each field an interval of bits from its first to its last, as Mermaid
 * writes and draws it, panned by where it starts in its row.
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
      end: num(field.end) ?? Number.NaN,
      label: plain(field.label),
    }));
  }).filter(lane => lane.length > 0);
  const blocks = all(context.svg, 'rect.packetBlock');
  const count = lanes.flat().length;
  // The row length the rows above were split at, so a field pans by where
  // its row draws it. Not for bits drawn right to left, whose rows are also
  // walked against the drawing; those still pan along the whole packet.
  const config = call(context.db, 'getConfig') as Row | undefined;
  const bitsPerRow = num(config?.bitsPerRow);
  const wrap = bitsPerRow !== undefined && bitsPerRow > 0 && str(config?.bitOrder) !== 'descending'
    ? { wrap: bitsPerRow }
    : {};
  const layer: MaidrLayer = {
    id: context.layerId('packet'),
    type: TraceType.GANTT,
    // Read as a gantt for its lanes of intervals, but not a schedule, and not
    // to be introduced or explained as one.
    diagramType: DiagramType.PACKET,
    orientation: Orientation.HORIZONTAL,
    axes: { x: { label: 'Bit' }, y: { label: 'Row' } },
    ...(blocks.length === count && count > 0 ? { selectors: selectorsFor(blocks) } : {}),
    data: { points: lanes, unit: 'bits', inclusive: true, ...wrap },
  };
  return { layers: count > 0 ? [layer] : [] };
}

/**
 * Quadrant charts: labelled points on two axes running from 0 to 1, with the
 * quadrants' names in the figure subtitle. Not in the layer title: a chart of
 * one layer is named by its layer's title in place of the diagram's own.
 *
 * Mermaid's database hands the points back already laid out, in pixels, so the
 * values are recovered from the quadrants' own extent. They are kept in the
 * order Mermaid draws them, which is the reverse of the order they were
 * declared: point and grid navigation pair the layer's i-th point with the
 * i-th mark its selector matches, so the two orders must agree.
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

  // The array Mermaid draws one `g.data-point` for each entry of, in order.
  const points = rows(built?.points);
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
    // Read as a scatter for its points, but a quadrant chart is read by the
    // quarter each point falls in.
    diagramType: DiagramType.QUADRANT,
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
 * Where Mermaid drew a sankey's nodes, as columns of names, left to right and
 * each top to bottom.
 *
 * Mermaid lays a sankey out with d3-sankey, aligned `justify` by default:
 * every sink goes in the last column, and each column is ordered by relaxing
 * the ribbons rather than by the order the flows name its nodes, so MAIDR's
 * own columns would contradict the drawing. Mermaid draws a group per node,
 * in the order its database holds them, carrying the node's left edge and top
 * as `x` and `y`, and then a label per node in the same order. Each group is
 * paired with its node through the label, so a drawing in some other order
 * declares nothing and MAIDR derives the columns instead.
 *
 * @param context - The diagram
 * @returns The columns, or undefined when the drawing cannot be paired
 */
function sankeyColumns(context: DiagramContext): string[][] | undefined {
  const names = rows(call(context.db, 'getNodes')).map(node => plain(node.ID ?? node.id ?? node.name));
  const groups = all(context.svg, '.nodes > .node');
  // An outlined label is drawn twice, a halo under the text.
  const labels = all(context.svg, '.node-labels > text:not(.sankey-label-bg)');
  if (names.length === 0 || groups.length !== names.length || labels.length !== names.length) {
    return undefined;
  }

  const placed: { name: string; x: number; y: number }[] = [];
  for (const [at, name] of names.entries()) {
    // The label is the name, then the value on a line of its own. Drawn text
    // is read as shown, as drawnText reads it, never put through plain().
    const label = (labels[at].textContent ?? '').split('\n')[0].replace(/\s+/g, ' ').trim();
    const x = num(groups[at].getAttribute('x'));
    const y = num(groups[at].getAttribute('y'));
    if (name === '' || label !== name || x === undefined || y === undefined) {
      return undefined;
    }
    placed.push({ name, x, y });
  }

  placed.sort((a, b) => a.x - b.x);
  const columns: { x: number; nodes: typeof placed }[] = [];
  for (const node of placed) {
    const column = columns[columns.length - 1];
    if (column !== undefined && Math.abs(node.x - column.x) < 0.5) {
      column.nodes.push(node);
    } else {
      columns.push({ x: node.x, nodes: [node] });
    }
  }
  return columns.map(column => [...column.nodes].sort((a, b) => a.y - b.y).map(node => node.name));
}

/**
 * Sankey diagrams: one flow per link, with the nodes in the columns Mermaid
 * drew them in.
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
  const columns = sankeyColumns(context);
  const layer: MaidrLayer = {
    id: context.layerId('sankey'),
    type: TraceType.SANKEY,
    axes: { y: { label: 'Value' } },
    ...(links.length === data.length && data.length > 0 ? { selectors: selectorsFor(links) } : {}),
    ...(columns !== undefined ? { flowOptions: { columns } } : {}),
    data,
  };
  return { layers: data.length > 0 ? [layer] : [] };
}

/**
 * Whether a treemap label Mermaid drew is the name of the node it is paired
 * with: the name itself, the name cut to fit with `...`, or nothing, which is
 * the hidden root's label and a header too narrow for any of the name.
 *
 * @param label - The text drawn
 * @param name - The node's name
 * @returns Whether they agree
 */
function treemapLabelAgrees(label: string, name: string): boolean {
  const squash = (text: string): string => text.replace(/\s+/g, '').toLowerCase();
  const drawn = squash(plain(label));
  const named = squash(name);
  return drawn === '' || drawn === named || (drawn.endsWith('...') && named.startsWith(drawn.slice(0, -3)));
}

/**
 * Pairs a treemap's nodes with the rectangles Mermaid drew for them.
 *
 * Mermaid lays a treemap out with d3: each node's value is summed with its
 * children's, every node's children are sorted largest first, and a group is
 * drawn for each section -- the root, hidden, first -- breadth first, then
 * one for each item, depth first. The groups are paired in that order, and
 * each pairing is checked against the group's label, so a Mermaid drawing in
 * some other order leaves the treemap unoutlined rather than outlining the
 * wrong rectangle. A label is not paired by its text alone: Mermaid cuts a
 * long section name to fit, and two sections may each hold an item of one
 * name.
 *
 * @param svg - The drawing
 * @param root - The whole tree, root included; its nodes are given their elements
 */
function pairTreemap(svg: Element, root: TreeNode): void {
  const totals = new Map<TreeNode, number>();
  const total = (node: TreeNode): number => {
    let sum = totals.get(node);
    if (sum === undefined) {
      sum = (node.value !== undefined && Number.isFinite(node.value) ? node.value : 0)
        + (node.children ?? []).reduce((running, child) => running + total(child), 0);
      totals.set(node, sum);
    }
    return sum;
  };
  const sorted = (node: TreeNode): TreeNode[] => [...(node.children ?? [])].sort((a, b) => total(b) - total(a));

  const sections: TreeNode[] = [];
  const queue = [root];
  for (let at = 0; at < queue.length; at++) {
    const children = sorted(queue[at]);
    if (children.length > 0) {
      sections.push(queue[at]);
    }
    queue.push(...children);
  }
  const leaves: TreeNode[] = [];
  const walk = (node: TreeNode): void => {
    const children = sorted(node);
    if (children.length === 0) {
      leaves.push(node);
    }
    children.forEach(walk);
  };
  walk(root);

  const sectionGroups = all(svg, 'g.treemapSection');
  const leafGroups = all(svg, 'g.treemapLeafGroup');
  if (sectionGroups.length !== sections.length || leafGroups.length !== leaves.length) {
    return;
  }
  const child = (group: Element, name: string, className: string): Element | null =>
    Array.from(group.children).find(one => one.localName === name && one.classList.contains(className)) ?? null;
  const pairs = [
    ...sections.map((node, at) => ({ node, group: sectionGroups[at], label: 'treemapSectionLabel', shape: 'treemapSection' })),
    ...leaves.map((node, at) => ({ node, group: leafGroups[at], label: 'treemapLabel', shape: 'treemapLeaf' })),
  ];
  if (!pairs.every(pair => treemapLabelAgrees(child(pair.group, 'text', pair.label)?.textContent ?? '', pair.node.name))) {
    return;
  }
  for (const pair of pairs) {
    pair.node.element = child(pair.group, 'rect', pair.shape);
  }
}

/**
 * Treemaps: sections and the sized items in them, each outlined by the
 * rectangle Mermaid drew for it.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function treemap(context: DiagramContext): DiagramConversion {
  const root = call(context.db, 'getRoot') as Row | undefined;
  if (root === undefined) {
    return { layers: [] };
  }
  const visit = (node: Row): TreeNode => ({
    name: plain(node.name),
    value: num(node.value),
    children: rows(node.children).map(visit),
  });
  const whole = visit(root);
  pairTreemap(context.svg, whole);
  // The root is the page itself, unnamed, unless the diagram named it.
  const top = whole.name ? [whole] : whole.children ?? [];
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
 * Each task is outlined by the face Mermaid draws at its score, one per task
 * in this same order; when the faces and the tasks do not number the same,
 * the journey is read without the outline.
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
  const faces = all(context.svg, 'circle.face');
  const refs = faces.length === line.length ? selectorsFor(faces) : undefined;
  const layer: MaidrLayer = {
    id: context.layerId('journey'),
    type: TraceType.LINE,
    // Read as a line for its run of scores, though Mermaid draws no line: a
    // face at each task's height.
    diagramType: DiagramType.USER_JOURNEY,
    axes: {
      x: { label: 'Task' },
      y: { label: 'Score', min: 1, max: 5 },
      ...(line.some(point => point.z !== undefined) ? { z: { label: 'Section' } } : {}),
    },
    // One selector for the one line, matching its faces in document order.
    ...(refs ? { selectors: [refs.join(', ')] } : {}),
    data: [line],
  };
  return { layers: line.length > 0 ? [layer] : [] };
}
