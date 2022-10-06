// get heatmap svg and rect componenets
const svg = document.getElementById("heatmap-svg");
const svg_container = document.getElementById("heatmap-svg-container");
const squares = ["geom_rect.rect.2.1.1", "geom_rect.rect.2.1.2", "geom_rect.rect.2.1.3", "geom_rect.rect.2.1.4", "geom_rect.rect.2.1.5"];

var x_categories = ["Biscoe", "Dream", "Torgersen"];
var y_categories = ["Gentoo", "Chinstrap", "Adelie"];
var z_values = [[124, 0, 0], [0, 68, 0], [56, 52, 44]];

// sort the squares to access from left to right, up to down
squares.sort(compareX);
squares.sort(compareY);

// get the x_coord and y_coord to check if a square exists at the coordinates
var x_coord_check = squares.map(getXCoords);
var y_coord_check = squares.map(getYCoords);

// get unique elements from x_coord and y_coord
var unique_x_coord = [...new Set(x_coord_check)];
var unique_y_coord = [...new Set(y_coord_check)];

// get num of rows, num of cols, and total numbers of squares
var num_rows = unique_y_coord.length;
var num_cols = unique_x_coord.length;

// variables for audio
const MAX_FREQUENCY = 1000;
const MIN_FREQUENCY = 100;

var rgb_norms = [];
// get norm of rgb for frequency
for (var i = 0; i < squares.length; i++) {
    var rgb_text = document.getElementById(squares[i]).getAttribute('fill');
    var rgb_string = rgb_text.slice(4, -1);
    var rgb_array = rgb_string.split(',');
    var rgb_norm = Math.sqrt(rgb_array.map(function (x) {
        return Math.pow(x, 2);
    }).reduce(function (a, b) {
        return a + b;
    }));
    rgb_norms.push(rgb_norm);
}

var ymin = Math.min(...rgb_norms);
var ymax = Math.max(...rgb_norms);
const range = (ymax - ymin) / 3;

// 2D array to check if a box exists at a location
// var present = Array(num_rows).fill().map(() => Array(num_cols).fill(0));
var x_coord = Array(num_rows).fill().map(() => Array(num_cols).fill(0));
var y_coord = Array(num_rows).fill().map(() => Array(num_cols).fill(0));
var norms = Array(num_rows).fill().map(() => Array(num_cols).fill(0));

for (var i = 0; i < squares.length; i++) {
    var x_index = unique_x_coord.indexOf(x_coord_check[i]);
    var y_index = unique_y_coord.indexOf(y_coord_check[i]);
    // present[y_index][x_index] = 1;
    x_coord[y_index][x_index] = x_coord_check[i];
    y_coord[y_index][x_index] = y_coord_check[i];
    norms[y_index][x_index] = rgb_norms[i];
}

console.log(x_coord);
console.log(y_coord);
console.log(norms);

// function getRgbNorm(row, col) {
//     var rgb_text = document.getElementById(squares_reshape[row][col]).getAttribute('fill');
//     var rgb_string = rgb_text.slice(4, -1);
//     var rgb_array = rgb_string.split(',');
//     var rgb_norm = Math.sqrt(rgb_array.map(function(x) {
//         return Math.pow(x, 2);
//     }).reduce(function(a, b) {
//         return a + b;
//     }));
//     return rgb_norm;
// }

// HELPER FUNCTIONS
function getXCoords(item) {
    return document.getElementById(item).getAttribute('x');
}

function getYCoords(item) {
    return document.getElementById(item).getAttribute('y');
}

function compareX(a, b) {
    return document.getElementById(a).getAttribute('x') - document.getElementById(b).getAttribute('x');
}

function compareY(a, b) {
    return document.getElementById(b).getAttribute('y') - document.getElementById(a).getAttribute('y');
}