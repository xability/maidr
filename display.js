
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
        if (constants.textMode == "off" ) {
            constants.textMode = "terse";
        } else if ( constants.textMode == "terse" ) {
            constants.textMode = "verbose";
        } else if ( constants.textMode == "verbose" ) {
            constants.textMode = "off";
        }

        this.announceText('<span aria-hidden="true">Text mode:</span> ' + constants.textMode);
    }

    toggleBrailleMode() {
        if ( constants.brailleMode == "off" ) {
            constants.brailleMode = "on";
            constants.brailleInput.classList.remove('hidden');
            constants.brailleInput.focus();
            constants.brailleInput.setSelectionRange(position.x, position.x);
        } else {
            constants.brailleMode = "off";
            constants.brailleInput.classList.add('hidden');
            constants.svg_container.focus();
        }

        this.announceText("Braille " + constants.brailleMode);
    }

    toggleSonificationMode() {
        if ( constants.audioPlay ) {
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
        // note: we do this all as one string rather than altering seperate IDs partially so that aria-live receives a single update

        let output = "";
        if ( constants.chartType == "barchart" ) {
            if ( constants.textMode == "off" ) {
                // do nothing :D
            } else if ( constants.textMode == "terse" ) {
                // value only
                output += '<p>' + plot.plotData[position.x] + '</p>\n';
            } else if ( constants.textMode == "verbose" ) {
                // col name and value
                output += '<p>' + plot.plotColumns[position.x] + ' ' + plot.plotData[position.x] + '</p>\n';
            }
        } else if ( constants.chartType == "heatmap" ) {
            // @TODO
            // terse and verbose alternate between columns and rows
            if ( constants.textMode == "off" ) {
                // do nothing :D
            } else if ( constants.textMode == "terse" ) {
                // value only
                output += '<p>' + plot.plotData[position.x] + '</p>\n';
            } else if ( constants.textMode == "verbose" ) {
                // col name and value
                output += '<p>' + plot.plotColumns[position.x] + ' ' + plot.plotData[position.x] + '</p>\n';
            }
        }

        constants.infoDiv.innerHTML = output;
    }

    SetBraille(plot) {

        let brailleArray = [];

        if ( constants.chartType == "heatmap" ) {
            let range = (constants.minX + constants.maxX) / 3;
            let low = constants.minX + range;
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
        } else if ( constants.chartType == "barchart" ) {
            let range = ( ( constants.minY + constants.maxY ) / 4 ) + constants.minY ;
            for ( let i = 0 ; i < plot.plotData.length; i++ ) {
                if ( plot.plotData[i] < range ) {
                    brailleArray.push("⣀");
                } else if ( plot.plotData[i] < range * 2 ) {
                    brailleArray.push("⠤");
                } else if ( plot.plotData[i] < range * 3 ) {
                    brailleArray.push("⠒");
                } else {
                    brailleArray.push("⠉");
                }
            }
        }

        if ( constants.debugLevel > 1 ) {
            console.log(brailleArray.join(''));
        }


        constants.brailleInput.value = brailleArray.join("");
    }
}
