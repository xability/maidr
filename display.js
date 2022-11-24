
class Display {

    constructor() {
        this.infoDiv = constants.infoDiv;

        this.SetBraille(plot);

        this.x = {};
        this.x.id = "x";
        this.x.textBase = "x-value: ";

        this.y = {};
        this.y.id = "y";
        this.y.textBase = "y-value: ";

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

    toggleBrailleMode() {
        if (constants.brailleMode == "off") {
            constants.brailleMode = "on";
            constants.brailleInput.classList.remove('hidden');
            constants.brailleInput.focus();
            constants.brailleInput.setSelectionRange(position.x, position.x);

            if (constants.chartType == "heatmap") {
                let pos = position.y * (plot.num_cols + 1) + position.x;
                constants.brailleInput.setSelectionRange(pos, pos);
            }
        } else {
            constants.brailleMode = "off";
            constants.brailleInput.classList.add('hidden');
            constants.svg_container.focus();
        }

        this.announceText("Braille " + constants.brailleMode);
    }

    toggleSonificationMode() {
        if (constants.audioPlay) {
            constants.audioPlay = 0;
            this.announceText("Sonification off");
        } else {
            constants.audioPlay = 1;
            this.announceText("Sonification on");
        }

    }

    announceText(txt) {
        constants.announceContainer.innerHTML = txt;
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
                output += '<p>' + plot.plotLegend.y + ' is ' + plot.plotColumns[position.x] + ', ' + plot.plotLegend.x + ' is ' + plot.plotData[position.x] + '</p>\n';
            }
        } else if (constants.chartType == "heatmap") {
            // terse and verbose alternate between columns and rows
            if (constants.textMode == "off") {
                // do nothing :D
            } else if (constants.textMode == "terse") {
                // value only
                if (constants.navigation == 1) { // column navigation
                    output += '<p>' + plot.x_labels[position.x] + ' ' + plot.z[position.y][position.x] + '</p>\n';
                } else { // row navigation
                    output += '<p>' + plot.y_labels[position.y] + ' ' + plot.z[position.y][position.x] + '</p>\n';
                }
            } else if (constants.textMode == "verbose") {
                // col name and value
                if (constants.navigation == 1) {
                    output += '<p>' + plot.x_group_label + ' ' + (plot.x_labels[position.x]).trim() + ', ' + plot.y_group_label + ' ' + (plot.y_labels[position.y]).trim() + ', is ' + plot.z[position.y][position.x] + '</p>\n';
                } else {
                    output += '<p>' + plot.y_group_label + ' ' + (plot.y_labels[position.y]).trim() + ', ' + plot.x_group_label + ' ' + (plot.x_labels[position.x]).trim() + ', is ' + plot.z[position.y][position.x] + '</p>\n';
                }
            }
        } else if (constants.chartType == "boxplot") {
            if (constants.textMode == "off") {
                // do nothing
            } else if (constants.textMode == "terse") {
                if (constants.navigation == 1) { // within box nav
                    output += '<p>' + plot.plotData[position.y][position.x].label + ' ' + plot.plotData[position.y][position.x].x + '</p>\n';
                } else { // new box nav
                    let groupName = "groupName"; // placeholder. todo: get this somehow
                    output += '<p>' + groupName + ' ' + plot.plotData[position.y][position.x].label + ' ' + plot.plotData[position.y][position.x].x + '</p>\n';
                }
            } else if (constants.textMode == "verbose") {
                if (constants.navigation == 1) { // within box nav
                    output += '<p>' + plot.plotData[position.y][position.x].label + ' is ' + plot.plotData[position.y][position.x].x + '</p>\n';
                } else { // new box nav
                    let groupName = "groupName"; // placeholder. todo: get this somehow
                    output += '<p>Class is ' + groupName + ', ' + plot.plotData[position.y][position.x].label + ' is ' + plot.plotData[position.y][position.x].x + '</p>\n';
                }
            }
        } else if (constants.chartType == "scatterplot") {
            if (constants.layer == 0) { // best fit line layer
                if (constants.textMode == "off") {
                    // do nothing
                } else if (constants.textMode == "terse") {
                    output += '<p>' + plot.x[position.x] + ", " + plot.bestFitLinePoints[position.x];
                } else if (constants.textMode == "verbose") {
                    output += '<p>' + plot.groupLabels[0] + " " + plot.x[position.x] + ", " + plot.groupLabels[1] + " " + plot.bestFitLinePoints[position.x] + '</p>\n';
                }
            } else if (constants.layer == 1) { // residual histogram layer
                if (constants.textMode == "off")  {
                    // do nothing
                } else if (constants.textMode == "terse") {
                    // @TODO
                    // output += '<p>' + plot.
                } else if (constants.textMode == "verbose") {
                    // @TODO
                    // output += '<p>' + 'residual ' + plot
                }
            }
        }

        constants.infoDiv.innerHTML = output;
    }

    SetBraille(plot) {

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
                    } else if (plot.values[i][j] <= high) {
                        brailleArray.push("⠉");
                    }
                }
                brailleArray.push("⠳");
            }
        } else if (constants.chartType == "barchart") {
            let range = ((constants.minY + constants.maxY) / 4) + constants.minY;
            for (let i = 0; i < plot.plotData.length; i++) {
                if (plot.plotData[i] < range) {
                    brailleArray.push("⣀");
                } else if (plot.plotData[i] < range * 2) {
                    brailleArray.push("⠤");
                } else if (plot.plotData[i] < range * 3) {
                    brailleArray.push("⠒");
                } else {
                    brailleArray.push("⠉");
                }
            }
        } else if (constants.chartType == "scatterplot") {
            if (constants.layer == 0) { // best fit line layer
                let range = (constants.maxY - constants.minY) / 4;
                let low = constants.minY + range;
                let medium = low + range;
                let medium_high = medium + range;
                let high = medium_high + range;
                for (let i = 0; i < plot.numPoints; i++) {
                    if (plot.bestFitLinePoints[i] <= low) {
                        brailleArray.push("⣀");
                    } else if (plot.bestFitLinePoints[i] <= medium) {
                        brailleArray.push("⠤");
                    } else if (plot.bestFitLinePoints[i] <= medium_high) {
                        brailleArray.push("⠒");
                    } else if (plot.bestFitLinePoints[i] <= high) {
                        brailleArray.push("⠉");
                    }
                }
            } else if (constants.layer == 1) { // residual histogram layer
                // @TODO
            }
        }

        if (constants.debugLevel > 1) {
            console.log(brailleArray.join(''));
        }

        constants.brailleInput.value = brailleArray.join("");
    }
}
