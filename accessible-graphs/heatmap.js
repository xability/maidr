document.addEventListener('DOMContentLoaded', function(e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // variable initialization

    // A few global variables, so sorry
    window.constants = new Constants('geom_rect.rect.2.1'); 
    window.position = new Position(-1, -1);
    window.plot = new HeatMap(constants.plotId);

    // setup for this chart
    constants.chartType = "heatmap";
    let rect = new HeatMapRect();
    let audio = new Audio();
    let display = new Display();

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        // right arrow 39
        if (e.which === 39) {
            position.x += 1;
        }
        // left arrow 37
        if (e.which === 37) {
            position.x += -1;
        }
        // up arrow 38
        if (e.which === 38) {
            position.y += 1;
            position.x = 0;
        }
        // down arrow 40
        if (e.which === 40) {
            position.y += -1;
            position.x = 0;
        }

        // toggle verbose
        if (e.which == 84) {
            constants.verbose = !constants.verbose;
        }

        // toggle braille 
        if (e.which == 66) {
            constants.showBraille = !constants.showBraille;
        }

        // lock to min / max postions
        if ( position.x < 1 ) {
            position.x = 0;
        }
        if ( position.y < 1 ) {
            position.y = 0;
        }
        if ( position.y > plot.plotData.length - 1 ) {
            position.y = plot.plotData.length - 1;
        }
        if ( position.x > plot.plotData[position.y].length - 1) {
            position.x = plot.plotData[position.y].length - 1;
        }

        if ( constants.showRect ) {
            rect.UpdateRect();
        }
        if ( constants.audioPlay > 0 ) {
            audio.playTone();
        }
        if ( constants.verbose > 0 ) {
            display.displayAll();
        } else {
            if (e.which == 39 || e.which == 37) {
                display.displayCol();
            } else if (e.which == 38 || e.which == 40) {
                display.displayRow();
            }
        }
        if ( constants.showBraille > 0 ) {
            constants.braille_container.style.display = "block";
            constants.braille_container.focus();
        } else {
            constants.braille_container.style.display = "none";
        }

    });

});


class HeatMap {

    constructor(plotId) {
        this.plotData = getHeatmapData(plotId);
    }

    getHeatMapData(plotId) {
        // get all the existing squares
        let plots = document.getElementById(plotId).children;

        // sort the squares to access from left to right, up to down
        plots.sort(this.compareX);
        plots.sort(this.compareY);

        // get the x_coord and y_coord to check if a square exists at the coordinates
        let x_coord_check = plots.map(this.getXCoords);
        let y_coord_check = plots.map(this.getYCoords);

        // get unique elements from x_coord and y_coord
        let unique_x_coord = [...new Set(x_coord_check)];
        let unique_y_coord = [...new Set(y_coord_check)];

        // get num of rows, num of cols, and total numbers of squares
        let num_rows = unique_y_coord.length;
        let num_cols = unique_x_coord.length;

        let rgb_norms = [];
        // get norm of rgb for frequency
        for (let i = 0; i < squares.length; i++) {
            let rgb_text = document.getElementById(squares[i]).getAttribute('fill');
            let rgb_string = rgb_text.slice(4, -1);
            let rgb_array = rgb_string.split(',');
            let rgb_norm = Math.sqrt(rgb_array.map(function (x) {
                return Math.pow(x, 2);
            }).reduce(function (a, b) {
                return a + b;
            }));
            rgb_norms.push(rgb_norm);
        }

        // let x_coord = Array(num_rows).fill().map(() => Array(num_cols).fill(0));
        // let y_coord = Array(num_rows).fill().map(() => Array(num_cols).fill(0));
        let norms = Array(num_rows).fill().map(() => Array(num_cols).fill(0));

        for (var i = 0; i < squares.length; i++) {
            var x_index = unique_x_coord.indexOf(x_coord_check[i]);
            var y_index = unique_y_coord.indexOf(y_coord_check[i]);
        
            // x_coord[y_index][x_index] = x_coord_check[i];
            // y_coord[y_index][x_index] = y_coord_check[i];
            norms[y_index][x_index] = rgb_norms[i];
        }

        constants.minX = Math.min(...rgb_norms);
        constants.maxX = Maht.max(...rgb_norms);

        let plotData = [unique_x_coord, unique_y_coord, rgb_norms];
        return plotData;
    }

    getXCoords(item) {
        return document.getElementById(item).getAttribute('x');
    }
    
    getYCoords(item) {
        return document.getElementById(item).getAttribute('y');
    }
    
    compareX(a, b) {
        return document.getElementById(a).getAttribute('x') - document.getElementById(b).getAttribute('x');
    }
    
    compareY(a, b) {
        return document.getElementById(b).getAttribute('y') - document.getElementById(a).getAttribute('y');
    }
}


class HeatMapRect {

    rectStrokeWidth = 4; // px
    rectColorString = 'rgb(3,200,9)';

    constructor() {
        this.x = 0;
        this.y = 0;
        this.height = plot.plotData[0][1] - plot.plotData[0][0];
    }

    UpdateRect() {
        this.x = plot.plotData[0][position.x];
        this.y = plot.plotData[1][position.y];
    }

    UpdateRectDisplay() {
        if ( document.getElementById('highlight_rect') ) document.getElementById('highlight_rect').remove(); // destroy and recreate
        const svgns = "http://www.w3.org/2000/svg";
        var rect = document.createElementNS(svgns, 'rect');
        rect.setAttribute('id', 'highlight_rect');
        rect.setAttribute('x', this.x);
        rect.setAttribute('y', constants.svg.getBoundingClientRect().bottom - this.height - this.y); // y coord is inverse from plot data
        rect.setAttribute('width', this.height);
        rect.setAttribute('height', this.height);
        rect.setAttribute('stroke', this.rectColorString);
        rect.setAttribute('stroke-width', this.rectStrokeWidth);
        rect.setAttribute('fill', 'none');
        constants.svg.appendChild(rect);
    }
}