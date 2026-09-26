# ApexCharts Integration

MAIDR provides an adapter for [ApexCharts](https://apexcharts.com/) that reads a rendered chart instance and turns it into an accessible, navigable chart with audio sonification, text descriptions, braille output and keyboard navigation. It reads the data ApexCharts has already normalised, so charts built from arrays, `{ x, y }` objects or `parsing` all convert the same way, and it highlights the SVG elements ApexCharts drew.

ApexCharts is **not bundled** — bring your own copy. The adapter reads the chart instance you pass it and has no runtime dependency on ApexCharts itself. It is written against ApexCharts **7.6.0**, and its selectors depend on the SVG that version draws.

> **Licence note:** ApexCharts 7 is dual-licensed, and MAIDR's licence (GPL-3.0-or-later) does not extend to it. Its free Community License is for individuals, non-profits, educators and organisations with less than USD 2 million in annual revenue, and even then it does not cover use in a competing charting product, or **embedding ApexCharts in a product or platform used by other people**, which needs ApexCharts' paid OEM licence whatever your revenue (the OEM terms exempt only charts that are static and that users cannot interact with, which a MAIDR chart is not). Larger organisations need a paid licence. This is a summary, not legal advice: read the `LICENSE` file in the `apexcharts` package and [ApexCharts' licence page](https://apexcharts.com/license/) before you use it.

## Quick Start

Draw the chart with ApexCharts, then hand the instance to `maidrApexCharts.bindApexCharts()` right after `chart.render()`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My ApexCharts Chart</title>
    <!-- 1. Load ApexCharts (it injects its own CSS; no stylesheet needed) -->
    <script
      src="https://cdn.jsdelivr.net/npm/apexcharts@7.6.0/dist/apexcharts.min.js"
      integrity="sha384-Ls3fJ2jLsgACMhjCwK+p72wydwr/C7GumKDeCkHRsLO0pOz2ThKSSVmS3qsY4v52"
      crossorigin="anonymous"
    ></script>
    <!-- 2. Load MAIDR core + the ApexCharts adapter -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/apexcharts.js"></script>
  </head>
  <body>
    <div id="chart"></div>

    <script>
      // 3. Draw the chart as usual -- with ApexCharts' own keyboard
      //    navigation switched off, because MAIDR provides the keyboard access,
      //    and its toolbar hidden (see "Turn off ApexCharts' keyboard navigation").
      const chart = new ApexCharts(document.querySelector('#chart'), {
        chart: {
          type: 'bar',
          height: 400,
          accessibility: { enabled: false },
          toolbar: { show: false },
        },
        title: { text: 'Monthly Coffee Sales' },
        series: [{ name: 'Cups sold', data: [420, 380, 510, 610, 700, 820] }],
        xaxis: {
          categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          title: { text: 'Month' },
        },
        yaxis: { title: { text: 'Cups sold' } },
      });
      chart.render();

      // 4. Bind it. MAIDR activates once ApexCharts has finished drawing.
      maidrApexCharts.bindApexCharts(chart);
    </script>
  </body>
</html>
```

The adapter exposes a global `maidrApexCharts` object with `bindApexCharts()` and `apexchartsToMaidr()`. The UMD bundle works directly from `file://` URLs — no module server required.

Once the chart has drawn, click on it (or Tab to it) and MAIDR activates with:

- **Audio sonification** — tones representing data values
- **Text descriptions** — spoken via screen readers
- **Braille output** — refreshable braille display support
- **Keyboard navigation** — arrow keys to move between data points

## How It Works

1. **Wait** — ApexCharts draws asynchronously and then animates every mark into place, moving the SVG paths as it goes. `bindApexCharts()` waits until `render()` has resolved and the entry animation has ended (or straight away when `chart.animations.enabled` is `false`), so MAIDR measures the marks where they finally sit.
2. **Read** — `apexchartsToMaidr()` reads the values ApexCharts normalised into `chart.w.globals`, and the titles from `chart.w.config`: `title.text`, `subtitle.text`, `xaxis.title.text` and the `title.text` of the y axis each series is drawn against (`yaxis[0]` by default). Each series is mapped to a MAIDR trace type from the chart type, the series' own `type` in a combo chart, and options such as `chart.stacked`, `chart.stackType` and `plotOptions.bar.horizontal`.
3. **Locate** — every layer carries CSS selectors scoped to the chart's wrapper (`#apexcharts<chartID>`) and to one series (`g.apexcharts-series[data\:realIndex="i"]`), so MAIDR highlights the mark for the data point you are on and never another chart's.
4. **Hand over** — `bindApexCharts()` writes the result to the `maidr-data` attribute of the element you gave ApexCharts (`chart.el`) and dispatches `maidr:bindchart`, which tells MAIDR to initialise it. Whenever ApexCharts redraws the chart afterwards, it converts the chart again and replaces MAIDR's data in place (see [Updates, resizing and legend toggles](#updates-resizing-and-legend-toggles)).

## Installation

### CDN (script tags — works on `file://` and any web server)

```html
<script
  src="https://cdn.jsdelivr.net/npm/apexcharts@7.6.0/dist/apexcharts.min.js"
  integrity="sha384-Ls3fJ2jLsgACMhjCwK+p72wydwr/C7GumKDeCkHRsLO0pOz2ThKSSVmS3qsY4v52"
  crossorigin="anonymous"
></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/apexcharts.js"></script>
<script>
  // Globals: ApexCharts, maidrApexCharts
  maidrApexCharts.bindApexCharts(chart);
</script>
```

Pin the ApexCharts version, as above: the adapter reads the class names and attributes ApexCharts puts on its SVG, and an unpinned URL changes them under you on release day. The `integrity` hash is for `apexcharts@7.6.0/dist/apexcharts.min.js`; if you upgrade, check the highlights still land and replace the hash.

### ESM (modern build tooling / bundlers)

```html
<script src="https://cdn.jsdelivr.net/npm/apexcharts@7.6.0/dist/apexcharts.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
<script type="module">
  import { bindApexCharts } from 'https://cdn.jsdelivr.net/npm/maidr/dist/apexcharts.mjs';
</script>
```

> ESM imports require an HTTP(S) origin (CORS blocks them on `file://`). For local-file demos, use the UMD `dist/apexcharts.js` bundle above.

### npm

```bash
npm install maidr apexcharts
```

```ts
import ApexCharts from 'apexcharts';
import 'maidr'; // the MAIDR runtime, which picks up bound charts
import { bindApexCharts } from 'maidr/apexcharts';

const chart = new ApexCharts(document.querySelector('#chart'), options);
chart.render();
const binding = bindApexCharts(chart, { title: 'Monthly Coffee Sales' });
```

## Supported Chart Types

| Chart Type | ApexCharts configuration | MAIDR type | Example |
|------------|--------------------------|------------|---------|
| Line | `type: 'line'` (straight or `stroke.curve: 'smooth'`), one or more series | `line` | [apexcharts-line.html](examples/apexcharts-line.html), [apexcharts-multiline.html](examples/apexcharts-multiline.html) |
| Step | `type: 'line'` + `stroke.curve: 'stepline'` or `'linestep'` | `step` | [apexcharts-step.html](examples/apexcharts-step.html) |
| Area [experimental] | `type: 'area'` | `area` | [apexcharts-area.html](examples/apexcharts-area.html) |
| Stacked Area [experimental] | `type: 'area'` + `chart.stacked: true` | `stacked_area` | [apexcharts-stacked-area.html](examples/apexcharts-stacked-area.html) |
| Bar / Column | `type: 'bar'`, one series | `bar` | [apexcharts-bar.html](examples/apexcharts-bar.html) |
| Horizontal Bar | `type: 'bar'` + `plotOptions.bar.horizontal: true` | `bar`, `orientation: 'horz'` | [apexcharts-bar-horizontal.html](examples/apexcharts-bar-horizontal.html) |
| Grouped Bar | `type: 'bar'`, several series | `dodged_bar` | [apexcharts-grouped-bar.html](examples/apexcharts-grouped-bar.html) |
| Stacked Bar | `type: 'bar'` + `chart.stacked: true`; with several `series[i].group` values, one layer per group | `stacked_bar` | [apexcharts-stacked.html](examples/apexcharts-stacked.html) |
| 100% Stacked Bar | `type: 'bar'` + `chart.stacked: true` + `chart.stackType: '100%'` | `stacked_normalized_bar` | [apexcharts-normalized.html](examples/apexcharts-normalized.html) |
| Mixed (Column + Line) | a `type` on each series, e.g. `'column'` and `'line'` | one layer per group, in one subplot | [apexcharts-mixed.html](examples/apexcharts-mixed.html) |
| Scatter | `type: 'scatter'` | `point`, one layer per series | [apexcharts-scatter.html](examples/apexcharts-scatter.html) |
| Bubble | `type: 'bubble'` | `point`, one layer per series (the size is not announced) | [apexcharts-bubble.html](examples/apexcharts-bubble.html) |
| Pie / Donut | `type: 'pie'` or `type: 'donut'` | `pie` | [apexcharts-pie.html](examples/apexcharts-pie.html), [apexcharts-donut.html](examples/apexcharts-donut.html) |
| Heatmap | `type: 'heatmap'` | `heat` | [apexcharts-heatmap.html](examples/apexcharts-heatmap.html) |
| Candlestick | `type: 'candlestick'` | `candlestick` | [apexcharts-candlestick.html](examples/apexcharts-candlestick.html) |
| Box Plot | `type: 'boxPlot'`, vertical or with `plotOptions.bar.horizontal: true` | `box` | [apexcharts-box.html](examples/apexcharts-box.html), [apexcharts-box-horizontal.html](examples/apexcharts-box-horizontal.html) |
| Polar Area [experimental] | `type: 'polarArea'` | `polar_area` | [apexcharts-polar-area.html](examples/apexcharts-polar-area.html) |
| Radar [experimental] | `type: 'radar'` | `radar` | [apexcharts-radar.html](examples/apexcharts-radar.html) |
| Range Bar (Gantt) [experimental] | `type: 'rangeBar'` | `gantt` | [apexcharts-gantt.html](examples/apexcharts-gantt.html) |
| Treemap [experimental] | `type: 'treemap'` | `treemap` | [apexcharts-treemap.html](examples/apexcharts-treemap.html) |
| Radial Bar (Gauge) [experimental] | `type: 'radialBar'` | `gauge`, one layer per ring | [apexcharts-gauge.html](examples/apexcharts-gauge.html) |
| Funnel [experimental] | `type: 'bar'` + `plotOptions.bar.isFunnel: true` | `funnel` | [apexcharts-funnel.html](examples/apexcharts-funnel.html) |

> **Stacked and 100% note:** a stacked series is announced by its **own** value, not by the height of the stack it reaches; MAIDR sums the stack itself and offers the total on a Sum row. For `stackType: '100%'` the adapter announces each series' **share** of its category, the number ApexCharts draws, rather than the raw value you wrote. When the series name more than one `group`, ApexCharts draws one stack per group side by side, and each group becomes a stacked layer of its own, named after the group, so each Sum row is the total of a stack that is drawn. Page Up / Page Down moves between the groups.
>
> ApexCharts 7.6.0 cannot draw a **100% stacked area or line** chart (`type: 'area'` or `'line'` with `stackType: '100%'`): it places the series hundreds of pixels above the plot, so the chart shows a flat block and MAIDR's outline lands off the chart too. The adapter still reads such a chart — as `stacked_normalized_area` [experimental], with the right shares — but warns in the console. Draw shares as a 100% stacked bar chart instead.

> **Heatmap note:** ApexCharts draws each series as one row, with the **first series at the bottom** (or at the top with `yaxis.reversed: true`), and places each cell by its position in the series, not by its `x`. MAIDR reads the rows in the order they are drawn, top first, and takes the column names from the first series — so give every series the same columns in the same order.

> **Box plot note:** ApexCharts draws each box as two halves, each mixing whisker and body, so neither can be highlighted as the interquartile box or the median. The adapter adds hidden highlight shapes for the minimum, the quartiles, the median and the maximum of every box, and adds them again when ApexCharts redraws. Each `boxPlot` series is its own layer. When a chart has one box series and a `scatter` series drawn over it — ApexCharts' way of showing outliers — the scatter points outside a box's whiskers become that box's lower and upper outliers rather than a layer of their own. A box is entered at its lower outliers, so on a chart without any, the first Up arrow moves to the minimum.

> **Candlestick note:** each candle is one ApexCharts path holding the body and both wicks. The adapter splits it into a body, an upper wick and a lower wick so MAIDR highlights the part you are on — open and close on the body's edges, high and low on the wicks. Each candlestick series is its own layer. Horizontal candlesticks (`plotOptions.bar.horizontal`) are read, but not highlighted.

> **Range bar (Gantt) note:** ApexCharts groups a range bar chart's series by who or what owns the bar, while MAIDR's lanes are the bars' `x` categories. The adapter regroups the intervals lane by lane, in the order the chart lists the lanes and each lane's intervals by start; when there are several series, each interval is labelled with its series' name. Up moves from each lane to the next in that order, and Down back, as on MAIDR's other gantt charts — so on a horizontal range bar chart, which ApexCharts draws first lane at the top, Up moves the outline **down** the chart. With `xaxis.type: 'datetime'` the start and end are announced as dates, and each task's length in days — or in hours, minutes or seconds when the shortest task is shorter than a day, an hour or a minute.

> **Radial bar (gauge) note:** every ring of a `radialBar` chart is its own gauge layer, reading its value against a 0–100 scale, which is what ApexCharts draws. Page Up / Page Down moves between the rings.

> **Polar area note:** a polar area chart gives every slice the same angle and draws its value as the slice's length, so MAIDR reads it as a polar area layer — one spoke per label — rather than as a pie.

> **Funnel note:** a funnel is a horizontal bar chart with `isFunnel`; MAIDR reads each stage's count and announces the share of the stage before it that the stage retained, and its share of the first stage.

> **Mixed chart note:** a combo chart, where each series names its own `type`, is one subplot with a layer per kind of mark: the column series become one bar layer (grouped or stacked as the chart says), the lines one line layer, and so on. Page Up / Page Down moves between the layers.

### Chart types that are not read

`rangeArea` and any other series type not in the table above is skipped with a `console.warn` naming the series, and the rest of the chart is still converted.

## Turn Off ApexCharts' Keyboard Navigation

ApexCharts 7 ships keyboard navigation of its own, and it is **on by default**: it gives the chart's `<svg>` `role="application"` and `tabindex="0"`, moves its tooltip with the arrow keys, and announces each point in an `aria-live` region. On a chart MAIDR also reads, that means two components answering the same arrow keys and two voices announcing the same point — a screen reader user hears both, and the one ApexCharts moves is not the one MAIDR highlights.

Switch it off in the chart's options:

```js
new ApexCharts(el, {
  chart: {
    type: 'bar',
    accessibility: { enabled: false },
  },
  // ...
});
```

MAIDR takes nothing from ApexCharts' accessibility layer — it reads the chart's data and SVG, and provides the keyboard access, the announcements and the braille itself — so nothing is lost for a MAIDR reader. The adapter prints one `console.warn` per chart when ApexCharts' keyboard navigation is still on.

If you want to keep the rest of ApexCharts' accessibility layer (the `aria-label` on the chart and the keyboard-operable legend), turn off only the keyboard navigation instead:

```js
chart: {
  accessibility: { keyboard: { navigation: { enabled: false } } },
}
```

### Hide the toolbar

ApexCharts' toolbar sits inside the chart, and so inside MAIDR's keyboard region: its buttons (the menu, and on line and area charts zoom in, zoom out, zoom, pan and reset) are Tab stops between MAIDR's chart and the rest of the page. Zooming or panning also leaves the points outside the new view undrawn, and MAIDR can read those but not outline them. The examples hide the toolbar:

```js
chart: {
  accessibility: { enabled: false },
  toolbar: { show: false },
}
```

If your readers need the download menu, keep the toolbar and turn off only zooming, with `chart.zoom.enabled: false`.

## Updates, Resizing and Legend Toggles

ApexCharts throws away every mark and draws new ones whenever the chart changes: on a window resize, `updateSeries()`, `updateOptions()`, and a legend click that hides or shows a series. A highlight bound to the old marks would point at nothing.

`bindApexCharts()` listens for ApexCharts' `mounted` and `updated` events and, after every redraw, converts the chart again once it has settled and hands MAIDR the new result through `window.maidrLive.setData()`, MAIDR's in-place update. MAIDR is not re-mounted, so a reader who is inside the chart keeps the keyboard focus and their place: the next arrow key moves on from the point they were on and reads the new values. The outline follows the marks ApexCharts now shows, and a hidden series drops out of what MAIDR reads. The outline of the current point disappears when the chart redraws and comes back when the reader next moves to a point (see [Limitations](#limitations)).

"Settled" means the redraw's animation has ended and the marks have stopped moving; several updates in quick succession are converted once, after the last. A chart that keeps updating before it settles — a live feed calling `updateSeries()` about as often as its update animation lasts, like ApexCharts' realtime demo — is converted at least once per animation budget instead (one second plus twice `chart.animations.speed` plus `dynamicAnimation.speed`: 3.6 seconds at `speed: 800` and `dynamicAnimation.speed: 1000`), taking the chart as it stands even mid-animation. While it streams, what MAIDR reads can therefore be up to that long behind the chart, and the outline is missing between a redraw and the next conversion; once the updates stop, the chart is converted again after it settles. Shorter animations shorten the lag, and `animations: { enabled: false }` removes most of it.

The bound data carries `live: true`, which is what lets MAIDR swap the data while the reader is in the chart. It also makes MAIDR's monitor mode (M) available on the chart, but a redraw replaces the data rather than appending points, so monitor mode has nothing to announce.

```js
const chart = new ApexCharts(el, options);
chart.render();
const binding = maidrApexCharts.bindApexCharts(chart, { title: 'Monthly Coffee Sales' });

// The MAIDR data for the first draw, once ApexCharts has finished drawing:
binding.ready.then(maidrData => console.log(maidrData));

// Later: new data -- MAIDR is updated in place, and a reader in the chart stays there.
chart.updateSeries([{ name: 'Cups sold', data: [430, 390, 520, 600, 710, 840] }]);

// When the chart goes away: stop listening, and take MAIDR off the container.
binding.dispose();
document.dispatchEvent(new CustomEvent('maidr:unbindchart', { detail: chart.el }));
chart.destroy();
```

### Width

MAIDR wraps the chart in a keyboard region sized to its content, which on its own would hold an ApexCharts chart at the width it was first drawn at. So while MAIDR is mounted, `bindApexCharts()` sets the `width` of the chart's container (`chart.el`) in pixels, from the space MAIDR's figure has, and keeps it up to date as the page resizes. The chart then follows the window as it did before, and a reader who zooms in does not have to scroll sideways. A container left at `width: auto` gets the full width, one with a percentage width its share of it, and the container's own `max-width` still applies. A container with a fixed width, or a chart with a pixel `chart.width`, is left alone. `dispose()` puts the container's width back.

## API Reference

### `bindApexCharts(chart, options?)`

Waits for the chart to finish drawing, converts it with `apexchartsToMaidr()`, writes the result (with `live: true`) to the `maidr-data` attribute of `chart.el` and dispatches `maidr:bindchart` so MAIDR initialises it — then, after every redraw, converts the chart again and replaces MAIDR's data in place. Call it right after `chart.render()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `chart` | `ApexChartsInstance` | The chart instance returned by `new ApexCharts(...)` |
| `options` | `ApexChartsAdapterOptions` | Optional overrides (see below) |

Returns an `ApexChartsBinding`:

| Member | Type | Description |
|--------|------|-------------|
| `ready` | `Promise<MaidrData>` | Resolves with the MAIDR data for the first finished draw; rejects if the chart cannot be converted (the error is also logged) or if `dispose()` is called first. On a chart that is never rendered it stays pending, with a console warning once the chart has had time to draw, and resolves if the chart is rendered later |
| `dispose()` | `() => void` | Removes the binding's listeners and puts back the container width it was setting; call it before `chart.destroy()`. It does not take MAIDR off the container: dispatch `maidr:unbindchart` for that (see [Updates](#updates-resizing-and-legend-toggles)) |

### `apexchartsToMaidr(chart, options?)`

Converts a chart that has **finished drawing** into a `MaidrData` object without binding anything — for pages that post-process the data or hand it to MAIDR themselves. Calling it during ApexCharts' entry animation measures marks that are still moving; use `bindApexCharts()` unless you control the timing, for example with animations disabled:

```js
const chart = new ApexCharts(el, {
  ...options,
  chart: { ...options.chart, animations: { enabled: false } },
});
await chart.render();
const maidrData = maidrApexCharts.apexchartsToMaidr(chart, { id: 'sales' });
```

MAIDR reads `maidr-data` attributes only once, when the page loads. To hand it data after that, set the attribute and dispatch `maidr:bindchart` on the element:

```js
chart.el.setAttribute('maidr-data', JSON.stringify(maidrData));
chart.el.dispatchEvent(new CustomEvent('maidr:bindchart', { bubbles: true }));
```

A chart bound this way does not follow the window's width: once MAIDR has mounted on it, its figure is sized to the chart and the chart to its container, so it keeps the width it was first drawn at — the whole width it had, which with MAIDR's figure around it is wider than the page, so the page scrolls sideways. Keeping the container as wide as the page is something only `bindApexCharts()` does (see [Width](#width)); binding by hand, give the chart a fixed pixel `chart.width` that fits your layout, or set the container's `width` in pixels yourself, keep it in step as the page resizes, and call `chart.parentResizeHandler()` after each change so ApexCharts redraws at it.

Doing that again re-mounts MAIDR, which takes the keyboard focus off the chart; to update a mounted chart, pass data with `live: true` to `window.maidrLive.setData()` instead, as `bindApexCharts()` does. The selectors in the data point at the marks ApexCharts drew, so convert the chart again after every redraw.

### Options

`ApexChartsAdapterOptions` overrides what the chart configuration says:

| Option | Type | Default |
|--------|------|---------|
| `id` | `string` | `maidr-apexcharts-<chartID>` |
| `title` | `string` | `title.text` |
| `subtitle` | `string` | `subtitle.text` |
| `caption` | `string` | none |
| `axes` | `{ x?: string; y?: string; z?: string }` | `xaxis.title.text`, and the `title.text` of the y axis each series is drawn against (`yaxis[0]` by default) |

Pie, donut, polar area and radar charts have no axis titles to read, so MAIDR announces "X" and "Y" unless you name them with `axes`; so does any chart whose `xaxis` or `yaxis` has no title. A few types have defaults of their own:

| Chart | Announced without `axes` |
|-------|--------------------------|
| Heatmap | the axis titles, and "Level" for the cell value — name it with `axes.z` |
| Treemap | "Node" and "Value" |
| Radial bar (gauge) | "Measure" for the ring's label, and "Y" for its value |
| Funnel | "Stage" and "Count" |

On a horizontal bar chart ApexCharts draws `xaxis.title` along the value axis and the `yaxis` title beside the categories, and MAIDR announces them the same way round. On a chart with several y axes, each layer is named after the axis its series are drawn against: line and area series on differently titled axes become separate layers, and a layer whose series sit on differently titled axes is given no y title. `axes.y` names every layer.

### Type exports

```ts
import type {
  ApexChartsAdapterOptions,
  ApexChartsBinding,
  ApexChartsInstance,
  MaidrData, // the MAIDR schema that ready and apexchartsToMaidr() give you
  MaidrLayer,
  MaidrSubplot,
} from 'maidr/apexcharts';
```

## Code Examples

> Every example assumes the scripts from the [Quick Start](#quick-start) and a `<div id="chart">`, switches ApexCharts' keyboard navigation off and hides its toolbar. Each links a runnable page under `examples/`.

### Bar / Column Chart

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'bar', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Monthly Coffee Sales' },
  series: [{ name: 'Cups sold', data: [420, 380, 510, 610, 700, 820] }],
  xaxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], title: { text: 'Month' } },
  yaxis: { title: { text: 'Cups sold' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Horizontal Bar

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'bar', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Native Speakers by Language' },
  plotOptions: { bar: { horizontal: true } },
  series: [{ name: 'Speakers', data: [939, 485, 380, 345, 237] }],
  xaxis: {
    categories: ['Mandarin', 'Spanish', 'English', 'Hindi', 'Bengali'],
    title: { text: 'Native speakers (millions)' },
  },
  yaxis: { title: { text: 'Language' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Grouped Bar Chart

Several bar series without `stacked` are drawn side by side, and read as a dodged bar chart: Left/Right moves between categories, Up/Down between the series in one category.

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'bar', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Quarterly Revenue by Region' },
  series: [
    { name: 'North', data: [44, 55, 57, 56] },
    { name: 'South', data: [76, 85, 101, 98] },
    { name: 'West', data: [35, 41, 36, 26] },
  ],
  xaxis: { categories: ['Q1', 'Q2', 'Q3', 'Q4'], title: { text: 'Quarter' } },
  yaxis: { title: { text: 'Revenue ($ thousands)' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Stacked Bar Chart

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'bar', height: 400, stacked: true, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Electricity Generation by Source' },
  series: [
    { name: 'Coal', data: [210, 190, 175, 150, 128] },
    { name: 'Gas', data: [320, 335, 340, 330, 325] },
    { name: 'Renewables', data: [140, 165, 190, 230, 275] },
  ],
  xaxis: { categories: ['2019', '2020', '2021', '2022', '2023'], title: { text: 'Year' } },
  yaxis: { title: { text: 'Generation (TWh)' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### 100% Stacked Bar Chart

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: {
    type: 'bar',
    height: 400,
    stacked: true,
    stackType: '100%',
    accessibility: { enabled: false },
    toolbar: { show: false },
  },
  title: { text: 'Support for a Four-Day Week by Age Group' },
  series: [
    { name: 'Agree', data: [412, 305, 260, 118] }, // respondents, not percentages
    { name: 'Undecided', data: [96, 131, 140, 84] },
    { name: 'Disagree', data: [52, 88, 125, 150] },
  ],
  xaxis: { categories: ['18-29', '30-44', '45-59', '60+'], title: { text: 'Age group' } },
  yaxis: { title: { text: 'Share of respondents (%)' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Line Chart

Give a line chart markers (`markers.size > 0`) whenever its data can hold gaps — see [Limitations](#limitations).

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'line', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Average Temperature in Chicago' },
  series: [{
    name: 'Temperature',
    data: [-4.6, -2.4, 3.2, 9.4, 15.1, 20.8, 23.7, 22.8, 18.8, 12.1, 5.2, -1.6],
  }],
  markers: { size: 4 },
  xaxis: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    title: { text: 'Month' },
  },
  yaxis: { title: { text: 'Temperature (°C)' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Multi-Line Chart

Every line series of a chart becomes one multi-line layer; Up/Down moves to the line above or below.

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'line', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Weekly Active Users by Device' },
  stroke: { curve: 'smooth' },
  markers: { size: 4 },
  series: [
    { name: 'Desktop', data: [1200, 1180, 1250, 1300, 1280, 1350, 1400, 1380] },
    { name: 'Mobile', data: [900, 980, 1050, 1120, 1200, 1260, 1330, 1420] },
    { name: 'Tablet', data: [300, 290, 310, 305, 295, 320, 315, 330] },
  ],
  xaxis: { categories: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'], title: { text: 'Week' } },
  yaxis: { title: { text: 'Active users' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Step Chart

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'line', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Policy Interest Rate' },
  stroke: { curve: 'stepline' },
  series: [{ name: 'Rate', data: [0.25, 0.5, 1.75, 3.25, 4.5, 5.0, 5.25, 5.5, 5.5, 5.5] }],
  xaxis: {
    categories: ['2022 Q1', '2022 Q2', '2022 Q3', '2022 Q4', '2023 Q1',
      '2023 Q2', '2023 Q3', '2023 Q4', '2024 Q1', '2024 Q2'],
    title: { text: 'Quarter' },
  },
  yaxis: { title: { text: 'Rate (%)' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Area Chart [experimental]

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'area', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Daily Website Sessions' },
  dataLabels: { enabled: false },
  series: [{ name: 'Sessions', data: [310, 402, 385, 420, 460, 210, 190] }],
  xaxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], title: { text: 'Day' } },
  yaxis: { title: { text: 'Sessions' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Stacked Area [experimental]

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'area', height: 400, stacked: true, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Website Visits by Traffic Source' },
  dataLabels: { enabled: false },
  series: [
    { name: 'Organic', data: [4200, 4500, 4800, 5100, 5600, 5900] },
    { name: 'Direct', data: [2100, 2200, 2150, 2300, 2400, 2500] },
    { name: 'Referral', data: [800, 950, 1100, 1000, 1200, 1350] },
  ],
  xaxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], title: { text: 'Month' } },
  yaxis: { title: { text: 'Visits' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Scatter Plot

Each scatter series becomes its own point layer; Page Up / Page Down moves between them.

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'scatter', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Height and Weight of Adults' },
  series: [
    { name: 'Group A', data: [[161, 51], [167, 59], [159, 49], [157, 63], [155, 53]] },
    { name: 'Group B', data: [[175, 65], [183, 76], [178, 72], [181, 88], [172, 70]] },
  ],
  xaxis: { type: 'numeric', tickAmount: 8, title: { text: 'Height (cm)' } },
  yaxis: { title: { text: 'Weight (kg)' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Bubble Chart

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'bubble', height: 420, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Income and Life Expectancy' },
  series: [{
    name: 'Countries',
    data: [[2.4, 70.8, 1428], [12.7, 78.6, 1425], [76.4, 79.3, 340]], // [x, y, size]
  }],
  xaxis: { type: 'numeric', title: { text: 'GDP per person ($ thousands)' } },
  yaxis: { title: { text: 'Life expectancy (years)' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Pie / Donut Chart

A donut (`type: 'donut'`) is read exactly as a pie. `plotOptions.pie.startAngle` is carried over, so MAIDR's dial starts where the first slice does.

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'pie', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Monthly Household Budget' },
  series: [1200, 600, 300, 200, 700],
  labels: ['Rent', 'Food', 'Transport', 'Utilities', 'Savings'],
});
chart.render();
// A pie has no axis titles, so name what MAIDR announces for each slice.
maidrApexCharts.bindApexCharts(chart, { axes: { x: 'Expense', y: 'Amount ($)' } });
```

### Heatmap

```js
const hours = ['7am', '9am', '11am', '1pm', '3pm'];
const row = (name, values) => ({ name, data: values.map((y, i) => ({ x: hours[i], y })) });

const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'heatmap', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Cafe Customers by Day and Hour' },
  series: [
    row('Mon', [12, 30, 18, 26, 14]),
    row('Tue', [15, 34, 20, 28, 16]),
    row('Wed', [14, 31, 22, 30, 15]),
  ],
  xaxis: { title: { text: 'Hour' } },
  yaxis: { title: { text: 'Weekday' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Candlestick Chart

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'candlestick', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'ACME Corp. Daily Prices' },
  series: [{
    name: 'ACME',
    data: [
      { x: 'Mar 3', y: [51.2, 53.4, 50.8, 52.9] }, // [open, high, low, close]
      { x: 'Mar 4', y: [52.9, 54.1, 52.2, 53.6] },
      { x: 'Mar 5', y: [53.6, 53.9, 51.7, 52.0] },
    ],
  }],
  xaxis: { type: 'category', title: { text: 'Trading day' } },
  yaxis: { title: { text: 'Price ($)' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Box Plot

Add `plotOptions: { bar: { horizontal: true } }` for horizontal boxes ([apexcharts-box-horizontal.html](examples/apexcharts-box-horizontal.html)).

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'boxPlot', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Commute Time by Travel Mode' },
  series: [{
    name: 'Commute time',
    data: [
      { x: 'Car', y: [12, 18, 24, 31, 45] }, // [min, q1, median, q3, max]
      { x: 'Bus', y: [20, 28, 35, 42, 60] },
      { x: 'Bike', y: [10, 15, 19, 24, 32] },
    ],
  }],
  xaxis: { title: { text: 'Travel mode' } },
  yaxis: { title: { text: 'Minutes' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Polar Area Chart [experimental]

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'polarArea', height: 420, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Average Daily Sunshine by Season' },
  series: [5.2, 8.9, 9.6, 6.1],
  labels: ['Spring', 'Summer', 'Autumn', 'Winter'],
  yaxis: { title: { text: 'Hours' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart, { axes: { x: 'Season' } });
```

### Radar Chart [experimental]

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'radar', height: 450, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Candidate Skill Ratings' },
  series: [
    { name: 'Alice', data: [8, 7, 9, 6, 7, 8] },
    { name: 'Ben', data: [6, 9, 7, 8, 5, 7] },
  ],
  xaxis: { categories: ['Coding', 'Design', 'Testing', 'Communication', 'Planning', 'Mentoring'] },
});
chart.render();
// A radar has no axis titles, so name the spokes and the values.
maidrApexCharts.bindApexCharts(chart, { axes: { x: 'Skill', y: 'Rating' } });
```

### Range Bar (Gantt) [experimental]

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'rangeBar', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Website Launch Plan' },
  plotOptions: { bar: { horizontal: true } },
  series: [{
    name: 'Launch',
    data: [
      { x: 'Research', y: [Date.UTC(2025, 0, 6), Date.UTC(2025, 0, 17)] },
      { x: 'Design', y: [Date.UTC(2025, 0, 13), Date.UTC(2025, 1, 7)] },
      { x: 'Build', y: [Date.UTC(2025, 1, 3), Date.UTC(2025, 2, 14)] },
    ],
  }],
  xaxis: { type: 'datetime', title: { text: 'Date' } },
  yaxis: { title: { text: 'Task' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Treemap [experimental]

With several series, each series becomes a parent node of its rectangles.

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'treemap', height: 450, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Largest Urban Areas (population, millions)' },
  series: [{
    data: [
      { x: 'Tokyo', y: 37.2 },
      { x: 'Delhi', y: 32.9 },
      { x: 'Shanghai', y: 29.2 },
      { x: 'Dhaka', y: 23.2 },
    ],
  }],
});
chart.render();
// Without axes, a treemap's tiles are announced as "Node" and "Value".
maidrApexCharts.bindApexCharts(chart, { axes: { x: 'City', y: 'Population (millions)' } });
```

### Radial Bar (Gauge) [experimental]

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'radialBar', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Battery Level' },
  series: [72],
  labels: ['Battery'],
});
chart.render();
// The ring's label is announced as "Measure"; name its value.
maidrApexCharts.bindApexCharts(chart, { axes: { y: 'Charge (%)' } });
```

### Funnel Chart [experimental]

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'bar', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Hiring Funnel' },
  plotOptions: { bar: { horizontal: true, isFunnel: true, barHeight: '80%' } },
  series: [{ name: 'Candidates', data: [1380, 890, 450, 210, 64] }],
  xaxis: { categories: ['Applied', 'Screened', 'Interviewed', 'Offered', 'Hired'] },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

### Mixed Chart (Column + Line)

```js
const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'line', height: 400, accessibility: { enabled: false }, toolbar: { show: false } },
  title: { text: 'Revenue Against Target' },
  stroke: { width: [0, 3] },
  markers: { size: [0, 4] },
  series: [
    { name: 'Revenue', type: 'column', data: [42, 47, 51, 49, 58, 63] },
    { name: 'Target', type: 'line', data: [45, 46, 48, 50, 55, 60] },
  ],
  xaxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], title: { text: 'Month' } },
  yaxis: { title: { text: 'Revenue ($ thousands)' } },
});
chart.render();
maidrApexCharts.bindApexCharts(chart);
```

## Limitations

- **Line and area charts with gaps need markers.** ApexCharts draws a line or area series as one path and, with the default `markers.size: 0`, no element per point. Without gaps MAIDR finds each point on that path. With a `null` in the data the path jumps over the gap, and an isolated point between two gaps is not on it at all, so the points and the path's vertices no longer line up. Set `markers: { size: 4 }` (or any size above 0) on such a chart: the adapter then highlights the markers, one per non-null point. Without markers a series with gaps is still read and announced, but none of its points are highlighted, and the adapter says so in the console.
- **100% stacked area and line charts are drawn off the chart by ApexCharts 7.6.0.** MAIDR reads their shares correctly but cannot outline them where they are drawn; the adapter warns. Use a 100% stacked bar chart.
- **The outline goes when the chart redraws.** After a resize, an update or a legend click, the reader keeps their place, but the outline of the current point comes back only when they next move to a point. A key that only reaches the end of the data ("No more data to display") does not bring it back, so on a gauge with one ring, where every arrow key is such a key, the outline returns once the reader leaves the chart and comes back. ApexCharts also redraws the chart once just after MAIDR mounts on it, to fit the width MAIDR's figure gives it, so a reader who Tabs in during the first moments may find their first key's point read but not outlined.
- **Only what ApexCharts draws is highlighted.** A zoomed or panned chart leaves off-screen marks undrawn; their data is still read, but a type that needs one mark per data point declines its highlights for that draw. Hide the toolbar or turn zooming off (see [Hide the toolbar](#hide-the-toolbar)).
- **Hidden series are not read.** A series hidden from the legend drops out of MAIDR when the chart redraws; show it again and it comes back. With every series hidden (or a chart with no data at all) there is nothing left to read, and MAIDR answers the arrow keys with silence rather than "No more data to display" until a series is shown again; the adapter warns once in the console. That includes a pie, donut or polar area slice and a radial bar ring, which ApexCharts keeps drawing at zero. MAIDR keeps the reader's position by index, so after a series before theirs is hidden they are on the next one along, and when their own series or slice is hidden they are on the one that takes its place. Neither move is announced: the reader hears where they are with their next key.
- **A chart that streams is read up to one animation budget behind.** See [Updates, Resizing and Legend Toggles](#updates-resizing-and-legend-toggles).
- **Up and Down on a horizontal gantt move down and up the drawn chart.** MAIDR's gantt lanes run in the order the chart lists them, which ApexCharts draws from the top; see the range bar note under [Supported Chart Types](#supported-chart-types).
- **The chart's container is given a pixel width while MAIDR is mounted.** See [Width](#width). Styles that set the container's `width` from outside, after the chart is bound, are overridden until `dispose()`.
- **`dispose()` leaves MAIDR mounted.** It stops the binding; dispatch `maidr:unbindchart` to take MAIDR off the container too.
- **Several y axes are named per layer.** A layer mixing series on differently titled y axes is given no y title; pass `axes: { y: '...' }` to name it yourself.
- **Mixed point formats in one chart are dropped by ApexCharts.** A chart whose series mix the array and object point forms has one of them left out by ApexCharts itself; MAIDR reads what was drawn.
- **Unsupported types** — `rangeArea` and anything else not in the [table](#supported-chart-types) — are skipped with a console warning.
- **A bubble's size is not announced.** A bubble chart is read as a scatter plot of its x and y values.

## Keyboard Controls

Once a chart is focused, use standard MAIDR keyboard shortcuts:

| Function | Key (Windows / Linux) | Key (macOS) |
|----------|----------------------|-------------|
| Move between data points | Arrow keys | Arrow keys |
| Switch layers (mixed or multi-series charts) | Page Up / Page Down | Page Up / Page Down |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |

For the full list, see the [Keyboard Controls](CONTROLS.md) reference.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
