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
