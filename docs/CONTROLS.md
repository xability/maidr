# Controls

To interact with the plots using maidr, follow these steps:

1. Press the **Tab** key to focus on the SVG element.
2. Use the **arrow keys** to move around the plot.
3. Press **B** to toggle Braille mode.
4. Press **T** to toggle Text mode.
5. Press **S** to toggle Sonification (tones) mode.
6. Press **R** to toggle Review mode.
7. Hover on the datapoint to move
8. Press **C** to toggle High Contrast mode.

Below is a detailed list of keyboard shortcuts for various functions:

| Function                                | Key (Windows)               | Key (Mac)                   |
| --------------------------------------- | --------------------------- | --------------------------- |
| Move around plot                        | Arrow keys                  | Arrow keys                  |
| Go to the very left, right, up, or down | Control + Arrow key         | Command + Arrow key         |
| Select the first element                | Control + Home              | Command + Function + Left   |
| Select the last element                 | Control + End               | Control + Function + Right  |
| Toggle Braille Mode                     | B                           | B                           |
| Toggle Sonification Mode                | S                           | S                           |
| Toggle Text Mode                        | T                           | T                           |
| Toggle Review Mode                      | R                           | R                           |
| Toggle High Contrast Mode               | C                           | C                           |
| Repeat current sound                    | Space                       | Space                       |
| Auto-play outward in direction of arrow | Control + Shift + Arrow key | Command + Shift + Arrow key |
| Stop Auto-play                          | Control                     | Command                     |
| Auto-play speed up                      | Period                      | Period                      |
| Auto-play speed down                    | Comma                       | Comma                       |
| Move to next navigation mode            | Shift + Alt + Up/Down       | Shift + Alt + Up/Down       |
| Open Settings                           | Control + ,                 | Command + ,                 |
| Open Command Pallette                   | Control + Shift + p         | Command + Shift + p         |

## Label Mode (Announce Axis Labels)

Press **L** to enter label mode, then press one of the following keys to announce specific information:

| Function                    | Key Sequence | Description                                       |
| --------------------------- | ------------ | ------------------------------------------------- |
| Announce X-axis label       | L, then X    | Speaks the X-axis label                           |
| Announce Y-axis label       | L, then Y    | Speaks the Y-axis label                           |
| Announce Z-axis (Level)     | L, then Z    | Speaks the Z-axis/Level/Group value (e.g., trend, group name) |
| Announce plot title         | L, then T    | Speaks the plot or subplot title                  |
| Announce subtitle           | L, then S    | Speaks the figure subtitle                        |
| Announce caption            | L, then C    | Speaks the figure caption                         |

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
