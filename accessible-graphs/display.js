
class Display {

    constructor() {
        this.infoDiv = constants.infoDiv;
        this.infoVerbose = constants.infoVerbose;

        this.braille = this.GetBraille();

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

            this.infoDiv.style.display = "block";
            this.infoVerbose.style.display = "none";
        } else if ( constants.textMode == "terse" ) {
            constants.textMode = "verbose";

            this.infoDiv.style.display = "block";
            this.infoVerbose.style.display = "block";
        } else if ( constants.textMode == "verbose" ) {
            constants.textMode = "off";

            this.infoDiv.style.display = "none";
            this.infoVerbose.style.display = "none";
        }

        announceText(constants.textMode);
    }

    toggleBrailleMode() {
        if ( constants.brailleMode == "off" ) {
            constants.brailleMode = "on";
        } else {
            constants.brailleMode = "off";
        }

        announceText("braille " + constants.brailleMode);
    }

    announceText(txt) {
        constants.announceContainer.innerHTML = txt;
    }

    displayValues(num) {
        //this.document.getElementById("x").innerHTML = "x-value: " + x_values[num];
        //this.document.getElementById("y").innerHTML = "y-value: " + y_values[num];
    }

    displayRow() {
        // this.document.getElementById("category").innerHTML = "island " + y_categories[row];
        // this.document.getElementById("coord").innerHTML = "row " + (row + 1).toString();
        // this.document.getElementById("z-val").innerHTML = z_values[row][col];
    }

    displayCol() {
        // this.document.getElementById("category").innerHTML = "species " + x_categories[col];
        // this.document.getElementById("coord").innerHTML = "column " + (col + 1).toString();
        // this.document.getElementById("z-val").innerHTML = z_values[row][col];
    }

    displayAll() {
        // this.document.getElementById("category").innerHTML = "island " + x_categories[col] + " species " + y_categories[row];
        // this.document.getElementById("coord").innerHTML = "row " + (row + 1).toString() + " column " + (col + 1).toString();
        // this.document.getElementById("z-val").innerHTML = z_values[row][col];
    }

    GetBraille() {
        let range = (constants.minX + constants.maxX) / 3;
    
        let low = constants.minX + range;
        let medium = low + range;
        let high = medium + range;

        let brailleArray = [];
        if ( constants.chartType == "heatmap" ) {
            for (let i = 0; i < plot.plotData[1].length; i++) {
                for (let j = 0; j < plot.plotData[0].length; j++) {
                    if (norms[i][j] == 0) {
                        brailleArray.push("⠀");
                    } else if (norms[i][j] <= low) {
                        brailleArray.push("⠤");
                    } else if (norms[i][j] <= medium) {
                        brailleArray.push("⠒");
                    } else if (norms[i][j] <= high) {
                        brailleArray.push("⠉");
                    }
                }
                brailleArray.push("⠳");
            }
        } else if ( constants.chartType == "barchart" ) {
            for ( let i = 0 ; i < constants.maxX ; i++ ) {
                // todo
            }
        }

        return brailleArray.join("");
    }

    enableDisplay() {
        document.getElementById("braille-display").innerHTML = this.braille;
    }
}
