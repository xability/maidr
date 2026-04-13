# Google Charts Integration

MAIDR provides an adapter for Google Charts that converts your charts into accessible, navigable visualizations with audio sonification, text descriptions, and braille output.

## Quick Start

Add `maidr.js` after your Google Charts loader. Use the adapter in the chart's `ready` event:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Google Chart</title>
    <!-- 1. Load Google Charts -->
    <script src="https://www.gstatic.com/charts/loader.js"></script>
    <!-- 2. Load MAIDR -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
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
| Bar/Column | `ColumnChart` | `'ColumnChart'` |
| Horizontal Bar | `BarChart` | `'BarChart'` |
| Line | `LineChart` | `'LineChart'` |
| Scatter | `ScatterChart` | `'ScatterChart'` |
| Candlestick | `CandlestickChart` | `'CandlestickChart'` |
| Stacked Column | `ColumnChart` + `isStacked: true` | `'StackedColumnChart'` |
| Stacked Bar | `BarChart` + `isStacked: true` | `'StackedBarChart'` |
| Dodged/Grouped Column | `ColumnChart` (multi-series) | `'DodgedColumnChart'` |
| Dodged/Grouped Bar | `BarChart` (multi-series) | `'DodgedBarChart'` |

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
import { createMaidrFromGoogleChart } from 'maidr/google-charts';

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
