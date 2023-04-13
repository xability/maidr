
# MAIDR: Multimodal Access and Interactive Data Representation

MAIDR is an interface for nonvisual access and control of scientific charts. It aims to provide an inclusive experience for users with visual impairments by offering multiple modes of interaction: sonification, braille, and text. This innovative approach enhances the accessibility of data visualization and encourages a more diverse scientific community. Check out the current build: [MAIDR Demo](https://uiuc-ischool-accessible-computing-lab.github.io/MAIDR/user_study_pilot/intro.html).

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
  <meta charset="UTF-8">
  <title>MAIDR Example</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="svg_container">
    <!-- Your SVG chart goes here -->
  </div>
  <script><!-- data goes here --></script>
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

| Function                               | Key                            |
|----------------------------------------|--------------------------------|
| Move around plot                       | Arrow keys                     |
| Go to the very left, right, up, or down | Control + Arrow key           |
| Select the first element               | Control + Home                 |
| Select the last element                | Control + End                  |
| Toggle Braille Mode                    | B                              |
| Toggle Sonification Mode               | S                              |
| Toggle Text Mode                       | T                              |
| Repeat current sound                   | Space                          |
| Auto-play outward in direction of arrow | Control + Shift + Arrow key   |
| Auto-play inward in direction of arrow | Alt + Shift + Arrow key       |
| Stop Auto-play                         | Control                        |
| Auto-play speed up                     | Period                         |
| Auto-play speed down                   | Comma                          |

## Braille Generation

MAIDR incorporates a Braille mode that represents the chart using Braille symbols. This allows users with visual impairments to explore and interact with the chart using a refreshable Braille display. To achieve this, our system translates the chart's visual elements and data points into a corresponding tactile representation using Braille patterns.

### Barplot

In the Braille representation of a barplot, data values are encoded as Braille characters based on their relative magnitude within the chart. Low values are denoted by Braille characters that have dots only along the bottom, while high values are indicated by characters that are filled with dots. Given the three height levels of Braille, the encoding is as follows:

 * ⠤ represents the lowest third of values
 * ⠶ represents the middle third of values
 * ⠿ represents the upper third of values

This tactile encoding allows users to easily differentiate between the various value ranges in the barplot, facilitating their understanding of the data distribution and its underlying trends.

### Boxplot

The Braille representation of a boxplot employs Braille characters that visually resemble the corresponding sections of the boxplot. The size of each section is denoted by the number of Braille characters used. The sections are encoded as follows:

 * ⠂ represents outlier(s)
 * ⠒ represents the minimum or maximum whiskers
 * ⠿ represents the first or third quartiles
 * ⠇ represents the 50% midpoint (median)
 * blank spaces represent empty spaces

We also impose some overarching rules:
 * Each section must be represented with at least 1 braille character
 * Differences or equalities in whiskers and quartiles must be upheld. That is, if the min and max whisker are of equal length, they must have the same number of braille characters, or if they're different, the number of characters must be different.

This tactile encoding enables users to discern the various components of the boxplot, allowing them to comprehend the data distribution, detect outliers, and identify central tendencies and dispersion within the dataset.

To generate the braille, we use an algorithm that generates a distribution of characters based on a given proportional distribution and a specified total number of characters. This can be described mathematically as follows:

c_i = round(n * p_i), for i = 1, 2, 3, ..., k
c_i = round((n - C) * p_i), for i = 1, 2, 3, ..., k

Where

 * n: Total number of characters (integer)
 * C: Total number of length 0 characters to offset the total characters (outliers and median) (integer)
 * p_i: Proportional distribution of each category i, where i ∈ {1, 2, 3, ..., k} (real numbers, 0 ≤ p_i ≤ 1, and the sum of all p_i equals 1)
 * c_i: Number of characters for each category i (integer)

As an example, consider a boxplot with the following:
 * Visual sections from left to right: blank space, outlier, larger blank space, large min whisker, moderate sized lower quartile, the median, moderate sized upper quartile, another large max whisker, a large blank space, an outlier, then a small blank space
 * Distribution for these sections: [10, 0, 20, 40, 30, 0, 30, 40, 50, 30, 0, 10]
 * A braille display length of 26

We normalize these distributions, taking into account the 3 values that will need default characters (meaning n changes to 23 with the offset of C = 3): (p_i): [10/260, 0/260, 20/260, 40/260, 30/260, 0/260, 30/260, 40/260, 50/260, 30/260, 0/260, 10/260]
Then we apply our equation: 
n = 26
C = 3

c_i = round((n - C) * p_i), for i = 1, 2, 3, ..., 11

 * c_1 = round(23 * 0.0385) = round(1) = 1
 * c_2 = round(23 * 0) = round(0) = 0
 * c_3 = round(23 * 0.0769) = round(2) = 2
 * c_4 = round(23 * 0.1538) = round(4) = 4
 * c_5 = round(23 * 0.1154) = round(3) = 3
 * c_6 = round(23 * 0) = round(0) = 0
 * c_7 = round(23 * 0.1154) = round(3) = 3
 * c_8 = round(23 * 0.1538) = round(4) = 4
 * c_9 = round(23 * 0.1923) = round(5) = 5
 * c_10 = round(23 * 0) = round(0) = 0
 * c_11 = round(23 * 0.0385) = round(1) = 1

Last, we enforce our overarching rules:

 * c_1 = 1
 * c_2 = 1
 * c_3 = 2
 * c_4 = 4
 * c_5 = 3
 * c_6 = 1
 * c_7 = 3
 * c_8 = 4
 * c_9 = 5
 * c_10 = 1
 * c_11 = 1

And we get the braille output:

 ⠂  ⠒⠒⠒⠒⠿⠿⠿⠇⠿⠿⠿⠒⠒⠒⠒     ⠂

### Heatmap

### Scatterplot


## License

This project is licensed under the MIT License. 

## Contact

For any inquiries or suggestions, please contact the lead researcher:

JooYoung Seo - jseo1005@illinois.edu

## Acknowledgments

This project is conducted through the University of Illinois.

