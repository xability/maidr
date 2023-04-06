
document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // variable initialization

    constants.plotId = 'geom_rect.rect.2.1';
    window.position = new Position(-1, -1);
    window.plot = new BarChart();
    constants.chartType = "barchart";

    let audio = new Audio();

    // global variables
    let lastPlayed = '';
    let lastx = 0;
    let lastKeyTime = 0;
    let pressedL = false;

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false; // we only update info and play tones on certain keys
        let isAtEnd = false;

        if (e.which === 39) { // right arrow 39
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    // lastx = position.x;
                    position.x -= 1;
                    Autoplay('right', position.x, plot.bars.length);
                } else {
                    position.x = plot.bars.length - 1; // go all the way
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.altKey && e.shiftKey && position.x != plot.bars.length - 1) {
                lastx = position.x;
                Autoplay('reverse-right', plot.bars.length, position.x);
            } else {
                position.x += 1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
        }
        if (e.which === 37) { // left arrow 37
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    // lastx = position.x;
                    position.x += 1;
                    Autoplay('left', position.x, -1);
                } else {
                    position.x = 0; // go all the way
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.altKey && e.shiftKey && position.x != 0) {
                lastx = position.x;
                Autoplay('reverse-left', -1, position.x);
            } else {
                position.x += -1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
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
        let isAtEnd = false;

        if (e.which == 9) { // tab
            // do nothing, let the user Tab away 
        } else if (e.which == 39) { // right arrow
            e.preventDefault();
            if (e.target.selectionStart > e.target.value.length - 2) {
            } else if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    // lastx = position.x;
                    position.x -= 1;
                    Autoplay('right', position.x, plot.bars.length);
                } else {
                    position.x = plot.bars.length - 1; // go all the way
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.altKey && e.shiftKey && position.x != plot.bars.length - 1) {
                lastx = position.x;
                Autoplay('reverse-right', plot.bars.length, position.x);
            } else {
                position.x += 1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
        } else if (e.which == 37) { // left arrow
            e.preventDefault();
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    // lastx = position.x;
                    position.x += 1;
                    Autoplay('left', position.x, -1);
                } else {
                    position.x = 0; // go all the way
                    updateInfoThisRound = true;
                    isAtEnd = lockPosition();
                }
            } else if (e.altKey && e.shiftKey && position.x != 0) {
                lastx = position.x;
                Autoplay('reverse-left', -1, position.x);
            } else {
                position.x += -1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
            }
        } else {
            e.preventDefault();
        }

        // auto turn off braille mode if we leave the braille box
        constants.brailleInput.addEventListener('focusout', function(e) {
            display.toggleBrailleMode('off');
        });

        // update display / text / audio
        if (updateInfoThisRound && ! isAtEnd) {
            UpdateAllBraille();
        }
        if ( isAtEnd ) {
            audio.playEnd();
        }

    });

    // var keys;
    let controlElements = [constants.svg_container, constants.brailleInput];
    for ( let i = 0 ; i < controlElements.length ; i++ ) {
        controlElements[i].addEventListener("keydown", function (e) {

            // B: braille mode
            if (e.which == 66) {
                display.toggleBrailleMode();
                e.preventDefault();
            }
            // keys = (keys || []);
            // keys[e.keyCode] = true;
            // if (keys[84] && !keys[76]) {
            //     display.toggleTextMode();
            // }

            // T: aria live text output mode
            if (e.which == 84) {
                let timediff = window.performance.now() - lastKeyTime;
                if (!pressedL || timediff > constants.keypressInterval) {
                    display.toggleTextMode();
                }
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

        // ctrl/cmd: stop autoplay
        if (constants.isMac ? e.metaKey : e.ctrlKey) {

            // (ctrl/cmd)+(home/fn+left arrow): first element
            if (e.which == 36) {
                position.x = 0;
                UpdateAllBraille();
            }

            // (ctrl/cmd)+(end/fn+right arrow): last element
            else if (e.which == 35) {
                position.x = plot.bars.length - 1;
                UpdateAllBraille();
            }
        }

        // for concurrent key press
        // keys = (keys || []);
        // keys[e.keyCode] = true;
        // // lx: x label, ly: y label, lt: title
        // if (keys[76] && keys[88]) { // lx
        //     display.displayXLabel(plot);
        // }

        // if (keys[76] && keys[89]) { // ly
        //     display.displayYLabel(plot);
        // }
        
        // if (keys[76] && keys[84]) { // lt
        //     display.displayTitle(plot);
        // }

        // must come before prefix L
        if (pressedL) {
            if (e.which == 88) { // X: x label
                let timediff = window.performance.now() - lastKeyTime;
                if (pressedL && timediff <= constants.keypressInterval) {
                    display.displayXLabel(plot);
                }
                pressedL = false;
            } else if (e.which == 89) { // Y: y label
                let timediff = window.performance.now() - lastKeyTime;
                if (pressedL && timediff <= constants.keypressInterval) {
                    display.displayYLabel(plot);
                }
                pressedL = false;
            } else if (e.which == 84) { // T: title
                let timediff = window.performance.now() - lastKeyTime;
                if (pressedL && timediff <= constants.keypressInterval) {
                    display.displayTitle(plot);
                }
                pressedL = false;
            } else if (e.which == 76) {
                lastKeyTime = window.performance.now();
                pressedL = true;
            } else {
                pressedL = false;
            }
        }

        // L: prefix for label; must come after the suffix
        if (e.which == 76) {
            lastKeyTime = window.performance.now();
            pressedL = true;
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

    // document.addEventListener("keyup", function (e) {
    //     keys[e.keyCode] = false;
    //     stop();
    // }, false);
    
    function lockPosition() {
        // lock to min / max postions
        let isLockNeeded = false;
        if (position.x < 0) {
            position.x = 0;
            isLockNeeded = true;
        }
        if (position.x > plot.bars.length - 1) {
            position.x = plot.bars.length - 1;
            isLockNeeded = true;
        }

        return isLockNeeded;
    }
    function UpdateAll() {
        if (constants.showDisplay) {
            display.displayValues(plot);
        }
        if (constants.showRect) {
            plot.Select();
        }
        if (constants.sonifMode != "off") {
            audio.playTone();
        }
    }
    function UpdateAllAutoplay() {
        if (constants.showDisplayInAutoplay) {
            display.displayValues(plot);
        }
        if (constants.showRect) {
            plot.Select();
        }
        if (constants.sonifMode != "off") {
            audio.playTone();
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
            plot.Select();
        }
        if (constants.sonifMode != "off") {
            audio.playTone();
        }
        display.UpdateBraillePos(plot);
    }
    function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right and reverse-left
        if (dir == "left" || dir == "reverse-right") {
            step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId != null) {
            constants.KillAutoplay();
        }

        if (dir == "reverse-right" || dir == "reverse-left") {
            position.x = start;
        }

        constants.autoplayId = setInterval(function () {
            position.x += step;
            if (position.x < 0 || plot.bars.length - 1 < position.x) {
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

});


class BarChart {

    constructor() {
        if ( constants.manualData ) {
            this.bars = barplotBars;
            this.plotData = barplotData;
            this.plotColumns = barplotColumns;
            this.plotLegend = this.GetLegendFromManualData(barplotLegend);
            this.title = (typeof barplotTitle !== 'undefined' && typeof barplotTitle != null) ? barplotTitle : "";
        } else {
            this.bars = document.querySelectorAll('#' + constants.plotId.replaceAll('\.', '\\.') + ' > rect'); // get rect children of plotId. Note that we have to escape the . in plotId
            this.plotData = this.GetData();
            this.plotColumns = this.GetColumns();
            this.plotLegend = this.GetLegend();
        }

        constants.minY = Math.min(...this.plotData);
        constants.maxY = Math.max(...this.plotData);
        constants.maxX = this.bars.length - 1;

        this.autoplay = null;
    }

    GetLegendFromManualData() {
        let legend = {};

        legend.x = barplotLegend.x;
        legend.y = barplotLegend.y;

        return legend;
    }

    GetData() {
        // set height for each bar

        let plotData = [];

        for (let i = 0; i < this.bars.length; i++) {
            plotData.push(this.bars[i].getAttribute('height'));
        }

        return plotData;
    }

    GetColumns() {
        // get column names
        // the pattern seems to be a <tspan> with dy="10", but check this for future output (todo)

        let plotColumns = [];
        let els = document.querySelectorAll('tspan[dy="10"]'); // todo, generalize this selector
        for (var i = 0; i < els.length; i++) {
            plotColumns.push(els[i].innerHTML);
        }

        return plotColumns;
    }

    GetLegend() {
        let legend = {};
        let els = document.querySelectorAll('tspan[dy="12"]'); // todo, generalize this selector
        legend.x = els[1].innerHTML;
        legend.y = els[0].innerHTML;

        return legend;

    }

    Select() {
        this.DeselectAll();
        this.bars[position.x].style.fill = constants.colorSelected;
    }

    DeselectAll() {
        for (let i = 0; i < this.bars.length; i++) {
            this.bars[i].style.fill = constants.colorUnselected;
        }
    }


}

