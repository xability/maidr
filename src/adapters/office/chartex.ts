/**
 * Reads a chart part of the types Office 2016 added (`cx:chartSpace`) into
 * the snapshot the Excel adapter converts.
 *
 * A histogram, Pareto, box and whisker, waterfall, funnel, treemap, sunburst
 * or map chart is kept in a part of its own, `chartExN.xml`, in its own
 * schema: a series names a data block of the part's `cx:chartData`, which
 * holds the cached values in dimensions -- the categories, one level per tier
 * of a hierarchy, and the numbers. What Office.js does not report is read
 * from it too: a waterfall's points set as totals, and a hierarchy's levels.
 */

import type { ExcelAxisSnapshot, ExcelBinOptionsSnapshot, ExcelChartSnapshot, ExcelSeriesSnapshot } from '../excel/types';
import { labelLevels } from '../excel/reader';
import { asNumber, categoryLabel } from './formats';
import { child, children, NS, path, richText, truthy } from './xml';

/** The most points a dimension's level is read with: a worksheet's row count. */
const MAX_POINTS = 1_048_576;

/** The most levels of a hierarchy read; a part claiming more is damaged. */
const MAX_LEVELS = 32;

/** The `Excel.ChartType` each series layout draws, by `layoutId`. */
const LAYOUTS: Readonly<Record<string, string>> = {
  clusteredColumn: 'Histogram',
  paretoLine: 'Pareto',
  boxWhisker: 'Boxwhisker',
  waterfall: 'Waterfall',
  funnel: 'Funnel',
  treemap: 'Treemap',
  sunburst: 'Sunburst',
  regionMap: 'RegionMap',
};

/** The dimension types that hold a series' numbers. */
const VALUE_TYPES = ['val', 'size', 'colorVal'];

/** The chart types whose categories are a hierarchy. */
const HIERARCHIES: ReadonlySet<string> = new Set(['Treemap', 'Sunburst']);

/** The chart type a part draws: Pareto when any series is its line, else the first layout's. */
function chartTypeOf(series: readonly Element[]): string {
  const layouts = series.map(one => one.getAttribute('layoutId') ?? '');
  if (layouts.includes('paretoLine')) {
    return 'Pareto';
  }
  for (const layout of layouts) {
    const type = LAYOUTS[layout];
    if (type !== undefined) {
      return type;
    }
  }
  return 'Invalid';
}

/** A level's points, one per index up to the highest, `''` for a gap. */
function levelPoints(level: Element): string[] {
  const points = children(level, NS.cx, 'pt');
  let highest = -1;
  const pairs: [number, string][] = [];
  for (const point of points) {
    const index = Number.parseInt(point.getAttribute('idx') ?? '', 10);
    if (Number.isInteger(index) && index >= 0 && index < MAX_POINTS) {
      pairs.push([index, point.textContent ?? '']);
      highest = Math.max(highest, index);
    }
  }
  const out: string[] = Array.from({ length: highest + 1 }, () => '');
  for (const [index, value] of pairs) {
    out[index] = value;
  }
  return out;
}

/** A data block's first dimension of one of `types`. */
function dimension(block: Element | undefined, types: readonly string[]): Element | null {
  for (const element of Array.from(block?.children ?? [])) {
    if (
      element.namespaceURI === NS.cx
      && (element.localName === 'strDim' || element.localName === 'numDim')
      && types.includes(element.getAttribute('type') ?? '')
    ) {
      return element;
    }
  }
  return null;
}

/**
 * A category dimension's levels: one list per category, outer first, a blank
 * outer level carried down as Excel reads it.
 */
function categoryLevels(element: Element | null, date1904: boolean): string[][] {
  if (element === null) {
    return [];
  }
  const numeric = element.localName === 'numDim';
  // Innermost first in the part.
  const levels = children(element, NS.cx, 'lvl').slice(0, MAX_LEVELS).map((level) => {
    const code = level.getAttribute('formatCode');
    return levelPoints(level).map(value => categoryLabel(value, numeric, code, false, date1904));
  });
  const outerFirst = levels.reverse();
  const length = Math.max(0, ...outerFirst.map(level => level.length));
  const rows = Array.from({ length }, (_, i) => outerFirst.map(level => level[i] ?? ''));
  return labelLevels(rows, 'rows');
}

/** A value dimension's numbers, as Office.js returns them: text, `''` for a gap. */
function values(element: Element | null): string[] {
  const level = child(element, NS.cx, 'lvl');
  return level === null ? [] : levelPoints(level);
}

/** How a histogram or Pareto chart bins, from its layout properties. */
function binOptionsOf(layout: Element | null): ExcelBinOptionsSnapshot {
  if (child(layout, NS.cx, 'aggregation') !== null) {
    return { type: 'Category' };
  }
  const binning = child(layout, NS.cx, 'binning');
  if (binning === null) {
    return { type: 'Auto' };
  }
  const underflow = asNumber(binning.getAttribute('underflow'));
  const overflow = asNumber(binning.getAttribute('overflow'));
  const limits: ExcelBinOptionsSnapshot = {
    type: 'Auto',
    ...(underflow === undefined ? {} : { allowUnderflow: true, underflowValue: underflow }),
    ...(overflow === undefined ? {} : { allowOverflow: true, overflowValue: overflow }),
  };
  const width = asNumber(child(binning, NS.cx, 'binSize')?.getAttribute('val'));
  if (width !== undefined && width > 0) {
    return { ...limits, type: 'BinWidth', width };
  }
  const count = asNumber(child(binning, NS.cx, 'binCount')?.getAttribute('val'));
  if (count !== undefined && count >= 1) {
    return { ...limits, type: 'BinCount', count: Math.floor(count) };
  }
  return limits;
}

/** A waterfall's points set as totals, by position. */
function totalsOf(layout: Element | null): number[] {
  const found = children(child(layout, NS.cx, 'subtotals'), NS.cx, 'idx')
    .map(index => Number.parseInt(index.getAttribute('val') ?? '', 10))
    .filter(index => Number.isInteger(index) && index >= 0);
  return [...new Set(found)].sort((a, b) => a - b);
}

/** A title's text: its cached value, or its rich text. */
function titleText(title: Element | null): string | undefined {
  const cached = path(title, NS.cx, 'tx', 'txData', 'v')?.textContent?.trim();
  if (cached !== undefined && cached !== '') {
    return cached;
  }
  return richText(path(title, NS.cx, 'tx', 'rich'));
}

/** An axis' title, shown when the axis is. */
function axisSnapshot(axis: Element | undefined): ExcelAxisSnapshot | undefined {
  if (axis === undefined) {
    return undefined;
  }
  const text = titleText(child(axis, NS.cx, 'title'));
  return text === undefined ? {} : { title: { text, visible: !truthy(axis.getAttribute('hidden')) } };
}

/**
 * Read a chart part of a type Office 2016 added.
 *
 * @param root - The part's root element, `cx:chartSpace`.
 * @param options - Whether the workbook behind the chart counts dates from 1904.
 * @param options.date1904 - Default `false`.
 * @returns The chart, as the Excel adapter converts it; `null` when the part
 * is not a chart. A layout MAIDR does not know reads as `Invalid`, so the
 * converter says it cannot read it.
 */
export function readChartExPart(root: Element, options: { readonly date1904?: boolean } = {}): ExcelChartSnapshot | null {
  if (root.namespaceURI !== NS.cx || root.localName !== 'chartSpace') {
    return null;
  }
  const chart = child(root, NS.cx, 'chart');
  if (chart === null) {
    return null;
  }
  const date1904 = options.date1904 ?? false;
  const region = path(chart, NS.cx, 'plotArea', 'plotAreaRegion');
  const all = children(region, NS.cx, 'series');
  const chartType = chartTypeOf(all);
  const title = titleText(child(chart, NS.cx, 'title'));
  const base: Pick<ExcelChartSnapshot, 'chartType' | 'title'> = {
    chartType,
    ...(title === undefined ? {} : { title: { text: title, visible: true } }),
  };
  if (chartType === 'Invalid') {
    return { ...base, series: [] };
  }

  const blocks = new Map<string, Element>();
  for (const block of children(child(root, NS.cx, 'chartData'), NS.cx, 'data')) {
    blocks.set(block.getAttribute('id') ?? '', block);
  }
  const drawn = all.filter(one => one.getAttribute('layoutId') !== 'paretoLine' && !truthy(one.getAttribute('hidden')));
  let levels: string[][] | undefined;
  const series: ExcelSeriesSnapshot[] = drawn.map((element, i) => {
    const block = blocks.get(child(element, NS.cx, 'dataId')?.getAttribute('val') ?? '');
    const categories = categoryLevels(dimension(block, ['cat']), date1904);
    const numbers = values(dimension(block, VALUE_TYPES));
    const labels = categories.map(list => list.filter(level => level !== '').join(' '));
    const length = Math.max(labels.length, numbers.length);
    const pad = (list: string[]): string[] => [...list, ...Array.from({ length: length - list.length }, () => '')];
    if (i === 0 && categories.some(list => list.length > 1)) {
      levels = categories;
    }
    const layout = child(element, NS.cx, 'layoutPr');
    const name = path(element, NS.cx, 'tx', 'txData', 'v')?.textContent?.trim();
    const totals = chartType === 'Waterfall' ? totalsOf(layout) : [];
    const method = child(layout, NS.cx, 'statistics')?.getAttribute('quartileMethod');
    return {
      name: name === undefined || name === '' ? `Series${i + 1}` : name,
      // Excel numbers the steps of a waterfall or funnel that names none.
      categories: pad(labels.length === 0 && (chartType === 'Waterfall' || chartType === 'Funnel')
        ? numbers.map((_, n) => String(n + 1))
        : labels),
      values: pad(numbers),
      ...(chartType === 'Histogram' || chartType === 'Pareto' ? { binOptions: binOptionsOf(layout) } : {}),
      ...(chartType === 'Boxwhisker' ? { quartileCalculation: method === 'inclusive' ? 'Inclusive' : 'Exclusive' } : {}),
      ...(totals.length > 0 ? { totals } : {}),
    };
  });

  const axes = children(path(chart, NS.cx, 'plotArea'), NS.cx, 'axis');
  const category = axisSnapshot(axes.find(axis => child(axis, NS.cx, 'catScaling') !== null));
  const value = axisSnapshot(axes.find(axis => child(axis, NS.cx, 'valScaling') !== null));
  return {
    ...base,
    axes: {
      ...(category === undefined ? {} : { category }),
      ...(value === undefined ? {} : { value }),
    },
    series,
    ...(levels !== undefined && HIERARCHIES.has(chartType) ? { categoryLevels: levels } : {}),
  };
}
