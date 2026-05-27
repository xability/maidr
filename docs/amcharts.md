# amCharts 5 Integration

MAIDR ships an amCharts 5 *binder* that converts a rendered amCharts 5 `XYChart` into MAIDR's accessibility schema. Pass the result to the `<Maidr>` React component, or set it as a `maidr` attribute on the chart container, and the chart gains audio sonification, text descriptions, braille output, and keyboard navigation.

> **Note:** amCharts 5 is a commercial charting library and is **not** bundled with MAIDR — load it yourself. amCharts 4 has a different API and is not supported. The MAIDR amCharts adapter ships as an ES module (`dist/amcharts.mjs`).

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
    <!-- 2. Load MAIDR core -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
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

    <!-- 4. After the chart renders, convert it to MAIDR data -->
    <script type="module">
      import { fromAmCharts } from 'https://cdn.jsdelivr.net/npm/maidr/dist/amcharts.mjs';

      // amCharts validates data asynchronously; in production listen to a
      // series' "datavalidated" event instead of a fixed timeout.
      setTimeout(() => {
        const maidrData = fromAmCharts(root, {
          title: 'Number of Tips by Day',
          axisLabels: { x: 'Day', y: 'Count' },
        });
        document.getElementById('chartdiv').setAttribute('maidr', JSON.stringify(maidrData));
      }, 1000);
    </script>
  </body>
</html>
```

Once the `maidr` attribute is set, click the chart (or Tab to it) and MAIDR activates with audio, text, braille, and arrow-key navigation.

## How It Works

The amCharts binder is a pure data-conversion step — it does not render anything itself:

1. **Build** — you create the amCharts 5 chart normally.
2. **Convert** — `fromAmCharts(root)` (or `fromXYChart(chart, containerEl)`) walks the chart's series, classifies each one, and extracts its data into MAIDR's [schema](SCHEMA.html). Each series becomes a layer; all line series merge into a single multi-line layer.
3. **Activate** — pass the result to `<Maidr data={...}>`, or set it as a `maidr` attribute on the container. MAIDR's `MutationObserver` detects the attribute and mounts itself — the same async pattern used by the Google Charts adapter.

Series are classified by their amCharts class name and field configuration:

- `ColumnSeries` with one category axis → **bar**
- multiple `ColumnSeries` → **stacked**, **100%-stacked (normalized)**, or **dodged**, detected from each series' `stacked` flag and `valueYShow`/`valueXShow` setting
- `ColumnSeries` with both X and Y category axes → **heatmap** (heat value read from the `value` field)
- `ColumnSeries` on a value X axis with `openValueXField` bin edges → **histogram**
- `LineSeries` (incl. smoothed/step variants) → **line**

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
import { fromAmCharts } from 'maidr/amcharts';
import { Maidr } from 'maidr/react';

const data = fromAmCharts(root); // root: am5.Root

// Then render with the React component:
// <Maidr data={data}><div id="chartdiv" /></Maidr>
```

`fromAmCharts(root, options?)` finds the first `XYChart` in `root.container`. If you already hold the chart reference, call `fromXYChart(chart, containerEl, options?)` directly. The `options` object accepts `title`, `subtitle`, and `axisLabels: { x, y }` overrides.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
