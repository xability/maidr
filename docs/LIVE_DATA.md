# Live & Streaming Data

MAIDR supports realtime and streaming data updates, enabling accessible sonification and navigation of live-updating visualizations such as stock tickers, sensor dashboards, and live metrics.

Three capabilities work together:

| Capability | What it does |
| --- | --- |
| `setData` | Replaces **all** chart data at once (full refresh) |
| `appendData` | Appends a **single point** to a series (streaming) |
| Monitor mode (`M` key) | Auto-sonifies and announces newly appended points |

Data updates are applied **in place**: the user's current position, active modes (text, braille, sonification), and keyboard focus are all preserved while axes ranges, navigation, braille, and text descriptions reflect the new data immediately.

A complete runnable demo lives at [`examples/live-line.html`](https://github.com/xability/maidr/blob/main/examples/live-line.html).

## Enabling Live Mode

Add `live: true` to your top-level maidr object. Optionally set `maxWidth` to cap the number of visible points per series (a sliding window for streaming):

```javascript
var maidr = {
  id: 'live-sensor',
  title: 'Live Sensor Readings',
  live: true, // enable live mode (and the 'M' monitor key)
  maxWidth: 20, // optional: keep only the latest 20 points per series
  subplots: [[{
    layers: [{
      id: 'sensor-layer',
      type: 'line',
      axes: { x: { label: 'Tick' }, y: { label: 'Reading' } },
      data: [[
        { x: 0, y: 50 },
        { x: 1, y: 52 },
        { x: 2, y: 49 },
      ]],
    }],
  }]],
};
```

Static charts are completely unaffected: in-place updates are opt-in via `live: true`. On charts without the flag, `setData` / `appendData` still store the new data, but it is only picked up the next time the chart is activated (focused), and monitor mode is unavailable.

## Script-Tag API: `window.maidrLive`

When MAIDR is loaded via a `<script>` tag, the realtime API is available globally as `window.maidrLive`.

### `window.maidrLive.appendData(point, options?)`

Appends one data point to a chart layer. Returns `true` when the point was merged and the chart notified.

```javascript
// Stream a new point into the only chart on the page.
window.maidrLive.appendData({ x: 42, y: 3.14 });

// Target a specific chart, layer, and series (group).
window.maidrLive.appendData(
  { x: 42, y: 3.14 },
  { id: 'live-sensor', layerId: 'sensor-layer', groupIndex: 1 },
);
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | string | the only registered chart | Which chart to update. Required when multiple charts are on the page. |
| `layerId` | string | — | Target layer by id. Takes precedence over `layerIndex`. |
| `layerIndex` | number | `0` | Target layer by position within the subplot. |
| `groupIndex` | number | `0` | Series index for nested data (e.g. which line of a multiline chart). Passing the current group count starts a new series; appending into an empty layer (`data: []`) creates the first series automatically. |
| `subplotRow` / `subplotCol` | number | `0` / `0` | Target subplot in multi-panel figures. |

The shape of `point` matches the layer's data format (see the [Data Schema](SCHEMA.html)): `{ x, y }` for bar/line/scatter points, a full OHLC object for candlestick, and so on.

**Supported layer types:** any layer whose `data` is an array — bar, line (and multiline), scatter, histogram, candlestick, box, smooth, and segmented bar charts. Heatmaps (object-shaped data) do not support appending; use `setData` instead.

### `window.maidrLive.setData(maidr)`

Replaces all data for the chart identified by `maidr.id`. Use this for full refreshes or when the chart structure (e.g. number of points) changes wholesale:

```javascript
var updated = structuredClone(maidr);
updated.subplots[0][0].layers[0].data = [[
  { x: 100, y: 11 },
  { x: 101, y: 22 },
  { x: 102, y: 33 },
]];
window.maidrLive.setData(updated);
```

If the figure keeps the same shape (same subplot grid and layer counts), the user's position is preserved and clamped into the new data bounds. If the shape changes, navigation resets to the initial state.

### Complete streaming example

```html
<!doctype html>
<html lang="en">
  <head>
    <script src="maidr.js"></script>
    <script>
      var maidr = {
        id: 'live-sensor',
        title: 'Live Sensor Readings',
        live: true,
        maxWidth: 20,
        subplots: [[{
          layers: [{
            id: 'sensor-layer',
            type: 'line',
            axes: { x: { label: 'Tick' }, y: { label: 'Reading' } },
            data: [[{ x: 0, y: 50 }]],
          }],
        }]],
      };
    </script>
  </head>
  <body>
    <svg id="live-sensor" width="640" height="320"><!-- your chart --></svg>
    <script>
      let tick = 0;
      setInterval(() => {
        tick += 1;
        const point = { x: tick, y: 30 + Math.random() * 40 };
        // 1. Redraw your SVG however your charting code does it.
        // 2. Push the same point into MAIDR:
        window.maidrLive.appendData(point, { id: 'live-sensor' });
      }, 1000);
    </script>
  </body>
</html>
```

## React API

React consumers have two equivalent paths.

### 1. Update the `data` prop (declarative)

For charts with `live: true`, passing a new `data` prop replaces the chart data in place — the React-idiomatic equivalent of `setData`:

```tsx
import { Maidr, type MaidrData } from 'maidr/react';
import { useEffect, useState } from 'react';

function LiveChart() {
  const [data, setData] = useState<MaidrData>(initialData); // live: true

  useEffect(() => {
    const socket = connectToSensor();
    socket.onReading = (reading) => {
      setData(prev => appendReading(prev, reading)); // produce a new object
    };
    return () => socket.close();
  }, []);

  return (
    <Maidr data={data}>
      <MyChartSvg data={data} />
    </Maidr>
  );
}
```

For static charts (no `live` flag), prop changes keep the existing behavior: the new data is picked up the next time the chart is focused.

### 2. Imperative helpers (streaming)

`setMaidrData` and `appendMaidrData` mirror the script-tag API. Prefer `appendMaidrData` for streaming: it applies the `maxWidth` sliding window automatically, whereas prop updates and `setMaidrData` replace data verbatim:

```tsx
import { appendMaidrData, setMaidrData } from 'maidr/react';

// Stream a point into the chart with id 'live-sensor'.
appendMaidrData({ x: Date.now(), y: reading }, { id: 'live-sensor' });

// Replace everything.
setMaidrData(updatedMaidrJson);
```

## Monitor Mode

On live charts (`live: true`), pressing **M** toggles **monitor mode**. While monitoring is on:

- Every newly appended data point is **automatically sonified** (a tone at the point's pitch) and **announced** to screen readers (e.g. "Tick is 42, Reading is 3.14").
- The user's current position **does not move** — they can keep exploring historical data while hearing new points arrive, then jump to the live edge with `Ctrl/Cmd + Right Arrow`.
- Toggling announces "Monitoring on" / "Monitoring off". On non-live charts, pressing M explains that monitoring is only available for live charts.

| Function | Key (Windows) | Key (Mac) |
| --- | --- | --- |
| Toggle Monitor Mode (live charts) | M | M |

## Sliding Window (`maxWidth`)

For unbounded streams, set `maxWidth` on the top-level maidr object. When an `appendData` call pushes a series past `maxWidth` points, the oldest points are dropped:

- The window applies **per series** (each line of a multiline chart is capped independently).
- If the user is positioned inside the trimmed series, their cursor follows the **same data point** as it shifts left (until it falls out of the window, in which case it clamps to the oldest visible point).
- `setData` is not affected by `maxWidth`; it replaces data verbatim.

## Behavior Details

- **Silent updates:** a data update by itself never speaks or plays audio — only monitor mode produces output, and only for appended points. This keeps screen reader users in control.
- **Position preservation:** updates restore the user's subplot, layer, and point position, clamped into the new data's bounds.
- **Modes:** text, braille, sonification, and review modes stay enabled across updates. Braille content refreshes on the next navigation.
- **Visual highlight:** highlights re-bind on each update by re-querying the layer's `selectors`. The selectors must remain *stable across re-renders* — if your charting library regenerates elements with different classes or ids each frame (common with keyed D3/Vega re-renders), pin a stable class on the data elements and use that in `selectors`. When the selector matches a different number of elements than data points, highlighting is disabled for that update (everything else keeps working).
- **Performance:** each update rebuilds the chart model from the full data, so the cost scales with total chart size, not with the size of the appended point. For streams faster than a few updates per second, set `maxWidth` — it bounds the data (and therefore the per-update cost) regardless of how long the stream runs.
- **AI chat:** chart descriptions and the AI assistant use the latest data as of the question being asked.

## Keyboard Controls

See the full [Keyboard Controls](CONTROLS.html) reference. Keys most relevant to live charts:

| Function | Key |
| --- | --- |
| Toggle Monitor Mode | M |
| Jump to newest point | Ctrl/Cmd + Right Arrow |
| Replay current point | Space |
| Toggle Sonification | S |
| Toggle Text mode | T |
| Toggle Braille mode | B |
