# Load required packages
library(gridSVG)
library(ggplot2)
library(gt)
library(tidymodels)

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
ggplot(data = mpg, mapping = aes(x = displ, y = hwy)) +
    geom_point(position = "jitter") +
    geom_smooth(method = "lm", se = FALSE)

library(tidymodels)
lm_fit <- linear_reg() %>%
    set_engine("lm") %>%
    fit(hwy ~ displ, data = mpg)

fit_tidy <- tidy(lm_fit$fit)

fit_tidy %>%
    gt()

# Need to learn how sonify package draw a smoothed line
prediction <- augment(lm_fit$fit)$.fitted

resid <- augment(lm_fit$fit)$.resid

jsonlite::toJSON(prediction) %>%
    jsonlite::write_json("prediction_array.json")


jsonlite::toJSON(resid) %>%
    jsonlite::write_json("residual_array.json")


lm_df <- augment(lm_fit$fit)

lm_df %>%
    ggplot(aes(x = .resid)) +
    geom_histogram()


gridSVG::grid.export("histogram_for_residual.svg")
dev.off()


# Residual = actual y value - predicted y

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
