# MAIDR: Multimodal Access and Interactive Data Representation

MAIDR is a system for non-visual access and control of statistical charts. It aims to provide an inclusive experience for users with visual impairments by offering multiple modes of interaction: sonification, braille, and text. This innovative approach enhances the accessibility of data visualization and encourages a multi-model exploration on visualization. Check out the current build: [MAIDR Demo](https://uiuc-ischool-accessible-computing-lab.github.io/MAIDR/user_study_pilot/intro.html).

## Table of Contents

1. [Usage](#usage)
2. [Controls](#controls)
3. [Braille Generation](#braille-generation)
4. [License](#license)
5. [Contact](#contact)
6. [Acknowledgements](#acknowledgements)

## Usage

To use MAIDR, follow these steps:

1. **Import your chart or plot**: MAIDR is designed to work seamlessly with ggplot in R, with a focus on highlighting SVG elements. The supported chart types include barplot, boxplot, heatmap, and scatterplot.

2. **Create an HTML file**: Place the SVG of your chart inside a `div` element with the ID `svg_container`. Include the following script files: `constants.js`, `audio.js`, `display.js`, and the script file corresponding to your chart type (e.g., `barplot.js`). Also, include the `styles.css` file for proper styling. Your HTML file should have the following structure:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>MAIDR Example</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div id="svg_container">
      <!-- Your SVG chart goes here -->
    </div>
    <script>
      <!-- data goes here -->
    </script>
    <script src="constants.js"></script>
    <script src="audio.js"></script>
    <script src="display.js"></script>
    <script src="barplot.js"></script>
  </body>
</html>
```

3. Add your data: Include your data as JavaScript variables directly in the HTML file. Refer to the example HTML files provided in the repository for the appropriate data structure.

## Controls

To interact with the charts using MAIDR, follow these steps:

1. Press the **Tab** key to focus on the SVG element.
2. Use the **arrow keys** to move around the chart.
3. Press **B** to toggle Braille mode.
4. Press **S** to toggle Sonification (tones) mode.
5. Press **T** to toggle Text mode.

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
| Repeat current sound                    | Space                       | Space                       |
| Auto-play outward in direction of arrow | Control + Shift + Arrow key | Command + Shift + Arrow key |
| Auto-play inward in direction of arrow  | Alt + Shift + Arrow key     | Option + Shift + Arrow key  |
| Stop Auto-play                          | Control                     | Command                     |
| Auto-play speed up                      | Period                      | Period                      |
| Auto-play speed down                    | Comma                       | Comma                       |

### Scatterplot Controls

In the Scatterplot chart, there are two layers: point mode (layer 1) and line mode (layer 2). To switch between these layers, use the Page Up and Page Down keys:

- Press Page Up to move from point mode to line mode
- Press Page Down to move from line mode to point mode

## Braille Generation

MAIDR incorporates a Braille mode that represents the chart using Braille symbols. This allows users with visual impairments to explore and interact with the chart using a refreshable Braille display. To achieve this, our system translates the chart's visual elements and data points into a corresponding tactile representation using Braille patterns. For different chart types, such as barplot, boxplot, heatmap, and scatterplot, MAIDR employs unique encoding strategies tailored to effectively convey the data distribution, patterns, and trends. These tactile encodings range from using distinct Braille characters to represent value ranges, to employing characters that visually resemble the corresponding sections of a chart. By providing a comprehensive Braille representation for various chart types, MAIDR enables users with visual impairments to gain a deeper understanding of the underlying data and its insights.

### Barplot

In the Braille representation of a barplot, data values are encoded as Braille characters based on their relative magnitude within the chart. Low values are denoted by Braille characters that have dots only along the bottom, while high values are indicated by characters that are filled with dots. Given the four height levels of Braille, the encoding is as follows:

- ⣀ represents values 0 to 25%
- ⠤ represents the 25% to 50%
- ⠒ represents the 50% to 75%
- ⠉ represents the 75% to 100%

This tactile encoding allows users to easily differentiate between the various value ranges in the barplot, facilitating their understanding of the data distribution and its underlying trends.

### Heatmap

In the Braille representation of a heatmap, values are depicted based on their relative magnitude within the chart, much like the approach used for barplots and scatterplots. Low values are denoted by Braille characters with dots only along the bottom, high values are represented by characters filled with dots, and blank or null values are indicated by empty spaces. With three height levels of Braille, the encoding is as follows:

- ⠤ represents values from 0% to 33%
- ⠒ represents values from 33% to 66%
- ⠉ represents values from 66% to 100%
- "⠀" (braille space) represents null or empty values
- "⢳" represents a row seperator

### Boxplot

The Braille representation of a boxplot employs Braille characters that visually resemble the corresponding sections of the boxplot. The size of each section is denoted by the number of Braille characters used. The sections are encoded as follows:

- ⠂ represents lower outlier and upper outlier(s)
- ⠒ represents the left or right whiskers
- ⠿ represents the second or third quartiles
- ⠇ represents the 50% midpoint (median)
- blank spaces represent empty spaces

We also impose some overarching rules:

- Each section must be represented with at least 1 braille character, assuming they have some positive length.
- Differences or equalities in whiskers and quartiles must be upheld. That is, if the min and max whisker are of equal length, they must have the same number of braille characters, or if they're different, the number of characters must be different.

This tactile encoding enables users to discern the various components of the boxplot, allowing them to comprehend the data distribution, detect outliers, and identify central tendencies and dispersion within the dataset.

To generate the braille, we use an algorithm that generates a distribution of characters based on a given proportional distribution and a specified total number of characters. This can be described mathematically as follows:

c_i = round(n _ p_i), for i = 1, 2, 3, ..., k
c_i = round((n - C) _ p_i), for i = 1, 2, 3, ..., k

Where

- n: Total number of characters (integer)
- C: Total number of length 0 characters to offset the total characters (outliers and median) (integer)
- p_i: Proportional distribution of each category i, where i ∈ {1, 2, 3, ..., k} (real numbers, 0 ≤ p_i ≤ 1, and the sum of all p_i equals 1)
- c_i: Number of characters for each category i (integer)

As an example, consider a boxplot with the following:

- Visual sections from left to right: blank space, outlier, larger blank space, large min whisker, moderate sized lower quartile, the median, moderate sized upper quartile, another larger max whisker, a large blank space, an outlier, a small blank space, then another outlier
- Distribution for these sections: [10, 0, 20, 40, 30, 0, 30, 60, 50, 30, 0, 10, 0]
- An offset of 5 to account for 0 length characters
- A braille display length of 33

We normalize these distributions, taking into account the values that will need default characters (meaning n changes to 28 with the offset of C = 5): (p_i): [10/280, 0/280, 20/280, 40/280, 30/280, 0/280, 30/280, 60/280, 50/280, 30/280, 0/280, 10/280, 0/280]
Then we apply our equation:
n = 33
C = 5

c_i = round((n - C) \* p_i), for i = 1, 2, 3, ..., 11

- c_1 = round(28 \* 0.0357) = round(1) = 1
- c_2 = round(28 \* 0) = round(0) = 0
- c_3 = round(28 \* 0.0724) = round(2) = 2
- c_4 = round(28 \* 0.1429) = round(4) = 4
- c_5 = round(28 \* 0.1071) = round(3) = 3
- c_6 = round(28 \* 0) = round(0) = 0
- c_7 = round(28 \* 0.1071) = round(3) = 3
- c_8 = round(28 \* 0.2143) = round(6) = 6
- c_9 = round(28 \* 0.1786) = round(5) = 5
- c_10 = round(28 \* 0.1071) = round(3) = 3
- c_11 = round(28 \* 0) = round(0) = 0
- c_12 = round(28 \* 0.0357) = round(1) = 1
- c_13 = round(28 \* 0) = round(0) = 0

To account for rounding errors, we run this process a few times, allocating a positive or negative number of additional characters to the set, and as a fallback, finally add or remove them from the sections with the most characters.

Last, we enforce our overarching rules:

- c_1 = 1
- c_2 = 1
- c_3 = 2
- c_4 = 4
- c_5 = 3
- c_6 = 2
- c_7 = 3
- c_8 = 6
- c_9 = 5
- c_10 = 3
- c_11 = 1
- c_12 = 1
- c_13 = 1

And we get the braille output:

⠂ ⠒⠒⠒⠒⠿⠿⠿⠸⠇⠿⠿⠿⠒⠒⠒⠒⠒⠒ ⠂ ⠂

### Scatterplot

In the Braille representation of a scatterplot, the encoding is performed only for the line layer (layer 2). The method is similar to that used for barplots, wherein data values are represented as Braille characters based on their relative magnitude within the chart. Low values are denoted by dots along the bottom, while high values are indicated by dots along the top. With four height levels of Braille, the encoding is as follows:

- ⣀ represents values from 0% to 25%
- ⠤ represents values from 25% to 50%
- ⠒ represents values from 50% to 75%
- ⠉ represents values from 75% to 100%

## License

This project is licensed under the GPL 3 License.

## Contact

For any inquiries or suggestions, please contact the lead researcher:

JooYoung Seo - jseo1005@illinois.edu

## Acknowledgments

This project is conducted through the University of Illinois.
