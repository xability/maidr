
class Constants {

    // basic chart properties
    minX = 0;
    maxX = 0;
    plotId = 'geom_boxplot.gTree.68.1';
    svg_container = document.getElementById("svg-container");
    svg = document.querySelector("#svg-container > svg");
    chartType = ""; // set as 'boxplot' or whatever later

    // basic audio properties
    MAX_FREQUENCY = 1000;
    MIN_FREQUENCY = 100;

    // user controls
    duration = .3;
    vol = .5;
    audioPlay = 1; // true / false
    showRect = 1;  // true / false

    // debug stuff
    debugLevel = 5; // 0 = no console output, 1 = some console, 2 = more console, etc
}

<<<<<<< HEAD
class Position {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
=======
// temp use so that barplot still works
const bars = ["geom_rect.rect.2.1.1", "geom_rect.rect.2.1.2", "geom_rect.rect.2.1.3", "geom_rect.rect.2.1.4", "geom_rect.rect.2.1.5"];
const x_axes = ["GRID.text.16.1.1.text", "GRID.text.16.1.2.text", "GRID.text.16.1.3.text", "GRID.text.16.1.4.text", "GRID.text.16.1.5.text"];

// bookmark: setting this up to pull from various sources. Gotta figure out what we need for boxplot and seperate it out

const height = bars.map(getHeight);
const extracted_x_values = x_axes.map(getX);

var x_val = sessionStorage.getItem("xVal");
var y_val = sessionStorage.getItem("yVal");
var x_values;
var y_values;
var ymin;
var ymax;

if (y_val != null) {
    x_values = x_val.split(",");
    y_values = y_val.split(",").map(str => {
        return parseFloat(str);
    });
    ymin = Math.min(...y_values);
    ymax = Math.max(...y_values);
} else {
    // if we open this file before asking for y values
    x_values = extracted_x_values;
    y_values = height;
    ymin = Math.min(...height);
    ymax = Math.max(...height);
>>>>>>> main
}

// HELPER FUNCTIONS
class Helper {

    static containsObject(obj, arr) {
        for ( let i = 0 ; i < arr.length ; i++ ) {
            if ( arr[i] === obj ) return true;
        }
        return false;
    }
}

