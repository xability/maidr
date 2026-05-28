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

| MAIDR Type | AnyChart Series | Example |
|-----------|----------------|---------|
| Bar | `bar`, `column` | [Bar chart](examples.html) |
| Line | `line`, `spline`, `step-line`, `area`, `step-area`, `spline-area` | [Line chart](examples.html) |
| Scatter | `scatter`, `marker`, `bubble` | [Scatter plot](examples.html) |
| Box Plot | `box` | [Box plot](examples.html) |
| Heatmap | `heatmap`, `heat` | [Heatmap](examples.html) |
| Candlestick | `candlestick`, `ohlc` | [Candlestick](examples.html) |

Area series are represented as line traces — the filled-area visual is lost in the accessible representation. A console warning is emitted when this downgrade occurs.

**Notes on chart-type detection:**

- **Heatmap** charts use AnyChart's separate `anychart-heatmap.min.js` module and expose a chart-level data API (no `getSeriesCount()`). The adapter detects them via `chart.getType()` returning `'heatmap'` or `'heat'`, with a defensive fallback when `getType()` is unavailable.
- **Candlestick** support also covers OHLC series. Both come from AnyChart's financial / stock module (`anychart-stock.min.js`). Each row is `[x, open, high, low, close]`; outlier and volume fields are not extracted by AnyChart's iterator API.

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

## How Highlighting Works (Advanced)

AnyChart's SVG output uses opaque, internally-generated ids (`ac_path_*`, `ac_rect_*`, `ac_layer_*`) and does not expose stable CSS classes. To still provide reliable per-point highlighting without forcing every consumer to write selectors, `bindAnyChart()` stamps stable `data-maidr-anychart-*` attributes onto the relevant SVG elements after the chart renders:

| Chart type | Attribute | Value format |
|------------|-----------|--------------|
| Bar / column | `data-maidr-anychart-bar` | `"<seriesIndex>-<pointIndex>"` |
| Line / area / spline | `data-maidr-anychart-line-point` | `"<seriesIndex>-<pointIndex>"` |
| Scatter / marker / bubble | `data-maidr-anychart-scatter-point` | `"<seriesIndex>-<pointIndex>"` |
| Box plot | `data-maidr-anychart-box` | `"<seriesIndex>-<pointIndex>"` |
| Heatmap | `data-maidr-anychart-heatmap-cell` | `"<rowIndex>-<colIndex>"` |
| Candlestick / OHLC | `data-maidr-anychart-candlestick-cell` | `"<seriesIndex>-<pointIndex>"` |

The adapter's generated `selectors` then target those attributes (e.g. `[data-maidr-anychart-bar="0-3"]`), which keeps highlighting stable across re-renders.

#### Layer discrimination

For heatmap and candlestick charts, the stamping logic must find the correct `<g>` layer holding the data paths. AnyChart applies a `clip-path="url(#ac_clip_*)"` attribute to series-data layers so that rendering is clipped to the plot area; chart-level layers (axes, gridlines, background) are intentionally **unclipped** so they can paint outside the plot area (axis labels, ticks, title space).

The adapter uses this `clip-path` presence as the primary discriminator when picking the series layer. Without it, the chosen layer can end up being the axes/background group — whose children outnumber the actual data paths — producing off-by-one highlighting (the first highlight covers the background and the last data point is missed). Defense-in-depth path filters also skip:

- Paths with `fill-opacity < 1` (hover / selection overlays).
- Degenerate paths whose `d` attribute contains a single SVG command (clip-path boundary sentinels).

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
| Chart types | All MAIDR types | All MAIDR types | 6 AnyChart families |
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
