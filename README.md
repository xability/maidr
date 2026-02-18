<div align="center">
  <img src="docs/logo.svg" width="350px" alt="A stylized MAIDR logo, with curved characters for M A, a hand pointing for an I, the D character, and R represented in braille."/>
  <hr style="color:transparent" />
  <br />
</div>

# MAIDR: Multimodal Access and Interactive Data Representation

- **Note:** `maidr` package has been completely rewritten in TypeScript for better architecture and performance. The previous version is now archived at [xability/maidr-legacy](https://github.com/xability/maidr-legacy).

`maidr` (pronounced as 'mader') is a system for non-visual access and control of statistical plots.
It aims to provide an inclusive experience for users with visual impairments by offering multiple modes of interaction:
braille, text, and sonification (BTS).
This comprehensive approach enhances the accessibility of data visualization
and encourages a multi-modal exploration on visualization.

## Table of Contents

1. [Usage](#usage)
2. [Data Schema](#data-schema)
3. [Controls](#controls)
4. [Braille Generation](#braille-generation)
5. [Examples](#examples)
6. [API](#api)
7. [Binders](#binders)
8. [Papers](#papers)
9. [License](#license)
10. [Contact](#contact)
11. [Acknowledgments](#acknowledgments)

## Usage

To use maidr, follow these steps:

1. **Import your plot or plot**: maidr is designed to work seamlessly with scalable vector graphics (SVG) objects for visual highlighting. However, maidr is inherently visual-agnostic, and it also supports other raster image formats such as PNG and JPG without the visual highlight feature. Regardless of the image format, maidr provides support for all non-visual modalities, including Braille, text, and sonification (BTS). Additionally, it offers interactive and artificial intelligence (AI) plot descriptions powered by OpenAI GPT-4 Vision and Google Gemini Pro-Vision. The supported plot types include bar plot, boxplot, heatmap, scatter plot, line plot, histogram, segmented bar plots (e.g., stacked bar plot, side-by-side dodged plot, and normalized stacked bar plot).

2. **Create an HTML file**: Include the main script file `maidr.js` or `maidr.min.js` as well as the stylesheet `styles.css` or `styles.min.css`. Add the SVG of your plot to the main HTML body, and add an ID attribute of your choice to the SVG. Note that this can be automated with R. Your HTML file should now have the following structure:

   ```html
   <!doctype html>
   <html lang="en">
     <head>
       <meta charset="UTF-8" />
       <title>maidr Example</title>
       <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maidr@latest/dist/maidr_style.css" />
       <script src="https://cdn.jsdelivr.net/npm/maidr@latest/dist/maidr.js"></script>
     </head>
     <body>
       <div>
         <!-- Your SVG plot is here -->
       </div>
     </body>
   </html>
   ```

3. **Add your data**: Define the maidr JSON schema for your plot. See the [Data Schema](docs/SKIMA.md) documentation for the full schema structure, object properties, and data formats for each plot type.

## Data Schema

The maidr JSON schema defines how plot data is structured for each supported plot type, including bar plots, boxplots, heatmaps, scatter plots, line plots, histograms, and segmented bar plots.
For the full schema structure, object properties, and data formats, see the [Data Schema documentation](docs/SKIMA.md).

## Controls

maidr provides keyboard-based interaction for navigating and exploring plots. Users can move through data points with arrow keys and toggle between braille, text, and sonification modes.
For the complete list of keyboard shortcuts and interaction controls, see the [Controls documentation](docs/CONTROLS.md).

## Braille Generation

MAIDR incorporates a Braille mode that represents plots using Braille symbols, allowing users to explore data using a refreshable Braille display. Different plot types use unique encoding strategies tailored to convey data distribution, patterns, and trends.
For detailed encoding schemes for each plot type, see the [Braille Generation documentation](docs/BRAILLE.md).

## Examples

Example plots are demonstrated [here](https://xabilitylab.ischool.illinois.edu/maidr/).

For more information, refer to the example HTML files provided in the directory docs/examples

## API

MAIDR is available via a restful API.
Learn more about the usage at [maidr-api](https://github.com/xability/maidr-api) repo.

## Binders

We currently provide the following binders, all of which can be found at each repo:

- [x] Python binder for matplotlib and seaborn: [Py maidr](https://github.com/xability/py-maidr).

- [ ] R binder for ggplot2: [r maidr](https://github.com/xability/r-maidr).

## Papers

To learn more about the theoretical background and user study results, we recommend you read and cite the following papers.

1. [MAIDR: Making Statistical Visualizations Accessible with Multimodal Data Representation](https://dl.acm.org/doi/10.1145/3613904.3642730):

```tex
@inproceedings{seoMAIDRMakingStatistical2024,
  title      = {{{MAIDR}}: {{Making Statistical Visualizations Accessible}} with {{Multimodal Data Representation}}},
  shorttitle = {{{MAIDR}}},
  booktitle  = {Proceedings of the {{CHI Conference}} on {{Human Factors}} in {{Computing Systems}}},
  author     = {Seo, JooYoung and Xia, Yilin and Lee, Bongshin and Mccurry, Sean and Yam, Yu Jun},
  year       = {2024},
  month      = may,
  series     = {{{CHI}} '24},
  pages      = {1--22},
  publisher  = {Association for Computing Machinery},
  address    = {New York, NY, USA},
  doi        = {10.1145/3613904.3642730},
  urldate    = {2024-05-14},
  abstract   = {This paper investigates new data exploration experiences that enable blind users to interact with statistical data visualizations---bar plots, heat maps, box plots, and scatter plots---leveraging multimodal data representations. In addition to sonification and textual descriptions that are commonly employed by existing accessible visualizations, our MAIDR (multimodal access and interactive data representation) system incorporates two additional modalities (braille and review) that offer complementary benefits. It also provides blind users with the autonomy and control to interactively access and understand data visualizations. In a user study involving 11 blind participants, we found the MAIDR system facilitated the accurate interpretation of statistical visualizations. Participants exhibited a range of strategies in combining multiple modalities, influenced by their past interactions and experiences with data visualizations. This work accentuates the overlooked potential of combining refreshable tactile representation with other modalities and elevates the discussion on the importance of user autonomy when designing accessible data visualizations.},
  isbn       = {9798400703300},
  keywords   = {Accessibility,Blind,Braille Display,Multimodality,Screen Readers,Statistical Visualization}
}
```

2. [Designing Born-Accessible Courses in Data Science and Visualization: Challenges and Opportunities of a Remote Curriculum Taught by Blind Instructors to Blind Students](https://diglib.eg.org/items/5e71b594-3762-4604-a9c4-96623cda8bc3):

```tex
@inproceedings{10.2312:eved.20241053,
  booktitle = {EuroVis 2024 - Education Papers},
  editor    = {Firat, Elif E. and Laramee, Robert S. and Andersen, Nicklas Sindelv},
  title     = {{Designing Born-Accessible Courses in Data Science and Visualization: Challenges and Opportunities of a Remote Curriculum Taught by Blind Instructors
               to Blind Students}},
  author    = {JooYoung Seo and Sile O'Modhrain and Yilin Xia and Sanchita Kamath and Bongshin Lee and James M. Coughlan},
  year      = {2024},
  publisher = {The Eurographics Association},
  isbn      = {978-3-03868-257-8},
  doi       = {10.2312/eved.20241053}
}
```

## License

This project is licensed under the GPL 3 License.

## Contact

For any inquiries or suggestions, please contact the principal investigator:

JooYoung Seo - jseo1005@illinois.edu

## Acknowledgments

This project is conducted through the (x)Ability Design Lab at the University of Illinois at Urbana-Champaign, and funded by multiple grants, including:

- The National Science Foundation (NSF) \#2348166

- The Institute of Museum and Library Services (IMLS) \#RE-254891-OLS-23

- Teach Access Faculty Grant

- The Wallace Foundation Grant and the International Society of the Learning Sciences

- The PI's faculty startup grant
