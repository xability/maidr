import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { declarableTypes, SCHEMA, typesInBackticks } from './schemaTypes';

/**
 * Each integration guide under `docs/` opens with a table of the chart types
 * its adapter reads, and walks through them again as example headings. An
 * experimental type carries `[experimental]` after its name in both places --
 * the convention `docs/SCHEMA.md` states under "Trace type stability" -- and a
 * stable one carries nothing. Someone choosing an adapter reads that table, not
 * the stability lists, so the table is where the promise has to be visible.
 *
 * Twelve guides repeat the mark by hand, row by row, so the day a type moves
 * between SCHEMA's lists every one of them is wrong at once and nothing says
 * so. This test re-derives each mark from SCHEMA instead.
 *
 * The rows name charts ("Gantt / Timeline", "Stepped Area"), not types, so
 * which types a row covers is written out below rather than guessed from its
 * wording. It is settled by what the adapter emits, not by the chart's name:
 * a Google Charts bubble is read as `point`, a stepped area as `area`. A row or
 * heading the maps do not know fails, so a new one is classified on purpose
 * rather than left unmarked by omission. A row that covers no single type
 * (subplots, a mark absorbed into another) maps to `[]` and carries no mark.
 */

const MARK = ' [experimental]';

/**
 * Chart names that mean the same types in every guide, lower-cased. A guide
 * whose wording means something else overrides it in its own `labels`.
 */
const VOCABULARY: Record<string, string[]> = {
  // Stable
  'bar': ['bar'],
  'bar chart': ['bar'],
  'column': ['bar'],
  'horizontal bar': ['bar'],
  'bar / column': ['bar'],
  'bar / column chart': ['bar'],
  'bar/column chart': ['bar'],
  'stacked bar': ['stacked_bar'],
  'stacked bar chart': ['stacked_bar'],
  'stacked column': ['stacked_bar'],
  'stacked column chart': ['stacked_bar'],
  'grouped bar': ['dodged_bar'],
  'grouped bar chart': ['dodged_bar'],
  'dodged bar': ['dodged_bar'],
  'dodged (grouped) bar': ['dodged_bar'],
  'dodged (grouped) bar chart': ['dodged_bar'],
  'dodged / grouped bar': ['dodged_bar'],
  'dodged/grouped column': ['dodged_bar'],
  'dodged/grouped column chart': ['dodged_bar'],
  'normalized bar': ['stacked_normalized_bar'],
  '100% stacked (normalized)': ['stacked_normalized_bar'],
  '100% stacked (normalized) bar': ['stacked_normalized_bar'],
  'histogram': ['hist'],
  'line': ['line'],
  'line chart': ['line'],
  'multi-line': ['line'],
  'multi-line chart': ['line'],
  'multi-series line': ['line'],
  'line (single & multi-series)': ['line'],
  'step': ['step'],
  'step chart': ['step'],
  'step (single & multi-series)': ['step'],
  'scatter': ['point'],
  'scatter plot': ['point'],
  'scatter chart': ['point'],
  'box plot': ['box'],
  'violin plot': ['violin_kde', 'violin_box'],
  'heatmap': ['heat'],
  'candlestick': ['candlestick'],
  'candlestick chart': ['candlestick'],
  'pie': ['pie'],
  'pie chart': ['pie'],
  'pie / doughnut': ['pie'],
  'pie / doughnut chart': ['pie'],
  'smooth': ['smooth'],

  // Experimental
  'area': ['area'],
  'area chart': ['area'],
  'stacked area': ['stacked_area'],
  '100% stacked area': ['stacked_normalized_area'],
  'normalized area': ['stacked_normalized_area'],
  'error bar': ['error_bar'],
  'error bars': ['error_bar'],
  'funnel': ['funnel'],
  'funnel chart': ['funnel'],
  'waterfall': ['waterfall'],
  'waterfall chart': ['waterfall'],
  'sunburst': ['sunburst'],
  'icicle': ['icicle'],
  'treemap': ['treemap'],
  'sankey': ['sankey'],
  'chord': ['chord'],
  'alluvial': ['alluvial'],
  'network': ['network'],
  'tree': ['tree'],
  'pack': ['pack'],
  'gauge': ['gauge'],
  'gauge chart': ['gauge'],
  'radar': ['radar'],
  'radar chart': ['radar'],
  'polar area': ['polar_area'],
  'parallel coordinates': ['parallel_coordinates'],
  'ridgeline': ['ridgeline'],
  'diverging bar': ['diverging_bar'],
  'dot plot': ['dot'],
  'lollipop': ['lollipop'],
  'dumbbell': ['dumbbell'],
  'dumbbell chart': ['dumbbell'],
  'gantt': ['gantt'],
  'gantt chart': ['gantt'],
  'bump': ['bump'],
  'bump chart': ['bump'],
  'survival': ['survival'],
  'volcano': ['volcano'],
  'manhattan': ['manhattan'],
  'forest': ['forest'],
  'forest plot': ['forest'],
  'word cloud': ['word_cloud'],
  'choropleth': ['choropleth'],
  'mosaic': ['mosaic'],
  'hexbin': ['hexbin'],
  'contour': ['contour'],
};

interface Guide {
  /** The `##` heading the supported-types table sits under. */
  heading: string;
  /** The table column naming the chart, and carrying the mark. */
  column: number;
  /** The fewest body rows the table has, so a truncated one cannot pass. */
  minRows: number;
  /** Where the example headings are, and at which level. */
  examples: { after: string; before: string; level: '##' | '###'; min: number };
  /** Labels this guide means differently, or alone uses. */
  labels: Record<string, string[]>;
}

const GUIDES: Record<string, Guide> = {
  'plotly': {
    heading: '## Supported Chart Types',
    column: 0,
    minRows: 35,
    examples: { after: '## Code Examples', before: '## Dynamic Charts', level: '###', min: 15 },
    labels: {
      'gauge / bullet': ['gauge'],
      'polar area / rose': ['polar_area'],
      'gantt / timeline': ['gantt'],
      'diverging bar / pyramid': ['diverging_bar'],
      'mosaic / marimekko': ['mosaic'],
      'subplots / facets': [],
      'contour plot': ['contour'],
      'mosaic (marimekko)': ['mosaic'],
      'subplots (2x2 grid)': [],
      'facets (plotly express style)': [],
    },
  },
  'd3': {
    heading: '## Supported Chart Types',
    column: 1,
    minRows: 43,
    examples: { after: '## Data Examples by Chart Type', before: '## TypeScript Types', level: '###', min: 35 },
    labels: {
      'cleveland dot plot': ['dot'],
      'funnel / stage chart': ['funnel'],
      'line / multi-line, or a step chart with stepdirection': ['line', 'step'],
      'area / stacked area / 100% stacked area': ['area', 'stacked_area', 'stacked_normalized_area'],
      'bump / rank chart': ['bump'],
      'manhattan plot': ['manhattan'],
      'volcano plot': ['volcano'],
      'error bar / point range': ['error_bar'],
      'forest / meta-analysis': ['forest'],
      'boxen / letter-value': ['boxen'],
      'dumbbell / connected dot': ['dumbbell'],
      'waterfall / bridge': ['waterfall'],
      'ohlc candlestick': ['candlestick'],
      'stacked / dodged / normalized bars': ['stacked_bar', 'dodged_bar', 'stacked_normalized_bar'],
      'diverging bars / population pyramid': ['diverging_bar'],
      'mosaic / marimekko': ['mosaic'],
      'gantt / timeline / swimlane': ['gantt'],
      'gauge / bullet chart': ['gauge'],
      'smooth / regression curve': ['smooth'],
      'pie / doughnut': ['pie'],
      'polar area / coxcomb / rose': ['polar_area'],
      'radar / spider': ['radar'],
      'force-directed network': ['network'],
      'kaplan-meier survival curve': ['survival'],
      'ridgeline / joy plot': ['ridgeline'],
      'hexbin density': ['hexbin'],
      'contour / density field': ['contour'],
      'choropleth map': ['choropleth'],
      // Example headings
      'dot plot, lollipop, and funnel': ['dot', 'lollipop', 'funnel'],
      'line chart (single and multi-line)': ['line'],
      'boxen / letter-value plot': ['boxen'],
      'radar / spider chart': ['radar'],
      'polar area / coxcomb': ['polar_area'],
      'error bars / point range': ['error_bar'],
      'sankey / alluvial / chord': ['sankey', 'alluvial', 'chord'],
    },
  },
  'chartjs': {
    heading: '## Supported Chart Types',
    column: 0,
    minRows: 34,
    examples: { after: '## Code Examples', before: '## Multi-Panel Charts (Axis Stacking)', level: '###', min: 14 },
    labels: {
      'gantt / range bar': ['gantt'],
      'volcano plot': ['volcano'],
      'manhattan plot': ['manhattan'],
      'heatmap (matrix)': ['heat'],
    },
  },
  'highcharts': {
    heading: '## Supported Chart Types',
    column: 0,
    minRows: 49,
    examples: { after: '## Code Examples', before: '## Advanced Usage', level: '###', min: 11 },
    labels: {
      // `pareto` is the cumulative line over a bar chart.
      'line (pareto)': ['line'],
      // `timeline` is a row of named events, read as a scatter.
      'labelled scatter': ['point'],
      'normalized (percent-stacked) bar': ['stacked_normalized_bar'],
    },
  },
  'apexcharts': {
    heading: '## Supported Chart Types',
    column: 0,
    minRows: 22,
    examples: { after: '## Code Examples', before: '## Limitations', level: '###', min: 23 },
    labels: {
      '100% stacked bar': ['stacked_normalized_bar'],
      'bubble': ['point'],
      // A combo chart: the column series become a bar layer, the lines a line layer.
      'mixed (column + line)': ['bar', 'line'],
      'pie / donut': ['pie'],
      'range bar (gantt)': ['gantt'],
      'radial bar (gauge)': ['gauge'],
      // Example headings
      '100% stacked bar chart': ['stacked_normalized_bar'],
      'bubble chart': ['point'],
      'polar area chart': ['polar_area'],
      'pie / donut chart': ['pie'],
      'mixed chart (column + line)': ['bar', 'line'],
    },
  },
  'echarts': {
    heading: '## Supported series types',
    column: 1,
    minRows: 8,
    examples: { after: '## Supported series types', before: '## Highlighting', level: '##', min: 4 },
    labels: {
      'point': ['point'],
      'dodged_bar': ['dodged_bar'],
      'stacked_bar': ['stacked_bar'],
      // A step is a `line` trace carrying `stepDirection`.
      'line + stepdirection': ['line'],
      'single-value charts': ['pie', 'funnel', 'gauge'],
      'grid-value charts': ['heat', 'candlestick', 'box'],
      'hierarchies and graphs': ['treemap', 'sunburst', 'tree', 'sankey', 'network'],
      'theme rivers, parallel coordinates and radars': ['stacked_area', 'parallel_coordinates', 'radar'],
    },
  },
  'vegalite': {
    heading: '## Supported Chart Types',
    column: 2,
    minRows: 26,
    examples: {
      after: '## Code Examples',
      before: '## Multi-panel charts (facet, repeat, concat)',
      level: '###',
      min: 11,
    },
    labels: {
      'dodged (grouped) bar': ['dodged_bar'],
      'normalized stacked bar': ['stacked_normalized_bar'],
      'diverging bar (pyramid, likert)': ['diverging_bar'],
      'gantt (ranged bar)': ['gantt'],
      'waterfall (either orientation)': ['waterfall'],
      'dot plot (vertical & horizontal)': ['dot'],
      'box plot (vertical & horizontal)': ['box'],
      'pie (mark.innerradius makes it a doughnut)': ['pie'],
      'polar area (coxcomb, rose)': ['polar_area'],
      'choropleth map': ['choropleth'],
      'scatter, each point carrying its name': ['point'],
      'absorbed — the names go to the layer it labels': [],
      'normalized (100%) stacked bar chart': ['stacked_normalized_bar'],
    },
  },
  'observable': {
    heading: '## What it reads',
    column: 1,
    minRows: 25,
    examples: { after: '## What it reads', before: '## What it does not read', level: '##', min: 11 },
    labels: {
      '100% stacked bar': ['stacked_normalized_bar'],
      // A strip plot is read as a dot plot, one point per tick.
      'strip plot': ['dot'],
      'scatter carrying z': ['point'],
      'scatter carrying each point\'s name': ['point'],
      'box': ['box'],
      '—': [],
      'subplots': [],
      // Example sections are named after Plot's marks, not charts.
      'hexbins': ['hexbin'],
      'regression lines': ['smooth'],
      '100% stacked charts': ['stacked_normalized_bar', 'stacked_normalized_area'],
      'step curves': ['step'],
      'spike and vector marks': ['point'],
      'link and arrow marks': ['gantt'],
      'rule marks': ['gantt'],
      'waffle charts': ['bar', 'stacked_bar'],
      'text marks': ['point'],
      'box plots': ['box'],
      'trees': ['tree'],
    },
  },
  'amcharts': {
    heading: '## Supported Chart Types',
    column: 0,
    minRows: 41,
    examples: { after: '## Code Examples', before: '## Keyboard Controls', level: '###', min: 20 },
    labels: {
      'funnel / pyramid': ['funnel'],
      'radar / spider': ['radar'],
      'polar area / coxcomb': ['polar_area'],
      'waterfall / bridge': ['waterfall'],
      'dumbbell / barbell': ['dumbbell'],
      'gantt / timeline': ['gantt'],
      'tree (node-link)': ['tree'],
      'circle packing': ['pack'],
      'diverging bar / population pyramid': ['diverging_bar'],
      'dot plot (cleveland)': ['dot'],
      'bump (rank over time)': ['bump'],
      'survival (kaplan-meier)': ['survival'],
      'forest (meta-analysis)': ['forest'],
      'choropleth (renamed fields)': ['choropleth'],
      // Example headings
      'area / stacked area': ['area', 'stacked_area'],
      'radar / polar area': ['radar', 'polar_area'],
      'waterfall / dumbbell': ['waterfall', 'dumbbell'],
      'treemap / icicle / sunburst / tree / pack': ['treemap', 'icicle', 'sunburst', 'tree', 'pack'],
      'dot plot / lollipop': ['dot', 'lollipop'],
      'sankey / alluvial / chord / network': ['sankey', 'alluvial', 'chord', 'network'],
    },
  },
  'anychart': {
    heading: '## Supported Chart Types',
    column: 0,
    minRows: 26,
    examples: { after: '## Code Examples', before: '## Binder Options', level: '###', min: 7 },
    labels: {
      'stacked / normalized area': ['stacked_area', 'stacked_normalized_area'],
    },
  },
  'google-charts': {
    heading: '## Supported Chart Types',
    column: 0,
    minRows: 33,
    examples: {
      after: '## Code Examples',
      before: '## Multi-Panel (Faceted) Figures',
      level: '###',
      min: 7,
    },
    labels: {
      'bubble': ['point'],
      'stepped area': ['area'],
      'stacked stepped area': ['stacked_area'],
      '100% stacked stepped area': ['stacked_normalized_area'],
      'error bars / intervals': ['error_bar'],
      'timeline': ['gantt'],
      'diverging / population pyramid': ['diverging_bar'],
      'choropleth / map': ['choropleth'],
      'survival (kaplan-meier)': ['survival'],
      // One heat-grid layer per calendar year.
      'calendar': ['heat'],
      'line chart (multi-series)': ['line'],
    },
  },
  'frappe': {
    heading: '## Supported Chart Types',
    column: 0,
    minRows: 12,
    examples: { after: '## Code Examples', before: '## Multi-Panel Figures', level: '###', min: 10 },
    labels: {
      'bump (rank over time)': ['bump'],
      'mixed axis (bar + line)': ['bar', 'line'],
      'donut': ['pie'],
      'percentage': ['stacked_normalized_bar'],
      'bump chart (rank over time)': ['bump'],
      'diverging bar chart': ['diverging_bar'],
      'percentage chart': ['stacked_normalized_bar'],
      'mixed axis chart (bar + line)': ['bar', 'line'],
    },
  },
  'recharts': {
    heading: '## Supported Chart Types',
    column: 0,
    minRows: 37,
    examples: {
      after: '## Data Examples by Chart Type',
      before: '## Multi-Panel (Faceted) Charts',
      level: '###',
      min: 30,
    },
    labels: {
      // The `chartType` prop, which is not always the trace type's name.
      'stacked_bar': ['stacked_bar'],
      'dodged_bar': ['dodged_bar'],
      'normalized_bar': ['stacked_normalized_bar'],
      'diverging_bar': ['diverging_bar'],
      'dot': ['dot'],
      'stacked_area': ['stacked_area'],
      'normalized_area': ['stacked_normalized_area'],
      'polar_area': ['polar_area'],
      'error_bar': ['error_bar'],
      'parallel': ['parallel_coordinates'],
      'boxen': ['boxen'],
      // Example headings
      'dot plot and lollipop chart': ['dot', 'lollipop'],
      'stacked and 100% stacked area': ['stacked_area', 'stacked_normalized_area'],
      'polar area (coxcomb) chart': ['polar_area'],
      'survival curve': ['survival'],
      'volcano and manhattan plots': ['volcano', 'manhattan'],
      'alluvial and sankey diagrams': ['alluvial', 'sankey'],
      'diverging bar chart (population pyramid)': ['diverging_bar'],
      'treemap, sunburst and icicle': ['treemap', 'sunburst', 'icicle'],
      'ridgeline (joy) plot': ['ridgeline'],
      'boxen (letter-value) plot': ['boxen'],
      'composed chart (bar + line)': ['bar', 'line'],
    },
  },
};

/** One labelled thing in a guide that may carry the mark. */
interface Entry {
  guide: string;
  where: 'table' | 'heading';
  /** The text as written, mark included. */
  text: string;
}

function read(guide: string): string {
  return readFileSync(resolve(__dirname, `../../docs/${guide}.md`), 'utf8');
}

/** A table row's cells, honouring `\|` inside a cell. */
function cells(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim());
}

/** The label cell of each body row of the first table under the guide's heading. */
function tableLabels(guide: string): string[] {
  const { heading, column } = GUIDES[guide];
  const lines = read(guide).split('\n');
  const start = lines.indexOf(heading);
  if (start < 0)
    return [];
  const first = lines.findIndex((line, i) => i > start && line.startsWith('|'));
  if (first < 0)
    return [];
  const rows: string[] = [];
  for (let i = first + 2; i < lines.length && lines[i].startsWith('|'); i++)
    rows.push(cells(lines[i])[column]);
  return rows;
}

/** The example headings, without their `#`s. */
function exampleHeadings(guide: string): string[] {
  const { after, before, level } = GUIDES[guide].examples;
  const lines = read(guide).split('\n');
  const start = lines.indexOf(after);
  const end = lines.indexOf(before);
  if (start < 0 || end < start)
    return [];
  return lines
    .slice(start + 1, end)
    .filter(line => line.startsWith(`${level} `))
    .map(line => line.slice(level.length + 1));
}

function entries(): Entry[] {
  return Object.keys(GUIDES).flatMap(guide => [
    ...tableLabels(guide).map(text => ({ guide, where: 'table' as const, text })),
    ...exampleHeadings(guide).map(text => ({ guide, where: 'heading' as const, text })),
  ]);
}

/** The label a map is keyed by: no mark, no code quoting, lower case. */
function key(text: string): string {
  return text.replace(MARK, '').replace(/`/g, '').trim().replace(/^'(.*)'$/, '$1').toLowerCase();
}

/** The types an entry covers, or `undefined` when no map knows it. */
function typesOf(entry: Entry): string[] | undefined {
  const label = key(entry.text);
  return GUIDES[entry.guide].labels[label] ?? VOCABULARY[label];
}

function describeEntry(entry: Entry): string {
  return `docs/${entry.guide}.md ${entry.where}: "${entry.text}"`;
}

/** The experimental list in `docs/SCHEMA.md`. */
function experimentalTypes(): Set<string> {
  const start = SCHEMA.indexOf('### Experimental\n');
  const rest = SCHEMA.slice(start + '### Experimental\n'.length);
  return new Set(typesInBackticks(rest.slice(0, rest.indexOf('\n#'))));
}

describe('integration guides\' experimental marks', () => {
  test.each(Object.keys(GUIDES))('finds the whole supported-types table in docs/%s.md', (guide) => {
    const rows = tableLabels(guide);

    expect(rows.length).toBeGreaterThanOrEqual(GUIDES[guide].minRows);
  });

  test.each(Object.keys(GUIDES))('finds the example headings in docs/%s.md', (guide) => {
    const headings = exampleHeadings(guide);

    expect(headings.length).toBeGreaterThanOrEqual(GUIDES[guide].examples.min);
  });

  test('knows which types every row and example heading covers', () => {
    const unknown = entries().filter(entry => typesOf(entry) === undefined).map(describeEntry);

    expect(unknown).toEqual([]);
  });

  test('names only declarable types', () => {
    const declarable = new Set(declarableTypes());
    const mapped = [
      ...Object.values(VOCABULARY),
      ...Object.values(GUIDES).flatMap(guide => Object.values(guide.labels)),
    ].flat();

    const stray = mapped.filter(type => !declarable.has(type));

    expect(stray).toEqual([]);
  });

  test('marks a row or heading exactly when every type it covers is experimental', () => {
    const experimental = experimentalTypes();

    const wrong = entries().filter((entry) => {
      const types = typesOf(entry) ?? [];
      const expected = types.length > 0 && types.every(type => experimental.has(type));
      return entry.text.endsWith(MARK) !== expected;
    }).map(describeEntry);

    expect(wrong).toEqual([]);
  });
});
