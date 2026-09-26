# TradingView Lightweight Charts Integration

MAIDR ships a binder for [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/), the canvas chart library behind many brokerage, exchange and fintech price charts. `bindLightweightChart(chart)` reads a chart's panes and series through the library's public API, mounts MAIDR around it, and adds audio sonification, text descriptions, braille output, keyboard navigation and a **visual highlight** on the reader's bar. It then follows the chart as it streams: every `series.update(...)` and `series.setData(...)` reaches MAIDR on its own, and a new bar is announced in [monitor mode](LIVE_DATA.md#monitor-mode).

> **Note:** Lightweight Charts is **not** bundled with MAIDR — load it yourself. The adapter targets **Lightweight Charts v5** (`chart.addSeries(...)`, panes). The MAIDR adapter ships as a UMD bundle (`dist/lightweight-charts.js`, exposing the `maidrLightweightCharts` global for plain `<script>` tags) and an ES module (`dist/lightweight-charts.mjs`, for bundlers via `import 'maidr/lightweight-charts'`).

## Quick Start

Load Lightweight Charts and the MAIDR adapter, draw the chart as usual, then bind MAIDR once the series have data:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>ACME daily prices</title>
    <!-- 1. Load Lightweight Charts v5 -->
    <script src="https://cdn.jsdelivr.net/npm/lightweight-charts@5/dist/lightweight-charts.standalone.production.js"></script>
    <!-- 2. Load the MAIDR Lightweight Charts adapter (UMD; bundles MAIDR + React) -->
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/lightweight-charts.js"></script>
  </head>
  <body>
    <div id="chart" style="width: 720px; height: 460px"></div>

    <script>
      // 3. Build the chart
      const chart = LightweightCharts.createChart(document.getElementById('chart'));
      const candles = chart.addSeries(LightweightCharts.CandlestickSeries, { title: 'ACME' });
      const volume = chart.addSeries(
        LightweightCharts.HistogramSeries,
        { title: 'Volume', priceFormat: { type: 'volume' } },
        1, // a second pane, below the prices
      );
      candles.setData([
        { time: '2025-01-02', open: 100, high: 101.84, low: 97.5, close: 98.08 },
        { time: '2025-01-03', open: 98.08, high: 100.15, low: 97.9, close: 99.08 },
        { time: '2025-01-06', open: 99.08, high: 102.4, low: 98.7, close: 101.9 },
      ]);
      volume.setData([
        { time: '2025-01-02', value: 1052661 },
        { time: '2025-01-03', value: 1330214 },
        { time: '2025-01-06', value: 987450 },
      ]);

      // 4. Bind MAIDR
      const binding = maidrLightweightCharts.bindLightweightChart(chart, {
        title: 'ACME daily prices',
        axes: { x: 'Date' },
      });
    </script>
  </body>
</html>
```

Click the chart or Tab to it, then use the arrow keys. Runnable pages: [`examples/lightweight-charts.html`](https://github.com/xability/maidr/blob/main/examples/lightweight-charts.html) (candlesticks, a moving average and volume in two panes) and [`examples/lightweight-charts-live.html`](https://github.com/xability/maidr/blob/main/examples/lightweight-charts-live.html) (a simulated live feed).

## How It Works

Everything is read off the chart's public API — `chart.panes()`, `pane.getSeries()`, `series.seriesType()`, `series.options()` and `series.data()` — so no data is scraped from the canvas and nothing has to be declared twice.

- **Panes become subplots.** A chart with a price pane and a volume pane is a two-subplot figure. As in every MAIDR multi-panel figure, the reader starts on the figure, moves between panes with the arrow keys (Up is the pane above), and presses **Enter** to go into one. Subplots are numbered from the bottom pane up.
- **Series become layers.** A candlestick series with a moving average drawn over it is one subplot with two layers; **Page Up / Page Down** switch between them, keeping the reader on the same date.
- **Times become labels.** A business day or a `yyyy-mm-dd` string is announced as written. A timestamp is announced as its UTC date — with the time of day as well once any bar on the chart falls other than at midnight, so every layer spells the same bar the same way. Pass `formatTime` to announce times your own way.
- **Series titles become names.** A series' `title` option names its layer and labels its value axis ("close ACME is 98.08"). A series without one falls back to the `axes.y` option, then to `Price` (candlestick and OHLC bars) or `Value`.
- **Price formats carry over.** A series' `priceFormat` of type `price` announces values with its `precision`. Volume and percentage values are announced as they are.

Hidden series (`visible: false`), custom series, and series with no data yet are left out; a pane with none of the others left is left out too.

### Visual Highlighting

Lightweight Charts draws onto canvases, so there is no element per bar for MAIDR's usual SVG highlight. The binder draws a box over the chart at the reader's bar instead, placed with the chart's own coordinate API (`timeScale().timeToCoordinate()` and `series.priceToCoordinate()`): around the full high–low range of a candle, from a histogram bar's value to its base, and around a line's point. It follows the chart as it is scrolled, zoomed or resized, as panes are resized or a price scale is stretched, and as new bars push the reader's bar along; a bar scrolled out of view has no box, and the box goes when focus leaves the chart. It uses MAIDR's highlight color setting unless `highlightColor` is given, and `highlight: false` turns it off.

## Supported Chart Types

| Series type | Lightweight Charts definition | MAIDR layer |
|-------------|-------------------------------|-------------|
| Candlestick | `CandlestickSeries` | `candlestick` |
| OHLC Bar | `BarSeries` | `candlestick` |
| Line | `LineSeries` | `line` |
| Area | `AreaSeries` | `line` |
| Baseline | `BaselineSeries` | `line` |
| Histogram | `HistogramSeries` | `bar` |

A candle is read section by section, as every MAIDR candlestick is: Up and Down move through its open, high, low and close, and its trend, body shape and patterns with its neighbours are announced along the way. Whitespace items (a `time` with no `value`), which the chart leaves blank, are not in the series' data, so the reader moves from the bar before a gap to the bar after it; the time announced says how far it jumped.

## Live and Streaming Data

The binding subscribes to every series' data changes, so a streaming page needs no MAIDR calls of its own — only the Lightweight Charts calls it already makes:

```js
socket.onmessage = (event) => {
  const tick = JSON.parse(event.data);
  candles.update({ time: tick.minute, open: tick.open, high: tick.high, low: tick.low, close: tick.close });
  volume.update({ time: tick.minute, value: tick.volume });
};
```

How each change reaches MAIDR:

| What the chart did | What MAIDR does |
|--------------------|-----------------|
| `update()` with a **new time** — a bar added at the end | Appends it. In monitor mode (**M**) the new bar is sonified and announced — a candle at its close — while the reader stays where they are. |
| `update()` with the **last bar's time** — the forming bar revised | Replaces the figure silently, keeping the reader's place. |
| `setData()` — a history load or reload | Replaces the figure silently, keeping the reader's place where the figure's shape allows. |

Changes made together — a candle and its volume bar from one socket message — are read once, at the end of the task that made them. A message that closes the last bar and opens the next one still has the new bar announced: the closing values are applied silently first. Changes made before MAIDR has finished mounting — in the same task as the binding, say — are applied once it has. Only the focused layer's new bar is announced, so on a price-and-volume chart the reader monitors whichever pane they are in. **Ctrl/Cmd + Right Arrow** jumps to the newest bar.

`bindLightweightChart` marks the figure `live`, which is what enables monitor mode; pass `live: false` to turn it off. For a long-running feed, set `maxWidth` to keep MAIDR's copy to the newest bars of each series (the chart itself keeps whatever you give it):

```js
maidrLightweightCharts.bindLightweightChart(chart, { title: 'XYZ live', maxWidth: 500 });
```

The chart reports no event when a series or pane is added or removed; call `binding.refresh()` after changing them. A series that exists at bind time but has no data yet is followed, and joins the figure when its first bars arrive.

See [Live & Streaming Data](LIVE_DATA.md) for monitor mode and the sliding window in full.

## Code Examples

Each example assumes `chart` was made with `LightweightCharts.createChart(...)` and binds with `maidrLightweightCharts.bindLightweightChart(chart, options)`.

### Candlestick

```js
const candles = chart.addSeries(LightweightCharts.CandlestickSeries, { title: 'ACME' });
candles.setData(ohlcRows); // { time, open, high, low, close }
maidrLightweightCharts.bindLightweightChart(chart, { title: 'ACME daily prices', axes: { x: 'Date' } });
```

### OHLC Bar

```js
const bars = chart.addSeries(LightweightCharts.BarSeries, { title: 'ACME' });
bars.setData(ohlcRows);
maidrLightweightCharts.bindLightweightChart(chart, { title: 'ACME daily prices' });
```

### Line

```js
const line = chart.addSeries(LightweightCharts.LineSeries, { title: 'Yield', priceFormat: { type: 'price', precision: 3 } });
line.setData([{ time: '2025-01-02', value: 4.571 }, { time: '2025-01-03', value: 4.602 }]);
maidrLightweightCharts.bindLightweightChart(chart, { title: '10-year Treasury yield' });
```

### Area

```js
const area = chart.addSeries(LightweightCharts.AreaSeries, { title: 'Equity' });
area.setData(equityCurve); // { time, value }
maidrLightweightCharts.bindLightweightChart(chart, { title: 'Account equity' });
```

### Baseline

```js
const baseline = chart.addSeries(LightweightCharts.BaselineSeries, {
  title: 'P&L',
  baseValue: { type: 'price', price: 0 },
});
baseline.setData(dailyPnl); // { time, value }
maidrLightweightCharts.bindLightweightChart(chart, { title: 'Daily profit and loss' });
```

### Histogram

```js
const volume = chart.addSeries(LightweightCharts.HistogramSeries, {
  title: 'Volume',
  priceFormat: { type: 'volume' },
});
volume.setData(volumeRows); // { time, value, color? }
maidrLightweightCharts.bindLightweightChart(chart, { title: 'ACME daily volume' });
```

### Price, Moving Average and Volume Panes

```js
const candles = chart.addSeries(LightweightCharts.CandlestickSeries, { title: 'ACME' });
const average = chart.addSeries(LightweightCharts.LineSeries, { title: '10-day average' });
const volume = chart.addSeries(LightweightCharts.HistogramSeries, { title: 'Volume', priceFormat: { type: 'volume' } }, 1);
candles.setData(ohlcRows);
average.setData(movingAverage);
volume.setData(volumeRows);

// Two subplots: the volume pane, and the price pane with two layers.
maidrLightweightCharts.bindLightweightChart(chart, { title: 'ACME daily prices', axes: { x: 'Date' } });
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `id` | container `id`, else generated | The MAIDR figure id; unique on the page. |
| `title`, `subtitle`, `caption` | — | Announced when the chart is focused. |
| `axes.x` | `Time` | Label of the time axis. |
| `axes.y` | per series | Value label for series without a `title`. |
| `formatTime` | see [How It Works](#how-it-works) | `(time) => string` for the announced time labels. |
| `live` | `true` | Enables monitor mode and in-place updates. |
| `maxWidth` | — | Keep only the newest N bars of each series in MAIDR. |
| `highlight` | `true` | Draw the highlight box over the canvas. |
| `highlightColor` | MAIDR setting | Color of the highlight box. |

`bindLightweightChart` returns `{ maidr, refresh(), dispose() }`: `maidr` is the figure as it stands after the latest change, `refresh()` re-reads the chart after series or panes are added or removed, and `dispose()` unsubscribes, unmounts MAIDR and puts the chart's container back where it was.

The binder wraps the chart's container in a box of the size it has when bound; give the container a fixed size, as in the examples.

For the data-only path, `fromLightweightChart(chart, options?)` returns MAIDR JSON for the `maidr` attribute or `<Maidr data={...}>`: audio, text and braille, but no highlight and no live sync.

## Keyboard Controls

Once a chart is focused, use the standard MAIDR shortcuts:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between bars | Left / Right Arrow | Left / Right Arrow |
| Move through a candle's open, high, low and close | Up / Down Arrow | Up / Down Arrow |
| Move between panes, go into one | Arrow keys, Enter | Arrow keys, Enter |
| Move between layers | Page Up / Page Down | Page Up / Page Down |
| Jump to the newest bar | Ctrl + Right Arrow | Cmd + Right Arrow |
| Toggle Monitor Mode | M | M |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |

For the full list, see the [Keyboard Controls](CONTROLS.md) reference.

## npm Installation (Optional)

For bundler-based projects:

```bash
npm install maidr lightweight-charts
```

```ts
import { CandlestickSeries, createChart } from 'lightweight-charts';
import { bindLightweightChart } from 'maidr/lightweight-charts';

const chart = createChart(document.getElementById('chart')!);
const candles = chart.addSeries(CandlestickSeries, { title: 'ACME' });
candles.setData(rows);

const binding = bindLightweightChart(chart, { title: 'ACME daily prices' });
// later: binding.dispose();
```

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
