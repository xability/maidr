# Tactile Graphics Display

A refreshable braille display renders a chart as braille *characters* — one cell
per data point, magnitude encoded in the dot pattern. See
[Braille Generation](BRAILLE.md) for that.

A **tactile graphics display** is a different device: it has a grid of pins that
the chart itself is drawn onto, plus a separate braille line for text. MAIDR
drives one over Bluetooth, scaling the chart's own SVG down onto the pins while
the braille panel is open.

Currently supported: **Dot Pad X** (Dot Inc.).

## Connecting

1. Open Settings and find **Tactile Graphics Display**.
2. Choose your device. MAIDR opens the browser's Bluetooth picker immediately.
3. Pick the display in the picker and pair it.

The status line under the picker reports what happened, and **Connect** retries
if the picker is dismissed or the pairing fails.

### Requirements

Bluetooth access is a browser capability MAIDR cannot supply on its own:

- **A Chromium browser.** Web Bluetooth is not implemented in Firefox or
  Safari.
- **A page permitted to use it.** Inside an iframe — which is how charts are
  embedded in notebooks — the frame needs `allow="bluetooth"`. A frame without
  it cannot reach the device however the page is served.
- **A click.** The browser only opens its picker while a user gesture is in
  progress, which is why connecting is a button in Settings and cannot happen
  automatically on load.

Where any of these is missing, MAIDR says so in the status line and the rest of
the chart works exactly as before.

### The SDK

MAIDR does not bundle the vendor's Bluetooth SDK; it discovers one the host page
provides, as `window.DotPadSDK` or through a module URL. Host pages that want
the feature load the SDK themselves.

## Using the display

Press <kbd>b</kbd> on the chart. The braille panel opens and, if a display is
connected, the chart appears on the pins at the same time. Pressing <kbd>b</kbd>
again lowers every pin.

**Marks are drawn as outlines; the mark you are focused on is filled.** That
split is what makes the picture readable — a field of solid shapes gives a
fingertip nothing to tell them apart, while one solid shape among hollow ones is
found at once. Arrow keys move the focus and the filled mark follows.

The plot's data region is drawn as a border, so there is something to orient
against when the view is zoomed into a corner.

Axis labels, tick labels and titles are deliberately **not** drawn. A tick label
is about one pin tall at this resolution, so drawing it produces noise that
reads as data. Text belongs on the braille line and in speech.

### Zooming

A whole chart scaled onto a few thousand pins can collapse neighbouring marks
into the same pin. Zooming spends the same pins on a smaller slice of the chart.

| Action   | Key                                    |
| -------- | -------------------------------------- |
| Zoom in  | <kbd>Ctrl</kbd> + <kbd>+</kbd>         |
| Zoom out | <kbd>Ctrl</kbd> + <kbd>-</kbd>         |

Both are live only while the braille panel is open. The numeric keypad's
<kbd>+</kbd> and <kbd>-</kbd> work too. Each change is announced with the new
zoom level and where in the chart the view now sits.

### Panning

Zooming in means the rest of the chart is off the pins, so the view pans — from
the device itself, without taking a hand off it:

| Action     | Device key           |
| ---------- | -------------------- |
| Pan left   | Panning Left         |
| Pan right  | Panning Right        |
| Pan up     | Function 1           |
| Pan down   | Function 4           |

Each step moves half a window, so some of what you were reading stays in view.
At an edge, MAIDR says there is no more chart that way rather than moving
silently.

Navigation also pans on its own, but only when it has to: if an arrow key takes
the focus off the visible window, the view recentres on it. A pan you chose
deliberately is left alone for as long as it still shows the mark you are on.

### The braille line

The device's braille text line shows the **values** of the focused point — the
main value, the cross value, and the third value where a chart has one — without
their axis labels.

The labels do not change as you navigate, so repeating them would spend most of
a twenty-cell line restating what you already know. Speech and the braille panel
carry the labels. When the values still overrun the line, the final cell shows
dots 7 and 8 to say the text continues.

MAIDR translates with its own uncontracted (grade 1) table rather than a
translation library, so the line keeps working with nothing else installed.

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
