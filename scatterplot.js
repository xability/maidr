import prediction_array from './scatterplot/prediction_array' assert { type: 'json' };
import residual_array from './scatterplot/residual_array' assert { type: 'json' };

document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // variable initialization
    window.constants = new Constants();
    constants.plotId = 'geom_point.points.2.1';
    window.position = new Position(-1, -1);
    window.plot = new ScatterPlot();
    constants.chartType = "scatterplot";
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
class ScatterPlot {
    constructor() {
        this.plots = document.querySelectorAll('#' + constants.plotId.replaceAll('\.', '\\.') + ' > use');
        this.plotData = this.getPoints();
    }

    getPoints() {
        // y values of each points according
        let x = []
        let y = [];

        for (let i = 0; i < this.plots.length; i++) {
            x.push(this.plots[i].getAttribute('x'));
            y.push(this.plots[i].getAttribute('y'));
        }

        // sort the points according to x coordinates
        x.sort(function (a, b) { return a - b; });
        y.sort(function (a, b) { return x.indexOf(a) - x.indexOf(b); })
    }
}