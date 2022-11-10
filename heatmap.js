document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // variable initialization
    window.constants = new Constants();
    constants.plotId = 'geom_rect.rect.2.1';
    window.position = new Position(-1, -1);
    window.plot = new HeatMap();
    constants.chartType = "heatmap";
    let rect = new HeatMapRect();
    let audio = new Audio();
    let display = new Display();
    

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false;

        // right arrow 39
        if (e.which === 39) {
            if (e.ctrlKey || e.metaKey) {
                if (e.shiftKey) {
                    Autoplay('right');
                } else {
                    position.x = plot.num_cols - 1;
                }
            } else {
                position.x += 1;
            }
            updateInfoThisRound = true;
            constants.navigation = 1;
        }

        // left arrow 37
        if (e.which === 37) {
            if (e.ctrlKey || e.metaKey) {
                if (e.shiftKey) {
                    Autoplay('left');
                } else {
                    position.x = 0;
                }
            } else {
                position.x -= 1;
            }
            updateInfoThisRound = true;
            constants.navigation = 1;
        }

        // up arrow 38
        if (e.which === 38) {
            if (e.ctrlKey || e.metaKey) {
                if (e.shiftKey) {
                    Autoplay('up');
                } else {
                    position.y = 0;
                }
            } else {
                position.y -= 1;
            }
            updateInfoThisRound = true;
            constants.navigation = 0;
        }

        // down arrow 40
        if (e.which === 40) {
            if (e.ctrlKey || e.metaKey) {
                if (e.shiftKey) {
                    Autoplay('down');
                } else {
                    position.y = plot.num_rows - 1;
                }
            } else {
                position.y += 1;
            }
            updateInfoThisRound = true;
            constants.navigation = 0;
        }

        lockPosition();

        // update text, display, and audio
        if (updateInfoThisRound) {
            UpdateAll();
        }
    });


    constants.brailleInput.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false;

        // @TODO
        // add manipulation of cursor for up and down keys
        // very buggy braille display up and down keys are not working

        if (e.which == 9) {
        } else if (e.which == 39) { // right arrow
            if (e.target.selectionStart > e.target.value.length - 2 || e.target.value.substring(e.target.selectionStart + 1, e.target.selectionStart + 2) == '⠳') {
                e.preventDefault();
            } else {
                position.x += 1;
            }
            updateInfoThisRound = true;
        } else if (e.which == 37) { // left
            position.x -= 1;
            updateInfoThisRound = true;
        } else if (e.which == 40) { // down
            if (e.target.selectionStart + plot.num_cols + 1 > e.target.value.length - 2) {
                e.preventDefault();
            } else {
                position.y += 1;
                let pos = position.y * (plot.num_cols + 1) + position.x;
                constants.brailleInput.focus();
                constants.brailleInput.setSelectionRange(pos, pos);
            }
            updateInfoThisRound = true;
        } else if (e.which == 38) { // up
            if (e.target.selectionStart - plot.num_cols - 1 < 0) {
                e.preventDefault();
            } else {
                position.y -= 1;
                let pos = position.y * (plot.num_cols - 1) + position.x;
                constants.brailleInput.focus();
                constants.brailleInput.setSelectionRange(pos, pos);
            }
            updateInfoThisRound = true;
        } else {
            e.preventDefault();
        }

        lockPosition();

        if (updateInfoThisRound) {
            UpdateAll();
        }
    });

    document.addEventListener("keydown", function (e) {

        // B: braille mode
        if (e.which == 66) {
            display.toggleBrailleMode();
            e.preventDefault();
        }
        // T: aria live text output mode
        if (e.which == 84) {
            display.toggleTextMode();
        }
        // S: sonification mode
        if (e.which == 83) {
            display.toggleSonificationMode();
        }

        if (e.which === 32) { // space 32, replay info but no other changes
            UpdateAll();
        }

    });

    // helper functions
    function lockPosition() {
        // lock to min / max postions
        if (position.x < 0) {
            position.x = 0;
        }
        if (position.x > plot.num_cols - 1) {
            position.x = plot.num_cols - 1;
        }
        if (position.y < 0) {
            position.y = 0;
        }
        if (position.y > plot.num_rows - 1) {
            position.y = plot.num_rows - 1;
        }
    }

    function UpdateAll() {
        if (constants.showDisplay) {
            display.displayValues(plot);
        }
        if (constants.showRect) {
            rect.UpdateRectDisplay();
        }
        if (constants.audioPlay) {
            audio.playTone();
        }
    }

    function Autoplay(dir) {
        let step = 1; // default right and down
        if (dir == "left" || dir == "up") {
            step = -1;
        }

        // clear old autoplay if exists
        if (this.autoplay != null) {
            clearInterval(this.autoplay);
            this.autoplay = null;
        }

        this.autoplay = setInterval(function () {
            if (dir == "left" || dir == "right") {
                position.x += step;
                if (position.x < 0 || plot.num_cols - 1 < position.x) {
                    clearInterval(this.autoplay);
                    this.autoplay = null;
                    lockPosition();
                } else {
                    UpdateAll();
                }
            } else { // up or down
                position.y += step;
                if (position.y < 0 || plot.num_rows - 1 < position.y) {
                    clearInterval(this.autoplay);
                    this.autoplay = null;
                    lockPosition();
                } else {
                    UpdateAll();
                }
            }
        }, constants.autoPlayRate);
    }

});


class HeatMap {

    constructor() {
        this.plots = document.querySelectorAll('#' + constants.plotId.replaceAll('\.', '\\.') + ' > rect');
        this.plotData = this.getHeatMapData();

        this.x_coord = this.plotData[0];
        this.y_coord = this.plotData[1];
        this.values = this.plotData[2];
        this.num_rows = this.plotData[3];
        this.num_cols = this.plotData[4];

        this.group_labels = this.getGroupLabels();
        this.x_group_label = this.group_labels[0];
        this.y_group_label = this.group_labels[1];

        this.x_labels = this.getXLabels();
        this.y_labels = this.getYLabels();

        // hardcoded frequency information (in another file); extraction should be done afterwards
        this.z = [[124, 0, 0], [0, 68, 0], [44, 56, 52]];
    }

    getHeatMapData() {

        // get the x_coord and y_coord to check if a square exists at the coordinates
        let x_coord_check = [];
        let y_coord_check = [];

        for (let i = 0; i < this.plots.length; i++) {
            x_coord_check.push(this.plots[i].getAttribute('x'));
            y_coord_check.push(this.plots[i].getAttribute('y'));
        }

        // sort the squares to access from left to right, up to down
        x_coord_check.sort(function (a, b) { a - b }); // ascending
        y_coord_check.sort(function (a, b) { b - a }); // descending

        // get unique elements from x_coord and y_coord
        let unique_x_coord = [...new Set(x_coord_check)];
        let unique_y_coord = [...new Set(y_coord_check)];

        // get num of rows, num of cols, and total numbers of squares
        let num_rows = unique_y_coord.length;
        let num_cols = unique_x_coord.length;

        let norms = Array(num_rows).fill().map(() => Array(num_cols).fill(0));
        let min_norm = 3 * (Math.pow(255, 2));
        let max_norm = 0;

        for (var i = 0; i < this.plots.length; i++) {
            var x_index = unique_x_coord.indexOf(x_coord_check[i]);
            var y_index = unique_y_coord.indexOf(y_coord_check[i]);
            let norm = this.getRGBNorm(i);
            norms[y_index][x_index] = norm;

            if (norm < min_norm) min_norm = norm;
            if (norm > max_norm) max_norm = norm;
        }

        constants.minX = 0;
        constants.maxX = num_cols;
        constants.minY = min_norm;
        constants.maxY = max_norm;

        let plotData = [unique_x_coord, unique_y_coord, norms, num_rows, num_cols];
        // console.log(plotData);
        return plotData;
    }

    getRGBNorm(i) {
        let rgb_string = this.plots[i].getAttribute('fill');
        let rgb_array = rgb_string.slice(4, -1).split(',');
        // just get the sum of squared value of rgb, similar without sqrt, save computation 
        return rgb_array.map(function (x) {
            return Math.pow(x, 2);
        }).reduce(function (a, b) {
            return a + b;
        });
    }

    getGroupLabels() {
        let labels_nodelist = document.querySelectorAll('tspan[dy="12"]');
        // console.log(labels_nodelist);

        let labels = [];
        labels.push(labels_nodelist[0].innerHTML, labels_nodelist[1].innerHTML);

        return labels;
    }

    getXLabels() {
        let x_labels_nodelist = document.querySelectorAll('tspan[dy="10"]');
        // console.log(x_labels_nodelist);

        let labels = [];
        for (let i = 0; i < x_labels_nodelist.length; i++) {
            labels.push(x_labels_nodelist[i].innerHTML);
        }

        return labels;
    }

    getYLabels() {
        // tried 'tspan[dy="5"]' but other elements are sharing the same attributes
        let y_labels_nodelist = document.querySelectorAll('tspan[id^="GRID.text.19.1"]');
        // console.log(y_labels_nodelist);

        let labels = [];
        for (let i = 0; i < y_labels_nodelist.length; i++) {
            labels.push(y_labels_nodelist[i].innerHTML);
        }

        return labels.reverse();
    }
}


class HeatMapRect {

    constructor() {
        this.x = plot.x_coord[0];
        this.y = plot.y_coord[0];
        this.rectStrokeWidth = 4; // px
        this.height = Math.abs(plot.y_coord[1] - plot.y_coord[0]);
    }

    UpdateRect() {
        this.x = plot.x_coord[position.x];
        this.y = plot.y_coord[position.y];
    }

    UpdateRectDisplay() {
        this.UpdateRect();
        if (document.getElementById('highlight_rect')) document.getElementById('highlight_rect').remove(); // destroy and recreate
        const svgns = "http://www.w3.org/2000/svg";
        var rect = document.createElementNS(svgns, 'rect');
        rect.setAttribute('id', 'highlight_rect');
        rect.setAttribute('x', this.x);
        rect.setAttribute('y', constants.svg.getBoundingClientRect().height - this.height - this.y); // y coord is inverse from plot data
        rect.setAttribute('width', this.height);
        rect.setAttribute('height', this.height);
        rect.setAttribute('stroke', constants.colorSelected);
        rect.setAttribute('stroke-width', this.rectStrokeWidth);
        rect.setAttribute('fill', 'none');
        constants.svg.appendChild(rect);
    }
}