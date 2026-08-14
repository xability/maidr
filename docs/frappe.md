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
2. **Creates selectors** - generates CSS selectors (scoped to the chart container) for the Frappe SVG elements used in visual highlighting. MAIDR highlights one element per data point, so every line-based chart — line, area, bump, scatter, dot — targets the per-point `<circle>` dots rather than the one `<path>` drawn for the whole series. Keep `lineOptions.dotSize > 0` and leave `hideDots` off.
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
| Area | `'line'` + `lineOptions: { regionFill: 1 }` | `'area'` (also inferred) |
| Bump (rank over time) | `'line'` (one dataset per competitor) | `'bump'` |
| Scatter | `'line'` + `lineOptions: { hideLine: 1 }` | `'scatter'` |
| Dot plot | `'line'` + `lineOptions: { hideLine: 1 }` | `'dot'` |
| Diverging bar | `'bar'` (two signed datasets) | `'diverging'` |
| Mixed axis (bar + line) | `'axis-mixed'` | `'axis-mixed'` |
| Pie | `'pie'` | `'pie'` |
| Donut | `'donut'` | `'donut'` |

The `chartType` names above are the **adapter's**, not Frappe's. Frappe draws several distinct statistical charts with the same `type: 'line'` or `type: 'bar'`, differing only in their options or in what the numbers mean — nothing a chart instance records — so naming the chart is how you tell MAIDR which one to announce.

**Not supported:** Percentage charts (no MAIDR equivalent), and Frappe's calendar-style Heatmap (structurally unlike MAIDR's matrix heatmap).

> **Pie note:** Frappe aggregates before it draws — it sums every dataset at each label, drops labels whose total is negative, and collapses everything past `maxSlices` (default 20) into one "Rest" wedge. The adapter reproduces that aggregation so each announced slice is the wedge it highlights. Pass the chart instance (not a plain `{ data }` object) when you override `maxSlices`, so the adapter can read it.

> **Area note:** `lineOptions.regionFill` is an instance field the adapter reads directly, so a chart passed as `chartType: 'line'` with the region filled is announced as an area chart anyway — you cannot mislabel one as the other. Pass `chartType: 'area'` when you hand the adapter a plain `{ data }` object, which has no instance to read. Several filled bands in one chart **overlap** in Frappe rather than stacking, so they stay independent series (`area`, never `stacked_area`). Keep `dotSize > 0`: the fill is one `<path>` for the whole series and cannot highlight individual points.

> **Scatter / dot note:** Frappe Charts v1.6.2 has no native `scatter` type. Render either chart with a line chart whose connecting line is hidden (`lineOptions: { hideLine: 1, dotSize: 6 }`). Frappe places its marks at **evenly spaced label positions whatever the label holds**, so which of the two you have depends on the labels: numeric, evenly spaced labels are a scatter plot (`chartType: 'scatter'`), and category names are a Cleveland dot plot (`chartType: 'dot'`). Passing `'scatter'` with categorical labels is converted as a dot plot with a console warning, because `Number('Mon')` is `NaN` and a scatter layer built from those labels would have no x values at all.

> **Bump note:** A bump chart is a multi-dataset line chart whose y values are **ranks** — one dataset per competitor, `1` = best. MAIDR inverts the pitch so first place is the highest note and announces the places gained or lost at each period, which is why the type has to be declared: nothing in the data distinguishes a rank from a magnitude. Emit the **true ranks**. Frappe v1.6.2 cannot invert or reverse an axis, so a rank chart it draws shows rank 1 at the *bottom*; pre-inverting the values to make the picture look right would make MAIDR announce the wrong ranks.

> **Diverging note:** A diverging bar chart is two bar datasets with opposite signs, drawn either side of Frappe's zero line — negate the values of the series that should grow downwards and emit them signed, exactly as the chart draws them. MAIDR takes the magnitude for the pitch and names the side. The adapter throws unless the chart is exactly two datasets, one all-negative and one all-positive, rather than announce sides that are not there. Two limits are Frappe's: it has no horizontal bars, so the back-to-back population pyramid orientation is not drawable — only the vertical up/down form — and `barOptions: { stacked: 1 }` must **not** be used, because Frappe cumulates raw values and would stack the negative series onto the positive one.

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

### Area Chart

```html
<div id="area-chart"></div>
<script>
  const data = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [{ name: 'Rainfall', values: [42, 55, 71, 63, 48, 30] }],
  };
  // regionFill: 1 fills the band between the line and the baseline. The
  // adapter reads it off the instance, so `chartType: 'line'` is announced as
  // an area chart too — pass 'area' when handing over a plain { data } object.
  const chart = new frappe.Chart('#area-chart', {
    data,
    type: 'line',
    height: 400,
    lineOptions: { regionFill: 1, dotSize: 5 },
  });

  activateMaidrWhenSettled(document.querySelector('#area-chart'), {
    chartType: 'area',
    title: 'Monthly Rainfall',
    axes: { x: 'Month', y: 'Rainfall (mm)' },
  });
</script>
```

### Bump Chart (Rank Over Time)

```html
<div id="bump-chart"></div>
<script>
  // The values are RANKS, 1 = best. Emit them as ranks: MAIDR inverts the
  // pitch itself, and Frappe cannot reverse an axis, so the drawn chart shows
  // rank 1 at the bottom while the announcements stay correct.
  const data = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [
      { name: 'Alpha', values: [1, 2, 2, 1] },
      { name: 'Beta', values: [2, 1, 3, 3] },
      { name: 'Gamma', values: [3, 3, 1, 2] },
    ],
  };
  const chart = new frappe.Chart('#bump-chart', {
    data,
    type: 'line',
    height: 400,
    lineOptions: { dotSize: 6 },
  });

  activateMaidrWhenSettled(document.querySelector('#bump-chart'), {
    chartType: 'bump',
    title: 'Weekly League Standings',
    axes: { x: 'Week', y: 'Rank' },
  });
</script>
```

### Dot Plot

```html
<div id="dot-chart"></div>
<script>
  const data = {
    labels: ['North', 'South', 'East', 'West', 'Central'],
    datasets: [{ name: 'Sales', values: [64, 41, 78, 55, 92] }],
  };
  // Same rendering as the scatter plot below — a line chart with the line
  // hidden. The labels are what tells the two apart: category names place one
  // mark per category, which is a dot plot.
  const chart = new frappe.Chart('#dot-chart', {
    data,
    type: 'line',
    height: 400,
    lineOptions: { hideLine: 1, dotSize: 8 },
  });

  activateMaidrWhenSettled(document.querySelector('#dot-chart'), {
    chartType: 'dot',
    title: 'Sales by Region',
    axes: { x: 'Region', y: 'Sales (thousands USD)' },
  });
</script>
```

### Diverging Bar Chart

```html
<div id="diverging-chart"></div>
<script>
  // Two datasets with opposite signs. The downward series is NEGATIVE: MAIDR
  // takes the magnitude for the pitch and names the side, so stripping the
  // sign would leave it nothing to name the sides with. Do not set
  // barOptions.stacked — Frappe cumulates raw values and would stack the
  // negative series onto the positive one.
  const data = {
    labels: ['0-14', '15-29', '30-44', '45-59', '60-74', '75+'],
    datasets: [
      { name: 'Men', values: [-1200, -1150, -1080, -990, -720, -310] },
      { name: 'Women', values: [1140, 1100, 1060, 1010, 830, 520] },
    ],
  };
  const chart = new frappe.Chart('#diverging-chart', {
    data,
    type: 'bar',
    height: 420,
    colors: ['#4c72b0', '#c44e52'],
  });

  activateMaidrWhenSettled(document.querySelector('#diverging-chart'), {
    chartType: 'diverging',
    title: 'Population by Age Band',
    axes: { x: 'Age band', y: 'People, thousands', z: 'Sex' },
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

## Multi-Panel Figures

Frappe Charts has no native facet/subplot concept — a "multi-panel" chart is simply several `new frappe.Chart(...)` instances laid out with CSS. `createMaidrFromFrappeCharts` groups such charts into **one** MAIDR figure with cross-panel navigation: arrow keys move between panels, <kbd>Enter</kbd> drills into a panel, <kbd>Esc</kbd> returns to panel navigation.

```html
<div id="dashboard" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
  <div id="panel-bar"></div>
  <div id="panel-line"></div>
</div>

<script>
  const barChart = new frappe.Chart('#panel-bar', { type: 'bar', height: 300, data: barData });
  const lineChart = new frappe.Chart('#panel-line', {
    type: 'line',
    height: 300,
    lineOptions: { dotSize: 5 },
    data: lineData,
  });

  // The panel grid, in visual reading order (row-major, top-left first),
  // matching your CSS layout. A flat array + `columns` also works:
  // createMaidrFromFrappeCharts(flatPanels, wrapper, { columns: 2 }).
  const panels = [
    [
      {
        chart: barChart,
        container: document.querySelector('#panel-bar'),
        chartType: 'bar',
        title: 'Weekly Visitors',
        axes: { x: 'Day', y: 'Visitors' },
      },
      {
        chart: lineChart,
        container: document.querySelector('#panel-line'),
        chartType: 'line',
        title: 'Annual Revenue',
        axes: { x: 'Year', y: 'Revenue' },
      },
    ],
  ];

  // Wait until EVERY panel has settled (see "Wait for the chart to settle"),
  // then set the `maidr` attribute on the WRAPPER element.
  const wrapper = document.querySelector('#dashboard');
  Promise.all(panels.flat().map(p => whenChartSettled(p.container))).then(() => {
    const maidr = maidrFrappe.createMaidrFromFrappeCharts(panels, wrapper, {
      title: 'Store Performance Dashboard',
    });
    wrapper.setAttribute('maidr', JSON.stringify(maidr));
  });
</script>
```

Key points:

- **Each panel** is a `FrappePanel`: `{ chart, container, chartType, title?, axes? }` — the same per-chart options as the single-chart API, plus the panel's `title`, which MAIDR announces when navigating between panels.
- **Grid shape**: a 2D array maps 1:1 to subplot rows (ragged rows are fine); a flat array is chunked into rows of `options.columns` panels, or placed in a single row when `columns` is omitted. Order panels in visual reading order (row-major, top-left first) to match your CSS layout.
- **Set the `maidr` attribute on the wrapper**, not on individual panel containers — a per-panel attribute would create N separate MAIDR figures instead of one grid. Every panel container must be a descendant of the wrapper (the adapter throws otherwise).
- **Wait for all panels to settle** before calling the adapter — Frappe's entrance animation re-creates SVG nodes per chart, so wrap the per-container settle wait in `Promise.all` (see [`examples/frappe-multipanel.html`](https://github.com/xability/maidr/blob/main/examples/frappe-multipanel.html) for a complete 2x2 example, including a promise-based `whenChartSettled` helper).
- **Figure-level options** (`FrappeChartsGridOptions`): `id` (defaults to the wrapper's `id`), `title`, `subtitle`, `caption`, and `columns` (flat input only).
- **Live updates are not supported** for grouped charts: calling `chart.update(...)` on a panel after binding re-creates its SVG nodes and invalidates the captured highlight elements. Rebuild and re-set the `maidr` attribute if panel data changes.

## Configuration Options

The adapter accepts a `FrappeChartAdapterOptions` object:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `chartType` | `'bar' \| 'line' \| 'area' \| 'bump' \| 'scatter' \| 'dot' \| 'diverging' \| 'axis-mixed' \| 'pie' \| 'donut'` | Yes | Which chart you drew (see [Supported Chart Types](#supported-chart-types)). Multi-line uses `'line'`. |
| `title` | `string` | No | Chart title for accessibility announcements |
| `axes` | `{ x?: string; y?: string; z?: string }` | No | Axis labels. `z` names the dimension the series themselves vary along (the two sides of a `'diverging'` chart, say) and is ignored by the types that have no third dimension. |
| `id` | `string` | No | Unique ID for the MAIDR instance (defaults to the container's `id`) |

## Using with npm/Bundlers

For bundled projects, import the adapter directly:

```typescript
import { createMaidrFromFrappeChart, createMaidrFromFrappeCharts } from 'maidr/frappe';

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
