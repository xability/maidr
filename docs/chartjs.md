# Chart.js Integration

MAIDR ships a Chart.js plugin that makes every chart on the page accessible — no data attributes, no manual schema, no binder calls. Register the plugin once and any `new Chart(...)` instance gains audio sonification, text descriptions, braille output, and keyboard navigation.

## Quick Start

Add Chart.js and the MAIDR Chart.js bundle, then register the plugin:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Chart.js Chart</title>
    <!-- 1. Load Chart.js -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
    <!-- 2. Load MAIDR's Chart.js adapter -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/chartjs.js"></script>
  </head>
  <body>
    <div style="width: 700px; height: 400px">
      <canvas id="my-chart"></canvas>
    </div>

    <script>
      // 3. Register the MAIDR plugin globally — every chart on the page
      //    becomes accessible automatically.
      Chart.register(maidrChartjs.maidrPlugin);

      // 4. Create your chart normally — MAIDR hooks in automatically
      new Chart(document.getElementById('my-chart'), {
        type: 'bar',
        data: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          datasets: [{ label: 'Tips', data: [20, 14, 23, 25, 22] }],
        },
        options: {
          plugins: { title: { display: true, text: 'Tips by Day' } },
          scales: {
            x: { title: { display: true, text: 'Day' } },
            y: { title: { display: true, text: 'Count' } },
          },
        },
      });
    </script>
  </body>
</html>
```

Once the page loads, click the chart (or Tab to it) and MAIDR activates with:

- **Audio sonification** — tones representing data values
- **Text descriptions** — spoken via screen readers
- **Braille output** — refreshable braille display support
- **Keyboard navigation** — arrow keys to move between data points

No changes to your Chart.js code are required.

## How It Works

MAIDR's Chart.js adapter is a standard Chart.js plugin:

1. **Registration** — `Chart.register(maidrChartjs.maidrPlugin)` installs the plugin globally for every chart on the page
2. **Extraction** — on each chart's `afterInit` hook, the extractor reads `chart.config.type`, `chart.data`, and `chart.options` and produces MAIDR's accessibility schema
3. **Activation** — a React root is mounted into a wrapper around the canvas, rendering the MAIDR component with full keyboard navigation, audio, text, and braille support
4. **Highlight overlay** — because Chart.js renders into a single `<canvas>`, MAIDR draws an absolute-positioned DOM rectangle on top of the canvas at the active element's geometry, kept in sync on resize

## Supported Chart Types

| Chart Type | Chart.js `type` | Extra Plugin Required | Example |
|-----------|----------------|----------------------|---------|
| Bar | `'bar'` (one dataset) | — | [Bar chart](examples.html) |
| Stacked Bar | `'bar'` with `scales.x.stacked` / `scales.y.stacked` | — | [Stacked bar](examples.html) |
| Dodged Bar | `'bar'` with multiple datasets (no stacking) | — | [Dodged bar](examples.html) |
| Diverging Bar | stacked `'bar'` with one series negated | — | [Diverging bar](examples.html) |
| Gantt / Range Bar | `'bar'` with `[start, end]` data | — | [Gantt chart](examples.html) |
| Waterfall | `'bar'` with chained `[start, end]` data | — | [Waterfall](examples.html) |
| Dumbbell | horizontal `'bar'` with `[start, end]` data and `plugins.maidr.traceType` | — | [Dumbbell](examples.html) |
| Line | `'line'` | — | [Line chart](examples.html) |
| Step | `'line'` with `stepped` on the dataset (or `elements.line`) | — | [Line chart](examples.html) |
| Area | `'line'` with `fill` | — | [Line chart](examples.html) |
| Stacked Area | `'line'` with `fill` and a stacked value scale | — | [Line chart](examples.html) |
| Normalized Area | stacked area whose categories all total 100 (or 1) | — | [Line chart](examples.html) |
| Bump | `'line'` with `scales.y.reverse` and ranked values | — | [Bump chart](examples.html) |
| Dot Plot | `'line'` with `showLine: false` on a category axis | — | [Dot plot](examples.html) |
| Survival | `'line'` with `stepped` and a `maidr` declaration | — | [Survival curve](examples.html) |
| Scatter | `'scatter'` | — | [Scatter plot](examples.html) |
| Volcano | `'scatter'` with a `maidr` declaration | — | [Volcano plot](examples.html) |
| Manhattan | `'scatter'` with a `maidr` declaration | — | [Manhattan plot](examples.html) |
| Radar | `'radar'` | — | [Radar chart](examples.html) |
| Polar Area | `'polarArea'` | — | [Radar chart](examples.html) |
| Box Plot | `'boxplot'` | `@sgratzl/chartjs-chart-boxplot` | [Box plot](examples.html) |
| Error Bar | `'barWithErrorBars'`, `'lineWithErrorBars'`, `'scatterWithErrorBars'` | `chartjs-chart-error-bars` | [Error bar](examples.html) |
| Candlestick | `'candlestick'` | `chartjs-chart-financial` + a date adapter | [Candlestick](examples.html) |
| Heatmap | `'matrix'` | `chartjs-chart-matrix` | [Heatmap](examples.html) |
| Treemap | `'treemap'` | `chartjs-chart-treemap` | [Treemap](examples.html) |
| Sankey | `'sankey'` | `chartjs-chart-sankey` | [Sankey](examples.html) |
| Word Cloud | `'wordCloud'` | `chartjs-chart-wordcloud` | [Word cloud](examples.html) |
| Funnel | `'funnel'` | `chartjs-chart-funnel` | [Funnel](examples.html) |
| Choropleth | `'choropleth'`, `'bubbleMap'` | `chartjs-chart-geo` | [Choropleth](examples.html) |
| Tree | `'tree'`, `'dendrogram'` | `chartjs-chart-graph` | [Tree](examples.html) |
| Network | `'forceDirectedGraph'` | `chartjs-chart-graph` | [Network](examples.html) |
| Parallel Coordinates | `'pcp'`, `'logarithmicPcp'` | `chartjs-chart-pcp` | [Parallel coordinates](examples.html) |
| Pie / Doughnut | `'pie'`, `'doughnut'` | — | [Pie chart](examples.html) |
| Gauge | `'doughnut'` with `circumference` under 360 and two values | — | [Gauge](examples.html) |

> **Pie note:** a pie has no Chart.js scales, so there is no axis title to read. `axes.x` and `axes.y` default to `Category` and `Value`; set `plugins.maidr.axes` to name what the slice labels and their values actually mean. Multiple datasets are concentric rings, not slices of one circle — each becomes its own MAIDR layer with its own total and percentages, and Page Up / Page Down move between them.

> **Funnel note:** a funnel is read as the stages it draws, `data.labels` naming them and `dataset.data` carrying the magnitudes — plain numbers or `{x, y}` rows, either way. The reading MAIDR gives it is a bar's with one difference that matters: the pitch carries the **retention** between adjacent stages rather than the count, and the counts are announced alongside. `indexAxis: 'y'` draws it on its side and the payload is exchanged with it, as for any bar-family chart. Several datasets are several funnels, one layer each, rather than one segmented chart — a funnel is one population shrinking across ordered stages, so a second series is a second population.

> **Geo note:** both `chartjs-chart-geo` controllers are read as a **choropleth** — a map is a set of named places each carrying one value, and whether a place is drawn as a shaded region or as a sized bubble changes the picture rather than the reading. The places are named by `data.labels`, which is what the plugin's own tooltip announces; a choropleth that declares none falls back to the name inside the GeoJSON it shades (`properties.name` and the usual alternatives). The value is read from the parse, so `scales.color.property` / `scales.size.property` may point it at any field. A region whose value is `null` is skipped rather than announced as a zero: the map paints it with `missing` rather than a shade. Several datasets are several maps, one layer each.
>
> The **centroids** are asymmetric, and it is the plugin that makes them so. A bubble map carries `longitude` / `latitude` on every row, so its regions are laid out geographically — up is north, left is west — and MAIDR navigates the map itself. A choropleth carries none: the drawn shape's coordinates are pixels on the canvas, not degrees, so unless a row declares `center: {longitude, latitude}` the map is read as a region list in declared order, which is the poorer reading the data supports rather than a set of positions invented for it. Add `center` to each row to get the spatial walk. Highlighting follows the same split: a list-ordered map outlines the region being announced, and a placed one outlines nothing, because MAIDR's position on a placed map names a spot on the globe rather than a row of the dataset.

> **Parallel coordinates note:** `chartjs-chart-pcp` lays a chart out the other way up from every other Chart.js type, and the reading follows the drawing rather than the data structure. **One dataset is one axis** — `dataset.label` names it, and the plugin gives each its own vertical scale — while one entry of `data.labels` is one **observation**, the line running across every axis. MAIDR emits the transpose of that: a series per observation, a point per axis, which is what parallel coordinates navigation expects. Arrowing left and right walks the variables of one observation; up and down walks the observations at one variable.
>
> Each value is pitched **against its own axis**, not against one range for the chart. That is the whole point of the chart type and the thing a single scale would destroy: a variable measured in tens beside one measured in thousands would otherwise put every value of the first at the bottom of the register. Scaled per axis, two observations whose pitches swap between adjacent variables are the crossing lines that mean negative correlation — visible on the page, and audible here.
>
> An axis is named by its `dataset.label`, which is what the plugin uses for the tick under each axis and in its tooltip; a dataset that displays its own `title` is named by that instead, being the more descriptive name an author chose. A **hidden** dataset is dropped, because Chart.js lays out no axis for it and it is not a column of the drawn chart. A `null` leaves the observation with a position on that axis and no reading, rather than shortening it — the axis is still there and the cursor still reaches it.
>
> `logarithmicPcp` is read identically. The plugin changes where a value is drawn on its axis, not what the value is, so the announcement and the pitch carry the number itself; a reader hears the value's linear position within its own axis rather than its drawn one.
>
> Rows must be plain numbers. `{x, y}` object rows are not a spelling this plugin accepts — it throws while parsing them, before MAIDR sees anything.

> **Venn and Euler are declined.** `chartjs-chart-venn` registers `venn` and `euler`, and there is no honest reading of either: the areas of a Venn diagram are set intersections whose sizes are drawn approximately by construction, and MAIDR has no set-membership trace to navigate them with. Announcing the drawn areas would report a geometry the diagram does not claim to measure. Written down here so the decline is a decision on record rather than an omission.

> **Graph note:** all three `chartjs-chart-graph` controllers take the same flat node list, in which a node names its parent by **index**; the names come from `data.labels`, and a node the chart never labelled is announced by its position. What separates the readings is not the layout but what the node list may be. `tree` and `dendrogram` name a parent per node, so the data is a hierarchy by construction — they are one controller class with a `mode` option and are read as one **tree**, since a dendrogram is a tree drawn with its leaves levelled and naming it apart would name a layout rather than a chart. `forceDirectedGraph` may be given `edges` instead, and it accepts an edge list that closes a **cycle**, which no hierarchy can hold — so it is read as a **network**, and reading it as a tree would announce ancestry the chart does not have. No magnitude is emitted for either: the plugin sizes nothing by value.
>
> A tree outlines the node it announces. A network outlines **nothing**, and deliberately: MAIDR names a network's highlight as one *link*, so that its audio, braille and visual channels cannot disagree about which line is live — and the elements Chart.js can activate here are the **nodes**. Outlining a node for a link would light up a mark the reader was never told about, which is the failure #814 named.

> **Error bar note:** the three cartesian controllers of `chartjs-chart-error-bars` all read the same way — an estimate and the interval around it — because the mark each draws at the estimate is not something a reader is told. Several datasets become one series each, every estimate naming its dataset, so a dodged interval chart keeps the comparison it was drawn for. A datum may carry **nested** intervals (`yMin: [8, 7]`); the outermost pair is announced, which is the interval the drawn whiskers reach, and the inner ones are not. A datum written as a plain number draws no whiskers and is announced as an estimate with no interval — which is not the same as an interval of width zero. `polarAreaWithErrorBars`, the plugin's fourth controller, is **not** read: a radial spoke has nowhere to carry a bound, so reading it would announce the estimate and drop the uncertainty.

> **Radar note:** a radar and a polar area are drawn against a single radial `r` scale, so `axes.y` reads `scales.r.title.text` and `axes.x` defaults to `Category` — set `plugins.maidr.axes` to name what the spokes and their magnitudes mean. Both are read as a multi-series layer, one row per dataset and one column per spoke, with each spoke's stereo position following its angle rather than its index.

### Charts Chart.js Does Not Declare

Chart.js has no configuration for a waterfall, a bump chart, a normalized area or a diverging bar — each is a recipe built out of a plain bar or line chart — so MAIDR reads them off the **values**. Each test is deliberately strict, because announcing a chart as something it is not is worse than announcing it plainly:

- **Waterfall** — one series of `[start, end]` bars on the default vertical index axis where each step begins where the previous one ended. Bars that sit on the baseline (`start` of `0`) are read as the opening, closing or a subtotal. Unchained intervals are read as a gantt instead. A waterfall is one running total, so only the first dataset is read — a chart with several series of intervals is a gantt.
- **Gantt** — any other `[start, end]` bar chart. `indexAxis: 'y'` is the ordinary schedule, one lane per label; several datasets put several intervals in the same lane, each named by its dataset label. A lane whose entry is `null` stays a navigable row with nothing booked. Bounds may be numbers or `Date`s; on a `type: 'time'` scale MAIDR announces both ends as dates and measures lengths in milliseconds, so set `plugins.maidr.unit` when the schedule reads in days or sprints.
- **Normalized area** — two or more stacked, filled line datasets whose every category totals the same whole (100 or 1, within half a percent so rounded shares still count).
- **Bump** — a line chart with `scales.y.reverse` whose values at every period are a permutation of `1..N` across the series. The reversed axis alone is not enough; the permutation is what makes the rank reading safe.
- **Diverging bar** — a stacked bar chart whose datasets each sit wholly on one side of the baseline, with both sides occupied. The values stay signed: MAIDR pitches the magnitude and announces the side.
- **Dot plot** — a line chart whose every dataset sets `showLine: false` on a category axis. This one Chart.js does say outright: switching the line off is its own way of drawing a Cleveland dot plot. Unjoined points along a *linear* axis are a scatter plot drawn by the line controller, and stay one.
- **Gauge** — a `doughnut` swept through less than the full circle (`circumference` under 360) whose single dataset holds exactly two values: the measure, and the rest of the dial drawn empty. The remainder is spent on the dial's `max` rather than announced as a second reading.

### Charts Only the Page Can Declare

Three readings are shape-identical to another recipe, so no test on the config or the values can reach them. Set `plugins.maidr.traceType` to say which figure the chart is; the declaration wins over every heuristic above, in both directions — declaring `pie` on a two-slice half-doughnut keeps it a pie, and declaring `gantt` on a chained bar chart keeps it a schedule.

- **Box plot and violin** — `indexAxis: 'y'` draws either on its side, and MAIDR announces it as horizontal. Neither payload moves with it: a five-number summary has no pair to exchange. What moves is which axis title names the group and which names the measurement, and, for a box, which way the arrow keys walk — along the sections of one distribution rather than across the distributions.

- **Dumbbell** (`traceType: 'dumbbell'`) — a horizontal floating bar chart, which is the same `[start, end]` datum a one-interval-per-lane gantt uses. `plugins.maidr.startLabel` and `endLabel` name the two ends ("1990", "2020"); without them the reader is told which dot they are on but not which year it is. Rows with no pair are skipped rather than kept as empty rows, unlike a gantt lane. A dumbbell is one pair per row, so only the first dataset is read — several intervals in the same row are a gantt.
- **Survival** (`traceType: 'survival'`) — a `stepped: 'after'` line, which is how every staircase is drawn. Chart.js ignores properties it does not know, so ride the two things a survival figure carries and a step chart does not on the points themselves: `{x, y, censored: true}` for a censoring mark and `{yMin, yMax}` for the confidence band. Each dataset is one arm, gathered into a single layer.
- **Gauge** (`traceType: 'gauge'`) — for a dial the geometry above misses, and for the target and bands Chart.js records only as styling: `plugins.maidr.target` is the bullet marker and `plugins.maidr.bands` is a `[{ to, label }]` list in ascending order.

### The `maidr` Block on a Dataset

`plugins.maidr.traceType` says what the *chart* is, which is all a figure drawn as one dataset needs. A figure drawn as several — a Manhattan plot with a dataset per chromosome, a volcano beside its unchanged genes — needs to say it per dataset, and needs to name the columns its points carry. That is the co-located `maidr` block:

```js
datasets: [{
  label: 'chr1',
  data: [{ x: 1_000_000, y: 8.2, snp: 'rs1234', chr: 1 }],
  maidr: { type: 'manhattan', label: 'snp', group: 'chr', significance: 7.3 },
}]
```

Chart.js has no reserved slot for third-party metadata, but it passes dataset properties it does not know through untouched — the same mechanism a survival curve's `censored` datum rides on — so the block sits directly on the dataset. It wins over `plugins.maidr.traceType`, which is retained as the chart-wide shorthand; where the two disagree the block wins and MAIDR names both.

Every block is checked when it is read. A `type` that names no trace, a key the declared type does not accept (`significanse`), or a value that is not what its key takes (`significanceDirection: 'Below'`) is reported to the console and dropped, and the chart is read exactly as it would have been with no block at all. Nothing is ever guessed in its place.

**Volcano** (`type: 'volcano'`) and **Manhattan** (`type: 'manhattan'`) are the two readings this unlocks on a Chart.js scatter. Both are drawn as a plain scatter — a volcano puts effect size against significance, a Manhattan puts genomic position against it — and both are read through a threshold rather than point by point: MAIDR opens with how many points clear the line, and the rotor offers those points as a navigation unit so the few dozen that matter are a few dozen keystrokes away rather than twelve thousand.

| key | what it takes | what it does |
|---|---|---|
| `label` | a property name on your datum | What each point *is* — a gene, a SNP, a probe. Identity is the payload on these charts; the coordinates are the two numbers the axes already describe. Defaults to `label`, then `snp`, `id`, `name`, `gene`, `probe`. |
| `group` | a property name on your datum | The region a point belongs to — its chromosome. Defaults to `group`, then `chromosome`, `chrom`, `chr`, `region`. |
| `significance` | a number | The cutoff on the y axis, in the units the chart is drawn in — 1.3 for p &lt; 0.05 on a `-log10(p)` axis, 7.3 for genome-wide significance. |
| `significanceDirection` | `'above'` or `'below'` | Which side is the significant one. `'above'` suits the transformed axes these charts usually carry; a raw p axis needs `'below'`. |
| `effect` | a number | The effect-size cutoff on the x axis, applied to its magnitude. Meaningful on a volcano; a Manhattan's x is a position, so leave it out. |
| `merge` | a boolean | Whether the following datasets drawn the same way join this layer. `true` by default for a Manhattan, `false` for a volcano. |
| `title`, `name` | strings | The layer's announced title, and its name among sibling layers. |

Two rules are worth knowing before you write one:

- **A field name you write is used verbatim.** `label: 'symbol'` reads `symbol` and nothing else; if no row carries it, MAIDR says so and leaves the identity out rather than quietly resolving `gene` instead. Leave the key out to get the default chain.
- **No cutoff is ever inferred.** Chart.js states no line anywhere in its config, and a guessed one would sort every point in the figure onto the wrong side of it, silently. A layer that declares no `significance` is still emitted — it just reports no findings, and warns naming the field.

`merge` is what makes a 22-dataset Manhattan one navigable trace. The declaration goes on the first dataset; every *following* dataset drawn the same way that carries no block of its own is folded into that layer, up to the next dataset that declares something. Highlighting follows the merge — a column reaches the points sharing that x in whichever dataset drew them.

A block whose type this adapter has no construct for (a `hexbin` on a scatter, a `volcano` on a bar chart) is reported and ignored. `type: 'survival'` on a `'line'` dataset reaches exactly the same reading `plugins.maidr.traceType: 'survival'` does.

The readings that take the whole chart at once — a survival curve, a dumbbell, a waterfall, a gantt, a gauge — are one figure, so they take one answer. Several datasets may carry a block (a survival curve's arms each say what they are), but where two name *different* types the first in chart order wins and MAIDR names every type it found, the same way it does when a block and `plugins.maidr.traceType` disagree. Volcano, Manhattan and scatter are read per dataset instead, so each block there is honoured on its own dataset.

`plugins.maidr.traceType: 'volcano'` or `'manhattan'` still reads a chart whose datasets carry no block of their own: it names the trace type and the default chains still find an identity on each point. What it cannot carry is a cutoff, so a figure with one — which is most of them — wants the block.

## Code Examples

### Bar Chart

```html
<div style="width: 700px; height: 400px">
  <canvas id="bar-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('bar-chart'), {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Daily Activity Count',
        data: [45, 72, 89, 64, 53, 95, 38],
        backgroundColor: '#4682b4',
      }],
    },
    options: {
      plugins: { title: { display: true, text: 'Daily Activity Count' } },
      scales: {
        x: { title: { display: true, text: 'Day of Week' } },
        y: { title: { display: true, text: 'Count' }, beginAtZero: true },
      },
    },
  });
</script>
```

### Line Chart

```html
<div style="width: 700px; height: 400px">
  <canvas id="line-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('line-chart'), {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [
        { label: 'Revenue', data: [120, 200, 150, 240, 310, 280], borderColor: '#2ca02c', tension: 0.2 },
        { label: 'Expenses', data: [90, 130, 110, 170, 200, 190], borderColor: '#d62728', tension: 0.2 },
      ],
    },
    options: {
      plugins: { title: { display: true, text: 'Monthly Revenue vs Expenses' } },
      scales: {
        x: { title: { display: true, text: 'Month' } },
        y: { title: { display: true, text: 'USD (thousands)' } },
      },
    },
  });
</script>
```

### Scatter Plot

```html
<div style="width: 700px; height: 400px">
  <canvas id="scatter-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('scatter-chart'), {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Iris Setosa',
        data: [
          { x: 5.1, y: 3.5 }, { x: 4.9, y: 3.0 }, { x: 4.7, y: 3.2 },
          { x: 4.6, y: 3.1 }, { x: 5.0, y: 3.6 }, { x: 5.4, y: 3.9 },
          { x: 4.6, y: 3.4 }, { x: 5.0, y: 3.4 },
        ],
        backgroundColor: '#9467bd',
      }],
    },
    options: {
      plugins: { title: { display: true, text: 'Sepal Length vs Sepal Width' } },
      scales: {
        x: { title: { display: true, text: 'Sepal Length (cm)' } },
        y: { title: { display: true, text: 'Sepal Width (cm)' } },
      },
    },
  });
</script>
```

### Volcano Plot

```html
<div style="width: 700px; height: 400px">
  <canvas id="volcano-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('volcano-chart'), {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Differential expression',
        data: [
          { x: -3.1, y: 6.8, gene: 'TP53' }, { x: -2.4, y: 4.1, gene: 'BRCA1' },
          { x: -0.9, y: 1.1, gene: 'ACTB' }, { x: 0.4, y: 0.8, gene: 'RPL13A' },
          { x: 1.9, y: 3.4, gene: 'VEGFA' }, { x: 3.4, y: 7.2, gene: 'CDKN1A' },
        ],
        // A volcano is a plain scatter until the dataset says otherwise.
        maidr: { type: 'volcano', label: 'gene', significance: 1.3, effect: 1 },
      }],
    },
    options: {
      plugins: { title: { display: true, text: 'Treated vs. control' } },
      scales: {
        x: { title: { display: true, text: 'log2 fold change' } },
        y: { title: { display: true, text: '-log10(p)' } },
      },
    },
  });
</script>
```

### Manhattan Plot

One dataset per chromosome is how the alternating colours are drawn. `merge` — on by default for a Manhattan — folds them into a single navigable cloud, so only the first dataset carries a block.

```html
<div style="width: 700px; height: 400px">
  <canvas id="manhattan-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('manhattan-chart'), {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'chr1',
          data: [
            { x: 5, y: 1.2, snp: 'rs1001', chr: 1 },
            { x: 44, y: 8.6, snp: 'rs1004', chr: 1 },
          ],
          pointBackgroundColor: '#1f77b4',
          maidr: { type: 'manhattan', label: 'snp', group: 'chr', significance: 7.3 },
        },
        {
          label: 'chr2',
          data: [
            { x: 106, y: 2.2, snp: 'rs2001', chr: 2 },
            { x: 133, y: 4.9, snp: 'rs2003', chr: 2 },
          ],
          pointBackgroundColor: '#ff7f0e',
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: 'Genome-wide association study' },
        legend: { display: false },
      },
      scales: {
        x: { title: { display: true, text: 'Genomic position (kb)' } },
        y: { title: { display: true, text: '-log10(p)' } },
      },
    },
  });
</script>
```

### Stacked Bar Chart

Both axes marked `stacked: true` produces a stacked bar chart. The MAIDR extractor maps multi-dataset stacked bars to its `STACKED` trace type.

```html
<div style="width: 700px; height: 400px">
  <canvas id="stacked-bar-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('stacked-bar-chart'), {
    type: 'bar',
    data: {
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      datasets: [
        { label: 'East', data: [120, 150, 180, 200], backgroundColor: '#2196F3' },
        { label: 'West', data: [90, 110, 130, 145], backgroundColor: '#FF9800' },
        { label: 'South', data: [60, 80, 95, 110], backgroundColor: '#4CAF50' },
      ],
    },
    options: {
      plugins: { title: { display: true, text: 'Revenue by Region' } },
      scales: {
        x: { title: { display: true, text: 'Quarter' }, stacked: true },
        y: { title: { display: true, text: 'Revenue ($K)' }, beginAtZero: true, stacked: true },
      },
    },
  });
</script>
```

### Dodged (Grouped) Bar Chart

Multi-dataset bars without `stacked` flags render side-by-side and map to the `DODGED` trace type.

```html
<div style="width: 700px; height: 400px">
  <canvas id="dodged-bar-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('dodged-bar-chart'), {
    type: 'bar',
    data: {
      labels: ['Math', 'Science', 'English'],
      datasets: [
        { label: 'Grade A', data: [30, 35, 40], backgroundColor: '#4CAF50' },
        { label: 'Grade B', data: [45, 40, 35], backgroundColor: '#2196F3' },
        { label: 'Grade C', data: [20, 25, 15], backgroundColor: '#FF9800' },
      ],
    },
    options: {
      plugins: { title: { display: true, text: 'Student Grades by Subject' } },
      scales: {
        x: { title: { display: true, text: 'Subject' } },
        y: { title: { display: true, text: 'Count' }, beginAtZero: true },
      },
    },
  });
</script>
```

### Box Plot

Requires the [`@sgratzl/chartjs-chart-boxplot`](https://github.com/sgratzl/chartjs-chart-boxplot) plugin. Its v4 UMD bundle auto-registers the boxplot controller and elements.

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/@sgratzl/chartjs-chart-boxplot@4"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/chartjs.js"></script>

<div style="width: 700px; height: 400px">
  <canvas id="boxplot-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('boxplot-chart'), {
    type: 'boxplot',
    data: {
      labels: ['Group A', 'Group B', 'Group C'],
      datasets: [{
        label: 'Distribution',
        data: [
          { min: 15, q1: 25, median: 35, q3: 45, max: 55, outliers: [5, 8, 62, 70] },
          { min: 20, q1: 30, median: 42, q3: 52, max: 65, outliers: [12, 72] },
          { min: 10, q1: 22, median: 30, q3: 40, max: 50, outliers: [58] },
        ],
        backgroundColor: 'rgba(135, 206, 235, 0.5)',
        borderColor: 'rgb(135, 206, 235)',
        borderWidth: 1,
      }],
    },
    options: {
      plugins: { title: { display: true, text: 'Distribution by Group' } },
      scales: {
        x: { title: { display: true, text: 'Group' } },
        y: { title: { display: true, text: 'Value' }, beginAtZero: true },
      },
    },
  });
</script>
```

### Candlestick

Requires [`chartjs-chart-financial`](https://github.com/chartjs/chartjs-chart-financial) and a date adapter (this example uses Luxon). Load order matters: date library → date adapter → financial plugin.

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/luxon@3"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-financial@0.2.1"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/chartjs.js"></script>

<div style="width: 700px; height: 400px">
  <canvas id="candlestick-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  const day = (n) => luxon.DateTime.fromISO('2024-01-' + String(n).padStart(2, '0')).toMillis();

  new Chart(document.getElementById('candlestick-chart'), {
    type: 'candlestick',
    data: {
      datasets: [{
        label: 'Stock Price',
        data: [
          { x: day(1), o: 100, h: 110, l: 95,  c: 105 },
          { x: day(2), o: 105, h: 115, l: 100, c: 112 },
          { x: day(3), o: 112, h: 118, l: 108, c: 109 },
          { x: day(4), o: 109, h: 114, l: 104, c: 113 },
          { x: day(5), o: 113, h: 120, l: 110, c: 118 },
        ],
      }],
    },
    options: {
      plugins: { title: { display: true, text: 'Weekly Stock Price' } },
      scales: {
        x: { type: 'time', time: { unit: 'day' }, title: { display: true, text: 'Day' } },
        y: { title: { display: true, text: 'Price ($)' } },
      },
    },
  });
</script>
```

The MAIDR extractor derives `trend` from `close` vs `open` and `volatility` from `high - low`. Chart.js's financial plugin does not carry volume data, so the MAIDR payload records volume as `0`.

### Treemap

Requires [`chartjs-chart-treemap`](https://github.com/kurkle/chartjs-chart-treemap). Declare `groups` and `key` and the hierarchy is read as it is drawn: each rectangle's group name becomes the node's name, its value becomes the magnitude, and the grouping fields give the ancestry. Arrow keys walk siblings; Up and Down move between levels.

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@4"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/chartjs.js"></script>

<div style="width: 700px; height: 400px">
  <canvas id="treemap-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('treemap-chart'), {
    type: 'treemap',
    data: {
      datasets: [{
        label: 'Population',
        tree: [
          { continent: 'Asia', country: 'Japan', pop: 125 },
          { continent: 'Asia', country: 'Korea', pop: 52 },
          { continent: 'Europe', country: 'France', pop: 67 },
          { continent: 'Europe', country: 'Spain', pop: 47 },
        ],
        groups: ['continent', 'country'],
        key: 'pop',
      }],
    },
  });
</script>
```

A node's value is announced only where it is its own: a group whose value is exactly its children's total is left for the trace to sum, and a group whose declared value differs is announced as declared rather than corrected.

A treemap has no Chart.js scales, so the axes are named after the dataset instead — `groups` joined for `axes.x` and `key` for `axes.y`. Set `plugins.maidr.axes` to override either.

A **flat** `tree` of numbers draws rectangles the plugin gives no names to, and `data.labels` is not read by the controller. Those nodes are announced by their position — 1, 2, 3 — so declare `groups` whenever the nodes have names worth hearing.

### Sankey

Requires [`chartjs-chart-sankey`](https://github.com/kurkle/chartjs-chart-sankey). The plugin's `{from, to, flow}` rows are read as they are written — the nodes are derived from the edges, so nothing has to be declared twice. Left and right follow the largest ribbon; up and down walk the other nodes in the same column.

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-sankey@0.15"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/chartjs.js"></script>

<div style="width: 700px; height: 400px">
  <canvas id="sankey-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('sankey-chart'), {
    type: 'sankey',
    data: {
      datasets: [{
        label: 'Energy',
        data: [
          { from: 'Coal', to: 'Electricity', flow: 34 },
          { from: 'Gas', to: 'Electricity', flow: 20 },
          { from: 'Electricity', to: 'Homes', flow: 30 },
          { from: 'Electricity', to: 'Industry', flow: 24 },
        ],
        labels: { Homes: 'Residential' },
      }],
    },
  });
</script>
```

`labels` maps a node key to the name the chart displays, and MAIDR announces the label rather than the key.

> **Sankey note:** a sankey is the one supported Chart.js type MAIDR does **not** outline. A flow diagram is navigated by *node* while the chart's elements are *flows*, and nothing in the navigation event names the node — so the adapter declines rather than outlining a ribbon chosen by position. Audio, text and braille are unaffected.

### Word Cloud

Requires [`chartjs-chart-wordcloud`](https://github.com/sgratzl/chartjs-chart-wordcloud). The terms go in `data.labels` and their weights in the dataset, which is the ordinary Chart.js split — and it is the reading, so a word's weight is announced as the number the author gave rather than recovered from how large it was drawn.

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-wordcloud@4"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/chartjs.js"></script>

<div style="width: 700px; height: 400px">
  <canvas id="wordcloud-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('wordcloud-chart'), {
    type: 'wordCloud',
    data: {
      labels: ['accessible', 'chart', 'audio', 'braille'],
      datasets: [{ label: 'Terms', data: [40, 25, 12, 8] }],
    },
  });
</script>
```

Terms are read in the order they were declared, not in the order the layout happened to place them — the largest word is drawn first on screen, but a reader sweeping left and right gets the author's order.

A term whose weight is `null` is skipped rather than announced as zero: a weight is what terms are compared by, and a zero would make the term look like the least common one rather than one the chart has no count for.

### Heatmap (Matrix)

Requires [`chartjs-chart-matrix`](https://github.com/kurkle/chartjs-chart-matrix). Matrix datasets use flat `{x, y, v}` entries — the MAIDR extractor collects unique X and Y labels in first-seen order and produces a `points[y][x]` grid.

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@2"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/chartjs.js"></script>

<div style="width: 700px; height: 400px">
  <canvas id="heatmap-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  const tasks = ['Math', 'Code', 'Writing', 'Reasoning'];
  const models = ['GPT-4', 'Claude', 'Gemini'];
  const scores = [
    [92, 88, 85, 90],
    [89, 91, 93, 88],
    [86, 84, 82, 85],
  ];

  const data = [];
  for (let yi = 0; yi < models.length; yi++) {
    for (let xi = 0; xi < tasks.length; xi++) {
      data.push({ x: tasks[xi], y: models[yi], v: scores[yi][xi] });
    }
  }

  new Chart(document.getElementById('heatmap-chart'), {
    type: 'matrix',
    data: {
      datasets: [{
        label: 'Task Performance',
        data,
        backgroundColor: (context) => {
          const value = context.raw?.v ?? 0;
          const alpha = Math.max(0, Math.min(1, (value - 70) / 25));
          return `rgba(255, 99, 132, ${alpha})`;
        },
        borderColor: 'rgba(255, 99, 132, 0.8)',
        borderWidth: 1,
        width: ({ chart }) => (chart.chartArea?.width ?? 0) / tasks.length - 1,
        height: ({ chart }) => (chart.chartArea?.height ?? 0) / models.length - 1,
      }],
    },
    options: {
      plugins: { title: { display: true, text: 'Model Scores by Task' }, legend: { display: false } },
      scales: {
        x: { type: 'category', labels: tasks, title: { display: true, text: 'Task' }, offset: true, grid: { display: false } },
        y: { type: 'category', labels: models, title: { display: true, text: 'Model' }, offset: true, grid: { display: false } },
      },
    },
  });
</script>
```

### Pie / Doughnut Chart

```html
<div style="width: 500px; height: 500px">
  <canvas id="pie-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('pie-chart'), {
    // 'doughnut' works the same way: it is a pie with a cutout, and the cutout
    // changes nothing about the data or the navigation.
    type: 'pie',
    data: {
      labels: ['Apples', 'Bananas', 'Cherries', 'Dates', 'Elderberries'],
      datasets: [{
        label: 'Units Sold',
        data: [30, 50, 20, 15, 10],
        backgroundColor: ['#4682b4', '#d2691e', '#6b8e23', '#8b4789', '#b8860b'],
      }],
    },
    options: {
      plugins: {
        title: { display: true, text: 'Fruit Sales' },
        maidr: { axes: { x: 'Fruit', y: 'Units' } },
      },
    },
  });
</script>
```

Left and Right move between slices; Up and Down are out of bounds, since a pie is a single row. Each slice announces its label, its value, and its share of the whole — "Fruit is Apples, Units is 30, Percentage is 24.0%". Slices whose value is `null` or `NaN` are dropped rather than counted as zero, so a gap in the data neither takes a share of the total nor pins the bottom of the range the other slices are pitched against.

## Multi-Panel Charts (Axis Stacking)

Chart.js has no facet API, but since v3.7 a single chart can render stacked panels via **axis stacking**: two or more scales of the same axis kind share a `stack` name and are laid out in separate, non-overlapping bands. Datasets pick their panel with `yAxisID` (or `xAxisID`).

MAIDR detects this layout automatically and exposes each panel as its own **subplot**: y-stacked scales become an N-rows-by-1-column figure, x-stacked scales become 1-row-by-N-columns (left to right). Navigation starts at the subplot level — arrow keys move between panels, `Enter` drills into a panel, `Escape` returns. Each panel announces its own value-axis label (from that scale's `title.text`, which also names the panel) while sharing the common index axis.

Because Chart.js draws to a `<canvas>`, MAIDR cannot measure panel geometry from the DOM the way it does for SVG charts, so y-stacked figures follow the MAIDR grammar's native (matplotlib-style) row convention: **grid rows are ordered bottom-first**. Up/Down arrows always move the way the panels look on canvas (Up goes to the panel above), but panel *numbering* is announced bottom-up — "Subplot 1" is the bottom panel and navigation enters the figure there.

```html
<div style="width: 700px; height: 500px">
  <canvas id="stacked-panels-chart"></canvas>
</div>
<script>
  Chart.register(maidrChartjs.maidrPlugin);

  new Chart(document.getElementById('stacked-panels-chart'), {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [
        { label: 'Price', data: [102, 110, 108, 121, 119, 127] }, // default yAxisID: 'y'
        { label: 'Volume', data: [34, 51, 42, 65, 48, 70], yAxisID: 'y2' },
      ],
    },
    options: {
      plugins: { title: { display: true, text: 'Stock Price and Trading Volume' } },
      scales: {
        x: { title: { display: true, text: 'Month' } },
        y: { stack: 'panels', stackWeight: 2, title: { display: true, text: 'Price ($)' } },
        y2: { stack: 'panels', stackWeight: 1, offset: true, title: { display: true, text: 'Volume (M shares)' } },
      },
    },
  });
</script>
```

Notes:

- Every supported chart type works inside panels; each panel's datasets are extracted with that panel's own scale, so per-panel `stacked: true` still maps to the `STACKED` trace type while another panel stays `DODGED`.
- Datasets that omit `yAxisID`/`xAxisID` are assigned to the **first declared** scale of that axis kind, exactly as Chart.js resolves them — including when your scales use custom ids like `price`/`volume`.
- Classic **dual-axis** charts (two y scales overlaying the same plot area) are *not* panels and remain a single subplot, exactly as before. Matching Chart.js layout rules, scales only band together when they share **both** the same `stack` name **and** the same `position` — different stack names, or the same name on opposite edges (e.g. `left`/`right`), stay a dual-axis overlay.
- Multiple `Chart` instances arranged in a page grid are still separate MAIDR figures; grouping several charts into one figure is not yet supported.

For programmatic use, `extractChartData(chart)` returns the extracted MAIDR schema together with a `layerDatasetIndices` map that ties each figure-unique layer id back to the Chart.js datasets that produced it.

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

| Feature | Vanilla JS (CDN) | React Component | Chart.js Adapter |
|---------|-----------------|-----------------|-------------------|
| Setup | `maidr-data` attribute with JSON | `data` prop on `<Maidr>` | `Chart.register(maidrPlugin)` once |
| Data source | Manual JSON schema | Manual JSON schema | Auto-extracted from Chart.js |
| Element addressing | Manual CSS selectors | Manual CSS selectors | Auto-generated from canvas elements |
| Configuration | Required | Required | Zero configuration |
| Chart types | All MAIDR types | All MAIDR types | [25 Chart.js types](#supported-chart-types) (incl. plugins) |
| Dynamic charts | Manual init | React lifecycle | Auto-handled per chart |

## npm Installation (Optional)

For bundler-based projects:

```bash
npm install maidr chart.js
```

```ts
import { Chart, registerables } from 'chart.js';
import { maidrPlugin } from 'maidr/chartjs';

Chart.register(...registerables, maidrPlugin);
```

Then create charts as usual — every instance gains MAIDR accessibility.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
