# React Integration

> **Note:** The `maidr/react` export is available starting from version **3.51.0**. Make sure you install the latest version.

MAIDR provides a first-class React component for adding accessible, non-visual access to statistical visualizations in your React applications.

## Installation

```bash
npm install maidr@latest
```

MAIDR requires React 18 or 19 as a peer dependency:

```bash
npm install react react-dom
```

## Quick Start

Import the `Maidr` component from `maidr/react` and wrap your chart SVG with it:

```tsx
import { Maidr } from 'maidr/react';
import type { MaidrData } from 'maidr/react';

const chartData: MaidrData = {
  id: 'my-bar-chart',
  title: 'Sales by Quarter',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'bar',
      axes: { x: 'Quarter', y: 'Revenue' },
      data: [
        { x: 'Q1', y: 120 },
        { x: 'Q2', y: 200 },
        { x: 'Q3', y: 150 },
        { x: 'Q4', y: 280 },
      ],
    }],
  }]],
};

function App() {
  return (
    <Maidr data={chartData}>
      <svg viewBox="0 0 400 300">
        {/* Your chart SVG content */}
      </svg>
    </Maidr>
  );
}
```

When a user focuses on the chart (by clicking or tabbing), MAIDR activates and provides:

- **Audio sonification** - Tones that represent data values
- **Text descriptions** - Spoken descriptions of the current data point via screen readers
- **Braille output** - Refreshable braille display support
- **Keyboard navigation** - Arrow keys to move between data points
- **AI-powered descriptions** - Natural language summaries of the visualization

## Props Reference

### `<Maidr>`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `data` | `MaidrData` | Yes | The MAIDR JSON configuration describing the plot data and structure. |
| `children` | `ReactNode` | Yes | The SVG or plot element(s) to make accessible. Rendered inside the figure. |

## TypeScript Types

All types are exported from `maidr/react`:

```tsx
import {
  Maidr,            // The React component
  type MaidrProps,  // Props for the Maidr component
  type MaidrData,   // Root data structure (id, title, subplots)
  type MaidrLayer,  // Layer/trace definition (type, data, axes)
  type MaidrSubplot, // Subplot containing layers
  TraceType,        // Enum of supported plot types
  Orientation,      // Enum for bar/box orientation
} from 'maidr/react';
```

### `MaidrData`

The root data structure passed to the `data` prop.

```typescript
interface MaidrData {
  id: string;              // Unique identifier (used for DOM IDs)
  title?: string;          // Chart title
  subtitle?: string;       // Chart subtitle
  caption?: string;        // Chart caption
  subplots: MaidrSubplot[][]; // 2D grid of subplots
}
```

### `MaidrSubplot`

A subplot contains one or more layers (traces) that share the same coordinate space.

```typescript
interface MaidrSubplot {
  legend?: string[];       // Legend labels
  selector?: string;       // CSS selector for the subplot element
  layers: MaidrLayer[];    // Array of trace layers
}
```

### `MaidrLayer`

A single trace/layer within a subplot. The `data` field shape varies by `type`.

```typescript
interface MaidrLayer {
  id: string;              // Unique layer identifier
  type: TraceType;         // Plot type (see TraceType enum)
  title?: string;          // Layer title
  selectors?: string | string[]; // CSS selectors for SVG highlight elements
  orientation?: Orientation;     // 'vert' or 'horz' (for bar/box plots)
  axes?: {
    x?: string;            // X-axis label
    y?: string;            // Y-axis label
    fill?: string;         // Fill/group label
    format?: {             // Axis value formatting
      x?: AxisFormat;
      y?: AxisFormat;
      fill?: AxisFormat;
    };
  };
  data: BarPoint[] | BoxPoint[] | LinePoint[][] | ScatterPoint[] | ...;
}
```

### `TraceType` Enum

```typescript
enum TraceType {
  BAR = 'bar',
  BOX = 'box',
  CANDLESTICK = 'candlestick',
  DODGED = 'dodged_bar',
  HEATMAP = 'heat',
  HISTOGRAM = 'hist',
  LINE = 'line',
  NORMALIZED = 'stacked_normalized_bar',
  SCATTER = 'point',
  SMOOTH = 'smooth',
  STACKED = 'stacked_bar',
}
```

### `Orientation` Enum

```typescript
enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}
```

## Data Examples by Plot Type

### Bar Chart

```typescript
const data: MaidrData = {
  id: 'tips-bar',
  title: 'Number of Tips by Day',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'bar',
      selectors: 'rect.bar',  // CSS selector for SVG bar elements
      axes: { x: 'Day', y: 'Count' },
      data: [
        { x: 'Mon', y: 20 },
        { x: 'Tue', y: 35 },
        { x: 'Wed', y: 28 },
      ],
    }],
  }]],
};
```

### Line Chart

Line chart data is a 2D array — each inner array is one line series:

```typescript
const data: MaidrData = {
  id: 'temperature-line',
  title: 'Monthly Temperature',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'line',
      axes: { x: 'Month', y: 'Temperature (F)' },
      data: [[
        { x: 1, y: 32, fill: '2023' },
        { x: 2, y: 35, fill: '2023' },
        { x: 3, y: 45, fill: '2023' },
      ]],
    }],
  }]],
};
```

### Scatter Plot

```typescript
const data: MaidrData = {
  id: 'height-weight',
  title: 'Height vs Weight',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'point',
      axes: { x: 'Height (in)', y: 'Weight (lbs)' },
      data: [
        { x: 65, y: 150 },
        { x: 70, y: 175 },
        { x: 62, y: 130 },
      ],
    }],
  }]],
};
```

## SVG Element Highlighting

MAIDR can visually highlight the current data point in your SVG as the user navigates. To enable this, set the `selectors` property in your layer configuration to a CSS selector that matches the SVG elements corresponding to your data points:

```tsx
const data: MaidrData = {
  id: 'bar',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'bar',
      selectors: 'rect.bar',  // Matches <rect class="bar"> elements
      axes: { x: 'Category', y: 'Value' },
      data: [
        { x: 'A', y: 10 },
        { x: 'B', y: 20 },
      ],
    }],
  }]],
};

function MyChart() {
  return (
    <Maidr data={data}>
      <svg viewBox="0 0 200 100">
        <rect className="bar" x="20" y="50" width="60" height="50" fill="#87ceeb" />
        <rect className="bar" x="120" y="0" width="60" height="100" fill="#87ceeb" />
      </svg>
    </Maidr>
  );
}
```

The order of SVG elements matched by the selector must correspond to the order of items in the `data` array.

## Multiple Instances

Each `<Maidr>` component creates its own isolated state. You can render multiple charts on the same page without conflicts:

```tsx
function Dashboard() {
  return (
    <div>
      <Maidr data={barChartData}>
        <BarChartSvg />
      </Maidr>
      <Maidr data={lineChartData}>
        <LineChartSvg />
      </Maidr>
    </div>
  );
}
```

## Axis Value Formatting

You can format how axis values are displayed in text descriptions:

```typescript
const data: MaidrData = {
  id: 'revenue',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'bar',
      axes: {
        x: 'Month',
        y: 'Revenue',
        format: {
          y: { type: 'currency', decimals: 2, currency: 'USD' },
        },
      },
      data: [
        { x: 'Jan', y: 15000 },
        { x: 'Feb', y: 22000 },
      ],
    }],
  }]],
};
```

Supported format types: `currency`, `percent`, `fixed`, `number`, `date`, `scientific`.

You can also provide a custom formatting function as a string:

```typescript
format: {
  x: {
    function: "const days = {Mon: 'Monday', Tue: 'Tuesday'}; return days[value] || value"
  }
}
```

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

## Vanilla JS vs React

MAIDR supports two usage modes:

| Feature | Vanilla JS (CDN) | React Component |
|---------|-----------------|-----------------|
| Import | `<script src="maidr.js">` | `import { Maidr } from 'maidr/react'` |
| Data | `var maidr = {...}` global | `data` prop on `<Maidr>` |
| SVG | HTML `maidr-data` attribute | `children` of `<Maidr>` |
| Multiple charts | Array of maidr objects | Multiple `<Maidr>` components |
| TypeScript | No type safety | Full type safety with `MaidrData` |
| State isolation | Shared global state | Per-instance isolated state |

## API Documentation

For complete TypeScript API reference, see the [API Documentation](api/index.html).
