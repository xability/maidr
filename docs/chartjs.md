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
| Survival | `'line'` with `stepped` and `plugins.maidr.traceType` | — | [Survival curve](examples.html) |
| Scatter | `'scatter'` | — | [Scatter plot](examples.html) |
| Radar | `'radar'` | — | [Radar chart](examples.html) |
| Polar Area | `'polarArea'` | — | [Radar chart](examples.html) |
| Box Plot | `'boxplot'` | `@sgratzl/chartjs-chart-boxplot` | [Box plot](examples.html) |
| Candlestick | `'candlestick'` | `chartjs-chart-financial` + a date adapter | [Candlestick](examples.html) |
| Heatmap | `'matrix'` | `chartjs-chart-matrix` | [Heatmap](examples.html) |
| Pie / Doughnut | `'pie'`, `'doughnut'` | — | [Pie chart](examples.html) |
| Gauge | `'doughnut'` with `circumference` under 360 and two values | — | [Gauge](examples.html) |

> **Pie note:** a pie has no Chart.js scales, so there is no axis title to read. `axes.x` and `axes.y` default to `Category` and `Value`; set `plugins.maidr.axes` to name what the slice labels and their values actually mean. Multiple datasets are concentric rings, not slices of one circle — each becomes its own MAIDR layer with its own total and percentages, and Page Up / Page Down move between them.

> **Radar note:** a radar and a polar area are drawn against a single radial `r` scale, so `axes.y` reads `scales.r.title.text` and `axes.x` defaults to `Category` — set `plugins.maidr.axes` to name what the spokes and their magnitudes mean. Both are read as a multi-series layer, one row per dataset and one column per spoke, with each spoke's stereo position following its angle rather than its index.

### Charts Chart.js Does Not Declare

Chart.js has no configuration for a waterfall, a bump chart, a normalized area or a diverging bar — each is a recipe built out of a plain bar or line chart — so MAIDR reads them off the **values**. Each test is deliberately strict, because announcing a chart as something it is not is worse than announcing it plainly:

- **Waterfall** — one series of `[start, end]` bars on the default vertical index axis where each step begins where the previous one ended. Bars that sit on the baseline (`start` of `0`) are read as the opening, closing or a subtotal. Unchained intervals are read as a gantt instead.
- **Gantt** — any other `[start, end]` bar chart. `indexAxis: 'y'` is the ordinary schedule, one lane per label; several datasets put several intervals in the same lane, each named by its dataset label. A lane whose entry is `null` stays a navigable row with nothing booked. Bounds may be numbers or `Date`s; on a `type: 'time'` scale MAIDR announces both ends as dates and measures lengths in milliseconds, so set `plugins.maidr.unit` when the schedule reads in days or sprints.
- **Normalized area** — two or more stacked, filled line datasets whose every category totals the same whole (100 or 1, within half a percent so rounded shares still count).
- **Bump** — a line chart with `scales.y.reverse` whose values at every period are a permutation of `1..N` across the series. The reversed axis alone is not enough; the permutation is what makes the rank reading safe.
- **Diverging bar** — a stacked bar chart whose datasets each sit wholly on one side of the baseline, with both sides occupied. The values stay signed: MAIDR pitches the magnitude and announces the side.
- **Dot plot** — a line chart whose every dataset sets `showLine: false` on a category axis. This one Chart.js does say outright: switching the line off is its own way of drawing a Cleveland dot plot. Unjoined points along a *linear* axis are a scatter plot drawn by the line controller, and stay one.
- **Gauge** — a `doughnut` swept through less than the full circle (`circumference` under 360) whose single dataset holds exactly two values: the measure, and the rest of the dial drawn empty. The remainder is spent on the dial's `max` rather than announced as a second reading.

### Charts Only the Page Can Declare

Three readings are shape-identical to another recipe, so no test on the config or the values can reach them. Set `plugins.maidr.traceType` to say which figure the chart is; the declaration wins over every heuristic above, in both directions — declaring `pie` on a two-slice half-doughnut keeps it a pie, and declaring `gantt` on a chained bar chart keeps it a schedule.

- **Dumbbell** (`traceType: 'dumbbell'`) — a horizontal floating bar chart, which is the same `[start, end]` datum a one-interval-per-lane gantt uses. `plugins.maidr.startLabel` and `endLabel` name the two ends ("1990", "2020"); without them the reader is told which dot they are on but not which year it is. Rows with no pair are skipped rather than kept as empty rows, unlike a gantt lane.
- **Survival** (`traceType: 'survival'`) — a `stepped: 'after'` line, which is how every staircase is drawn. Chart.js ignores properties it does not know, so ride the two things a survival figure carries and a step chart does not on the points themselves: `{x, y, censored: true}` for a censoring mark and `{yMin, yMax}` for the confidence band. Each dataset is one arm, gathered into a single layer.
- **Gauge** (`traceType: 'gauge'`) — for a dial the geometry above misses, and for the target and bands Chart.js records only as styling: `plugins.maidr.target` is the bullet marker and `plugins.maidr.bands` is a `[{ to, label }]` list in ascending order.

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
| Chart types | All MAIDR types | All MAIDR types | 8 Chart.js types (incl. plugins) |
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
