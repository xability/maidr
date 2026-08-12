# Braille Generation

MAIDR incorporates a Braille mode that represents the plot using Braille symbols.
This allows users with visual impairments to explore and interact with the plot using a refreshable Braille display.
To achieve this,
our system translates the plot's visual elements and data points into a corresponding tactile representation
using Braille patterns.
For different plot types, such as bar plot, boxplot, heatmap, and scatter plot,
MAIDR employs unique encoding strategies tailored to effectively convey the data distribution, patterns, and trends.
These tactile encodings range from using distinct Braille characters to represent value ranges,
to using characters that visually resemble the corresponding sections of a plot.
By providing a comprehensive Braille representation for various plot types,
MAIDR enables users with visual impairments to gain a deeper understanding of the underlying data and its insights.
For multiline braille display setup, see [Multiline Braille Display Support](#multiline-braille-display-support).

## Bar plot

In the Braille representation of a bar plot,
data values are encoded as Braille characters based on their relative magnitude within the plot.
Low values are denoted by Braille characters that have dots only along the bottom,
while high values are indicated by characters that have dots along the top.
Given the four height levels of Braille, the encoding is as follows:

- ⣀ represents values 0 to 25%
- ⠤ represents 25% to 50%
- ⠒ represents 50% to 75%
- ⠉ represents 75% to 100%

This tactile encoding allows users to easily differentiate between the various value ranges in the bar plot,
facilitating their understanding of the data distribution and its underlying trends.

A **dot plot** and a **lollipop** carry a bar's braille state, because they
carry a bar's data -- one row of magnitudes, encoded exactly as above. The mark
differs and the encoding cannot: there is no tactile equivalent of "drawn as a
point rather than a rectangle", and inventing one would encode the author's
styling where the reader expects the data.

### Multiline Displays

Bar plots use a single-line representation. On multiline braille displays, the bar plot appears on the first line and the remaining lines are unused.

## Heatmap

In the Braille representation of a heatmap, values are depicted based on their relative magnitude within the plot,
much like the approach used for bar plots and scatter plots.
Low values are denoted by Braille characters with dots only along the bottom,
high values are represented by characters filled with dots, and blank or null values are indicated by empty spaces.
With three height levels of Braille, the encoding is as follows:

- ⠤ represents values from 0% to 33%
- ⠒ represents values from 33% to 66%
- ⠉ represents values from 66% to 100%
- "⠀" (braille space) represents null or empty values
- "⢳" represents a row separator

### Multiline Displays

In multiline braille displays, all rows of the heatmap are represented simultaneously. Horizontally, the height of the braille encoding from left to right represents the value of each cell in the corresponding row. Vertically, each line of the braille display corresponds to a different row of the heatmap, allowing users to perceive the distribution of values across the entire heatmap at once.

In single-line braille displays, use the up and down arrow keys to move between rows. The braille representation updates to show the current row.

## Box plot

The Braille representation of a boxplot uses Braille characters
that visually resemble the corresponding sections of the boxplot.
An example of such braille may look like `⠂ ⠒⠒⠒⠒⠒⠒⠿⠸⠿⠒ `.
The size of each section is denoted by the number of Braille characters used.
The sections are encoded as follows:

- ⠂ represents lower outlier and upper outlier(s)
- ⠒ represents the left or right whiskers
- ⠿ represents the second or third quartiles
- ⠸⠇ represents the 50% midpoint (median)
- blank spaces represent empty spaces. Blank spaces represent empty spaces. At the beginning of a line, blank space acts as a positional offset to ensure multiple box plots align correctly to the same numerical scale.

We also impose some overarching rules:

1. Each section must be represented with at least one braille character, assuming they have some positive length.
2. Differences or equalities in whiskers and quartiles must be upheld. That is, if the min and max whisker are of equal length, they must have the same number of braille characters, or if they're different, the number of characters must be different.
3. A set character always represents zero length sections, such as outliers and the median. ⠂ in the case of outliers, ⠸⠇ in the case of the median.
4. Spatial Alignment: When comparing multiple box plots, the leading blank space represents the distance from the global minimum to the start of the specific dataset. This allows users to perceive relative differences in value by comparing the "indentation" of each plot.

This tactile encoding enables users to discern the various components of the boxplot, allowing them to comprehend the data distribution, detect outliers, and identify central tendencies and dispersion within the dataset.

To generate the braille, we use an algorithm that generates a distribution of characters based on a given proportional distribution and a specified total number of characters in the user's braille display. This can be described mathematically as follows:

c*i = round(n * p*i), for i = 1, 2, 3, ..., k
c_i = round((n - C) * p_i), for i = 1, 2, 3, ..., k

Where

- n: Total number of characters (integer)
- C: Total number of length 0 characters to offset the total characters (outliers and median) (integer)
- p_i: Proportional distribution of each category i, where i ∈ {1, 2, 3, ..., k} (real numbers, 0 ≤ p_i ≤ 1, and the sum of all p_i equals 1)
- c_i: Number of characters for each category i (integer)

The process is as follows in the code:

1. We first convert our data set for a particular boxplot to an array of lengths.
2. We then assign the single required character to each section.
3. We also note connected sections, such as min and max.
4. We then normalize and allocate all remaining characters according to their proportional distribution, making sure to add extra characters where needed to keep differences or equalities.

As an example, consider a boxplot with the following distribution: [10, 0, 20, 40, 30, 0, 30, 60, 50, 30, 0, 10, 0], with types [blank space, outlier, larger blank space, large min whisker, moderate sized lower quartile, the median, moderate sized upper quartile, another larger max whisker, a large blank space, an outlier, a small blank space, then another outlier], and a braille display length of 33. We would produce braille that looks like so:

⠂ ⠒⠒⠒⠒⠿⠿⠿⠸⠇⠿⠿⠿⠒⠒⠒⠒⠒⠒ ⠂ ⠂

### Multiline Displays

Multiline braille displays represent grouped boxplots, such as horizontal boxplots and vertical boxplots with multiple groups, by displaying each group on a separate line of the braille display. Each line corresponds to a different group, allowing users to compare the distributions of multiple groups simultaneously. The same encoding principles for boxplots apply to each line, with Braille characters representing the various sections of the boxplot for each group.

Single-line braille displays represent grouped boxplots by allowing users to navigate vertically between groups using the up and down arrow keys. As the user navigates, the braille representation updates to show the boxplot for the current group, enabling users to explore each group's distribution one at a time.

## Hexbin

One row per lattice row, one cell per bin, using the heatmap encoding above —
because read as a lattice of cells each carrying a count, that is what a
hexbin is.

**The stagger has no representation here, and needs none.** A hex lattice
offsets alternate rows by half a cell, and a braille display is a line of
cells with nowhere to put half of one. What survives intact is the thing the
chart is drawn for: the density pattern, as a run of cells that rises towards
the cloud and falls away from it, with the empty margins reading as spaces.

Where the offset *does* matter is navigation rather than encoding — moving up
or down lands between two bins, so the trace keeps the reader over the x they
started from rather than stepping by index. A display shows the whole row at
once and never has to make that choice.

### Multiline Displays

Hexbin plots use one line per lattice row on a multiline display, so the shape
of the cloud can be felt at once rather than row by row.

## Letter-value plot (boxen)

One row per distribution, one cell per rung of its quantile ladder, every row
scaled against the **chart's** range rather than its own.

**Not the box plot encoding above.** That one renders five named sections at
proportional widths, and a letter-value ladder has a variable number of rungs
by design — a library adds them as the sample grows. A fixed-section glyph run
would either truncate a deep ladder or pad a shallow one into looking deeper
than it is, and depth is exactly the fact a boxen carries that a box plot
cannot.

So the row is the ladder itself, read in value order: deepest lower quantile,
inward to the median, outward again to the deepest upper one. That makes the
run of cells rise monotonically, and **its steepness is the reading**:

```
⣀⣀⠤⠒⠒⠉⠉    gentle throughout — a light-tailed sample
⣀⠤⠤⠒⠒⠒⠉    steep at the ends — a heavy tail
```

Cells that climb gently through the middle and jump at the ends are a
heavy-tailed distribution, which is the finding a boxen is drawn to make and
the one a box plot's single whisker flattens into a number.

Because every row shares the chart's scale, two distributions can be compared
cell by cell — a row sitting entirely higher than another is a distribution
shifted upward, not merely one with a different spread.

### Multiline Displays

Letter-value plots use one line per distribution on a multiline display, so
several groups' tails can be compared with one sweep.

## Scatter plot

In the Braille representation of a scatter plot, the encoding is performed only for the line layer (layer 2). Stand alone scatterplots without a line layer are not represented in braille.
The representation of the line layer is similar to that used for bar plots,
wherein data values are represented as Braille characters based on their relative magnitude within the plot.
Low values are denoted by dots along the bottom, while high values are indicated by dots along the top.
With four height levels of Braille, the encoding is as follows:

- ⣀ represents values from 0% to 25%
- ⠤ represents values from 25% to 50%
- ⠒ represents values from 50% to 75%
- ⠉ represents values from 75% to 100%

### Multiline Displays

When the grid navigation rotor is activated, the braille representation of the scatter plot changes to highlight the number of points in each grid cell. The representation is similar to that of a heatmap, where the number of points in each cell is represented by the height of the Braille character.

In multiline braille displays, all cells are represented simultaneously. Horizontally, the height of the braille encoding from left to right represents the number of data points in the corresponding grid cell. Vertically, each line of the braille display corresponds to a different row of the grid, allowing users to perceive the distribution of points across the entire grid at once.

In single-line braille displays, the user can navigate vertically with the up and down arrow keys to move between rows of the grid, and the braille representation updates to show the number of points in each cell of the current row.

## Segmented Bar Plots

Stacked bar, dodged bar, and normalized stacked bar all share the same system:

In the braille representation of segmented bar plots, braille depends on where you are. There are typically multiple levels to a segmented bar plot, and as you move (Up and Down arrow keys) between levels, the braille changes to represent your current level. At the top, there is also a Summary pseudo level of all levels added together, and a Combined pseudo level of each level separately.

- Regular level: Braille appears similar to a bar plot, with braille values corresponding to the size of the level's value for this point.
- Summary level: Same as regular level, but values now reflect the combined size of all levels' values for this point.
- Combined level: Similar to heatmap, where there are groups of magnitudes for each point separated by a ⢳ character. The first group has braille characters for each level for the first point, then a separator, then the second group has braille characters for each level in the second point, then a separator, and so on.

### Multiline Displays

In multiline braille displays, all levels are represented simultaneously. Horizontally, the height of the braille encoding from left to right represents the size of the level's value for a particular point. Vertically, each line of the braille display corresponds to a different level, allowing users to perceive the distribution of values across all levels at once.

In single-line braille displays, use the up and down arrow keys to move between levels. The braille representation updates to show the current level.

## Violin Plot

Violin plots have two layers, each with their own braille representation:

### Violin KDE (Density Curve)

The braille representation for the KDE layer uses the same encoding as bar plots, based on the density value at each point along the curve. Low density values use bottom dots, high density values use top dots:

- ⣀ represents values from 0% to 25%
- ⠤ represents values from 25% to 50%
- ⠒ represents values from 50% to 75%
- ⠉ represents values from 75% to 100%

The braille string represents the density profile of the current violin from bottom to top of the curve.

### Violin Box (Summary Statistics)

The braille representation for the box layer is identical to the standard box plot encoding described above. It uses the same characters and proportional allocation algorithm to represent whiskers, quartiles, median, and outliers.

### Multiline Displays

In multiline braille displays, each violin is represented on its own line using the KDE or box encodings above, depending on the selected layer. Horizontally, the braille characters represent the density profile and summary statistics along the value axis for that violin. Vertically, each line corresponds to a different violin, allowing users to compare categories simultaneously. In single-line braille displays, use the up and down arrow keys to move between violins; the braille representation updates to the current violin.

## Line plot

In the Braille representation of a line plot, braille is nearly identical to the above bar plot:
data values are encoded as Braille characters based on their relative magnitude within the plot.
Low values are denoted by Braille characters that have dots only along the bottom,
while high values are indicated by characters that have dots higher up.

### Multiline Displays

In multiline braille displays, all data series are represented simultaneously. Horizontally, the height of the braille encoding from left to right represents the value of the series for a particular point. Vertically, each line of the braille display corresponds to a different series in the plot, allowing users to perceive the distribution of values across all series at once.

In single-line braille displays, the user can navigate vertically with the up and down arrow keys to move between lines, and the braille representation updates to show the values for the current line.

## Area plot

An area plot's braille is the line plot encoding above, unchanged: each series
becomes a height profile, and the fill under the curve is not encoded because
it carries no value the curve does not already carry.

For a stacked area plot the profile is each band's **own** height, not the
height of the stack it sits in. That matches what the audio plays and what the
text announces as the cross-axis value, so the three modalities describe the
same number. The running total is available in the verbose text announcement
and in the chart description; it is deliberately not folded into the braille,
because a profile that silently switched from series values to cumulative ones
would read as the same shape with different numbers behind it.

### Multiline Displays

As for a line plot: each line of the display is one series, and the user moves
between series with the up and down arrow keys on a single-line display.

## Error bar plot

An error bar layer becomes one braille row per magnitude it draws — the lower
bounds, the estimates, the upper bounds — each scaled against its own row's
range, exactly as a multi-series line plot is.

Rows are ordered bottom to top, so moving down the display moves down the
value axis. A layer whose data carries no lower bound has no lower row: an
empty lane the reader can enter and feel nothing in reads as a broken chart
rather than as an absent bound.

The interval itself is not encoded as a span. Feeling the width means moving
between the rows at one column, which is the same motion that hears it — the
audio, the announcement and the braille all describe the same three
magnitudes rather than three different summaries of them.

### Multiline Displays

Each line of the display is one magnitude, so a multi-line display shows the
whole interval at once. On a single-line display the up and down arrows move
between the bounds and the estimate.

## Step plot

A step plot's braille is the line plot encoding above, unchanged: each data
point becomes one Braille character whose dot height is its numeric `y` relative
to the row's own range. The staircase corners the chart draws are not encoded —
braille represents the samples, not the rendered geometry — so a run of equal
levels reads as a run of identical characters and a transition reads as a change
in dot height.

### Known limitation: ordinal levels collapse

The line encoder quarters each row's range into **four** buckets:

- ⣀ represents values from 0% to 25%
- ⠤ represents values from 25% to 50%
- ⠒ represents values from 50% to 75%
- ⠉ represents values from 75% to 100%

A step plot whose Y axis is an ordinal scale with **five or more levels**
therefore has more levels than the encoding has heights, and adjacent levels
land on the same character. A hypnogram coded N3=1, N2=2, N1=3, REM=4, Awake=5
quarters into bands of one unit, so N3 and N2 both render as ⣀ and cannot be
told apart by touch alone.

The exact stage name is still available: it comes from the text announcement,
which reads the point's `label` ("Sleep stage is N2") rather than its numeric
code. Use braille for the shape of the night — how long each run is, where the
transitions fall — and the text output to name the level you are standing on.

### Multiline Displays

Step plots follow the line plot rules. In multiline braille displays, each
series occupies its own line, so several step series can be compared at once. In
single-line displays, the up and down arrow keys move between series and the
braille representation updates to the current one.

## Pie chart

A pie's slices are a single row, so its braille is the bar plot encoding above,
unchanged: one Braille character per slice, in the order the slices are drawn,
whose dot height is that slice's magnitude relative to the range of the pie's
own slice values.

- ⣀ represents values from 0% to 25% of the range
- ⠤ represents values from 25% to 50%
- ⠒ represents values from 50% to 75%
- ⠉ represents values from 75% to 100%
- "⠀" (braille space) represents a zero slice or one with no value

Note that the bands are relative to the smallest and largest slice, not to the
whole circle: the smallest measured slice reads as ⣀ and the largest as ⠉,
however close their shares are. Read the braille for which slices are large
relative to one another, and the text output for what share of the whole any one
of them is.

The heights encode the raw values, not the percentages — the two are a monotone
rescale of each other, so the characters come out identical either way, and the
raw values keep braille agreeing with the sonification and the reported
statistics. The percentage itself is not encoded in braille; it is announced in
text as ", Percentage is 33.3%" after the slice label and its value.

Slices with no measurement are left out of the range entirely, so one missing
slice cannot compress every other slice's dot height, and they read as a braille
space the same way a zero slice does.

### Multiline Displays

Pie charts use a single-line representation. On multiline braille displays the
pie appears on the first line and the remaining lines are unused.

## Waterfall chart

A waterfall's braille is a single row of **contributions** — one cell per step,
scaled against the signed range of the deltas, exactly as a bar chart's row is.

It is the contribution rather than the running total for the same reason the
audio pitches the contribution: the running totals of a waterfall drift within
a narrow band around the current value, so a profile built from them would be
nearly flat across the whole chart and the large movers — the thing a waterfall
is read to find — would be indistinguishable from the small ones. The deltas
span the full signed range, so the profile has shape.

A decrease is a negative value, and is encoded against the same range as the
increases rather than by magnitude alone, so a step down reads lower than a
step up rather than merely narrower.

The running total is not encoded. It is available in the text announcement
alongside the contribution, and in the chart description as the starting and
ending values — the same division as a stacked area plot, and for the same
reason: a profile that silently switched between two different quantities would
read as one shape with different numbers behind it.

### Multiline Displays

Waterfall charts use a single-line representation. On multiline braille
displays the steps appear on the first line and the remaining lines are unused.

## Word cloud

A word cloud's braille is a single row of **weights**, one cell per term,
scaled against the row's own range -- the bar encoding above, unchanged.

The row is ordered by weight, heaviest first, which is also the order the
cursor walks. A cloud's drawn arrangement is chosen to pack glyphs into a
rectangle and encodes nothing, so a profile in layout order would be an
arbitrary sequence of heights; in weight order it descends, and the shape of
that descent is the distribution -- whether one term dominates or many are
comparable, which is what a cloud is read for.

The terms themselves are not in the braille. They are what the text mode
announces, and a display of five cells cannot carry five words.

### Multiline Displays

Word clouds use a single-line representation. On multiline braille displays
the terms appear on the first line and the remaining lines are unused.

## Gauge and bullet chart

A gauge's braille is a **single cell**, scaled against the dial's own ends
rather than against the value -- so the cell's dot height is where along the
dial the measure sits, not merely that a measure exists.

That is the whole of what braille can carry here, and it is worth carrying: a
reader running a finger along a dashboard row feels each tile's fill level
without leaving braille mode. The target, the band and the range are not
encoded, because one cell has four height levels and no room for four
quantities; they are announced in text instead, which is where a reader asking
"how far off target" is already looking.

### Multiline Displays

Gauges use a single-line representation. On multiline braille displays the
measure appears on the first line and the remaining lines are unused.

## Dumbbell

A dumbbell's braille is **two rows** — the starting values and the finishing
ones — one cell per category, with each row scaled against **its own** range.

That per-row scaling is the same treatment a multi-line plot gets, and it is
what makes the two rows comparable as *shapes*: the point of the chart is
whether the second row's profile sits differently from the first, and a single
shared range would flatten both toward the middle of the combined spread when
the two ends occupy different parts of the value axis.

The rows keep the chart's own order — start first, then end — rather than being
sorted by magnitude. A dumbbell normally contains rises and falls at once, so
sorting would put a declining row's finishing value on the line that holds
every other row's start, and the reader would have no way to know which line
they were feeling.

The change itself is not encoded. It is what the text announcement carries at
both ends of every row, and a third line of deltas would read as a third series
rather than as the gap between the first two.

### Multiline Displays

Dumbbell charts use both lines on a multiline display: the starting values on
the first and the finishing ones on the second, so the two profiles can be
compared with one sweep rather than by toggling between rows.

## Radar and polar area

A radar's braille is the multi-line encoding unchanged: **one row per series**,
one cell per spoke, each row scaled against its own range.

What braille cannot carry here is the circle. A display is a line of cells and
a spoke's angle has nowhere to go in it, so the row reads as the sequence of
values it is — first spoke to last, in the order the chart declares them.

That is not a loss the way a missing magnitude would be, because the angle is
carried elsewhere and better: the **stereo position** follows the spoke around
the dial, so a sweep goes out and comes back. Braille answers "how do the
series compare across the spokes"; audio answers "where on the circle am I".
Encoding a rotation into cell heights would answer neither.

### Multiline Displays

Radar charts use one line per series on a multiline display, so several models'
profiles can be compared with one sweep rather than by toggling between rows.

## Funnel

A single row of stage counts, scaled against that row's own range -- the bar
encoding unchanged.

**The cells carry the counts, not the retention the pitch carries.** The two
deliberately answer different questions, and it is worth knowing which is
which.

The pitch takes the **ratio** between adjacent stages, because a ratio is what
a listener cannot compute: two heights heard one at a time do not give a
percentage, and on a raw scale the worst stage in a funnel is routinely not
the biggest fall. Braille takes the **counts**, because a display can show a
shape all at once and that shape *is* the funnel -- a wide first cell tapering
to a narrow last one, with the steep steps legible as the cells where the dots
drop several levels at once.

So the ear is told how bad each step is and the fingers are shown what the
whole thing looks like. Encoding the retention in the cells instead would put
a near-full cell wherever a stage lost nobody, and the display would no longer
narrow -- a funnel that reads as a rectangle.

### Multiline Displays

Funnel charts use a single-line representation. On multiline braille displays
the funnel appears on the first line and the remaining lines are unused.

## Gantt, timeline and swimlane

A gantt's braille is the multi-line encoding: **one row per lane**, one cell
per interval, each row scaled against its own range. A cell's height is the
interval's **length** — the same magnitude the pitch carries and the same one
the announcement gives.

A lane with nothing booked renders as an **empty row** rather than being
skipped, so the reader's line count keeps matching the chart's lane count. An
empty lane is a real statement about a schedule, and a display that silently
closed the gap would put every lane below it on the wrong line.

### Why not a span drawn along the axis

The literal picture — each row a stretch of the axis, cells raised where an
interval covers them — is the encoding a schedule seems to want, and it is the
wrong one at the resolution a display has.

A 40-cell display over a year gives each cell about nine days. A fortnight's
task and a three-week one are then the same single raised cell, two tasks a
week apart begin in the same cell, and a milestone shorter than nine days
either vanishes or is rounded up to look like a week of work. Every question a
schedule is read for — how long, how much longer than that one, do these two
overlap — is answered wrongly rather than coarsely.

The length profile is the opposite trade: **coarse about when, exact about how
long**. Where an interval sits is carried by the stereo position, which is
continuous along the axis and has the resolution to place it — so the two
modalities divide the chart between them rather than both approximating the
same half of it.

### Multiline Displays

Gantt charts use one line per lane on a multiline display, so several lanes'
workloads can be compared with one sweep rather than by toggling between rows.
## Parallel coordinates

One row per observation, one cell per axis, each row scaled from 0 to 1.

The scaling is the whole point, and it happens **before** the encoder sees the
data. Every other multi-row trace hands the encoder raw values and lets it
scale each row against that row's own extent, which is right when a row is one
quantity sampled repeatedly. A parallel coordinates row is not: it holds one
observation across every variable, so scaling it row-wise would compare a car's
fuel economy against its own kerb weight, and the cell heights would encode
which variable happens to use bigger numbers rather than anything about the
car.

So the trace normalizes first. Each cell is its value's position **on its own
axis**, which is exactly what the pitch plays and what the chart draws. A row
of the display is then that observation's profile across the variables, and two
rows can be compared cell by cell:

```
⠉⠉⣀    high economy, high power, low weight
⣀⣀⠉    low economy, low power, high weight
```

Two rows whose heights swap between adjacent cells are the crossing lines that
mean negative correlation — the pattern the chart is drawn for, available by
touch as well as by ear.

An axis whose observations all share one value has no spread to place anything
within, so every cell on it sits at the midpoint. Both extremes would claim a
rank the data does not support.

### Multiline Displays

Parallel coordinates use one line per observation on a multiline display, so
several observations' profiles can be compared with one sweep rather than by
toggling between rows.
## Bump chart

One row per competitor, one cell per period, each row scaled against its own
range — the line encoding unchanged.

**The cells rise with the rank number, not with the position.** A row that
climbs the display is a competitor sliding *down* the table, because rank 1 is
the best place and the smallest number. That is the opposite of what the pitch
does, which inverts so first place is the highest note.

The two disagree on purpose, and it is worth knowing which is which. Audio is
given a direction to invert — the trace hands the service its bounds the other
way round, and nothing else about the tone changes. Braille is given values,
and the encoder maps a value to a dot height; inverting those would mean
emitting `n + 1 - rank` in place of the rank, so the display would carry
numbers the chart does not contain and every other reading of the same state
would disagree with it.

So the display stays literal: a low row is a good run, and the announcement and
the pitch both say so in words and in tone. What braille adds is the *shape* —
a row that stays flat held its place all season, and two rows that cross swapped
positions, which is legible by touch whichever way the dots run.

### Multiline Displays

Bump charts use one line per competitor on a multiline display, so a whole
table's season can be felt at once rather than by toggling between rows.

## Diverging bar and population pyramid

One row per side plus the balance row, one cell per category -- the bar
encoding unchanged.

**The cells encode the signed value, so a left-hand row reads low across its
whole length.** That is the opposite of what the pitch does, which takes the
magnitude so a bar of the same size sounds the same on either side.

The two disagree on purpose. Audio is given a direction to invert and nothing
else about the tone changes. Braille is given values, and the encoder maps a
value to a dot height; flipping the left side's sign before encoding would put
numbers in the display that the chart does not contain, and every other reading
of the same state would then contradict it.

So the display stays literal, and what it adds is the *silhouette*: the two
sides read as a low band and a high band, and the taper of a pyramid -- wide at
the young bands, narrow at the old -- is legible as a run of dots rising on one
row while falling on the other.

### Multiline Displays

Diverging charts use one line per side on a multiline display, plus the
balance, so the two sides can be compared with one sweep.

## Ridgeline (joy plot)

One row per group, one cell per sample of its density curve — the line
encoding, which is what a density curve is.

**Every row is scaled against the chart's peak rather than its own.** This is
the one place a ridgeline's braille differs from a violin's, and it is
deliberate: the chart exists so a reader can ask which distribution is tallest
and where. Scaled per row, a group holding a tenth of another's density would
fill its cells just as high, and the display would show a dozen equally tall
ridges — the exact reading the chart is drawn to prevent.

The floor is zero rather than the smallest density measured anywhere. A density
of zero is a real reading — nobody in that group had that value — so it belongs
at the bottom of the range and not somewhere above it.

**The baseline offset has no representation here, and needs none.** The stagger
that separates the curves on screen is presentation; it is not in the data and
it is not in the display. What the fingers get is each group's shape, aligned
row against row, which is the comparison the offset exists to make possible
visually.

```
Group   Cells
2019    ⠄⠆⠖⠶⣶⣶⠶⠖⠆⠄
2021    ⠄⠆⠖⠖⠶⠶⠖⠖⠆⠄
2023    ⠂⠆⠖⠶⣿⣿⠶⠖⠆⠂
```

The 2021 cohort's row never reaches the top because that cohort's curve never
reaches the chart's peak — it is more spread out, so its density is lower
everywhere. A per-row scale would have hidden that by filling its middle cells
as high as everyone else's.

### Multiline Displays

Ridgelines use one line per group on a multiline display, so a reader can sweep
across the groups at a fixed position and feel the modes march along the axis,
or fail to — which is the finding the chart is drawn for.

## Forest plot

Three rows — lower bound, estimate, upper bound — one cell per study, the
error bar encoding unchanged, because a forest plot's magnitudes *are* an
error bar's.

**What the display adds is the scanning.** A forest plot is read by sweeping
down the column of intervals to see which ones clear the null line and which
sit across it, and that is a shape rather than a sequence of numbers. Three
rows of cells put the lower bounds, the estimates and the upper bounds each on
their own line, so a finger running along the lower-bound row feels exactly
the comparison the figure is drawn for.

```
Section       Cells
upper bound   ⠤⠶⣿⠶⠤
estimate      ⠤⠴⠶⠴⠤
lower bound   ⠂⠆⠶⠆⠂
```

**Two things the dots deliberately do not carry.**

The **null line** has no representation. It is a position on the value axis,
not a magnitude, and a cell height cannot say "this is where one is". Whether
a study crosses it is announced instead, because it is a verdict rather than a
shape — and it is the one fact a reader would otherwise have to reconstruct by
comparing two cells against a number that appears nowhere on the display.

The **weight** has none either. A forest plot encodes it as marker area, and
braille has one dimension per cell, already spent on the magnitude. Encoding
weight in place of the value would trade a number the reader needs for one
they can be told; it is announced alongside the estimate instead.

### Multiline Displays

Forest plots use one line per section on a multiline display, so all three
rows of the comparison are under the hand at once.

## Kaplan-Meier survival curve

One row per arm, one cell per time, the line encoding — which is what a step
chart's braille already is, and a survival curve is a step chart.

The shape is the reading. A curve that falls early and steeply is a row of
cells dropping away fast; a curve that holds is a run at the same height; and
two arms separating is two rows that start together and end apart, felt in one
sweep rather than reconstructed from two passes.

```
Arm         Cells
Control     ⣿⣶⠶⠦⠤⠄⠂
Treatment   ⣿⣿⣶⣶⣶⠶⠶
```

**Censoring marks have no representation, and need none.** A censored time is
a subject who left the study without the event happening, and the curve does
not step there — so the cell is the same cell it would have been, and marking
it would put an annotation in the display where the reader expects the data.
It is announced instead, because it changes not the estimate but how much of
the estimate is still supported: a flat tail carried by two hundred subjects
and one carried by three are the same run of dots and mean entirely different
things.

**The confidence band has none either**, for the reason it has none on any
line: a cell has one height, already spent on the estimate. The band is
announced alongside each time.

### Multiline Displays

Survival curves use one line per arm on a multiline display, so the moment two
arms separate can be found by running two fingers along together until they
part.

## Mosaic and marimekko

One row per series plus the total row, one cell per category — the stacked bar
encoding, which is what a mosaic's segments are.

**The width has no representation, and that is a real loss rather than a
non-issue.** A braille cell has one dimension, already spent on the segment's
magnitude, so the only way to show a wider column would be to give it more
cells — and the number of cells is the reader's index into the table. A
display where `Third` occupied three cells and `First` one would put the two
in different columns, and every comparison down a row would be against a
different category.

So the cells carry the conditional proportions and the **width is announced**:
each cell says its column's share of all observations, and the description
lists the whole marginal distribution.

```
Series      Cells
Survived    ⣶⠶⠦
Died        ⠦⠶⣶
Total       ⣿⣿⣿
```

The total row is full across, as it must be: a mosaic's columns each sum to
one whatever their width. That is precisely why the width cannot be inferred
from the dots, and why it is worth saying out loud.

### Multiline Displays

Mosaics use one line per series on a multiline display, so the conditional
proportions can be swept across the categories in one pass.

## Multiline Braille Display Support

By leveraging the two-dimensional nature of multiline braille displays, MAIDR can represent multiple lines of a plot simultaneously, allowing users to perceive the distribution of values across all lines at once. This is particularly beneficial for plots with multiple groups or categories, such as grouped boxplots or line plots with multiple lines, and it also applies to scatter plot grid navigation.

### Setup

Users can set up multiline braille display support by following these steps:

1. Open any plot in MAIDR.
2. Press `Ctrl+,` (`Command+,` on macOS) to open the settings dialog.
3. Press Tab to reach the Braille Display options.
	- If your braille display model is listed, choose "Single line" or "Multi-line", then tab to the Single-Line Display or Multi-Line Display dropdown and select your braille display model.
	- If your braille display model is not listed, choose "Configure manually", then enter Braille Display Size (cells per row) and Braille Display Lines (rows). Set the number of lines to 1 for a single-line display.
4. Press `Alt+S` to save and close the settings dialog.
