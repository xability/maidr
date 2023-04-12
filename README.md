
# MAIDR: Multimodal Access and Interactive Data Representation

MAIDR is an interface for nonvisual access and control of scientific charts. It aims to provide an inclusive experience for users with visual impairments by offering multiple modes of interaction: sonification, braille, and text. This innovative approach enhances the accessibility of data visualization and encourages a more diverse scientific community. Check out the current build: [MAIDR Demo](https://uiuc-ischool-accessible-computing-lab.github.io/MAIDR/user_study_pilot/intro.html).

## Table of Contents

1. [Usage](#usage)
2. [Controls](#controls)
3. [License](#license)
4. [Contact](#contact)
5. [Acknowledgements](#acknowledgements)

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
  <script src="constants.js"></script>
  <script src="audio.js"></script>
  <script src="display.js"></script>
  <script src="barplot.js"></script>
</head>
<body>
  <div id="svg_container">
    <!-- Your SVG chart goes here -->
  </div>
</body>
</html>
```

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

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For any inquiries or suggestions, please contact the lead researcher:

JooYoung Seo - jseo1005@illinois.edu

## Acknowledgments

This project is conducted through the University of Illinois.

