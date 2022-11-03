# Load required packages
library(gridSVG)
library(ggplot2)

# Bar plot sample
ggplot(mpg, aes(class)) +
    geom_bar()


gridSVG::grid.export("barplot.svg")
dev.off()


# Box plot sample
ggplot(data = mpg, mapping = aes(x = class, y = hwy)) +
    geom_boxplot() +
    coord_flip()

gridSVG::grid.export("boxplot.svg")
dev.off()

# Scatter plot sample
ggplot(data = mpg) +
    geom_point(mapping = aes(x = displ, y = hwy), position = "jitter")

gridSVG::grid.export("scatterplot.svg")
dev.off()


# Heat map sample
## More example: https://r-charts.com/correlation/heat-map-ggplot2/
library(palmerpenguins)
library(dplyr)

penguins %>%
    count(island, species, sort = TRUE) %>%
    ggplot(aes(x = island, y = species, fill = n)) +
    geom_tile(color = "black") +
    coord_fixed()

gridSVG::grid.export("heatmap.svg")
dev.off()
