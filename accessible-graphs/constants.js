// get x and y axes information
// use regular expressions

// barplot.svg
// const bars = ["geom_rect.rect.56.1.1", "geom_rect.rect.56.1.2", "geom_rect.rect.56.1.3", "geom_rect.rect.56.1.4", "geom_rect.rect.56.1.5", "geom_rect.rect.56.1.6", "geom_rect.rect.56.1.7"];
// const x_axes = ["GRID.text.70.1.1.tspan.1", "GRID.text.70.1.2.tspan.1", "GRID.text.70.1.3.tspan.1", "GRID.text.70.1.4.tspan.1", "GRID.text.70.1.5.tspan.1", "GRID.text.70.1.6.tspan.1", "GRID.text.70.1.7.tspan.1"];

// barplot.diamonds_gridSVG.svg
const svg = document.getElementById("svg");
const bars = ["geom_rect.rect.2.1.1", "geom_rect.rect.2.1.2", "geom_rect.rect.2.1.3", "geom_rect.rect.2.1.4", "geom_rect.rect.2.1.5"];
const x_axes = ["GRID.text.16.1.1.text", "GRID.text.16.1.2.text", "GRID.text.16.1.3.text", "GRID.text.16.1.4.text", "GRID.text.16.1.5.text"];

const height = bars.map(getHeight);
const x_values = x_axes.map(getX);

var y_val = sessionStorage.getItem("yVal");
var y_values;
if (y_val != null) {
    y_values = y_val.split(",");
} else {
    // if we open this file before asking for y values
    y_values = height;
}

const _numBars = bars.length;

const MAX_FREQUENCY = 1000;
const MIN_FREQUENCY = 100;

const ymin = Math.min(...height);
const ymax = Math.max(...height);

const range = (ymax - ymin) / 4;

function getHeight(item) {
    return document.getElementById(item).getAttribute('height');
}
  
function getX(item) {
    return document.getElementById(item).innerHTML;
}