# AnyChart Integration

MAIDR makes [AnyChart](https://www.anychart.com/) charts accessible through audio sonification, text descriptions, braille output, and keyboard navigation. The adapter exposes a one-line binder you call **after** the chart has been drawn.

## Quick Start

Load AnyChart, MAIDR's core runtime, and the AnyChart adapter, then call `bindAnyChart()`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My AnyChart Chart</title>
    <!-- 1. Load AnyChart -->
    <script src="https://cdn.anychart.com/releases/8.13.0/js/anychart-base.min.js"></script>
    <!-- 2. Load the MAIDR core runtime -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
  </head>
  <body>
    <div id="container" style="width: 700px; height: 500px"></div>

    <!-- 3. Load the AnyChart adapter and bind your chart -->
    <script type="module">
      import { bindAnyChart } from 'https://cdn.jsdelivr.net/npm/maidr/dist/anychart.mjs';

      document.addEventListener('DOMContentLoaded', () => {
        const chart = anychart.bar([
          ['Mon', 20], ['Tue', 14], ['Wed', 23], ['Thu', 25], ['Fri', 22],
        ]);
        chart.title('Tips by Day');
        chart.xAxis().title('Day');
        chart.yAxis().title('Count');
        chart.container('container').draw();

        // One line — extracts data, sets maidr-data, fires init event.
        bindAnyChart(chart, {
          id: 'tips-by-day',
          title: 'Tips by Day',
          axes: { x: 'Day', y: 'Count' },
        });
      });
    </script>
  </body>
</html>
```

Once the page loads, click on the chart (or Tab to it) and MAIDR activates with:

- **Audio sonification** — tones representing data values
- **Text descriptions** — spoken via screen readers
- **Braille output** — refreshable braille display support
- **Keyboard navigation** — arrow keys to move between data points

## How It Works

The adapter is a small wrapper around AnyChart's public API:

1. **Inspection** — walks the chart's series via `chart.getSeriesCount()` / `chart.getSeriesAt(i)` to identify series types
2. **Extraction** — iterates each series with `series.getIterator()` and converts the rows into MAIDR's accessibility schema
3. **Binding** — writes a `maidr-data` attribute onto the chart container and dispatches the `maidr:bindchart` event so MAIDR initializes the chart

AnyChart must be loaded separately — the adapter does not bundle the AnyChart library. Always call `bindAnyChart()` **after** `chart.draw()`; the series data and SVG container only become available once the chart is rendered.

## Supported Chart Types

| MAIDR Type | AnyChart Series / Chart | Example |
|-----------|----------------|---------|
| Bar | `bar`, `column` | [Bar chart](examples.html) |
| Line | `line`, `spline` | [Line chart](examples.html) |
| Area | `area`, `spline-area` | [Area chart](examples.html) |
| Stacked / Normalized Area | the same, with `yScale().stackMode('value' \| 'percent')` | [Area chart](examples.html) |
| Step | `step-line`, `step-area` | [Step plot](examples.html) |
| Scatter | `scatter`, `marker`, `bubble` | [Scatter plot](examples.html) |
| Dot Plot | `marker`, on a chart whose x scale is ordinal | [Dot plot](examples.html) |
| Lollipop | `stick` | [Lollipop chart](examples.html) |
| Dumbbell | `range-column`, `range-bar` | [Dumbbell chart](examples.html) |
| Diverging Bar | two or more `bar` / `column` series, with `diverging: true` | [Diverging bars](examples.html) |
| Box Plot | `box` | [Box plot](examples.html) |
| Heatmap | `heatmap`, `heat` | [Heatmap](examples.html) |
| Candlestick | `candlestick`, `ohlc` | [Candlestick](examples.html) |
| Pie | `pie` (a doughnut is a pie with `innerRadius()`) | [Pie chart](examples.html) |
| Funnel | `anychart.funnel()`, `anychart.pyramid()` | [Funnel chart](examples.html) |
| Word Cloud | `anychart.tagCloud()` | [Tag cloud](examples.html) |
| Sankey | `anychart.sankey()` | [Sankey diagram](examples.html) |
| Waterfall | `anychart.waterfall()` | [Waterfall chart](examples.html) |
| Radar | `anychart.radar()`, and a polar `line` / `marker` series | [Radar chart](examples.html) |
| Polar Area | `anychart.polar()` with a `column` / `area` series | [Radar chart](examples.html) |
| Mosaic | `anychart.mekko()`, `anychart.mosaic()`, `anychart.barmekko()` | [Marimekko chart](examples.html) |
| Choropleth | a `choropleth` series on `anychart.map()` | [Choropleth map](examples.html) |
| Gantt | `anychart.ganttProject()`, `anychart.ganttResource()` | [Gantt chart](examples.html) |

`step-area` is the one series that still loses its fill: MAIDR has no stepped area trace, so it keeps its staircase and maps to a step trace. A console warning is emitted when that downgrade occurs.

**Notes on chart-type detection:**

- **Step** series (`step-line`, `step-area`) are piecewise constant — the value is held and then jumps — so they map to MAIDR's step trace rather than to a line, and are announced and navigated as step plots. AnyChart does not expose which step convention a series was drawn with, so the adapter emits no `stepDirection` and MAIDR's description does not name one.

- **Heatmap** charts use AnyChart's separate `anychart-heatmap.min.js` module and expose a chart-level data API (no `getSeriesCount()`). The adapter detects them via `chart.getType()` returning `'heatmap'` or `'heat'`, with a defensive fallback when `getType()` is unavailable.
- **Candlestick** support also covers OHLC series. Both come from AnyChart's financial / stock module (`anychart-stock.min.js`). Each row is `[x, open, high, low, close]`; outlier and volume fields are not extracted by AnyChart's iterator API.
- **Area** series are read as the filled bands they are drawn as, rather than downgraded to lines. Whether the bands are stacked is a property of the chart's y **scale**, not of any series — AnyChart reports every one of them as `area` either way — so the adapter reads `chart.yScale().stackMode()` once per chart: `'value'` promotes them to a stacked area, `'percent'` to a normalized one. A stacked chart's bands are merged into **one** layer, because the running total a stacked area draws is only computable across the whole set; each band still carries its own value, never the accumulated edge.

- **Pie** charts are the other single-dataset type: like the heatmap they hold their data on `chart.data()` rather than on a series, and `getType()` reports `'pie'` for a doughnut too (AnyChart draws one by giving an ordinary pie an inner radius), so both read identically. A pie is bound to no axis, so its axis labels fall back to `Label` and `Value` unless `options.axes` names them. Slices with no numeric value are dropped — AnyChart draws no wedge for one, and keeping it would slide every later slice's highlight onto its neighbour.

- **Funnel** and **pyramid** charts come from AnyChart's `anychart-pyramid-funnel.min.js` module and are the same single-dataset shape as a pie. `getType()` reports `'funnel'` or `'pyramid'`, and both are read as a funnel — only which end tapers differs. Their default data mapping is `name` / `value` rather than the pie's `x` / `value`. Axis labels fall back to `Stage` and `Count`. MAIDR sonifies the **retention** from the previous stage rather than the raw count, because that ratio is what a funnel is read for and what a listener cannot compute by ear.
- **Sankey** diagrams come from `anychart-sankey.min.js` and are single-dataset too: `getType()` reports `'sankey'` and the flows live on `chart.data()` as `from` / `to` / `weight` rows. Only the edges are emitted — a flow names both of its ends, so MAIDR derives the nodes and their columns from the edges exactly as the chart does. A row whose `to` is absent is AnyChart's "dropoff", drawn as a ribbon leaving the node and going nowhere; it names no target, so it is not a flow. Axis labels fall back to `Node` and `Flow`.

- **Waterfall** charts come from `anychart-waterfall.min.js`. `WaterfallPoint` fixes `start` and `end` as absolute positions on the value axis, so the adapter accumulates the running total itself and honours `chart.dataMode()`: in AnyChart's default `'diff'` mode a row's `value` is the step's contribution, and in `'absolute'` mode it is the total the step arrives at. A row marked `isTotal` restates the running total rather than changing it, and the first step is read as a total too — nothing is carried into it. A waterfall drawn from several series stacks them within each category, so the series are summed into **one** bridge: that is what the chart draws, and there is no series dimension in the reading to spend the breakdown on.

- **Marimekko** charts (`anychart-mekko.min.js`) are stacked columns whose WIDTHS carry data too, and the width is the one number the rows do not hold — AnyChart derives it from the table, so the adapter does the same: each column's total over the grand total, carried on every cell of the column as the grammar requires. All of the chart's `mekko` series are merged into **one** layer, because a column's width is only computable across the whole set. `count` is deliberately not emitted: a marimekko is usually drawn from a contingency table, but AnyChart accepts any measure, and declaring one would announce "Count" for a chart of revenue.

- **Radar** and **polar** charts are the one family that cannot be recognised from a series at all. Their series report `seriesType()` as plain `'line'`, `'area'`, `'marker'` or `'column'`, so without the chart-level check a radar reads as an ordinary line chart — a mis-description rather than a gap. The adapter therefore asks `chart.getType()`: everything on a radar is read as a radar, and on a polar chart the wedge-drawn series (`column`, `area`, `polygon`) become a polar area while its lines and markers stay a radar. Both share MAIDR's radar trace and the same points; what changes is the announcement and the panning, which follows each spoke's angle around the circle. A polar `rangeColumn` series is skipped: its rows carry `low` / `high` and no `value`.

- **Dot plots** are the one reading a series cannot declare. A Cleveland dot plot is a `marker` series — the same series a scatter draws — and what separates the two is the scale beneath it: AnyChart gives a Cartesian chart an ordinal x scale and a scatter chart a linear one. So the adapter reads `chart.xScale().getType()` once per chart and promotes a `marker` series to a dot plot when it answers `'ordinal'`. Both are announced and navigated as bar charts are; the mark differs, and what a reader navigates does not. A `bubble` series is deliberately left alone: its rows carry a size, and a dot plot has nowhere to put one.

- **Lollipop** charts are AnyChart's `stick` series: a stroke from the baseline to the value. The adapter enables the series' markers, which is both what gives the chart its dots and the only element per point it can highlight — a stick is a tall thin stroke, and the geometric filter that finds line and scatter markers rejects it for exactly that shape.

- **Dumbbell** charts come from the `range-column` and `range-bar` series, whose rows carry `low` / `high` rather than `value`. AnyChart draws the pair as one floating bar rather than as two dots joined by a segment, so the mark is not the one the trace type is named after — but the reading is: two values per category, with the gap between them announced alongside each end. The ends are named `Low` and `High`, AnyChart's own names for the fields, because a range series records which value is the smaller and never what the pair is a comparison **of**; a caller who has better names sets `startLabel` / `endLabel` on the emitted layer. A row missing either end is dropped, since AnyChart draws no bar for one. The `hilo` series carries the same two fields and is **not** read: it is drawn as a bare stroke, which no lookup here can tell from a grid line, so it would announce correctly and never highlight.

- **Diverging bars** — a tornado chart, or a population pyramid — are **opt-in** via `bindAnyChart(chart, { diverging: true })`. AnyChart has no diverging chart type: the idiom is a stacked `anychart.bar()` whose two series straddle zero, and nothing distinguishes that from a stacked bar chart that happens to contain negative values. Guessing would not merely rename an ordinary chart — a diverging trace replaces the sign in every announcement with the name of a side, which is the one clue a reader would have that the reading was wrong. When declared, every bar series is merged into **one** layer, because the balance MAIDR announces is a difference read down a column of one grid; the values are emitted signed, exactly as the chart draws them, and each side is named by its series. A chart with fewer than two bar series keeps its ordinary bar layers and says why.

- **Tag clouds** come from `anychart-tag-cloud.min.js` and report `getType()` as `'tag-cloud'`. Axis labels fall back to `Term` and `Weight`. Highlighting pairs each term with its own `<text>` element by matching the rendered text rather than by counting DOM order: a cloud writes its words in packing order, which has no relation to the order they were declared in, so counting them off would announce one term while highlighting another. A term that does not match exactly one rendered word disables highlighting for the whole chart rather than placing a guess.

- **Choropleth** maps come from `anychart-map.min.js` plus a geodata file, and the `choropleth` series is what carries the data — `marker`, `bubble` and `connector` draw *over* a map rather than colouring it. The **series' own type is the whole detection**: `chart.getType()` is deliberately not required, because it answers `''` on a build without it and on a chart that has not been drawn, and gating on it would drop working maps. A row names a region by the id the geodata declared (`US.NV`) and never by name, so the name is read from the bound geo feature — `point.getFeatureProp()` where the build offers it, and the geodata's own `properties` matched by id otherwise. A region nothing names keeps its id, which is a poor name but a true one. Axis labels fall back to `Region` and `Value`.

  `lon` and `lat` are **deliberately omitted**. MAIDR's centroids are degrees east and north; what AnyChart has are its features' `middle-x` / `middle-y`, normalised coordinates in the map's own projection, which cannot be turned into degrees without inverting a projection the chart does not name. Passing them through would tell a reader that one region lies north of another when the map says nothing of the kind, so the map is read as a region list in declared order — the poorer reading the schema explicitly sanctions. `neighbors` is not derivable from AnyChart either and stays absent.

- **Gantt** charts come from `anychart-gantt.min.js`. `anychart.ganttProject()` and `anychart.ganttResource()` report `'gantt-project'` and `'gantt-resource'`, and the type name is corroborated structurally before anything is read: a gantt has no series API at all and its `chart.data()` hands back an `anychart.data.Tree` of tasks rather than a data view, so a chart naming itself a gantt with no tree behind it is bound as nothing rather than as an empty schedule. The tree is flattened depth-first — parents before their children, the order the chart stacks its rows in — into one lane per row. A parent task states no dates of its own, so the pair AnyChart derived for it (`autoStart` / `autoEnd`) is read instead; a task with a start and no end is a milestone and is emitted as the zero-length interval it is; a resource chart's `periods` array becomes several intervals in one lane. A task with no dates at all becomes an **empty lane** that still carries its name, which is what MAIDR's nested gantt shape exists to express. Axis labels fall back to `Date` and `Task` (`Resource` on a resource chart).

  The ends are restated in whole days — or hours, on a schedule spanning less than two days — and the unit is named alongside them, because a gantt is read for how long its intervals run and epoch milliseconds announce as an unreadable nine-digit figure. This is read rather than guessed: a gantt's timeline is a date-time scale, so what the tree holds is instants. The x axis carries a formatter that turns a position back into a date, so each end is still announced as one.

  `anychart.timeline()` is **not** read. It is a third constructor with a series API of its own whose `moment` series are instants rather than intervals, and announcing one as a schedule would describe work the chart never drew; it binds as nothing instead.

## Code Examples

### Bar Chart

```html
<div id="container" style="width: 700px; height: 400px"></div>
<script type="module">
  import { bindAnyChart } from 'https://cdn.jsdelivr.net/npm/maidr/dist/anychart.mjs';

  const chart = anychart.bar([
    ['Sat', 87], ['Sun', 76], ['Thu', 62], ['Fri', 19],
  ]);
  chart.title('The Number of Tips by Day');
  chart.xAxis().title('Day');
  chart.yAxis().title('Count');
  chart.container('container').draw();

  bindAnyChart(chart, {
    id: 'tips-bar',
    title: 'The Number of Tips by Day',
    axes: { x: 'Day', y: 'Count' },
  });
</script>
```

#### Multi-dataset Bar Charts

Adding multiple bar series to the same chart produces a dodged (grouped) bar trace in MAIDR — each series becomes its own row of bars, navigable with up / down arrows:

```html
<div id="container" style="width: 700px; height: 400px"></div>
<script type="module">
  import { bindAnyChart } from 'https://cdn.jsdelivr.net/npm/maidr/dist/anychart.mjs';

  const chart = anychart.bar();
  chart.bar([['Mon', 20], ['Tue', 14], ['Wed', 23]]).name('Lunch');
  chart.bar([['Mon', 12], ['Tue', 19], ['Wed', 15]]).name('Dinner');
  chart.title('Tips by Meal');
  chart.container('container').draw();

  bindAnyChart(chart, {
    id: 'tips-grouped',
    title: 'Tips by Meal',
    axes: { x: 'Day', y: 'Count' },
  });
</script>
```

Each `chart.bar(...)` call adds one series. The adapter walks every series via `chart.getSeriesCount()` / `chart.getSeriesAt(i)` and emits one MAIDR layer per series. Series names (set via `.name('Lunch')`) become the layer titles announced to screen readers.

### Line Chart

```html
<div id="container" style="width: 700px; height: 400px"></div>
<script type="module">
  import { bindAnyChart } from 'https://cdn.jsdelivr.net/npm/maidr/dist/anychart.mjs';

  const chart = anychart.line([
    ['Mon', 4.2], ['Tue', 5.1], ['Wed', 6.3], ['Thu', 5.8],
    ['Fri', 7.4], ['Sat', 8.9], ['Sun', 7.7],
  ]);
  chart.title('Average Daily Sales');
  chart.container('container').draw();

  bindAnyChart(chart, {
    id: 'sales-line',
    title: 'Average Daily Sales',
    axes: { x: 'Day', y: 'Sales (thousands)' },
  });
</script>
```

### Scatter Plot

```html
<div id="container" style="width: 700px; height: 400px"></div>
<script type="module">
  import { bindAnyChart } from 'https://cdn.jsdelivr.net/npm/maidr/dist/anychart.mjs';

  const chart = anychart.scatter();
  chart.marker([
    { x: 1.1, value: 2.3 }, { x: 2.4, value: 3.9 },
    { x: 3.0, value: 5.2 }, { x: 4.5, value: 4.4 },
    { x: 5.2, value: 6.8 }, { x: 6.7, value: 7.1 },
  ]);
  chart.title('Sample Scatter Plot');
  chart.container('container').draw();

  bindAnyChart(chart, {
    id: 'sample-scatter',
    title: 'Sample Scatter Plot',
    axes: { x: 'X Value', y: 'Y Value' },
  });
</script>
```

### Box Plot

```html
<div id="container" style="width: 700px; height: 400px"></div>
<script type="module">
  import { bindAnyChart } from 'https://cdn.jsdelivr.net/npm/maidr/dist/anychart.mjs';

  // Rows: [x, lowest, q1, median, q3, highest]
  const chart = anychart.box([
    ['Set A', 760, 801, 848, 895, 965],
    ['Set B', 733, 853, 939, 980, 1080],
    ['Set C', 714, 762, 817, 870, 918],
  ]);
  chart.title('Distribution Summary');
  chart.container('container').draw();

  bindAnyChart(chart, {
    id: 'dist-box',
    title: 'Distribution Summary',
    axes: { x: 'Group', y: 'Value' },
  });
</script>
```

> **Note:** AnyChart's iterator API does not expose outlier arrays. The MAIDR representation reports only the five-number summary (min, Q1, median, Q3, max).

### Heatmap

```html
<!-- Heatmap is a separate AnyChart module on top of anychart-base -->
<script src="https://cdn.anychart.com/releases/8.13.0/js/anychart-heatmap.min.js"></script>

<div id="container" style="width: 700px; height: 400px"></div>
<script type="module">
  import { bindAnyChart } from 'https://cdn.jsdelivr.net/npm/maidr/dist/anychart.mjs';

  const data = [
    { x: 'Math', y: 'GPT-4', heat: 92 },
    { x: 'Math', y: 'Claude', heat: 89 },
    { x: 'Code', y: 'GPT-4', heat: 88 },
    { x: 'Code', y: 'Claude', heat: 91 },
  ];

  const chart = anychart.heatMap(data);
  chart.title('Model Scores by Task');
  chart.container('container').draw();

  bindAnyChart(chart, {
    id: 'scores-heat',
    title: 'Model Scores by Task',
    axes: { x: 'Task', y: 'Model' },
  });
</script>
```

### Candlestick

```html
<!-- Candlestick is provided by the financial / stock module -->
<script src="https://cdn.anychart.com/releases/8.13.0/js/anychart-stock.min.js"></script>

<div id="container" style="width: 700px; height: 400px"></div>
<script type="module">
  import { bindAnyChart } from 'https://cdn.jsdelivr.net/npm/maidr/dist/anychart.mjs';

  // Rows: [x, open, high, low, close]
  const chart = anychart.candlestick([
    ['2024-01-01', 100, 110,  95, 108],
    ['2024-01-02', 108, 115, 105, 112],
    ['2024-01-03', 112, 113, 100, 102],
    ['2024-01-04', 102, 108,  98, 106],
  ]);
  chart.title('Daily OHLC Prices');
  chart.container('container').draw();

  bindAnyChart(chart, {
    id: 'ohlc-candle',
    title: 'Daily OHLC Prices',
    axes: { x: 'Date', y: 'Price (USD)' },
  });
</script>
```

### Pie Chart

```html
<div id="container" style="width: 700px; height: 400px"></div>
<script type="module">
  import { bindAnyChart } from 'https://cdn.jsdelivr.net/npm/maidr/dist/anychart.mjs';

  const chart = anychart.pie([
    ['Apples', 30], ['Bananas', 50], ['Cherries', 20], ['Dates', 12],
  ]);
  chart.title('Fruit Sales by Variety');
  // chart.innerRadius('40%');  // makes it a doughnut; nothing else changes
  chart.container('container').draw();

  bindAnyChart(chart, {
    id: 'fruit-pie',
    title: 'Fruit Sales by Variety',
    axes: { x: 'Fruit', y: 'Units sold' },
  });
</script>
```

Left and Right move between slices; Up and Down are out of bounds, since a pie is a single row. Each slice announces its label, its value, and its share of the whole — "Fruit is Apples, Units sold is 30, Percentage is 26.8%". The binder stamps a `data-maidr-anychart-pie-slice` attribute on each rendered wedge in data order, so highlighting needs no manual `selectors` entry.

## Binder Options

```ts
bindAnyChart(chart, {
  id?: string;                                     // defaults to container element's id
  title?: string;                                  // defaults to chart.title().text()
  axes?: { x?: string; y?: string };               // override axis labels
  selectors?: Array<string | string[] | undefined>; // per-series CSS selectors for SVG highlighting
});
```

### The `selectors` Option

For bar, line, scatter, box, heatmap, and candlestick charts the adapter auto-discovers the SVG elements it needs to highlight (see [How Highlighting Works (Advanced)](#how-highlighting-works-advanced) below). For charts where the heuristics fall short — or to override them — pass explicit CSS selectors:

```js
// 1. Per-series selectors. Each array entry maps to a series by index.
bindAnyChart(chart, {
  selectors: ['.series-0 rect', '.series-1 rect'],
});

// 2. Skip highlighting for a specific series with `undefined`.
bindAnyChart(chart, {
  selectors: ['.series-0 rect', undefined], // series 1 gets no highlight
});

// 3. Single-element array — applied to every series.
bindAnyChart(chart, {
  selectors: ['.chart rect'],
});

// 4. Per-point selectors via nested string[] (one entry per data point).
bindAnyChart(chart, {
  selectors: [['#bar-mon', '#bar-tue', '#bar-wed']],
});
```

Selectors are resolved against the chart container, so they may be scoped relatively (e.g. `'.series-0 rect'` rather than `'#container .series-0 rect'`).

## Multi-Panel Figures

AnyChart has no native facet/small-multiples concept — the idiom is one chart instance per container. `bindAnyCharts()` groups several drawn charts into ONE multi-panel MAIDR figure: users navigate between panels with arrow keys, press <kbd>Enter</kbd> to drill into a panel, and <kbd>Esc</kbd> to return to panel navigation.

```html
<!-- Keep all panel containers inside ONE wrapper element. -->
<div id="dashboard">
  <div id="panel-q1"></div>
  <div id="panel-q2"></div>
  <div id="panel-q3"></div>
  <div id="panel-q4"></div>
</div>
<script type="module">
  import { bindAnyCharts } from 'https://cdn.jsdelivr.net/npm/maidr/dist/anychart.mjs';

  // q1…q4 are ordinary drawn AnyChart instances, one per container.
  // A 2D array maps 1:1 onto the subplot grid (visual reading order,
  // top-left panel first). Ragged rows are fine; empty rows are not.
  bindAnyCharts(
    [
      [q1, q2],
      [q3, q4],
    ],
    { id: 'sales-by-quarter', title: 'Sales by Quarter' },
  );
</script>
```

A flat array works too — arrange it with `options.layout`:

```js
// Chunk row-major into 2 columns → [[q1, q2], [q3, q4]].
bindAnyCharts([q1, q2, q3, q4], { layout: { columns: 2 } });

// Or derive the grid from each container's on-page position:
// containers are clustered into rows by their top edge and sorted
// left-to-right within each row.
bindAnyCharts([q1, q2, q3, q4], { layout: 'auto' });
```

How it fits together:

- **Panel names** — each chart's own `title()` becomes its panel's display name in MAIDR's subplot summaries. `options.title` names the whole figure, and `options.axes` (when set) overrides every panel's axis labels; otherwise axis titles are extracted per chart.
- **Per-panel highlighting** — the adapter stamps `data-maidr-anychart-panel="<figureId>-<row>-<col>"` on each chart's own `<svg>` and scopes every highlight selector to that panel, so highlighting can never leak between panels (or between figures on the same page).
- **Visual navigation order** — MAIDR resolves each panel's on-screen position by measuring the element matched by that same per-panel `svg[data-maidr-anychart-panel="…"]` selector, so panel numbering follows visual reading order (top-left is "Subplot 1") and the Up/Down arrows on multi-ROW grids move visually up/down.
- **One mount point** — the combined `maidr-data` attribute goes on a transparent host `<div>` wrapping the panels' common ancestor, so place all panel containers inside one wrapper element (or under one common parent). Charts drawn onto a shared Stage/container are **not** supported — give each chart its own container.
- **Panel CSS** — binding may move contiguous panel containers into MAIDR's transparent host `<div>`, so they are no longer direct children of your wrapper. Size panel containers with a class or descendant selector (e.g. `#dashboard .panel { … }`), **not** a child combinator like `#dashboard > div`, which stops matching after binding and breaks later AnyChart re-layouts (window resize, `chart.draw()` on data updates). Panels with other content interleaved between them (headings, captions) are fine: the adapter then wraps their shared ancestor in place instead of moving them, preserving page order.
- **Options** — `bindAnyCharts(charts, { id?, title?, axes?, layout? })`. The per-series `selectors` override is not available in grouped mode.

`anyChartsToMaidr(charts, options)` is the matching data-only converter (same relationship as `anyChartToMaidr()` to `bindAnyChart()`): it returns the combined `Maidr | null` without touching the DOM. Note that its default selectors refer to panel attributes that only `bindAnyCharts()` stamps, and that you should pass a stable `id` if you need deterministic output.

Known limitation: because AnyChart SVGs contain no per-panel `g[id^="axes_"]` groups, there is no visual panel-outline highlight while navigating between panels (panel navigation, text, audio, and per-point highlighting inside each panel are unaffected).

See [`examples/anychart/multipanel.html`](https://github.com/xability/maidr/blob/main/examples/anychart/multipanel.html) for a complete 2×2 dashboard.

## How Highlighting Works (Advanced)

AnyChart's SVG output uses opaque, internally-generated ids (`ac_path_*`, `ac_rect_*`, `ac_layer_*`) and does not expose stable CSS classes. To still provide reliable per-point highlighting without forcing every consumer to write selectors, `bindAnyChart()` stamps stable `data-maidr-anychart-*` attributes onto the relevant SVG elements after the chart renders:

| Chart type | Attribute | Value format |
|------------|-----------|--------------|
| Bar / column / diverging | `data-maidr-anychart-bar` | `"<seriesIndex>-<pointIndex>"` |
| Line / area / spline / step / stick | `data-maidr-anychart-line-point` | `"<seriesIndex>-<pointIndex>"` |
| Scatter / marker / bubble / dot plot | `data-maidr-anychart-scatter-point` | `"<seriesIndex>-<pointIndex>"` |
| Dumbbell (`range-column` / `range-bar`) | `data-maidr-anychart-pair` | `"<seriesIndex>-<pairIndex>"` |
| Box plot | `data-maidr-anychart-box` | `"<seriesIndex>-<pointIndex>"` |
| Heatmap | `data-maidr-anychart-heatmap-cell` | `"<rowIndex>-<colIndex>"` |
| Candlestick / OHLC | `data-maidr-anychart-candlestick-cell` | `"<seriesIndex>-<pointIndex>"` |
| Pie | `data-maidr-anychart-pie-slice` | `"<seriesIndex>-<sliceIndex>"` |
| Funnel / pyramid | `data-maidr-anychart-funnel-stage` | `"<seriesIndex>-<stageIndex>"` |
| Tag cloud | `data-maidr-anychart-word` | `"<seriesIndex>-<termIndex>"` |
| Sankey | `data-maidr-anychart-flow` | `"<seriesIndex>-<flowIndex>"` |
| Waterfall | `data-maidr-anychart-waterfall-step` | `"<seriesIndex>-<stepIndex>"` |
| Radar / polar | `data-maidr-anychart-spoke` | `"<seriesIndex>-<spokeIndex>"` |
| Marimekko | `data-maidr-anychart-tile` | `"<seriesIndex>-<categoryIndex>"` |
| Choropleth | `data-maidr-anychart-region` | `"<seriesIndex>-<regionIndex>"` |
| Gantt | `data-maidr-anychart-task-bar` | `"<laneIndex>-<intervalIndex>"` |

The adapter's generated `selectors` then target those attributes (e.g. `[data-maidr-anychart-bar="0-3"]`), which keeps highlighting stable across re-renders.

#### Layer discrimination

For heatmap and candlestick charts, the stamping logic must find the correct `<g>` layer holding the data paths. AnyChart applies a `clip-path="url(#ac_clip_*)"` attribute to series-data layers so that rendering is clipped to the plot area; chart-level layers (axes, gridlines, background) are intentionally **unclipped** so they can paint outside the plot area (axis labels, ticks, title space).

The adapter uses this `clip-path` presence as the primary discriminator when picking the series layer. Without it, the chosen layer can end up being the axes/background group — whose children outnumber the actual data paths — producing off-by-one highlighting (the first highlight covers the background and the last data point is missed). Defense-in-depth path filters also skip:

- Paths with `fill-opacity < 1` (hover / selection overlays).
- Degenerate paths whose `d` attribute contains a single SVG command (clip-path boundary sentinels).

Two families cannot be found by counting at all:

- A **choropleth** is *located* rather than counted. AnyChart paints every feature of the bound geodata — all fifty states for a table naming six — in the geodata's order rather than the data's, and the paths carry no id, so counting them off would put California's highlight on Alabama's shape. Each region is instead matched to the shape whose own box is the one `point.getFeatureBounds()` says the chart drew it at. A region matching no shape, or more than one, disables highlighting for the whole map.
- A **gantt** is picked out by count, but from more filled shapes than any other chart here: the row stripes behind both halves of the split widget, the header, and the progress fill inside a bar that has one. When the whole SVG holds exactly as many filled paths as the schedule has intervals they are the bars; otherwise the search narrows to the `<g>` layer holding exactly that many. Two layers answering to the same count — the stripes behind a one-interval-per-row project chart are exactly that — are separated by the one property a schedule has and a backdrop does not: its bars begin and end in different places. Anything still ambiguous is left unstamped and said out loud.

If you want to bypass auto-stamping entirely, pass explicit `selectors` — they always take precedence over the generated `data-maidr-anychart-*` selectors.

## Keyboard Controls

Once a chart is focused, use standard MAIDR keyboard shortcuts:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between data points | Arrow keys | Arrow keys |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |

For the full list, see the [Keyboard Controls](docs/CONTROLS.html) reference.

## Integration Comparison

| Feature | Vanilla JS (CDN) | React Component | AnyChart Adapter |
|---------|-----------------|-----------------|------------------|
| Setup | `maidr-data` attribute with JSON | `data` prop on `<Maidr>` | `bindAnyChart(chart, opts)` after `draw()` |
| Data source | Manual JSON schema | Manual JSON schema | Auto-extracted from AnyChart series |
| SVG selectors | Manual CSS selectors | Manual CSS selectors | Optional `selectors` option |
| Configuration | Required | Required | Minimal — id, title, axes only |
| Chart types | All MAIDR types | All MAIDR types | 14 AnyChart families |
| Dynamic charts | Manual init | React lifecycle | Re-call `bindAnyChart()` after redraw |

## npm Installation (Optional)

For bundler-based projects:

```bash
npm install maidr anychart
```

```ts
import anychart from 'anychart';
import 'maidr'; // loads the core runtime (registers maidr:bindchart listener)
import { bindAnyChart } from 'maidr/anychart';

const chart = anychart.bar([['Mon', 20], ['Tue', 14], ['Wed', 23]]);
chart.container('container').draw();

bindAnyChart(chart, {
  id: 'my-chart',
  title: 'Tips by Day',
  axes: { x: 'Day', y: 'Count' },
});
```

Both `maidr` and `maidr/anychart` ship ESM modules with TypeScript declarations.

## Advanced: Manual Data Extraction

In addition to the one-line `bindAnyChart()` binder, the adapter exports a lower-level `anyChartToMaidr()` function that returns the generated MAIDR JSON without touching the DOM or dispatching any events:

```ts
import { anyChartToMaidr } from 'maidr/anychart';

const chart = anychart.bar([['Mon', 20], ['Tue', 14], ['Wed', 23]]);
chart.container('container').draw();

const maidrData = anyChartToMaidr(chart, {
  id: 'tips-bar',
  title: 'Tips by Day',
  axes: { x: 'Day', y: 'Count' },
});
// maidrData is a Maidr JSON object, or null if no convertible series found.
```

Useful when you want to:

- Pass the data to the React `<Maidr data={maidrData}>` component instead of the vanilla DOM binder.
- Persist / serialize the MAIDR schema (e.g. cache it, send it to a server, snapshot it for testing).
- Inspect what the adapter extracted before binding (debugging unsupported series types).
- Combine multiple chart conversions into a single composite MAIDR figure.

`anyChartToMaidr()` accepts the same options as `bindAnyChart()` (`id`, `title`, `axes`, `selectors`) and returns the same `Maidr | null` shape that the binder produces internally — the binder just additionally writes the JSON to the container's `maidr-data` attribute and fires the `maidr:bindchart` event.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
