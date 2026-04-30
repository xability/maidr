# Vega-Lite Integration

MAIDR provides an adapter for [Vega-Lite](https://vega.github.io/vega-lite/) that converts your charts into accessible, navigable visualizations with audio sonification, text descriptions, and braille output.

## Quick Start

Load Vega, Vega-Lite, vega-embed, MAIDR core, and the Vega-Lite adapter, then call `maidrVegaLite.embed()` with your spec — it runs `vegaEmbed` internally and attaches MAIDR once the chart has rendered:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Vega-Lite Chart</title>
    <!-- 1. Load Vega-Lite and its dependencies -->
    <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
    <!-- 2. Load MAIDR core and the Vega-Lite adapter -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/vegalite.js"></script>
  </head>
  <body>
    <div id="chart" aria-label="Bar chart loading" style="min-height: 400px"></div>

    <script>
      const spec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 600,
        height: 400,
        title: 'Number of Tips by Day',
        data: {
          values: [
            { day: 'Sat', count: 87 },
            { day: 'Sun', count: 76 },
            { day: 'Thu', count: 62 },
            { day: 'Fri', count: 19 },
          ],
        },
        mark: 'bar',
        encoding: {
          x: { field: 'day', type: 'nominal', title: 'Day' },
          y: { field: 'count', type: 'quantitative', title: 'Count' },
        },
      };

      // 3. Render + bind MAIDR in a single call.
      maidrVegaLite.embed('#chart', spec, { id: 'tips-bar' });
    </script>
  </body>
</html>
```

`embed()` returns a `Promise<{ view }>` — `await` it (or use `.then()` / `.catch()`) when you need the underlying Vega view or want to handle render failures.

If you already drive `vegaEmbed` yourself (e.g. you need the `view` for additional logic before MAIDR mounts), use [`bindVegaLite`](#bindvegalite-view-spec-options) instead. **You must `await result.view.runAsync()`** between embedding and binding so the SVG is in the DOM by the time MAIDR mounts:

```js
// renderer must be 'svg' — MAIDR navigates the SVG output, not canvas.
const result = await vegaEmbed('#chart', spec, { renderer: 'svg', actions: false });

// vegaEmbed() resolves when the view is *constructed*, not when it has *rendered*.
// runAsync() resolves only after the first paint — guarantees the SVG exists.
await result.view.runAsync();

maidrVegaLite.bindVegaLite(result.view, spec, { id: 'tips-bar' });
```

Once the page loads, click on the chart (or Tab to it) and MAIDR activates with:

- **Audio sonification** — tones representing data values
- **Text descriptions** — spoken via screen readers
- **Braille output** — refreshable braille display support
- **Keyboard navigation** — arrow keys to move between data points

## How It Works

The Vega-Lite adapter:

1. **Inspects the spec** — reads the `mark`, `encoding`, and any composite blocks (`layer`, `hconcat`, `vconcat`, `concat`).
2. **Resolves the data** — queries the compiled Vega `View` for runtime datasets (so transforms such as `bin` and `aggregate` are honoured), and falls back to inline `data.values` when the view isn't available.
3. **Maps the mark to a MAIDR trace type** — see the table below.
4. **Builds CSS selectors** for visual highlighting against the SVG that Vega renders inside the embed container.
5. **Mounts the MAIDR UI** on the rendered SVG.

Because Vega-Lite renders **asynchronously** through `vegaEmbed()`, the adapter must be called from inside the `vegaEmbed(...).then(...)` callback (or after `await vegaEmbed(...)`), once the SVG and the compiled view are both available.

## Supported Chart Types

| Vega-Lite mark | Encoding hint | MAIDR trace type | Example |
|---|---|---|---|
| `bar` | (default) | Bar | [vegalite-bindbar.html](https://github.com/xability/maidr/blob/main/examples/vegalite-bindbar.html) |
| `bar` | `bin: true` on x or y | Histogram | [vegalite-bindhistogram.html](https://github.com/xability/maidr/blob/main/examples/vegalite-bindhistogram.html) |
| `bar` | `color`/`fill` field, default stack | Stacked bar | [vegalite-bindstacked.html](https://github.com/xability/maidr/blob/main/examples/vegalite-bindstacked.html) |
| `bar` | `color`/`fill`, `stack: null` or `false` | Dodged (grouped) bar | [vegalite-binddodged.html](https://github.com/xability/maidr/blob/main/examples/vegalite-binddodged.html) |
| `bar` | `color`/`fill`, `stack: 'normalize'` | Normalized stacked bar | [vegalite-bindnormalized.html](https://github.com/xability/maidr/blob/main/examples/vegalite-bindnormalized.html) |
| `line`, `area` | — | Line | [vegalite-bindline.html](https://github.com/xability/maidr/blob/main/examples/vegalite-bindline.html) |
| `point`, `circle`, `square`, `tick` | — | Scatter | [vegalite-bindscatter.html](https://github.com/xability/maidr/blob/main/examples/vegalite-bindscatter.html) |
| `rect` | — | Heatmap | [vegalite-bindheatmap.html](https://github.com/xability/maidr/blob/main/examples/vegalite-bindheatmap.html) |
| `boxplot` | — | Box plot (vertical & horizontal) | [vegalite-bindbox.html](https://github.com/xability/maidr/blob/main/examples/vegalite-bindbox.html) |

## Code Examples

### Bar chart

```js
const spec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  width: 600,
  height: 400,
  title: 'Number of Tips by Day',
  data: {
    values: [
      { day: 'Sat', count: 87 },
      { day: 'Sun', count: 76 },
      { day: 'Thu', count: 62 },
      { day: 'Fri', count: 19 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'day', type: 'nominal', title: 'Day' },
    y: { field: 'count', type: 'quantitative', title: 'Count' },
  },
};

maidrVegaLite.embed('#chart', spec, { id: 'tips-bar' });
```

See [`examples/vegalite-bindbar.html`](https://github.com/xability/maidr/blob/main/examples/vegalite-bindbar.html) for a runnable version.

### Stacked bar chart

```js
const spec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  width: 600,
  height: 400,
  title: 'Passengers by Class and Survival',
  data: {
    values: [
      { class: 'First',  survived: 'No',  count: 80 },
      { class: 'First',  survived: 'Yes', count: 136 },
      { class: 'Second', survived: 'No',  count: 97 },
      { class: 'Second', survived: 'Yes', count: 87 },
      { class: 'Third',  survived: 'No',  count: 372 },
      { class: 'Third',  survived: 'Yes', count: 119 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'class', type: 'nominal', title: 'Class' },
    y: { field: 'count', type: 'quantitative', title: 'Passengers' },
    color: { field: 'survived', type: 'nominal', title: 'Survived' },
  },
};
```

See [`examples/vegalite-bindstacked.html`](https://github.com/xability/maidr/blob/main/examples/vegalite-bindstacked.html) for a runnable version.

### Dodged (grouped) bar chart

Set `stack: null` (or `false`) on the quantitative axis to switch from stacked to dodged.

```js
const spec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  width: 600,
  height: 400,
  title: 'City Populations (thousands)',
  data: {
    values: [
      { city: 'NYC', year: '2020', pop: 8336 },
      { city: 'NYC', year: '2025', pop: 8258 },
      { city: 'LA',  year: '2020', pop: 3979 },
      { city: 'LA',  year: '2025', pop: 3898 },
      { city: 'CHI', year: '2020', pop: 2693 },
      { city: 'CHI', year: '2025', pop: 2665 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'city', type: 'nominal', title: 'City' },
    y: { field: 'pop',  type: 'quantitative', stack: null, title: 'Population' },
    color: { field: 'year', type: 'nominal', title: 'Year' },
  },
};
```

See [`examples/vegalite-binddodged.html`](https://github.com/xability/maidr/blob/main/examples/vegalite-binddodged.html) for a runnable version.

### Normalized (100%) stacked bar chart

```js
const spec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  width: 600,
  height: 400,
  title: 'Survival Share by Class',
  data: {
    values: [
      { class: 'First',  survived: 'No',  count: 80 },
      { class: 'First',  survived: 'Yes', count: 136 },
      { class: 'Second', survived: 'No',  count: 97 },
      { class: 'Second', survived: 'Yes', count: 87 },
      { class: 'Third',  survived: 'No',  count: 372 },
      { class: 'Third',  survived: 'Yes', count: 119 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'class', type: 'nominal', title: 'Class' },
    y: { field: 'count', type: 'quantitative', stack: 'normalize', title: 'Share' },
    color: { field: 'survived', type: 'nominal', title: 'Survived' },
  },
};
```

See [`examples/vegalite-bindnormalized.html`](https://github.com/xability/maidr/blob/main/examples/vegalite-bindnormalized.html) for a runnable version.

### Histogram

```js
const spec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  width: 600,
  height: 400,
  title: 'Distribution of Values',
  data: {
    values: Array.from({ length: 100 }, () => ({
      value: Math.round(Math.random() * 100),
    })),
  },
  mark: 'bar',
  encoding: {
    x: { field: 'value', type: 'quantitative', bin: true, title: 'Value' },
    y: { aggregate: 'count', title: 'Frequency' },
  },
};
```

See [`examples/vegalite-bindhistogram.html`](https://github.com/xability/maidr/blob/main/examples/vegalite-bindhistogram.html) for a runnable version.

### Line chart

```js
const spec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  width: 600,
  height: 400,
  title: 'Monthly Average Temperature',
  data: {
    values: [
      { month: 'Jan', temp: 28 }, { month: 'Feb', temp: 32 },
      { month: 'Mar', temp: 45 }, { month: 'Apr', temp: 55 },
      { month: 'May', temp: 68 }, { month: 'Jun', temp: 78 },
      { month: 'Jul', temp: 82 }, { month: 'Aug', temp: 80 },
      { month: 'Sep', temp: 72 }, { month: 'Oct', temp: 58 },
      { month: 'Nov', temp: 42 }, { month: 'Dec', temp: 30 },
    ],
  },
  mark: 'line',
  encoding: {
    x: { field: 'month', type: 'ordinal',     title: 'Month' },
    y: { field: 'temp',  type: 'quantitative', title: 'Temperature (F)' },
  },
};
```

See [`examples/vegalite-bindline.html`](https://github.com/xability/maidr/blob/main/examples/vegalite-bindline.html) for a runnable version.

### Scatter plot

```js
const spec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  width: 600,
  height: 400,
  title: 'Horsepower vs. Miles per Gallon',
  data: {
    values: [
      { hp: 130, mpg: 18 }, { hp: 165, mpg: 15 }, { hp: 150, mpg: 18 },
      { hp: 150, mpg: 16 }, { hp: 140, mpg: 17 }, { hp: 198, mpg: 15 },
      { hp: 220, mpg: 14 }, { hp: 215, mpg: 14 }, { hp: 225, mpg: 14 },
      { hp: 190, mpg: 15 }, { hp:  97, mpg: 24 }, { hp:  88, mpg: 22 },
      { hp:  70, mpg: 18 }, { hp:  76, mpg: 21 }, { hp:  86, mpg: 27 },
    ],
  },
  mark: 'point',
  encoding: {
    x: { field: 'hp',  type: 'quantitative', title: 'Horsepower' },
    y: { field: 'mpg', type: 'quantitative', title: 'Miles per Gallon' },
  },
};
```

See [`examples/vegalite-bindscatter.html`](https://github.com/xability/maidr/blob/main/examples/vegalite-bindscatter.html) for a runnable version.

### Heatmap

```js
const spec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  width: 600,
  height: 400,
  title: 'Weekly Activity Heatmap',
  data: {
    values: [
      { day: 'Mon', hour: 'Morning',   value: 5 },
      { day: 'Mon', hour: 'Afternoon', value: 8 },
      { day: 'Mon', hour: 'Evening',   value: 3 },
      { day: 'Tue', hour: 'Morning',   value: 7 },
      { day: 'Tue', hour: 'Afternoon', value: 6 },
      { day: 'Tue', hour: 'Evening',   value: 4 },
      { day: 'Wed', hour: 'Morning',   value: 9 },
      { day: 'Wed', hour: 'Afternoon', value: 5 },
      { day: 'Wed', hour: 'Evening',   value: 7 },
    ],
  },
  mark: 'rect',
  encoding: {
    x: { field: 'day',   type: 'ordinal', title: 'Day' },
    y: { field: 'hour',  type: 'ordinal', title: 'Time of Day' },
    color: { field: 'value', type: 'quantitative', title: 'Activity Level' },
  },
};
```

See [`examples/vegalite-bindheatmap.html`](https://github.com/xability/maidr/blob/main/examples/vegalite-bindheatmap.html) for a runnable version.

### Box plot

Vega-Lite's `boxplot` is a compound mark — it computes the five-number summary (min, Q1, median, Q3, max) plus outliers internally from raw rows. MAIDR reads that summary back from the rendered SVG so you can navigate each box and its outliers with arrow keys.

```js
const spec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  width: 600,
  height: 400,
  title: 'Score Distribution by Group',
  data: {
    values: [
      // Group A: tight bulk 60–80 + 2 lower & 2 upper outliers
      ...Array.from({ length: 28 }, () => ({
        group: 'A',
        score: 60 + Math.round(Math.random() * 20),
      })),
      { group: 'A', score: 30 },
      { group: 'A', score: 35 },
      { group: 'A', score: 95 },
      { group: 'A', score: 98 },
      // Group B: tight bulk 65–75 + 1 lower & 2 upper outliers
      ...Array.from({ length: 28 }, () => ({
        group: 'B',
        score: 65 + Math.round(Math.random() * 10),
      })),
      { group: 'B', score: 40 },
      { group: 'B', score: 92 },
      { group: 'B', score: 96 },
      // Group C: bulk 50–70 + 2 lower & 1 upper outlier
      ...Array.from({ length: 28 }, () => ({
        group: 'C',
        score: 50 + Math.round(Math.random() * 20),
      })),
      { group: 'C', score: 20 },
      { group: 'C', score: 25 },
      { group: 'C', score: 100 },
    ],
  },
  mark: 'boxplot',
  encoding: {
    x: { field: 'group', type: 'nominal',      title: 'Group' },
    y: { field: 'score', type: 'quantitative', title: 'Score' },
  },
};
```

Both **vertical** (categorical x, quantitative y) and **horizontal** (categorical y, quantitative x) box plots are supported. See [`examples/vegalite-bindbox.html`](https://github.com/xability/maidr/blob/main/examples/vegalite-bindbox.html) for a runnable version.

## API Reference

### `embed(target, spec, options?)`

Renders the Vega-Lite spec **and** mounts MAIDR in a single call. This is the recommended entry point for most integrations — it wraps `vegaEmbed()` and `bindVegaLite()` together and handles the asynchronous render internally.

| Argument | Type | Description |
|---|---|---|
| `target` | `string \| HTMLElement` | A CSS selector or HTMLElement that hosts the chart. |
| `spec` | `VegaLiteSpec` | The Vega-Lite specification. |
| `options.id` | `string` (optional) | Unique ID for the MAIDR instance. |
| `options.title` | `string` (optional) | Override for the chart title used in announcements. |
| `options.embedOptions` | `EmbedOptions` (optional) | Forwarded to `vegaEmbed`. Default: `{ actions: false }`. |

Returns a `Promise<{ view: vega.View }>` so callers can `await` the underlying Vega view or chain `.catch()` to handle render failures.

```js
maidrVegaLite.embed('#chart', spec, { id: 'tips-bar' })
  .then(({ view }) => console.log('Chart ready', view))
  .catch((err) => console.error(err));
```

Requires the global `vegaEmbed` function (from the `vega-embed` script) to be loaded on the page. If `vegaEmbed` is not available, `embed()` throws a clear error.

### `bindVegaLite(view, spec, options?)`

Lower-level entry point that mounts MAIDR on the SVG produced by an existing `vegaEmbed()` call. Use this when you need full control over the embed lifecycle (custom `vegaEmbed` options, post-processing, etc.).

| Argument | Type | Description |
|---|---|---|
| `view` | `vega.View` | The compiled Vega view returned by `vegaEmbed(...).view`. |
| `spec` | `VegaLiteSpec` | The original Vega-Lite specification. |
| `options.id` | `string` (optional) | Unique ID for the MAIDR instance. Defaults to the view container's `id`, or a timestamp fallback. |
| `options.title` | `string` (optional) | Override for the chart title used in announcements. |

**Callers must `await view.runAsync()` before calling `bindVegaLite()`.** `vegaEmbed(...)` resolves when the view is *constructed*, not when it has *rendered* — calling `bindVegaLite()` immediately after `vegaEmbed()` resolves can race the first paint and produce a "No SVG found" error on slow or aggregated specs (histograms, complex transforms). The view must also be created with `renderer: 'svg'`; MAIDR cannot navigate canvas output. **Prefer [`embed()`](#embed-target-spec-options)** which performs both steps for you.

### `vegaLiteToMaidr(spec, view?, options?)`

Lower-level converter that returns a MAIDR schema object without mounting the UI. Useful when you want to set the `maidr` attribute manually or post-process the schema.

```ts
import { vegaLiteToMaidr } from 'maidr/vegalite';

const maidr = vegaLiteToMaidr(spec, view, { id: 'my-chart' });
container.setAttribute('maidr', JSON.stringify(maidr));
```

## Using with npm / bundlers

```ts
import { embed } from 'maidr/vegalite';

await embed('#chart', spec, { id: 'my-chart' });
```

Or, for fine-grained control:

```ts
import { bindVegaLite } from 'maidr/vegalite';
import vegaEmbed from 'vega-embed';

const result = await vegaEmbed('#chart', spec, { renderer: 'svg' });
await result.view.runAsync(); // wait for the first paint
bindVegaLite(result.view, spec, { id: 'my-chart' });
```

The package exposes both ES (`vegalite.mjs`) and UMD (`vegalite.js`) builds plus TypeScript declarations.


## Keyboard Controls

Once a chart is focused, use standard MAIDR keyboard shortcuts:

| Function | Key (Windows) | Key (Mac) |
|---|---|---|
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
