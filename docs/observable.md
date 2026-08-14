# Observable Plot & Quarto Integration

MAIDR provides an adapter for [Observable Plot](https://observablehq.com/plot) — the grammar-of-graphics library built on D3 — that turns its charts into accessible, navigable visualizations with audio sonification, text descriptions, braille output, and keyboard navigation.

It is also how MAIDR reaches **[Quarto](https://quarto.org) documents**. Quarto renders `{ojs}` cells with the Observable runtime, which ships Plot and draws the chart in the browser. Nothing in an `{ojs}` cell can call an adapter — the cell's value *is* the chart — so this adapter watches the page instead: add two script tags to the document header and every Plot chart in it becomes navigable, including cells that redraw when a reader moves a slider.

## Quarto Quick Start

Add the scripts to your document's header. Nothing else changes.

```yaml
---
title: "Palmer Penguins"
format:
  html:
    include-in-header:
      - text: |
          <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/maidr/dist/observable.js"></script>
---
```

````markdown
```{ojs}
data = FileAttachment("penguins.csv").csv({ typed: true })
```

```{ojs}
Plot.plot({
  title: "Body mass by species",
  marks: [Plot.barY(data, Plot.groupX({ y: "mean" }, { x: "species", y: "body_mass_g" }))]
})
```
````

Render the document and Tab to the chart. Arrow keys move between bars, `S` toggles sonification, `B` toggles braille, `T` toggles text descriptions.

To apply it to a whole project, put the same `include-in-header` block under `format: html:` in `_quarto.yml`.

### Reactive cells

An `{ojs}` cell that depends on a `viewof` input re-runs whenever the reader changes it, and the runtime replaces the chart node each time. The adapter watches for that and binds the replacement, so a chart driven by a slider stays navigable after every change — nothing to wire up.

````markdown
```{ojs}
viewof year = Inputs.range([2000, 2024], { step: 1, label: "Year" })
```

```{ojs}
Plot.plot({ marks: [Plot.barY(data.filter(d => d.year === year), { x: "region", y: "sales" })] })
```
````

### Quarto extension

If you would rather not paste the header block into every project, install the extension:

```bash
quarto add xability/maidr
```

Then add the filter to your document or `_quarto.yml`:

```yaml
filters:
  - maidr
```

The filter injects the same two scripts. `maidr-version` pins which release to load, and `maidr-base-url` points at your own copies instead of the CDN:

```yaml
filters:
  - maidr
maidr-version: "4.2.0"
```

## Plain HTML Quick Start

Outside Quarto the adapter behaves the same way — it binds any Plot chart that appears on the page.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Observable Plot chart</title>
    <!-- 1. MAIDR core, then the Observable Plot adapter -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/observable.js"></script>
  </head>
  <body>
    <div id="chart"></div>

    <script type="module">
      import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot/+esm';

      const data = [
        { day: 'Mon', count: 120 },
        { day: 'Tue', count: 240 },
        { day: 'Wed', count: 180 },
      ];

      document.querySelector('#chart').append(Plot.plot({
        title: 'Daily visitors',
        x: { label: 'Day' },
        y: { label: 'Visitors' },
        marks: [Plot.barY(data, { x: 'day', y: 'count' })],
      }));
      // The adapter binds the chart as soon as it is inserted.
    </script>
  </body>
</html>
```

## How it works

The adapter reads the chart that was drawn. Plot labels every mark it renders — a bar mark becomes `<g aria-label="bar">`, a scatter becomes `<g aria-label="dot">` — and hangs its scales off the element it returns. Running an element's geometry back through the matching scale recovers the datum it was drawn for, exactly: a bar drawn for `3.14159` is announced as `3.14159`, not as `3.141589999999809`.

That is why the adapter needs no configuration and works on charts written before MAIDR was in the picture, including ones you did not author.

## What it reads

| Plot mark | MAIDR trace | Notes |
|-----------|-------------|-------|
| `barY` / `barX` | Bar | Orientation comes from which axis is categorical |
| `barY` / `barX` with `fill` | Stacked bar | One series per fill colour, with a legend |
| `rectY` / `rectX` with `binX` / `binY` | Histogram | Bin edges are reconstructed exactly |
| `rectY` / `rectX` with `binX` and a `fill` | Stacked bar | A stacked histogram, read over its bins |
| `rectY` / `rectX` on a categorical axis | Bar | |
| `dot` on two continuous axes | Scatter | |
| `dot` on a categorical axis | Dot plot | Navigated as a bar chart |
| `line` | Line | One series per drawn path |
| `area` / `areaY` | Area | |
| any of the above with `fx` / `fy` | Subplots | One MAIDR panel per facet, named after it |

Titles, subtitles, captions, and axis labels are taken from what Plot rendered. The directional arrows Plot draws into an axis label (`↑ Count`) are stripped.

A **date axis** works: values travel as epoch milliseconds — every trace's point type is numeric, because the value has to drive sonification and the min/max range — and the layer declares `format: { type: 'date' }`, which is what turns them back into dates in the announcement.

## What it does not read

- **`cell` marks (heatmaps).** A cell keeps its magnitude in an 8-bit fill colour, so several distinct values render as the same colour and no inversion can tell them apart. Announcing an approximation to a reader who cannot check it against the picture is worse than announcing nothing, so these marks are skipped.
- **Composite marks** such as `boxY` and `boxX`, which Plot draws as three separate marks (`rule`, `bar`, `tick`).
- **Lines drawn with a non-interpolating curve** — `curveBasis`, `curveBundle` — whose path passes through control points that are not data points. The adapter detects this and skips the mark rather than announcing the control polygon. Interpolating curves (`curveLinear`, the default, and `curveCatmullRom`, `curveMonotoneX`, `curveNatural`, `curveStep`) are read normally.

A chart whose marks are all unread is left alone; other charts on the page are unaffected.

## Precision

A bar, a dot, and a rect are positioned by attributes the adapter reads directly, so inverting them recovers the datum exactly: a bar drawn for `3.14159` is announced as `3.14159`, not as `3.141589999999809`.

A **line or area** is different. Its vertices come back out of the path's `d` attribute, where the serializer has already rounded each coordinate, so the value is only good to the quantum that rounding left. The adapter rounds to that precision and no finer — on an ordinary chart the quantum is worth far less than the last decimal of the data and the value comes back exact, but a line spanning tens of thousands of units will be announced to the nearest hundredth or so. Reporting the inverted figure in full would present a rounded pixel as an exact measurement.

Three more things worth knowing:

- **Draw order is data order.** Plot draws marks in the order the data arrived, which is not the visual order when a mark is given `sort`. Navigation follows that same order, so the highlight always matches what was announced, but on a sorted chart the arrow keys will not sweep strictly left to right.
- **A chart the adapter cannot read faithfully is left unbound.** When Plot's `scale` function is missing — a chart revived from saved HTML rather than drawn on the page — the scales are fitted from the rendered axis ticks. That fit describes a linear axis, so a log axis is refused rather than approximated, and a quantitative axis whose labels cannot be read back is refused too. No announcement beats a confident wrong one.
- **Plot 0.6.3 or later.** The adapter reads the separate axis groups Plot has emitted since 0.6.3. Quarto currently bundles Plot 0.6.11.

## Manual binding

Auto-binding covers the Quarto case and most others. When you want the schema instead — to edit it, or to hand it to the `<Maidr>` React component — call the adapter yourself.

```js
import { bindObservablePlot, observablePlotToMaidr } from 'maidr/observable';

const chart = Plot.plot({ marks: [Plot.barY(data, { x: 'day', y: 'count' })] });
document.body.append(chart);

// Bind it, and get the schema back.
const { maidr } = bindObservablePlot(chart, {
  title: 'Daily visitors',
  axes: { x: 'Day', y: 'Visitors' },
});

// Or build the schema without touching the DOM.
const schema = observablePlotToMaidr(chart, { autoApply: false });
```

Script-tag users get the same functions on `window.maidrObservable`.

### Options

| Option | Type | Description |
|--------|------|-------------|
| `id` | `string` | Figure id. Generated when omitted. |
| `title` / `subtitle` / `caption` | `string` | Override what Plot rendered. |
| `axes` | `{ x?, y?, z? }` | Override the drawn axis labels. |
| `markTypes` | `Record<string, string>` | Force a mark's trace type, keyed by its Plot `aria-label`. |
| `autoApply` | `boolean` | `false` returns the schema without writing it to the DOM. |

### Turning auto-binding off

Set the flag before the bundle loads, then drive it yourself:

```html
<script>window.maidrObservableAutoInit = false;</script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/observable.js"></script>
<script>
  // Watch only part of the page, or bind charts one at a time.
  maidrObservable.initQuartoObservable({ root: document.querySelector('#report') });
</script>
```

`initQuartoObservable` returns a function that stops the watcher.

## Keyboard Controls

Once a chart is focused, use standard MAIDR keyboard shortcuts:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between data points | Arrow keys | Arrow keys |
| Move between panels (facets) | Page Up / Page Down | Page Up / Page Down |
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
