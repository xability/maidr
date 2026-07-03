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
| Line | `'line'` | — | [Line chart](examples.html) |
| Scatter | `'scatter'` | — | [Scatter plot](examples.html) |
| Box Plot | `'boxplot'` | `@sgratzl/chartjs-chart-boxplot` | [Box plot](examples.html) |
| Candlestick | `'candlestick'` | `chartjs-chart-financial` + a date adapter | [Candlestick](examples.html) |
| Heatmap | `'matrix'` | `chartjs-chart-matrix` | [Heatmap](examples.html) |

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

## Multi-Panel Charts (Axis Stacking)

Chart.js has no facet API, but since v3.7 a single chart can render stacked panels via **axis stacking**: two or more scales of the same axis kind share a `stack` name and are laid out in separate, non-overlapping bands. Datasets pick their panel with `yAxisID` (or `xAxisID`).

MAIDR detects this layout automatically and exposes each panel as its own **subplot**: y-stacked scales become an N-rows-by-1-column figure, x-stacked scales become 1-row-by-N-columns, ordered by on-canvas position. Navigation starts at the subplot level — arrow keys move between panels, `Enter` drills into a panel, `Escape` returns. Each panel announces its own value-axis label (from that scale's `title.text`, which also names the panel) while sharing the common index axis.

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
- Classic **dual-axis** charts (two y scales overlaying the same plot area, no `stack` option) are *not* panels and remain a single subplot, exactly as before.
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
