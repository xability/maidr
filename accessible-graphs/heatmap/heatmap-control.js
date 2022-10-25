var curr_row = -1;
var curr_col = -1;
var enableDisplay = true;
var infoDiv = document.getElementById("info");

var rect;
var svg_height = parseFloat((svg.getAttribute('height')).slice(0, -2));
var square_height = document.getElementById(squares[0]).getAttribute('height');

svg_container.addEventListener("keydown", function (e) {
    // spacebar for text
    if (e.which == 32) {
        if (enableDisplay) {
            displayValues(curr_row, curr_col);
        }
    }
    
    // right arrow 39
    if (e.which === 39) {
        if (curr_col == -1 && curr_row == -1) {
            curr_col++;
            curr_row++;
            rect = createSquare();
            displayValues(curr_row, curr_col);
        } else if (curr_col > -1 && curr_col < num_cols - 1) {
            curr_col++;
            select(rect, curr_row, curr_col);
            displayValues(curr_row, curr_col);
        }
    }

    // left arrow 37
    if (e.which === 37) {
        if (curr_col > 0 && curr_col < num_cols) {
            curr_col--;
            select(rect, curr_row, curr_col);
            displayValues(curr_row, curr_col);
        }
    }

    // up arrow 38
    if (e.which === 38) {
        if (curr_row > 0 && curr_row < num_rows) {
            curr_row--;
            select(rect, curr_row, curr_col);
            displayValues(curr_row, curr_col);
        }
    }

    // down arrow 40
    if (e.which === 40) {
        if (curr_row > -1 && curr_row < num_rows - 1) {
            curr_row++;
            select(rect, curr_row, curr_col);
            displayValues(curr_row, curr_col);
        }
    }

    // t toggle 
    if (e.which == 84) {
        if (enableDisplay) {
            infoDiv.style.display = "none";
        } else {
            infoDiv.style.display = "block";
        }
        enableDisplay = !enableDisplay;
    }
});

function createSquare() {
    var adjusted_y_coord = svg_height - y_coord[0][0] - square_height;

    var svgns = "http://www.w3.org/2000/svg";
    var rect = document.createElementNS(svgns, 'rect');
    rect.setAttribute('x', x_coord[0][0].toString());
    rect.setAttribute('y', adjusted_y_coord.toString());
    rect.setAttribute('height', square_height.toString());
    rect.setAttribute('width', square_height.toString());
    rect.setAttribute('stroke', 'rgb(3, 200, 9)');
    rect.setAttribute('stroke-width', '4');
    rect.setAttribute('fill', 'none');
    svg.appendChild(rect);
    return rect;
}

function select(rect, row, col) {
    rect.setAttribute('x', unique_x_coord[col].toString());
    rect.setAttribute('y', (svg_height - unique_y_coord[row] - square_height).toString());
}

function displayValues(row, col) {
    this.document.getElementById("x-cat").innerHTML = "island: " + x_categories[col];
    this.document.getElementById("y-cat").innerHTML = "species: " + y_categories[row];
    this.document.getElementById("z-val").innerHTML = "n: " + z_values[row][col];
    this.document.getElementById("x-coord").innerHTML = "row: " + (row + 1).toString();
    this.document.getElementById("y-coord").innerHTML = "column: " + (col + 1).toString();
  }