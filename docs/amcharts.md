# amCharts 5 Integration

MAIDR ships an amCharts 5 *binder*. The recommended entry point, `bindAmCharts(root)`, mounts MAIDR over a rendered amCharts 5 `XYChart` and adds audio sonification, text descriptions, braille output, keyboard navigation, and a **visual highlight overlay** on the active data point. A lower-level `fromAmCharts(root)` returns plain MAIDR JSON (no highlighting) for the `maidr` attribute or the `<Maidr>` React component.

> **Note:** amCharts 5 is a commercial charting library and is **not** bundled with MAIDR — load it yourself. amCharts 4 has a different API and is not supported. The MAIDR amCharts adapter ships as both a UMD bundle (`dist/amcharts.js`, exposing the `maidrAmCharts` global for plain `<script>` tags) and an ES module (`dist/amcharts.mjs`, for bundlers via `import 'maidr/amcharts'`).

## Quick Start

Load amCharts 5 and MAIDR core, build your chart as usual, then convert it once it has rendered:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My amCharts 5 Chart</title>
    <!-- 1. Load amCharts 5 (core + XY) -->
    <script src="https://cdn.amcharts.com/lib/5/index.js"></script>
    <script src="https://cdn.amcharts.com/lib/5/xy.js"></script>
    <!-- 2. Load the MAIDR amCharts adapter (UMD; bundles MAIDR + React) -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/amcharts.js"></script>
  </head>
  <body>
    <div id="chartdiv" style="width: 600px; height: 400px"></div>

    <!-- 3. Build the chart -->
    <script>
      var root = am5.Root.new("chartdiv");
      var chart = root.container.children.push(am5xy.XYChart.new(root, {}));
      var xAxis = chart.xAxes.push(
        am5xy.CategoryAxis.new(root, { categoryField: "day", renderer: am5xy.AxisRendererX.new(root, {}) })
      );
      var yAxis = chart.yAxes.push(
        am5xy.ValueAxis.new(root, { renderer: am5xy.AxisRendererY.new(root, {}) })
      );
      var series = chart.series.push(
        am5xy.ColumnSeries.new(root, {
          name: "Tips", xAxis: xAxis, yAxis: yAxis, valueYField: "count", categoryXField: "day",
        })
      );
      var data = [
        { day: "Sat", count: 87 }, { day: "Sun", count: 76 },
        { day: "Thur", count: 62 }, { day: "Fri", count: 19 },
      ];
      xAxis.data.setAll(data);
      series.data.setAll(data);
    </script>

    <!-- 4. After the chart renders, mount MAIDR with canvas highlighting. -->
    <script>
      // amCharts validates data asynchronously; in production listen to a
      // series' "datavalidated" event instead of a fixed timeout.
      setTimeout(function () {
        maidrAmCharts.bindAmCharts(root, {
          title: 'Number of Tips by Day',
          axisLabels: { x: 'Day', y: 'Count' },
        });
      }, 1000);
    </script>
  </body>
</html>
```

Once bound, click the chart (or Tab to it) and MAIDR activates with audio, text, braille, arrow-key navigation, and a highlight box drawn on the active data point.

## How It Works

There are two entry points:

- **`bindAmCharts(root, options?)`** (recommended) — mounts the MAIDR UI over the chart and returns `{ maidr, dispose }`. Because it hands a live data object (not JSON) to MAIDR's React component, it can wire an `onNavigate` callback that drives the **canvas highlight overlay**. This is the only way to get visual highlighting (see below). `bindXYChart(chart, root, options?)` is the same when you already hold the chart reference.
- **`fromAmCharts(root, options?)`** — returns plain MAIDR JSON for the `maidr` HTML attribute or `<Maidr data={...}>`. Enables audio, text, and braille, but **not** visual highlighting, because the highlight callback is a function and cannot survive JSON serialization.

Both walk the chart's series, classify each one, and extract its data into MAIDR's [schema](SCHEMA.html). Each series becomes a layer; all line series merge into a single multi-line layer.

Series are classified by their amCharts class name and field configuration:

- `ColumnSeries` with one category axis → **bar**
- multiple `ColumnSeries` → **stacked**, **100%-stacked (normalized)**, or **dodged**, detected from each series' `stacked` flag and `valueYShow`/`valueXShow` setting
- `ColumnSeries` with both X and Y category axes → **heatmap** (heat value read from the `value` field)
- `ColumnSeries` on a value X axis with `openValueXField` bin edges → **histogram**
- `LineSeries` (incl. smoothed/step variants) → **line**

### Visual Highlighting

amCharts 5 renders to an HTML5 `<canvas>`, so there are no per-element SVG nodes for MAIDR's usual highlighting. `bindAmCharts` instead draws an absolutely-positioned outline box over the canvas at the active data point's pixel geometry (computed via am5's `sprite.toGlobal()`) — the same overlay approach the Chart.js adapter uses. The overlay re-anchors on resize. Call the returned `dispose()` to unmount MAIDR, remove the overlay, and restore the chart. Highlighting is unavailable on the `fromAmCharts` JSON/attribute path.

## Supported Chart Types

| Chart Type | amCharts 5 series | Detection signal |
|-----------|-------------------|------------------|
| Bar / Column | `ColumnSeries` (single) | category axis + value axis |
| Dodged / Grouped Bar | multiple `ColumnSeries` | no `stacked` flag |
| Stacked Bar | multiple `ColumnSeries` | `stacked: true` |
| 100% Stacked (Normalized) | multiple `ColumnSeries` | `stacked: true` + `valueYShow: "valueYTotalPercent"` |
| Line (single & multi-series) | `LineSeries` | line series class |
| Histogram | `ColumnSeries` | value X axis + `openValueXField` bin edges |
| Heatmap | `ColumnSeries` | category X **and** category Y axes + `value` field |

> Box plots, candlestick, scatter, violin, and smooth/regression layers are **not** supported by the amCharts binder. amCharts 5 has no dedicated scatter or box series, and there is no reliable runtime signal to distinguish a scatter (hidden-stroke `LineSeries`) from a normal line chart.

## Multi-Panel Charts

When one amCharts `Root` contains **multiple XYCharts** — amCharts' native multi-panel pattern (`root.container.set("layout", root.verticalLayout)` plus several `XYChart` children, or a `horizontalLayout`/`GridLayout`) — both `bindAmCharts` and `fromAmCharts` convert **each chart into its own MAIDR subplot**. The same applies to **am5stock `StockChart` panels** (`StockPanel` extends `XYChart`), which the binder finds by walking the root's container tree; scrollbar preview charts (`XYChartScrollbar`) are excluded.

```js
var root = am5.Root.new("chartdiv");
root.container.set("layout", root.verticalLayout);
var priceChart = root.container.children.push(am5xy.XYChart.new(root, { height: am5.percent(60) }));
var volumeChart = root.container.children.push(am5xy.XYChart.new(root, { height: am5.percent(40) }));
// ... axes, series, data for each chart ...
maidrAmCharts.bindAmCharts(root); // one MAIDR figure, two subplots
```

Details:

- **Navigation:** a multi-panel figure starts in subplot mode — arrow keys move between panels, Enter drills into a panel, Escape returns. Inside a panel, the usual data-point navigation applies.
- **Panel grid:** panels are arranged by their rendered position (rows clustered by top coordinate, sorted left-to-right), so vertical, horizontal, and grid layouts all map naturally. If geometry is not available yet (e.g. `fromAmCharts` called before layout), panels fall back to a single row in insertion order.
- **Panel names:** each chart's title (an `am5.Label` child of the chart) becomes the panel's display name in subplot summaries. Axis labels are read from each chart's own axes; the `axisLabels` option remains a figure-wide override.
- **Highlighting:** one overlay covers the whole root; each highlight box is clipped to the owning panel's plot area.
- `bindXYChart(chart, root)` / `fromXYChart(chart, containerEl)` still bind exactly one chart; `fromXYCharts(charts, containerEl)` converts a specific set of charts; `findXYCharts(root)` returns every chart the binder would find.

> Stacked value axes **within one** `XYChart` (the classic price+volume single-chart pattern) are *not* split into panels — amCharts cannot reliably distinguish that layout from a dual-scale overlay, so all series stay in one subplot. Charts in **separate Roots** (one `div` each) remain separate MAIDR figures.

## Code Examples

A complete, runnable page covering every supported type lives at [`examples/amcharts.html`](https://github.com/xability/maidr/blob/main/examples/amcharts.html). The snippets below show the per-type series configuration; the surrounding root/chart/axis boilerplate and the `fromAmCharts` conversion are identical to the Quick Start.

### Dodged / Grouped Bar

Multiple column series with **no** `stacked` flag render side-by-side and map to the `DODGED` trace type.

```js
function addSeries(name, field) {
  var s = chart.series.push(am5xy.ColumnSeries.new(root, {
    name: name, xAxis: xAxis, yAxis: yAxis, valueYField: field, categoryXField: "city",
  }));
  s.data.setAll(data);
}
addSeries("2020", "y2020");
addSeries("2025", "y2025");
```

### Stacked Bar

Add `stacked: true` to each column series; the binder maps these to the `STACKED` trace type.

```js
chart.series.push(am5xy.ColumnSeries.new(root, {
  name: "Survived", stacked: true,
  xAxis: xAxis, yAxis: yAxis, valueYField: "survived", categoryXField: "class",
}));
```

### 100% Stacked (Normalized) Bar

`stacked: true` plus `valueYShow: "valueYTotalPercent"` produces a normalized chart (`STACKED_NORMALIZED_BAR`). Set `calculateTotals: true` on the value axis so amCharts can compute the percentages.

```js
var yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
  calculateTotals: true, min: 0, max: 100, renderer: am5xy.AxisRendererY.new(root, {}),
}));
chart.series.push(am5xy.ColumnSeries.new(root, {
  name: "Survived", stacked: true, valueYShow: "valueYTotalPercent",
  xAxis: xAxis, yAxis: yAxis, valueYField: "survived", categoryXField: "class",
}));
```

### Multi-series Line

Each `LineSeries` becomes one line; the binder merges them into a single multi-line layer using the series names as group labels.

```js
chart.series.push(am5xy.LineSeries.new(root, {
  name: "Sales", xAxis: xAxis, yAxis: yAxis, valueYField: "sales", categoryXField: "year",
}));
chart.series.push(am5xy.LineSeries.new(root, {
  name: "Expenses", xAxis: xAxis, yAxis: yAxis, valueYField: "expenses", categoryXField: "year",
}));
```

### Histogram

amCharts 5 has no native histogram series. Use a `ColumnSeries` on a **value** X axis with `openValueXField` (bin start) and `valueXField` (bin end); the count goes in `valueYField`.

```js
var xAxis = chart.xAxes.push(am5xy.ValueAxis.new(root, { renderer: am5xy.AxisRendererX.new(root, {}) }));
var series = chart.series.push(am5xy.ColumnSeries.new(root, {
  name: "Frequency", xAxis: xAxis, yAxis: yAxis,
  valueYField: "count", valueXField: "to", openValueXField: "from",
}));
series.data.setAll([
  { from: 0, to: 10, count: 4 }, { from: 10, to: 20, count: 11 },
  { from: 20, to: 30, count: 18 }, { from: 30, to: 40, count: 9 },
]);
```

### Heatmap

A `ColumnSeries` with **both** a category X axis and a category Y axis forms a 2D grid; the binder reads the heat value from the `value` data field.

```js
var xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, { categoryField: "weekday", renderer: am5xy.AxisRendererX.new(root, {}) }));
var yAxis = chart.yAxes.push(am5xy.CategoryAxis.new(root, { categoryField: "hour", renderer: am5xy.AxisRendererY.new(root, { inversed: true }) }));
var series = chart.series.push(am5xy.ColumnSeries.new(root, {
  calculateAggregates: true, xAxis: xAxis, yAxis: yAxis,
  categoryXField: "weekday", categoryYField: "hour", valueField: "value",
}));
```

## Keyboard Controls

Once a chart is focused, use the standard MAIDR shortcuts:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between data points | Arrow keys | Arrow keys |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Move between layers | Page Up / Page Down | Page Up / Page Down |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |

For the full list, see the [Keyboard Controls](CONTROLS.html) reference.

## npm Installation (Optional)

For bundler-based projects:

```bash
npm install maidr @amcharts/amcharts5
```

```ts
import { bindAmCharts } from 'maidr/amcharts';

// root: am5.Root — mounts MAIDR + canvas highlight overlay, returns a handle.
const binding = bindAmCharts(root, { title: 'Sales by Day' });
// later: binding.dispose();
```

`bindAmCharts(root, options?)` finds every `XYChart` in `root.container` (one subplot per chart — see [Multi-Panel Charts](#multi-panel-charts)); `bindXYChart(chart, root, options?)` takes a chart you already hold. Options accept `title`, `subtitle`, `axisLabels: { x, y }`, plus `highlight` (default `true`) and `highlightColor`. Pass `{ highlight: false }` to mount the accessible UI without the overlay.

For the data-only path (no highlighting), use `fromAmCharts(root, options?)` / `fromXYChart(chart, containerEl, options?)`, which return MAIDR JSON for the `maidr` attribute or `<Maidr data={...}>`.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
