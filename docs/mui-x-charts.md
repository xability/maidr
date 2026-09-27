# MUI X Charts Integration

MAIDR provides a dedicated adapter for [MUI X Charts](https://mui.com/x/react-charts/) (`@mui/x-charts`) that makes MUI charts accessible without describing the data a second time. Wrap your chart with `<MaidrMuiCharts>`: the adapter reads the `series`, `xAxis`, `yAxis`, `dataset` and `layout` props the chart was given, and finds the rendered marks through the `data-series` attributes and class names MUI X stamps on its SVG. The chart itself is never modified.

## Installation

```bash
npm install maidr@latest @mui/x-charts
```

MUI X Charts v9 is supported. The Pro charts (`Heatmap`, `FunnelChart`, `SankeyChart`) come from `@mui/x-charts-pro` v9, under MUI's own license. MAIDR requires React 18 or 19 as a peer dependency, and MUI X Charts needs `@mui/material` and Emotion:

```bash
npm install react react-dom @mui/material @emotion/react @emotion/styled
```

## Quick Start

Import `MaidrMuiCharts` from `maidr/mui-x-charts` and wrap your chart:

```tsx
import { BarChart } from '@mui/x-charts/BarChart';
import { MaidrMuiCharts } from 'maidr/mui-x-charts';

function AccessibleBarChart() {
  return (
    <MaidrMuiCharts id="sales-chart" title="Quarterly Revenue">
      <BarChart
        width={600}
        height={360}
        xAxis={[{ scaleType: 'band', data: ['Q1', 'Q2', 'Q3', 'Q4'], label: 'Quarter' }]}
        yAxis={[{ label: 'Revenue ($)' }]}
        series={[{ data: [4200, 5800, 3900, 7100], label: 'Revenue' }]}
      />
    </MaidrMuiCharts>
  );
}
```

Give the chart a `width`. Without one, an MUI X chart sizes itself to its container, and MAIDR's plot is only as wide as the chart inside it, so the two shrink each other to a sliver. The adapter says so in the console when a chart has no `width`.

Axis labels come from each axis' `label`, series names from each series' `label`, and category names from the band axis' `data` (or its `dataKey` column of the `dataset`), formatted with the axis' `valueFormatter` when it has one.

## Props Reference

### `<MaidrMuiCharts>`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the chart (used for DOM IDs). |
| `children` | `ReactNode` | Yes | One MUI X chart element (any component in the tables below), optionally inside plain wrapper elements. |
| `title` | `string` | No | Chart title displayed in text descriptions. MUI X charts have no title of their own. |
| `subtitle` | `string` | No | Chart subtitle. |
| `caption` | `string` | No | Chart caption. |
| `chartType` | `'bar' \| 'line' \| 'scatter' \| 'pie' \| 'sparkline' \| 'gauge' \| 'radar' \| 'heatmap' \| 'funnel' \| 'sankey'` | No | Which chart `children` is. Only needed when neither the component's name nor the rendered SVG says so. |

The kind of chart is read from the component's name (`BarChart`, `LineChart`, `ScatterChart`, `PieChart`, `SparkLineChart`, `Gauge`, `RadarChart`, `Heatmap`, `FunnelChart`, `SankeyChart`, and their `Pro`/`Premium` variants). A production build that minifies the name away still works: the adapter then reads the kind from the class names MUI puts on the rendered plot.

`<MaidrMuiCharts>` turns off MUI X's own keyboard navigation on the chart (`disableKeyboardNavigation`), which would otherwise add a second tab stop answering the same arrow keys. Set the prop on the chart yourself to decide otherwise. With the hook, set it on the chart you render.

## Supported Chart Types

### Stable chart types

| Chart | MUI X component | Highlight | Notes |
|---|---|---|---|
| Bar chart | `BarChart` | ✅ | One series. A `null` value draws no bar and is left out. |
| Grouped bar chart | `BarChart` | ✅ | Several series without a `stack`. |
| Stacked bar chart | `BarChart` | ✅ | Series sharing a `stack` id. |
| Normalized bar | `BarChart` | ✅ | A stack whose `stackOffset` is `'expand'`. |
| Horizontal bar | `BarChart` | ✅ | `layout="horizontal"`; the categories are read from the y axis. |
| Line chart | `LineChart` | ✅ | Every series is one line of a multi-line layer. A `null` value is a gap. |
| Step chart | `LineChart` | ✅ | Series with `curve: 'stepAfter'`, `'stepBefore'` or `'step'`. |
| Scatter plot | `ScatterChart` | ✅ | One layer per series; switch layers with Page Up / Page Down. A point outside an explicit axis `min`/`max` is not drawn, and is left out. |
| Pie / doughnut | `PieChart` | ⚠️ | A doughnut is the same component with an `innerRadius`. Several series (nested rings) become one layer per ring. See the notes below for sorted and partial pies. |
| Sparkline | `SparkLineChart` | ✅ | Read as the line (or, with `plotType="bar"`, the bar chart) it draws; `curve` as a `LineChart`'s. With `area`, it is the experimental area chart below. |
| Heatmap | `Heatmap` (Pro) | ✅ | The first series, as MUI draws it; the first y category is the top row, and an axis without `data` is numbered from 0. A cell the data leaves out, or leaves without a value, is announced as a gap; every cell MUI draws (its `zAxis` colour map gives it a colour) is outlined. |

### Experimental chart types

These may change without a deprecation period; see [Trace type stability](SCHEMA.md#trace-type-stability).

| Chart | MUI X component | Highlight | Notes |
|---|---|---|---|
| Area chart [experimental] | `LineChart` | ✅ | Series with `area: true` and no `stack`. |
| Stacked area [experimental] | `LineChart` | ✅ | Series sharing a `stack` id, filled or not: MUI draws each at the running total. |
| 100% stacked area [experimental] | `LineChart` | ✅ | A stack whose `stackOffset` is `'expand'`. |
| Gauge [experimental] | `Gauge` | ✅ | `value` on a dial from `valueMin` (0) to `valueMax` (100); the filled arc is outlined. |
| Radar chart [experimental] | `RadarChart` | ✅ | One row per series, one column per `radar.metrics` spoke. |
| Funnel chart [experimental] | `FunnelChart` (Pro) | ✅ | One layer per series, stages in data order, named by each item's `label` or else `categoryAxis.categories`. The default vertical funnel draws each value as a width. |
| Sankey [experimental] | `SankeyChart` (Pro) | ✅ | One flow per link, named by its nodes' `label`s (or ids; a label two nodes share is followed by the id). Two links between the same pair of nodes are both read, but not outlined. |

### Notes on these chart types

- A bar chart mixing stacked and unstacked series, or holding two stacks, becomes one layer per stack group.
- A bar with no value is not drawn, and is announced as a gap in a grouped or stacked chart. A bar lying wholly outside an explicit value-axis `min`/`max` is culled by MUI, and is not outlined.
- A pie with `sortingValues` is read in the order its slices are drawn round the dial, but not outlined: its arcs stay in data order in the page.
- A pie that does not go all the way round (`endAngle - startAngle` below 360) is read as if it did, so the clock position of each slice is approximate.
- `renderer="svg-batch"` (and, for a scatter, `"svg-progressive"`) draws no element per mark, so nothing is outlined. Audio, text and braille are unaffected. The adapter warns in the console.
- Charts built with the composition API (`<ChartsContainer>` with series of several types) are left unread, with a console warning.
- Console warnings name the chart by its `id`, once per chart.
- `SparkLineChart` accepts `disableKeyboardNavigation` but, as of MUI X 9.14, does not pass it on, so a sparkline keeps MUI's own tab stop beside MAIDR's.

## Data Examples by Chart Type

### Stable chart types

#### Bar Chart

```tsx
<MaidrMuiCharts id="bar-example" title="Quarterly Revenue">
  <BarChart
    width={600}
    height={360}
    xAxis={[{ scaleType: 'band', data: ['Q1', 'Q2', 'Q3', 'Q4'], label: 'Quarter' }]}
    yAxis={[{ label: 'Revenue ($)' }]}
    series={[{ data: [4200, 5800, 3900, 7100], label: 'Revenue' }]}
  />
</MaidrMuiCharts>
```

#### Grouped Bar Chart

Series can read from a shared `dataset` through `dataKey`:

```tsx
const dataset = [
  { quarter: 'Q1', north: 42, south: 31 },
  { quarter: 'Q2', north: 58, south: 44 },
];

<MaidrMuiCharts id="grouped-example" title="Units Sold by Region">
  <BarChart
    width={600}
    height={360}
    dataset={dataset}
    xAxis={[{ scaleType: 'band', dataKey: 'quarter', label: 'Quarter' }]}
    series={[
      { dataKey: 'north', label: 'North' },
      { dataKey: 'south', label: 'South' },
    ]}
  />
</MaidrMuiCharts>
```

#### Stacked Bar Chart

```tsx
<MaidrMuiCharts id="stacked-example" title="Electricity Generation by Source">
  <BarChart
    width={600}
    height={360}
    xAxis={[{ scaleType: 'band', data: ['2021', '2022', '2023'], label: 'Year' }]}
    series={[
      { data: [120, 135, 150], label: 'Solar', stack: 'total' },
      { data: [200, 210, 230], label: 'Wind', stack: 'total' },
    ]}
  />
</MaidrMuiCharts>
```

#### Horizontal Bar

```tsx
<MaidrMuiCharts id="horizontal-example" title="Favorite Fruit">
  <BarChart
    width={600}
    height={360}
    layout="horizontal"
    yAxis={[{ scaleType: 'band', data: ['Apple', 'Banana', 'Cherry'], label: 'Fruit' }]}
    xAxis={[{ label: 'Votes' }]}
    series={[{ data: [34, 21, 45] }]}
  />
</MaidrMuiCharts>
```

#### Line Chart

```tsx
<MaidrMuiCharts id="line-example" title="Average Temperature">
  <LineChart
    width={600}
    height={360}
    xAxis={[{ scaleType: 'point', data: ['Jan', 'Feb', 'Mar'], label: 'Month' }]}
    yAxis={[{ label: 'Temperature (°C)' }]}
    series={[
      { data: [5, 7, 10], label: 'Seattle' },
      { data: [12, 14, 17], label: 'Austin' },
    ]}
  />
</MaidrMuiCharts>
```

A `Date` on the x axis is announced in ISO form (`2024-01-31`) unless the axis has a `valueFormatter`.

#### Step Chart

```tsx
<MaidrMuiCharts id="step-example" title="Subscription Price">
  <LineChart
    width={600}
    height={360}
    xAxis={[{ scaleType: 'point', data: ['2020', '2021', '2022', '2023'], label: 'Year' }]}
    series={[{ data: [8, 8, 10, 12], label: 'Price', curve: 'stepAfter' }]}
  />
</MaidrMuiCharts>
```

#### Scatter Plot

```tsx
<MaidrMuiCharts id="scatter-example" title="Height vs Weight">
  <ScatterChart
    width={600}
    height={360}
    xAxis={[{ label: 'Height (cm)' }]}
    yAxis={[{ label: 'Weight (kg)' }]}
    series={[{ data: [{ id: 0, x: 152, y: 48 }, { id: 1, x: 170, y: 66 }], label: 'People' }]}
  />
</MaidrMuiCharts>
```

With a `dataset`, name the columns through the series' `datasetKeys: { x: 'height', y: 'weight' }`, or read each row with a `valueGetter`, as MUI does. Bar and line series read a `dataset` through `dataKey` or `valueGetter` in the same way.

#### Pie / Doughnut

```tsx
<MaidrMuiCharts id="pie-example" title="Browser Market Share">
  <PieChart
    width={500}
    height={320}
    series={[{
      innerRadius: 60, // omit for a pie
      data: [
        { id: 0, value: 64, label: 'Chrome' },
        { id: 1, value: 19, label: 'Safari' },
        { id: 2, value: 17, label: 'Other' },
      ],
    }]}
  />
</MaidrMuiCharts>
```

#### Sparkline

```tsx
<MaidrMuiCharts id="sparkline-example" title="Weekly Sign-ups">
  <SparkLineChart width={300} height={80} data={[3, 7, 4, 9, 6, 11, 8]} />
</MaidrMuiCharts>
```

#### Heatmap

```tsx
import { Heatmap } from '@mui/x-charts-pro/Heatmap';

<MaidrMuiCharts id="heatmap-example" title="Temperature by Hour">
  <Heatmap
    width={500}
    height={300}
    xAxis={[{ data: ['Mon', 'Tue', 'Wed'], label: 'Day' }]}
    yAxis={[{ data: ['Morning', 'Evening'], label: 'Time' }]}
    series={[{ data: [[0, 0, 12], [1, 0, 14], [2, 0, 11], [0, 1, 18], [1, 1, 19], [2, 1, 17]] }]}
  />
</MaidrMuiCharts>
```

Each entry is `[xIndex, yIndex, value]`.

### Experimental chart types

These may change without a deprecation period; see [Trace type stability](SCHEMA.md#trace-type-stability).

#### Stacked Area [experimental]

```tsx
<MaidrMuiCharts id="stacked-area-example" title="Traffic by Source">
  <LineChart
    width={600}
    height={360}
    xAxis={[{ data: [1, 2, 3], label: 'Week' }]}
    series={[
      { data: [100, 120, 140], label: 'Search', stack: 'total', area: true },
      { data: [60, 70, 65], label: 'Social', stack: 'total', area: true },
    ]}
  />
</MaidrMuiCharts>
```

#### Gauge [experimental]

```tsx
<MaidrMuiCharts id="gauge-example" title="Storage Used">
  <Gauge width={250} height={200} value={72} valueMin={0} valueMax={100} />
</MaidrMuiCharts>
```

#### Radar Chart [experimental]

```tsx
<MaidrMuiCharts id="radar-example" title="Player Skills">
  <RadarChart
    width={450}
    height={350}
    series={[{ data: [80, 65, 90, 70], label: 'Alex' }, { data: [60, 85, 70, 90], label: 'Sam' }]}
    radar={{ max: 100, metrics: ['Speed', 'Power', 'Accuracy', 'Stamina'] }}
  />
</MaidrMuiCharts>
```

#### Funnel Chart [experimental]

```tsx
import { FunnelChart } from '@mui/x-charts-pro/FunnelChart';

<MaidrMuiCharts id="funnel-example" title="Checkout Funnel">
  <FunnelChart
    width={450}
    height={320}
    series={[{ data: [{ value: 2000, label: 'Visit' }, { value: 800, label: 'Cart' }, { value: 300, label: 'Purchase' }] }]}
  />
</MaidrMuiCharts>
```

#### Sankey [experimental]

```tsx
import { SankeyChart } from '@mui/x-charts-pro/SankeyChart';

<MaidrMuiCharts id="sankey-example" title="Energy Flow">
  <SankeyChart
    width={500}
    height={320}
    series={{
      data: {
        nodes: [{ id: 'coal', label: 'Coal' }, { id: 'power', label: 'Power' }, { id: 'heat', label: 'Heat' }],
        links: [{ source: 'coal', target: 'power', value: 50 }, { source: 'coal', target: 'heat', value: 20 }],
      },
    }}
  />
</MaidrMuiCharts>
```

## Using the Hook

`useMuiChartsAdapter` returns the MAIDR data for use with the `<Maidr>` component directly. Pass it the same config and a ref to the element wrapping the chart; every selector is scoped to that element, so several charts on one page never highlight each other's marks.

```tsx
import { LineChart } from '@mui/x-charts/LineChart';
import { Maidr } from 'maidr/react';
import { useMuiChartsAdapter } from 'maidr/mui-x-charts';
import { useRef } from 'react';

function AccessibleLineChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chart = (
    <LineChart
      width={600}
      height={360}
      disableKeyboardNavigation
      xAxis={[{ data: [1, 2, 3], label: 'Day' }]}
      series={[{ data: [10, 20, 15], label: 'Visitors' }]}
    />
  );
  const maidrData = useMuiChartsAdapter({ id: 'visitors', title: 'Visitors', children: chart }, containerRef);

  return (
    <Maidr data={maidrData}>
      <div ref={containerRef}>{chart}</div>
    </Maidr>
  );
}
```

## How Highlighting Works

MUI X renders each series inside an element carrying `data-series="<series id>"` (the series' own `id`, or `auto-generated-id-<index>` when it has none), and gives each mark a class: `MuiBarChart-element`, `MuiLineChart-line`, `MuiScatterChart-marker`, `MuiPieChart-arc`. The adapter's selectors name those, prefixed with the wrapper's id. A line or area is highlighted along its line path rather than its fill, since the fill's outline runs down to the baseline and back.

If a future MUI X release changes that markup, highlighting degrades gracefully — audio, text, and braille are unaffected.

## TypeScript Types

```typescript
import type {
  MaidrMuiChartsProps,
  MuiChartKind,
  MuiChartProps,
  MuiChartsAdapterConfig,
} from 'maidr/mui-x-charts';
```

## Examples

See the [MUI X Charts examples](examples.html) for a live demo of every chart type above. To run them locally:

```bash
npm run dev:mui-x-charts
```
