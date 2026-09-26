# uPlot Integration

MAIDR provides an adapter for [uPlot](https://github.com/leeoniya/uPlot), the small, fast canvas charting library for time series. uPlot is the engine that draws Grafana's time-series panels, so it is where much of the world's monitoring data is looked at. The adapter reads a live uPlot chart into MAIDR and makes it navigable by keyboard, with audio sonification, text descriptions and braille output, and it keeps that reading in step as the chart streams new data.

## Quick Start

Load uPlot and the MAIDR uPlot bundle, then add `maidrUPlot.maidrPlugin()` to the chart's `plugins`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My uPlot Chart</title>
    <!-- 1. Load uPlot and its stylesheet -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/uplot@1.6.32/dist/uPlot.min.css" />
    <script src="https://cdn.jsdelivr.net/npm/uplot@1.6.32/dist/uPlot.iife.min.js"></script>
    <!-- 2. Load MAIDR's uPlot adapter (exposes the `maidrUPlot` global) -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/uplot.js"></script>
  </head>
  <body>
    <div id="chart"></div>

    <script>
      // One reading every 5 minutes, in uPlot's default time unit (seconds).
      const start = Date.UTC(2026, 0, 12, 9, 0) / 1000;
      const times = [];
      const cpu = [];
      for (let i = 0; i < 24; i++) {
        times.push(start + i * 300);
        cpu.push(Math.round(35 + 25 * Math.sin(i / 3)));
      }

      // 3. Create the chart as usual, with the MAIDR plugin.
      new uPlot({
        title: 'Web server load',
        width: 720,
        height: 360,
        series: [{}, { label: 'CPU %', stroke: '#1f77b4', width: 2 }],
        axes: [{ label: 'Time' }, { label: 'Utilisation (%)' }],
        plugins: [maidrUPlot.maidrPlugin()],
      }, [times, cpu], document.getElementById('chart'));
    </script>
  </body>
</html>
```

The `uplot.js` bundle carries MAIDR itself, so no separate `maidr.js` is needed. Once the page loads, click the chart (or Tab to it) and MAIDR activates with:

- **Audio sonification** — tones representing data values
- **Text descriptions** — spoken via screen readers
- **Braille output** — refreshable braille display support
- **Keyboard navigation** — arrow keys to move between data points

## Using with npm/Bundlers

```bash
npm install maidr uplot
```

```ts
import uPlot from 'uplot';
import { maidrPlugin } from 'maidr/uplot';
import 'uplot/dist/uPlot.min.css';

new uPlot({
  title: 'CPU usage',
  width: 640,
  height: 320,
  series: [{}, { label: 'CPU %', stroke: 'steelblue' }],
  plugins: [maidrPlugin()],
}, [timestamps, cpu], document.getElementById('chart'));
```

`maidr/uplot` never imports `uplot`: it reads the instance it is handed, so any uPlot 1.6 build the page loads works. The package ships TypeScript types for every export (`MaidrUPlotOptions`, `MaidrUPlotHandle`, `UPlotSeriesMaidrOptions` and the rest).

### Binding an existing chart

When you cannot add a plugin — the chart is created by code you do not own — bind the instance instead:

```js
const u = new uPlot(opts, data, document.getElementById('chart'));
const handle = maidrUPlot.bindUPlot(u, { title: 'Web server load' });
```

`bindUPlot(u, options)` accepts a chart that has not drawn yet: uPlot draws for the first time just after `new uPlot(...)` returns, and the binding waits for that (uPlot's `ready` hook) before reading it. It returns a handle:

| Member | What it does |
|--------|--------------|
| `id` | The MAIDR chart id |
| `refresh()` | Re-reads the chart. `u.setData(...)` does this automatically; call it after changing series or axes (`u.addSeries`, `u.setSeries`, …) |
| `dispose()` | Unmounts MAIDR and puts the chart back where it stood |

Calling `bindUPlot` again on a chart that is already bound, including one bound by `maidrPlugin`, returns the existing handle rather than binding twice. `u.destroy()` unbinds MAIDR on its own.

The chart must be in the document when it is bound. `maidrPlugin` logs a console warning and skips a chart it cannot read rather than throwing.

## How It Works

The adapter:

1. **Reads the chart** — takes uPlot's columnar `u.data` together with its `series`, `axes` and `scales`, and builds one MAIDR subplot from them (see [Supported Series](#supported-series)).
2. **Mounts MAIDR around the chart** — uPlot's `.uplot` root is moved inside MAIDR's accessible figure at the spot where it stood, so the chart looks the same and gains a focusable, navigable interface.
3. **Draws the reader's position back onto the chart** — as a box over the focused mark and by moving uPlot's own cursor there (see [Highlighting and Click-to-Navigate](#highlighting-and-click-to-navigate)).
4. **Follows the chart** — `u.setData(...)` is re-read (streaming appended points, see [Live Streaming](#live-streaming)), a resize redraws the highlight, and `u.destroy()` unmounts MAIDR.

## Supported Series

uPlot draws every series through a `paths` function and does not record what kind of mark it drew. The adapter reads the kind off the path uPlot last built for the series, and maps the kinds to MAIDR layers like this:

| Series | How uPlot draws it | MAIDR reads it as |
|--------|--------------------|-------------------|
| Line | the default `paths` (linear), with or without a `fill` | one `line` layer per y scale, one row per series |
| Multi-line | several line series on one y scale | the same `line` layer; Up/Down move between the series |
| Stepped or spline line | `uPlot.paths.stepped(...)` or `uPlot.paths.spline(...)` | a row of that scale's `line` layer |
| Bar | `uPlot.paths.bars(...)` | a `bar` layer per series |
| Scatter | points only: `paths: () => null` with `points: { show: true }`, or `uPlot.paths.points(...)` | a `point` (scatter) layer per series |
| Faceted scatter | every series of a faceted chart (`mode: 2`) | a `point` (scatter) layer per series |

Layers follow series order and all share one subplot, so a chart that mixes kinds — bars under a line, say — is navigated with Page Up / Page Down between its layers. Line series on different y scales (a second axis on the right) become separate `line` layers.

A stepped or spline series is read as a plain `line`: the values announced are the data values, but MAIDR is not told the line is stepped.

### Telling MAIDR what a series is

The inference covers uPlot's own path builders. A series drawn with a custom `paths` function, or a plugin that defeats it, can say what it is with a `maidr` key on the series (uPlot leaves keys it does not know alone):

```js
series: [
  {},
  { label: 'Errors', paths: myCustomBars, maidr: { kind: 'bar' } },
  { label: 'Threshold', maidr: { exclude: true } }, // or `maidr: false`
],
```

or, without touching the series, through the adapter's `series` option, keyed by the index in `u.series` (it wins over a `maidr` key on the series):

```js
maidrUPlot.maidrPlugin({ series: { 1: { kind: 'bar' }, 2: { exclude: true } } });
```

| Key | Values | Meaning |
|-----|--------|---------|
| `kind` | `'line' \| 'bar' \| 'scatter'` | Read the series as this, whatever it draws. Ignored on a faceted chart, where every series is a scatter. |
| `exclude` | `boolean` | Leave the series out of MAIDR entirely. |

A series keeps the kind it was last seen drawing, so hiding one from the legend does not change what it is read as. A series that has never been drawn — hidden from the legend from the start — has no path to read and is taken as a line, uPlot's default; give it a `kind` if it is something else. Hidden series are still read; exclude one that MAIDR should not announce.

## Code Examples

### Multi-Line Chart

Two series on one y scale become one line layer; Up and Down switch between them.

```js
new uPlot({
  title: 'Web server load',
  width: 720,
  height: 360,
  series: [
    {},
    { label: 'CPU %', stroke: '#1f77b4', width: 2 },
    { label: 'Memory %', stroke: '#d62728', width: 2 },
  ],
  axes: [{ label: 'Time' }, { label: 'Utilisation (%)' }],
  plugins: [maidrUPlot.maidrPlugin()],
}, [times, cpu, memory], document.getElementById('chart'));
```

### Bar Chart

```js
const start = Date.UTC(2026, 2, 2) / 1000;
const days = Array.from({ length: 7 }, (_, i) => start + i * 86400);
const requests = [1820, 2140, 1995, 2410, 2675, 1210, 980];

new uPlot({
  title: 'Requests per day',
  width: 720,
  height: 360,
  series: [
    {},
    {
      label: 'Requests',
      fill: 'rgba(31, 119, 180, 0.6)',
      stroke: '#1f77b4',
      paths: uPlot.paths.bars({ size: [0.6, 100] }),
      points: { show: false },
    },
  ],
  axes: [{ label: 'Day' }, { label: 'Requests' }],
  scales: { x: { time: true, range: (u, min, max) => [min - 43200, max + 43200] } },
  plugins: [maidrUPlot.maidrPlugin()],
}, [days, requests], document.getElementById('chart'));
```

Bars drawn horizontally — an x scale with `ori: 1` — are read as a horizontal bar layer, with the axes swapped to match what is drawn.

### Scatter Plot

A series whose `paths` draws nothing and whose points are shown is uPlot's points-only series. Turn the x scale's time handling off when x is not a time.

```js
new uPlot({
  title: 'Latency by payload size',
  width: 720,
  height: 360,
  scales: { x: { time: false } },
  series: [
    { label: 'Payload (KB)' },
    {
      label: 'Latency (ms)',
      stroke: '#2ca02c',
      paths: () => null,
      points: { show: true, size: 8, fill: '#2ca02c' },
    },
  ],
  axes: [{ label: 'Payload (KB)' }, { label: 'Latency (ms)' }],
  plugins: [maidrUPlot.maidrPlugin()],
}, [sizes, latency], document.getElementById('chart'));
```

## Labels

| What | Where it comes from, first match wins |
|------|----------------------------------------|
| Chart title | the `title` option, then uPlot's `title` |
| X axis label | the `xLabel` option, then the label of the axis drawn against the x scale, then the x series' `label`, then `Time` on a time scale or `X` |
| Y axis label | the `yLabel` option, then the label of the axis drawn against the series' y scale, then the series' `label` (for a layer holding one series), then `Value` |
| Series name | the series' `label`, then `Series <n>` |

uPlot fills in `Value` (and `Time` for a time scale's x series) as the label of every series you leave unlabelled. The adapter treats those as unlabelled, so two unnamed lines are announced as `Series 1` and `Series 2` rather than both as `Value`.

In a multi-line layer the series name is announced as the group ("Group is CPU %").

## Time Axes

uPlot's x scale is a time scale unless you set `time: false`, and its values are Unix timestamps in seconds by default (`ms: 1e-3`) or in milliseconds with `ms: 1`. uPlot does not keep that setting on the instance, so the adapter reads the unit off the values: timestamps below 10<sup>11</sup> are taken as seconds, larger ones as milliseconds. Set `msPerUnit` (`1000` for seconds, `1` for milliseconds) if your data could be misread.

Timestamps are converted to milliseconds and announced as dates, as finely as the data needs to tell neighbouring points apart:

| Smallest step between points | Announced as, e.g. |
|------------------------------|--------------------|
| a day or more | Jan 12, 2026 |
| a minute or more | Jan 12, 9:05 AM |
| less than a minute | 9:05:30 AM |

Dates are written in US English, in the reader's time zone. A faceted chart's x values are always read as plain numbers.

Missing values (`null`) are gaps: a line keeps the gap in its row, and bars and scatter points with no value are left out. A bar or scatter series with no values at all has no layer until values arrive.

A chart with no data yet — a dashboard that fills on its first poll — is bound all the same, as an empty chart, and is read as soon as `u.setData` gives it data. An update that empties the chart empties MAIDR's reading too.

## Live Streaming

uPlot has one way to change data: `u.setData(newData)`, which replaces all of it. A streaming dashboard calls it on every tick, usually with the window slid along by a point. The adapter compares each update with the one before:

- When every series is the previous one with points **added at the end** — and optionally the same number of points **dropped from the front**, the sliding window a streaming chart keeps — the new points are streamed to MAIDR one by one through `appendData`, with MAIDR's `maxWidth` window set for each series so it drops exactly what uPlot dropped. The highlight stays on the reader's point as the window slides. Monitor mode (**M**) sonifies and announces each point as it arrives on the focused layer.
- Anything else — a revised value, a series added or removed, a window that shrank — silently replaces the data in place.

Either way the reader's position, modes and focus are kept. Nothing extra is needed on the page:

```js
const u = new uPlot({
  title: 'Queue depth (live)',
  width: 720,
  height: 320,
  series: [{}, { label: 'Queue depth', stroke: '#9467bd', width: 2 }],
  axes: [{ label: 'Time' }, { label: 'Messages' }],
  plugins: [maidrUPlot.maidrPlugin({ id: 'uplot-live' })],
}, [times, values], document.getElementById('chart'));

setInterval(() => {
  times.push(times[times.length - 1] + 2);
  values.push(nextValue());
  times.shift();
  values.shift();
  u.setData([times.slice(), values.slice()]); // MAIDR streams the new reading
}, 2000);
```

Charts are live by default. Pass `live: false` for a chart whose data never changes: the figure is then not marked live, so monitor mode is unavailable and a later `u.setData` is only picked up the next time the chart is focused. See [Live & Streaming Data](LIVE_DATA.md) for monitor mode, the sliding window and how updates behave. There is nothing else to call: `u.setData` is the one way uPlot changes data, and the adapter follows it.

## Highlighting and Click-to-Navigate

uPlot draws into a single `<canvas>`, so there is no element per mark for MAIDR to outline. Instead the adapter draws the highlight in a layer inside uPlot's plotting-area overlay (`u.over`):

- a box around the focused bar, or around the focused line vertex or scatter point;
- uPlot's own cursor is moved to the same point, so the legend — and anything else that follows the cursor — shows the values being read. At a gap in a line only the cursor moves.

The default highlight is an orange box with a translucent fill; `highlightColor` sets the outline color and drops the fill. The bar box assumes uPlot's default bar width (60% of the space between two x values), so a bar drawn much wider or narrower is outlined at that default width. The highlight is redrawn whenever the chart redraws — a resize, a zoom, a new tick — and is taken down when focus leaves the chart, so uPlot's cursor is left to the mouse while the reader is elsewhere.

The overlay also tells a [tactile graphics display](TACTILE_DISPLAY.md) where the plotting area is, so the chart can be felt by pin.

A left click on the plot moves MAIDR to the data point under uPlot's cursor, so a sighted colleague can point at a mark for a screen-reader user. Of the points at the cursor's position, one per series, the one drawn nearest the click is chosen. On a faceted chart the cursor's nearest point in each series is used.

## Configuration Options

`maidrPlugin(options)` and `bindUPlot(u, options)` accept the same `MaidrUPlotOptions`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | `string` | `maidr-uplot-<root id>`, or a generated id | MAIDR chart id, used for DOM ids. Leave unset on a plugin shared by several charts. |
| `title` | `string` | uPlot's `title` | Chart title for announcements |
| `subtitle` | `string` | — | Chart subtitle |
| `caption` | `string` | — | Chart caption |
| `xLabel` | `string` | the x axis' label | X axis label (see [Labels](#labels)) |
| `yLabel` | `string` | each y scale's axis label | Y axis label, used for every layer |
| `msPerUnit` | `number` | inferred | Milliseconds per x unit on a time scale: `1000` for seconds, `1` for milliseconds |
| `series` | `Record<number, { kind?, exclude? }>` | — | Per-series overrides keyed by `u.series` index (see [Telling MAIDR what a series is](#telling-maidr-what-a-series-is)) |
| `live` | `boolean` | `true` | Keep MAIDR in step with `u.setData`, streaming appended points (see [Live Streaming](#live-streaming)) |
| `highlightColor` | `string` | orange | Outline color of the highlight box |
| `enabled` | `boolean` | `true` | `false` makes `maidrPlugin` skip binding, for a plugin registered on many charts |

## Limitations

- **One subplot per chart.** Every series of a chart is a layer of one subplot. Several uPlot charts on a page are separate MAIDR figures; synced charts (`cursor.sync`) are not joined into one.
- **Bands and stacking.** uPlot has no stacked series; stacked charts are drawn by pre-summing the data and adding `bands`. MAIDR reads each series as the values it holds — the running totals — and does not read `bands`.
- **Area charts read as lines.** A line series with a `fill` is read as a `line`, not an area.
- **Stepped and spline lines** are read as plain lines (see [Supported Series](#supported-series)).
- **Grafana.** This adapter works on uPlot charts you create on a page. A Grafana panel plugin that binds Grafana's own time-series panels is separate follow-up work to [#1303](https://github.com/xability/maidr/issues/1303).

## Examples

Complete runnable pages, also in the [examples gallery](examples.html):

- [`examples/uplot/line.html`](https://github.com/xability/maidr/blob/main/examples/uplot/line.html) — two time series on one scale
- [`examples/uplot/bar.html`](https://github.com/xability/maidr/blob/main/examples/uplot/bar.html) — daily bars on a time axis
- [`examples/uplot/scatter.html`](https://github.com/xability/maidr/blob/main/examples/uplot/scatter.html) — a points-only series
- [`examples/uplot/live.html`](https://github.com/xability/maidr/blob/main/examples/uplot/live.html) — a streaming sliding window; press **M** to hear each new reading

## Keyboard Controls

Once a chart is focused, use standard MAIDR keyboard shortcuts:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between data points | Arrow keys | Arrow keys |
| Switch series (multi-line) | Up / Down Arrow | Up / Down Arrow |
| Switch layers (mixed chart) | Page Up / Page Down | Page Up / Page Down |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Toggle Monitor Mode (live charts) | M | M |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |

For the full list, see the [Keyboard Controls](CONTROLS.md) reference.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
