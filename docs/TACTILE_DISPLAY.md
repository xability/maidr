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

### Several charts on one page

A notebook puts every chart in its own frame, and a connected device belongs to
one frame at a time — a live Bluetooth or serial handle cannot be passed between
them. The *permission* is not frame-bound, though: it belongs to the page. So
you pick your device once, and from then on every other chart takes it up
silently as you open its braille panel, with no picker and nothing to press.

A chart hands the device back when you close its braille panel, which is what
lets the next one take it. A connection you made yourself with the Connect
buttons stays where you made it — only a silently adopted one is handed on.

Two charts both holding their braille panels open is the one case this does not
cover: the first keeps the device. Close its panel and the other takes it.

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
one whose Content-Security-Policy admits no third-party origin — points MAIDR at
it before MAIDR loads, and nothing is fetched:

```html
<script>
  window.MAIDR_DOTPAD_SDK_URL = '/vendor/DotPadSDK-3.0.2.js';
  window.MAIDR_DOTPAD_ASSET_BASE_URL = '/vendor/lib/';
</script>
```

Setting the SDK URL and not the asset one leaves the braille engine unfetched
rather than reaching for the CDN: a page that serves its own SDK usually does so
because of a policy that would refuse the CDN too, and the line falls back to
uncontracted braille instead of failing. A page that already has the SDK loaded
can expose it as `window.DotPadSDK` and skip the import entirely.

The pin is a commit, not a digest. It means the bytes at that URL cannot change
under a release — it is not a runtime integrity check, which a dynamic `import()`
cannot carry.

## Using the display

Press <kbd>b</kbd> on the chart. The braille panel opens and, if a display is
connected, the chart appears on the pins at the same time. Pressing <kbd>b</kbd>
again lowers every pin.

<kbd>b</kbd> raises the pins **even where braille itself cannot open** — in a
multi-panel figure's lobby, and on the plot types with no braille table
(scatter, manhattan, volcano). Only braille needs the data reduced to cells; a
tactile display draws the chart's own geometry. A scatter is the chart a pin
grid draws best of all — a cloud of points is what the grid natively *is* — so
those are the last cases that should be missing from it. In those places the
braille panel stays shut and the pins come up on their own.

**Marks are drawn as outlines; the mark you are focused on is filled.** That
split is what makes the picture readable — a field of solid shapes gives a
fingertip nothing to tell them apart, while one solid shape among hollow ones is
found at once. Arrow keys move the focus and the filled mark follows.

Two things a mark's shape decides for it:

- **A line, a curve, a whisker or an error bar has no interior to fill.** The
  focused one is drawn with a heavier stroke instead. Without that, a reader on
  a line chart had no tactile answer at all to which point they were on.
- **A mark that has run off the grid is outlined rather than filled.** What
  counts is whether its boundary is still reachable — not how much of the
  display it covers. A bar at rest reaches nearly the full height and is filled,
  because you can still find its top and bottom. The same bar zoomed into has
  both of those past the edge, and filling it would leave you inside a shape
  with nothing to feel, so its sides are drawn instead. The mark you are on can
  therefore feel solid at one zoom level and hollow at the next: that change is
  itself the signal that you have gone inside it.
- **A focused point is drawn as a small disc.** A point has nothing to fill and
  nothing to thicken; a heavier stroke on one just makes the line it sits on
  locally fatter, which is not something a finger reads as a separate thing.

If a zoom or a pan leaves the window somewhere with nothing in it, the
announcement says *"nothing is in view"*. Every pin down is also what a
disconnected display feels like, so silence there would leave you unable to tell
an empty patch of chart from a dead device.

**Where a chart is read by its shape, its proportions are kept.** A pie, a
radar, a chord ring, a sunburst, a hexbin, a map: stretching one of these to
fill the grid does not blur it, it misreports it. A circle arriving as a 1.5:1
ellipse makes a wedge at the top subtend a different arc from the same wedge at
the side, so you would conclude one slice is bigger when the data says they are
equal — and the round silhouette that says "pie" at all is gone with it. Those
charts are letterboxed; every other chart still spends every pin, because a bar
chart's shape carries nothing and losing rows to a margin would cost you
comparisons between bar heights.

**Where a chart put its value in a colour, the pins carry it as texture.** A
heatmap, a choropleth, a hexbin, a mosaic: every cell is the same size and
shape, so the shape that reaches the pins is a lattice and the numbers are all
in the colour. Those marks are filled with a texture instead of left hollow —
the darker the cell, the more crowded it feels, so a sighted colleague and a
blind reader describe the same chart the same way. It is coarse; a fingertip
separates perhaps four levels. Four levels is the difference between reading a
heatmap and reading graph paper.

Only those charts. A bar's colour is its series, not its height; a pie's colour
names the slice while the value is the angle; a treemap's is decoration over an
area that already says everything. Those keep their hollow outlines. Which is
which is settled by the kind of chart, not guessed from the colours — a
qualitative palette is chosen to be *maximally* distinguishable, so counting
distinct shades would read a ten-colour pie as a scale and a two-value heatmap
as decoration, which is backwards in both directions.

The same principle bounds the fill: a mark that covers the whole grid is
outlined rather than filled even when none of its edges have left it, because
filling it would raise every pin and leave nothing to feel but the edge of the
device.

A candlestick is the one chart where a hollow mark and a solid one mean
different things, so its bodies keep that difference: the ones the chart drew
solid come back as a **half-density texture**, the hollow ones as outlines. Half
and not more, because the focused mark is the only solid thing on the display
and has to stay the only one — a texture at four fifths reads as a filled mark
with a blemish and the reader loses where they are standing. Which group is
which comes from the chart rather than from a convention: the lightest body is
taken as the hollow one, and everything meaningfully darker is one the chart
filled, so black-against-white and red-against-green both work and neither needs
an agreement about which colour means falling. A body the chart left unpainted
counts as the lightest thing there is, because what shows through it is the
panel — that is the hollow-candle convention, where the rising bodies carry
`fill: none` and only the falling ones are painted. Wicks are left out of the
comparison: they arrive in the same list and are always unpainted, being lines,
so counting them as hollow bodies would put one in every chart. Bodies all
painted alike are left hollow — there is no direction being drawn then.

Ordinary strokes are two pins across, not one. A single-pin diagonal steps in
pins that touch only at their corners, so a finger sweeping across it meets a
row of separate bumps rather than a line, and loses the trail on any drift.
Closed outlines stay at one pin — thickening those would fill in the very
interior that tells a hollow mark from a solid one.

**Nothing else is drawn.** No frame around the plot, no axis lines, no tick
marks, no titles or labels — only the data. Two reasons. A tick mark is a pin or
two long here, the same size as a small mark, so a row of them reads as a row of
data that is not there. And every pin spent on furniture is a pin the chart is
not using: a border alone costs two whole rows and two whole columns of a grid
that has forty of one and sixty of the other.

So the marks get the whole grid — their own extent is what is scaled onto the
pins, not the plot region, which would leave the display with a margin sized by
however long the axis labels happened to be.

The chart usually says which of its shapes are the data, and where it does that
list is taken at its word. Where it does not — a trace authored without
selectors — the subtree is sifted instead, and the sifting is where furniture
has to be recognised rather than simply skipped. Names carry most of it: the
libraries label their ticks, grids, spines, legends and lettering, and those
words are matched whole, so `candlestick` stays data. Two things names cannot
reach:

- **Lettering that is not spelt as text.** matplotlib draws every glyph as a
  reference to a cached outline, so a tick label is a group of `use` elements
  and passes any test made on the tag. A scatter plot arrived with sixty-four
  of them on the pins — the labels and the title, each glyph the size of a mark.
  The group they sit in is what gets matched.
- **The panel itself.** A chart that has been through MAIDR has had its groups
  renamed for selector use, taking matplotlib's `patch_1` with it, so the plot
  background and the four spines arrive anonymous. They are recognised by shape
  instead: a shape that covers the whole extent, or a hairline lying along one
  of its edges, is the box the chart is drawn in rather than something drawn in
  the box. On the scatter plot that band cost 560 of the 1023 raised pins and
  squeezed every point into what was left.

Never at the cost of the last shape, though. A chart drawn as a single mark
spans its own extent by definition, so the sift keeps everything rather than
send a blank frame — which is the one thing a reader cannot tell from a display
that is switched off.

One pin is kept clear around the edge, and only one. Without it a mark on the
boundary sits on the outermost pin row, where three things go wrong at once: a
bar's baseline falls off the grid so its outline never closes and it reads as an
open channel; a curve touching the top cannot be told from one the grid cut off,
so a real maximum and a truncated one feel the same; and a mark lying along an
edge is felt as the frame of the device rather than as data. One pin costs 5% of
the height and buys the difference between a closed shape and an open one.

What the axes mean belongs on the braille line and in speech, where it can be
read rather than guessed at from a shape a fingertip cannot resolve.

**A line is drawn as a line**, not as the points along it. MAIDR makes a
highlight marker per data point out of the rendered path, and those markers are
what the focus moves between — but the shape that reaches the pins is the path
itself, so the series stays continuous under a finger at any zoom. Where a
chart library draws its own dot per point and the connecting line separately
(Recharts and the like), the dots are what MAIDR resolved and the dots are what
you feel.

### Layers

A subplot with several layers puts **one layer on the pins at a time** — the
one you are navigating. <kbd>Page Up</kbd> and <kbd>Page Down</kbd> change it,
and the picture changes with it. Two series overlaid on sixty pins land on each
other and read as neither.

The view does not rescale when you switch. It is sized to every layer in the
subplot, so the marks move and nothing else does — a series running 0 to 2 stays
visibly shorter than one running 0 to 20, which is most of what there is to
compare between them.

### Multi-panel plots

A figure with several panels opens at a lobby, where the arrow keys move
between panels rather than between data points. The pins follow: each panel you
move onto is drawn as you reach it, so you can feel the shape of each one before
choosing which to enter.

Nothing is filled there, because nothing inside a panel is focused yet — the
solid mark appears once you enter and start moving through the data.

### Zooming

A whole chart scaled onto a few thousand pins can collapse neighbouring marks
into the same pin. Zooming spends the same pins on a smaller slice of the chart.

| Action   | Key            |
| -------- | -------------- |
| Zoom in  | <kbd>=</kbd>   |
| Zoom out | <kbd>-</kbd>   |

Plain keys, not <kbd>Ctrl</kbd> chords, on purpose: <kbd>Ctrl</kbd> + <kbd>+</kbd>
is the browser's own page zoom, and the reader most likely to want it is a
low-vision reader — who is also the one most likely to have the braille panel
open. So the two zooms stay on separate keys and you can enlarge the page and
the pin view independently.

Zoom in is <kbd>=</kbd> rather than <kbd>+</kbd> — the same key, without the
shift. <kbd>Shift</kbd> + <kbd>=</kbd> works too, for anyone reaching for the
<kbd>+</kbd> printed on the keycap.

Both are live wherever the display can be, not only while the braille panel is
open — braille cannot open on every plot type, and leaving these keys in
braille's scope alone left the zoom dead on exactly the charts the display had
just been unlocked for. They only zoom when a display is connected — with none, they say so rather than doing nothing. The
numeric keypad's <kbd>+</kbd> and <kbd>-</kbd> work too. Each change is
announced with the new zoom level and where in the chart the view now sits —
with nothing on the grid but marks, there is no border left to say which slice
you are on.

Zooming closes in on **the mark you are on**, not on the middle of the chart.
That is the mark you asked to feel more closely, and after a step or two the
middle of a chart is usually a patch with nothing in it — so holding the view
there would hand you blank pins and no account of why.

Zooming out to where you started gives back the picture you started with,
pin for pin. That is worth stating because it did not always hold. Only the
rows that change are transmitted, so each frame is a difference against the
one before it — which is correct exactly while the device received everything
sent to it. A zoom step sends a whole frame, and a whole frame costs the
device a second or more, so stepping in and back out in quick succession is
the heaviest burst maidr produces. If one of those writes was refused, the
rows it carried kept whatever they held; every later frame was a difference
against what had been *sent* rather than what had *arrived*, so those rows
were never named again and the display stayed wrong in a few places. Coming
back to where you started made it worse rather than better: that frame is
identical to the one maidr believed was already displayed, so it was skipped
entirely.

A refused write is now noticed. maidr forgets what it thought the device was
showing, which makes the next write a whole frame — true whatever the device
is actually holding — and sends one straight away rather than waiting for you
to press something. If the device is not accepting writes at all it stops
after a couple of attempts and tries again the next time you move, so a
disconnected display does not turn into a stream of retries.

### Several lines at once

An open stroke — a line, a curve, a whisker — is drawn two pins across rather
than one. A single pin is at the floor of what a fingertip resolves and a
diagonal one is below it, so a lone line drawn that thin arrives as a row of
separate bumps that the hand loses on the slightest drift.

That second pin is charged once per strand, though, and on a chart of several
lines the strands are the whole point: what the reader is doing is telling them
apart. Four lines across a sixty-pin grid at two pins each closes the gaps
between them, and the display hands back one mass with no lines in it.

So the weight is measured rather than fixed. When a chart has more than one
open stroke, and those strokes together would claim more than about a seventh
of the pins, the ones the reader is *not* on drop to a single pin. The mark
under the cursor keeps its full weight — and stands out more against thinned
neighbours, not less.

Two things this deliberately does not do. A chart drawn from a single stroke is
never thinned, however much of the grid it covers: one line cannot be confused
with another, so its thickness costs nothing — a step plot running to a fifth
of the pins is perfectly legible. And a chart whose ink is fills rather than
strokes — a heat grid, a bar chart — is untouched, because closed outlines are
already a single pin and an interior is not a stroke at all.

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

Zoomed in close, a window can sit somewhere with nothing to feel — inside a
bar's fill, or on a stretch of chart with no mark in it — and the next step
lands somewhere just as featureless. The pins then hold exactly what they held
before, which under a fingertip is indistinguishable from a key that did
nothing, so the announcement says so: *"Zoom 4x, centred 58% across and 50%
down; the pins are unchanged"*. The key worked; there was nothing new to put
on the display. This is normal at close zoom on a bar chart in particular,
where the bars have no vertical detail to pan through — the information is all
across.

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

Its **tables come from a different copy of the same release** than the SDK
module does, and deliberately. The copy in the vendor's own repository tree is
corrupt: `.gitattributes` there says `* text=auto`, and `liblouis.data` is
braille-table text with no NUL byte in it, so git detects it as text and
rewrites its line endings on commit — 7,685 carriage returns gone. The file is
an Emscripten file package addressed by absolute byte offsets, so every table
past that point is read from the wrong place: `unicode.dis` lands mid-way
through an Arabic table, liblouis rejects it at its first line, every table
pairs with `unicode.dis`, and all 32 languages fail together. `translateText`
then resolves to an empty string rather than to an error, which is quieter than
it sounds — the line falls back to grade 1 and nothing about the cells says
whether the description was contracted or simply that long. The bytes served
instead are the vendor's own, taken from the release zip published beside the
tree and restored into a fork with the file marked binary. The SDK module
itself is unchanged and still comes from the vendor's tree.

Because that failure is silent by nature, the reader is **told once per
session** when the line comes out uncontracted — from either cause, the engine
being unreachable or the engine answering with nothing. Once, not per move: it
is a standing condition rather than an event, and repeating it on every arrow
key would talk over the reading it describes.

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
