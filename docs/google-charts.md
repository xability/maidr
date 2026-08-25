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
| Bubble | `BubbleChart` | `'BubbleChart'` |
| Candlestick | `CandlestickChart` | `'CandlestickChart'` |
| Stacked Column | `ColumnChart` + `isStacked: true` | `'StackedColumnChart'` |
| Dodged/Grouped Column | `ColumnChart` (multi-series) | `'DodgedColumnChart'` |
| Pie / Doughnut | `PieChart` (a doughnut is the same class with `pieHole`) | `'PieChart'` |
| Area | `AreaChart` | `'AreaChart'` |
| Stacked Area | `AreaChart` + `isStacked: true` | `'StackedAreaChart'` |
| 100% Stacked Area | `AreaChart` + `isStacked: 'percent'` | `'NormalizedAreaChart'` |
| Stepped Area | `SteppedAreaChart` | `'SteppedAreaChart'` |
| Stacked Stepped Area | `SteppedAreaChart` + `isStacked: true` | `'StackedSteppedAreaChart'` |
| 100% Stacked Stepped Area | `SteppedAreaChart` + `isStacked: 'percent'` | `'NormalizedSteppedAreaChart'` |
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
| Bump | `LineChart` of ranks + `vAxis: {direction: -1}` | `'BumpChart'` |
| Dumbbell | `LineChart` + `lineWidth: 0` with two `role: 'interval'` columns drawn as sticks, or a plain `[category, start, end]` table | `'DumbbellChart'` |
| Survival (Kaplan-Meier) | `SteppedAreaChart` + `areaOpacity: 0` | `'SurvivalChart'` |
| Volcano | `ScatterChart` of effect size against significance | `'VolcanoChart'` |
| Manhattan | `ScatterChart` with one series per chromosome | `'ManhattanChart'` |
| Tree | `OrgChart` (`orgchart` package) — people joined by manager pointers | `'OrgChart'` |
| Calendar | `Calendar` (`calendar` package) — a year of days shaded by a value | `'Calendar'` |

**Not supported:** Histogram (Google Charts API doesn't expose bin boundaries), Heatmap (not a native Google Charts type).

> **Calendar note:** a `Calendar` becomes **one heat-grid layer per calendar
> year its dates span**, because the package restarts its week columns each
> January — a chart covering 2012 and 2013 draws fourteen cell rows, not seven.
> Each layer is seven weekday rows (Sunday first, as drawn) by one column per
> week, named by the Sunday the week begins on; <kbd>Page Down</kbd> moves to
> the next year. Two absences meet in the grid and mean different things: a day
> inside the year with no row in the table is drawn as a white cell — no value,
> but an element to outline — while the slots before January's first weekday
> and after December's last are not drawn at all, and carry neither. The values
> come from the DataTable rather than the fills, because the **minimum** value
> is painted the same `#ffffff` as a day with no data; two rows naming the same
> day are not summed, and the last one wins, which is what the package draws.

> **Stacking note:** the adapter is handed the chart, the DataTable and the container, but never the draw options — so `isStacked` is invisible to it. That is why a stacked or percent-stacked chart is named by its own `chartType` string rather than detected. Passing `'AreaChart'` for a chart drawn with `isStacked: true` is not a cosmetic mistake: the bands would be announced as independent series, and the running total a sighted reader sees along the top edge would go missing entirely.

> **Bubble note:** Google's bubble table is `[ID, x, y, group?, size?]`, and it is read as a scatter — which is what it is, with more carried per point. The ID becomes the point's **name**, announced alongside its coordinates, and the **size** becomes `z`, which is sonified as well as read, so a big bubble sounds like one. The last two columns are optional and are read by **type** rather than by position: Google lets column 3 be either a series name or a number picking a colour off a gradient, so a number there is treated as a magnitude and used for `z` when there is no size column, while a size column always wins over it — there is one `z`, and the size is what the chart is named for. Whichever column supplies it names the `z` axis, so a reader is told *Population* or *Temperature* rather than left to guess. `[ID, x, y]` alone is legal and reads as a plain named scatter. **The series column is not announced:** MAIDR's scatter reads a point's name, its two coordinates and `z`, and nothing else, so a group in the payload would be a field no reader is ever told about; recognising a string column 3 keeps it from being mistaken for a magnitude, and that is all it does.

> **Interval note:** intervals are the one variant the adapter *can* detect, because `role: 'interval'` columns live in the DataTable rather than in the options. A single-series chart declaring them becomes an error bar layer: left and right walk the samples, up and down walk the lower bound, the estimate, and the upper bound. Two interval pairs (a 95% band drawn inside a 99% one) are read as the outermost, and a single interval column is read as the one bound it is, chosen by which side of the estimate it falls on. A **multi-series** chart with intervals keeps its previous reading — `ErrorBarPoint[]` is flat, so a second estimate column has nowhere to go, and losing a series is worse than losing its intervals. Highlighting uses the chart's own point markers, so draw with `pointSize` set; the audio, text and braille do not depend on it.

> **Highlighting note for the non-corechart packages:** Sankey, TreeMap, Gantt and Timeline expose no `getChartLayoutInterface()`, so there is no bounding box to match a data row against and the drawn elements have to be matched by DOM order. The adapter only does so when the counts agree exactly, and otherwise turns visual highlighting off for that chart rather than highlighting the wrong element — the same rule the pie wedges follow. Expect this with a `TreeMap`, which renders `maxDepth` levels at a time and redraws on click, and with a Gantt drawing percent-complete bars. Audio, text, and braille are unaffected.

> **Schedule note:** a Gantt's dates are converted to days (or to hours, for a schedule spanning less than two days) rather than left as epoch milliseconds, because MAIDR announces the *length* of an interval and "1209600000" is not a length anyone can hold. The time axis carries a format that renders the same numbers back as dates, so the ends still read as dates. A Gantt gets one lane per task; a Timeline merges the rows sharing a label into one lane and keeps each bar's own name. Keep the rows of a lane together in the DataTable — interleaved lanes cannot be matched to the drawn bars, and highlighting is dropped for the chart.

> **Marks Google has no class for:** a dot plot, a lollipop, a funnel, a diverging pyramid and a waterfall are all drawn by an ordinary corechart class with draw options the adapter never sees, so each is named by its own `chartType` — the same convention the stacked variants follow. The first three carry a category and a magnitude, exactly as a bar chart does, and exist so the chart announces itself as the chart the author drew. Two of them need care with the DataTable: the lollipop recipe **repeats the value column** so the stems and the dots can be styled apart, and the adapter therefore reads the first data column and stops; the centred funnel recipe stacks a **transparent padding series** under the counts, and the adapter picks the column whose values fall, since a funnel's counts are non-increasing and its padding is not. A diverging chart's values arrive **signed** and are sent through unchanged — the sign is which side of the baseline the bar grows towards, and MAIDR pitches the magnitude while the announcement names the side.

> **Waterfall note:** Google has no waterfall, and the recipe that draws one is a `CandlestickChart` with the wick collapsed onto the body — low set to the running total *before* the step and high to the total *after* it, with open and close matching. The adapter reads that five-column table, and a plain `[label, start, end]` table too. Which rows are **totals** — the opening and closing bars, and any subtotal — cannot be read off the numbers, so name them by row index in `waterfallTotals`; a row that is not named is an increase or a decrease according to its sign. Highlighting marks the bar bodies, which are told apart from the wicks and the gridlines by width, and is dropped for the chart if their count does not match the steps.

> **Gauge note:** a `Gauge` draws one dial per DataTable row, and MAIDR's gauge payload is a single measure — so a three-row table becomes **three layers**, which Page Up and Page Down move between. A dial's range and its coloured bands are most of what a gauge means and they live only in the draw options, so pass the same object you gave `chart.draw(…)` as `gaugeOptions`; without it the dials fall back to Google's own defaults of 0 to 100 with no bands. Google's `greenFrom`/`redTo` spans are free-standing while MAIDR's bands partition the dial, so any stretch the options leave uncoloured — the region below `yellowFrom` in the commonest configuration of all — is filled with a band called `unbanded` rather than being folded into the coloured one above it.

> **Map note:** a `GeoChart` in regions mode names a place in column 0 and shades it by column 1; in markers mode drawn from coordinates it puts a **latitude in column 0 and a longitude in column 1**, with the name and value after them. Only the second gives MAIDR centroids, and those are what turn the reading from a list of places into a walk across the map — up is north, left is west. A regions table cannot supply them (Google resolves a region name inside its own geo data and exposes no position for it), so it is read in declared order, which the schema explicitly supports. Border adjacency is not recoverable either way. **A GeoChart is never highlighted:** it paints every region of the chosen resolution rather than only the rows it was given, and its paths carry no class or id, so a highlight would sit on a different country from the one being announced.

> **Rank note:** a bump chart's DataTable is any multi-series line chart's, and the `vAxis: {direction: -1}` that reveals its y values are **ranks** is a draw option. Naming it `'BumpChart'` is what makes it read: the pitch is inverted so rank 1 is the highest note, and each move announces the places gained or lost, which is the overtake the chart is drawn for. Read as a `'LineChart'` the same table sonifies a team climbing the table as a team falling. A slope graph of *values* is not this — that is a line layer with two samples.

> **Dumbbell note:** two recipes draw one and both are read — Google's intervals styling (a series with `lineWidth: 0` whose two `role: 'interval'` columns are drawn with `intervals: {style: 'sticks'}`) and a plain `[category, start, end]` table. **Name the two value columns after the two things being compared** ("1990" and "2020", "before" and "after"): those labels are the content of the comparison and the trace announces them, so a reader is told which dot they are on. Without them the ends fall back to "start" and "end". The change between the ends is not emitted — a drawn segment cannot disagree with the dots it joins, so the trace derives it. Highlighting uses the chart's own point markers; draw with `pointSize` set.

> **Survival note:** Google draws a step line as a `SteppedAreaChart` with `areaOpacity: 0`, and the table is a step chart's — times in column 0, one probability column per arm. Add the confidence band as `role: 'interval'` columns (both bounds or neither: a lone interval column is half a band, and emitting it twice would announce a band of zero width) and the censored times as a **boolean** column after the arm they belong to. A boolean column is never read as an arm, whether or not it declares a role. Times go out numeric when the column is, because median survival and the separation between arms are read off the time axis. `stepDirection: 'hv'` is what a Kaplan-Meier estimate does, but MAIDR names no default, so pass it if you want it announced. Highlighting needs the step **outline** (`fill="none"`); a curve drawn as a filled band alone gets none rather than a highlight placed on the band's baseline corners.

> **Threshold note:** a volcano and a Manhattan are scatters read almost entirely through a cutoff — they carry tens of thousands of points of which a few dozen matter, and the summary on entry and the rotor that jumps between the hits are both driven by `thresholdOptions`. It lives in the analysis and in the plotted reference line, never in the DataTable, and **MAIDR guesses none**: these charts sit on transformed axes whose conventions differ by field (-log10(p) at 1.3 for p < 0.05, at 7.3 for genome-wide significance), and a raw p axis runs the other way, which is what `significanceDirection: 'below'` is for. Put each point's identity — the gene, the SNP — in a `role: 'annotation'` or `role: 'tooltip'` column, attached to the series or to the domain: identity is the payload on these charts, and coordinates alone withhold the one thing a reader came for. A Manhattan's banding recipe puts each chromosome in its own column, null elsewhere; every column is read, the nulls are dropped, and each point is tagged with its column's label as its region. A single-series chart gets no region, since with one column its label names the y axis.

> **Org chart note:** an `OrgChart`'s `[node id, parent id, tooltip]` table is the same declaration Highcharts' `organization` series carries, and it is read as a `tree`: one node per row, addressed by the path of its managers, root first. Up is the manager, down is a report, and the count announced is of reports.
>
> It was read as a **network** until #1166, and the links it built were right — what a graph cannot say is which way up the chart is. Measured on a five-person chart, the position on a middle manager announced `Links: 3, to Mike, Bob, Carol`: one manager and two reports in a single undifferentiated list, which is the one thing an org chart is drawn to show. The number was wrong for the same reason — a leaf's degree counts its *parent*, so someone with nobody reporting to them announced `Links: 1` — and the pitch followed that degree.
>
> Identity comes from the **raw** cell rather than the formatted one, because a parent pointer has to match the id it names and an org chart routinely puts markup in the value it draws; it is also what the node is called, since the formatted value is markup rather than a name. No node carries a value: there is no magnitude anywhere in the table and nothing on the page is sized, so the layer names no value axis and announces no second number. A manager id that names no row ends the path there, and a cyclic chain is broken with a warning.
>
> **An OrgChart is never highlighted:** it renders an HTML `<table>` rather than SVG and draws no element per node — the connectors are cell borders — so there is nothing for a selector to point at.

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

### Reading options

Four chart types carry meaning that is not in the DataTable at all — it lives in the draw options, in the analysis, or in the author's head — so the adapter cannot infer it and does not guess. Pass it alongside `chartType`. Each is described in full in the note for its chart type above.

| Option | Type | Applies to | Description |
|--------|------|------------|-------------|
| `gaugeOptions` | `GoogleGaugeOptions` | `'Gauge'` | The same draw options given to `chart.draw(…)`. Supplies `min` / `max` and the `greenFrom` … `redTo` band edges. Without it every dial falls back to Google's own defaults of 0 to 100 with no bands |
| `stepDirection` | `StepDirection` | `'SurvivalChart'` | Where the curve jumps between samples — `'hv'` for a Kaplan-Meier estimate. Omitted means MAIDR names no convention rather than assuming one |
| `thresholdOptions` | `ThresholdOptions` | `'VolcanoChart'`, `'ManhattanChart'` | The significance cutoff, which side of it counts, and the effect size. Drives the entry summary and the rotor that jumps between the hits |
| `waterfallTotals` | `readonly number[]` | `'WaterfallChart'` | DataTable row indices of the rows that restate the running total (the opening and closing bars, and any subtotal) rather than changing it |

These same options are accepted **per panel** by `createMaidrFromGoogleCharts`, since a faceted figure may mix chart types: set them on the panel object next to its `chartType`.

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
