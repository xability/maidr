
class Display {

    constructor() {
        this.infoDiv = constants.infoDiv;

        this.x = {};
        this.x.id = "x";
        this.x.textBase = "x-value: ";

        this.y = {};
        this.y.id = "y";
        this.y.textBase = "y-value: ";

        this.boxplotGridPlaceholders = [
            resources.GetString('lower_outlier'),
            resources.GetString('min'),
            resources.GetString('25'),
            resources.GetString('50'),
            resources.GetString('75'),
            resources.GetString('max'),
            resources.GetString('upper_outlier')];


    }

    toggleTextMode() {
        if (constants.textMode == "off") {
            constants.textMode = "terse";
        } else if (constants.textMode == "terse") {
            constants.textMode = "verbose";
        } else if (constants.textMode == "verbose") {
            constants.textMode = "off";
        }

        this.announceText('<span aria-hidden="true">Text mode:</span> ' + constants.textMode);
    }

    toggleBrailleMode(onoff) {
        if ( typeof(onoff) === 'undefined' ) {
            onoff = constants.brailleMode == "on" ? "off" : "on";
        }
        if (onoff == "on") {
            if (constants.chartType == "boxplot") { // braille mode is on before any plot is selected
                if ((orientation == "vert" && position.x == 0 && position.y == plot.plotData[0].length - 1) || (orientation != "vert" && position.x == -1 && position.y == plot.plotData.length)) {
                    this.announceText("Braille " + constants.brailleMode + ": Please select a box before turning on Braille mode.");
                    constants.brailleInput.setSelectionRange(0, 0);
                    return;
                }
            }

            constants.brailleMode = "on";
            constants.brailleInput.classList.remove('hidden');
            constants.brailleInput.focus();
            constants.brailleInput.setSelectionRange(position.x, position.x);

            this.SetBraille(plot);

            if (constants.chartType == "heatmap") {
                let pos = position.y * (plot.num_cols + 1) + position.x;
                constants.brailleInput.setSelectionRange(pos, pos);
            }

            // braille mode is on before navigation of svg
            // very important to make sure braille works properly
            if (position.x == -1 && position.y == -1) { 
                constants.brailleInput.setSelectionRange(0, 0);
            }
        } else {
            constants.brailleMode = "off";
            constants.brailleInput.classList.add('hidden');
            constants.svg.focus();
        }

        this.announceText("Braille " + constants.brailleMode);
    }

    toggleSonificationMode() {
        if (constants.chartType == "scatterplot" && constants.layer == 0) {
            if (constants.sonifMode == "off") {
                constants.audioPlay = 1;
                constants.sonifMode = "sep";
                this.announceText(resources.GetString("son_sep"));
            } else if (constants.sonifMode == "sep") {
                constants.audioPlay = 1;
                constants.sonifMode = "same";
                this.announceText(resources.GetString("son_same"));
            } else if (constants.sonifMode == "same") {
                constants.audioPlay = 0;
                constants.sonifMode = "off";
                this.announceText(resources.GetString("son_off"));
            }
        } else {
            if (constants.audioPlay == 0) {
                constants.audioPlay = 1;
                this.announceText(resources.GetString('son_on'));
            } else {
                constants.audioPlay = 0;
                this.announceText(resources.GetString('son_off'));
            }
        }

    }

    toggleLayerMode() {
        if (constants.layer == 0) {
            constants.layer = 1;
            this.announceText("Layer 2: Smoothed line");
        } else if (constants.layer == 1) {
            constants.layer = 0;
            this.announceText("Layer 1: Point");
        }
    }

    announceText(txt) {
        constants.announceContainer.innerHTML = txt;
    }

    UpdateBraillePos() {
        if (constants.chartType == "barchart") {
            constants.brailleInput.setSelectionRange(position.x, position.x);
        } else if (constants.chartType == "heatmap") {
            let pos = (position.y * (plot.num_cols + 1)) + position.x;
            constants.brailleInput.setSelectionRange(pos, pos);
        } else if (constants.chartType == "boxplot") {
            // on boxplot we extend characters a lot and have blanks, so we go to our label
            let sectionPos = orientation == "vert" ? position.y : position.x;
            let targetLabel = this.boxplotGridPlaceholders[sectionPos];
            let haveTargetLabel = false;
            let adjustedPos = 0;
            if (constants.brailleData) {
                for (let i = 0; i < constants.brailleData.length; i++) {
                    if (constants.brailleData[i].type != 'blank') {
                        if (resources.GetString(constants.brailleData[i].label) == targetLabel) {
                            haveTargetLabel = true;
                            break;
                        }
                    }
                    adjustedPos += constants.brailleData[i].numChars;
                }
            } else {
                throw 'Braille data not set up, cannot move cursor in braille, sorry.';
            }
            // but sometimes we don't have our targetLabel, go to the start
            // future todo: look for nearby label and go to the nearby side of that
            if (!haveTargetLabel) {
                adjustedPos = 0;
            }

            constants.brailleInput.setSelectionRange(adjustedPos, adjustedPos);

        } else if (constants.chartType == "scatterplot") {
            constants.brailleInput.setSelectionRange(positionL1.x, positionL1.x);
        }
    }

    displayValues(plot) {
        // we build an html text string to output to both visual users and aria live based on what chart we're on, our position, and the mode
        // note: we do this all as one string rather than changing individual element IDs so that aria-live receives a single update

        let output = "";
        if (constants.chartType == "barchart") {
            if (constants.textMode == "off") {
                // do nothing :D
            } else if (constants.textMode == "terse") {
                // {colname} {value}
                output += '<p>' + plot.plotColumns[position.x] + ' ' + plot.plotData[position.x] + '</p>\n';
            } else if (constants.textMode == "verbose") {
                // {legend x} is {colname x}, {legend y} is {value y}
                output += '<p>' + plot.plotLegend.x + ' is ' + plot.plotColumns[position.x] + ', ' + plot.plotLegend.y + ' is ' + plot.plotData[position.x] + '</p>\n';
            }
        } else if (constants.chartType == "heatmap") {
            // terse and verbose alternate between columns and rows
            if (constants.textMode == "off") {
                // do nothing :D
            } else if (constants.textMode == "terse") {
                // value only
                if (constants.navigation == 1) { // column navigation
                    output += '<p>' + plot.x_labels[position.x] + ', ' + plot.plotData[2][position.y][position.x] + '</p>\n';
                } else { // row navigation
                    output += '<p>' + plot.y_labels[position.y] + ', ' + plot.plotData[2][position.y][position.x] + '</p>\n';
                }
            } else if (constants.textMode == "verbose") {
                // col name and value
                if (constants.navigation == 1) {
                    output += '<p>' + plot.x_group_label + ' ' + (plot.x_labels[position.x]) + ', ' + plot.y_group_label + ' ' + (plot.y_labels[position.y]) + ', ' + plot.box_label + ' is ' + plot.plotData[2][position.y][position.x] + '</p>\n';
                } else {
                    output += '<p>' + plot.y_group_label + ' ' + (plot.y_labels[position.y]) + ', ' + plot.x_group_label + ' ' + (plot.x_labels[position.x]) + ', ' + plot.box_label + ' is ' + plot.plotData[2][position.y][position.x] + '</p>\n';
                }
            }
        } else if (constants.chartType == "boxplot") {
            // setup
            let val = 0;
            let numPoints = 1;
            let pointType = "";
            let isOutlier = false;
            let plotPos = orientation == "vert" ? position.x : position.y;
            let sectionPos = orientation == "vert" ? position.y : position.x;
            if ( plot.plotData[plotPos][sectionPos].label == 'lower_outlier' || plot.plotData[plotPos][sectionPos].label == 'upper_outlier' ) {
                isOutlier = true;
            }
            if (plot.plotData[plotPos][sectionPos].type == "outlier") {
                val = plot.plotData[plotPos][sectionPos].values.join(', ');
                if (plot.plotData[plotPos][sectionPos].values.length > 0) {
                    numPoints = plot.plotData[plotPos][sectionPos].values.length;
                } else {
                    numPoints = 0;
                }

                pointType = "outlier";
            } else if (plot.plotData[plotPos][sectionPos].type == "blank") {
                val = '';
                if ( isOutlier ) numPoints = 0;
            } else {
                if ( orientation == "vert" ) {
                    val = plot.plotData[plotPos][sectionPos].y;
                } else {
                    val = plot.plotData[plotPos][sectionPos].x;
                }
            }

            // set output
            if (constants.textMode == "off") {
                // do nothing
            } else {
                output += '<p>';
                // group label
                if ( constants.textMode == "verbose" ) {
                    if ( constants.navigation ) {
                        if ( plot.x_group_label ) output += plot.x_group_label;
                    } else if ( ! constants.navigation ) {
                        if ( plot.y_group_label ) output += plot.y_group_label;
                    }
                }
                // and axis label
                if ( constants.navigation ) {
                    if ( plot.x_labels[plotPos] ) {
                        if ( constants.textMode == "verbose" ) output += " is ";
                        output += plot.x_labels[plotPos] + ", ";
                    } else if ( constants.textMode == "verbose" ) {
                        output += ", ";
                    }
                } else if ( ! constants.navigation ) {
                    if ( plot.y_labels[plotPos] ) {
                        if ( constants.textMode == "verbose" ) output += " is ";
                        output += plot.y_labels[plotPos] + ", ";
                    } else if ( constants.textMode == "verbose" ) {
                        output += ", ";
                    }
                }
                // outliers
                if ( isOutlier ) {
                    output += numPoints + " ";
                }
                // label
                if ( isOutlier || constants.textMode == "verbose" || ( constants.navigation && orientation == "horz" ) || ( ! constants.navigation && orientation == "vert" ) ) {
                    output += resources.GetString(plot.plotData[plotPos][sectionPos].label);
                    // grammar
                    if ( constants.textMode == "verbose" ) {
                        if ( numPoints == 1 ) output += ' is ';
                        else {
                            output += 's ';
                            if ( numPoints > 1 ) output += ' are ';
                        }
                    } else {
                        if (numPoints != 1) output += 's';
                        output += " ";
                    }
                }
                // val
                if ( plot.plotData[plotPos][sectionPos].type == "blank" && ! isOutlier ) {
                    output += "empty";
                } else {
                    output += val;
                }

                output += '<p>\n';
            }
        } else if (constants.chartType == "scatterplot") {
            if (constants.layer == 0) { // point layer
                if (constants.textMode == "off") {
                    // do nothing
                } else if (constants.textMode == "terse") {
                    output += '<p>' + plot.x[position.x] + ", " + "[" + plot.y[position.x].join(", ") + "]" + '</p>\n';
                } else if (constants.textMode == "verbose") {
                    output += '<p>' + plot.groupLabels[0] + " " + plot.x[position.x] + ", " + plot.groupLabels[1] + " [" + plot.y[position.x].join(", ") + "]" + '</p>\n';
                }
            } else if (constants.layer == 1) { // best fit line layer
                if (constants.textMode == "off") {
                    // do nothing
                } else if (constants.textMode == "terse") {
                    // terse mode: gradient trend
                    // output += '<p>' + plot.gradient[positionL1.x] + '<p>\n';

                    // display absolute gradient of the graph
                    output += '<p>' + plot.curvePoints[positionL1.x] + '<p>\n';
                } else if (constants.textMode == "verbose") {
                    // verbose mode: x and y values
                    output += '<p>' + plot.groupLabels[0] + " " + plot.curveX[positionL1.x] + ", " + plot.groupLabels[1] + " " + plot.curvePoints[positionL1.x] + '</p>\n';
                    // if (positionL1.x == plot.gradient.length - 1) {
                    //     output += '<p>end</end';
                    // } else {
                    //     output += '<p>y-value of smooth line is ' + plot.gradient[positionL1.x] + '<p>\n';
                    // }
                }
            }
        }

        constants.infoDiv.innerHTML = output;
    }

    SetBraille(plot) {
        // todo: this errors on boxplot when we try and move above or below valid position.y

        let brailleArray = [];

        if (constants.chartType == "heatmap") {
            let range = (constants.maxY - constants.minY) / 3;
            let low = constants.minY + range;
            let medium = low + range;
            let high = medium + range;
            for (let i = 0; i < plot.y_coord.length; i++) {
                for (let j = 0; j < plot.x_coord.length; j++) {
                    if (plot.values[i][j] == 0) {
                        brailleArray.push("⠀");
                    } else if (plot.values[i][j] <= low) {
                        brailleArray.push("⠤");
                    } else if (plot.values[i][j] <= medium) {
                        brailleArray.push("⠒");
                    } else {
                        brailleArray.push("⠉");
                    }
                }
                brailleArray.push("⠳");
            }
        } else if (constants.chartType == "barchart") {
            let range = (constants.maxY - constants.minY) / 4;
            let low = constants.minY + range;
            let medium = low + range;
            let medium_high = medium + range;
            for (let i = 0; i < plot.plotData.length; i++) {
                if (plot.plotData[i] <= low) {
                    brailleArray.push("⣀");
                } else if (plot.plotData[i] <= medium) {
                    brailleArray.push("⠤");
                } else if (plot.plotData[i] <= medium_high) {
                    brailleArray.push("⠒");
                } else {
                    brailleArray.push("⠉");
                }
            }
        } else if (constants.chartType == "scatterplot") {
            let range = (plot.curveMaxY - plot.curveMinY) / 4;
            let low = plot.curveMinY + range;
            let medium = low + range;
            let medium_high = medium + range;
            let high = medium_high + range;
            for (let i = 0; i < plot.curvePoints.length; i++) {
                if (plot.curvePoints[i] <= low) {
                    brailleArray.push("⣀");
                } else if (plot.curvePoints[i] <= medium) {
                    brailleArray.push("⠤");
                } else if (plot.curvePoints[i] <= medium_high) {
                    brailleArray.push("⠒");
                } else if (plot.curvePoints[i] <= high) {
                    brailleArray.push("⠉");
                }
            }
        } else if (constants.chartType == "boxplot" && position.y > -1) { // only run if we're on a plot
            // Idea here is to use different braille characters to physically represent the boxplot
            // if sections are longer or shorter we'll add more characters
            // example: outlier, small space, long min, med 25/50/75, short max: ⠂ ⠒⠒⠒⠒⠒⠒⠿⠸⠿⠒
            //
            // So, we get weighted lengths of each section (or gaps between outliers, etc),
            // and then create the appropriate number of characters
            //
            // This is messy and long (250 lines). If anyone wants to improve. Be my guest

            // First, we make an array of lengths and types that represent our plot
            let brailleData = [];
            let isBeforeMid = true;
            let plotPos = orientation == "vert" ? position.x : position.y;
            let valCoord = orientation == "vert" ? 'y' : 'x';
            let boundingBoxOffset = constants.manualData ? 0 : 127; // 0 comes through as 127 for some reason if pulling from svg, so ignore values smaller than this for starting blank space. todo: find out why and set this according to px offset from actual bounding box
            for (let i = 0; i < plot.plotData[plotPos].length; i++) {
                let point = plot.plotData[plotPos][i];
                // pre clean up, we may want to remove outliers that share the same coordinates. Reasoning: We want this to visually represent the data, and I can't see 2 points on top of each other
                let visualBraille = false;
                if ( point.values && visualBraille ) {
                    point.values = [...new Set(point.values)];
                }

                let nextPoint = null;
                let prevPoint = null;
                if (i < plot.plotData[plotPos].length - 1) {
                    nextPoint = plot.plotData[plotPos][i + 1];
                }
                if (i > 0) {
                    prevPoint = plot.plotData[plotPos][i - 1];
                }

                let charData = {};

                if (i == 0) {
                    // first point, add space to next actual point
                    let firstCoord = 0;
                    for (let j = 0; j < plot.plotData[plotPos].length; j++) {
                        // find next actual point
                        if (valCoord in plot.plotData[plotPos][j]) {
                            firstCoord = plot.plotData[plotPos][j][valCoord];
                            break;
                        }
                    }
                    charData = {};
                    charData.length = firstCoord - 0 - boundingBoxOffset;
                    if (charData.length < 0) charData.length = 0; // dunno why, but this happens sometimes
                    charData.type = 'blank';
                    charData.label = 'blank';
                    brailleData.push(charData);
                }

                if (point.type == "blank") {
                    // this is a placeholder point, do nothing
                } else if (point.type == "outlier") {
                    // there might be lots of these or none

                    // Spacing is messy:
                    // isBeforeMid: no pre space, yes after space
                    // ! isBeforeMid: yes pre space, no after space
                    // either way add spaces in between outlier points

                    // pre point space
                    if (isBeforeMid) {
                        // no pre space 
                    } else {
                        // yes after space
                        charData = {};
                        charData.length = point.values[0] - prevPoint[valCoord];
                        charData.type = 'blank';
                        charData.label = 'blank';
                        brailleData.push(charData);
                    }

                    // now add points with spaces in between
                    for (var k = 0; k < point.values.length; k++) {
                        if (k == 0) {
                            charData = {};
                            charData.length = 0;
                            charData.type = "outlier"
                            charData.label = point.label;
                            brailleData.push(charData);
                        } else {
                            charData = {};
                            charData.length = point.values[k] - point.values[k - 1];
                            charData.type = "blank";
                            charData.label = 'blank';
                            brailleData.push(charData);

                            charData = {};
                            charData.length = 0;
                            charData.type = "outlier"
                            charData.label = point.label;
                            brailleData.push(charData);
                        }
                    }

                    // after point space
                    if (isBeforeMid) {
                        // yes pre space 
                        charData = {};
                        charData.length = nextPoint[valCoord] - point.values[point.values.length - 1];
                        charData.type = 'blank';
                        charData.label = 'blank';
                        brailleData.push(charData);
                    } else {
                        // no after space
                    }
                } else {
                    if (point.label == "50") {
                        // exception: another 0 width point here
                        charData = {};
                        charData.length = 0;
                        charData.type = point.type;
                        charData.label = point.label;
                        brailleData.push(charData);

                        isBeforeMid = false; // mark this as we pass
                    } else {
                        // normal points: we calc dist between this point and point closest to middle
                        charData = {};
                        if (isBeforeMid) {
                            charData.length = nextPoint[valCoord] - point[valCoord];
                        } else {
                            charData.length = point[valCoord] - prevPoint[valCoord];
                        }
                        charData.type = point.type;
                        charData.label = point.label;
                        brailleData.push(charData);
                    }
                }
                if (i == plot.plotData[plotPos].length - 1) {
                    // last point gotta add ending space manually
                    charData = {};
                    let lastCoord = 0;
                    for (let j = 0; j < plot.plotData[plotPos].length; j++) {
                        // find last actual point

                        if (point.type == "outlier") {
                            lastCoord = valCoord == 'y' ? point.yMax : point.xMax;
                        } else if (valCoord in plot.plotData[plotPos][j]) {
                            lastCoord = plot.plotData[plotPos][j][valCoord];
                        }
                    }
                    charData.length = valCoord == 'y' ? constants.maxY - lastCoord : constants.maxX - lastCoord;
                    charData.type = "blank";
                    charData.label = "blank";
                    brailleData.push(charData);
                }
            }
            // cleanup 
            for (let i = 0; i < brailleData.length; i++) {
                // A bit of rounding to account for floating point errors
                brailleData[i].length = Math.round(brailleData[i].length); // we currently just use rounding to whole number (pixel), but if other rounding is needed add it here
            }

            // We create a set of braille characters based on the lengths
            // Method: initially give each block a single character, then add characters one by one where they have the most impact
            // We use the length and current numChars to get a weight of sorts (eg len 200 numChars 4 -> 50 each char)
            // then we add the next character where most impactful. 
            // exception: each must have min 1 character
            // exception: if there are multiple blocks that have the same values, use this priority:
            //   1: 25/75
            //   2: min/max
            //   3: blanks
            // exception: for 25/75 and min/max, if they aren't exactly equal, assign different num characters
            // exception: center is always 456 123
            // todo: exception: if there's a tie across a single block (or even multiple blocks), should we assign to the whole block (like, spaces between all 5 outliers)? or just the first chart like current (so the first space between the 5 outliers, which could cause some strange behaviour)

            let locMin = -1;
            let locMax = -1;
            let loc25 = -1;
            let loc75 = -1;
            // prepopulate a single char each
            for (let i = 0; i < brailleData.length; i++) {
                if (brailleData[i].type != 'blank') {
                    brailleData[i].numChars = 1;
                } else {
                    brailleData[i].numChars = 0;
                }

                // store 25/75 min/max locations so we can check them later more easily
                if (brailleData[i].label == 'min') locMin = i;
                if (brailleData[i].label == 'max') locMax = i;
                if (brailleData[i].label == '25') loc25 = i;
                if (brailleData[i].label == '75') loc75 = i;

                // 50 gets 2 characters by default
                if (brailleData[i].label == '50') brailleData[i].numChars = 2;
            }
            // add extras to 25/75 min/max if needed
            let currentPairs = ['25','75'];
            if (locMin > -1 && locMax > -1) {
                currentPairs.push('min'); // we add these seperately because we don't always have both min and max
                currentPairs.push('max');
                if (brailleData[locMin].length != brailleData[locMax].length) {
                    if (brailleData[locMin].length > brailleData[locMax].length) {
                        brailleData[locMin].numChars++;
                    } else {
                        brailleData[locMax].numChars++;
                    }
                }
            }
            if (brailleData[loc25].length != brailleData[loc75].length) {
                if (brailleData[loc25].length > brailleData[loc75].length) {
                    brailleData[loc25].numChars++;
                } else {
                    brailleData[loc75].numChars++;
                }
            }

            // Main algorithm here: add characters itteritively on max length impact
            let charsAvailable = constants.brailleDisplayLength;
            charsAvailable += -1; // to account for the double char on midpoint
            for (let i = 0; i < brailleData.length; i++) {
                charsAvailable -= brailleData[i].numChars;
            }
            let debugSanity = 0;
            while (charsAvailable > 0 && debugSanity < 2000) {
                debugSanity++;
                let maxImpactI = 0;
                for (let i = 0; i < brailleData.length; i++) {
                    if (this.CharLenImpact(brailleData[i]) > this.CharLenImpact(brailleData[maxImpactI])) {
                        maxImpactI = i;
                    }
                }

                // do we potentially need to add chars to the other in the pair?
                if (!(brailleData[maxImpactI].label in currentPairs)) {
                    brailleData[maxImpactI].numChars++;
                    charsAvailable--;
                } else if (brailleData[maxImpactI].label in ['min','max']) {
                    // if they're equal, add to both
                    if (brailleData[locMin].length == brailleData[locMax].length) {
                        if (charsAvailable > 1) {
                            brailleData[locMin].numChars++;
                            brailleData[locMax].numChars++;
                        }
                        charsAvailable += -2;
                    } else {
                        // if not equal, would adding to 1 side make them seem equal?
                        if (maxImpactI == locMin) {
                            if (brailleData[locMin].numChars + 1 == brailleData[locMax].numChars) {
                                // if so, then add to both
                                if (charsAvailable > 1) {
                                    brailleData[locMin].numChars++;
                                    brailleData[locMax].numChars++;
                                }
                                charsAvailable += -2;
                            } else {
                                // if not, then it's fine, just add it
                                brailleData[maxImpactI].numChars++;
                                charsAvailable--;
                            }
                        } else {
                            // same for other side
                            if (brailleData[locMax].numChars + 1 == brailleData[locMin].numChars) {
                                // if so, then add to both
                                if (charsAvailable > 1) {
                                    brailleData[locMax].numChars++;
                                    brailleData[locMin].numChars++;
                                }
                                charsAvailable += -2;
                            } else {
                                // if not, then it's fine, just add it
                                brailleData[maxImpactI].numChars++;
                                charsAvailable--;
                            }
                        }
                    }
                } else if (brailleData[maxImpactI].label in ['25', '75']) {
                    // if they're equal, add to both
                    if (brailleData[loc25].length == brailleData[loc75].length) {
                        if (charsAvailable > 1) {
                            brailleData[loc25].numChars++;
                            brailleData[loc75].numChars++;
                        }
                        charsAvailable += -2;
                    } else {
                        // if not equal, would adding to 1 side make them seem equal?
                        if (maxImpactI == loc25) {
                            if (brailleData[loc25].numChars + 1 == brailleData[loc75].numChars) {
                                // if so, then add to both
                                if (charsAvailable > 1) {
                                    brailleData[loc25].numChars++;
                                    brailleData[loc75].numChars++;
                                }
                                charsAvailable += -2;
                            } else {
                                // if not, then it's fine, just add it
                                brailleData[maxImpactI].numChars++;
                                charsAvailable--;
                            }
                        } else {
                            // same for other side
                            if (brailleData[loc75].numChars + 1 == brailleData[loc25].numChars) {
                                // if so, then add to both
                                if (charsAvailable > 1) {
                                    brailleData[loc75].numChars++;
                                    brailleData[loc25].numChars++;
                                }
                                charsAvailable += -2;
                            } else {
                                // if not, then it's fine, just add it
                                brailleData[maxImpactI].numChars++;
                                charsAvailable--;
                            }
                        }
                    }
                }

            } // end while (main algorithm)

            constants.brailleData = brailleData;
            if (constants.debugLevel > 5) {
                console.log('plotData[i]', plot.plotData[plotPos]);
                console.log('brailleData', brailleData);
            }

            // convert to braille characters
            for (let i = 0; i < brailleData.length; i++) {
                for (let j = 0; j < brailleData[i].numChars; j++) {
                    let brailleChar = "⠀"; // blank
                    if (brailleData[i].label == 'min' || brailleData[i].label == 'max') {
                        brailleChar = "⠒";
                    } else if (brailleData[i].label == '25' || brailleData[i].label == '75') {
                        brailleChar = "⠿";
                    } else if (brailleData[i].label == '50') {
                        if (j == 0) {
                            brailleChar = "⠸";
                        } else {
                            brailleChar = "⠇";
                        }
                    } else if (brailleData[i].type == "outlier") {
                        brailleChar = "⠂";
                    }
                    brailleArray.push(brailleChar);
                }
            }

        }

        constants.brailleInput.value = brailleArray.join("");

        constants.brailleInput.value = brailleArray.join('');
        if (constants.debugLevel > 5) {
            console.log('braille:', constants.brailleInput.value);
        }

        this.UpdateBraillePos();
    }

    CharLenImpact(charData) {
        return (charData.length / charData.numChars);
    }

}
