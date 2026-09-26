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
| Move to Next Layer                        | Page Up                     | Page Up (Fn + Up)           |
| Move to Previous Layer                    | Page Down                   | Page Down (Fn + Down)       |
| Next Navigation Mode (Rotor)              | Alt + Shift + Up            | Option + Shift + Up         |
| Previous Navigation Mode (Rotor)          | Alt + Shift + Down          | Option + Shift + Down       |

There is no separate shortcut for the first or last element of a chart: **Go to
Left Extreme** and **Go to Right Extreme** are those moves. On a bar chart,
Control + Left (Command + Left) moves to the first bar and Control + Right
(Command + Right) to the last, and MAIDR announces the bar it lands on. Home and
End are not chart shortcuts.

**Layers.** A chart drawn in more than one layer — a bar chart with a line over
it, or a violin plot's box and density curve — moves between its
layers with Page Up and Page Down. Past the first or
last layer, or on a chart with only one, you hear the same edge signal as at the
end of the data.

**Navigation modes (the rotor).** The arrow keys normally move one data point at
a time. Alt + Shift + Up and Alt + Shift + Down (Option + Shift + Up and Down on
a Mac) step through the other ways a chart can be read, and each is announced as
you reach it. Which ones a chart offers depends on its type: *lower value* and
*higher value* navigation jump to the next point below or above the current
value, *grid* navigation walks a scatter plot cell by cell (press **Enter** to
step into a cell, the Left and Right arrows to move through its points, and
**Escape** to leave it), and some chart types add their own, such as the points
where two lines cross.

### Hearing and Reading

| Function                                  | Key (Windows)               | Key (Mac)                   |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Replay Current Point                      | Space                       | Space                       |
| Announce Position                         | P                           | P                           |
| Access Labels (label mode)                | L, then a letter            | L, then a letter            |
| Open Chart Description                    | D                           | D                           |

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
(**Exit Review Mode** in the help menu) leaves it.

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
description and the Go To Extrema list. In the command palette and the Go To
Extrema list, the Up and Down arrows move through the list and Enter chooses.

In **Settings**, **Alt + S** (**Option + S**) saves every tab and closes the
dialog, and **Alt + C** (**Option + C**) or **Escape** closes it without saving.

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
the page and the pin view independently. See
[Tactile Graphics Display](TACTILE_DISPLAY.md) for setup and for the panning
keys on the device itself.

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

Every shortcut in the help menu except the help chord itself can be changed.
Open the help menu with **Control + /** (**Command + /** on a Mac), move to the
**Change** button of the shortcut you want -- each one is named after its
action, so a screen reader reads "Change shortcut for Toggle Braille Mode" --
and press it. The dialog asks you to press the new shortcut. Press the key or
key combination you want, and the dialog announces the result: the new
shortcut, or the action that already uses that key if it is taken. Escape keeps
the old shortcut, and Backspace puts the default back.

A changed shortcut applies everywhere its action is bound -- the arrow keys
move in braille mode as well as while reading a chart -- and is kept in your
browser with the other settings, so it is there the next time you open a chart.
A changed row shows its default beside the new key and gains a **Restore
default** button; **Restore all default shortcuts** at the top of the list
puts everything back at once.

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
