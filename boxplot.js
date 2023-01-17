
// 
// This is the main boxplotscript. 
// It handles all customization for this chart, controls everything,
// and calls every thing needed from here.
//


document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // variable initialization

    constants.plotId = 'geom_boxplot.gTree.68.1';
    window.plot = new BoxPlot();
    constants.chartType = "boxplot";
    window.position = new Position(-1, plot.plotData.length - 1);
    let rect = new BoxplotRect();
    let audio = new Audio();
    let display = new Display();
    let lastPlayed = '';
    let lastx = 0;
    console.log(position.x);
    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false; // we only update info and play tones on certain keys

        // right arrow 
        if (e.which === 39) {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    // lastx = position.x;
                    position.x -= 1;
                    Autoplay('right', position.x, plot.plotData[position.y].length);
                } else {
                    position.x = plot.plotData[position.y].length - 1;
                    updateInfoThisRound = true;
                }
            } else if (e.altKey && e.shiftKey && plot.plotData[position.y].length - 1 != position.x) {
                lastx = position.x;
                Autoplay('reverse-right', plot.plotData[position.y].length, position.x);
            } else {
                position.x += 1;
                updateInfoThisRound = true;
                lockPosition();
            }
            constants.navigation = 1;
        }
        // left arrow 
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
                position.x += -1;
                updateInfoThisRound = true;
                lockPosition();
            }
            constants.navigation = 1;
        }
        // up arrow 
        if (e.which === 38) {
            let oldY = position.y;
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    //lastx = position.y;
                    position.y -= 1;
                    Autoplay('up', position.y, plot.plotData.length);
                } else {
                    position.y = plot.plotData.length - 1;
                    updateInfoThisRound = true;
                }
            } else if (e.altKey && e.shiftKey && position.y != plot.plotData.length - 1) {
                lastx = position.x;
                Autoplay('reverse-up', plot.plotData.length, position.y);
            } else {
                position.y += 1;
                updateInfoThisRound = true;
                lockPosition();
            }
            //position.x = GetRelativeBoxPosition(oldY, position.y);
            constants.navigation = 0;
        }
        // down arrow 
        if (e.which === 40) {
            let oldY = position.y;
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    // lastx = position.y;
                    position.y += 1;
                    Autoplay('down', position.y, -1);
                } else {
                    position.y = 0;
                    updateInfoThisRound = true;
                }
            } else if (e.altKey && e.shiftKey && position.y != 0) {
                lastx = position.x;
                Autoplay('reverse-down', -1, position.y);
            } else {
                position.y += -1;
                updateInfoThisRound = true;
                lockPosition();
            }
            //position.x = GetRelativeBoxPosition(oldY, position.y);
            constants.navigation = 0;
        }

        // update display / text / audio
        if (updateInfoThisRound) {
            UpdateAll();
        }

    });

    constants.brailleInput.addEventListener("keydown", function (e) {
        // We block all input, except if it's B or Tab so we move focus

        let updateInfoThisRound = false; // we only update info and play tones on certain keys
        let setBrailleThisRound = false;

        if (e.which == 9) { // tab
            // do nothing, let the user Tab away 
        } else if (e.which == 39) { // right arrow
            e.preventDefault();
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    // lastx = position.x;
                    position.x -= 1;
                    Autoplay('right', position.x, plot.plotData[position.y].length);
                } else {
                    position.x = plot.plotData[position.y].length - 1;
                    updateInfoThisRound = true;
                }
            } else if (e.altKey && e.shiftKey && plot.plotData[position.y].length - 1 != position.x) {
                lastx = position.x;
                Autoplay('reverse-right', plot.plotData[position.y].length, position.x);
            } else {
                position.x += 1;
                updateInfoThisRound = true;
                lockPosition();
            }
            constants.navigation = 1;
        } else if (e.which == 37) { // left arrow
            e.preventDefault();
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
                position.x += -1;
                updateInfoThisRound = true;
                lockPosition();
            }
            constants.navigation = 1;
        } else if (e.which === 38) { // up arrow 
            let oldY = position.y;
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                position.y = plot.plotData.length - 1;
            } else {
                position.y += 1;
                lockPosition();
            }
            //position.x = GetRelativeBoxPosition(oldY, position.y);
            setBrailleThisRound = true;
            constants.navigation = 0;
            updateInfoThisRound = true;
        } else if (e.which === 40) { // down arrow 
            let oldY = position.y;
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                position.y = 0;
            } else {
                position.y += -1;
                lockPosition();
            }
            //position.x = GetRelativeBoxPosition(oldY, position.y);
            setBrailleThisRound = true;
            constants.navigation = 0;
            updateInfoThisRound = true;
        } else {
            e.preventDefault();
            // todo: allow some controls through like page refresh

        }

        // update audio. todo: add a setting for this later
        if (updateInfoThisRound) {
            if (setBrailleThisRound) display.SetBraille(plot);
            setTimeout(UpdateAllBraille, 50); // we delay this by just a moment as otherwise the cursor position doesn't get set
        }

    });

    // todo: put all this in a shared area since it's basically identical across all charts
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

        if (e.which === 32) { // space 32, replay info but no other changes
            UpdateAll();
        }

        });
    }

    document.addEventListener("keydown", function (e) {

        if (constants.isMac ? e.metaKey : e.ctrlKey) {

            // (ctrl/cmd)+(home/fn+left arrow): top left element
            if (e.which == 36) {
                position.x = 0;
                position.y = plot.plotData.length - 1;
                UpdateAllBraille();
            }

            // (ctrl/cmd)+(end/fn+right arrow): right bottom element
            else if (e.which == 35) {
                position.x = plot.plotData[0].length - 1;
                position.y = 0;
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
                } else if (lastPlayed == 'reverse-up') {
                    Autoplay('down', position.x, lastx);
                } else if (lastPlayed == 'reverse-down') {
                    Autoplay('up', position.x, lastx);
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
                } else if (lastPlayed == 'reverse-up') {
                    Autoplay('down', position.x, lastx);
                } else if (lastPlayed == 'reverse-down') {
                    Autoplay('up', position.x, lastx);
                } else {
                    Autoplay(lastPlayed, position.x, lastx);
                }
            }
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
    }
    function UpdateAllAutoplay() {
        if (constants.showDisplayInAutoplay) {
            display.displayValues(plot);
        }
        if (constants.showRect) {
            rect.UpdateRect();
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

    // deprecated. We now use grid system and x values are always available
    function GetRelativeBoxPosition(yOld, yNew) {
        // Used when we move up / down to another plot
        // We want to go to the relative position in the new plot
        // ie, if we were on the 50%, return the position.x of the new 50%

        // init
        let xNew = 0;
        // lock yNew
        if (yNew < 1) {
            ynew = 0;
        } else if (yNew > plot.plotData.length - 1) {
            yNew = plot.plotData.length - 1;
        }

        if (yOld < 0) {
            // not on any chart yet, just start at 0
        } else {
            let oldLabel = "";
            if ('label' in plot.plotData[yOld][position.x]) {
                oldLabel = plot.plotData[yOld][position.x].label;
            }
            // does it exist on the new plot? we'll just get that val
            for (let i = 0; i < plot.plotData[yNew].length; i++) {
                if (plot.plotData[yNew][i].label == oldLabel) {
                    xNew = i;
                }
            }
        }

        return xNew;

    }

    function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right / up / reverse-left / reverse-down
        if (dir == "left" || dir == "down" || dir == "reverse-right" || dir == "reverse-up") {
            step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId != null) {
            constants.KillAutoplay();
        }

        if (dir == "reverse-left" || dir == "reverse-right") {
            position.x = start;
        } else if (dir == "reverse-up" || dir == "reverse-down") {
            position.y = start;
        }

        constants.autoplayId = setInterval(function () {
            if (dir == "left" || dir == "right" || dir == "reverse-left" || dir == "reverse-right") {
                position.x += step;
                if (position.x < 0 || plot.plotData[position.y].length - 1 < position.x) {
                    constants.KillAutoplay();
                    lockPosition();
                } else if (position.x == end) {
                    constants.KillAutoplay();
                    UpdateAllAutoplay();
                } else {
                    UpdateAllAutoplay();
                }
            } else {
                position.y += step;
                if (position.y < 0 || plot.plotData.length - 1 < position.y) {
                    constants.KillAutoplay();
                    lockPosition();
                } else if (position.y == end) {
                    constants.KillAutoplay();
                    UpdateAllAutoplay();
                } else {
                    UpdateAllAutoplay();
                }
            }
        }, constants.autoPlayRate);
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
        for (let i = 0; i < els.length; i++) {
            labels.push(els[i].innerHTML.trim());
        }
        return labels;
    }

    GetData() {
        // data in svg is formed as nested <g> elements. Loop through and get all point data
        // goal is to get bounding x values and type (outlier, whisker, range, placeholder)

        let plotData = [];

        if (constants.debugLevel > 0) {
            document.getElementById(constants.plotId).setAttribute("data-debug", "MAINCONTAINERHERE");
        }

        let plots = document.getElementById(constants.plotId).children;
        for (let i = 0; i < plots.length; i++) { // each plot

            let sections = plots[i].children;
            let points = []
            for (let j = 0; j < sections.length; j++) { // each segment (outlier, whisker, etc)
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
                if (!runProcessOutliers) {
                    // add this to the group and continue
                    outlierGroup.push(section[j]);
                } else if (outlierGroup.length > 0) {
                    // process!! This is the main bit of work done
                    let vals = [];
                    for (let k = 0; k < outlierGroup.length; k++) {
                        // save array of values
                        vals.push(outlierGroup[k].x);

                        // We're only keeping 1 outlier value, so mark all others to delete after we're done processing
                        if (k > 0) {
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
                        plotData[i][j].label = resources.GetString('upper_outlier');
                    } else {
                        plotData[i][j].label = resources.GetString('lower_outlier');
                    }
                } else if (point.type == "whisker") {
                    if (rangeCounter > 0) {
                        plotData[i][j].label = resources.GetString('max');
                    } else {
                        plotData[i][j].label = resources.GetString('min');
                    }
                } else if (point.type == "range") {
                    if (rangeCounter == 0) {
                        plotData[i][j].label = resources.GetString('25');
                    } else if (rangeCounter == 1) {
                        plotData[i][j].label = resources.GetString('50');
                    } else if (rangeCounter == 2) {
                        plotData[i][j].label = resources.GetString('75');
                    }
                    rangeCounter++;
                }
            }
        }

        // often a plot doesn't have various sections. 
        // we expect outlier - min - 25 - 50 - 75 - max - outlier
        // add blank placeholders where they don't exist for better vertical navigation
        let allWeNeed = [
            resources.GetString('lower_outlier'),
            resources.GetString('min'),
            resources.GetString('25'),
            resources.GetString('50'),
            resources.GetString('75'),
            resources.GetString('max'),
            resources.GetString('upper_outlier')
        ];
        for (let i = 0; i < plotData.length; i++) {
            if (plotData[i].length == 7) {
                // skip, this one has it all. The rare boi
            } else {
                let whatWeGot = []; // we'll get a set of labels that we have so we can find what's missing
                for (let j = 0; j < plotData[i].length; j++) {
                    whatWeGot.push(plotData[i][j].label);
                }

                // add missing stuff where it should go. We use .label as the user facing var (todo, might be a mistake, maybe use .type?)
                for (let j = 0; j < allWeNeed.length; j++) {
                    if (!whatWeGot.includes(allWeNeed[j])) {
                        // add a blank where it belongs
                        let blank = { type: 'blank', label: allWeNeed[j] };
                        plotData[i].splice(j, 0, blank);
                        whatWeGot.splice(j, 0, allWeNeed[j]);
                    }
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

        if (plot.plotData[position.y][position.x].type == "blank") {
            audio.PlayNull();
        } else if (plot.plotData[position.y][position.x].type != "outlier") {
            audio.playTone();
        } else {
            // we play a run of tones
            position.z = 0;
            let outlierInterval = setInterval(function () {
                // play this tone
                audio.playTone();

                // and then set up for the next one
                position.z += 1;

                // and kill if we're done
                if (position.z + 1 > plot.plotData[position.y][position.x].values.length) {
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
    rectPaddingOffset = this.rectPadding * 2;

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

            // we have no yMax, but whiskers and outliers have a midpoint, so we use any of them
            let midpoint = 0;
            for (let i = 0; i < plot.plotData[position.y].length; i++) {
                if (plot.plotData[position.y][i].type != "range" && plot.plotData[position.y][i].y) {
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

            this.y1 += -this.rectPaddingOffset + this.rectPadding;
            this.y2 += -this.rectPaddingOffset - this.rectPadding;

        }

        if (constants.debugLevel > 5) {
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

        if (document.getElementById('highlight_rect')) document.getElementById('highlight_rect').remove(); // destroy and recreate
        if (plot.plotData[position.y][position.x].type != 'blank') this.CreateRectDisplay();
    }

    CreateRectDisplay() {
        // CreateRectDisplay takes bounding points and creates the visual outline 


        const svgns = "http://www.w3.org/2000/svg";
        let rect = document.createElementNS(svgns, 'rect');
        rect.setAttribute('id', 'highlight_rect');
        rect.setAttribute('x', this.x1);
        rect.setAttribute('y', constants.svg.getBoundingClientRect().height - this.rectPaddingOffset - this.y1); // y coord is inverse from plot data
        rect.setAttribute('width', this.x2 - this.x1);
        rect.setAttribute('height', Math.abs(this.y2 - this.y1));
        rect.setAttribute('stroke', constants.colorSelected);
        rect.setAttribute('stroke-width', this.rectStrokeWidth);
        rect.setAttribute('fill', 'none');
        constants.svg.appendChild(rect);
    }
}

