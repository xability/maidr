

document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // variable initialization
    constants.plotId = 'geom_point.points.12.1';
    window.position = new Position(-1, -1);
    window.plot = new ScatterPlot();
    constants.chartType = "scatterplot";
    let audio = new Audio();
    let display = new Display();
    let layer0Point = new Layer0Point();
    let layer1Point = new Layer1Point();
    let lastPlayed = '';
    let lastx = 0;

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false;

        // left and right arrows are enabled only at point layer
        if (constants.layer == 0) {
            // right arrow 39
            if (e.which === 39) {
                if (constants.isMac ? e.metaKey : e.ctrlKey) {
                    if (e.shiftKey) {
                        // lastx = position.x;
                        position.x -= 1;
                        Autoplay('right', position.x, plot.x.length);
                    } else {
                        console.log(position.x);
                        position.x = plot.x.length - 1;
                        updateInfoThisRound = true;
                    }
                } else if (e.altKey && e.shiftKey && position.x != plot.x.length - 1) {
                    lastx = position.x;
                    Autoplay('reverse-right', plot.x.length, position.x);
                } else {
                    position.x += 1;
                    updateInfoThisRound = true;
                    lockPosition();
                }
            }

            // left arrow 37
            if (e.which === 37) {
                if (constants.isMac ? e.metaKey : e.ctrlKey) {
                    if (e.shiftKey) {
                        // lastx = position.x;
                        position.x += 1;
                        Autoplay('left', position.x, -1);
                    } else {
                        position.x = 0;
                        updateInfoThisRound = true;
                    }
                } else if (e.altKey && e.shiftKey && position.x != 0) {
                    lastx = position.x;
                    Autoplay('reverse-left', -1, position.x);
                } else {
                    position.x -= 1;
                    updateInfoThisRound = true;
                    lockPosition();
                }
            }
        } else if (constants.layer == 1) {
            position.x = lastx;
            if (e.which == 39 && e.shiftKey) {
                if ((constants.isMac ? e.metaKey : e.ctrlKey)) {
                    PlayLine('right');
                } else if (e.altKey) {
                    PlayLine('reverse-right');
                }
            }

            if (e.which == 37 && e.shiftKey) {
                if ((constants.isMac ? e.metaKey : e.ctrlKey)) {
                    PlayLine('left');
                } else if (e.altKey) {
                    PlayLine('reverse-left');
                }
            }
        }

        // update text, display, and audio
        if (updateInfoThisRound && constants.layer == 0) {
            UpdateAll();
        }
    });


    constants.brailleInput.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false;

        // @TODO
        // only line layer can access to braille display
        if (e.which == 9) {
        } else if (constants.layer == 1) {
            lockPosition();
            constants.brailleInput.setSelectionRange(position.x, position.x);
            if (e.which == 9) {
            } else if (e.which == 39) { // right arrow
                e.preventDefault();
                if (e.target.selectionStart > e.target.value.length - 2) {
                    e.preventDefault();
                } else {
                    position.x += 1;
                    updateInfoThisRound = true;
                    lockPosition();
                }
            } else if (e.which == 37) { // left
                e.preventDefault();
                position.x -= 1;
                updateInfoThisRound = true;
                lockPosition();
            } else {
                e.preventDefault();
            }

            if (updateInfoThisRound) {
                UpdateAllBraille();
            } 

        } else {
            e.preventDefault();
        }
    });

    document.addEventListener("keydown", function (e) {

        // TESTING PLS REMOVE
        if (e.which == 13) {
            audio.playSmooth();
        }

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

        // page down /(fn+down arrow): point layer(0) 
        if (e.which == 34 && constants.layer == 1) {
            display.toggleLayerMode();
            position.x = lastx;
        }

        // page up / (fn+up arrow): line layer(1)
        if (e.which == 33 & constants.layer == 0) {
            display.toggleLayerMode();
            lastx = position.x;
        }

        // space: replay info but no other changes
        if (e.which === 32) {
            UpdateAll();
        }

        // ctrl/cmd: stop autoplay
        if (constants.isMac ? (e.which == 91 || e.which == 93) : e.which == 17) {
            constants.KillAutoplay();
        }

        if (constants.isMac ? e.metaKey : e.ctrlKey) {

            // (ctrl/cmd)+(home/fn+left arrow): first element
            if (e.which == 36) {
                position.x = 0;
                UpdateAllBraille();
            }

            // (ctrl/cmd)+(end/fn+right arrow): last element
            else if (e.which == 35) {
                position.x = plot.numPoints - 1;
                UpdateAllBraille();
            }
        }

        // period: speed up
        if (e.which == 190) {
            constants.SpeedUp();
            if (constants.autoplayId != null) {
                constants.KillAutoplay();
                if (lastPlayed == 'reverse-left') {
                    Autoplay('right', position.x, lastx);
                } else if (lastPlayed == 'reverse-right') {
                    Autoplay('left', position.x, lastx);
                } else {
                    Autoplay(lastPlayed, position.x, lastx);
                }
            }
        }

        // comma: speed down
        if (e.which == 188) {
            constants.SpeedDown();
            if (constants.autoplayId != null) {
                constants.KillAutoplay();
                if (lastPlayed == 'reverse-left') {
                    Autoplay('right', position.x, lastx);
                } else if (lastPlayed == 'reverse-right') {
                    Autoplay('left', position.x, lastx);
                } else {
                    Autoplay(lastPlayed, position.x, lastx);
                }
            }
        }
    });

    // helper functions
    function lockPosition() {
        // lock to min / max postions
        if (position.x < 0) {
            position.x = 0;
        }
        if (constants.layer == 0) {
            if (position.x > plot.x.length - 1) {
                position.x = plot.x.length - 1;
            }
        } else {
            if (position.x > plot.curvePoints - 1) {
                position.x = plot.curvePoints - 1;
            }
        }
    }

    function UpdateAll() {
        if (constants.showDisplay) {
            display.displayValues(plot);
        }
        if (constants.showRect) {
            layer0Point.UpdatePointDisplay();
        }
        if (constants.audioPlay) {
            plot.PlayTones(audio);
        }
    }

    function UpdateAllAutoplay() {
        if (constants.showDisplayInAutoplay) {
            display.displayValues(plot);
        }
        if (constants.showRect) {
            layer0Point.UpdatePointDisplay();
        }
        if (constants.audioPlay) {
            plot.PlayTones(audio);
        }
        if (constants.brailleMode != "off") {
            display.UpdateBraillePos(plot);
        }
    }
    function UpdateAllBraille() {
        if (constants.showDisplayInBraille) {
            display.displayValues(plot);
        }
        if (constants.showRect) {
            if (constants.layer == 0) {
                layer0Point.UpdatePointDisplay();
            } else if (constants.layer == 1) {
                layer1Point.UpdatePointDisplay();
            }
        }
        if (constants.audioPlay && constants.layer == 0) {
            plot.PlayTones(audio);
        }
        display.UpdateBraillePos(plot);
    }

    function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right and reverse left
        if (dir == "left" || dir == "reverse-right") {
            step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId != null) {
            constants.KillAutoplay();
        }

        if (dir == "reverse-left" || dir == "reverse-right") {
            position.x = start;
        }

        constants.autoplayId = setInterval(function () {
            position.x += step;
            if (position.x < 0 || position.x > plot.numPoints - 1) {
                constants.KillAutoplay();
                lockPosition();
            } else if (position.x == end) {
                constants.KillAutoplay();
                UpdateAllAutoplay();
            } else {
                UpdateAllAutoplay();
            }
        }, constants.autoPlayRate);
    }

    function PlayLine(dir) {
        lastPlayed = dir;

        let freqArr = [];
        let panningArr = [];
        let panPoint = audio.SlideBetween(position.x, 0, plot.curvePoints.length - 1, -1, 1);
        if (dir == 'right') {
            for (let i = position.x; i < plot.curvePoints.length; i++) {
                freqArr.push(audio.SlideBetween(plot.curvePoints[i], plot.curveMinY, plot.curveMaxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY));
            }
            panningArr = [panPoint, 1];
        } else if (dir == 'left') {
            for (let i = position.x; i >= 0; i--) {
                freqArr.push(audio.SlideBetween(plot.curvePoints[i], plot.curveMinY, plot.curveMaxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY));
            }
            panningArr = [-1, panPoint];
        } else if (dir == 'reverse-right') {
            for (let i = plot.curvePoints.length - 1; i >= position.x; i--) {
                freqArr.push(audio.SlideBetween(plot.curvePoints[i], plot.curveMinY, plot.curveMaxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY));
            }
            panningArr = [1, panPoint];
        } else if (dir == 'reverse-left') {
            for (let i = 0; i <= position.x; i++) {
                freqArr.push(audio.SlideBetween(plot.curvePoints[i], plot.curveMinY, plot.curveMaxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY));
            }
            panningArr = [-1, panPoint];
        }

        audio.playSmooth(freqArr, 2, panningArr, constants.vol, 'sine');


    }
});

class ScatterPlot {
    constructor() {

        // layer = 0
        this.plotPoints = document.querySelectorAll('#' + constants.plotId.replaceAll('\.', '\\.') + ' > use');
        this.svgPointsX = this.GetSvgPointCoords()[0]; // x coordinates of points
        this.svgPointsY = this.GetSvgPointCoords()[1]; // y coordinates of points
        this.x = this.GetPointValues()[0]; // actual values of x
        this.y = this.GetPointValues()[1]; // actual values of y
        constants.minY = Math.min(...hwy); // min of actual values of y
        constants.maxY = Math.max(...hwy); // max of actual values of y

        // layer = 1
        this.plotLine = document.querySelectorAll('#' + 'GRID.polyline.13.1'.replaceAll('\.', '\\.') + ' > polyline')[0];
        this.svgLineX = this.GetSvgLineCoords()[0]; // x coordinates of curve
        this.svgLineY = this.GetSvgLineCoords()[1]; // y coordinates of curve
        // this.bestFitLinePoints = this.GetBestFitLinePoints();
        this.curvePoints = this.GetSmoothCurvePoints(); // actual values of y 
        this.curveMinY = Math.min(...this.curvePoints); 
        this.curveMaxY = Math.max(...this.curvePoints);
        this.gradient = this.GetGradient();

        this.groupLabels = this.GetGroupLabels();
    }

    // SelectLayer(layer) {
    //     constants.layer = layer;
    //     if (layer == 0) {
    //         constants.minX = 0;
    //         constants.maxX = this.x.length - 1;
    //         constants.minY = Math.min([...this.y]);
    //         constants.maxY = Math.max([...this.y]);
    //         this.numPoints = this.x.length;
    //     } else if (layer == 1) {
    //         constants.minX = 0;
    //         constants.maxX = this.x.length - 1;
    //         constants.minY = Math.min(...this.bestFitLinePoints);
    //         constants.maxY = Math.max(...this.bestFitLinePoints);
    //         this.numPoints = this.x.length;
    //     }
    // }

    // GetXLength(layer) {
    //     if (layer == 0) {
    //         return this.x.length;
    //     }

    //     if (layer == 1) {
    //         return this.svgLineX.length;
    //     }
    // }

    GetGroupLabels() {
        let labels_nodelist = document.querySelectorAll('tspan[dy="7.88"]');

        let labels = [];
        labels.push(labels_nodelist[0].innerHTML, labels_nodelist[1].innerHTML);

        return labels;
    }

    GetSvgPointCoords() {
        let points = new Map();

        for (let i = 0; i < this.plotPoints.length; i++) {
            let x = parseFloat(this.plotPoints[i].getAttribute('x'));
            let y = parseFloat(this.plotPoints[i].getAttribute('y'));
            if (!points.has(x)) {
                points.set(x, new Set([y]));
            } else {
                points.get(x).add(y);
            }
        }

        points = new Map([...points].sort(function (a, b) { return a[0] - b[0] }));

        points.forEach(function (value, key) {
            points[key] = Array.from(value).sort(function (a, b) { return a - b });
        });

        let X = [...points.keys()];

        let Y = [];
        for (let i = 0; i < X.length; i++) {
            Y.push(points[X[i]]);
        }

        return [X, Y];
    }

    GetPointValues() {
        // x values
        let xValues = [...displ];
        // for panning
        constants.minX = 0;
        constants.maxX = xValues.length;

        // y values
        let yValues = [...hwy];
        // default layer: point layer 
        // constants.minY & maxY should be adjusted according to layer
        constants.minY = Math.min(...yValues);
        constants.maxY = Math.max(...yValues);

        let points = new Map();

        for (let i = 0; i < xValues.length; i++) {
            let x = parseFloat(xValues[i]);
            let y = parseFloat(yValues[i]);
            if (!points.has(x)) {
                points.set(x, new Set([y]));
            } else {
                points.get(x).add(y);
            }
        }

        points = new Map([...points].sort(function (a, b) { return a[0] - b[0] }));

        points.forEach(function (value, key) {
            points[key] = Array.from(value).sort(function (a, b) { return a - b });
        });

        let X = [...points.keys()];

        let Y = [];
        for (let i = 0; i < X.length; i++) {
            Y.push(points[X[i]]);
        }

        return [X, Y];
    }

    PlayTones(audio) {
        if (constants.layer == 0) { // points layer
            if (plot.y[position.x].length == 1) {
                audio.playTone();
            } else {
                // we play a run of tones
                position.z = 0;
                let interval = setInterval(function () {
                    // play this tone
                    audio.playTone();

                    // and then set up for the next one
                    position.z += 1;

                    // and kill if we're done
                    if (position.z + 1 > plot.y[position.x].length) {
                        clearInterval(interval);
                        position.z = -1;
                    }

                }, 0); // play all tones at the same time
            }
        } else if (constants.layer == 1) { // best fit line layer
            audio.playTone();
        }
    }

    GetSvgLineCoords() {
        // extract all the y coordinates from the point attribute of polyline
        let str = this.plotLine.getAttribute('points');
        let coords = str.split(' ');

        let X = [];
        let Y = [];

        for (let i = 0; i < coords.length; i++) {
            let coord = coords[i].split(',');
            X.push(parseFloat(coord[0]));
            Y.push(parseFloat(coord[1]));
        }

        return [X, Y];
    }

    // GetBestFitLinePoints() {
    //     let points = [];

    //     for (let i = 0; i < displ.length; i++) {
    //         if (!points.map(({ x }) => x).includes(displ[i]))
    //             points.push({ 'x': displ[i], 'y': prediciton_array[i] });
    //     }

    //     points.sort(function (a, b) { return a.y - b.y });
    //     points.sort(function (a, b) { return a.x - b.x });

    //     return points.map(({ y }) => y);
    // }

    GetSmoothCurvePoints() {
        let points = [];

        for (let i = 0; i < smooth_layer.length; i++) {
            points.push(smooth_layer[i]['y']);
        }

        return points;
    }

    GetGradient() {
        let gradients = [];

        for (let i = 0; i < this.curvePoints.length - 1; i++) {
            if (this.curvePoints[i + 1] - this.curvePoints[i] > 0) {
                gradients.push('up');
            } else {
                gradients.push('down');
            }
        }

        gradients.push('end');

        return gradients;
    }
};

class Layer0Point {
    constructor() {
        this.x = plot.svgPointsX[0];
        this.y = plot.svgPointsY[0];
        this.strokeWidth = 1.35;
    }

    async UpdatePoints() {
        await this.ClearPoints();
        this.x = plot.svgPointsX[position.x];
        this.y = plot.svgPointsY[position.x];
    }

    async PrintPoints() {
        await this.ClearPoints();
        await this.UpdatePoints();
        for (let i = 0; i < this.y.length; i++) {
            const svgns = "http://www.w3.org/2000/svg";
            var point = document.createElementNS(svgns, 'circle');
            point.setAttribute('class', 'highlight_point');
            point.setAttribute('cx', this.x);
            point.setAttribute('cy', constants.svg.getBoundingClientRect().height - this.y[i]);
            point.setAttribute('r', 3.95);
            point.setAttribute('stroke', constants.colorSelected);
            point.setAttribute('stroke-width', this.strokeWidth);
            point.setAttribute('fill', constants.colorSelected);
            constants.svg.appendChild(point);
        }
    }

    async ClearPoints() {
        let points = document.getElementsByClassName('highlight_point');
        for (let i = 0; i < points.length; i++) {
            document.getElementsByClassName('highlight_point')[i].remove();
        }
    }

    UpdatePointDisplay() {
        this.ClearPoints();
        this.UpdatePoints();
        this.PrintPoints();
    }
}

class Layer1Point {
    constructor() {
        this.x = plot.svgLineX[0];
        this.y = plot.svgLineY[0];
        this.strokeWidth = 1.35;
    }
    
    async UpdatePoints() {
        await this.ClearPoints();
        this.x = plot.svgLineX[position.x];
        this.y = plot.svgLineY[position.x];
    }

    async PrintPoints() {
        await this.ClearPoints();
        await this.UpdatePoints();
        const svgns = "http://www.w3.org/2000/svg";
        var point = document.createElementNS(svgns, 'circle');
        point.setAttribute('id', 'highlight_point');
        point.setAttribute('cx', this.x);
        point.setAttribute('cy', constants.svg.getBoundingClientRect().height - this.y);
        point.setAttribute('r', 3.95);
        point.setAttribute('stroke', constants.colorSelected);
        point.setAttribute('stroke-width', this.strokeWidth);
        point.setAttribute('fill', constants.colorSelected);
        constants.svg.appendChild(point);
    }

    async ClearPoints() {
        let points = document.getElementsByClassName('highlight_point');
        for (let i = 0; i < points.length; i++) {
            document.getElementsByClassName('highlight_point')[i].remove();
        }
        if (document.getElementById('highlight_point')) document.getElementById('highlight_point').remove();
    }

    UpdatePointDisplay() {
        this.ClearPoints();
        this.UpdatePoints();
        this.PrintPoints();
    }
}