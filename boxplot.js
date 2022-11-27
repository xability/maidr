
// 
// This is the main boxplotscript. 
// It handles all customization for this chart, controls everything,
// and calls every thing needed from here.
//


document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // variable initialization

    window.constants = new Constants();
    constants.plotId = 'geom_boxplot.gTree.68.1';
    window.position = new Position(-1, -1);
    window.plot = new BoxPlot();
    constants.chartType = "boxplot";
    let rect = new BoxplotRect();
    let audio = new Audio();
    let display = new Display();

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false; // we only update info and play tones on certain keys

        // right arrow 
        if (e.which === 39) {
            position.x += 1;
            constants.navigation = 1;
            updateInfoThisRound = true;
        }
        // left arrow 
        if (e.which === 37) {
            position.x += -1;
            constants.navigation = 1;
            updateInfoThisRound = true;
        }
        // up arrow 
        if (e.which === 38) {
            position.y += 1;
            position.x = 0;
            constants.navigation = 0;
            updateInfoThisRound = true;
        }
        // down arrow 
        if (e.which === 40) {
            position.y += -1;
            position.x = 0;
            constants.navigation = 0;
            updateInfoThisRound = true;
        }

        lockPosition();

        // update display / text / audio
        if (updateInfoThisRound) {
            UpdateAll();
        }

    });

    constants.brailleInput.addEventListener("keydown", function (e) {
        // We block all input, except if it's B or Tab so we move focus

        let updateInfoThisRound = false; // we only update info and play tones on certain keys

        if (e.which == 9) { // tab
            // do nothing, let the user Tab away 
        } else if (e.which == 39) { // right arrow
            e.preventDefault();
            position.x += 1;
            updateInfoThisRound = true;
        } else if (e.which == 37) { // left arrow
            e.preventDefault();
            position.x += -1;
            updateInfoThisRound = true;
        } else {
            e.preventDefault();
        }

        lockPosition();

        // update audio. todo: add a setting for this later
        if (updateInfoThisRound) {
            UpdateAllBraille();
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

    function UpdateAll() {
        if (constants.showDisplay) {
            display.displayValues(plot);
        }
        if (constants.showRect) {
            rect.UpdateRect();
        }
        if (constants.audioPlay) {
            plot.PlayTones(audio);
        }
        display.SetBraille(plot);
    }
    function UpdateAllBraille() {
        if (constants.showDisplayInBraille) {
            display.displayValues(plot);
        }
        if (constants.showRect) {
            rect.UpdateRect();
        }
        if (constants.audioPlay) {
            plot.PlayTones(audio);
        }
        display.UpdateBraillePos(plot);
    }
    function lockPosition() {
        // lock to min / max postions
        if (position.x < 1) {
            position.x = 0;
        }
        if (position.y < 1) {
            position.y = 0;
        }
        if (position.y > plot.plotData.length - 1) {
            position.y = plot.plotData.length - 1;
        }
        if (position.x > plot.plotData[position.y].length - 1) {
            position.x = plot.plotData[position.y].length - 1;
        }
    }

});

// BoxPlot class.
// This initializes and contains the JSON data model for this chart
class BoxPlot {

    constructor() {
        this.plotData = this.GetData(); // main json data
        this.x_group_label = document.getElementById('GRID.text.91.1.1.tspan.1').innerHTML;
        this.y_group_label = document.getElementById('GRID.text.95.1.1.tspan.1').innerHTML;
        this.y_labels = this.GetXLabels();
    }

    GetXLabels() {
        let labels = [];
        let query = 'tspan[dy="5"]';
        let els = document.querySelectorAll(query);
        for ( let i = 0 ; i < els.length ; i++ ) {
            labels.push(els[i].innerHTML.trim());
        }
        return labels;
    }

    GetData() {
        // data in svg is formed as nested <g> elements. Loop through and get all point data
        // goal is to get bounding x values and type (outlier, whisker, range)

        let plotData = [];
        let id = constants.plotId;

        if (constants.debugLevel > 0) {
            document.getElementById(id).setAttribute("data-debug", "MAINCONTAINERHERE");
        }

        let plots = document.getElementById(id).children;
        for (let i = 0; i < plots.length; i++) {
            let sections = plots[i].children;
            let points = []
            for (let j = 0; j < sections.length; j++) {
                // get segments for this section, there are 2 each
                // sometimes they're 0, so ignore those TODO 
                let segments = sections[j].children;
                for (let k = 0; k < segments.length; k++) {
                    let segment = segments[k];

                    let segmentType = this.GetBoxplotSegmentType(sections[j].getAttribute('id'));
                    let segmentPoints = this.GetBoxplotSegmentPoints(segment, segmentType);

                    for (let l = 0; l < segmentPoints.length; l += 2) {
                        let thisPoint = { 'x': Number(segmentPoints[l]), 'y': Number(segmentPoints[l + 1]), 'type': segmentType }
                        if (thisPoint.x > constants.maxX) constants.maxX = thisPoint.x;
                        points.push(thisPoint);
                    }
                }
            }

            // post processing
            // Sort this plot
            points.sort(function (a, b) {
                return a.x - b.x;
            });
            // and remove whisker from range dups
            let noDupPoints = [];
            for (let d = 0; d < points.length; d++) {
                if (d > 0) {
                    if (points[d - 1].x == points[d].x) {
                        if (points[d - 1].type == "whisker") {
                            noDupPoints.splice(-1, 1);
                            noDupPoints.push(points[d]);
                        } else {
                        }
                    } else {
                        noDupPoints.push(points[d]);
                    }
                } else {
                    noDupPoints.push(points[d]);
                }
            }

            plotData.push(noDupPoints);
        }

        // put plots in order
        plotData.sort(function (a, b) {
            return a[0].y - b[0].y;
        });

        // combine outliers into a single object for easier display
        // info to grab: arr of values=x's, x=xmin, xn=xmax. The rest can stay as is
        for (let i = 0; i < plotData.length; i++) {
            let section = plotData[i];
            // loop through points and find outliers 
            let outlierGroup = [];
            for (let j = 0; j < section.length + 1; j++) {
                let runProcessOutliers = false; // run if we're past outliers (catching the first set), or if we're at the end (catching the last set)
                if (j == section.length) {
                    runProcessOutliers = true;
                } else if (section[j].type != "outlier") {
                    runProcessOutliers = true;
                }
                if ( ! runProcessOutliers ) {
                    // add this to the group and continue
                    outlierGroup.push(section[j]);
                } else if ( outlierGroup.length > 0 ) {
                    // process!! This is the main bit of work done
                    let vals = [];
                    for (let k = 0; k < outlierGroup.length; k++) {
                        // save array of values
                        vals.push(outlierGroup[k].x);

                        // We're only keeping 1 outlier value, so mark all others to delete after we're done processing
                        if ( k > 0 ) {
                            plotData[i][j + k - outlierGroup.length].type = 'delete';
                        }
                    }

                    // save data
                    plotData[i][j - outlierGroup.length].x = outlierGroup[0].x;
                    plotData[i][j - outlierGroup.length].xMax = outlierGroup[outlierGroup.length - 1].x;
                    plotData[i][j - outlierGroup.length].values = vals;

                    // reset for next set
                    outlierGroup = [];
                }
            }
        }
        // clean up from the above outlier processing
        let cleanData = [];
        for (let i = 0; i < plotData.length; i++) {
            cleanData[i] = [];
            for (let j = 0; j < plotData[i].length; j++) {
                if (plotData[i][j].type != 'delete') {
                    cleanData[i][j] = plotData[i][j];
                }
            }
        }
        plotData = cleanData;

        // add labeling for display
        for (let i = 0; i < plotData.length; i++) {
            // each boxplot section
            let rangeCounter = 0;
            for (let j = 0; j < plotData[i].length; j++) {
                let point = plotData[i][j];
                // each point, decide based on position with respect to range
                if (point.type == "outlier") {
                    if (rangeCounter > 0) {
                        plotData[i][j].label = "Upper Outlier"; // todo: don't hard code these, put in resource file
                    } else {
                        plotData[i][j].label = "Lower Outlier";
                    }
                } else if (point.type == "whisker") {
                    if (rangeCounter > 0) {
                        plotData[i][j].label = "Max";
                    } else {
                        plotData[i][j].label = "Min";
                    }
                } else if (point.type == "range") {
                    if (rangeCounter == 0) {
                        plotData[i][j].label = "25%";
                    } else if (rangeCounter == 1) {
                        plotData[i][j].label = "50%";
                    } else if (rangeCounter == 2) {
                        plotData[i][j].label = "75%";
                    }
                    rangeCounter++;
                }
            }
        }

        if (constants.debugLevel > 0) {
            console.log('plotData:', plotData);
        }

        return plotData;
    }

    GetBoxplotSegmentType(sectionId) {
        // Helper function for main GetData:
        // Fetch type, which comes from section id:
        // geom_polygon = range
        // GRID = whisker
        // points = outlier

        let segmentType = 'outlier'; // default? todo: should probably default null, and then throw error instead of return if not set after ifs
        if (sectionId.includes('geom_crossbar')) {
            segmentType = 'range';
        } else if (sectionId.includes('GRID')) {
            segmentType = 'whisker';
        } else if (sectionId.includes('points')) {
            segmentType = 'outlier';
        }

        return segmentType;
    }
    GetBoxplotSegmentPoints(segment, segmentType) {
        // Helper function for main GetData:
        // Fetch x and y point data from svg

        let re = /(?:\d+(?:\.\d*)?|\.\d+)/g;
        let pointString = "";
        let points = [];
        if (segmentType == "range") {
            // ranges go a level deeper
            let matches = segment.children[0].getAttribute('points').match(re);
            points.push(matches[0], matches[1]);
            // the middle bar has 2 points but we just need one, check if they're the same
            if (matches[0] != matches[2]) {
                points.push(matches[2], matches[3]);
            }
        } else if (segmentType == "outlier") {
            // outliers use x attr directly, but have multiple children
            points.push(segment.getAttribute('x'), segment.getAttribute('y'));
        } else {
            // whisker. Get first and third number from points attr
            // but sometimes it's null, giving the same for both, and don't add if that's true
            let matches = segment.getAttribute('points').match(re);
            if (matches[0] != matches[2]) {
                points.push(matches[0], matches[1], matches[2], matches[3]);
            }
        }

        return points;
    }

    PlayTones(audio) {

        if ( plot.plotData[position.y][position.x].type != "outlier" ) {
            audio.playTone();
        } else {
            // we play a run of tones
            position.z = 0;
            let outlierInterval = setInterval(function() {
                // play this tone
                audio.playTone();

                // and then set up for the next one
                position.z += 1;

                // and kill if we're done
                if ( position.z + 1 > plot.plotData[position.y][position.x].values.length ) {
                    clearInterval(outlierInterval);
                    position.z = -1;
                }

            }, constants.autoPlayOutlierRate);
        }

    }

}

// BoxplotRect class
// Initializes and updates the visual outline around sections of the chart
class BoxplotRect {

    // maybe put this stuff in user config?
    rectPadding = 15; // px
    rectStrokeWidth = 4; // px
    rectColorString = 'rgb(3,200,9)';

    svgBoundingOffset = 80; // THIS IS A HACK. I don't know why we need this, but find a better bounding box anchor (todo later)
    svgBoudingOffsetRect = 30.3; // THIS IS A HACK. I don't know why we need this, but find a better bounding box anchor (todo later)

    constructor() {
        this.x1 = 0;
        this.x2 = 0;
        this.y1 = 0;
        this.y2 = 0;
    }

    UpdateRect() {
        // UpdateRect does some horrible calculations to get bounds of visual outline to be drawn

        // get rect bounds
        if (plot.plotData[position.y][position.x].type == 'outlier') {

            this.x1 = plot.plotData[position.y][position.x].x - this.rectPadding;
            this.x2 = plot.plotData[position.y][position.x].xMax + this.rectPadding;
            this.y1 = plot.plotData[position.y][position.x].y - this.rectPadding;
            this.y2 = plot.plotData[position.y][position.x].y + this.rectPadding;

        } else if (plot.plotData[position.y][position.x].type == 'whisker') {

            let whichWhisker = 'before'; // before / after the range. We steal the other point from range and need to know which one
            if (position.x > 0) {
                if (plot.plotData[position.y][position.x - 1].type == 'range') {
                    whichWhisker = 'after';
                }
            }
            if (whichWhisker == 'before') {
                // we're on the before one, use this and next
                this.x1 = plot.plotData[position.y][position.x].x - this.rectPadding;
                this.x2 = plot.plotData[position.y][position.x + 1].x + this.rectPadding;
            } else {
                // we're on the after one, use this and prev
                this.x1 = plot.plotData[position.y][position.x - 1].x - this.rectPadding;
                this.x2 = plot.plotData[position.y][position.x].x + this.rectPadding;
            }
            this.y1 = plot.plotData[position.y][position.x].y - this.rectPadding;
            this.y2 = plot.plotData[position.y][position.x].y + this.rectPadding;

        } else if (plot.plotData[position.y][position.x].type == 'range') {

            // we have 3 points, and do the middle one as just that midpoint line
            // which one are we on though? look up and down
            let whichRange = 'middle';
            if (position.x > 0) {
                if (plot.plotData[position.y][position.x - 1].type != 'range') {
                    whichRange = 'first';
                }
            } else {
                whichRange = 'first';
            }
            if (position.x < plot.plotData[position.y].length - 2) {
                if (plot.plotData[position.y][position.x + 1].type != 'range') {
                    whichRange = 'last';
                }
            } else {
                whichRange = 'last';
            }

            if (whichRange == 'first') {
                this.x1 = plot.plotData[position.y][position.x].x - this.rectPadding;
                this.x2 = plot.plotData[position.y][position.x + 1].x + this.rectPadding;
            } else if (whichRange == 'middle') {
                this.x1 = plot.plotData[position.y][position.x].x - this.rectPadding;
                this.x2 = plot.plotData[position.y][position.x].x + this.rectPadding;
            } else if (whichRange == 'last') {
                this.x1 = plot.plotData[position.y][position.x - 1].x - this.rectPadding;
                this.x2 = plot.plotData[position.y][position.x].x + this.rectPadding;
            }

            // we have no yMax, but whiskers and outliers have a midpoint, so we use that
            let midpoint = 0;
            for (let i = 0; i < plot.plotData[position.y].length; i++) {
                if (plot.plotData[position.y][i].type != "range") {
                    midpoint = plot.plotData[position.y][i].y;
                }
            }
            // y1 and midpoint to get y2
            let height = (midpoint - plot.plotData[position.y][position.x].y) * 2;
            this.y1 = plot.plotData[position.y][position.x].y;
            this.y2 = this.y1 + height;


            // swap y1 y2 so height is > 0
            let swap = this.y1;
            this.y1 = this.y2;
            this.y2 = swap;

            this.y1 += -this.svgBoudingOffsetRect + this.rectPadding;
            this.y2 += -this.svgBoudingOffsetRect - this.rectPadding;

        }

        if (constants.debugLevel > 3) {
            console.log(
                "Point", plot.plotData[position.y][position.x].type,
                "x:", plot.plotData[position.y][position.x].x,
                "y:", plot.plotData[position.y][position.x].y);
            console.log(
                "x1:", this.x1,
                "y1:", this.y1,
                "x2:", this.x2,
                "y2:", this.y2);
        }

        this.UpdateRectDisplay();
    }

    UpdateRectDisplay() {
        // UpdateRectDisplay takes bounding points and creates the visual outline 

        if (document.getElementById('highlight_rect')) document.getElementById('highlight_rect').remove(); // destroy and recreate
        const svgns = "http://www.w3.org/2000/svg";
        let rect = document.createElementNS(svgns, 'rect');
        rect.setAttribute('id', 'highlight_rect');
        rect.setAttribute('x', this.x1);
        rect.setAttribute('y', constants.svg.getBoundingClientRect().bottom - this.svgBoundingOffset - this.y1); // y coord is inverse from plot data
        rect.setAttribute('width', this.x2 - this.x1);
        rect.setAttribute('height', Math.abs(this.y2 - this.y1));
        rect.setAttribute('stroke', this.rectColorString);
        rect.setAttribute('stroke-width', this.rectStrokeWidth);
        rect.setAttribute('fill', 'none');
        constants.svg.appendChild(rect);
    }
}

