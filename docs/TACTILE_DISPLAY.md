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

MAIDR does not bundle the vendor's SDK by default. Its braille engine is a
14 MB liblouis build, and shipping that inside every copy of `maidr.js` would
make every page heavier for a device most readers do not have. Instead MAIDR
loads the SDK over a CDN from a git commit, pinned so the bytes cannot change
under a release. The pin is recorded, with the size and digest of every file
and the vendor archive they were verified against, in
`src/service/dotPadSdk.json`. The build copies that file into the npm package
as `dist/dotpad-sdk.json`, and the Python and R bindings and the agent skill
take their pins from it when they refresh the bundle, so all four load the
same release.

Dot Inc. publish each release in `dotincorp/dotpad-sdk-guide`, but as a zip
under `Web/<version>/download/`, and a CDN cannot serve a file from inside an
archive. So the files MAIDR loads live extracted, byte for byte, in
`xability/dotpad-sdk-guide`, a mirror Dot Inc. permit MAIDR to keep, and the
pin names a commit of that mirror. Nothing is served from the mirror that the
repin script did not first verify against the vendor's own archive.

#### Moving the pin

`npm run check:dotpad` asks whether the vendor names a release newer than the
pinned one; `.github/workflows/dotpad-sdk-check.yml` asks the same every Monday
and opens an issue when the answer is yes. Moving the pin is two commands with
a commit to the mirror between them:

```bash
# 1. Download the vendor's archive for the release and extract it into a
#    checkout of the mirror, under Web/<version>/. Commit and merge that.
npm run repin:dotpad -- --version 3.0.3 --extract-to ../dotpad-sdk-guide

# 2. Verify that every file the mirror now serves at that commit is the
#    archive's, and rewrite src/service/dotPadSdk.json to point at it.
npm run repin:dotpad -- --version 3.0.3 --mirror-commit <sha>
```

Both read the archive from the vendor's default branch; `--upstream-commit`
pins that too. Then run the tests, which check the manifest's shape, and
commit the manifest. The pin is a commit, not a digest: it is not a runtime
integrity check, which a dynamic `import()` cannot carry. The vendoring script
below is where the digests are checked.

#### Serving it yourself

Dot Inc. permit MAIDR to redistribute the SDK, so a host page that would
rather not reach a CDN — an air-gapped deployment, or one whose
Content-Security-Policy admits no third-party origin — can carry its own copy:

```bash
npm run vendor:dotpad                    # writes dist/dotpad/
npm run vendor:dotpad -- --out public/dotpad
```

That fetches the same files the runtime would have loaded, verifies each
against the digests in the manifest, and writes them with a `manifest.json`
recording the commit they came from. The liblouis build is LGPL-2.1-or-later,
and its licence text and wrapper sources come along under `lib/`, which is
what the vendor asks of anyone who redistributes it; keep the directory
together. `dist/dotpad` is not part of the npm package and `npm run build`
never runs this, so the default stays small.

Then point MAIDR at the copy before it loads, and nothing is fetched from the
CDN:

```html
<script>
  window.MAIDR_DOTPAD_SDK_URL = '/dotpad/DotPadSDK-3.0.3.js';
  window.MAIDR_DOTPAD_ASSET_BASE_URL = '/dotpad/lib/';
</script>
```

The Python and R bindings and the agent skill do the same on their side: each
has a helper that fetches this manifest's files and writes the two globals
into the documents it produces, so an offline notebook or report reaches a
DotPad without the network.

Setting the SDK URL and not the asset one leaves the braille engine unfetched
rather than reaching for the CDN: a page that serves its own SDK usually does so
because of a policy that would refuse the CDN too, and the line falls back to
uncontracted braille instead of failing. A page that already has the SDK loaded
can expose it as `window.DotPadSDK` and skip the import entirely.

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

Every stroke, open or closed, is one pin wide. A thicker stroke was tried and
rejected on the device; *Line thickness* below says why.

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
(Recharts, a radar's polygon), the line is picked up too when it is the one
stroke drawn beside those dots; a group holding two strokes — a line and the
area under it — is left alone rather than guessed at, and you feel the dots.

### What each kind of chart puts on the pins

Most charts are their marks: bars, points, boxes, slices, cells. A few need
more than the marks the cursor moves between, because those marks are not the
chart's shape.

- **A box plot** is drawn as the chart drew it — the box, its median, both caps,
  the outliers, and a whisker joining each cap to the box. The cursor moves
  between the box's statistics, so the section you are on (the lower quartile,
  say) is a heavier line along that edge of the box. Without the whiskers a box
  arrived as three stacked dashes with two more floating beyond them.
- **A dumbbell's** connectors get a dot at each end. The bar is the distance
  between two values, and the dots are the values; a bare line says how far
  apart they are and nothing about where either is. Two equal values, which the
  chart draws as a zero-length bar, become one dot.
- **A gauge** is drawn against its panel: the bands behind it and the target
  line beside it are on the pins, and the measure bar is the filled shape among
  them. The bar alone, sized to the display, was a rectangle that said nothing.
- **A violin** keeps its density curve on the pins while you are on the inner
  box. The box is the layer you land on first, and drawn alone it is a bare
  whisker; the curve is the shape that names the chart.
- **A sankey or an alluvial** draws every ribbon, including the thin
  cross-flows no node ever highlights, and fills the widest ribbon at the node
  you are on — the one the arrow keys follow.

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

| Action           | Key            |
| ---------------- | -------------- |
| Zoom in          | <kbd>=</kbd>   |
| Zoom out         | <kbd>-</kbd>   |
| Back to the whole plot | <kbd>0</kbd> |

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

<kbd>0</kbd> goes straight back to the whole plot, however far in you are. The
zoom steps are multiplicative and there are eight of them, so stepping out from
the closest one is seven presses — and each of those is a frame the device has
to be waited on while it draws something you did not want to feel. Pressing it
when the whole plot is already showing says so and sends nothing, rather than
spending a second redrawing what is already there. The digit row reads the same
way round as the zoom levels: <kbd>1</kbd> upwards is closer in, and
<kbd>0</kbd> is the one before them.

Zooming closes in on **the mark you are on**, not on the middle of the chart,
and puts it in the middle of the pins on every step, in and out. That is the
mark you asked to feel more closely; kept in the middle, it stays under the
hand that was already resting on it instead of drifting towards an edge you
then have to search.

A mark too big for the window — a tall bar, a few steps in — is held by its
value end rather than its middle: the top of a bar, the bottom of one that
hangs below the baseline, the far end of a horizontal one. Centred on its
middle, a tall bar lost its top and its baseline off the edges of the pins and
arrived as two parallel lines, and a few steps further the window sat wholly
inside it with every pin down. Which end is the value is read from the other
bars: the edge they share is the baseline.

Where there is no baseline to read — a funnel stage, a floating waterfall bar,
a treemap tile, a pie wedge — the view goes to the nearest point of the mark's
own outline, moving only in the direction the mark does not fit. A waterfall
bar that fits across but not down is held by its top or bottom, never by a
long side; a pie wedge is held on its arc or its edges, not in the corner of
its bounding box where the wedge does not reach. Some edge of the mark you are
on is always under your hand.

A zoom step never lands on an empty display. Where there is no focused mark
to close in on — the multi-panel lobby, or a chart whose points have no
element of their own — and the step would leave every pin down, the view moves
to the nearest mark instead. Every pin down is also what a disconnected display
feels like, so a blank frame is never the answer to a zoom.

Zooming changes how much of the chart you feel, not what the marks are:

- **A point stays a point.** The dot marking where you are on a line, a
  scatter or a dot plot is the same small disc at every zoom. It used to grow
  with the chart's own marker, into an ellipse half the display across that
  covered the line it was marking.
- **A mark drawn in pieces stays in pieces.** An error bar, a box plot's box
  and whiskers, a candle's body and wick, and a map region with islands are
  often a single path in several pieces. They are drawn piece by piece, so no
  line the chart never drew joins them — which at close zoom used to cut across
  the mark as a slash, or turn an error bar into a Z.
- **A shape placed by `<use>` is drawn as that shape.** matplotlib draws a
  violin's outline once and places it with `<use>`; it is followed to the
  outline rather than measured as a box.
- **The focused mark is outlined, not filled, once it covers three quarters of
  the display both ways**, so a step or two in you meet its shape under a
  heavy stroke rather than a solid slab.

Near the edge of the chart the view stops at the edge rather than showing
empty space beyond it, so a mark there sits off-centre, towards that edge.

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

### Line thickness

Every stroke — a line, a curve, a whisker, an error bar — is one pin thick.

It was two for a while. The reasoning was that a one-pin diagonal steps in pins
that touch only at their corners, so a finger sweeping across meets separate
bumps rather than a line. Read on an actual display that turned out to trade one
problem for a worse one: at two pins a diagonal comes out three and four wide
where the offset copies meet at a bend, a single line reads as a band rather
than a line, and several of them read as one mass.

What the second pin was buying is bought instead by the mark you are on being
stroked heavily, so your own line is unmistakable among thin ones.

Dash patterns were tried for the rest of that job — giving each series its own
texture, taken from the chart's own colours, so crossing strands could be told
apart. Read on a Dot Pad they made things worse, not better: a broken line has
to be reassembled before it can be followed, and every gap is somewhere to lose
it. Lines are solid.

So on a chart of several lines, the strands are not distinguishable from one
another by feel. What tells you which is yours is that it is the heavy one, and
moving between series moves that weight. That is a real limit and worth knowing
about rather than working around by making the picture harder to read.

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

When more text follows, the final cell shows dots 7 and 8. Moving along the line
is silent — you are reading it with your fingers, and a voice naming the part
would talk over it. When there is no more line in the direction you pressed, or
the whole line already fits, the device **vibrates** with one long pulse —
deliberately not the double pulse the display gives when it connects.

On an SDK build without vibration, or a device that turns the request down,
MAIDR says it instead. A device that accepts the request and then does not buzz
cannot be told from one that did, so it says nothing.

Moving to another data point returns the line to its start, since it now
describes something else.

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

Its **tables are verified against the vendor's release archive**, not taken
from a repository tree on trust, and there is a reason. The copy that once
lived in the vendor's own tree was corrupt: `.gitattributes` there said
`* text=auto`, and `liblouis.data` is braille-table text with no NUL byte in
it, so git detected it as text and rewrote its line endings on commit — 7,685
carriage returns gone. The file is an Emscripten file package addressed by
absolute byte offsets, so every table past that point was read from the wrong
place: `unicode.dis` landed mid-way through an Arabic table, liblouis rejected
it at its first line, every table pairs with `unicode.dis`, and all 32
languages failed together. `translateText` then resolves to an empty string
rather than to an error, which is quieter than it sounds — the line falls back
to grade 1 and nothing about the cells says whether the description was
contracted or simply that long. The vendor has since marked the file binary,
the mirror does the same, and the repin script refuses to record a mirror file
whose bytes are not the archive's, so the manifest's size for `liblouis.data`
is the one the tests check.

Because that failure is silent by nature, the reader is **told once per
session** when the line comes out uncontracted — from either cause, the engine
being unreachable or the engine answering with nothing. Once, not per move: it
is a standing condition rather than an event, and repeating it on every arrow
key would talk over the reading it describes.

### Charts drawn on a canvas

Chart.js and amCharts draw no SVG: the whole chart is pixels on a `<canvas>`,
with no shapes to scale down. plotly's parallel coordinates draw their lines
the same way, on canvases beside the SVG that carries only the axes. The
display reads those pixels instead, whenever they hold clearly more of the
chart than an SVG does. Each pin looks at the patch of the chart it stands
over, and is raised where something drawn meets the page or a clearly
different colour — so bars, boxes and candles arrive as outlines, the way the SVG path draws every mark but the one
you are on. A line thin enough to be a line on screen is raised whole, so it
stays one line at every zoom rather than turning into its two edges.

The mark you are on comes from the highlight box MAIDR draws over the canvas
for sighted readers — the one place its position is written down — and is
filled, followed through zoom and held by its edge as on an SVG chart. A
canvas has no other marks to show which end of a bar is its baseline, so a bar
taller than wide is held by its top and one wider than tall by its right end.

Only the plot area is read, where the adapter can say where it is: the title,
the axis labels and the legend are left off the pins, as they are for SVG.
Chart.js's tooltip is left off too — MAIDR keeps a copy of the chart as it
stands before the tooltip is painted and reads that — and an amCharts legend
drawn inside the plot area is read as background.

Some things read less cleanly than on an SVG chart, because what the pixels
cannot say has to be inferred: a translucent fill next to a line can add a
second edge beside it, a bar only a few pixels wide is raised solid, since in
pixels it is the same as a thick line, and text that is part of the data — a word cloud's
words — is outlined letter by letter. A canvas whose pixels the page cannot
read, one that has drawn an image from another site, leaves the pins down.

## What the display does not show

- **WebGL canvases that discard what they drew.** Unless the chart asks the
  browser to keep it, a WebGL canvas's picture is gone by the time it could be
  read, and reading it gives an empty page.
- **Charts in a cross-origin frame.** Their geometry cannot be measured.
- **Shapes the chart gave no element for.** A lollipop whose selectors name
  the heads draws the heads and no stems; a treemap or icicle whose parent
  tiles have no selector draws the leaves, and the focus on a parent has
  nothing to fill. The display draws what the chart's own description of
  itself reaches.

In these cases the braille panel behaves normally and the pins stay down.

## Notes for other devices

Nothing in MAIDR hardcodes a pin count. Every device reports its own cell rows,
cell columns and braille-line width when it connects, and MAIDR sizes the
rendering to what it is told — including devices with no braille line at all,
which simply get the graphic area.
