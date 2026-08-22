# Tactile Graphics Display

A refreshable braille display renders a chart as braille *characters* — one cell
per data point, magnitude encoded in the dot pattern. See
[Braille Generation](BRAILLE.md) for that.

A **tactile graphics display** is a different device: it has a grid of pins that
the chart itself is drawn onto, plus a separate braille line for text. MAIDR
drives one over Bluetooth or USB, scaling the chart's own SVG down onto the
pins while the braille panel is open.

Currently supported: **Dot Pad X** (Dot Inc.).

## Connecting

1. Open Settings and find **Tactile Graphics Display**.
2. Choose your device. MAIDR opens the browser's Bluetooth picker immediately.
3. Pick the display in the picker and pair it.

For a cabled display, use **Connect over USB** instead; either button works at
any time. The status line reports what happened and which way you are
connected, and both buttons retry if a picker is dismissed or a connection
fails.

### Bluetooth or USB

Both work. They differ in ways worth knowing:

|                | Bluetooth              | USB                          |
| -------------- | ---------------------- | ---------------------------- |
| Speed          | A full frame costs a second or more | Considerably faster |
| Setup          | Pairs once, then wireless | Plug in; no pairing        |
| Power          | The display runs on battery | Powered over the cable  |
| Android        | Works                  | Web Serial does not exist there |

If arrow-key navigation feels like it lags behind your fingers, the cable is
the fix — the pin refresh is the bottleneck, and Bluetooth has the least
headroom above it.

### Requirements

Reaching the device at all is a browser capability MAIDR cannot supply on its
own:

- **A Chromium browser.** Neither Web Bluetooth nor Web Serial is implemented
  in Firefox or Safari.
- **A page permitted to use it.** Inside an iframe — which is how charts are
  embedded in notebooks — the frame needs `allow="bluetooth"` for the wireless
  path and `allow="serial"` for the cabled one. A frame without them cannot
  reach the device however the page is served. The two are gated separately, so
  a page may permit one and not the other; MAIDR greys out whichever button
  cannot work rather than letting you press it and fail.
- **A click.** The browser only opens its picker while a user gesture is in
  progress, which is why connecting is a button in Settings and cannot happen
  automatically on load.

Where any of these is missing, MAIDR says so in the status line and the rest of
the chart works exactly as before.

### The SDK

MAIDR does not bundle the vendor's SDK — it ships without a licence permitting
redistribution. Instead MAIDR loads it from the copy Dot Inc. publish
themselves, pinned by commit so the bytes cannot change under a release.

A host page that would rather serve its own copy — an air-gapped deployment, or
one whose Content-Security-Policy admits no third-party origin — can point
MAIDR at it, or expose the SDK as `window.DotPadSDK`, and nothing is fetched:

```js
dotPadSession.setModuleUrl('/vendor/DotPadSDK-3.0.2.js');
dotPadSession.setAssetBaseUrl('/vendor/lib/');
```

## Using the display

Press <kbd>b</kbd> on the chart. The braille panel opens and, if a display is
connected, the chart appears on the pins at the same time. Pressing <kbd>b</kbd>
again lowers every pin.

**Marks are drawn as outlines; the mark you are focused on is filled.** That
split is what makes the picture readable — a field of solid shapes gives a
fingertip nothing to tell them apart, while one solid shape among hollow ones is
found at once. Arrow keys move the focus and the filled mark follows.

**Nothing else is drawn.** No frame around the plot, no axis lines, no tick
marks, no titles or labels — only the data. Two reasons. A tick mark is a pin or
two long here, the same size as a small mark, so a row of them reads as a row of
data that is not there. And every pin spent on furniture is a pin the chart is
not using: a border alone costs two whole rows and two whole columns of a grid
that has forty of one and sixty of the other.

So the marks get the whole grid. Their own extent is what is scaled onto the
pins, edge to edge — not the plot region, which would leave the display with a
margin sized by however long the axis labels happened to be.

What the axes mean belongs on the braille line and in speech, where it can be
read rather than guessed at from a shape a fingertip cannot resolve.

### Layers

A subplot with several layers puts **one layer on the pins at a time** — the
one you are navigating. <kbd>Page Up</kbd> and <kbd>Page Down</kbd> change it,
and the picture changes with it. Two series overlaid on sixty pins land on each
other and read as neither.

The view does not rescale when you switch. It is sized to every layer in the
subplot, so the marks move and nothing else does — a series running 0 to 2 stays
visibly shorter than one running 0 to 20, which is most of what there is to
compare between them.

### Zooming

A whole chart scaled onto a few thousand pins can collapse neighbouring marks
into the same pin. Zooming spends the same pins on a smaller slice of the chart.

| Action   | Key                                    |
| -------- | -------------------------------------- |
| Zoom in  | <kbd>Ctrl</kbd> + <kbd>+</kbd>         |
| Zoom out | <kbd>Ctrl</kbd> + <kbd>-</kbd>         |

Both are live only while the braille panel is open. The numeric keypad's
<kbd>+</kbd> and <kbd>-</kbd> work too. Each change is announced with the new
zoom level and where in the chart the view now sits — with nothing on the grid
but marks, there is no border left to say which slice you are on.

### Panning

Zooming in means the rest of the chart is off the pins, so the view pans — from
the device itself, without taking a hand off it:

| Action     | Device key           |
| ---------- | -------------------- |
| Pan left   | Panning Left         |
| Pan right  | Panning Right        |
| Pan up     | Function 2           |
| Pan down   | Function 3           |

Each step moves half a window, so some of what you were reading stays in view.
At an edge, MAIDR says there is no more chart that way rather than moving
silently.

The two inner function keys move the picture and the two outer ones move the
braille line below it, so the two things you scroll never take each other's
keys.

Navigation also pans on its own, but only when it has to: if an arrow key takes
the focus off the visible window, the view recentres on it. A pan you chose
deliberately is left alone for as long as it still shows the mark you are on.

### The braille line

The device's braille text line carries the **description of the focused point** —
the same one review mode (<kbd>R</kbd>) reads out, verbatim. There is one
account of where you are, whether you hear it, read it in review, or meet it
under your fingers.

That description runs well past twenty cells, so the line scrolls:

| Action              | Device key  |
| ------------------- | ----------- |
| Back along the line | Function 1  |
| On along the line   | Function 4  |

When more text follows, the final cell shows dots 7 and 8. MAIDR announces
which part of the line you are on, and says so rather than moving silently when
you reach either end. Moving to another data point returns the line to its
start, since it now describes something else.

### Contracted braille

The line is translated into **UEB grade 2** by the device SDK's own braille
engine. On twenty cells the contractions are not a nicety — they are most of
the difference between a value fitting and having to be panned for.

The engine (liblouis) is fetched alongside the SDK rather than bundled; it is
about 14 MB, which a single inlined bundle cannot carry. It downloads once and
is then cached by the browser.

Where it cannot be reached — no network, a Content-Security-Policy that blocks
it, an older SDK build without the translation surface — MAIDR falls back to
its own uncontracted (grade 1) table. That is worse to read, but the line never
goes blank for want of a translator.

## What the display does not show

- **Charts with no SVG.** Canvas- and WebGL-rendered charts have no shapes to
  scale down.
- **Charts in a cross-origin frame.** Their geometry cannot be measured.

In these cases the braille panel behaves normally and the pins stay down.

## Notes for other devices

Nothing in MAIDR hardcodes a pin count. Every device reports its own cell rows,
cell columns and braille-line width when it connects, and MAIDR sizes the
rendering to what it is told — including devices with no braille line at all,
which simply get the graphic area.
