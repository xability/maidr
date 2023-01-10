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

# Extrac boxplot stat values
mpg %>%
  group_by(class) %>%
  summarise(
    lower_outlier = paste0(boxplot.stats(hwy)$out[boxplot.stats(hwy)$out < boxplot.stats(hwy)$stats[[1]]], collapse = ", "),
    minimum = boxplot.stats(hwy)$stats[[1]],
    Q1 = boxplot.stats(hwy)$stats[[2]],
    median = boxplot.stats(hwy)$stats[[3]],
    Q3 = boxplot.stats(hwy)$stats[[4]],
    maximum = boxplot.stats(hwy)$stats[[5]],
    upper_outlier = paste0(boxplot.stats(hwy)$out[boxplot.stats(hwy)$out > boxplot.stats(hwy)$stats[[5]]], collapse = ", ")
  ) %>%
  jsonlite::write_json("boxplot_data.json")

# gt::gt() %>%
# gtsave("boxplot_data_frame.html")
left_boxside <- median - Q1
right_boxside <- Q3 - median


lower_whisker_length <- Q1 - minimum
upper_whisker_length <- maximum - Q3
range_vector <- c(lower_whisker_length, left_boxside, right_boxside, upper_whisker_length)
total_box_length <- sum(range_vector)
boxplot_ratio <- (range_vector / total_box_length) * 100
# Drop decimal point
boxplot_ratio <- round(boxplot_ratio, 0)




if (left_boxside == right_boxside) {
  box_brl <- "⠿⠸⠇⠿"
} else if (left_boxside < right_boxside) {
  relative_ratio <- round((right_boxside / left_boxside), 0)
  box_brl <- "⠿⠸⠇" + strrep("⠿", relative_ratio)
} else {
  relative_ratio <- round((left_boxside / right_boxside), 0)
  box_brl <- strrep("⠿", relative_ratio) + "⠸⠇⠿"
}

lower_whisker_length <- Q1 - min
upper_whisker_length <- max - Q3

if (lower_whisker_length == upper_whisker_length) {
  "⠒" + box_brl + "⠒"
} else if (lower_whisker_length < upper_whisker_length) {
  "⠒" + box_brl + "⠒⠒"
} else {
  "⠒⠒" + box_brl + "⠒"
}


# Scatter plot sample
ggplot(data = mpg, mapping = aes(x = displ, y = hwy)) +
  # geom_point(position = "jitter") +
  geom_point() +
  geom_smooth(method = "loess", se = FALSE)

# Save ggplot data to json
library(tidyverse)
library(tidymodels)

# Best Line
g <- ggplot(data = mpg, mapping = aes(x = displ, y = hwy)) +
  geom_point() +
  geom_smooth(method = "loess", se = FALSE)

point_layer <- layer_data(g, 1) %>%
  select(x, y)


smooth_layer <- layer_data(g, 2) %>%
  select(x, y)


point_layer %>%
  jsonlite::write_json("point_layer.json")

smooth_layer %>%
  jsonlite::write_json("smooth_layer.json")


gridSVG::grid.export("scatterplot_no_jitter_with_loess_curve.svg")
dev.off()





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
