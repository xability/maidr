# Plotly.js Integration

MAIDR automatically detects and makes Plotly.js charts accessible — no configuration, no binder, no data attributes needed. Just add one script tag.

## Quick Start

Add `maidr.js` alongside your Plotly.js script. That's it:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Plotly Chart</title>
    <!-- 1. Load Plotly.js -->
    <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
    <!-- 2. Load MAIDR — auto-detects Plotly charts -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
  </head>
  <body>
    <div id="chart" style="width: 700px; height: 500px"></div>

    <script>
      // 3. Create your chart normally — MAIDR hooks in automatically
      Plotly.newPlot('chart', [{
        x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        y: [20, 14, 23, 25, 22],
        type: 'bar'
      }], {
        title: { text: 'Tips by Day' },
        xaxis: { title: { text: 'Day' } },
        yaxis: { title: { text: 'Count' } }
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

No changes to your Plotly code are required.

## How It Works

MAIDR's Plotly adapter runs automatically on page load:

1. **Detection** — scans the DOM for `.js-plotly-plot` elements (added by Plotly during `newPlot()`)
2. **Extraction** — reads Plotly's internal data (`gd._fullData`, `gd._fullLayout`, `gd.calcdata`) and produces MAIDR's accessibility schema
3. **Normalization** — patches Plotly's SVG structure for compatibility (layout fixes, toolbar accessibility, click-to-focus)
4. **Activation** — initializes MAIDR on the chart with full keyboard navigation, audio, text, and braille support

For dynamically-created charts (SPAs, notebooks), a `MutationObserver` watches for new Plotly divs and initializes them as they appear.

## Supported Chart Types

| Chart Type | Plotly Trace | Example |
|-----------|-------------|---------|
| Bar | `type: 'bar'` | [Bar chart](examples.html) |
| Scatter | `type: 'scatter'`, `mode: 'markers'` | [Scatter plot](examples.html) |
| Line | `type: 'scatter'`, `mode: 'lines'` | [Line chart](examples.html) |
| Box Plot | `type: 'box'` | [Box plot](examples.html) |
| Heatmap | `type: 'heatmap'` | [Heatmap](examples.html) |
| Histogram | `type: 'histogram'` | [Histogram](examples.html) |
| Candlestick | `type: 'candlestick'` | [Candlestick](examples.html) |
| Grouped Bar | `barmode: 'group'` + multiple bar traces | [Grouped bar](examples.html) |
| Stacked Bar | `barmode: 'stack'` + multiple bar traces | [Stacked bar](examples.html) |
| Subplots / Facets | multiple `xaxis`/`yaxis` pairs, `layout.grid`, or Plotly Express facets | [Subplots](examples.html) |

## Code Examples

### Bar Chart

```html
<div id="bar-chart" style="width: 700px; height: 500px"></div>
<script>
  Plotly.newPlot('bar-chart', [{
    x: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    y: [20, 14, 23, 25, 22],
    type: 'bar',
    marker: { color: '#2ca02c' }
  }], {
    title: { text: 'Number of Tips by Day' },
    xaxis: { title: { text: 'Day' } },
    yaxis: { title: { text: 'Count' } }
  });
</script>
```

### Scatter Plot

```html
<div id="scatter-chart" style="width: 700px; height: 500px"></div>
<script>
  Plotly.newPlot('scatter-chart', [{
    x: [5.1, 4.9, 4.7, 4.6, 5.0, 5.4, 4.6, 5.0],
    y: [1.4, 1.4, 1.3, 1.5, 1.4, 1.7, 1.4, 1.5],
    mode: 'markers',
    type: 'scatter',
    name: 'Setosa',
    marker: { size: 8 }
  }], {
    title: { text: 'Iris Sepal vs Petal Length' },
    xaxis: { title: { text: 'Sepal Length (cm)' } },
    yaxis: { title: { text: 'Petal Length (cm)' } }
  });
</script>
```

### Multi-Line Chart

```html
<div id="line-chart" style="width: 700px; height: 500px"></div>
<script>
  var trace1 = {
    x: [1, 2, 3, 4, 5, 6, 7],
    y: [10, 15, 13, 17, 22, 19, 25],
    mode: 'lines',
    type: 'scatter',
    name: 'Series A'
  };

  var trace2 = {
    x: [1, 2, 3, 4, 5, 6, 7],
    y: [16, 5, 11, 9, 14, 20, 12],
    mode: 'lines',
    type: 'scatter',
    name: 'Series B'
  };

  Plotly.newPlot('line-chart', [trace1, trace2], {
    title: { text: 'Weekly Sales Comparison' },
    xaxis: { title: { text: 'Week' } },
    yaxis: { title: { text: 'Sales ($K)' } }
  });
</script>
```

### Box Plot

```html
<div id="box-chart" style="width: 700px; height: 500px"></div>
<script>
  Plotly.newPlot('box-chart', [
    { y: [2.3, 2.5, 2.8, 3.0, 3.2, 3.4, 3.6, 4.0, 4.5], type: 'box', name: 'Setosa' },
    { y: [4.7, 4.9, 5.2, 5.5, 5.9, 6.0, 6.3, 6.5, 7.0], type: 'box', name: 'Versicolor' },
    { y: [6.0, 6.3, 6.5, 6.9, 7.1, 7.3, 7.5, 7.7, 8.0], type: 'box', name: 'Virginica' }
  ], {
    title: { text: 'Iris Sepal Length Distribution' },
    xaxis: { title: { text: 'Species' } },
    yaxis: { title: { text: 'Sepal Length (cm)' } }
  });
</script>
```

### Heatmap

```html
<div id="heatmap-chart" style="width: 700px; height: 500px"></div>
<script>
  Plotly.newPlot('heatmap-chart', [{
    z: [[1, 20, 30], [20, 1, 60], [30, 60, 1]],
    x: ['Monday', 'Tuesday', 'Wednesday'],
    y: ['Morning', 'Afternoon', 'Evening'],
    type: 'heatmap',
    colorscale: 'Viridis'
  }], {
    title: { text: 'Activity Heatmap' }
  });
</script>
```

### Histogram

```html
<div id="histogram-chart" style="width: 700px; height: 500px"></div>
<script>
  // Generate random data
  var x = [];
  for (var i = 0; i < 500; i++) {
    x.push(Math.random() + Math.random() + Math.random() - 1.5);
  }

  Plotly.newPlot('histogram-chart', [{
    x: x,
    type: 'histogram',
    xbins: { size: 0.5 }
  }], {
    title: { text: 'Distribution of Values' },
    xaxis: { title: { text: 'Value' } },
    yaxis: { title: { text: 'Count' } }
  });
</script>
```

### Candlestick

```html
<div id="candlestick-chart" style="width: 700px; height: 500px"></div>
<script>
  Plotly.newPlot('candlestick-chart', [{
    x: ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'],
    open:  [150.0, 152.5, 151.0, 153.0],
    high:  [153.0, 154.0, 154.5, 155.0],
    low:   [149.0, 151.0, 150.0, 152.0],
    close: [152.5, 151.0, 153.0, 154.5],
    type: 'candlestick'
  }], {
    title: { text: 'Stock Price' },
    xaxis: { title: { text: 'Date' } },
    yaxis: { title: { text: 'Price ($)' } }
  });
</script>
```

### Grouped Bar Chart

```html
<div id="grouped-bar" style="width: 700px; height: 500px"></div>
<script>
  Plotly.newPlot('grouped-bar', [
    { x: ['Q1', 'Q2', 'Q3', 'Q4'], y: [20, 14, 23, 25], name: 'Product A', type: 'bar' },
    { x: ['Q1', 'Q2', 'Q3', 'Q4'], y: [15, 18, 20, 22], name: 'Product B', type: 'bar' },
    { x: ['Q1', 'Q2', 'Q3', 'Q4'], y: [12, 16, 18, 20], name: 'Product C', type: 'bar' }
  ], {
    barmode: 'group',
    title: { text: 'Quarterly Sales by Product' },
    xaxis: { title: { text: 'Quarter' } },
    yaxis: { title: { text: 'Revenue ($M)' } }
  });
</script>
```

### Stacked Bar Chart

```html
<div id="stacked-bar" style="width: 700px; height: 500px"></div>
<script>
  Plotly.newPlot('stacked-bar', [
    { x: ['Q1', 'Q2', 'Q3', 'Q4'], y: [20, 14, 23, 25], name: 'Product A', type: 'bar' },
    { x: ['Q1', 'Q2', 'Q3', 'Q4'], y: [15, 18, 20, 22], name: 'Product B', type: 'bar' }
  ], {
    barmode: 'stack',
    title: { text: 'Quarterly Revenue Breakdown' },
    xaxis: { title: { text: 'Quarter' } },
    yaxis: { title: { text: 'Revenue ($M)' } }
  });
</script>
```

### Subplots (2x2 Grid)

Figures with multiple panels — whether built with manual axis pairs, `layout.grid`, or Python's `make_subplots` — become a navigable 2D grid. MAIDR reads each panel's axis domains to recover the visual layout (including ragged grids), so arrow keys move between panels in reading order, `Enter` drills into a panel, and `Escape` returns to panel navigation. The selected panel is outlined visually.

```html
<div id="subplot-chart" style="width: 900px; height: 600px"></div>
<script>
  Plotly.newPlot('subplot-chart', [
    { x: ['Mon', 'Tue'], y: [20, 14], type: 'bar', name: 'Tips' },
    { x: [1, 2, 3], y: [10, 15, 13], type: 'scatter', mode: 'lines+markers', name: 'Sales', xaxis: 'x2', yaxis: 'y2' },
    { x: [5.1, 4.9, 4.7], y: [1.4, 1.4, 1.3], type: 'scatter', mode: 'markers', name: 'Iris', xaxis: 'x3', yaxis: 'y3' },
    { x: [1.2, 1.9, 2.1, 2.4, 3.0], type: 'histogram', name: 'Distribution', xaxis: 'x4', yaxis: 'y4' }
  ], {
    title: { text: 'Four Views of the Data' },
    grid: { rows: 2, columns: 2, pattern: 'independent' }
  });
</script>
```

Each panel announces its trace name (e.g. "Subplot 1 of 4") while navigating; inset plots and overlaid dual-axis charts are kept as a flat panel list rather than forced into a grid.

### Facets (Plotly Express style)

Faceted figures — shared `matches:` axes plus facet-label annotations, the pattern Plotly Express emits for `facet_row`/`facet_col` — are fully supported:

- Facet labels (e.g. `"sex=Male"`) become the panel names announced during navigation.
- Axis titles carried only by the outer (matched) axis are resolved for every inner panel.

Both annotation shapes are recognized:

- **Paper refs** (`xref: 'paper'`, `yref: 'paper'`) — what plotly.py actually emits for Plotly Express facet labels and `make_subplots` `row_titles`/`column_titles`/`subplot_titles`. These are matched to panels geometrically: column titles above the top row, rotated row titles at the right edge, and per-panel titles (e.g. `facet_col_wrap`) just above each panel.
- **Axis-domain refs** (`xref: 'x2 domain'`) — hand-authored facet labels tied explicitly to a panel's axes, as in the example below.

```html
<div id="facet-chart" style="width: 900px; height: 450px"></div>
<script>
  Plotly.newPlot('facet-chart', [
    { x: [16.99, 10.34, 21.01], y: [1.01, 1.66, 3.5], type: 'scatter', mode: 'markers' },
    { x: [8.77, 26.88, 15.04], y: [2.0, 3.12, 1.96], type: 'scatter', mode: 'markers', xaxis: 'x2', yaxis: 'y2' }
  ], {
    xaxis: { domain: [0, 0.48], title: { text: 'Total Bill ($)' } },
    xaxis2: { domain: [0.52, 1], matches: 'x' },
    yaxis: { title: { text: 'Tip ($)' } },
    yaxis2: { matches: 'y', anchor: 'x2' },
    annotations: [
      { text: 'sex=Female', xref: 'x domain', yref: 'y domain', x: 0.5, y: 1.05, showarrow: false },
      { text: 'sex=Male', xref: 'x2 domain', yref: 'y2 domain', x: 0.5, y: 1.05, showarrow: false }
    ]
  });
</script>
```

Charts generated from Python (`plotly.express` facets, `make_subplots`) work the same way — the adapter reads the rendered figure, so no extra configuration is needed.

## Dynamic Charts

MAIDR handles charts created after initial page load (common in SPAs and Jupyter notebooks). A `MutationObserver` watches for new `.js-plotly-plot` elements and initializes them automatically.

For charts that render asynchronously, MAIDR also listens for the `plotly_afterplot` event before processing.

The observer disconnects after 30 seconds to avoid unnecessary overhead.

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

| Feature | Vanilla JS (CDN) | React Component | Plotly.js Adapter |
|---------|-----------------|-----------------|-------------------|
| Setup | `maidr-data` attribute with JSON | `data` prop on `<Maidr>` | Just add `<script>` tag |
| Data source | Manual JSON schema | Manual JSON schema | Auto-extracted from Plotly |
| SVG selectors | Manual CSS selectors | Manual CSS selectors | Auto-generated |
| Configuration | Required | Required | Zero configuration |
| Chart types | All MAIDR types | All MAIDR types | 9 Plotly types |
| Dynamic charts | Manual init | React lifecycle | Auto-detected |

## Python and R Binders

If you generate Plotly charts from Python or R, you may also be interested in:

- **[py-maidr](https://py.maidr.ai)** — Python binder for matplotlib and seaborn
- **[maidr (R)](https://r.maidr.ai)** — R binder for ggplot2

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
