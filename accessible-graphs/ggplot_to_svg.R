library(gridSVG)
library(ggplot2)

ggplot(mpg, aes(class)) +
    geom_bar()

gridSVG::grid.export("barplot.svg")
dev.off()
