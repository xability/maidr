# Highcharts Integration

MAIDR provides a dedicated adapter for [Highcharts](https://www.highcharts.com/) that converts a rendered chart instance into MAIDR-compatible data. Once converted, the chart is fully accessible via audio sonification, text descriptions, braille output, and keyboard navigation.

Highcharts is **not bundled** — bring your own copy. The adapter only reads from the Highcharts chart API; it has zero runtime dependency on Highcharts itself.

## Quick Start

Render your chart with Highcharts, convert it with `maidrHighcharts.highchartsToMaidr()`, attach the result as a `maidr-data` attribute, and let MAIDR pick it up:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Highcharts Chart</title>
    <!-- 1. Load Highcharts -->
    <script src="https://cdn.jsdelivr.net/npm/highcharts/highcharts.js"></script>
    <!-- 2. Load MAIDR core + the Highcharts adapter -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/highcharts.js"></script>
  </head>
  <body>
    <div id="chart" style="width: 700px; height: 500px"></div>

    <script>
      // 3. Render your chart normally
      const chart = Highcharts.chart('chart', {
        chart: { type: 'column' },
        title: { text: 'Tips by Day' },
        xAxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
        yAxis: { title: { text: 'Count' } },
        series: [{ name: 'Tips', data: [20, 14, 23, 25, 22] }],
      });

      // 4. Convert and attach to the container
      const maidrData = maidrHighcharts.highchartsToMaidr(chart, { id: 'chart' });
      document.getElementById('chart').setAttribute('maidr-data', JSON.stringify(maidrData));

      // 5. (Optional) bidirectional tooltip + point highlighting
      maidrHighcharts.createHighchartsSync(chart);
    </script>
  </body>
</html>
```

The adapter exposes a global `maidrHighcharts` object with `highchartsToMaidr()` and `createHighchartsSync()`. This works directly from `file://` URLs — no module server required.

Once the page loads, click on the chart (or Tab to it) and MAIDR activates with:

- **Audio sonification** — tones representing data values
- **Text descriptions** — spoken via screen readers
- **Braille output** — refreshable braille display support
- **Keyboard navigation** — arrow keys to move between data points

## How It Works

The adapter pipeline runs in three short steps:

1. **Read** — `highchartsToMaidr(chart)` reads `chart.series`, `chart.xAxis`, `chart.yAxis`, `chart.title`, and (when present) `chart.subtitle` / `chart.caption`. Each series is mapped to a MAIDR `TraceType` based on its rendered type (`bar`, `line`, `scatter`, etc.) and Highcharts `stacking` mode.
2. **Locate** — Scoped CSS selectors are generated per chart container so MAIDR can highlight the correct SVG element for the active data point.
3. **Sync (optional)** — `createHighchartsSync(chart)` wires MAIDR's navigation events back into Highcharts' native `tooltip.refresh()` and `point.setState('hover')`, so the visual cursor follows the user as they navigate.

## Installation

### CDN (script tags — works on `file://` and any web server)

```html
<script src="https://cdn.jsdelivr.net/npm/highcharts/highcharts.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/highcharts.js"></script>
<script>
  // Globals: Highcharts, maidrHighcharts
  const maidrData = maidrHighcharts.highchartsToMaidr(chart, { id: 'chart' });
</script>
```

> **CDN note:** Use `cdn.jsdelivr.net/npm/highcharts/...` rather than `code.highcharts.com/...` for local `file://` testing — the official Highcharts CDN's WAF blocks requests with no `Referer` header (which `file://` origins always send), returning HTTP 403. jsDelivr does not have this restriction.

### ESM (modern build tooling / bundlers)

```html
<script src="https://cdn.jsdelivr.net/npm/highcharts/highcharts.js"></script>
<script type="module">
  import { createHighchartsSync, highchartsToMaidr } from 'https://cdn.jsdelivr.net/npm/maidr/dist/highcharts.mjs';
</script>
```

> ESM imports require an HTTP(S) origin (CORS blocks them on `file://`). For local-file demos, use the UMD `dist/highcharts.js` bundle above.

### npm

```bash
npm install maidr highcharts
```

```ts
import Highcharts from 'highcharts';
import { createHighchartsSync, highchartsToMaidr } from 'maidr/highcharts';
```

## Supported Chart Types

| MAIDR Type | Highcharts series type(s) | Example |
|------------|---------------------------|---------|
| Bar | `bar`, `column` | [highcharts-bar.html](highcharts-bar.html) |
| Line | `line`, `spline`, `area`, `areaspline` | [highcharts-line.html](highcharts-line.html) |
| Scatter | `scatter` | [highcharts-scatter.html](highcharts-scatter.html) |
| Box Plot | `boxplot` | [highcharts-box.html](highcharts-box.html) |
| Heatmap | `heatmap` (requires `modules/heatmap.js`) | [highcharts-heatmap.html](highcharts-heatmap.html) |
| Histogram | `histogram` (requires `modules/histogram-bellcurve.js`) | [highcharts-histogram.html](highcharts-histogram.html) |
| Candlestick | `candlestick`, `ohlc` (Highstock) | [highcharts-candlestick.html](highcharts-candlestick.html) |
| Stacked Bar | `column`/`bar` + `plotOptions.column.stacking: 'normal'` | [highcharts-stacked.html](highcharts-stacked.html) |
| Dodged (Grouped) Bar | `column`/`bar` (default, no stacking) with multiple series | [highcharts-dodged.html](highcharts-dodged.html) |
| Normalized Bar | `column`/`bar` + `plotOptions.column.stacking: 'percent'` | [highcharts-normalized.html](highcharts-normalized.html) |

## Multi-Panel Charts

MAIDR supports two multi-panel patterns. In both cases the panels become a MAIDR subplot grid: arrow keys move between panels, `Enter` drills into a panel, and `Escape` returns to panel navigation.

### Panes within one chart

A single Highcharts chart can stack multiple panes via `yAxis` `top`/`height` (and side-by-side via `xAxis` `left`/`width`) — the classic Highstock price + volume layout. `highchartsToMaidr()` detects panes automatically from the rendered axis geometry and emits one subplot per pane. No new API is needed:

```js
const chart = Highcharts.chart('panes-chart', {
  title: { text: 'ACME Stock — Price and Volume' },
  xAxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  yAxis: [
    { title: { text: 'Price ($)' }, height: '60%' },
    { title: { text: 'Volume' }, top: '70%', height: '30%', offset: 0 },
  ],
  series: [
    { type: 'line', name: 'Price', data: [150, 152, 149, 153, 155], yAxis: 0 },
    { type: 'column', name: 'Volume', data: [1200, 1450, 980, 1610, 1330], yAxis: 1 },
  ],
});

const maidrData = maidrHighcharts.highchartsToMaidr(chart, { id: 'panes-chart' });
```

Notes:

- Each pane's panel name comes from its first series' name, falling back to the pane's y-axis title.
- Highstock's internal navigator series is excluded automatically.
- Ambiguous layouts (overlapping axis bands, dual-axis overlays sharing the same plot area) safely fall back to today's single-panel output.

See [highcharts-panes.html](highcharts-panes.html) for a full example.

### Multiple chart instances (small multiples)

Highcharts has no native faceting API — small multiples are built as separate chart instances in separate divs. `highchartsGridToMaidr()` combines them into one MAIDR figure (one subplot per chart). Attach the result to a wrapper element enclosing all the chart divs:

```js
const charts = [
  Highcharts.chart('region-north', { title: { text: 'North' }, /* ... */ }),
  Highcharts.chart('region-east', { title: { text: 'East' }, /* ... */ }),
  Highcharts.chart('region-south', { title: { text: 'South' }, /* ... */ }),
  Highcharts.chart('region-west', { title: { text: 'West' }, /* ... */ }),
];

const maidrData = maidrHighcharts.highchartsGridToMaidr(charts, {
  title: 'Quarterly Sales by Region',
  layout: { columns: 2 }, // chunk the flat list into a 2x2 grid
});

document.getElementById('wrapper').setAttribute('maidr-data', JSON.stringify(maidrData));
```

Pass charts in visual reading order (top-left first). A 2D array (`Chart[][]`) maps rows 1:1 instead of using `layout`. Each chart's own title becomes its panel name. If a member chart itself contains multiple panes (stacked `yAxis` bands), the same pane detection as `highchartsToMaidr()` applies: each pane becomes its own cell, flattened into that chart's grid row (a console warning notes the flattening). See [highcharts-grid.html](highcharts-grid.html) for a full example.

## API Reference

### `highchartsToMaidr(chart, options?)`

Converts a rendered Highcharts chart into a `Maidr` data object.

| Parameter | Type | Description |
|-----------|------|-------------|
| `chart` | `HighchartsChart` | Return value of `Highcharts.chart()` (the chart must already be rendered). |
| `options.id` | `string?` | Override the generated chart ID. Defaults to `highcharts-{n}`. |
| `options.title` | `string?` | Override the chart title. Defaults to `chart.title.textStr`. |
| `options.seriesIndices` | `number[]?` | Convert only specific series by index. Default: all visible series. |

Returns a `Maidr` object ready to assign to a `maidr-data` attribute, pass to the `<Maidr>` React component, or serialize for downstream tooling. Multi-pane charts produce a subplot grid (see [Multi-Panel Charts](#multi-panel-charts)).

### `highchartsGridToMaidr(charts, options?)`

Combines multiple rendered chart instances into one `Maidr` figure with subplot navigation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `charts` | `HighchartsChart[]` or `HighchartsChart[][]` | Rendered chart instances in visual reading order. A 2D array maps 1:1 to the subplot grid (ragged rows OK). |
| `options.id` | `string?` | Override the generated figure ID. Defaults to `highcharts-grid-{n}`. |
| `options.title` | `string?` | Figure-level title announced for the whole grid. |
| `options.subtitle` | `string?` | Figure-level subtitle. |
| `options.caption` | `string?` | Figure-level caption. |
| `options.layout` | `{ rows?: number; columns?: number }?` | Chunks a flat chart list into a grid (`columns` = charts per row). Ignored for 2D input. |

Charts with no convertible series are skipped with a console warning; if **no** chart in the grid produces any convertible series, an `Error` is thrown (attaching an empty figure would break MAIDR on focus). A member chart with multiple panes contributes one cell per pane, flattened into its row. Attach the returned JSON as `maidr-data` on a wrapper element that encloses all the chart containers.

### `createHighchartsSync(chart)`

Creates a bidirectional sync controller so the MAIDR cursor and Highcharts' native tooltip/highlight stay in lock-step. Returns a `HighchartsSync` object with a `dispose()` method for cleanup.

```ts
const sync = maidrHighcharts.createHighchartsSync(chart);
// ... user navigates with MAIDR; Highcharts tooltip follows automatically
sync.dispose();
```

### Type exports

```ts
import type {
  HighchartsAdapterOptions,
  HighchartsAxis,
  HighchartsChart,
  HighchartsGridOptions,
  HighchartsPoint,
  HighchartsSeries,
  HighchartsSync,
} from 'maidr/highcharts';
```

These are **minimal structural types** — they describe just the subset of the Highcharts API that the adapter actually reads, so MAIDR can stay version-independent of Highcharts releases.

## Code Examples

### Bar / Column Chart

```js
const chart = Highcharts.chart('bar-chart', {
  chart: { type: 'column' },
  title: { text: 'Number of Tips by Day' },
  xAxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], title: { text: 'Day' } },
  yAxis: { title: { text: 'Count' } },
  series: [{ name: 'Tips', data: [20, 14, 23, 25, 22] }],
});

const maidrData = maidrHighcharts.highchartsToMaidr(chart, { id: 'bar-chart' });
document.getElementById('bar-chart').setAttribute('maidr-data', JSON.stringify(maidrData));
```

### Multi-Line Chart

```js
const chart = Highcharts.chart('line-chart', {
  chart: { type: 'line' },
  title: { text: 'Weekly Sales Comparison' },
  xAxis: { categories: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'], title: { text: 'Week' } },
  yAxis: { title: { text: 'Sales ($K)' } },
  series: [
    { name: 'Series A', data: [10, 15, 13, 17, 22, 19, 25] },
    { name: 'Series B', data: [16, 5, 11, 9, 14, 20, 12] },
  ],
});
```

### Scatter Plot

```js
const chart = Highcharts.chart('scatter-chart', {
  chart: { type: 'scatter' },
  title: { text: 'Iris Sepal vs Petal Length' },
  xAxis: { title: { text: 'Sepal Length (cm)' } },
  yAxis: { title: { text: 'Petal Length (cm)' } },
  series: [{
    name: 'Setosa',
    data: [[5.1, 1.4], [4.9, 1.4], [4.7, 1.3], [4.6, 1.5], [5.0, 1.4]],
  }],
});
```

### Box Plot

```js
const chart = Highcharts.chart('box-chart', {
  chart: { type: 'boxplot' },
  title: { text: 'Sepal Length Distribution' },
  xAxis: { categories: ['Setosa', 'Versicolor', 'Virginica'] },
  yAxis: { title: { text: 'Sepal Length (cm)' } },
  series: [{
    name: 'Observations',
    data: [
      // [low, q1, median, q3, high]
      [2.3, 2.7, 3.0, 3.4, 4.5],
      [4.7, 5.2, 5.9, 6.3, 7.0],
      [6.0, 6.5, 7.1, 7.5, 8.0],
    ],
  }],
});
```

### Heatmap

> Requires the Highcharts heatmap module: `<script src="https://cdn.jsdelivr.net/npm/highcharts/modules/heatmap.js"></script>`.

```js
const chart = Highcharts.chart('heatmap-chart', {
  chart: { type: 'heatmap' },
  title: { text: 'Activity Heatmap' },
  xAxis: { categories: ['Mon', 'Tue', 'Wed'] },
  yAxis: { categories: ['Morning', 'Afternoon', 'Evening'] },
  colorAxis: { min: 0, minColor: '#FFFFFF', maxColor: '#7CB5EC' },
  series: [{
    name: 'Activity',
    data: [[0, 0, 1], [0, 1, 20], [0, 2, 30], [1, 0, 20], [1, 1, 1], [1, 2, 60]],
  }],
});
```

### Histogram

> Requires the Highcharts histogram module: `<script src="https://cdn.jsdelivr.net/npm/highcharts/modules/histogram-bellcurve.js"></script>`.

```js
const chart = Highcharts.chart('histogram-chart', {
  title: { text: 'Distribution of Values' },
  series: [
    { type: 'histogram', name: 'Histogram', baseSeries: 's1', binsNumber: 15 },
    { type: 'scatter', id: 's1', name: 'Samples', data: samples, visible: false },
  ],
});
```

### Candlestick

> Requires Highstock: `<script src="https://cdn.jsdelivr.net/npm/highcharts/highstock.js"></script>`.

```js
const chart = Highcharts.chart('candlestick-chart', {
  chart: { type: 'candlestick' },
  title: { text: 'Stock Price' },
  xAxis: { categories: ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'] },
  yAxis: { title: { text: 'Price ($)' } },
  series: [{
    name: 'AAPL',
    data: [
      // [open, high, low, close]
      [150.0, 153.0, 149.0, 152.5],
      [152.5, 154.0, 151.0, 151.0],
      [151.0, 154.5, 150.0, 153.0],
      [153.0, 155.0, 152.0, 154.5],
    ],
  }],
});
```

### Stacked Bar

```js
const chart = Highcharts.chart('stacked-chart', {
  chart: { type: 'column' },
  title: { text: 'Quarterly Revenue Breakdown' },
  xAxis: { categories: ['Q1', 'Q2', 'Q3', 'Q4'] },
  yAxis: { title: { text: 'Revenue ($M)' } },
  plotOptions: { column: { stacking: 'normal' } },
  series: [
    { name: 'Product A', data: [20, 14, 23, 25] },
    { name: 'Product B', data: [15, 18, 20, 22] },
  ],
});
```

### Dodged (Grouped) Bar

```js
const chart = Highcharts.chart('dodged-chart', {
  chart: { type: 'column' },
  title: { text: 'Quarterly Sales by Product' },
  xAxis: { categories: ['Q1', 'Q2', 'Q3', 'Q4'] },
  yAxis: { title: { text: 'Revenue ($M)' } },
  // No `stacking` option = grouped (dodged) by default.
  series: [
    { name: 'Product A', data: [20, 14, 23, 25] },
    { name: 'Product B', data: [15, 18, 20, 22] },
  ],
});
```

### Normalized (Percent-Stacked) Bar

```js
const chart = Highcharts.chart('normalized-chart', {
  chart: { type: 'column' },
  title: { text: 'Quarterly Revenue Share by Product' },
  xAxis: { categories: ['Q1', 'Q2', 'Q3', 'Q4'] },
  yAxis: { title: { text: 'Share (%)' } },
  plotOptions: { column: { stacking: 'percent' } },
  series: [
    { name: 'Product A', data: [20, 14, 23, 25] },
    { name: 'Product B', data: [15, 18, 20, 22] },
  ],
});
```

## Advanced Usage

### Inverted charts (horizontal bars)

The adapter inspects `chart.options.chart.inverted` and produces a horizontal-oriented MAIDR layer when set. No extra configuration is needed:

```js
Highcharts.chart('h-bar', {
  chart: { type: 'bar', inverted: true },
  // ...
});
```

### Filtering series

Pass `seriesIndices` to convert only specific series:

```js
const maidrData = maidrHighcharts.highchartsToMaidr(chart, {
  id: 'chart',
  seriesIndices: [0, 2], // skip series index 1
});
```

### Visual sync lifecycle

`createHighchartsSync()` attaches event listeners to the chart container. Always call `sync.dispose()` if you destroy the chart manually (otherwise listeners leak):

```js
const sync = maidrHighcharts.createHighchartsSync(chart);

// later:
chart.destroy();
sync.dispose();
```

### Re-rendering charts

If you call `chart.update()` or `chart.addSeries()`, re-run `maidrHighcharts.highchartsToMaidr()` and update the `maidr-data` attribute so MAIDR sees the new state. Reload `maidr.js` only on first mount.

## Keyboard Controls

Once a chart is focused, use standard MAIDR keyboard shortcuts:

| Function | Key (Windows / Linux) | Key (macOS) |
|----------|----------------------|-------------|
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

| Feature | Vanilla JS (CDN) | React Component | Highcharts Adapter |
|---------|------------------|-----------------|--------------------|
| Setup | `maidr-data` attribute with JSON | `data` prop on `<Maidr>` | `highchartsToMaidr(chart)` + attribute |
| Data source | Manual JSON schema | Manual JSON schema | Auto-extracted from chart instance |
| SVG selectors | Manual CSS selectors | Manual CSS selectors | Auto-generated, scoped per container |
| Chart types | All MAIDR types | All MAIDR types | 10 Highcharts series types |
| Visual tooltip sync | Manual | Manual | Built-in via `createHighchartsSync()` |

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
