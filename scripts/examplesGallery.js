/**
 * The examples gallery on `examples.html`, derived from `examples/`.
 *
 * It used to be a hand-written list of `loadHTML(...)` calls inside
 * `scripts/build-site.js`. That list named 88 pages while the directory held
 * 199, so 127 examples — most of the chart types added since — shipped with the
 * site and were reachable from nothing on it. A page nobody can open documents
 * nothing, and the drift was silent: adding an example never touched the list.
 *
 * So the list is read off the directory instead. Adding `examples/foo.html` now
 * adds a gallery entry, and the only way to keep a page out is to name it in
 * {@link EXCLUDED_EXAMPLES} with a reason.
 * `test/scripts/examplesGallery.esm-test.ts` fails if any page is in neither.
 *
 * Plain JS with hand-written declarations beside it, the same arrangement as
 * `scripts/testArgs.js` — `scripts/build-site.js` is run directly by node, and
 * `tsconfig.json` sets `allowJs: false`, so a `.ts` module could not be
 * imported there and a `.js` one cannot be typed without the `.d.ts`.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Pages under `examples/` that are deliberately not gallery entries.
 *
 * Every exclusion is written down rather than filtered out by a pattern,
 * because a pattern quietly widens: the point of generating the list is that a
 * page cannot go missing by accident, and a silent skip puts that back.
 */
export const EXCLUDED_EXAMPLES = [
  {
    page: 'react-app/index.html',
    reason:
      'Vite entry point, not a page. It loads ./main.tsx and renders nothing '
      + 'until bundled; `npm run build:react-example` emits the runnable page at '
      + 'examples/react/index.html, which the React group links.',
  },
  {
    page: 'recharts/index.html',
    reason:
      'Vite entry point, not a page. `npm run build:recharts-example` bundles it '
      + 'into a single file that build-site.js copies over this path in _site; the '
      + 'Recharts group links that build.',
  },
  {
    page: 'victory/index.html',
    reason:
      'Vite entry point, not a page. `npm run build:victory-example` bundles it '
      + 'into a single file that build-site.js copies over this path in _site; the '
      + 'Victory group links that build.',
  },
];

/**
 * Chart vocabulary shared by every integration, keyed by the filename stem
 * left after a group's prefix is stripped.
 *
 * One map rather than one per group: `plotly-bar.html`, `d3-bindbar.html`,
 * `anychart/bar.html` and `highcharts-bar.html` all want to read "Bar Chart",
 * and the old hand-written list said exactly that for each of them.
 */
export const CHART_TITLES = {
  'area': 'Area Chart',
  'bar': 'Bar Chart',
  'bar-diverging': 'Diverging Bar',
  'bar-dodged': 'Dodged Bar',
  'bar-stacked': 'Stacked Bar',
  'box': 'Box Plot',
  'boxen': 'Letter-Value Plot (boxen)',
  'boxplot': 'Box Plot',
  'bump': 'Bump Chart',
  'candlestick': 'Candlestick',
  'chord': 'Chord Diagram',
  'choropleth': 'Choropleth Map',
  'contour': 'Contour Plot',
  'diverging': 'Diverging Bar',
  'dodged': 'Dodged Bar',
  'dot': 'Dot Plot',
  'dotplot': 'Dot Plot',
  'dumbbell': 'Dumbbell Plot',
  'errorbar': 'Error Bars',
  'errorbar-grouped': 'Error Bars, grouped',
  'facet-bar': 'Faceted Bar Chart',
  'facets': 'Faceted Charts',
  'forest': 'Forest Plot',
  'funnel': 'Funnel Chart',
  'gantt': 'Gantt Chart',
  'gauge': 'Gauge',
  'grouped-bar': 'Grouped Bar',
  'heatmap': 'Heatmap',
  'hexbin': 'Hexbin Plot',
  'histogram': 'Histogram',
  'icicle': 'Icicle Chart',
  'line': 'Line Chart',
  'lollipop': 'Lollipop Chart',
  'manhattan': 'Manhattan Plot',
  'mosaic': 'Mosaic Plot',
  'multiline': 'Multi-Line Chart',
  'multipanel': 'Multi-Panel Figure',
  'network': 'Network Graph',
  'normalized': 'Normalized Bar',
  'parallel': 'Parallel Coordinates',
  'pie': 'Pie Chart',
  'pyramid': 'Population Pyramid',
  'radar': 'Radar Chart',
  'ridgeline': 'Ridgeline Plot',
  'sankey': 'Sankey Diagram',
  'scatter': 'Scatter Plot',
  'smooth': 'Smooth Curve',
  'stacked': 'Stacked Bar',
  'stacked-bar': 'Stacked Bar',
  'step': 'Step Plot',
  'subplots': 'Subplots',
  'sunburst': 'Sunburst Chart',
  'survival': 'Survival Curve',
  'treemap': 'Treemap',
  'violin': 'Violin Plot',
  'volcano': 'Volcano Plot',
  'waterfall': 'Waterfall Chart',
  'wordcloud': 'Word Cloud',
};

/**
 * Per-page titles, for the pages the shared vocabulary cannot name.
 *
 * Every title the hand-written gallery carried is here, so generating the list
 * did not cost the wording someone chose for it. A string is the link text, and
 * the iframe heading is the group's prefix plus that text; an object sets the
 * two independently, which is what the pages whose heading is not simply
 * "<integration> <link text>" need.
 */
export const TITLES = {
  // Hand-authored MAIDR JSON pages: titles carried over from the old list.
  'barplot.html': 'Barplot',
  'candlestick_multilayer.html': 'Candlestick multilayer',
  'dodged_barplot.html': 'Dodged Barplot',
  'facet_barplot.html': 'Faceted Bar plots',
  'heatmap.html': 'Heatmap',
  'histogram.html': 'Histogram',
  'horizontal-boxplot.html': 'Horizontal box plot',
  'lineplot.html': 'Single Line plot',
  'multilayer_plot.html': 'Multi layered plot',
  'multiline_plot.html': 'Multi line plot',
  'multipanel.html': 'Multi panel plot',
  'scatter_plot.html': 'Scatter plot',
  'smooth_plot.html': 'Smooth plot',
  'stacked_bar.html': 'Stacked Bar plot',
  'stepplot.html': 'Step plot (hypnogram)',
  'vertical-boxplot.html': 'Vertical box plot',
  'vertical-candlestick.html': 'Vertical candle stick plot',
  'violin.html': 'Violin plot',

  'live-candlestick.html': 'Live candlestick feed',
  'live-coinbase.html': 'Live Coinbase feed',
  'live-line.html': 'Live line feed',
  'multiline_plot_intersection.html': 'Multi line plot with intersecting lines',

  // `examples/` holds seven charts twice, under a hyphenated and an
  // underscored filename, and the old gallery listed only one of each pair.
  // Both are reachable now, so both need a name of their own: two links
  // reading "Dodged Barplot" are indistinguishable to anyone who hears the
  // link text rather than seeing which file it points at.
  'boxplot-horizontal.html': 'Horizontal box plot, second example',
  'boxplot-vertical.html': 'Vertical box plot, second example',
  'dodged-barplot.html': 'Dodged Barplot, second example',
  'multi-lineplot.html': 'Multi line plot, second example',
  'multi-panel.html': 'Multi panel plot, second example',
  'smoothplot.html': 'Smooth plot, second example',
  'stacked-barplot.html': 'Stacked Bar plot, second example',

  // Integration pages whose heading is not "<integration> <link text>".
  'amcharts.html': {
    label: 'amCharts 5 Examples (Bar, Dodged, Stacked, Normalized, Line, Histogram, Heatmap)',
    heading: 'amCharts 5 Examples',
  },
  'google-charts.html': {
    label: 'Google Charts Examples (Bar, Line, Scatter, Stacked, Dodged, Candlestick)',
    heading: 'Google Charts Examples',
  },
  'observable-plain.html': {
    label: 'Plain page &mdash; bar, scatter, stacked bar, and a chart redrawn on demand',
    heading: 'Observable Plot on a plain page',
  },
  'observable-quarto.html': {
    label: 'Quarto OJS cells (bar, scatter, line, histogram, facets)',
    heading: 'Observable Plot in a Quarto document',
  },

  // Pages holding several charts, or one the shared vocabulary would name
  // wrongly. Each label follows the page's own heading.
  'amcharts-declared.html': 'Declared Traces (no SVG scraping)',
  'amcharts-floating-columns.html': 'Floating-Column Charts',
  'amcharts-flow.html': 'Flow and Network',
  'amcharts-marks.html': 'Pyramid, Dot Plot and Lollipop',
  'anychart-bindable.html': 'Bar Chart (bound with bindAnyChart)',
  'chartjs/heatmap.html': 'Heatmap (Matrix)',
  'chartjs/line-stacked-panels.html': 'Stacked Axis Panels',
  'frappe-mixed.html': 'Mixed Axis (Bar + Line)',
  'frappe-pie.html': 'Pie / Donut',
  'google-charts-gauge-map.html': 'Gauges and Maps',
  'google-charts-marks.html': 'Dot, Lollipop, Funnel, Diverging and Waterfall',
  'google-charts-relational.html': 'Flows, Hierarchies and Schedules',
  'google-charts-statistical.html': 'Statistical and Relational Readings',
  'highcharts-grid.html': 'Small Multiples (2×2 Grid)',
  'highcharts-panes.html': 'Multi-Pane Chart (Price + Volume)',
  'plotly-subplots.html': 'Subplots (2×2 Grid)',
  'vegalite-bindbox-horizontal.html': 'Box Plot (horizontal)',
  'vegalite-hconcat-box.html': 'Box Plots side by side (hconcat)',
};

/** Words the de-slugified fallback should not simply capitalise. */
const WORDS = {
  d3: 'D3',
  js: 'JS',
  kde: 'KDE',
  ohlc: 'OHLC',
};

/**
 * The gallery's sections, in the order they appear on the page.
 *
 * The grouping is the one the hand-written list already had — by integration —
 * and it is kept because it is how someone arrives at the gallery: they know
 * which charting library they use, not which chart type MAIDR calls what. What
 * changed is only that membership is now decided by the filename rather than by
 * remembering to add a line.
 *
 * Order matters: `groupFor` returns the first group whose `dir`, `names` or
 * `prefixes` match, so a new prefix that is a substring of an earlier one would
 * quietly claim that group's pages rather than erroring. The prefixes here are
 * distinct today (`amcharts-` and `anychart-` share only `a`), but a prefix
 * added below an existing one it extends needs to go above it instead.
 */
export const GROUPS = [
  {
    id: 'react',
    heading: 'React',
    headingId: 'react-examples',
    statics: [{ onclick: 'loadReact()', label: 'React Examples (Bar, Line, Smooth, D3 Bar, D3 Scatter)' }],
    note: 'See the <a href="react.html">React Integration Guide</a> for setup instructions, TypeScript types, and code examples for all plot types. The D3 examples show how to use <a href="d3.html">the D3 adapter</a> with the <code>&lt;MaidrD3&gt;</code> wrapper.',
  },
  {
    id: 'html',
    heading: 'HTML / Vanilla JS',
    // The fallback: a page matching no integration prefix is a hand-authored
    // page carrying its MAIDR JSON inline, which is what this group is.
    fallback: true,
  },
  {
    id: 'plotly',
    heading: 'Plotly.js',
    prefixes: ['plotly-'],
    headingPrefix: 'Plotly',
    note: 'See the <a href="plotly.html">Plotly.js Integration Guide</a> for setup instructions and code examples for all chart types.',
  },
  {
    id: 'recharts',
    heading: 'Recharts',
    statics: [{ onclick: 'loadRecharts()', label: 'Recharts Examples (Bar, Line, Scatter, Stacked, Histogram)' }],
    note: 'See the <a href="recharts.html">Recharts Integration Guide</a> for setup instructions, TypeScript types, and code examples for all chart types.',
  },
  {
    id: 'google-charts',
    heading: 'Google Charts',
    prefixes: ['google-charts-'],
    names: ['google-charts'],
    headingPrefix: 'Google Charts',
    note: 'See the <a href="google-charts.html">Google Charts Integration Guide</a> for setup instructions and code examples for all chart types.',
  },
  {
    id: 'chartjs',
    heading: 'Chart.js',
    dir: 'chartjs',
    headingPrefix: 'Chart.js',
    note: 'See the <a href="chartjs.html">Chart.js Integration Guide</a> for setup instructions and code examples for all chart types.',
  },
  {
    id: 'observable',
    heading: 'Observable Plot &amp; Quarto',
    prefixes: ['observable-'],
    headingPrefix: 'Observable',
    note: 'The two differ only in how the scripts reach the page &mdash; the adapter is the same and neither asks you to change the code that draws the chart. See the <a href="observable.html">Observable Plot &amp; Quarto Integration Guide</a> for both, including the Quarto extension.',
  },
  {
    id: 'frappe',
    heading: 'Frappe Charts',
    prefixes: ['frappe-'],
    headingPrefix: 'Frappe',
    note: 'See the <a href="frappe.html">Frappe Charts Integration Guide</a> for setup instructions and code examples for all chart types.',
  },
  {
    id: 'd3',
    heading: 'D3.js',
    // No hyphen after the prefix: the pages are named `d3-bindbar.html`, and
    // `bind` is the adapter's verb rather than part of the chart's name.
    prefixes: ['d3-bind'],
    headingPrefix: 'D3',
    note: 'See the <a href="d3.html">D3.js Integration Guide</a> for setup instructions, TypeScript types, and code examples for all chart types.',
  },
  {
    id: 'vegalite',
    heading: 'Vega-Lite',
    prefixes: ['vegalite-'],
    // Same `bind` verb as the D3 pages, but here it follows the group prefix.
    strip: /^bind/,
    headingPrefix: 'Vega-Lite',
    note: 'See the <a href="vegalite.html">Vega-Lite Integration Guide</a> for setup instructions and code examples for all chart types.',
  },
  {
    id: 'amcharts',
    heading: 'amCharts 5',
    prefixes: ['amcharts-'],
    names: ['amcharts'],
    headingPrefix: 'amCharts 5',
    note: 'See the <a href="amcharts.html">amCharts 5 Integration Guide</a> for setup instructions and code examples for all chart types.',
  },
  {
    id: 'victory',
    heading: 'Victory',
    statics: [{ onclick: 'loadVictory()', label: 'Victory Examples (Bar, Line, Scatter, Stacked, Histogram, Box, Candlestick)' }],
    note: 'See the <a href="victory.html">Victory Integration Guide</a> for setup instructions, TypeScript types, and code examples for all chart types.',
  },
  {
    id: 'anychart',
    heading: 'AnyChart',
    prefixes: ['anychart-'],
    dir: 'anychart',
    headingPrefix: 'AnyChart',
    note: 'See the <a href="anychart.html">AnyChart Integration Guide</a> for setup instructions and code examples for all chart types.',
  },
  {
    id: 'highcharts',
    heading: 'Highcharts',
    prefixes: ['highcharts-'],
    headingPrefix: 'Highcharts',
    note: 'See the <a href="highcharts.html">Highcharts Integration Guide</a> for setup instructions and code examples for all chart types.',
  },
];

/**
 * Directories under `examples/` holding build output rather than source pages.
 *
 * `examples/react/` is written by `npm run build:react-example` and is
 * gitignored, so it is there after a build and not on a fresh checkout. Listing
 * it would make the gallery depend on whether anyone had run a build, which is
 * the one thing a generated list must not do. Nothing is lost by skipping it:
 * the React group's entry loads `examples/react/index.html` already.
 */
const BUILD_OUTPUT_DIRS = new Set(['react', 'dist', 'node_modules']);

/**
 * Every page under `examples/` that could be a gallery entry.
 *
 * Two levels deep, which is as deep as an example page goes: the top level
 * holds the hand-authored and prefixed pages, and one subdirectory per
 * integration holds the rest. Anything deeper is build output —
 * `examples/recharts/dist/index.html` and friends — and is not a source page.
 */
export function listExamplePages(examplesDir) {
  const pages = [];

  for (const entry of fs.readdirSync(examplesDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.html')) {
      pages.push(entry.name);
      continue;
    }
    if (!entry.isDirectory() || BUILD_OUTPUT_DIRS.has(entry.name)) {
      continue;
    }
    const nested = fs.readdirSync(path.join(examplesDir, entry.name), { withFileTypes: true });
    for (const file of nested) {
      if (file.isFile() && file.name.endsWith('.html')) {
        pages.push(`${entry.name}/${file.name}`);
      }
    }
  }

  return pages.sort();
}

/** The group a page belongs to, by filename. */
function groupFor(page) {
  const slash = page.indexOf('/');
  const dir = slash === -1 ? null : page.slice(0, slash);
  const stem = path.posix.basename(page, '.html').toLowerCase();

  for (const group of GROUPS) {
    if (dir !== null) {
      if (group.dir === dir) {
        return group;
      }
      continue;
    }
    if (group.names?.includes(stem)) {
      return group;
    }
    if (group.prefixes?.some(prefix => stem.startsWith(prefix))) {
      return group;
    }
  }

  // A nested page in a directory no group claims would otherwise land in the
  // hand-authored group and read as one, so it is left unmatched and the test
  // reports it rather than the gallery mislabelling it.
  return dir === null ? GROUPS.find(group => group.fallback) : undefined;
}

/** The part of a filename that names the chart, with the group's prefix gone. */
function chartStem(page, group) {
  let stem = path.posix.basename(page, '.html').toLowerCase().replace(/_/g, '-');

  const prefix = group.prefixes?.find(candidate => stem.startsWith(candidate));
  if (prefix) {
    stem = stem.slice(prefix.length);
  }
  if (group.strip) {
    stem = stem.replace(group.strip, '');
  }

  return stem;
}

/** Turn a filename stem into words: `bindbox-horizontal` → `Bindbox Horizontal`. */
function deslugify(stem) {
  return stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => WORDS[word] ?? word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/** The link text and iframe heading for one page. */
function titleFor(page, group) {
  const override = TITLES[page];
  if (typeof override === 'object') {
    return { label: override.label, heading: override.heading };
  }

  const stem = chartStem(page, group);
  const label = override ?? CHART_TITLES[stem] ?? deslugify(stem);
  const heading = group.headingPrefix ? `${group.headingPrefix} ${label}` : label;

  return { label, heading };
}

/**
 * Give two entries in one section that ended up with the same link text their
 * filenames back, because two links reading "Dodged Barplot" and going to
 * different pages leave a screen reader user no way to tell them apart — the
 * link text is the whole of what is announced. `examples/` holds several pages
 * that draw the same chart under a second filename, so this is not theoretical.
 */
function disambiguate(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
  }

  for (const item of items) {
    if (item.page && counts.get(item.label) > 1) {
      const stem = path.posix.basename(item.page, '.html');
      item.heading = `${item.heading} (${stem})`;
      item.label = `${item.label} (${stem})`;
    }
  }

  return items;
}

/**
 * Sort the gallery's sections and their entries.
 *
 * Alphabetical by link text within a section. The hand-written list was ordered
 * by whatever each contributor appended, which was survivable at 88 entries and
 * is not at 240 — the point of a gallery is that you can find the chart you
 * came for.
 */
function byLabel(a, b) {
  if (a.label === b.label) {
    return (a.page ?? '') < (b.page ?? '') ? -1 : 1;
  }
  return a.label.toLowerCase() < b.label.toLowerCase() ? -1 : 1;
}

/**
 * Build the gallery's sections from a list of example pages.
 *
 * Takes the pages rather than reading them so the shape can be checked against
 * a list the test writes.
 */
export function buildGallery(pages) {
  const excluded = new Set(EXCLUDED_EXAMPLES.map(entry => entry.page));
  const items = new Map(GROUPS.map(group => [group.id, []]));
  const unclaimed = [];

  for (const page of pages) {
    if (excluded.has(page)) {
      continue;
    }
    const group = groupFor(page);
    if (!group) {
      unclaimed.push(page);
      continue;
    }
    items.get(group.id).push({ page, ...titleFor(page, group) });
  }

  const sections = GROUPS.map(group => ({
    id: group.id,
    heading: group.heading,
    headingId: group.headingId,
    note: group.note,
    items: [
      ...(group.statics ?? []).map(item => ({ ...item, heading: item.label })),
      ...disambiguate(items.get(group.id)).sort(byLabel),
    ],
  }));

  return { sections, unclaimed };
}

/** Escape a string for use inside a double-quoted HTML attribute. */
function attr(value) {
  return value.replace(/"/g, '&quot;');
}

/** Escape a string for use inside a single-quoted JavaScript literal. */
function js(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
}

/** One `<li>`: the same markup and the same `loadHTML` call as before. */
function renderItem(item) {
  const onclick = item.onclick ?? `loadHTML('${js(item.page)}', '${js(item.heading)}')`;
  return `    <li><a href="#" onclick="${attr(onclick)}; return false;">${item.label}</a></li>`;
}

/** The gallery's markup, for `scripts/build-site.js` to drop into the page. */
export function renderGallery(sections) {
  return sections
    .filter(section => section.items.length > 0)
    .map((section) => {
      const id = section.headingId ? ` id="${section.headingId}"` : '';
      const note = section.note ? `\n  <p>${section.note}</p>` : '';
      return [
        `  <h3${id}>${section.heading}</h3>`,
        '  <ul>',
        section.items.map(renderItem).join('\n'),
        '  </ul>',
      ].join('\n') + note;
    })
    .join('\n\n');
}
