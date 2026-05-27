# Recharts Integration


MAIDR provides a dedicated adapter for [Recharts](https://recharts.org) that automatically converts Recharts data into MAIDR's accessible format. Simply wrap your Recharts chart with `<MaidrRecharts>` and provide a few configuration props -- no need to manually build MAIDR's JSON data structure.

## Installation

```bash
npm install maidr@latest recharts
```

MAIDR requires React 18 or 19 as a peer dependency:

```bash
npm install react react-dom
```

## Quick Start

Import `MaidrRecharts` from `maidr/recharts` and wrap your Recharts chart:

```tsx
import { MaidrRecharts } from 'maidr/recharts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const data = [
  { quarter: 'Q1', revenue: 4200 },
  { quarter: 'Q2', revenue: 5800 },
  { quarter: 'Q3', revenue: 3900 },
  { quarter: 'Q4', revenue: 7100 },
];

function AccessibleBarChart() {
  return (
    <MaidrRecharts
      id="sales-chart"
      title="Quarterly Revenue"
      data={data}
      chartType="bar"
      xKey="quarter"
      yKeys={['revenue']}
      xLabel="Quarter"
      yLabel="Revenue ($)"
    >
      <BarChart width={600} height={350} data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="quarter" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="revenue" fill="#8884d8" />
      </BarChart>
    </MaidrRecharts>
  );
}
```


## Props Reference

### `<MaidrRecharts>`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the chart (used for DOM IDs). |
| `children` | `ReactNode` | Yes | Recharts chart component(s) to make accessible. |
| `data` | `Record<string, unknown>[]` | Yes | Recharts data array. Each item is one data point with named fields. |
| `xKey` | `string` | Yes | Key in data objects for x-axis values. |
| `chartType` | `RechartsChartType` | Simple mode | Chart type (see supported types below). |
| `yKeys` | `string[]` | Simple mode | Keys in data objects for y-axis values. Each key is a data series. |
| `layers` | `RechartsLayerConfig[]` | Composed mode | Layer configs for mixed chart types (see Composed Charts). |
| `title` | `string` | No | Chart title displayed in text descriptions. |
| `subtitle` | `string` | No | Chart subtitle. |
| `caption` | `string` | No | Chart caption. |
| `xLabel` | `string` | No | X-axis label. |
| `yLabel` | `string` | No | Y-axis label. |
| `orientation` | `Orientation` | No | Bar orientation. Defaults to vertical. |
| `fillKeys` | `string[]` | No | Display names for series in stacked/dodged/normalized charts. Maps 1:1 with `yKeys`. |
| `binConfig` | `HistogramBinConfig` | Histogram only | Bin range configuration for histograms. |
| `selectorOverride` | `string` | No | Custom CSS selector for SVG highlighting (see Advanced section). |

## Configuration Modes

### Simple Mode

Use `chartType` + `yKeys` when your chart has a single chart type:

```tsx
<MaidrRecharts
  id="my-chart"
  data={data}
  chartType="bar"       // Single chart type
  xKey="month"
  yKeys={['revenue']}   // One or more data series
  xLabel="Month"
  yLabel="Revenue"
>
  {/* Recharts component */}
</MaidrRecharts>
```

### Composed Mode

Use `layers` when your chart mixes different chart types (e.g., bar + line):

```tsx
<MaidrRecharts
  id="my-chart"
  data={data}
  xKey="month"
  layers={[                                              // Mixed chart types
    { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
    { yKey: 'trend', chartType: 'line', name: 'Trend' },
  ]}
  xLabel="Month"
  yLabel="Value"
>
  {/* Recharts ComposedChart component */}
</MaidrRecharts>
```

## Supported Chart Types

| `chartType` value | Recharts Component | Description |
|---|---|---|
| `'bar'` | `<Bar>` | Simple bar chart |
| `'stacked_bar'` | `<Bar stackId="...">` | Stacked bar chart (multiple `yKeys`) |
| `'dodged_bar'` | Multiple `<Bar>` | Grouped/side-by-side bar chart (multiple `yKeys`) |
| `'normalized_bar'` | `<Bar stackId="...">` | 100% stacked bar chart (multiple `yKeys`) |
| `'histogram'` | `<Bar>` | Histogram with bin ranges (requires `binConfig`) |
| `'line'` | `<Line>` | Line chart |
| `'scatter'` | `<Scatter>` | Scatter/point plot |

## Data Examples by Chart Type

### Bar Chart

```tsx
const data = [
  { quarter: 'Q1', revenue: 4200 },
  { quarter: 'Q2', revenue: 5800 },
  { quarter: 'Q3', revenue: 3900 },
  { quarter: 'Q4', revenue: 7100 },
];

<MaidrRecharts
  id="bar-example"
  title="Quarterly Revenue"
  data={data}
  chartType="bar"
  xKey="quarter"
  yKeys={['revenue']}
  xLabel="Quarter"
  yLabel="Revenue ($)"
>
  <BarChart width={600} height={350} data={data}>
    <XAxis dataKey="quarter" />
    <YAxis />
    <Bar dataKey="revenue" fill="#8884d8" />
  </BarChart>
</MaidrRecharts>
```

### Stacked Bar Chart

Multiple `yKeys` with `chartType="stacked_bar"`. Use `fillKeys` for display names:

```tsx
const data = [
  { month: 'Jan', electronics: 4000, clothing: 2400, food: 1800 },
  { month: 'Feb', electronics: 3000, clothing: 1398, food: 2200 },
  { month: 'Mar', electronics: 2000, clothing: 3800, food: 2500 },
];

<MaidrRecharts
  id="stacked-example"
  title="Sales by Category"
  data={data}
  chartType="stacked_bar"
  xKey="month"
  yKeys={['electronics', 'clothing', 'food']}
  fillKeys={['Electronics', 'Clothing', 'Food']}
  xLabel="Month"
  yLabel="Sales ($)"
>
  <BarChart width={600} height={350} data={data}>
    <XAxis dataKey="month" />
    <YAxis />
    <Bar dataKey="electronics" stackId="a" fill="#8884d8" />
    <Bar dataKey="clothing" stackId="a" fill="#82ca9d" />
    <Bar dataKey="food" stackId="a" fill="#ffc658" />
  </BarChart>
</MaidrRecharts>
```

### Dodged (Grouped) Bar Chart

```tsx
<MaidrRecharts
  id="dodged-example"
  title="Sales Comparison"
  data={data}
  chartType="dodged_bar"
  xKey="month"
  yKeys={['electronics', 'clothing', 'food']}
  fillKeys={['Electronics', 'Clothing', 'Food']}
  xLabel="Month"
  yLabel="Sales ($)"
>
  <BarChart width={600} height={350} data={data}>
    <XAxis dataKey="month" />
    <YAxis />
    {/* No stackId = dodged/grouped layout */}
    <Bar dataKey="electronics" fill="#8884d8" />
    <Bar dataKey="clothing" fill="#82ca9d" />
    <Bar dataKey="food" fill="#ffc658" />
  </BarChart>
</MaidrRecharts>
```

### Histogram

Requires `binConfig` to specify which data keys contain the bin edges:

```tsx
const data = [
  { bin: '0-10', count: 5, xMin: 0, xMax: 10 },
  { bin: '10-20', count: 12, xMin: 10, xMax: 20 },
  { bin: '20-30', count: 8, xMin: 20, xMax: 30 },
  { bin: '30-40', count: 3, xMin: 30, xMax: 40 },
];

<MaidrRecharts
  id="histogram-example"
  title="Score Distribution"
  data={data}
  chartType="histogram"
  xKey="bin"
  yKeys={['count']}
  binConfig={{ xMinKey: 'xMin', xMaxKey: 'xMax' }}
  xLabel="Score Range"
  yLabel="Frequency"
>
  <BarChart width={600} height={350} data={data}>
    <XAxis dataKey="bin" />
    <YAxis />
    <Bar dataKey="count" fill="#8884d8" />
  </BarChart>
</MaidrRecharts>
```

### Line Chart

```tsx
const data = [
  { month: 'Jan', users: 400 },
  { month: 'Feb', users: 600 },
  { month: 'Mar', users: 550 },
  { month: 'Apr', users: 780 },
];

<MaidrRecharts
  id="line-example"
  title="Monthly Active Users"
  data={data}
  chartType="line"
  xKey="month"
  yKeys={['users']}
  xLabel="Month"
  yLabel="Active Users"
>
  <LineChart width={600} height={350} data={data}>
    <XAxis dataKey="month" />
    <YAxis />
    <Line type="monotone" dataKey="users" stroke="#8884d8" dot />
  </LineChart>
</MaidrRecharts>
```

> **Tip:** Always include `dot` on the `<Line>` component. MAIDR uses the rendered dot elements for visual highlighting during keyboard navigation.

### Scatter Chart

```tsx
const data = [
  { height: 65, weight: 150 },
  { height: 70, weight: 175 },
  { height: 62, weight: 130 },
  { height: 68, weight: 165 },
];

<MaidrRecharts
  id="scatter-example"
  title="Height vs Weight"
  data={data}
  chartType="scatter"
  xKey="height"
  yKeys={['weight']}
  xLabel="Height (in)"
  yLabel="Weight (lbs)"
>
  <ScatterChart width={600} height={350}>
    <XAxis dataKey="height" type="number" />
    <YAxis dataKey="weight" type="number" />
    <Scatter data={data} fill="#8884d8" />
  </ScatterChart>
</MaidrRecharts>
```

### Composed Chart (Bar + Line)

Use `layers` mode to mix different chart types in a single chart:

```tsx
const data = [
  { month: 'Jan', revenue: 4200, trend: 4000 },
  { month: 'Feb', revenue: 5800, trend: 4800 },
  { month: 'Mar', revenue: 3900, trend: 5200 },
  { month: 'Apr', revenue: 7100, trend: 5800 },
];

<MaidrRecharts
  id="composed-example"
  title="Revenue and Trend"
  data={data}
  xKey="month"
  layers={[
    { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
    { yKey: 'trend', chartType: 'line', name: 'Trend' },
  ]}
  xLabel="Month"
  yLabel="Amount ($)"
>
  <ComposedChart width={600} height={350} data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="month" />
    <YAxis />
    <Tooltip />
    <Legend />
    <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
    <Line type="monotone" dataKey="trend" stroke="#ff7300" name="Trend" dot />
  </ComposedChart>
</MaidrRecharts>
```

## TypeScript Types

All types are exported from `maidr/recharts`:

```tsx
import {
  MaidrRecharts,              // The wrapper component
  type MaidrRechartsProps,     // Props for MaidrRecharts
  type RechartsAdapterConfig,  // Adapter configuration
  type RechartsChartType,      // Supported chart types
  type RechartsLayerConfig,    // Layer config for composed mode
  type HistogramBinConfig,     // Histogram bin configuration
} from 'maidr/recharts';
```

### `RechartsChartType`

```typescript
type RechartsChartType =
  | 'bar'
  | 'stacked_bar'
  | 'dodged_bar'
  | 'normalized_bar'
  | 'histogram'
  | 'line'
  | 'scatter';
```

### `RechartsLayerConfig`

```typescript
interface RechartsLayerConfig {
  yKey: string;              // Key in data for this series' y-values
  chartType: RechartsChartType; // Chart type for this series
  name?: string;             // Display name (used in legends/descriptions)
}
```

### `HistogramBinConfig`

```typescript
interface HistogramBinConfig {
  xMinKey: string;   // Key for lower bin edge
  xMaxKey: string;   // Key for upper bin edge
  yMinKey?: string;  // Key for minimum count (defaults to 0)
  yMaxKey?: string;  // Key for maximum count (defaults to yKey value)
}
```

## Advanced

### How It Works

`<MaidrRecharts>` is a convenience wrapper that:

1. Takes your Recharts-style data and configuration props
2. Converts them into MAIDR's internal data format via `convertRechartsToMaidr()`
3. Wraps your Recharts children with the `<Maidr>` component

This means you use Recharts' familiar flat data format (`[{ name: 'Q1', value: 100 }, ...]`) instead of building MAIDR's typed structures manually.

### Recharts vs React (Low-Level)

| Feature | Recharts Adapter | React (Low-Level) |
|---------|-----------------|-------------------|
| Import | `import { MaidrRecharts } from 'maidr/recharts'` | `import { Maidr } from 'maidr/react'` |
| Data format | Recharts flat array | MAIDR typed structures |
| Configuration | Props on `<MaidrRecharts>` | Manual `MaidrData` JSON |
| Chart types | 7 supported types | All MAIDR trace types |
| SVG highlighting | Automatic | Manual `selectors` setup |
| Best for | Recharts projects | Custom SVG / other libraries |

## Keyboard Controls

Once a chart is focused, the following keyboard shortcuts are available:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move around plot | Arrow keys | Arrow keys |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Toggle Braille Mode | B | B |
| Toggle Sonification | S | S |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |
| Open Settings | Ctrl + , | Cmd + , |
| Open Command Palette | Ctrl + Shift + P | Cmd + Shift + P |

For a complete list, see the [Controls documentation](index.html#controls).
