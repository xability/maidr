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

Both walk the chart's series, classify each one, and extract its data into MAIDR's [schema](SCHEMA.html). Each series becomes a layer; all line series merge into a single multi-line layer. If no chart contains a supported series *with data*, both entry points throw a descriptive error — bind after your data has been set (see the `datavalidated` note in the Quick Start).

Series are classified by their amCharts class name and field configuration:

- `ColumnSeries` with one category axis → **bar**
- multiple `ColumnSeries` → **stacked**, **100%-stacked (normalized)**, or **dodged**, detected from each series' `stacked` flag and `valueYShow`/`valueXShow` setting
- `ColumnSeries` with both X and Y category axes → **heatmap** (heat value read from the `value` field)
- `ColumnSeries` on a value X axis with `openValueXField` bin edges → **histogram**
- `LineSeries` (incl. smoothed variants) → **line**, or **area** / **stacked area** / **100% stacked area** when its `fills` are visible
- `StepLineSeries` → **step**
- `RadarLineSeries` → **radar**; `RadarColumnSeries` → **polar area**
- `am5percent.FunnelSeries` (and `PyramidSeries`, `PictorialStackedSeries`) → **funnel**
- `ColumnSeries` with `openValueYField` on a category X axis → **waterfall** when the bars chain (each opens where the previous one closed), **dumbbell** when they do not
- `ColumnSeries` with `openValueXField` on a category Y axis → **gantt**
- `am5hierarchy.Treemap` → **treemap**; `am5hierarchy.Partition` → **icicle**

### Visual Highlighting

amCharts 5 renders to an HTML5 `<canvas>`, so there are no per-element SVG nodes for MAIDR's usual highlighting. `bindAmCharts` instead draws an absolutely-positioned outline box over the canvas at the active data point's pixel geometry (computed via am5's `sprite.toGlobal()`) — the same overlay approach the Chart.js adapter uses. The overlay re-anchors on resize. Call the returned `dispose()` to unmount MAIDR, remove the overlay, and restore the chart. Highlighting is unavailable on the `fromAmCharts` JSON/attribute path.

## Supported Chart Types

| Chart Type | amCharts 5 series | Detection signal |
|-----------|-------------------|------------------|
| Bar / Column | `ColumnSeries` (single) | category axis + value axis |
| Dodged / Grouped Bar | multiple `ColumnSeries` | no `stacked` flag |
| Stacked Bar | multiple `ColumnSeries` | `stacked: true` |
| 100% Stacked (Normalized) | multiple `ColumnSeries` | `stacked: true` + `valueYShow: "valueYTotalPercent"` |
| Line (single & multi-series) | `LineSeries` | line series class, no visible fill |
| Area | `LineSeries` | visible `fills` template |
| Stacked Area | multiple `LineSeries` | visible fills + `stacked: true` |
| 100% Stacked Area | multiple `LineSeries` | visible fills + `stacked: true` + `valueYShow: "valueYTotalPercent"` |
| Step (single & multi-series) | `StepLineSeries` | step-line series class |
| Histogram | `ColumnSeries` | value X axis + `openValueXField` bin edges |
| Heatmap | `ColumnSeries` | category X **and** category Y axes + `value` field |
| Pie / Doughnut | `am5percent.PieSeries` | series class (requires `percent.js`) |
| Funnel / Pyramid | `am5percent.FunnelSeries`, `PyramidSeries`, `PictorialStackedSeries` | series class (requires `percent.js`) |
| Radar / Spider | `am5radar.RadarLineSeries` | series class (requires `radar.js`) |
| Polar Area / Coxcomb | `am5radar.RadarColumnSeries` | series class (requires `radar.js`) |
| Waterfall / Bridge | `ColumnSeries` | category X axis + `openValueYField`, bars chaining end-to-end |
| Dumbbell / Barbell | `ColumnSeries` | category X axis + `openValueYField`, bars **not** chaining |
| Gantt / Timeline | `ColumnSeries` | category Y axis + `openValueXField` (or `openDateXField`) |
| Treemap | `am5hierarchy.Treemap` | series class (requires `hierarchy.js`) |
| Icicle | `am5hierarchy.Partition` | series class (requires `hierarchy.js`) |

A `StepLineSeries` is piecewise constant — the value is held and then jumps — so it maps to MAIDR's step trace rather than to a line, and is announced and navigated as a step plot. amCharts positions the staircase from the axis cell rather than reporting a step convention, so the adapter emits no `stepDirection` and MAIDR's description does not name one.

A `PieSeries` lives in amCharts' separate `percent.js` module and is bound to no axis, so `axes.x` and `axes.y` default to `Label` and `Value`; the `axisLabels` option overrides both. A doughnut is a `PieChart` with an `innerRadius` and reads identically. Slices with no category or no numeric value are skipped rather than counted as zero.

A `FunnelSeries` lives in the same `percent.js` module, inside a `SlicedChart` rather than a `PieChart`, and is likewise bound to no axis — its dimensions default to `Stage` and `Value`. Its pyramid and pictorial-stack siblings carry the same ordered `category`/`value` stages and are read the same way.

`RadarLineSeries` and `RadarColumnSeries` need `radar.js` on top of `xy.js`; a `RadarChart` extends `XYChart`, so the binder finds it with the rest.

> Box plots, candlestick, scatter, violin, and smooth/regression layers are **not** supported by the amCharts binder. amCharts 5 has no dedicated scatter or box series, and there is no reliable runtime signal to distinguish a scatter (hidden-stroke `LineSeries`) from a normal line chart.

## Multi-Panel Charts

Every am5percent chart in the root's container — a `PieChart` or a `SlicedChart` — is a subplot too, on the same terms as the XYCharts below: a root holding a pie and a doughnut is one MAIDR figure with two panels.

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
- **Panel grid:** panels are arranged by their rendered position (rows clustered by top coordinate, sorted left-to-right), so vertical, horizontal, and grid layouts all map naturally. Rows are ordered **bottom-first** — amCharts renders to canvas, so MAIDR cannot measure panel positions in the DOM, and bottom-first row order is what makes ArrowUp move to the visually *upper* panel. Consequently panel numbering starts at the bottom-left panel ("Subplot 1" is the bottom row). If geometry is not available yet (e.g. `fromAmCharts` called before layout), panels fall back to a single row in insertion order.
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

### Pie / Doughnut

A `PieChart` is not an `XYChart`, so it needs `percent.js` alongside `xy.js` and takes no axes. Give the binder `axisLabels` to name the two dimensions; without them the layer reads "Label is Apples, Value is 30". A runnable page is at [`examples/amcharts-pie.html`](https://github.com/xability/maidr/blob/main/examples/amcharts-pie.html).

```js
var chart = root.container.children.push(am5percent.PieChart.new(root, {
  layout: root.verticalLayout,
  // innerRadius: am5.percent(50)  // makes it a doughnut; nothing else changes
}));
var series = chart.series.push(am5percent.PieSeries.new(root, {
  name: "Units sold", valueField: "units", categoryField: "fruit",
}));
series.data.setAll([
  { fruit: "Apples", units: 30 }, { fruit: "Bananas", units: 50 },
  { fruit: "Cherries", units: 20 }, { fruit: "Dates", units: 15 },
]);

maidrAmCharts.bindAmCharts(root, { axisLabels: { x: "Fruit", y: "Units sold" } });
```

Left and Right move between slices; Up and Down are out of bounds, since a pie is a single row. Each slice announces its label, its value, and its share of the whole — "Fruit is Apples, Units sold is 30, Percentage is 26.1%".

### Area / Stacked Area

An area chart is a `LineSeries` whose `fills` template has been made visible — amCharts has no area series — so that fill is what the adapter reads. A line with no visible fill stays a line. Add `stacked: true` for a stacked area, and `valueYShow: "valueYTotalPercent"` (with `calculateTotals: true` on the value axis) for a 100% stack. A runnable page is at [`examples/amcharts-area.html`](https://github.com/xability/maidr/blob/main/examples/amcharts-area.html).

```js
var series = chart.series.push(am5xy.LineSeries.new(root, {
  name: "Search", xAxis: xAxis, yAxis: yAxis,
  valueYField: "search", categoryXField: "quarter",
  stacked: true, // omit for independent (overlapping) bands
}));
series.fills.template.setAll({ visible: true, fillOpacity: 0.4 });
```

Every area series of one chart merges into a **single** layer, and the stacking is read across the whole group: amCharts commonly sets `stacked` on the bands that sit *on* another one and leaves it off the bottom band, so splitting the group by that flag would strand the bottom band in a layer of its own. A stacked area announces two magnitudes per sample — the band's own value and the running total its top edge sits at — where a line reading collapses them to one.

### Radar / Polar Area

A `RadarChart` extends `XYChart`, so it is found like any other chart; its series classes are what identify it. `RadarLineSeries` becomes a radar layer (each spoke a column, each series a row), and `RadarColumnSeries` a polar area — the same values drawn as wedges. A spoke's stereo position follows its angle rather than its index, so sweeping the spokes goes out and comes back. A runnable page is at [`examples/amcharts-radar.html`](https://github.com/xability/maidr/blob/main/examples/amcharts-radar.html).

```js
var chart = root.container.children.push(am5radar.RadarChart.new(root, {}));
var xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, {
  categoryField: "attribute", renderer: am5radar.AxisRendererCircular.new(root, {}),
}));
var yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
  renderer: am5radar.AxisRendererRadial.new(root, {}),
}));
chart.series.push(am5radar.RadarLineSeries.new(root, {
  name: "Model A", xAxis: xAxis, yAxis: yAxis,
  valueYField: "a", categoryXField: "attribute",
}));
```

### Funnel / Pyramid

A funnel lives in an `am5percent.SlicedChart`, not a `PieChart`, and takes no axes. The stages stay in data order, which is what the reading depends on: MAIDR pitches each stage against the **retention** from the one before it — the ratio a listener cannot compute from two heights heard one at a time — and announces the counts alongside. A runnable page is at [`examples/amcharts-funnel.html`](https://github.com/xability/maidr/blob/main/examples/amcharts-funnel.html).

```js
var chart = root.container.children.push(am5percent.SlicedChart.new(root, {}));
var series = chart.series.push(am5percent.FunnelSeries.new(root, {
  name: "Checkout", valueField: "people", categoryField: "stage",
}));
series.data.setAll([
  { stage: "Visited", people: 10000 }, { stage: "Signed up", people: 2400 },
  { stage: "Viewed cart", people: 2300 }, { stage: "Purchased", people: 100 },
]);

maidrAmCharts.bindAmCharts(root, { axisLabels: { x: "Stage", y: "People" } });
```

### Waterfall / Dumbbell

amCharts draws both with the same construct — a `ColumnSeries` whose bars float between `openValueY` and `valueY` — so the data decides which chart it is. A waterfall **chains**: each bar opens where the one before it closed, because the bars trace a single running total, and the bars that sit on the baseline are the opening, closing and subtotal steps. A dumbbell's pairs are independent, so the chain breaks at the second row of any real one. Both are runnable at [`examples/amcharts-floating-columns.html`](https://github.com/xability/maidr/blob/main/examples/amcharts-floating-columns.html).

```js
// Waterfall: `open` continues the running total, 0 restates it.
var series = chart.series.push(am5xy.ColumnSeries.new(root, {
  name: "Budget", xAxis: xAxis, yAxis: yAxis,
  categoryXField: "category", openValueYField: "open", valueYField: "value",
}));
series.data.setAll([
  { category: "Opening", open: 0, value: 1200 },
  { category: "Marketing", open: 1200, value: 950 },
  { category: "Closing", open: 0, value: 950 },
]);
```

A waterfall announces the contribution and the running total separately, because a bar chart would conflate them; the pitch follows the contribution, whose signed range is what makes the large movers audible.

A dumbbell's finding is the change between the two ends, so it travels with both. amCharts names the *series*, not the two ends, so nothing on the chart says what they stand for — pass `dumbbellLabels` and MAIDR announces "Denmark, 1990 71.2, increase 7.2" instead of "start" and "end":

```js
maidrAmCharts.bindAmCharts(root, { dumbbellLabels: { start: "1990", end: "2020" } });
```

### Gantt / Timeline

A schedule is floating columns on a category Y axis of lanes and a `DateAxis` of time. Pitch carries each interval's **length** and stereo position carries its **start**, mapped along the whole axis rather than by column index, so two lanes whose work overlaps sound like they overlap.

```js
var yAxis = chart.yAxes.push(am5xy.CategoryAxis.new(root, {
  categoryField: "category", renderer: am5xy.AxisRendererY.new(root, { inversed: true }),
}));
// Declare every lane on the axis, including one with nothing booked.
yAxis.data.setAll([{ category: "Design" }, { category: "Build" }, { category: "Launch" }]);

var xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, {
  baseInterval: { timeUnit: "day", count: 1 }, renderer: am5xy.AxisRendererX.new(root, {}),
}));
var series = chart.series.push(am5xy.ColumnSeries.new(root, {
  name: "Schedule", xAxis: xAxis, yAxis: yAxis,
  categoryYField: "category", openValueXField: "start", valueXField: "end",
}));
```

The lanes come from the **category axis**, not from the bars, so a lane with nothing booked survives — an empty lane is a real statement about a schedule and the only row a reader can navigate onto and be told nothing by, so MAIDR names it and reports the count up front.

A `DateAxis` stores positions as epoch milliseconds, which no reader can hear a length in, so the adapter rescales them to the axis' own `baseInterval` time unit, measured from the earliest interval: a schedule reads as "day 0 to day 30, length 30 days". The absolute dates are dropped by that, and everything a schedule is drawn to answer — what overlaps what, what hands over to what, where the slack is — survives it. A plain `ValueAxis` is passed through untouched and named with no unit.

### Treemap / Icicle

An `am5hierarchy` layout is **not** a chart: it is a series pushed straight into a container, with no series list and no axes, so the adapter recognises the series itself and treats it as one panel. A treemap and an icicle (amCharts calls it a `Partition`) draw the same tree with different marks and are read identically — as a tree, not a grid: Left and Right move between siblings, Down steps into a node's children, Up returns to its parent. A runnable page is at [`examples/amcharts-treemap.html`](https://github.com/xability/maidr/blob/main/examples/amcharts-treemap.html).

```js
var series = root.container.children.push(am5hierarchy.Treemap.new(root, {
  name: "Population", valueField: "value", categoryField: "name", childDataField: "children",
}));
series.data.setAll([{
  name: "World",
  children: [
    { name: "Asia", children: [{ name: "China", value: 1425 }, { name: "India", value: 1428 }] },
    { name: "Africa", children: [{ name: "Nigeria", value: 224 }] },
  ],
}]);
```

The single root object amCharts requires is dropped: it is a container for the chart rather than a finding, and keeping it would add a level that always holds one node worth 100% of the total. A branch is emitted without a value unless it declares one of its own, so its total is derived from what is under it and cannot disagree with its own children.

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

`bindAmCharts(root, options?)` finds every `XYChart` in `root.container` (one subplot per chart — see [Multi-Panel Charts](#multi-panel-charts)); `bindXYChart(chart, root, options?)` takes a chart you already hold. Options accept `title`, `subtitle`, `axisLabels: { x, y }`, `dumbbellLabels: { start, end }`, plus `highlight` (default `true`) and `highlightColor`. Pass `{ highlight: false }` to mount the accessible UI without the overlay.

For the data-only path (no highlighting), use `fromAmCharts(root, options?)` / `fromXYChart(chart, containerEl, options?)`, which return MAIDR JSON for the `maidr` attribute or `<Maidr data={...}>`.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
