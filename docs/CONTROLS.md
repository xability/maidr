# Controls

This page lists every keyboard control MAIDR has. The same shortcuts are listed
inside a chart: press **Control + /** (**Command + /** on a Mac) to open the
help menu, which names each shortcut the way the tables below do.

To get started:

1. Press **Tab** to move focus to the chart. (A click also works.)
2. Use the **arrow keys** to move from one data point to the next.
3. Press **B**, **T** or **S** to turn braille, text or sonification (tones) on
   or off, and **R** for review mode.
4. Press **Control + /** (**Command + /**) for the list of shortcuts.

**On a Mac**, press Command wherever this page says Control, Option wherever it
says Alt, and Return for Enter. Mac keyboards without Page Up and Page Down keys
send them with **Fn + Up Arrow** and **Fn + Down Arrow**.

## Reading a Chart

These work while you are on a chart's data. Most also work in braille mode, with
focus in the braille text area.

### Moving

| Function                                  | Key (Windows)               | Key (Mac)                   |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Navigate Up                               | Up Arrow                    | Up Arrow                    |
| Navigate Down                             | Down Arrow                  | Down Arrow                  |
| Navigate Left                             | Left Arrow                  | Left Arrow                  |
| Navigate Right                            | Right Arrow                 | Right Arrow                 |
| Go to Left Extreme (the first point)      | Control + Left              | Command + Left              |
| Go to Right Extreme (the last point)      | Control + Right             | Command + Right             |
| Go to Top Extreme                         | Control + Up                | Command + Up                |
| Go to Bottom Extreme                      | Control + Down              | Command + Down              |
| Go to Minimum Value                       | [ (open bracket)            | [ (open bracket)            |
| Go to Maximum Value                       | ] (close bracket)           | ] (close bracket)           |
| Go To Extrema (a list of points to jump to) | G                         | G                           |
| Open the object list (every node, tile or region of a chart without axes) | O | O |
| Move to Next Layer                        | Page Up                     | Page Up (Fn + Up)           |
| Move to Previous Layer                    | Page Down                   | Page Down (Fn + Down)       |
| Next Navigation Mode (Rotor)              | Alt + Shift + Up            | Option + Shift + Up         |
| Previous Navigation Mode (Rotor)          | Alt + Shift + Down          | Option + Shift + Down       |

There is no separate shortcut for the first or last element of a chart: **Go to
Left Extreme** and **Go to Right Extreme** are those moves. On a bar chart,
Control + Left (Command + Left) moves to the first bar and Control + Right
(Command + Right) to the last, and MAIDR announces the bar it lands on. Home and
End are not chart shortcuts.

On a tree -- a treemap, sunburst, icicle, circle packing or tree diagram -- and
on a directed graph such as a flowchart, the extremes follow the arrow keys:
Control + Left and Right go to the first and last of the items Left and Right
walk, which are a node's siblings or the items of one scope, Control + Up goes
out to the top-level item the one you are on is in, and Control + Down goes
down the first line of children to the deepest. With the rotor on a tree's
**Level**, where Left and Right walk every node at that depth whatever its
parent, Control + Left and Right go to the first and last node of the level.
Already at that extreme, you hear the same edge signal as at the end of the
data, in each of the four directions, rather than the item again.

On a sankey, alluvial or chord diagram, Right follows the largest flow out of
a node and Left the largest flow into it, so Control + Right follows the
largest flows to the node where they run out and Control + Left back to the
node where they start. Where the largest flows go round in a cycle, as a chord
diagram's often do, Right and Left keep going round it, and there is no end or
start to go to: Control + Right or Control + Left says so, with the warning
tone, rather than landing on a node of the cycle that the next arrow moves on
from.

On a layer with nothing to jump to, such as a flowchart, whose nodes carry no
values, [ and ] say there is no minimum or maximum value to go to, and G says
there are no extrema to go to. All three play the warning tone with their
message.

On a parallel coordinates plot, whose axes measure different things, [ and ]
go to the reading of the observation you are on that is drawn lowest or
highest on its own axis, which is also the one played lowest or highest,
rather than to its smallest or largest number.

**Layers.** A chart drawn in more than one layer — a bar chart with a line over
it, or a violin plot's box and density curve — moves between its
layers with Page Up and Page Down. A switch keeps your place where the other
layer has it: the point at the same x or, where both layers name what they
draw, the same thing by its name. From a column of several named points, a
switch takes the top one, where point navigation would start; onto a named
point that shares its column, it lands on the point's row, which names it,
where no other point shares that row. Each switch says which layer of how many you
are on and the values of the point you landed on, with its name where the
chart names its points, as a Wardley map's components are named. A layer with
no data is named and said to be empty, with no tone. Past the first or
last layer, or on a chart with only one, you hear the same edge signal as at the
end of the data.

**Navigation modes (the rotor).** The arrow keys normally move one data point at
a time. Alt + Shift + Up and Alt + Shift + Down (Option + Shift + Up and Down on
a Mac) step through the other ways a chart can be read, and each is announced as
you reach it. Which ones a chart offers depends on its type: where a chart's
points carry values to compare, *lower value* and *higher value* navigation jump
to the next point below or above the current value (a diagram such as a
flowchart, whose nodes carry none, goes straight to its own), *grid* navigation walks a scatter plot cell by cell, starting in the cell of the point you are on (press **Enter** to
step into a cell, the Left and Right arrows to move through its points, and
**Escape** to leave it; in braille mode Enter steps in the same way, and Escape
brings you back to the braille field), and some chart types add their own, such
as the points where two lines cross.

### Hearing and Reading

| Function                                  | Key (Windows)               | Key (Mac)                   |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Replay Current Point                      | Space                       | Space                       |
| Announce Position                         | P                           | P                           |
| Access Labels (label mode)                | L, then a letter            | L, then a letter            |
| Open Chart Description                    | D                           | D                           |

Before your first move, Space enters the chart at its first point, as an
arrow key does, so the next arrow moves on from there.

Label mode is described under [Label Mode](#label-mode-announce-axis-labels).

### Modes

| Function                                  | Key (Windows)               | Key (Mac)                   |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Toggle Braille Mode                       | B                           | B                           |
| Toggle Text Mode                          | T                           | T                           |
| Toggle Sonification Mode                  | S                           | S                           |
| Toggle Review Mode                        | R                           | R                           |
| Toggle High Contrast Mode                 | C                           | C                           |
| Toggle Monitor Mode (Live Charts)         | M                           | M                           |

Escape leaves braille mode. In review mode the arrow keys, Home, End, Page Up and
Page Down move through the review text the way they do in any text field, and R
(**Exit Review Mode** in the help menu) leaves it. The review text can be
selected and copied but not changed: a typed character, Delete, Backspace or a
paste leaves it reading what MAIDR announced.

The braille and review fields are kept readable whatever the page around them
does to form fields:

- In high contrast mode both fields take the reader's high contrast colours,
  with `!important`, as the rest of the chart does. A page's own field styles
  do not apply to them while the mode is on.
- Outside high contrast mode the fields keep the page's colours. Only when
  those read below 4.5:1 (a reset that makes fields inherit their colour, or a
  dark theme that sets a field's background without its colour) does maidr set
  the chart's own text and background colours on the field instead.

MAIDR's dialogs (the help, description and settings dialogs, the Go To
Extrema list, the object list and the candlestick delta picker) keep their own
dark text on their own light panel in high contrast mode. The reader's colours
paint the chart and what lies behind it, not the dialogs drawn over it.

Under forced colours (Windows High Contrast) the system's colours apply and
maidr sets none.

### Autoplay

| Function                                  | Key (Windows)               | Key (Mac)                   |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Autoplay Upward                           | Control + Shift + Up        | Command + Shift + Up        |
| Autoplay Downward                         | Control + Shift + Down      | Command + Shift + Down      |
| Autoplay Forward                          | Control + Shift + Right     | Command + Shift + Right     |
| Autoplay Backward                         | Control + Shift + Left      | Command + Shift + Left      |
| Stop Autoplay                             | Control, or any arrow key   | Command, or any arrow key   |
| Speed Up Autoplay                         | . (period)                  | . (period)                  |
| Speed Down Autoplay                       | , (comma)                   | , (comma)                   |
| Reset Autoplay Speed                      | / (slash)                   | / (slash)                   |

Autoplay plays each point from the current one to the end of the chart in the
direction of the arrow.

### Menus and Dialogs

| Function                                  | Key (Windows)               | Key (Mac)                   |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Open/Close Help (the list of shortcuts)   | Control + /                 | Command + /                 |
| Open Command Palette                      | Control + Shift + P         | Command + Shift + P         |
| Open Settings                             | Control + , (comma)         | Command + , (comma)         |
| Open Chat (AI; needs an API key in Settings or a local Ollama server) | Shift + / (?) | Shift + / (?) |

Escape closes the help menu, the command palette, the chat, the chart
description, the Go To Extrema list and the object list. In the command
palette, the Go To Extrema list and the object list, the Up and Down arrows
move through the list and Enter chooses.

In **Settings**, **Alt + S** (**Option + S**) saves every tab and closes the
dialog, and **Alt + C** (**Option + C**) or **Escape** closes it without saving.

### Object List

On a chart that is not walked along x and y axes -- a network, a directed
graph, a sankey, alluvial or chord diagram, a treemap, sunburst, icicle, tree
or circle packing, a Venn diagram, a word cloud, a pie or a map -- **O** opens
a list of every object on the current layer: every node, tile, region, term
or slice. Pick one and press **Enter** to jump straight there; the chart then
announces it, shows it in braille and highlights it as if you had walked to
it. On any other chart, **O** says the chart has no object list.

| Function                                  | Key (Windows)               | Key (Mac)                   |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Move through the list                     | Up Arrow, Down Arrow        | Up Arrow, Down Arrow        |
| First or last object                      | Home, End                   | Home, End (Fn + Left, Fn + Right) |
| Up or down ten objects                    | Page Up, Page Down          | Page Up, Page Down (Fn + Up, Fn + Down) |
| Jump to the selected object               | Enter                       | Return                      |
| Next or previous order                    | S, Shift + S                | S, Shift + S                |
| Next or previous filter                   | F, Shift + F                | F, Shift + F                |
| Close without moving                      | Escape or O                 | Escape or O                 |

The list opens on the object you are on, marked as current, in the order and
filter you last chose on that layer while you stayed in the chart. Each chart
offers the orders and filters that mean something for it. The first order
listed is the one the list opens in: the chart's own order where that order
carries structure (a graph's flow, a tree's outline, a sankey's stages), and
alphabetical where the chart's order is arbitrary or geographic (a network's
layout, a map).

| Chart | Orders | Filters |
| ----- | ------ | ------- |
| Network | Name A to Z; links, highest or lowest first; betweenness and closeness centrality, highest first; by group | Linked to the node you are on; each group of linked nodes; unlinked nodes |
| Directed graph | Graph order; name; connections; betweenness; each numeric attribute, highest first | Upstream and downstream of the node you are on; graph inputs and outputs, branch and merge points, unconnected nodes; each nesting level; scopes; the values of the first categorical attributes, such as layer type |
| Sankey, alluvial or chord whose flows run one way | Stage order; value, highest or lowest first; name | Each stage; ending nodes |
| Flows that loop back, as most chord diagrams do | Value, highest or lowest first; name; chart order | Starting and ending nodes |
| Treemap, sunburst, icicle, tree, circle packing | Hierarchy order; value, highest or lowest first (or, without values, number of descendants); number of children; name | Inside the node you are on; each level; leaves; branches |
| Venn | Chart order; size, highest or lowest first; name | Single sets; overlaps of each number of sets; regions including each set |
| Word cloud | Weight, highest or lowest first; name | Terms with no weight |
| Pie | Clockwise; share, highest or lowest first; name | Slices with no value |
| Map | Name; value, highest or lowest first; number of neighbors; map order | Regions higher or lower than all their neighbors; regions with no data |

An order or filter is offered only where it tells objects apart, and a filter
only where it leaves something in and something out. Centrality is computed
the first time you choose it. It is not offered where no node lies between two
others, which would score every node alike, nor on graphs too large to compute
it quickly. While the list is sorted by a measure the row does not
already state, such as betweenness, each object is read with its value.

### Tactile Graphics Display

| Function                                  | Key (Windows)               | Key (Mac)                   |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Zoom In Tactile Display                   | =                           | =                           |
| Zoom Out Tactile Display                  | -                           | -                           |
| Reset Tactile Display Zoom                | 0                           | 0                           |

The three tactile-display shortcuts are live on a plot and in Braille mode, and
only do something when a tactile graphics display is connected — with none, they
say so. They are bare keys rather than Control chords so that Control +
plus/minus stays the browser's own page zoom — a low-vision reader can enlarge
the page and the pin view independently.

The displays have keys of their own, which MAIDR answers while the chart is on
the pins:

| Function                                     | Key on the display                                          |
| -------------------------------------------- | ----------------------------------------------------------- |
| DotPad: Pan Tactile Display Left or Right    | Panning Left, Panning Right                                 |
| DotPad: Pan Tactile Display Up or Down       | Function 2, Function 3                                      |
| DotPad: Scroll Braille Line Back or Forward  | Function 1, Function 4                                      |
| Monarch: Pan Tactile Display                 | Left D-pad                                                  |
| Monarch: Scroll Braille Line Back or Forward | Right D-pad left or right, or Space + dot 1, Space + dot 4  |
| Monarch: Zoom Tactile Display In or Out      | Plus, Minus                                                 |

The help menu lists the keyboard's tactile shortcuts and these keys under
**Tactile Display**, its last group, after every other: only a reader with a
tactile display needs them. See [Tactile Graphics Display](TACTILE_DISPLAY.md)
for setup and for what each key does.

## Multi-Panel Figures (the Lobby)

A figure with more than one panel (subplot) opens at the *lobby*: a level above
the panels, where you choose which one to read. MAIDR announces how many panels
there are.

| Function                                  | Key (Windows)               | Key (Mac)                   |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Move Up (to the next panel)               | Up Arrow                    | Up Arrow                    |
| Move Down (to the next panel)             | Down Arrow                  | Down Arrow                  |
| Move Left (to the next panel)             | Left Arrow                  | Left Arrow                  |
| Move Right (to the next panel)            | Right Arrow                 | Right Arrow                 |
| Go to Top / Bottom / Left / Right Extreme | Control + Arrow key         | Command + Arrow key         |
| Activate Current Subplot (go into it)     | Enter                       | Return                      |
| Return to the lobby from a panel          | Escape or Backspace         | Escape or Delete            |
| Announce Current Subplot                  | Space                       | Space                       |
| Announce Position                         | P                           | P                           |
| Access Labels (label mode)                | L, then a letter            | L, then a letter            |

In the lobby, label mode announces the figure's own title and axis labels where
the page provides them; see
[Top-Level Figure Properties](SCHEMA.md#top-level-figure-properties). The mode
keys, the chart description, help, chat and Settings work in the lobby as well.
Braille has nothing to show until you are inside a panel, so B says so.

## Candlestick Reference Comparison

On a candlestick chart, MAIDR can read each period against a reference line,
such as a moving average, instead of as raw prices.

| Function                                  | Key (Windows)               | Key (Mac)                   |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Toggle Candlestick Reference Comparison   | Alt + L                     | Option + L                  |
| Choose Candlestick Reference Line         | Control + Shift + L         | Command + Shift + L         |
| Exit Comparison and Return to Chart       | Escape                      | Escape                      |

Choose Candlestick Reference Line opens a list: Up and Down move through it,
Enter chooses a line, and Escape closes it. While comparing, the Left and Right
arrows move between periods, and Control + Left and Right (Command on a Mac), the
bracket keys, G, Space, P, D, the rotor, B, T, S, R, forward and backward
autoplay, help, chat and Settings keep working. Up, Down, Page Up and Page Down
do not: the comparison is a single line of its own, not a layer of the chart.
While comparing, the help menu lists Alt + L (Option + L) as
**Turn Off Reference Comparison** and Control + Shift + L
(Command + Shift + L) as **Change Reference Line**, which is what each does
from there.

## Mouse and Touch

With **Hover Mode** set to **Hover** (on the General tab of Settings, and the
default), moving the pointer over the chart moves to the data point under it and
plays it. **Click** moves only when you click, and **Off** leaves the pointer
alone.

## Customizing Shortcuts

Shortcuts are changed in the settings, not in the help menu, which only lists
them. Open the settings with **Control + ,** (**Command + ,** on a Mac) and
choose the **Keyboard Shortcuts** tab. It lists every shortcut that can be
changed -- all but the help chord itself and the `l` label keys -- in the same
groups as the help menu. Move to the **Change** button of the shortcut you want
-- each one is named after its action, so a screen reader reads "Change
shortcut for Toggle Braille Mode" -- and press it. The tab asks you to press the
new shortcut. Press the key or key combination you want, and it announces the
result: the new shortcut, or the action that already uses that key if it is
taken. Escape keeps the old shortcut, and Backspace puts the default back.

A change is saved with the other settings: **Save & Close** keeps it, and
**Close** or Escape leaves the shortcuts as they were. A saved shortcut applies
everywhere its action is bound -- the arrow keys move in braille mode as well as
while reading a chart -- and is kept in your browser, so it is there the next
time you open a chart. A changed row shows its default beside the new key, in
the settings and in the help menu, and gains a **Restore default** button;
**Restore all default shortcuts** at the top of the tab puts everything back
at once.

Tab, the function keys and the lock keys cannot be used: Tab is how a keyboard
user leaves the chart, and the others belong to the browser and the screen
reader.

## Unassigned Keys

A key that no shortcut in the current mode uses answers with a short warning —
"Invalid key. Press Control Slash for keyboard help." (Command Slash on a Mac)
— together with the warning tone, so a guess is never met with silence.

Keys held with Control, Command, or Option are left alone, because that is
where the browser and your screen reader keep their own commands.

The warning appears only where the help shortcut itself works — reading a
chart, in braille mode, and in label mode. Anywhere it does not, such as the
dialogs, review mode, and inside a grid cell, an unassigned key stays silent:
there would be nothing useful to point you at, and what you press there is
often text rather than a missed shortcut.

## Monitor Mode (Live Charts)

On charts configured with `live: true`, press **M** to toggle monitor mode. While monitoring is on, every newly streamed data point is automatically sonified and announced by your screen reader without moving your current position. See the [Live & Streaming Data](LIVE_DATA.md) guide for details.

## Label Mode (Announce Axis Labels)

Press **L** to enter label mode, then press one of the following keys to announce specific information:

| Function              | Key Sequence | Description                                                   |
| --------------------- | ------------ | ------------------------------------------------------------- |
| Announce X Label      | L, then X    | Speaks the X-axis label                                       |
| Announce Y Label      | L, then Y    | Speaks the Y-axis label                                       |
| Announce Z Label      | L, then Z    | Speaks the Z-axis/Level/Group value (e.g., trend, group name) |
| Announce Plot Title   | L, then T    | Speaks the plot or subplot title                              |
| Announce Subtitle     | L, then S    | Speaks the figure subtitle                                    |
| Announce Caption      | L, then C    | Speaks the figure caption                                     |

Escape leaves label mode without announcing anything.

A label the chart does not have -- a sequence diagram's or a tree's Y label,
an axis its producer left unnamed -- is announced as not available, with the
warning tone, rather than by a generic name such as "Y label is Y".

## Bump Chart Controls

A bump chart usually draws first place at the top, so Up moves to the
competitor one place better in the same period, drawn above the one you are on,
and Down one place worse. Control + Up (Command + Up on a Mac) goes to first
place and Control + Down to last. On a chart drawn the other way up, with first
place at the bottom, Up and Down still move the way the chart is drawn. Where
MAIDR cannot tell how the chart is drawn, Up moves to the next larger rank
number, as on a line chart. Whichever way it is drawn, first place is the
highest note, ] (Go to Maximum Value) goes to the best place the competitor
held and [ to the worst.

## Violin Plot Controls

Violin plots have two layers (box and KDE) that share the same subplot. Navigation differs by layer:

| Function                                | Key (Windows)               | Key (Mac)                   |
| --------------------------------------- | --------------------------- | --------------------------- |
| Switch between layers                   | Page Up / Page Down         | Page Up / Page Down         |
| Move between violins                    | Left / Right (vertical)     | Left / Right (vertical)     |
| Move along curve or between sections    | Up / Down                   | Up / Down                   |
| Jump to first/last violin               | Control + Left/Right        | Command + Left/Right        |
| Jump to top/bottom of curve or section  | Control + Up/Down           | Command + Up/Down           |

**Box layer:** Left/Right moves between violins (resets to minimum section), Up/Down moves between summary statistics (min, Q1, Q2, Q3, max, outliers).

**KDE layer:** Left/Right moves between violins (resets to bottom of curve), Up/Down traverses the density curve point by point.

**Horizontal orientation:** Up/Down moves between violins, Left/Right moves along sections or curve.

## Segmented Bar Controls

In the various segmented bar plots (stacked bar, dodged bar, and normalized stacked bar),
Up, Down, Left, and Right controls function similar to a grid:

- Left and Right arrows move between different bars or points on the x-axis.
- Up and Down arrows move between different layers of the same bar or point on the x-axis.

Note that there are also pseudo layers at the top of each layer stack: a Summary layer representing a sum of all that bar's values, and a Combined layer that plays a separated or combined run of tones of all the layers. The standard 'S' key that controls sonification now has an extra setting to play either combined tones or separated tones.

## Stacked Area Controls

On a stacked area chart and a 100% stacked area chart, Up and Down move between
the bands at the same point on the x-axis in the order they are stacked: Up to
the band drawn on top of the one you are on, Down to the band underneath,
whatever their values. Control + Up and Control + Down (Command on a Mac) go to
the top and the bottom band. Two bands of the same value are still two bands, one
drawn on top of the other, so they are never announced as an intersection.
