# Braille Generation

MAIDR incorporates a Braille mode that represents the plot using Braille symbols.
This allows users with visual impairments to explore and interact with the plot using a refreshable Braille display.
To achieve this,
our system translates the plot's visual elements and data points into a corresponding tactile representation
using Braille patterns.
For different plot types, such as bar plot, boxplot, heatmap, and scatter plot,
maidr employs unique encoding strategies tailored to effectively convey the data distribution, patterns, and trends.
These tactile encodings range from using distinct Braille characters to represent value ranges,
to using characters that visually resemble the corresponding sections of a plot.
By providing a comprehensive Braille representation for various plot types,
maidr enables users with visual impairments to gain a deeper understanding of the underlying data and its insights.

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
- blank spaces represent empty spaces

We also impose some overarching rules:

1. Each section must be represented with at least one braille character, assuming they have some positive length.
2. Differences or equalities in whiskers and quartiles must be upheld. That is, if the min and max whisker are of equal length, they must have the same number of braille characters, or if they're different, the number of characters must be different.
3. A set character always represents zero length sections, such as outliers and the median. ⠂ in the case of outliers, ⠸⠇ in the case of the median.

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

## Scatter plot

In the Braille representation of a scatter plot, the encoding is performed only for the line layer (layer 2).
The method is similar to that used for bar plots,
wherein data values are represented as Braille characters based on their relative magnitude within the plot.
Low values are denoted by dots along the bottom, while high values are indicated by dots along the top.
With four height levels of Braille, the encoding is as follows:

- ⣀ represents values from 0% to 25%
- ⠤ represents values from 25% to 50%
- ⠒ represents values from 50% to 75%
- ⠉ represents values from 75% to 100%

## Segmented Bar Plots

Stacked bar, dodged bar, and normalized stacked bar all share the same system:

In the braille representation of segmented bar plots, braille depends on where you are. There are typically multiple levels to a segmented bar plot, and as you move (Up and Down arrow keys) between levels, the braille changes to represent your current level. At the top, there is also a Summary pseudo level of all levels added together, and a Combined pseudo level of each level separately.

- Regular level: Braille appears similar to a bar plot, with braille values corresponding to the size of the level's value for this point.
- Summary level: Same as regular level, but values now reflect the combined size of all levels' values for this point.
- Combined level: Similar to heatmap, where there are groups of magnitudes for each point separated by a ⢳ character. The first group has braille characters for each level for the first point, then a separator, then the second group has braille characters for each level in the second point, then a separator, and so on.

## Line plot

In the Braille representation of a line plot, braille is nearly identical to the above bar plot:
data values are encoded as Braille characters based on their relative magnitude within the plot.
Low values are denoted by Braille characters that have dots only along the bottom,
while high values are indicated by characters that have dots higher up.
