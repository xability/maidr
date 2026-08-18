# Observable Plot & Quarto Integration

MAIDR provides an adapter for [Observable Plot](https://observablehq.com/plot) — the grammar-of-graphics library built on D3 — that turns its charts into accessible, navigable visualizations with audio sonification, text descriptions, braille output, and keyboard navigation.

There are two ways it gets used, and they differ only in how the scripts get onto the page:

| | You are writing | Load the scripts by | Your chart code changes |
|---|---|---|---|
| **[Plain page](#plain-page-quick-start)** | HTML, or an app that renders Plot charts | putting two `<script>` tags in `<head>` | not at all |
| **[Quarto](#quarto-quick-start)** | a `.qmd` with `{ojs}` cells | `include-in-header`, or `quarto add xability/maidr` | not at all |
| **[Framework](#observable-framework)** | a Framework project | `head` in `observablehq.config.js` | not at all |
| **[Embedded notebook](#embedded-notebooks)** | a page running `@observablehq/runtime` | two `<script>` tags on the host page | not at all |

The adapter itself does not know which one it is in. It watches the page for Plot charts and binds each one as it appears — that is the whole mechanism, and it is why neither case asks you to touch the code that draws the chart.

Quarto gets its own section because it is the case that *cannot* work any other way: an `{ojs}` cell's value **is** the chart, so there is nowhere in the cell to call a binder even if you wanted to. On a plain page you have the choice, and [Manual binding](#manual-binding) covers taking it.

## Plain page quick start

Two script tags. Draw charts however you already do.

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
      // Nothing else to do: the adapter binds the chart as it is inserted.
    </script>
  </body>
</html>
```

Tab to the chart. Arrow keys move between bars, `S` toggles sonification, `B` toggles braille, `T` toggles text descriptions.

A chart appended later — after a `fetch`, on a click, on every frame of a slider drag — is bound as it appears, and one the page throws away is released. So a dashboard that redraws does not accumulate charts, and you do not re-bind anything by hand.

If you install from npm rather than a CDN, `maidr/observable` is the entry point:

```js
import 'maidr';
import 'maidr/observable';
```

## Quarto quick start

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

Render the document and Tab to the chart — the same keys as above.

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

## Observable's own runtimes

The two quick starts cover a page you control. Observable ships two other ways
to run Plot, and the adapter works in both — the mechanism is the same, so the
only question in each is where the two script tags go.

### Observable Framework

Put the bundles in your source root and name them in `head`. Framework rewrites
the paths and content-hashes the files for you, so `/maidr.js` resolves to
whatever it emitted:

```js
// observablehq.config.js
export default {
  root: 'src',
  head: '<script src="/maidr.js"></script><script src="/observable.js"></script>',
};
```

Charts in `display(Plot.plot(...))` cells bind as they render, and a cell driven
by `view(Inputs.range(...))` rebinds each time the reader moves the input.

### Embedded notebooks

A notebook embedded with `@observablehq/runtime` and `@observablehq/inspector`
works the same way: load the two bundles on the host page and every cell whose
value is a Plot chart becomes navigable, including cells the runtime re-runs
when you `redefine` a value.

**Verified against** Framework 1.13.4, runtime 5.9.9 and inspector 5.0.1 — the
charts bind, the reactive re-runs rebind, and the chart each re-run discards is
released rather than accumulated.

**Not verified:** a notebook on observablehq.com itself. The adapter needs its
two scripts on the page, and on a notebook hosted there you do not control the
page's head. Whether a cell can inject them into its own document is untested —
so it is an open question rather than a documented route.

## How it works

The adapter reads the chart that was drawn. Plot labels every mark it renders — a bar mark becomes `<g aria-label="bar">`, a scatter becomes `<g aria-label="dot">` — and hangs its scales off the element it returns. Running an element's geometry back through the matching scale recovers the datum it was drawn for, exactly: a bar drawn for `3.14159` is announced as `3.14159`, not as `3.141589999999809`.

That is why the adapter needs no configuration and works on charts written before MAIDR was in the picture, including ones you did not author.

## What it reads

| Plot mark | MAIDR trace | Notes |
|-----------|-------------|-------|
| `barY` / `barX` | Bar | Orientation comes from which axis is categorical |
| `barY` / `barX` with `fill` | Stacked bar | One series per fill colour, with a legend |
| the same under `stackY({offset: 'normalize'})` | 100% stacked bar | Announced as percentages |
| `rectY` / `rectX` with `binX` / `binY` | Histogram | Bin edges are reconstructed exactly |
| `rectY` / `rectX` with `binX` and a `fill` | Stacked bar | A stacked histogram, read over its bins |
| `rectY` / `rectX` on a categorical axis | Bar | |
| `dot` on two continuous axes | Scatter | |
| `dot` on a categorical axis | Dot plot | Navigated as a bar chart |
| `tickX` / `tickY` on a categorical axis | Strip plot | Read as a dot plot: one point per observation, so a category with several ticks keeps all of them |
| `line` | Line | One series per drawn path |
| `area` / `areaY` | Area | |
| `areaY` under `stackY({offset: 'normalize'})` | 100% stacked area | Announced as percentages |
| `linearRegressionY` / `linearRegressionX` | Smooth | The fitted line; see below |
| any of the above with `fx` / `fy` | Subplots | One MAIDR panel per facet, named after it |

Titles, subtitles, captions, and axis labels are taken from what Plot rendered. The directional arrows Plot draws into an axis label (`↑ Count`) are stripped.

## Regression lines

`Plot.linearRegressionY` and `Plot.linearRegressionX` are read as smooth curves. This is the one mark Plot names after what it *means* rather than after what it draws — its group is `aria-label="linear-regression"`, which nothing else produces — so it needs neither a heuristic nor an option, unlike the box marks below.

The group holds two paths per series: the confidence band, drawn with `stroke="none"`, and the fitted line, drawn with `fill="none"`. They are told apart by that rather than by their order. A mark split by `stroke` gives one fit per series, each named from the colour scale.

The fitted line has exactly two vertices, its ends, and both are read along with the pixels they were drawn at. That is not a loss: a straight line is completely described by its ends, and what a reader gets is where the trend starts, where it finishes, and the slope between.

**The confidence band is not read.** `SmoothPoint` carries `x`, `y`, `svg_x` and `svg_y` and no bounds, and the smooth trace announces none, so an interval has nowhere to go on a smooth layer. Giving it one would serve r-maidr's `geom_smooth(se = TRUE)` and py-maidr's plotly trendline as much as this mark, and is a decision about the grammar rather than about Plot.

## 100% stacked charts

`Plot.stackY({ offset: 'normalize' })` divides before it draws, so a chart drawn with it is read as `stacked_normalized_bar` — or `stacked_normalized_area` for an area — rather than as an ordinary stack. Its values are announced as **percentages**, which is what every 100% chart MAIDR reads announces, and the reader is told the columns are parts of a whole.

What decides it is that **every column adds up to one**, not the shape of the y scale. A domain of exactly `[0, 1]` is the obvious signal and is the wrong one: widening the axis for headroom — `y: { domain: [0, 1.2] }` — draws a 100% chart whose domain is not `[0, 1]` and whose columns no longer span the frame, and a scale test misses it. Summing the columns catches that chart and needs no second signal.

The same test does not separate Plot's own normalization from an author who divided their numbers before drawing, and there is nothing there to separate: both are charts of shares. Values already written as `0.3` and `0.7` are announced as 30 and 70, the same as Plot's own.

## Step curves

A line drawn with `curve: 'step-after'`, `'step-before'` or `'step'` is a **step chart**: navigated by transition rather than by sample, described in runs, and announced as a step plot. Which convention drew it is read off the path rather than declared:

| Plot curve | announced as | the riser sits |
|---|---|---|
| `step-after` | `hv` | at the next sample |
| `step-before` | `vh` | at the current sample |
| `step` | `mid` | halfway between the two |

A staircase passes through every sample and adds a corner between each pair, so the samples are all on the path and the corners say which convention put them there. Every corner is checked, not just counted — a path that merely happens to carry the right number of vertices is refused, because reading it as a staircase would announce transitions the chart never drew.

The centred `step` needs one thing the other two do not. Its interior samples are **not on the path** — only the midpoints between them are — so they are recovered by walking out from the first, and the last sample, which *is* drawn, checks the result. The error does not accumulate along the series: measured over 50 samples at uneven spacing, the largest departure from the true pixel was 0.002, which is the quantum the coordinates were written at.

An **area** drawn with a step curve stays an area and carries the convention, which is what its trace reads to tell a stepped band's risers from its samples. A stacked one works too: the baseline is stepped alongside the top edge, so the two stay aligned.

This is the one reading in the adapter that is *detected* rather than declared, and it is worth knowing why. Plot binds the datum indices to the path, so how many samples there should be is known — which is what lets the surplus vertices be identified as corners rather than mistaken for data. A binder that reads its data from the source rather than from the drawing has no such handle, which is why MAIDR's d3 binder asks you to declare the convention instead.

A **date axis** works: values travel as epoch milliseconds — every trace's point type is numeric, because the value has to drive sonification and the min/max range — and the layer declares `format: { type: 'date' }`, which is what turns them back into dates in the announcement.

## What it does not read

- **`cell` marks (heatmaps).** A cell keeps its magnitude in an 8-bit fill colour, so several distinct values render as the same colour and no inversion can tell them apart. Announcing an approximation to a reader who cannot check it against the picture is worse than announcing nothing, so these marks are skipped.
- **Composite marks** such as `boxY` and `boxX`, which Plot draws as three separate marks (`rule`, `bar`, `tick`) plus a `dot` for the outliers. Every number a box needs is there and readable, but nothing in the markup says the four groups are one chart — their labels and attributes are exactly a hand-drawn rule, bar and tick's — so reading them as a box would take a heuristic that fires on charts that are not one. Tracked in #1074.
- **A `tick` with no cross-channel.** `Plot.tickX(data, {x: 'v'})` draws every tick across the whole frame, which is a one-dimensional distribution with no category to announce — and a dot plot's point has a second field the chart has nothing to put in. A tick given a categorical `y` (or `x`) is read; one without is not.
- **Lines whose path does not pass through the data.** `curveBasis` and `curveBundle` draw through control points that are not data points. The adapter detects the mismatch — Plot binds the datum indices to the path, so the expected vertex count is known — and skips the mark rather than announcing the smoothing. `curveLinear` (the default), `curveCatmullRom`, `curveMonotoneX`, `curveNatural` and `curveCardinal` are read normally, and the step curves are read as **step charts** (below).
- **A stack whose rows were not aggregated.** Two rows sharing a category and a series draw two segments that the stack transform left separate; there is one cell in a stacked layer for them and two marks on screen. The layer is read as a plain bar chart instead, which announces both.

A chart whose marks are all unread is left alone; other charts on the page are unaffected.

## Precision

A bar, a dot, and a rect are positioned by attributes the adapter reads directly, so inverting them recovers the datum exactly: a bar drawn for `3.14159` is announced as `3.14159`, not as `3.141589999999809`.

A **line or area** is different. Its vertices come back out of the path's `d` attribute, where the serializer has already rounded each coordinate, so the value is only good to the quantum that rounding left. The adapter rounds to that precision and no finer — on an ordinary chart the quantum is worth far less than the last decimal of the data and the value comes back exact, but a line spanning tens of thousands of units will be announced to the nearest hundredth or so. Reporting the inverted figure in full would present a rounded pixel as an exact measurement.

**Bin edges** are reconstructed rather than measured. Plot insets a binned rect so neighbouring bars are visually separated, which puts every measured edge a pixel inside the true one, and the spacing between bars gives the bin width back exactly. A chart whose bins are not evenly spaced — author-set thresholds — cannot be reconstructed that way and keeps its measured edges, which are inset by that pixel.

Three more things worth knowing:

- **Navigation follows the axis, except where the marks overlap.** Plot draws in the order the data arrived, which `sort` makes something other than the visual order, so the adapter puts each layer in axis order and *moves the elements to match* — reordering siblings only changes paint order, and marks that tile do not paint over each other. Marks that do overlap keep draw order instead, because moving one there would change the picture; on such a chart the arrow keys will not sweep strictly left to right. The highlight always matches what was announced either way.
- **A chart the adapter cannot read faithfully is left unbound.** When Plot's `scale` function is missing — a chart revived from saved HTML rather than drawn on the page — the scales are fitted from the rendered axis ticks. That fit describes a linear axis, so a log axis is refused rather than approximated, and a quantitative axis whose labels cannot be read back is refused too. No announcement beats a confident wrong one.
- **Plot 0.6.3 or later.** The adapter reads the separate axis groups Plot has emitted since 0.6.3. Quarto currently bundles Plot 0.6.11.

## Manual binding

Auto-binding is what both quick starts rely on, and on a plain page it is optional. When you want the schema instead — to edit it, or to hand it to the `<Maidr>` React component — call the adapter yourself, and turn the watcher off first so it does not bind the chart behind you.

```js
// Before the bundle loads, if you are loading it with a script tag.
window.maidrObservableAutoInit = false;
```

```js
import { bindObservablePlot, observablePlotToMaidr } from 'maidr/observable';

const chart = Plot.plot({ marks: [Plot.barY(data, { x: 'day', y: 'count' })] });
document.body.append(chart);

// Bind it, and get the schema back.
const { maidr } = bindObservablePlot(chart, {
  title: 'Daily visitors',
  axes: { x: 'Day', y: 'Visitors' },
});

// Or get the schema without handing it to the runtime.
const { maidr: schema } = bindObservablePlot(chart, { autoApply: false });
```

Both of them read the chart in place and write to it: the selectors they generate point at an id and at attributes the adapter stamps on the marks, so the chart has to be in the document and will not come back untouched. What `autoApply: false` skips is the last step — writing `maidr-data` and telling the runtime — not the stamping. `observablePlotToMaidr` is the conversion on its own and never takes that step, so it ignores the option entirely.

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
  maidrObservable.initObservablePlots({ root: document.querySelector('#report') });
</script>
```

`initObservablePlots` returns a function that stops the watcher.

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
