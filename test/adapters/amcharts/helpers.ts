/**
 * Duck-typed amCharts 5 fakes shared by the amCharts adapter tests.
 *
 * The adapter reads amCharts objects purely through structural typing
 * (`get()`, `series.values`, `children.values`, ...), so plain objects are
 * enough — no amCharts import and no DOM required.
 */

import type { NavTarget } from '@adapters/amcharts/navmap';
import type {
  AmAxis,
  AmBounds,
  AmChart,
  AmDataItem,
  AmRoot,
  AmSprite,
  AmXYSeries,
} from '@adapters/amcharts/types';

let nextUid = 1;

/**
 * The data item a resolved target names.
 *
 * `NavTarget` is a union because a ribbon is not addressed like the other
 * marks: a network's lines are not data items at all, so a flow or network
 * target names the sprite amCharts drew instead. A test that asks a ribbon for
 * a data item has resolved something other than what it meant to, so this says
 * so rather than narrowing with a cast.
 */
export function itemOf(target: NavTarget): AmDataItem {
  if (target.kind === 'ribbon') {
    throw new Error('Expected a target naming a data item, got a ribbon');
  }
  return target.dataItem;
}

/** The sprite a resolved ribbon names, with the same guard the other way. */
export function spriteOf(target: NavTarget): AmSprite {
  if (target.kind !== 'ribbon') {
    throw new Error(`Expected a ribbon target, got a ${target.kind}`);
  }
  return target.sprite;
}

export interface FakeSeriesConfig {
  /** amCharts series class name. Defaults to `ColumnSeries`. */
  className?: string;
  /** Series name (used for layer titles / segmented fill). */
  name?: string;
  /** `IEntitySettings.id` — the name a companion series is addressed by. */
  id?: string;
  /**
   * The `userData` slot, which a co-located `maidr` declaration rides in:
   * pass `{ maidr: { type: 'survival', … } }`.
   */
  userData?: unknown;
  /** Extra series settings readable via `series.get(key)`. */
  settings?: Record<string, unknown>;
  /** Data-item records readable via `dataItem.get(key)`. */
  data?: Array<Record<string, unknown>>;
  /**
   * The authors' own rows, as `dataItem.dataContext`, index-aligned with
   * `data`. Defaults to the `data` record itself, which is the ordinary case —
   * amCharts derives a data item's readable values from the row it was given.
   * Pass this to put a column *only* on the row, which is where a declared
   * field the chart was never bound to actually lives.
   */
  rows?: Array<Record<string, unknown>>;
}

export function fakeSeries(config: FakeSeriesConfig = {}): AmXYSeries {
  const settings: Record<string, unknown> = {
    ...(config.name != null ? { name: config.name } : {}),
    ...(config.id != null ? { id: config.id } : {}),
    ...(config.userData != null ? { userData: config.userData } : {}),
    ...config.settings,
  };
  return {
    className: config.className ?? 'ColumnSeries',
    uid: nextUid++,
    get: (key: string) => settings[key],
    dataItems: (config.data ?? []).map((record, at) => ({
      get: (key: string) => record[key],
      dataContext: config.rows?.[at] ?? record,
    })),
  } as unknown as AmXYSeries;
}

/** A vertical column (bar) series with `categoryX`/`valueY` data items. */
export function fakeBarSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number | null }>,
): AmXYSeries {
  return fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
}

/**
 * A horizontal column series: categories on the Y axis and values on the X
 * one, which is how amCharts draws a bar chart lying on its side — and the
 * only way it draws a population pyramid.
 */
export function fakeHorizontalBarSeries(
  name: string,
  points: Array<{ categoryY: string; valueX: number | null }>,
): AmXYSeries {
  return fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: { categoryYField: 'category' },
    data: points,
  });
}

/**
 * What amCharts leaves behind when it draws a mark it has no series class for:
 * the styling on the graphics template, and whether bullets were pushed on.
 */
export interface FakeMarkConfig {
  /** `strokes.template.get('strokeOpacity')`, for a dot plot's hidden line. */
  strokeOpacity?: number;
  /** `columns.template.get(width|height)`, for a lollipop's hairline stem. */
  thickness?: number;
  /** Whether any bullet was configured. Defaults to true. */
  bullets?: boolean;
}

/**
 * A `LineSeries` drawn as a Cleveland dot plot: the stroke switched off and
 * bullets pushed on, so what is drawn is the points alone.
 */
export function fakeDotSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number }>,
  config: FakeMarkConfig = {},
): AmXYSeries {
  const strokeSettings: Record<string, unknown> = {
    strokeOpacity: config.strokeOpacity ?? 0,
  };
  const series = fakeSeries({
    className: 'LineSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
  const raw = series as unknown as Record<string, unknown>;
  raw.strokes = { values: [], template: { get: (key: string) => strokeSettings[key] } };
  raw.bullets = { values: config.bullets === false ? [] : [{ get: () => undefined }] };
  return series;
}

/**
 * A `ColumnSeries` drawn as a lollipop: columns narrowed to a stem, with a
 * bullet on the end. `graphics` stands in for the column sprite the overlay
 * measures.
 */
export function fakeLollipopSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number; graphics?: unknown }>,
  config: FakeMarkConfig = {},
): AmXYSeries {
  const columnSettings: Record<string, unknown> = { width: config.thickness ?? 2 };
  const series = fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
  const raw = series as unknown as Record<string, unknown>;
  raw.columns = { values: [], template: { get: (key: string) => columnSettings[key] } };
  raw.bullets = { values: config.bullets === false ? [] : [{ get: () => undefined }] };
  return series;
}

/**
 * An am5wc `WordCloud`: like a hierarchy layout it is a bare series in a plain
 * container, and like a pie its terms carry a `category`/`value` pair. `label`
 * stands in for the glyph the overlay measures.
 */
export function fakeWordCloudSeries(
  name: string,
  terms: Array<{ category: string; value: number | null; label?: unknown }>,
): AmXYSeries {
  return fakeSeries({
    className: 'WordCloud',
    name,
    settings: { categoryField: 'category', valueField: 'value' },
    data: terms,
  });
}

/** A line series with `categoryX`/`valueY` data items. */
export function fakeLineSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number }>,
): AmXYSeries {
  return fakeSeries({
    className: 'LineSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
}

/**
 * A value axis, optionally drawn upside down — the rank axis a bump chart
 * plots on. amCharts keeps the inversion on the axis' renderer rather than on
 * the axis itself, which is where the adapter reads it from.
 */
export function fakeValueAxis(inversed: boolean): AmAxis {
  const renderer = {
    get: (key: string) => (key === 'inversed' ? inversed : undefined),
  };
  return {
    className: 'ValueAxis',
    get: (key: string) => (key === 'renderer' ? renderer : undefined),
    dataItems: [],
  } as unknown as AmAxis;
}

/**
 * One competitor of a bump chart: an ordinary `LineSeries` carrying places
 * rather than magnitudes, bound by default to an inversed value axis.
 */
export function fakeRankSeries(
  name: string,
  places: Array<{ categoryX: string; valueY: number }>,
  config: { inversed?: boolean } = {},
): AmXYSeries {
  return fakeSeries({
    className: 'LineSeries',
    name,
    settings: {
      categoryXField: 'category',
      yAxis: fakeValueAxis(config.inversed !== false),
    },
    data: places,
  });
}

/**
 * How an area series declares its band, mirroring the settings amCharts reads:
 * a visible fill is what makes a `LineSeries` an area at all, and `stacked` /
 * `valueYShow` are what make the bands a stack.
 */
export interface FakeAreaConfig {
  /** `fills.template.get('fillOpacity')`. Defaults to a visible 0.5. */
  fillOpacity?: number;
  /** `fills.template.get('visible')`. */
  fillVisible?: boolean;
  stacked?: boolean;
  /** Set for a 100% stack (`valueYShow: 'valueYTotalPercent'`). */
  normalized?: boolean;
}

/**
 * A `LineSeries` drawn as an area: the same series a line uses, with the fill
 * template amCharts requires before it paints the band.
 */
export function fakeAreaSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number }>,
  config: FakeAreaConfig = {},
): AmXYSeries {
  const fillSettings: Record<string, unknown> = {
    fillOpacity: config.fillOpacity ?? 0.5,
    ...(config.fillVisible != null ? { visible: config.fillVisible } : {}),
  };
  const series = fakeSeries({
    className: 'LineSeries',
    name,
    settings: {
      categoryXField: 'category',
      ...(config.stacked ? { stacked: true } : {}),
      ...(config.normalized ? { valueYShow: 'valueYTotalPercent' } : {}),
    },
    data: points,
  });
  (series as unknown as Record<string, unknown>).fills = {
    template: { get: (key: string) => fillSettings[key] },
  };
  return series;
}

/** An am5radar `RadarLineSeries`: one closed outline over the spokes. */
export function fakeRadarSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number }>,
): AmXYSeries {
  return fakeSeries({
    className: 'RadarLineSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
}

/**
 * An am5radar `RadarColumnSeries`: the same spokes drawn as wedges. Its
 * wedges live on each data item's `graphics`, where a plain column series
 * keeps its rectangle.
 */
export function fakePolarSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number; graphics?: unknown }>,
): AmXYSeries {
  return fakeSeries({
    className: 'RadarColumnSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
}

/**
 * An am5percent funnel series: `category`/`value` stages in data order, with
 * `slice` standing in for the stage graphic the overlay measures.
 */
export function fakeFunnelSeries(
  name: string,
  stages: Array<{ category: string; value: number | null; slice?: unknown }>,
  className = 'FunnelSeries',
  orientation?: 'vertical' | 'horizontal',
): AmXYSeries {
  return fakeSeries({
    className,
    name,
    settings: {
      categoryField: 'category',
      valueField: 'value',
      // amCharts' own name for the direction the STAGES progress, which is
      // the opposite of the one MAIDR's `orientation` names. Omitted for the
      // default, exactly as a chart that never set it reports.
      ...(orientation ? { orientation } : {}),
    },
    data: stages,
  });
}

/**
 * An am5percent pie series: `category`/`value` data items, no axis fields.
 * `slice` stands in for the wedge graphic the overlay reads geometry from.
 */
export function fakePieSeries(
  name: string,
  slices: Array<{ category: string; value: number | null; slice?: unknown }>,
): AmXYSeries {
  return fakeSeries({
    className: 'PieSeries',
    name,
    settings: { categoryField: 'category', valueField: 'value' },
    data: slices,
  });
}

/**
 * A column series whose bars float between two values on the value axis —
 * the shape amCharts draws both a waterfall and a dumbbell with. `graphics`
 * stands in for the column sprite the overlay measures.
 */
export function fakeFloatingColumnSeries(
  name: string,
  columns: Array<{
    categoryX: string;
    openValueY: number | null;
    valueY: number | null;
    graphics?: unknown;
  }>,
): AmXYSeries {
  return fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: { categoryXField: 'category', openValueYField: 'open' },
    data: columns,
  });
}

/** A category axis, whose data items name the lanes of a schedule. */
export function fakeCategoryAxis(categories: string[]): AmAxis {
  return {
    className: 'CategoryAxis',
    get: () => undefined,
    dataItems: categories.map(category => ({
      get: (key: string) => (key === 'category' ? category : undefined),
    })),
  } as unknown as AmAxis;
}

/**
 * A date axis, which reports the unit its positions are measured in through
 * its base interval. Passing no unit makes it a plain value axis instead.
 */
export function fakeTimeAxis(timeUnit?: string): AmAxis {
  const baseInterval = timeUnit != null ? { timeUnit, count: 1 } : undefined;
  return {
    className: timeUnit != null ? 'DateAxis' : 'ValueAxis',
    get: (key: string) => (key === 'baseInterval' ? baseInterval : undefined),
    dataItems: [],
  } as unknown as AmAxis;
}

/**
 * An amCharts gantt: floating columns on a category axis of lanes and a date
 * axis of time. The axes are settings of the series, which is where the
 * adapter reads the lane names and the unit from.
 */
export function fakeGanttSeries(
  name: string,
  bars: Array<{
    categoryY: string;
    openValueX: number | null;
    valueX: number | null;
    graphics?: unknown;
  }>,
  config: { lanes?: string[]; timeUnit?: string } = {},
): AmXYSeries {
  return fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: {
      categoryYField: 'category',
      openValueXField: 'fromDate',
      xAxis: fakeTimeAxis(config.timeUnit),
      yAxis: fakeCategoryAxis(config.lanes ?? []),
    },
    data: bars,
  });
}

/** One node of a fake am5hierarchy tree. */
export interface FakeNode {
  category: string;
  value?: number;
  children?: FakeNode[];
  /** Stands in for the rectangle sprite the overlay measures. */
  rectangle?: unknown;
  /**
   * Stands in for the wedge a `Sunburst` draws a node with, which the overlay
   * measures the way it measures a pie slice.
   */
  slice?: unknown;
  /**
   * The same wedge hung on `graphics` instead — the other slot `sliceRect`
   * probes, since which of the two an am5hierarchy build uses is exactly the
   * shape that cannot be checked without the library.
   */
  graphics?: unknown;
  /**
   * The author's own row behind the node, as `dataItem.dataContext`.
   *
   * Where an `am5hierarchy.ForceDirected`'s cross-links live: amCharts binds
   * them through `linkWithField`, which names a column on the row rather than
   * anything the chart itself resolves.
   */
  row?: Record<string, unknown>;
}

function fakeHierarchyItem(node: FakeNode): AmDataItem {
  const children = node.children?.map(fakeHierarchyItem);
  const settings: Record<string, unknown> = {
    category: node.category,
    ...(node.value != null ? { value: node.value } : {}),
    ...(children != null ? { children } : {}),
    ...(node.rectangle != null ? { rectangle: node.rectangle } : {}),
    ...(node.slice != null ? { slice: node.slice } : {}),
    ...(node.graphics != null ? { graphics: node.graphics } : {}),
  };
  return {
    get: (key: string) => settings[key],
    ...(node.row != null ? { dataContext: node.row } : {}),
  } as unknown as AmDataItem;
}

/**
 * An am5hierarchy series — a `Treemap`, the `Partition` amCharts draws an
 * icicle with, or the `Sunburst` that bends that icicle into a ring. Unlike
 * every other series here it is not inside a chart: it is pushed straight into
 * a container, and its nodes hang off the single root data item rather than
 * off the series.
 */
export function fakeHierarchySeries(
  name: string,
  root: FakeNode,
  className = 'Treemap',
  extraSettings: Record<string, unknown> = {},
): AmXYSeries {
  const settings: Record<string, unknown> = { name, ...extraSettings };
  return {
    className,
    uid: nextUid++,
    get: (key: string) => settings[key],
    dataItems: [fakeHierarchyItem(root)],
  } as unknown as AmXYSeries;
}

/**
 * An `am5hierarchy.ForceDirected` series — a network, and a hierarchy series
 * rather than a link list: its graph is a tree of `children` plus whatever
 * cross-links each row names in the column `linkWithField` points at.
 */
export function fakeForceDirectedSeries(
  name: string,
  root: FakeNode,
  settings: Record<string, unknown> = {},
  links: unknown[] = [],
): AmXYSeries {
  const series = fakeHierarchySeries(name, root, 'ForceDirected', settings);
  // The drawn lines, which hang off the series rather than off any data item:
  // amCharts derives them from the tree and from the rows' `linkWith` columns,
  // and keeps them in a list of its own. Absent for a build that exposes none,
  // which is how the highlight's fallback to nothing is exercised.
  return { ...series, links: { values: links } } as unknown as AmXYSeries;
}

/**
 * One line an `am5hierarchy.ForceDirected` drew between two nodes.
 *
 * Its ends are *node data items*, asked for the category that names them —
 * the same read the tree walk names a node by, which is what lets the highlight
 * match a drawn line to an emitted link. `globalBounds()` is the box the
 * overlay outlines; pass a flat one for a line drawn perfectly straight.
 */
export function fakeHierarchyLink(config: {
  source: string | number;
  target: string | number;
  box?: AmBounds;
}): unknown {
  const ends: Record<string, unknown> = {
    source: { get: (key: string) => (key === 'category' ? config.source : undefined) },
    target: { get: (key: string) => (key === 'category' ? config.target : undefined) },
  };
  const box = config.box ?? { left: 0, top: 0, right: 10, bottom: 10 };
  return {
    className: 'HierarchyLink',
    get: (key: string) => ends[key],
    globalBounds: () => box,
  };
}

/**
 * The band an am5flow series drew for one link, as the overlay measures it.
 *
 * Nothing but a box: a `SankeyLink` is a `Graphics` painted from a path, so
 * what the highlight reads off it is the axis-aligned box it reports.
 */
export function fakeRibbon(box: AmBounds): unknown {
  return { className: 'SankeyLink', globalBounds: () => box };
}

/**
 * One link of a fake am5flow series, with a knob for each of the three ways
 * the adapter probes for an end.
 *
 * All three exist because none can be checked without the library: a build may
 * answer with the resolved id, with the node data item the link was joined to,
 * or with neither — leaving the author's own row as the only thing that says
 * what the link connects.
 */
export interface FakeLink {
  /** `dataItem.get('sourceId')` — the id amCharts resolved the end to. */
  sourceId?: string | number;
  /** `dataItem.get('targetId')`. */
  targetId?: string | number;
  /** `dataItem.get('source')` — the *node* data item, asked for name then id. */
  sourceNode?: { name?: string | number; id?: string | number };
  /** `dataItem.get('target')`. */
  targetNode?: { name?: string | number; id?: string | number };
  /** `dataItem.get('value')` — how much flows. */
  value?: number;
  /** The author's own row, reached only when the reads above answer nothing. */
  row?: Record<string, unknown>;
  /**
   * `dataItem.get('link')` — the band amCharts drew for the link, which the
   * overlay measures. Unverifiable without the library, so it is a knob: leave
   * it out for a build that keeps none.
   */
  link?: unknown;
}

function fakeNodeItem(node: { name?: string | number; id?: string | number }): unknown {
  return { get: (key: string) => (node as Record<string, unknown>)[key] };
}

function fakeLinkItem(link: FakeLink): AmDataItem {
  const settings: Record<string, unknown> = {
    ...(link.sourceId != null ? { sourceId: link.sourceId } : {}),
    ...(link.targetId != null ? { targetId: link.targetId } : {}),
    ...(link.sourceNode != null ? { source: fakeNodeItem(link.sourceNode) } : {}),
    ...(link.targetNode != null ? { target: fakeNodeItem(link.targetNode) } : {}),
    ...(link.value !== undefined ? { value: link.value } : {}),
    ...(link.link != null ? { link: link.link } : {}),
  };
  return {
    get: (key: string) => settings[key],
    ...(link.row != null ? { dataContext: link.row } : {}),
  } as unknown as AmDataItem;
}

/**
 * An am5flow series — a `Sankey`, one of the three `Chord` variants, or the
 * `ArcDiagram` that draws the same weighted links along a line.
 *
 * Like an am5hierarchy layout it is not inside a chart: it is pushed straight
 * into a container. Its `dataItems` are the **links**; the nodes amCharts
 * derives from them live on a separate series, which the adapter deliberately
 * does not read.
 */
export function fakeFlowSeries(
  name: string,
  links: FakeLink[],
  className = 'Sankey',
  extraSettings: Record<string, unknown> = {},
): AmXYSeries {
  const settings: Record<string, unknown> = { name, ...extraSettings };
  return {
    className,
    uid: nextUid++,
    get: (key: string) => settings[key],
    dataItems: links.map(fakeLinkItem),
  } as unknown as AmXYSeries;
}

/**
 * One qualitative band of a gauge's dial: an axis range with an upper edge and
 * (usually) nothing that names it.
 */
export interface FakeGaugeBand {
  endValue: number;
  /** A `Label` entity, as amCharts hangs one on a range. */
  label?: string;
  /** The same name as a plain string, the other slot the reader probes. */
  labelText?: string;
}

export interface FakeGaugeConfig {
  /** The reading the hand points at. `null` leaves the data item valueless. */
  value?: number | null;
  /** The dial's ends, as settings on the value axis. */
  min?: number;
  max?: number;
  /**
   * Report the ends through `axis.getPrivate()` instead — what amCharts does
   * when the author fixed neither and let it compute them.
   */
  privateExtremes?: boolean;
  /** The axis title, which is what names the dial. */
  axisLabel?: string;
  /** The chart title, exposed as a `Label` child like amCharts does. */
  title?: string;
  bands?: FakeGaugeBand[];
  /** Stands in for the `ClockHand` sprite the overlay measures. */
  hand?: unknown;
  /** How many hands to pin to the axis. Defaults to one. */
  hands?: number;
  /**
   * File the hand's data item under `axis.dataItems` rather than under
   * `axis.axisRanges` — the other list a made axis data item may land in.
   */
  viaDataItems?: boolean;
  /**
   * Expose the bullet's sprite as a plain `.sprite` property rather than
   * through `bullet.get('sprite')`.
   */
  bulletProperty?: boolean;
  /** Series on the chart. A ClockHand gauge ordinarily has none. */
  series?: AmXYSeries[];
  /** Overrides the `RadarChart` class name, for the negative cases. */
  className?: string;
  /** Overrides the hand sprite's `ClockHand` class name. */
  handClassName?: string;
}

/** A `ClockHand` as amCharts reports one: a `Container` with a laid-out box. */
export function fakeClockHand(
  box: { left: number; top: number; width: number; height: number },
  className = 'ClockHand',
): unknown {
  return {
    className,
    width: () => box.width,
    height: () => box.height,
    toGlobal: (point: { x: number; y: number }) => ({
      x: box.left + point.x,
      y: box.top + point.y,
    }),
    get: () => undefined,
  };
}

function fakeAxisRange(settings: Record<string, unknown>): AmDataItem {
  return { get: (key: string) => settings[key] } as unknown as AmDataItem;
}

/**
 * An am5radar gauge: a `RadarChart` whose reading is a `ClockHand` pinned to
 * an axis data item, and — the point of the whole shape — no series at all.
 */
export function fakeGaugeChart(config: FakeGaugeConfig = {}): AmChart {
  const handSprite = config.hand
    ?? fakeClockHand({ left: 40, top: 60, width: 12, height: 80 }, config.handClassName);

  const handItems: AmDataItem[] = [];
  for (let at = 0; at < (config.hands ?? 1); at++) {
    const bullet = config.bulletProperty
      ? { get: () => undefined, sprite: handSprite }
      : { get: (key: string) => (key === 'sprite' ? handSprite : undefined) };
    handItems.push(fakeAxisRange({
      ...(config.value !== null ? { value: config.value ?? 73 } : {}),
      bullet,
    }));
  }

  const bandItems = (config.bands ?? []).map(band => fakeAxisRange({
    endValue: band.endValue,
    ...(band.label != null
      ? { label: { get: (key: string) => (key === 'text' ? band.label : undefined) } }
      : {}),
    ...(band.labelText != null ? { label: band.labelText } : {}),
  }));

  const title = config.axisLabel != null
    ? { get: (key: string) => (key === 'text' ? config.axisLabel : undefined) }
    : undefined;
  const settings: Record<string, unknown> = {
    ...(title != null ? { title } : {}),
    ...(config.privateExtremes ? {} : { min: config.min ?? 0, max: config.max ?? 100 }),
  };
  const privates: Record<string, unknown> = config.privateExtremes
    ? { min: config.min ?? 0, max: config.max ?? 100 }
    : {};

  const axis = {
    className: 'ValueAxis',
    get: (key: string) => settings[key],
    getPrivate: (key: string) => privates[key],
    dataItems: config.viaDataItems ? handItems : [],
    axisRanges: { values: config.viaDataItems ? bandItems : [...handItems, ...bandItems] },
  } as unknown as AmAxis;

  const chart: Record<string, unknown> = {
    className: config.className ?? 'RadarChart',
    uid: nextUid++,
    get: () => undefined,
    series: { values: config.series ?? [] },
    xAxes: { values: [axis] },
    yAxes: { values: [] },
    plotContainer: {
      globalBounds: () => ({ left: 0, top: 0, right: 400, bottom: 400 }),
    },
  };
  if (config.title != null) {
    const chartTitle = config.title;
    chart.children = {
      values: [{
        className: 'Label',
        get: (key: string) => (key === 'text' ? chartTitle : undefined),
      }],
    };
  }
  return chart as unknown as AmChart;
}

/**
 * The polygon an am5map `MapPolygonSeries` drew a region as.
 *
 * `globalBounds()` is the axis-aligned box the overlay outlines; `geoCentroid`
 * is the degree pair the payload's `lon`/`lat` come from when the author's own
 * row carries none. Both are unverifiable without the library, so both are
 * knobs: pass no `centroid` for a build that answers nothing, and a
 * `degenerate` box for one that reports a point rather than a shape.
 */
export function fakeMapPolygon(config: {
  box?: { left: number; top: number; right: number; bottom: number };
  centroid?: { longitude: unknown; latitude: unknown };
  /** Make `geoCentroid()` throw, as a half-built polygon may. */
  centroidThrows?: boolean;
} = {}): unknown {
  const box = config.box ?? { left: 10, top: 20, right: 60, bottom: 70 };
  const polygon: Record<string, unknown> = {
    className: 'MapPolygon',
    globalBounds: () => box,
  };
  if (config.centroidThrows) {
    polygon.geoCentroid = (): never => {
      throw new Error('not laid out');
    };
  } else if (config.centroid !== undefined) {
    polygon.geoCentroid = (): unknown => config.centroid;
  }
  return polygon;
}

/** One region of a fake choropleth. */
export interface FakeRegion {
  /** `dataItem.get('name')` — the name amCharts resolved the polygon to. */
  name?: string;
  /** `dataItem.get('value')` — the number the region is shaded by. */
  value?: number;
  /** The drawn polygon, on `dataItem.get('mapPolygon')`. */
  polygon?: unknown;
  /** The author's own row, as `dataItem.dataContext`. */
  row?: Record<string, unknown>;
}

/**
 * An am5map `MapPolygonSeries`.
 *
 * Bound to a `valueField` by default, which is what separates a choropleth
 * from the base geography drawn under one: pass `settings: {}` for a series
 * carrying no values at all.
 */
export function fakeMapPolygonSeries(
  name: string,
  regions: FakeRegion[],
  settings: Record<string, unknown> = { valueField: 'value' },
  className = 'MapPolygonSeries',
): AmXYSeries {
  const seriesSettings: Record<string, unknown> = { name, ...settings };
  return {
    className,
    uid: nextUid++,
    get: (key: string) => seriesSettings[key],
    dataItems: regions.map((region) => {
      const itemSettings: Record<string, unknown> = {
        ...(region.name != null ? { name: region.name } : {}),
        ...(region.value != null ? { value: region.value } : {}),
        ...(region.polygon != null ? { mapPolygon: region.polygon } : {}),
      };
      return {
        get: (key: string) => itemSettings[key],
        ...(region.row != null ? { dataContext: region.row } : {}),
      } as unknown as AmDataItem;
    }),
  } as unknown as AmXYSeries;
}

/**
 * An am5map `MapChart`: a `SerialChart` with a series list, no axes, and a
 * class name of its own — the signature the adapter's other two chart gates
 * both miss. It is its own `Container`, so it answers the geometry reads a
 * panel is measured by.
 */
export function fakeMapChart(
  config: { series?: AmXYSeries[]; title?: string; bounds?: AmBounds } = {},
): AmChart {
  const chart: Record<string, unknown> = {
    className: 'MapChart',
    uid: nextUid++,
    get: () => undefined,
    series: { values: config.series ?? [] },
  };
  if (config.bounds) {
    const bounds = config.bounds;
    chart.globalBounds = (): AmBounds => bounds;
  }
  if (config.title != null) {
    const title = config.title;
    chart.children = {
      values: [{
        className: 'Label',
        get: (key: string) => (key === 'text' ? title : undefined),
      }],
    };
  }
  return chart as unknown as AmChart;
}

/** A step-line series, drawn as a staircase rather than an interpolated line. */
export function fakeStepSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number }>,
): AmXYSeries {
  return fakeSeries({
    className: 'StepLineSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
}

function fakeAxis(label?: string): AmAxis {
  const title = label != null
    ? { get: (key: string) => (key === 'text' ? label : undefined) }
    : undefined;
  return {
    get: (key: string) => (key === 'title' ? title : undefined),
    dataItems: [],
  } as unknown as AmAxis;
}

export interface FakeChartConfig {
  series?: AmXYSeries[];
  /** X axis title (readable via `axis.get('title').get('text')`). */
  xLabel?: string;
  /** Y axis title. */
  yLabel?: string;
  /** Chart title, exposed as a `Label` child like amCharts does. */
  title?: string;
  /** Plot-area bounds returned by `plotContainer.globalBounds()`. */
  bounds?: AmBounds;
  className?: string;
}

export function fakeChart(config: FakeChartConfig = {}): AmChart {
  const chart: Record<string, unknown> = {
    className: config.className ?? 'XYChart',
    uid: nextUid++,
    get: () => undefined,
    series: { values: config.series ?? [] },
    xAxes: { values: [fakeAxis(config.xLabel)] },
    yAxes: { values: [fakeAxis(config.yLabel)] },
  };
  if (config.bounds) {
    const bounds = config.bounds;
    chart.plotContainer = { globalBounds: () => bounds };
  }
  if (config.title != null) {
    const title = config.title;
    chart.children = {
      values: [{
        className: 'Label',
        get: (key: string) => (key === 'text' ? title : undefined),
      }],
    };
  }
  return chart as unknown as AmChart;
}

/**
 * An am5percent `PieChart`: a series list and a class name, but no axes and no
 * plot container — the shape the adapter has to recognise without them.
 */
export function fakePieChart(config: { series?: AmXYSeries[]; title?: string } = {}): AmChart {
  const chart: Record<string, unknown> = {
    className: 'PieChart',
    uid: nextUid++,
    get: () => undefined,
    series: { values: config.series ?? [] },
  };
  if (config.title != null) {
    const title = config.title;
    chart.children = {
      values: [{
        className: 'Label',
        get: (key: string) => (key === 'text' ? title : undefined),
      }],
    };
  }
  return chart as unknown as AmChart;
}

/**
 * An am5percent `SlicedChart` — the funnel/pyramid counterpart of a
 * `PieChart`: a series list and a class name, no axes and no plot container.
 */
export function fakeSlicedChart(
  config: { series?: AmXYSeries[]; title?: string } = {},
): AmChart {
  const chart = fakePieChart(config) as unknown as Record<string, unknown>;
  chart.className = 'SlicedChart';
  return chart as unknown as AmChart;
}

/**
 * A container-like node (e.g. a StockChart, a panels/tools container, or an
 * `XYChartScrollbar` when given that `className` — a real scrollbar is a plain
 * container, NOT chart-like, whose child is a preview `XYChart`).
 */
export function fakeContainer(children: unknown[], className?: string): unknown {
  return {
    ...(className != null ? { className } : {}),
    get: () => undefined,
    children: { values: children },
  };
}

/**
 * A minimal `HTMLElement` stand-in for the chart container. The adapter only
 * reads `id` and calls `querySelector` (selector probing), so no DOM needed.
 */
export function fakeContainerEl(id = 'chartdiv'): HTMLElement {
  return {
    id,
    querySelector: () => null,
  } as unknown as HTMLElement;
}

export function fakeRoot(children: unknown[], domId = 'chartdiv'): AmRoot {
  return {
    dom: fakeContainerEl(domId),
    container: fakeContainer(children),
  } as unknown as AmRoot;
}
