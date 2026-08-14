# Google Charts Integration

MAIDR provides an adapter for Google Charts that converts your charts into accessible, navigable visualizations with audio sonification, text descriptions, and braille output.

## Quick Start

Add `maidr.js` and `google-charts.js` after your Google Charts loader. Use the adapter in the chart's `ready` event:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Google Chart</title>
    <!-- 1. Load Google Charts -->
    <script src="https://www.gstatic.com/charts/loader.js"></script>
    <!-- 2. Load MAIDR core and Google Charts adapter -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/google-charts.js"></script>
  </head>
  <body>
    <div id="chart" style="width: 700px; height: 500px"></div>

    <script>
      google.charts.load('current', { packages: ['corechart'] });
      google.charts.setOnLoadCallback(drawChart);

      function drawChart() {
        var data = google.visualization.arrayToDataTable([
          ['Day', 'Tips'],
          ['Mon', 20],
          ['Tue', 14],
          ['Wed', 23],
          ['Thu', 25],
          ['Fri', 22],
        ]);

        var container = document.getElementById('chart');
        var chart = new google.visualization.ColumnChart(container);

        // 3. Wire up MAIDR in the ready event
        google.visualization.events.addListener(chart, 'ready', function () {
          var maidr = maidrGoogleCharts.createMaidrFromGoogleChart(
            chart,
            data,
            container,
            { chartType: 'ColumnChart', title: 'Tips by Day' }
          );
          container.setAttribute('maidr', JSON.stringify(maidr));
        });

        chart.draw(data, {
          title: 'Tips by Day',
          legend: { position: 'none' },
        });
      }
    </script>
  </body>
</html>
```

Once the page loads, click on the chart (or Tab to it) and MAIDR activates with:

- **Audio sonification** - tones representing data values
- **Text descriptions** - spoken via screen readers
- **Braille output** - refreshable braille display support
- **Keyboard navigation** - arrow keys to move between data points

## How It Works

The Google Charts adapter:

1. **Extracts data** - reads the `DataTable` structure and converts it to MAIDR's schema
2. **Marks SVG elements** - identifies chart elements using Google Charts' layout API (`getBoundingBox`)
3. **Creates selectors** - generates CSS selectors for visual highlighting during navigation
4. **Returns MAIDR config** - produces a complete `Maidr` object ready for the attribute

The adapter must be called inside the chart's `ready` event to ensure the SVG is fully rendered.

## Supported Chart Types

| Chart Type | Google Charts Class | Adapter `chartType` |
|------------|--------------------|--------------------|
| Column | `ColumnChart` | `'ColumnChart'` |
| Line | `LineChart` | `'LineChart'` |
| Scatter | `ScatterChart` | `'ScatterChart'` |
| Candlestick | `CandlestickChart` | `'CandlestickChart'` |
| Stacked Column | `ColumnChart` + `isStacked: true` | `'StackedColumnChart'` |
| Dodged/Grouped Column | `ColumnChart` (multi-series) | `'DodgedColumnChart'` |
| Pie / Doughnut | `PieChart` (a doughnut is the same class with `pieHole`) | `'PieChart'` |
| Area | `AreaChart` | `'AreaChart'` |
| Stacked Area | `AreaChart` + `isStacked: true` | `'StackedAreaChart'` |
| 100% Stacked Area | `AreaChart` + `isStacked: 'percent'` | `'NormalizedAreaChart'` |
| Error bars / intervals | `LineChart`, `ScatterChart`, `ColumnChart` or `BarChart` with `role: 'interval'` columns | detected automatically — keep the chart's own `chartType` |
| Sankey | `Sankey` (`sankey` package) | `'Sankey'` |
| TreeMap | `TreeMap` (`treemap` package) | `'TreeMap'` |
| Gantt | `google.charts.Gantt` (`gantt` package) | `'Gantt'` |
| Timeline | `Timeline` (`timeline` package) | `'Timeline'` |
| Dot plot | `LineChart` + `lineWidth: 0, pointSize: N` | `'DotChart'` |
| Lollipop | `ComboChart` — a thin bar series plus a big-point line series | `'LollipopChart'` |
| Funnel | An ordered `BarChart` of stage counts | `'FunnelChart'` |
| Diverging / population pyramid | `BarChart` or `ColumnChart` + `isStacked: true`, one series negated | `'DivergingBarChart'` / `'DivergingColumnChart'` |
| Waterfall | `CandlestickChart` used as floating bars (low = open = start, high = close = end) | `'WaterfallChart'` |
| Gauge | `Gauge` (`gauge` package) | `'Gauge'` |
| Choropleth / map | `GeoChart` (`geochart` package), regions or markers | `'GeoChart'` |

**Not supported:** Histogram (Google Charts API doesn't expose bin boundaries), Heatmap (not a native Google Charts type).

> **Stacking note:** the adapter is handed the chart, the DataTable and the container, but never the draw options — so `isStacked` is invisible to it. That is why a stacked or percent-stacked chart is named by its own `chartType` string rather than detected. Passing `'AreaChart'` for a chart drawn with `isStacked: true` is not a cosmetic mistake: the bands would be announced as independent series, and the running total a sighted reader sees along the top edge would go missing entirely.

> **Interval note:** intervals are the one variant the adapter *can* detect, because `role: 'interval'` columns live in the DataTable rather than in the options. A single-series chart declaring them becomes an error bar layer: left and right walk the samples, up and down walk the lower bound, the estimate, and the upper bound. Two interval pairs (a 95% band drawn inside a 99% one) are read as the outermost, and a single interval column is read as the one bound it is, chosen by which side of the estimate it falls on. A **multi-series** chart with intervals keeps its previous reading — `ErrorBarPoint[]` is flat, so a second estimate column has nowhere to go, and losing a series is worse than losing its intervals. Highlighting uses the chart's own point markers, so draw with `pointSize` set; the audio, text and braille do not depend on it.

> **Highlighting note for the non-corechart packages:** Sankey, TreeMap, Gantt and Timeline expose no `getChartLayoutInterface()`, so there is no bounding box to match a data row against and the drawn elements have to be matched by DOM order. The adapter only does so when the counts agree exactly, and otherwise turns visual highlighting off for that chart rather than highlighting the wrong element — the same rule the pie wedges follow. Expect this with a `TreeMap`, which renders `maxDepth` levels at a time and redraws on click, and with a Gantt drawing percent-complete bars. Audio, text, and braille are unaffected.

> **Schedule note:** a Gantt's dates are converted to days (or to hours, for a schedule spanning less than two days) rather than left as epoch milliseconds, because MAIDR announces the *length* of an interval and "1209600000" is not a length anyone can hold. The time axis carries a format that renders the same numbers back as dates, so the ends still read as dates. A Gantt gets one lane per task; a Timeline merges the rows sharing a label into one lane and keeps each bar's own name. Keep the rows of a lane together in the DataTable — interleaved lanes cannot be matched to the drawn bars, and highlighting is dropped for the chart.

> **Marks Google has no class for:** a dot plot, a lollipop, a funnel, a diverging pyramid and a waterfall are all drawn by an ordinary corechart class with draw options the adapter never sees, so each is named by its own `chartType` — the same convention the stacked variants follow. The first three carry a category and a magnitude, exactly as a bar chart does, and exist so the chart announces itself as the chart the author drew. Two of them need care with the DataTable: the lollipop recipe **repeats the value column** so the stems and the dots can be styled apart, and the adapter therefore reads the first data column and stops; the centred funnel recipe stacks a **transparent padding series** under the counts, and the adapter picks the column whose values fall, since a funnel's counts are non-increasing and its padding is not. A diverging chart's values arrive **signed** and are sent through unchanged — the sign is which side of the baseline the bar grows towards, and MAIDR pitches the magnitude while the announcement names the side.

> **Waterfall note:** Google has no waterfall, and the recipe that draws one is a `CandlestickChart` with the wick collapsed onto the body — low set to the running total *before* the step and high to the total *after* it, with open and close matching. The adapter reads that five-column table, and a plain `[label, start, end]` table too. Which rows are **totals** — the opening and closing bars, and any subtotal — cannot be read off the numbers, so name them by row index in `waterfallTotals`; a row that is not named is an increase or a decrease according to its sign. Highlighting marks the bar bodies, which are told apart from the wicks and the gridlines by width, and is dropped for the chart if their count does not match the steps.

> **Gauge note:** a `Gauge` draws one dial per DataTable row, and MAIDR's gauge payload is a single measure — so a three-row table becomes **three layers**, which Page Up and Page Down move between. A dial's range and its coloured bands are most of what a gauge means and they live only in the draw options, so pass the same object you gave `chart.draw(…)` as `gaugeOptions`; without it the dials fall back to Google's own defaults of 0 to 100 with no bands. Google's `greenFrom`/`redTo` spans are free-standing while MAIDR's bands partition the dial, so any stretch the options leave uncoloured — the region below `yellowFrom` in the commonest configuration of all — is filled with a band called `unbanded` rather than being folded into the coloured one above it.

> **Map note:** a `GeoChart` in regions mode names a place in column 0 and shades it by column 1; in markers mode drawn from coordinates it puts a **latitude in column 0 and a longitude in column 1**, with the name and value after them. Only the second gives MAIDR centroids, and those are what turn the reading from a list of places into a walk across the map — up is north, left is west. A regions table cannot supply them (Google resolves a region name inside its own geo data and exposes no position for it), so it is read in declared order, which the schema explicitly supports. Border adjacency is not recoverable either way. **A GeoChart is never highlighted:** it paints every region of the chosen resolution rather than only the rows it was given, and its paths carry no class or id, so a highlight would sit on a different country from the one being announced.

> **Pie note:** column 0 supplies the slice labels and the first non-role column their values; `axes.x` / `axes.y` take those two column labels, since a `PieChart` has no drawn axis to name. Google Charts gives its wedges no class or id, so the adapter picks them out of the SVG by the arc command in their `d` attribute. When the wedge count does not match the row count the data-to-DOM mapping is unknown and highlighting is dropped for that chart — which is what happens with `is3D: true` (several paths per slice) and with `sliceVisibilityThreshold` (small slices folded into one "Other" wedge). Audio, text, and braille are unaffected.

## Code Examples

### Bar/Column Chart

```html
<div id="bar-chart"></div>
<script>
  var data = google.visualization.arrayToDataTable([
    ['Day', 'Tips'],
    ['Sat', 87],
    ['Sun', 76],
    ['Thur', 62],
    ['Fri', 19],
  ]);

  var container = document.getElementById('bar-chart');
  var chart = new google.visualization.ColumnChart(container);

  google.visualization.events.addListener(chart, 'ready', function () {
    var maidr = maidrGoogleCharts.createMaidrFromGoogleChart(chart, data, container, {
      chartType: 'ColumnChart',
      title: 'The Number of Tips by Day',
    });
    container.setAttribute('maidr', JSON.stringify(maidr));
  });

  chart.draw(data, {
    title: 'The Number of Tips by Day',
    legend: { position: 'none' },
    width: 600,
    height: 400,
  });
</script>
```

### Line Chart (Multi-Series)

```html
<div id="line-chart"></div>
<script>
  var data = google.visualization.arrayToDataTable([
    ['Year', 'Sales', 'Expenses'],
    ['2020', 1000, 400],
    ['2021', 1170, 460],
    ['2022', 660, 1120],
    ['2023', 1030, 540],
  ]);

  var container = document.getElementById('line-chart');
  var chart = new google.visualization.LineChart(container);

  google.visualization.events.addListener(chart, 'ready', function () {
    var maidr = maidrGoogleCharts.createMaidrFromGoogleChart(chart, data, container, {
      chartType: 'LineChart',
      title: 'Company Performance',
    });
    container.setAttribute('maidr', JSON.stringify(maidr));
  });

  chart.draw(data, {
    title: 'Company Performance',
    curveType: 'function',
    legend: { position: 'bottom' },
    width: 600,
    height: 400,
  });
</script>
```

### Scatter Chart

```html
<div id="scatter-chart"></div>
<script>
  var data = google.visualization.arrayToDataTable([
    ['Age', 'Weight'],
    [8, 12],
    [4, 5.5],
    [11, 14],
    [4, 5],
    [3, 3.5],
    [6.5, 7],
  ]);

  var container = document.getElementById('scatter-chart');
  var chart = new google.visualization.ScatterChart(container);

  google.visualization.events.addListener(chart, 'ready', function () {
    var maidr = maidrGoogleCharts.createMaidrFromGoogleChart(chart, data, container, {
      chartType: 'ScatterChart',
      title: 'Age vs. Weight',
    });
    container.setAttribute('maidr', JSON.stringify(maidr));
  });

  chart.draw(data, {
    title: 'Age vs. Weight',
    hAxis: { title: 'Age' },
    vAxis: { title: 'Weight' },
    legend: 'none',
    width: 600,
    height: 400,
  });
</script>
```

### Stacked Column Chart

```html
<div id="stacked-chart"></div>
<script>
  var data = google.visualization.arrayToDataTable([
    ['Class', 'Did not survive', 'Survived'],
    ['First', 80, 136],
    ['Second', 97, 87],
    ['Third', 372, 119],
  ]);

  var container = document.getElementById('stacked-chart');
  var chart = new google.visualization.ColumnChart(container);

  google.visualization.events.addListener(chart, 'ready', function () {
    var maidr = maidrGoogleCharts.createMaidrFromGoogleChart(chart, data, container, {
      chartType: 'StackedColumnChart',
      title: 'Passenger Count by Class and Survival',
    });
    container.setAttribute('maidr', JSON.stringify(maidr));
  });

  chart.draw(data, {
    title: 'Passenger Count by Class and Survival',
    isStacked: true,
    legend: { position: 'bottom' },
    width: 600,
    height: 400,
  });
</script>
```

### Dodged/Grouped Column Chart

```html
<div id="dodged-chart"></div>
<script>
  var data = google.visualization.arrayToDataTable([
    ['City', '2020 Population', '2025 Population'],
    ['New York', 8336, 8258],
    ['Los Angeles', 3979, 3898],
    ['Chicago', 2693, 2665],
    ['Houston', 2320, 2314],
  ]);

  var container = document.getElementById('dodged-chart');
  var chart = new google.visualization.ColumnChart(container);

  google.visualization.events.addListener(chart, 'ready', function () {
    var maidr = maidrGoogleCharts.createMaidrFromGoogleChart(chart, data, container, {
      chartType: 'DodgedColumnChart',
      title: 'City Populations (thousands)',
    });
    container.setAttribute('maidr', JSON.stringify(maidr));
  });

  chart.draw(data, {
    title: 'City Populations (thousands)',
    legend: { position: 'bottom' },
    width: 600,
    height: 400,
  });
</script>
```

### Candlestick Chart

```html
<div id="candlestick-chart"></div>
<script>
  // Google Charts candlestick format: [Date, Low, Open, Close, High]
  var data = new google.visualization.DataTable();
  data.addColumn('date', 'Date');
  data.addColumn('number', 'Low');
  data.addColumn('number', 'Open');
  data.addColumn('number', 'Close');
  data.addColumn('number', 'High');
  data.addRows([
    [new Date(2024, 0, 1), 20, 28, 38, 45],
    [new Date(2024, 0, 2), 31, 38, 30, 45],
    [new Date(2024, 0, 3), 25, 31, 42, 48],
    [new Date(2024, 0, 4), 35, 40, 40, 52],
    [new Date(2024, 0, 5), 28, 35, 45, 55],
  ]);

  var container = document.getElementById('candlestick-chart');
  var chart = new google.visualization.CandlestickChart(container);

  google.visualization.events.addListener(chart, 'ready', function () {
    var maidr = maidrGoogleCharts.createMaidrFromGoogleChart(chart, data, container, {
      chartType: 'CandlestickChart',
      title: 'Stock Price by Day',
    });
    container.setAttribute('maidr', JSON.stringify(maidr));
  });

  chart.draw(data, {
    title: 'Stock Price by Day',
    legend: 'none',
    width: 600,
    height: 400,
  });
</script>
```

### Pie Chart

```html
<div id="pie-chart"></div>
<script>
  var data = google.visualization.arrayToDataTable([
    ['Task', 'Hours per Day'],
    ['Work', 11],
    ['Eat', 2],
    ['Commute', 2],
    ['Watch TV', 2],
    ['Sleep', 7],
  ]);

  var container = document.getElementById('pie-chart');
  var chart = new google.visualization.PieChart(container);

  google.visualization.events.addListener(chart, 'ready', function () {
    var maidr = maidrGoogleCharts.createMaidrFromGoogleChart(chart, data, container, {
      chartType: 'PieChart',
      title: 'My Daily Activities',
    });
    container.setAttribute('maidr', JSON.stringify(maidr));
  });

  chart.draw(data, {
    title: 'My Daily Activities',
    width: 600,
    height: 400,
  });
</script>
```

Left and Right move between slices; Up and Down are out of bounds, since a pie is a single row. Each slice announces its label, its value, and its share of the whole — "Work, 11, 45.8%". Draw a doughnut by adding `pieHole: 0.4` to the draw options; the adapter `chartType` stays `'PieChart'`.

## Multi-Panel (Faceted) Figures

Google Charts has no native facet/trellis concept — a "faceted" page is several chart instances drawn into separate containers. `createMaidrFromGoogleCharts` (plural) groups those instances into **one** MAIDR figure: arrow keys move between panels, `Enter` drills into a panel's data, and `Esc` returns to panel navigation.

Each panel is the same `{ chart, dataTable, container, chartType }` tuple the single-chart API takes, plus an optional `title` announced during panel navigation. All panel containers must live inside a single wrapper element, passed as `options.root` — and the combined `maidr` attribute is set on that wrapper, **not** on the individual containers. Panel containers must not be nested inside one another (e.g. don't pass a card `<div>` that wraps another panel's chart `<div>`): the adapter's container-scoped selectors would match both charts' elements, so nested containers are rejected with an error.

Because every chart fires its `ready` event independently, use the `whenGoogleChartsReady` helper to build the figure only after all panels have rendered. Register the gate before calling `draw()` on any chart.

```html
<div id="facet-grid">
  <div id="panel-east"></div>
  <div id="panel-west"></div>
</div>
<script>
  var root = document.getElementById('facet-grid');

  var panels = [
    { id: 'panel-east', title: 'East', rows: [['Q1', 100], ['Q2', 200]] },
    { id: 'panel-west', title: 'West', rows: [['Q1', 80], ['Q2', 140]] },
  ].map(function (facet) {
    var container = document.getElementById(facet.id);
    return {
      chart: new google.visualization.ColumnChart(container),
      dataTable: google.visualization.arrayToDataTable([['Quarter', 'Revenue']].concat(facet.rows)),
      container: container,
      chartType: 'ColumnChart',
      title: facet.title,
    };
  });

  var charts = panels.map(function (panel) { return panel.chart; });

  // Build the combined figure once ALL panels have rendered.
  maidrGoogleCharts.whenGoogleChartsReady(charts, google.visualization.events, function () {
    var maidr = maidrGoogleCharts.createMaidrFromGoogleCharts(panels, {
      root: root,
      title: 'Revenue by Region',
      layout: { columns: 2 },
    });
    root.setAttribute('maidr', JSON.stringify(maidr));
  });

  panels.forEach(function (panel) {
    panel.chart.draw(panel.dataTable, { legend: { position: 'none' }, width: 360, height: 260 });
  });
</script>
```

### Grid Shape

The grid shape is resolved in priority order:

1. **2D array** — pass `panels` as `GoogleChartPanel[][]` to use it directly as the subplot grid (rows may be ragged, but never empty).
2. **Flat array + `options.layout`** — `{ columns: n }` chunks the panels row-major into rows of `n`; `{ rows: n }` derives the column count instead.
3. **Neither** — the grid is inferred from each container's on-screen position (clustered into rows by top edge, sorted left-to-right).

Always supply panels in visual reading order (top-left panel first) so announcements match what sighted users see.

### `createMaidrFromGoogleCharts` Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `root` | `HTMLElement` | Yes | Wrapper element containing all panel containers; receives the `maidr` attribute |
| `title` | `string` | No | Figure-level title announced when the figure receives focus |
| `id` | `string` | No | Unique ID for the MAIDR instance (defaults to the root's `id`) |
| `layout` | `{ rows?, columns? }` | No | Grid shape for a flat panel array (ignored for 2D arrays) |

Panel titles (e.g. the facet value, `'East'`) are announced in subplot summaries; per-panel axis labels come from each panel's own DataTable. Mixed chart types across panels are supported — any type from the table above works per panel.

## Configuration Options

The adapter accepts a `GoogleChartAdapterOptions` object:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `chartType` | `GoogleChartType` | Yes | The chart type string (see supported types above) |
| `title` | `string` | No | Chart title for accessibility announcements |
| `id` | `string` | No | Unique ID for the MAIDR instance (defaults to container's `id`) |

## Using with npm/Bundlers

For bundled projects, import the adapter directly:

```typescript
import {
  createMaidrFromGoogleChart,
  createMaidrFromGoogleCharts,
  whenGoogleChartsReady,
} from 'maidr/google-charts';

// Use in your chart's ready callback
const maidr = createMaidrFromGoogleChart(chart, dataTable, container, {
  chartType: 'ColumnChart',
  title: 'My Chart',
});
```

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

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
