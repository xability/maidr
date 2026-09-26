# MUI X Charts Integration

MAIDR provides a dedicated adapter for [MUI X Charts](https://mui.com/x/react-charts/) (`@mui/x-charts`) that makes MUI charts accessible without describing the data a second time. Wrap your chart with `<MaidrMuiCharts>`: the adapter reads the `series`, `xAxis`, `yAxis`, `dataset` and `layout` props the chart was given, and finds the rendered marks through the `data-series` attributes and class names MUI X stamps on its SVG. The chart itself is never modified.

## Installation

```bash
npm install maidr@latest @mui/x-charts
```

MUI X Charts v9 is supported. MAIDR requires React 18 or 19 as a peer dependency, and MUI X Charts needs `@mui/material` and Emotion:

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

Axis labels come from each axis' `label`, series names from each series' `label`, and category names from the band axis' `data` (or its `dataKey` column of the `dataset`), formatted with the axis' `valueFormatter` when it has one.

## Props Reference

### `<MaidrMuiCharts>`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the chart (used for DOM IDs). |
| `children` | `ReactNode` | Yes | One MUI X chart element (`<BarChart>`, `<LineChart>`, `<ScatterChart>` or `<PieChart>`), optionally inside plain wrapper elements. |
| `title` | `string` | No | Chart title displayed in text descriptions. MUI X charts have no title of their own. |
| `subtitle` | `string` | No | Chart subtitle. |
| `caption` | `string` | No | Chart caption. |
| `chartType` | `'bar' \| 'line' \| 'scatter' \| 'pie'` | No | Which chart `children` is. Only needed when neither the component's name nor the rendered SVG says so. |

The kind of chart is read from the component's name (`BarChart`, `LineChart`, `ScatterChart`, `PieChart` and their `Pro`/`Premium` variants). A production build that minifies the name away still works: the adapter then reads the kind from the class names MUI puts on the rendered plot.

## Supported Chart Types

| Chart | MUI X component | Highlight | Notes |
|---|---|---|---|
| Bar chart | `BarChart` | ✅ | One series. A `null` value draws no bar and is left out. |
| Grouped bar chart | `BarChart` | ✅ | Several series without a `stack`. |
| Stacked bar chart | `BarChart` | ✅ | Series sharing a `stack` id. |
| Normalized bar | `BarChart` | ✅ | A stack whose `stackOffset` is `'expand'`. |
| Horizontal bar | `BarChart` | ✅ | `layout="horizontal"`; the categories are read from the y axis. |
| Line chart | `LineChart` | ✅ | Every series is one line of a multi-line layer. A `null` value is a gap. |
| Area chart [experimental] | `LineChart` | ✅ | Series with `area: true` and no `stack`. |
| Stacked area [experimental] | `LineChart` | ✅ | Series sharing a `stack` id, filled or not: MUI draws each at the running total. |
| 100% stacked area [experimental] | `LineChart` | ✅ | A stack whose `stackOffset` is `'expand'`. |
| Scatter plot | `ScatterChart` | ✅ | One layer per series; switch layers with Page Up / Page Down. |
| Pie / doughnut | `PieChart` | ✅ | A doughnut is the same component with an `innerRadius`. Several series (nested rings) become one layer per ring. `startAngle` and `endAngle` are honoured. |

A bar chart mixing stacked and unstacked series, or holding two stacks, becomes one layer per stack group. Charts built with the composition API (`<ChartsContainer>` and plot components), and `Heatmap`, `Gauge`, `SparkLineChart` and the Pro/Premium-only chart types are not read yet.

## Data Examples by Chart Type

### Bar Chart

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

### Grouped Bar Chart

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

### Stacked Bar Chart

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

### Horizontal Bar

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

### Line Chart

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

### Stacked Area [experimental]

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

### Scatter Plot

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

With a `dataset`, name the columns through the series' `datasetKeys: { x: 'height', y: 'weight' }`.

### Pie / Doughnut

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
