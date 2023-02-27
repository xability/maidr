
// 
// This is the main boxplotscript. 
// It handles all customization for this chart, controls everything,
// and calls every thing needed from here.
//


document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything
    constants.manualData = false;

    // variable initialization
    constants.plotId = 'geom_boxplot.gTree.78.1';
    window.plot = new BoxPlot();
    constants.chartType = "boxplot";
    window.position = new Position(0, -1);
    let rect = new BoxplotRect();
    let audio = new Audio();
    let display = new Display();
    let lastPlayed = '';
    let lastY = 0;

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false; // we only update info and play tones on certain keys
        let isAtEnd = false;

        // right arrow 
        if (e.which === 39) {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    position.x -= 1;
                    Autoplay('right', position.x, plot.plotData.length);
                } else {
                    position.x = plot.plotData.length - 1;
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.altKey && e.shiftKey && plot.plotData.length - 1 != position.x) {
                lastY = position.y;
                Autoplay('reverse-right', plot.plotData.length, position.x);
            } else {
                if (position.x == -1 && position.y == plot.plotData[position.x].length) {
                    position.y -= 1;
                }
                position.x += 1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
            constants.navigation = 1;
        }
        // left arrow 
        if (e.which === 37) {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    position.x += 1;
                    Autoplay('left', position.x, -1);
                } else {
                    position.x = 0;
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.altKey && e.shiftKey && position.x != 0) {
                lastY = position.y;
                Autoplay('reverse-left', -1, position.x);
            } else {
                position.x += -1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
            constants.navigation = 1;
        }
        // up arrow 
        if (e.which === 38) {
            let oldY = position.y;
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    position.y -= 1;
                    Autoplay('up', position.y, plot.plotData[position.x].length);
                } else {
                    position.y = plot.plotData[position.x].length - 1;
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.altKey && e.shiftKey && position.y != plot.plotData[position.x].length - 1) {
                lastY = position.y;
                Autoplay('reverse-up', plot.plotData[position.x].length, position.y);
            } else {
                position.y += 1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
            //position.x = GetRelativeBoxPosition(oldY, position.y);
            constants.navigation = 0;
        }
        // down arrow 
        if (e.which === 40) {
            let oldY = position.y;
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    position.y += 1;
                    Autoplay('down', position.y, -1);
                } else {
                    position.y = 0;
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.altKey && e.shiftKey && position.y != 0) {
                lastY = position.y;
                Autoplay('reverse-down', -1, position.y);
            } else {
                if (position.x == -1 && position.y == plot.plotData[position.x].length) {
                    position.x += 1;
                }
                position.y += -1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
            //position.x = GetRelativeBoxPosition(oldY, position.y);
            constants.navigation = 0;
        }

        // update display / text / audio
        if (updateInfoThisRound && ! isAtEnd) {
            UpdateAll();
        }
        if ( isAtEnd ) {
            audio.playEnd();
        }

    });

    constants.brailleInput.addEventListener("keydown", function (e) {
        // We block all input, except if it's B or Tab so we move focus

        let updateInfoThisRound = false; // we only update info and play tones on certain keys
        let setBrailleThisRound = false;
        let isAtEnd = false;

        if (e.which == 9) { // tab
            // do nothing, let the user Tab away 
        } else if (e.which == 39) { // right arrow
            e.preventDefault();
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    position.x -= 1;
                    Autoplay('right', position.x, plot.plotData.length);
                } else {
                    position.x = plot.plotData.length - 1;
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.altKey && e.shiftKey && plot.plotData.length - 1 != position.x) {
                lastY = position.y;
                Autoplay('reverse-right', plot.plotData.length, position.x);
            } else {
                if (position.x == -1 && position.y == plot.plotData[position.x].length) {
                    position.y -= 1;
                }
                position.x += 1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
            constants.navigation = 1;
        } else if (e.which == 37) { // left arrow
            e.preventDefault();
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    position.x += 1;
                    Autoplay('left', position.x, -1);
                } else {
                    position.x = 0;
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.altKey && e.shiftKey && position.x != 0) {
                lastY = position.y;
                Autoplay('reverse-left', -1, position.x);
            } else {
                position.x += -1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
            constants.navigation = 1;
        } else if (e.which === 38) { // up arrow 
            let oldY = position.y;
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                position.y = plot.plotData[position.x].length - 1;
            } else {
                position.y += 1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
            //position.x = GetRelativeBoxPosition(oldY, position.y);
            setBrailleThisRound = true;
            constants.navigation = 0;
        } else if (e.which === 40) { // down arrow 
            let oldY = position.y;
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                position.y = 0;
            } else {
                if (position.x == -1 && position.y == plot.plotData[position.x].length) {
                    position.x += 1;
                }
                position.y += -1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
            //position.x = GetRelativeBoxPosition(oldY, position.y);
            setBrailleThisRound = true;
            constants.navigation = 0;
        } else {
            e.preventDefault();
            // todo: allow some controls through like page refresh

        }

        // update audio. todo: add a setting for this later
        if (updateInfoThisRound && ! isAtEnd) {
            if (setBrailleThisRound) display.SetBraille(plot);
            setTimeout(UpdateAllBraille, 50); // we delay this by just a moment as otherwise the cursor position doesn't get set
        }
        if ( isAtEnd ) {
            audio.playEnd();
        }

        // auto turn off braille mode if we leave the braille box
        constants.brailleInput.addEventListener('focusout', function(e) {
            display.toggleBrailleMode('off');
        });

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
                    Autoplay('right', position.y, lastY);
                } else if (lastPlayed == 'reverse-right') {
                    Autoplay('left', position.y, lastY);
                } else if (lastPlayed == 'reverse-up') {
                    Autoplay('down', position.y, lastY);
                } else if (lastPlayed == 'reverse-down') {
                    Autoplay('up', position.y, lastY);
                } else {
                    Autoplay(lastPlayed, position.y, lastY);
                }
            }
        }

        // comma: speed down
        if (e.which == 188) {
            constants.SpeedDown();
            if (constants.autoplayId != null) {
                constants.KillAutoplay();
                if (lastPlayed == 'reverse-left') {
                    Autoplay('right', position.y, lastY);
                } else if (lastPlayed == 'reverse-right') {
                    Autoplay('left', position.y, lastY);
                } else if (lastPlayed == 'reverse-up') {
                    Autoplay('down', position.y, lastY);
                } else if (lastPlayed == 'reverse-down') {
                    Autoplay('up', position.y, lastY);
                } else {
                    Autoplay(lastPlayed, position.y, lastY);
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
        let isLockNeeded = false;
        if (position.y < 0) {
            position.y = 0;
            isLockNeeded = true;
        }
        if (position.x < 0) {
            position.x = 0;
            isLockNeeded = true;
        }
        if (position.x > plot.plotData.length - 1) {
            position.x = plot.plotData.length - 1;
            isLockNeeded = true;
        }
        if (position.y > plot.plotData[position.x].length - 1) {
            position.y = plot.plotData[position.x].length - 1;
            isLockNeeded = true;
        }

        return isLockNeeded;
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
            position.y = start;
        } else if (dir == "reverse-up" || dir == "reverse-down") {
            position.x = start;
        }

        constants.autoplayId = setInterval(function () {
            if (dir == "left" || dir == "right" || dir == "reverse-left" || dir == "reverse-right") {
                position.y += step;
                if (position.y < 0 || plot.plotData[position.x].length - 1 < position.y) {
                    constants.KillAutoplay();
                    lockPosition();
                } else if (position.y == end) {
                    constants.KillAutoplay();
                    UpdateAllAutoplay();
                } else {
                    UpdateAllAutoplay();
                }
            } else {
                position.x += step;
                if (position.x < 0 || plot.plotData.length - 1 < position.x) {
                    constants.KillAutoplay();
                    lockPosition();
                } else if (position.x == end) {
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
        if ( constants.manualData ) {
            this.x_group_label = boxplotLabels.x_group_label;
            this.y_group_label = boxplotLabels.y_group_label;
            this.y_labels = boxplotLabels.y_labels;
            this.plotData = boxplotData;
            this.plotBounds = this.GetPlotBounds(boxplotId);
        } else {
            this.x_group_label = document.getElementById('GRID.text.101.1.1.tspan.1').innerHTML;
            this.y_group_label = document.getElementById('GRID.text.105.1.1.tspan.1').innerHTML;
            this.y_labels = this.GetXLabels();
            this.plotData = this.GetData(); // main json data
            this.plotBounds = this.GetPlotBounds(constants.plotId); // main json data
        }
        this.CleanData();
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

    CleanData() {
        // we manually input data, so now we need to clean it up and set other vars

        constants.minY = 0;
        constants.maxY = 0;
        for ( let i = 0 ; i < boxplotData.length ; i++ ) { // each plot
            for ( let j = 0 ; j < boxplotData[i].length; j++ ) { // each section in plot
                let point = boxplotData[i][j];
                if ( point.hasOwnProperty('y') ) {
                    if ( point.y < constants.minY ) {
                        constants.yMin = point.y;
                    }
                    if ( point.hasOwnProperty('yMax') ) {
                        if ( point.yMax > constants.maxY ) {
                            constants.maxY = point.yMax;
                        }
                    } else {
                        if ( point.y > constants.maxY ) {
                            constants.maxY = point.y;
                        }
                    }
                }
                if ( point.hasOwnProperty('x') ) {
                    if ( point.x < constants.minX ) {
                        constants.minX = point.x;
                    }
                    if ( point.x > constants.maxX ) {
                        constants.maxX = point.x;
                    }
                }
            }
        }
    }

    GetData() {
        // data in svg is formed as nested <g> elements. Loop through and get all point data
        // goal is to get bounding x values and type (outlier, whisker, range, placeholder)

        let plotData = [];

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
                        if ( segmentType == 'whisker' && l == 0 ) {
                        } else {
                            let thisPoint = { 'x': Number(segmentPoints[l]), 'y': Number(segmentPoints[l + 1]), 'type': segmentType }
                            if (thisPoint.y > constants.maxY) constants.maxY = thisPoint.y;
                            points.push(thisPoint);
                        }
                    }
                }
            }

            // post processing
            // Sort this plot
            points.sort(function (a, b) {
                return a.y - b.y;
            });

            plotData.push(points);
        }

        // put plots in order
        plotData.sort(function (a, b) {
            return a[0].x - b[0].x;
        });

        // combine outliers into a single object for easier display
        // info to grab: arr of values=y's, y=ymin, yn=ymax. The rest can stay as is
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
                        vals.push(outlierGroup[k].y);

                        // We're only keeping 1 outlier value, so mark all others to delete after we're done processing
                        if (k > 0) {
                            plotData[i][j + k - outlierGroup.length].type = 'delete';
                        }
                    }

                    // save data
                    plotData[i][j - outlierGroup.length].y = outlierGroup[0].y;
                    plotData[i][j - outlierGroup.length].yMax = outlierGroup[outlierGroup.length - 1].y;
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
            cleanData[i] = cleanData[i].filter(function(){return true;});
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
        let allWeNeed = this.GetAllSegmentTypes();
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

        // update 50% value as a midpoint of 25 and 75
        for ( let i = 0 ; i < plotData.length ; i++ ) {
            plotData[i][3].y = Math.round((plotData[i][2].y + plotData[i][4].y)/2);
        }

        if (constants.debugLevel > 1) {
            console.log('plotData:', plotData);
        }

        return plotData;
    }

    GetPlotBounds(plotId) {
        // we fetch the elements in our parent, and similar to GetData we run through and get bounding boxes (or blanks) for everything, and store in an identical structure

        let plotBounds = [];
        let allWeNeed = this.GetAllSegmentTypes();
        let re = /(?:\d+(?:\.\d*)?|\.\d+)/g;

        // get initial set of elements, a parent element for all outliers, whiskers, and range
        let initialElemSet = [];
        let plots = document.getElementById(constants.plotId).children;
        for (let i = 0; i < plots.length; i++) { // each plot
            let plotSet = {};
            let sections = plots[i].children;
            for (let j = 0; j < sections.length; j++) { 
                let elemType = this.GetBoxplotSegmentType(sections[j].getAttribute('id'));
                plotSet[elemType] = sections[j];
            }
            initialElemSet.push(plotSet);
        }

        // we build our structure based on the full set we need, and have blanks as placeholders
        // many of these overlap or are missing, so now we go through and make the actual array structure we need
        // like, all outliers are in 1 set, so we have to split those out and then get the bounding boxes
        for ( let i = 0 ; i < initialElemSet.length ; i++ ) {
            let plotBound = [];

            // we always have a range, and need those bounds to set others, so we'll do this first
            let rangeBounds = initialElemSet[i].range.getBoundingClientRect();

            // we get the midpoint from actual point values in the svg GRID.segments
            let midPoints = initialElemSet[i].range.querySelector('polyline[id^="GRID"]').getAttribute('points').match(re);
            let rangePoints = initialElemSet[i].range.querySelector('polygon[id^="geom_polygon"]').getAttribute('points').match(re);
            // get midpoint as percentage from bottom to mid to apply to bounding boxes: top(rangePoints[1]) | mid(midPoints[1]) | bottom(rangePoints[3])
            let midPercent = (midPoints[1] - rangePoints[3]) / (rangePoints[1] - rangePoints[3]);
            let midHeight = rangeBounds.height * midPercent;

            // set bounding box values
            
            // 25%
            plotBound[2] = this.convertBoundingClientRectToObj(rangeBounds);
            plotBound[2].label = allWeNeed[2];
            plotBound[2].type = 'range';
            plotBound[2].height = midHeight;
            plotBound[2].top = plotBound[2].bottom - midHeight;
            plotBound[2].y = plotBound[2].top;
            // 50%
            plotBound[3] = this.convertBoundingClientRectToObj(rangeBounds); 
            plotBound[3].label = allWeNeed[3];
            plotBound[3].type = 'range';
            plotBound[3].height = 0;
            plotBound[3].top = rangeBounds.bottom - midHeight;
            plotBound[3].y = plotBound[3].top;
            plotBound[3].bottom = plotBound[3].top;
            // 75%
            plotBound[4] = this.convertBoundingClientRectToObj(rangeBounds); 
            plotBound[4].label = allWeNeed[4];
            plotBound[4].type = 'range';
            plotBound[4].height = rangeBounds.height - midHeight;
            plotBound[4].bottom = plotBound[3].top;

            // now the tricky ones, outliers and whiskers, if we have them
            if ( Object.hasOwn(initialElemSet[i], 'whisker') ) {
                // ok great we have a whisker. It could be just above or below or span across the range (in which case we need to split it up). Let's check
                let whiskerBounds = initialElemSet[i].whisker.getBoundingClientRect();
                let hasBelow = false;
                let hasAbove = false;
                if ( whiskerBounds.bottom > rangeBounds.bottom ) hasBelow = true;
                if ( whiskerBounds.top < rangeBounds.top ) hasAbove = true;

                if ( hasBelow && hasAbove ) {
                    // split it up!

                    // lower whisker
                    plotBound[1] = this.convertBoundingClientRectToObj(whiskerBounds);
                    plotBound[1].label = allWeNeed[1];
                    plotBound[1].type = 'whisker';
                    plotBound[1].top = plotBound[2].bottom;
                    plotBound[1].y = plotBound[1].top;
                    plotBound[1].height = plotBound[1].bottom - plotBound[1].top;

                    // upper whisker
                    plotBound[5] = this.convertBoundingClientRectToObj(whiskerBounds);
                    plotBound[5].label = allWeNeed[5];
                    plotBound[5].type = 'whisker';
                    plotBound[5].bottom = plotBound[4].top;
                    plotBound[5].height = plotBound[5].bottom - plotBound[5].top;
                } else if ( hasBelow ) {
                    // apply directly to [1], blank the other

                    // lower
                    plotBound[1] = this.convertBoundingClientRectToObj(whiskerBounds);
                    plotBound[1].label = allWeNeed[1];
                    plotBound[1].type = 'whisker';
                    plotBound[1].top = plotBound[2].bottom;
                    plotBound[1].y = plotBound[1].top;
                    plotBound[1].height = plotBound[1].bottom - plotBound[1].top;

                    // upper
                    plotBound[5] = {};
                    plotBound[5].label = allWeNeed[5];
                    plotBound[5].type = 'blank';

                } else if ( hasAbove ) {
                    // apply directly to [5], blank the other

                    // lower
                    plotBound[1] = {};
                    plotBound[1].label = allWeNeed[1];
                    plotBound[1].type = 'blank';

                    // upper
                    plotBound[5] = this.convertBoundingClientRectToObj(whiskerBounds);
                    plotBound[5].label = allWeNeed[5];
                    plotBound[5].type = 'whisker';
                    plotBound[5].bottom = plotBound[4].top;
                    plotBound[5].height = plotBound[5].bottom - plotBound[5].top;
                }

            }
            if ( Object.hasOwn(initialElemSet[i], 'outlier') ) {
                // we have one or more outliers. 
                // Where do they appear? above or below the range? both?
                // we want to split them up and put 1 bounding box around each above and below

                let outlierElems = initialElemSet[i].outlier.children;
                let outlierUpperBounds = null;
                let outlierLowerBounds = null;
                for ( let j = 0 ; j < outlierElems.length ; j++ ) {
                    // add this outlier's bounds, or expand if more than one
                    let newOutlierBounds = outlierElems[j].getBoundingClientRect();
                    if ( newOutlierBounds.y < rangeBounds.y ) { // higher, remember y=0 is at the bottom of the page
                        if ( ! outlierUpperBounds ) {
                            outlierUpperBounds = this.convertBoundingClientRectToObj(newOutlierBounds);
                        } else {
                            if ( newOutlierBounds.y < outlierUpperBounds.y ) outlierUpperBounds.y = newOutlierBounds.y;
                            if ( newOutlierBounds.top < outlierUpperBounds.top ) outlierUpperBounds.top = newOutlierBounds.top;
                            if ( newOutlierBounds.bottom > outlierUpperBounds.bottom ) outlierUpperBounds.bottom = newOutlierBounds.bottom;
                        }
                    } else {
                        if ( ! outlierLowerBounds ) {
                            outlierLowerBounds = this.convertBoundingClientRectToObj(newOutlierBounds);
                        } else {
                            if ( newOutlierBounds.y > outlierLowerBounds.y ) outlierLowerBounds.y = newOutlierBounds.y;
                            if ( newOutlierBounds.top > outlierLowerBounds.top ) outlierLowerBounds.top = newOutlierBounds.top;
                            if ( newOutlierBounds.bottom < outlierLowerBounds.bottom ) outlierLowerBounds.bottom = newOutlierBounds.bottom;
                        }
                    }
                }

                // now we add plotBound outlier stuff
                if ( outlierLowerBounds ) {
                    outlierLowerBounds.height = outlierLowerBounds.bottom - outlierLowerBounds.top;

                    plotBound[0] = this.convertBoundingClientRectToObj(outlierLowerBounds);
                    plotBound[0].label = allWeNeed[0];
                    plotBound[0].type = 'outlier';
                } else {
                    plotBound[0] = {};
                    plotBound[0].label = allWeNeed[0];
                    plotBound[0].type = 'blank';
                }
                if ( outlierUpperBounds ) {
                    outlierUpperBounds.height = outlierUpperBounds.bottom - outlierUpperBounds.top;

                    plotBound[6] = this.convertBoundingClientRectToObj(outlierUpperBounds);
                    plotBound[6].label = allWeNeed[6];
                    plotBound[6].type = 'outlier';
                } else {
                    plotBound[6] = {};
                    plotBound[6].label = allWeNeed[6];
                    plotBound[6].type = 'blank';
                }

            } else {
                // add all blanks
                plotBound[0] = {};
                plotBound[0].label = allWeNeed[0];
                plotBound[0].type = 'blank';
                plotBound[6] = {};
                plotBound[6].label = allWeNeed[6];
                plotBound[6].type = 'blank';
            }

            plotBounds.push(plotBound);
        }

        if ( constants.debugLevel > 5 ) {
            console.log('plotBounds', plotBounds);
        }

        return plotBounds;

    }

    GetAllSegmentTypes() {
        let allWeNeed = [
            resources.GetString('lower_outlier'),
            resources.GetString('min'),
            resources.GetString('25'),
            resources.GetString('50'),
            resources.GetString('75'),
            resources.GetString('max'),
            resources.GetString('upper_outlier')
        ];

        return allWeNeed;
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
            if (matches[1] != matches[3]) {
                points.push(matches[0], matches[1], matches[2], matches[3]);
            }
        }

        return points;
    }

    convertBoundingClientRectToObj(rect) {
        return {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            x: rect.x,
            y: rect.y
        };
    }

    PlayTones(audio) {

        if (plot.plotData[position.x][position.y].type == "blank") {
            audio.PlayNull();
        } else if (plot.plotData[position.x][position.y].type != "outlier") {
            audio.playTone();
        } else {
            // outlier(s): we play a run of tones
            position.z = 0;
            let outlierInterval = setInterval(function () {
                // play this tone
                audio.playTone();

                // and then set up for the next one
                position.z += 1;

                // and kill if we're done
                if (position.z + 1 > plot.plotData[position.x][position.y].values.length) {
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
    //rectPaddingOffset = this.rectPadding * 3;
    //rectPaddingOffsetX = 0;
    rectPaddingOffsetY = 45;

    constructor() {
        this.x1 = 0;
        this.width = 0;
        this.y1 = 0;
        this.height = 0;
    }

    UpdateRect() {
        // UpdateRect takes bounding box values from the object and gets bounds of visual outline to be drawn

        if (document.getElementById('highlight_rect')) document.getElementById('highlight_rect').remove(); // destroy to be recreated

        if ( position.y > -1 ) { // initial value is -1, which throws errors, so ignore that

            let bounds = plot.plotBounds[position.x][position.y];

            if ( bounds.type != 'blank' ) {

                let svgBounds = constants.svg.getBoundingClientRect();

                this.x1 = bounds.left - this.rectPadding - svgBounds.left;
                this.width = bounds.width + ( this.rectPadding * 2 ) ;
                this.y1 = bounds.top - this.rectPadding - svgBounds.top;
                this.height = bounds.height + ( this.rectPadding * 2 ) ;

                if (constants.debugLevel > 5) {
                    console.log(
                        "Point", plot.plotData[position.x][position.y].label,
                        "bottom:", bounds.bottom,
                        "top:", bounds.top);
                    console.log(
                        "x1:", this.x1,
                        "y1:", this.y1,
                        "width:", this.width,
                        "height:", this.height);
                }

                this.CreateRectDisplay();
            }
        }
    }

    CreateRectDisplay() {
        // CreateRectDisplay takes bounding points and creates the visual outline 

        const svgns = "http://www.w3.org/2000/svg";
        let rect = document.createElementNS(svgns, 'rect');
        rect.setAttribute('id', 'highlight_rect');
        rect.setAttribute('x', this.x1);
        rect.setAttribute('y', this.y1); // y coord is inverse from plot data
        rect.setAttribute('width', this.width);
        rect.setAttribute('height', this.height);
        rect.setAttribute('stroke', constants.colorSelected);
        rect.setAttribute('stroke-width', this.rectStrokeWidth);
        rect.setAttribute('fill', 'none');
        constants.svg.appendChild(rect);
    }
}

