# Frappe Charts Integration

MAIDR provides an adapter for [Frappe Charts](https://frappe.io/charts) — a lightweight, open-source SVG charting library — that converts your charts into accessible, navigable visualizations with audio sonification, text descriptions, and braille output.

## Quick Start

Load `maidr.js` and `frappe.js` after Frappe Charts. Frappe renders its SVG at runtime, so call the adapter once the chart has rendered and set the `maidr` attribute on the chart container:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Frappe Chart</title>
    <!-- 1. Load Frappe Charts (v1.6.2 bundles its own styles; no separate CSS file) -->
    <script src="https://cdn.jsdelivr.net/npm/frappe-charts@1.6.2/dist/frappe-charts.min.umd.js"></script>
    <!-- 2. Load MAIDR core and the Frappe adapter -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/frappe.js"></script>
  </head>
  <body>
    <div id="chart"></div>

    <script>
      const data = {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        datasets: [{ name: 'Visitors', values: [120, 240, 180, 300, 150] }],
      };

      const chart = new frappe.Chart('#chart', {
        title: 'Daily Website Visitors',
        data: data,
        type: 'bar',
        height: 400,
      });

      // 3. Frappe runs an entrance animation and RE-CREATES the SVG nodes once
      //    it finishes. Wait until the chart DOM stops mutating before handing
      //    it to MAIDR, otherwise MAIDR captures nodes Frappe later replaces and
      //    highlighting won't track the cursor until the chart is re-initialized.
      activateMaidrWhenSettled(document.querySelector('#chart'), {
        chartType: 'bar',
        title: 'Daily Website Visitors',
        axes: { x: 'Day of Week', y: 'Number of Visitors' },
      });

      function activateMaidrWhenSettled(container, options) {
        if (!container.querySelector('svg.frappe-chart')) {
          requestAnimationFrame(() => activateMaidrWhenSettled(container, options));
          return;
        }
        let settleTimer;
        const observer = new MutationObserver(scheduleSettle);
        function scheduleSettle() {
          clearTimeout(settleTimer);
          settleTimer = setTimeout(finish, 300);
        }
        function finish() {
          observer.disconnect();
          const maidr = maidrFrappe.createMaidrFromFrappeChart(chart, container, options);
          container.setAttribute('maidr', JSON.stringify(maidr));
        }
        observer.observe(container, { childList: true, subtree: true, attributes: true });
        scheduleSettle();
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

The Frappe Charts adapter:

1. **Reads data** - takes the chart's `{ labels, datasets }` and converts it to MAIDR's schema
2. **Creates selectors** - generates CSS selectors (scoped to the chart container) for the Frappe SVG elements used in visual highlighting. Line and scatter traces highlight one element per point, so they target the per-point `<circle>` dots — keep `lineOptions.dotSize > 0`.
3. **Returns MAIDR config** - produces a complete `Maidr` object you set as the `maidr` attribute

### Wait for the chart to settle

Frappe generates its SVG at runtime **and** runs an entrance animation, after which it re-creates the data nodes. If you hand the chart to MAIDR before this settles, MAIDR captures references to nodes Frappe then replaces, and highlighting won't track the cursor (a symptom is that highlighting only starts working after you switch browser tabs and return, which re-initializes MAIDR).

The `activateMaidrWhenSettled` helper in the Quick Start handles this: it waits for `svg.frappe-chart` to exist, then uses a `MutationObserver` to wait until the chart DOM stops mutating (~300 ms of quiet) before calling the adapter and setting the `maidr` attribute. MAIDR's attribute observer then detects the `maidr` attribute and activates accessibility automatically.

> **Version note:** the adapter's selectors target Frappe Charts **v1.6.2**. If you upgrade Frappe, verify the SVG class names still match.

## Supported Chart Types

| Chart Type | Frappe `type` | Adapter `chartType` |
|------------|---------------|---------------------|
| Bar | `'bar'` | `'bar'` |
| Line | `'line'` | `'line'` |
| Multi-line | `'line'` (multiple datasets) | `'line'` |
| Scatter | `'line'` + `lineOptions: { hideLine: 1 }` | `'scatter'` |
| Mixed axis (bar + line) | `'axis-mixed'` | `'axis-mixed'` |

**Not supported:** Pie, Donut, and Percentage charts (no MAIDR equivalent), and Frappe's calendar-style Heatmap (structurally unlike MAIDR's matrix heatmap).

> **Scatter note:** Frappe Charts v1.6.2 has no native `scatter` type. Render a dot plot with a line chart whose connecting line is hidden (`lineOptions: { hideLine: 1 }`); pass `chartType: 'scatter'` to the adapter so it is treated as a scatter plot. Frappe spaces x-axis labels evenly regardless of their numeric value, so use evenly spaced numeric labels.

## Code Examples

> The snippets below reuse the `activateMaidrWhenSettled` helper from the [Quick Start](#quick-start) — it waits for Frappe's entrance animation to settle before activating MAIDR. Line-based charts set `lineOptions.dotSize > 0` so MAIDR can highlight the per-point dots.

### Bar Chart

```html
<div id="bar-chart"></div>
<script>
  const data = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    datasets: [{ name: 'Visitors', values: [120, 240, 180, 300, 150] }],
  };
  const chart = new frappe.Chart('#bar-chart', { data, type: 'bar', height: 400 });

  activateMaidrWhenSettled(document.querySelector('#bar-chart'), {
    chartType: 'bar',
    title: 'Daily Website Visitors',
    axes: { x: 'Day of Week', y: 'Number of Visitors' },
  });
</script>
```

### Line Chart

```html
<div id="line-chart"></div>
<script>
  const data = {
    labels: ['2021', '2022', '2023', '2024', '2025'],
    datasets: [{ name: 'Revenue', values: [71, 85, 93, 110, 125] }],
  };
  // dotSize > 0 renders the per-point dots MAIDR highlights.
  const chart = new frappe.Chart('#line-chart', {
    data,
    type: 'line',
    height: 400,
    lineOptions: { dotSize: 5 },
  });

  activateMaidrWhenSettled(document.querySelector('#line-chart'), {
    chartType: 'line',
    title: 'Annual Revenue',
    axes: { x: 'Year', y: 'Revenue (thousands USD)' },
  });
</script>
```

### Multi-Line Chart

```html
<div id="multiline-chart"></div>
<script>
  const data = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      { name: 'Product A', values: [18, 40, 30, 35, 50, 42] },
      { name: 'Product B', values: [36, 20, 48, 46, 30, 55] },
    ],
  };
  const chart = new frappe.Chart('#multiline-chart', {
    data,
    type: 'line',
    height: 400,
    lineOptions: { dotSize: 5 },
  });

  // Multiple datasets are auto-detected; one selector per line + a legend.
  activateMaidrWhenSettled(document.querySelector('#multiline-chart'), {
    chartType: 'line',
    title: 'Monthly Product Sales',
    axes: { x: 'Month', y: 'Sales (thousands USD)' },
  });
</script>
```

### Scatter Plot

```html
<div id="scatter-chart"></div>
<script>
  const data = {
    labels: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    datasets: [{ name: 'Temperature', values: [22, 25, 28, 24, 31, 35, 33, 37, 40, 42] }],
  };
  // Frappe v1.6.2 has no native 'scatter' type; a line chart with the line
  // hidden renders only the dots, which the adapter treats as scatter points.
  const chart = new frappe.Chart('#scatter-chart', {
    data,
    type: 'line',
    height: 400,
    lineOptions: { hideLine: 1, dotSize: 6 },
  });

  activateMaidrWhenSettled(document.querySelector('#scatter-chart'), {
    chartType: 'scatter',
    title: 'Temperature vs Altitude',
    axes: { x: 'Altitude (m)', y: 'Temperature (C)' },
  });
</script>
```

### Mixed Axis Chart (Bar + Line)

```html
<div id="mixed-chart"></div>
<script>
  const data = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      { name: 'Sales', chartType: 'bar', values: [50, 70, 85, 60, 95, 110] },
      { name: 'Trend', chartType: 'line', values: [55, 65, 75, 70, 80, 100] },
    ],
  };
  // dotSize > 0 renders the per-point dots MAIDR highlights on the line layer.
  const chart = new frappe.Chart('#mixed-chart', {
    data,
    type: 'axis-mixed',
    height: 400,
    lineOptions: { dotSize: 5 },
  });

  // Emits one layer per dataset; use PageUp / PageDown to switch layers.
  activateMaidrWhenSettled(document.querySelector('#mixed-chart'), {
    chartType: 'axis-mixed',
    title: 'Monthly Sales with Trend Line',
    axes: { x: 'Month', y: 'Value (units)' },
  });
</script>
```

## Configuration Options

The adapter accepts a `FrappeChartAdapterOptions` object:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `chartType` | `'bar' \| 'line' \| 'scatter' \| 'axis-mixed'` | Yes | The Frappe chart type. Multi-line uses `'line'`. |
| `title` | `string` | No | Chart title for accessibility announcements |
| `axes` | `{ x?: string; y?: string }` | No | Axis labels |
| `id` | `string` | No | Unique ID for the MAIDR instance (defaults to the container's `id`) |

## Using with npm/Bundlers

For bundled projects, import the adapter directly:

```typescript
import { createMaidrFromFrappeChart } from 'maidr/frappe';

// Use after the chart has rendered
const maidr = createMaidrFromFrappeChart(chart, container, {
  chartType: 'bar',
  title: 'My Chart',
  axes: { x: 'Category', y: 'Value' },
});
container.setAttribute('maidr', JSON.stringify(maidr));
```

## Keyboard Controls

Once a chart is focused, use standard MAIDR keyboard shortcuts:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between data points | Arrow keys | Arrow keys |
| Switch layers (mixed chart) | Page Up / Page Down | Page Up / Page Down |
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
