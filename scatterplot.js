

document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything


    // variable initialization
    window.constants = new Constants();
    constants.plotId = 'geom_point.points.2.1';
    window.position = new Position(-1, -1);
    window.plot = new ScatterPlot();
    constants.chartType = "scatterplot";
    let audio = new Audio();
    let display = new Display();
    let point = new Point();
    let lastPlayed = '';

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false;

        // right arrow 39
        if (e.which === 39) {
            if (e.ctrlKey || e.metaKey) {
                if (e.shiftKey) {
                    Autoplay('right');
                    lastPlayed = 'right';
                } else {
                    position.x = plot.numPoints - 1;
                }
            } else {
                position.x += 1;
            }
            updateInfoThisRound = true;
        }

        // left arrow 37
        if (e.which === 37) {
            if (e.ctrlKey || e.metaKey) {
                if (e.shiftKey) {
                    Autoplay('left'); 
                    lastPlayed = 'left';
                } else {
                    position.x = 0;
                }
            } else {
                position.x -= 1;
            }
            updateInfoThisRound = true;
        }

        if (e.which == 80) {
            StopAutoplay();
        }

        if (e.which == 85) {
            StopAutoplay();
            SpeedUp();
            console.log(constants.autoPlayRate);
            Autoplay(lastPlayed);
        }

        if (e.which == 68) {
            StopAutoplay();
            SpeedDown();
            console.log(constants.autoPlayRate);
            Autoplay(lastPlayed);
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

        if (e.which == 9) {
        } else if (e.which == 39) { // right arrow
            if ( e.target.selectionStart > e.target.value.length - 2) {
                e.preventDefault();
            } else {
                position.x += 1;
            }
            updateInfoThisRound = true;
        } else if (e.which == 37) { // left
            position.x -= 1;
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
        if ( position.x > plot.numPoints - 1 ) {
            position.x = plot.numPoints - 1;
        }
    }

    function UpdateAll() {
        if (constants.showDisplay) {
            display.displayValues(plot);
        }
        if ( constants.showRect ) {
            point.UpdatePointDisplay(); 
        }
        if (constants.audioPlay) {
            audio.playTone();
        }
    }

    function Autoplay(dir) {
        let step = 1 ; // default right and down
        if ( dir == "left" ) {
            step = -1;
        }

        // clear old autoplay if exists
        if (this.autoplay != null) {
            clearInterval(this.autoplay);
            this.autoplay = null;
        }

        this.autoplay = setInterval(function() {
            position.x += step;
            if ( position.x < 0 || plot.numPoints - 1 < position.x ) {
                clearInterval(this.autoplay);
                this.autoplay = null;
                lockPosition();
            } else {
                UpdateAll();
            }
        }, constants.autoPlayRate);
    }

    function StopAutoplay() {
        clearInterval(this.autoplay);
        this.autoplay = null;
    }

    function SpeedUp() {
        if (constants.autoPlayRate - 50 > 0) { 
            constants.autoPlayRate -= 50;
        }
    }

    function SpeedDown() {
        if (constants.autoPlayRate + 50 <= 1000) {
            constants.autoPlayRate += 50;
        }
    }

});
class ScatterPlot {
    constructor() {
        this.plots = document.querySelectorAll('#' + constants.plotId.replaceAll('\.', '\\.') + ' > use');

        this.x = this.getXCoords();
        this.bestFitLinePoints = this.getBestFitLinePoints();
        // this.residualPoints = this.getResidualPoints();
        this.numPoints = this.bestFitLinePoints.length;

        this.svgX = this.getSvgCoords()[0];
        this.svgY = this.getSvgCoords()[1];

        this.groupLabels = this.getGroupLabels();
    }

    getXCoords() {
        displ.sort(function(a,b) { return a - b; });
        constants.minX = 0;
        constants.maxX = displ.length;
        return displ;
    }

    getBestFitLinePoints() {
        let points = [];

        for (let i = 0; i < displ.length; i++) {
            points.push({'x': displ[i], 'y': prediciton_array[i]});
        }

        points.sort(function(a, b) { return a.x - b.x });

        constants.minY = Math.min(...prediciton_array);
        constants.maxY = Math.max(...prediciton_array);

        return points.map(({y}) => y);
    }

    // @TODO
    // getResidualPoints() {}

    getGroupLabels() {
        let labels_nodelist = document.querySelectorAll('tspan[dy="12"]');

        let labels = [];
        labels.push(labels_nodelist[0].innerHTML, labels_nodelist[1].innerHTML);

        return labels;
    }

    // get exact x and y values from data
    // getXValues() {}
    // getYValues() {}

    getSvgCoords() {
        let points = [];

        for (let i = 0; i < this.plots.length; i++) {
            points.push({'x': this.plots[i].getAttribute('x'), 'y': this.plots[i].getAttribute('y')});
        }

        points.sort(function(a,b) { return a.x - b.x });

        return [points.map(({x}) => x), points.map(({y}) => y)];
    }
};

class Point {
    constructor() {
        this.x = plot.svgX[0];
        this.y = plot.svgY[0];
        this.strokeWidth = 1.35;
    }

    UpdatePoint() {
        this.x = plot.svgX[position.x];
        this.y = plot.svgY[position.x];
    }

    UpdatePointDisplay() {
        this.UpdatePoint();
        if (document.getElementById('highlight_point')) document.getElementById('highlight_point').remove(); // destroy and recreate
        const svgns = "http://www.w3.org/2000/svg";
        var point = document.createElementNS(svgns, 'circle');
        point.setAttribute('id', 'highlight_point');
        // point.setAttribute('x', this.x);
        // point.setAttribute('y', constants.svg.getBoundingClientRect().height - this.y); // y coord is inverse from plot data
        point.setAttribute('cx', this.x);
        point.setAttribute('cy', constants.svg.getBoundingClientRect().height - this.y);
        point.setAttribute('r', 3.95);
        point.setAttribute('stroke', constants.colorSelected);
        point.setAttribute('stroke-width', this.strokeWidth);
        point.setAttribute('fill', constants.colorSelected);
        constants.svg.appendChild(point);
    }
}