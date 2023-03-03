

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

    let lastPlayed = ''; // for autoplay use
    let lastx = 0; // for layer 0 autoplay use
    let lastx1 = 0; // for layer 1 autoplay use

    window.positionL1 = new Position(lastx1, lastx1);

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false;
        let isAtEnd = false;

        // left and right arrows are enabled only at point layer
        if (constants.layer == 0) {
            // right arrow 39
            if (e.which === 39) {
                if (constants.isMac ? e.metaKey : e.ctrlKey) {
                    if (e.shiftKey) {
                        // lastx = position.x;
                        position.x -= 1;
                        Autoplay('outward_right', position.x, plot.x.length);
                    } else {
                        position.x = plot.x.length - 1;
                        updateInfoThisRound = true;
                        isAtEnd = lockPosition();
                    }
                } else if (e.altKey && e.shiftKey && position.x != plot.x.length - 1) {
                    lastx = position.x;
                    Autoplay('inward_right', plot.x.length, position.x);
                } else {
                    position.x += 1;
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            }

            // left arrow 37
            if (e.which === 37) {
                if (constants.isMac ? e.metaKey : e.ctrlKey) {
                    if (e.shiftKey) {
                        // lastx = position.x;
                        position.x += 1;
                        Autoplay('outward_left', position.x, -1);
                    } else {
                        position.x = 0;
                        updateInfoThisRound = true;
                        isAtEnd = lockPosition();
                    }
                } else if (e.altKey && e.shiftKey && position.x != 0) {
                    lastx = position.x;
                    Autoplay('inward_left', -1, position.x);
                } else {
                    position.x -= 1;
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            }
        } else if (constants.layer == 1) {
            positionL1.x = lastx1;
           
            if (e.which == 39 && e.shiftKey) {
                if ((constants.isMac ? e.metaKey : e.ctrlKey)) {
                    PlayLine('outward_right');
                } else if (e.altKey) {
                    PlayLine('inward_right');
                }
            }

            if (e.which == 37 && e.shiftKey) {
                if ((constants.isMac ? e.metaKey : e.ctrlKey)) {
                    PlayLine('outward_left');
                } else if (e.altKey) {
                    PlayLine('inward_left');
                }
            }
        }

        // update text, display, and audio
        if (updateInfoThisRound && constants.layer == 0 && ! isAtEnd) {
            UpdateAll();
        }
        if ( isAtEnd ) {
            audio.playEnd();
        }

    });


    constants.brailleInput.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false;
        let isAtEnd = false;
        
        // @TODO
        // only line layer can access to braille display
        if (e.which == 9) {
            // constants.brailleInput.setSelectionRange(positionL1.x, positionL1.x);
        } else if (constants.layer == 1) {
            lockPosition();
            if (e.which == 9) {
            } else if (e.which == 39) { // right arrow
                e.preventDefault();
                constants.brailleInput.setSelectionRange(positionL1.x, positionL1.x);
                if (e.target.selectionStart > e.target.value.length - 2) {
                    e.preventDefault();
                } else if (constants.isMac ? e.metaKey : e.ctrlKey) {
                    if (e.shiftKey) {
                        positionL1.x -= 1;
                        Autoplay('outward_right', positionL1.x, plot.curvePoints.length);
                    } else {
                        positionL1.x = plot.curvePoints.length - 1;
                        updateInfoThisRound = true;
                        isAtEnd = lockPosition();
                    }
                } else if (e.altKey && e.shiftKey && positionL1.x != plot.curvePoints.length - 1) {
                    lastx1 = positionL1.x;
                    Autoplay('inward_right', plot.curvePoints.length, positionL1.x);
                } else {
                    positionL1.x += 1;
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.which == 37) { // left
                e.preventDefault();
                if (constants.isMac ? e.metaKey : e.ctrlKey) {
                    if (e.shiftKey) {
                        // lastx = position.x;
                        positionL1.x += 1;
                        Autoplay('outward_left', positionL1.x, -1);
                    } else {
                        positionL1.x = 0; // go all the way
                        updateInfoThisRound = true;
                        isAtEnd = lockPosition();
                    }
                } else if (e.altKey && e.shiftKey && positionL1.x != 0) {
                    Autoplay('inward_left', -1, positionL1.x);
                } else {
                    positionL1.x -= 1;
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else {
                e.preventDefault();
            }

        } else {
            e.preventDefault();
        }

        // auto turn off braille mode if we leave the braille box
        constants.brailleInput.addEventListener('focusout', function(e) {
            display.toggleBrailleMode('off');
        });

        lastx1 = positionL1.x;

        if (updateInfoThisRound && ! isAtEnd) {
            UpdateAllBraille();
        } 
        if ( isAtEnd ) {
            audio.playEnd();
        }
    });

    let controlElements = [constants.svg_container, constants.brailleInput];
    for ( let i = 0 ; i < controlElements.length ; i++ ) {
        controlElements[i].addEventListener("keydown", function (e) {

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
                lastx1 = positionL1.x;
                display.toggleLayerMode();
            }

            // page up / (fn+up arrow): line layer(1)
            if (e.which == 33 && constants.layer == 0) {
                display.toggleLayerMode();
            }

            // space: replay info but no other changes
            if (e.which === 32) {
                UpdateAll();
            }

        });
    }

    document.addEventListener("keydown", function (e) {

        if (constants.isMac ? e.metaKey : e.ctrlKey) {
            // (ctrl/cmd)+(home/fn+left arrow): first element
            if (e.which == 36) {
                if (constants.layer == 0) {
                    position.x = 0;
                } else if (constants.layer == 1) {
                    positionL1.x = 0;
                }
                UpdateAllBraille();
            }

            // (ctrl/cmd)+(end/fn+right arrow): last element
            else if (e.which == 35) {
                if (constants.layer == 0) {
                    position.x = plot.y.length - 1;
                } else {
                    positionL1.x = plot.curvePoints.length - 1;
                }
                UpdateAllBraille();
            }

            // if you're only hitting control
            if ( ! e.shiftKey ) {
                audio.KillSmooth();
            }
        }

        // period: speed up
        if (e.which == 190) {
            constants.SpeedUp();
            if (constants.autoplayId != null) {
                constants.KillAutoplay();
                audio.KillSmooth();
                if (lastPlayed == 'inward_left') {
                    if (constants.layer == 0) {
                        Autoplay('outward_right', position.x, lastx);
                    } else if (constants.layer == 1) {
                        Autoplay('outward_right', positionL1.x, lastx1);
                    }
                } else if (lastPlayed == 'inward_right') {
                    if (constants.layer == 0) {
                        Autoplay('outward_left', position.x, lastx);
                    } else if (constants.layer == 1) {
                        Autoplay('outward_left', positionL1.x, lastx1);
                    }
                } else {
                    if (constants.layer == 0) {
                        Autoplay(lastPlayed, position.x, lastx);
                    } else if (constants.layer == 1) {
                        Autoplay(lastPlayed, positionL1.x, lastx1);
                    }
                }
            }
        }

        // comma: speed down
        if (e.which == 188) {
            constants.SpeedDown();
            if (constants.autoplayId != null) {
                constants.KillAutoplay();
                audio.KillSmooth();
                if (lastPlayed == 'inward_left') {
                    if (constants.layer == 0) {
                        Autoplay('outward_right', position.x, lastx);
                    } else if (constants.layer == 1) {
                        Autoplay('outward_right', positionL1.x, lastx1);
                    }
                } else if (lastPlayed == 'inward_right') {
                    if (constants.layer == 0) {
                        Autoplay('outward_left', position.x, lastx);
                    } else if (constants.layer == 1) {
                        Autoplay('outward_left', positionL1.x, lastx1);
                    }
                } else {
                    if (constants.layer == 0) {
                        Autoplay(lastPlayed, position.x, lastx);
                    } else if (constants.layer == 1) {
                        Autoplay('outward_left', positionL1.x, lastx1);
                    }
                }
            }
        }
    });

    // helper functions
    function lockPosition() {
        // lock to min / max positions
        let isLockNeeded = false;
        if (constants.layer == 0) {
            if (position.x < 0) {
                position.x = 0;
                isLockNeeded = true;
            }
            if (position.x > plot.x.length - 1) {
                position.x = plot.x.length - 1;
                isLockNeeded = true;
            }
        } else if (constants.layer == 1) {
            if (positionL1.x < 0) {
                positionL1.x = 0;
                isLockNeeded = true;
            } 
            if (positionL1.x > plot.curvePoints - 1) {
                positionL1.x = plot.curvePoints - 1;
                isLockNeeded = true;
            }
        }

        return isLockNeeded;
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
            if (constants.layer == 0) {
                layer0Point.UpdatePointDisplay();
            } else {
                layer1Point.UpdatePointDisplay();
            }
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
            layer1Point.UpdatePointDisplay();
        }
        if (constants.audioPlay) {
            plot.PlayTones(audio);
        }
        display.UpdateBraillePos(plot);
    }

    function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right and reverse left
        if (dir == "outward_left" || dir == "inward_right") {
            step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId) {
            constants.KillAutoplay();
        }
        if ( constants.isSmoothAutoplay ) {
            audio.KillSmooth();
        }

        if (dir == "inward_left" || dir == "inward_right") {
            position.x = start;
        }
        
        if (constants.layer == 0) {
            constants.autoplayId = setInterval(function () {
                position.x += step;
                // autoplay for two layers: point layer & line layer in braille
                // plot.numPoints is not available anymore
                if (position.x < 0 || position.x > plot.y.length - 1) { 
                    constants.KillAutoplay();
                    lockPosition();
                } else if (position.x == end) {
                    constants.KillAutoplay();
                    UpdateAllAutoplay();
                } else {
                    UpdateAllAutoplay();
                }
            }, constants.autoPlayRate);
        } else if (constants.layer == 1) {
            constants.autoplayId = setInterval(function () {
                positionL1.x += step;
                // autoplay for two layers: point layer & line layer in braille
                // plot.numPoints is not available anymore
                if (positionL1.x < 0 || positionL1.x > plot.curvePoints.length - 1) { 
                    constants.KillAutoplay();
                    lockPosition();
                } else if (positionL1.x == end) {
                    constants.KillAutoplay();
                    UpdateAllAutoplay();
                } else {
                    UpdateAllAutoplay();
                }
            }, constants.autoPlayRate);
        }
    }

    function PlayLine(dir) {
        lastPlayed = dir;

        let freqArr = [];
        let panningArr = [];
        let panPoint = audio.SlideBetween(positionL1.x, 0, plot.curvePoints.length - 1, -1, 1);
        let x = positionL1.x < 0 ? 0 : positionL1.x;
        if (dir == 'outward_right') {
            for (let i = x; i < plot.curvePoints.length; i++) {
                freqArr.push(audio.SlideBetween(plot.curvePoints[i], plot.curveMinY, plot.curveMaxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY));
            }
            panningArr = [panPoint, 1];
        } else if (dir == 'outward_left') {
            for (let i = x; i >= 0; i--) {
                freqArr.push(audio.SlideBetween(plot.curvePoints[i], plot.curveMinY, plot.curveMaxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY));
            }
            panningArr = [panPoint, -1];
        } else if (dir == 'inward_right') {
            for (let i = plot.curvePoints.length - 1; i >= x; i--) {
                freqArr.push(audio.SlideBetween(plot.curvePoints[i], plot.curveMinY, plot.curveMaxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY));
            }
            panningArr = [1, panPoint];
        } else if (dir == 'inward_left') {
            for (let i = 0; i <= x; i++) {
                freqArr.push(audio.SlideBetween(plot.curvePoints[i], plot.curveMinY, plot.curveMaxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY));
            }
            panningArr = [-1, panPoint];
        }

        if ( constants.isSmoothAutoplay ) {
            audio.KillSmooth();
        }

        audio.playSmooth(freqArr, 2, panningArr, constants.vol, 'sine');

    }
});

class ScatterPlot {
    constructor() {

        // layer = 0
        if ( constants.manualInput ) {
            this.plotPoints = scatterPlotPoints;
        } else {
            this.plotPoints = document.querySelectorAll('#' + constants.plotId.replaceAll('\.', '\\.') + ' > use');
        }
        this.svgPointsX = this.GetSvgPointCoords()[0]; // x coordinates of points
        this.svgPointsY = this.GetSvgPointCoords()[1]; // y coordinates of points

        this.x = this.GetPointValues()[0]; // actual values of x
        this.y = this.GetPointValues()[1]; // actual values of y

        // for sound weight use
        this.points_count = this.GetPointValues()[2]; // number of each points
        this.max_count = this.GetPointValues()[3];

        // layer = 1
        if ( constants.manualInput ) {
            this.plotLine = scatterPlotLine;
        } else {
            this.plotLine = document.querySelectorAll('#' + 'GRID.polyline.13.1'.replaceAll('\.', '\\.') + ' > polyline')[0];
        }
        this.svgLineX = this.GetSvgLineCoords()[0]; // x coordinates of curve
        this.svgLineY = this.GetSvgLineCoords()[1]; // y coordinates of curve

        this.curveX = this.GetSmoothCurvePoints()[0]; // actual values of x
        this.curvePoints = this.GetSmoothCurvePoints()[1]; // actual values of y 

        this.curveMinY = Math.min(...this.curvePoints); 
        this.curveMaxY = Math.max(...this.curvePoints);
        this.gradient = this.GetGradient();

        this.groupLabels = this.GetGroupLabels();
    }

    GetGroupLabels() {
        let labels = [];
        if (constants.manual) {
            labels.push(scatterPlotLegend["x"], scatterPlotLegend["y"]);
        } else {
            let labels_nodelist = document.querySelectorAll('tspan[dy="7.88"]');
            labels.push(labels_nodelist[0].innerHTML, labels_nodelist[1].innerHTML);
        }

        return labels;
    }

    GetSvgPointCoords() {
        let points = new Map();

        for (let i = 0; i < this.plotPoints.length; i++) {
            let x = parseFloat(this.plotPoints[i].getAttribute('x')); // .toFixed(1);
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

        let points = new Map(); // keep track of x and y values

        let xValues = [];
        let yValues = [];
        
        for (let i = 0; i < point_layer.length; i++) {
            let x = point_layer[i]["x"];
            let y = point_layer[i]["y"];
            xValues.push(x);
            yValues.push(y);
            if (!points.has(x)) {
                points.set(x, new Map([[y, 1]]));
            } else {
                if (points.get(x).has(y)) {
                    let mapy = points.get(x);
                    mapy.set(y, mapy.get(y) + 1);
                } else {
                    points.get(x).set(y, 1);
                }
            }
        }

        constants.minX = 0;
        constants.maxX = [...new Set(xValues)].length;

        constants.minY = Math.min(...yValues);
        constants.maxY = Math.max(...yValues);

        points = new Map([...points].sort(function (a, b) { return a[0] - b[0] }));
        
        points.forEach(function (value, key) {
            points[key] = Array.from(value).sort(function (a, b) { return a[0] - b[0] });
        });

        let X = [];
        let Y = [];
        let points_count = [];
        for (const [x_val, y_val] of points) {
            X.push(x_val);
            let y_arr = [];
            let y_count = [];
            for (const [y, count] of y_val) {
                y_arr.push(y);
                y_count.push(count);
            }
            Y.push(y_arr);
            points_count.push(y_count);
        }
        let max_points = Math.max(...points_count.map(a => Math.max(...a)));

        return [X, Y, points_count, max_points];
    }

    PlayTones(audio) {
        // kill the previous separate-points play before starting the next play
        if (constants.sepPlayId) {
            constants.KillSepPlay();
        }
        if (constants.layer == 0) { // point layer
            // we play a run of tones
            position.z = 0;
            constants.sepPlayId = setInterval(function () {
                // play this tone
                audio.playTone();

                // and then set up for the next one
                position.z += 1;

                // and kill if we're done
                if (position.z + 1 > plot.y[position.x].length) {
                    constants.KillSepPlay();
                    position.z = -1;
                }

            }, constants.sonifMode == "sep" ? constants.autoPlayPointsRate : 0); // play all tones at the same time
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

    GetSmoothCurvePoints() {
        let x_points = [];
        let y_points = [];

        for (let i = 0; i < smooth_layer.length; i++) {
            x_points.push(smooth_layer[i]['x']);
            y_points.push(smooth_layer[i]['y']);
        }

        return [x_points, y_points];
    }

    GetGradient() {
        let gradients = [];

        for (let i = 0; i < this.curvePoints.length - 1; i++) {
            let abs_grad = Math.abs((this.curvePoints[i + 1] - this.curvePoints[i]) / (this.curveX[i + 1] - this.curveX[i])).toFixed(3);
            gradients.push(abs_grad);
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
        if (document.getElementById('highlight_point')) document.getElementById('highlight_point').remove();
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
        this.x = plot.svgLineX[positionL1.x];
        this.y = plot.svgLineY[positionL1.x];
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
