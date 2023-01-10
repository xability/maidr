
document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // variable initialization

    constants.plotId = 'geom_rect.rect.2.1';
    window.position = new Position(-1, -1);
    window.plot = new BarChart();
    constants.chartType = "barchart";

    let audio = new Audio();
    let display = new Display();

    let lastPlayed = '';
    let lastx = 0;

    if (constants.debugLevel > 0) {
        constants.svg_container.focus();
    }

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false; // we only update info and play tones on certain keys

        if (e.which === 39) { // right arrow 39
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    lastx = position.x;
                    Autoplay('right', position.x, plot.bars.length);
                } else {
                    position.x = plot.bars.length - 1; // go all the way
                    updateInfoThisRound = true;
                }
            } else if (e.altKey && e.shiftKey && position.x != plot.bars.length - 1) {
                lastx = position.x;
                Autoplay('reverse-right', plot.bars.length, position.x);
            } else {
                position.x += 1;
                updateInfoThisRound = true;
                lockPosition();
            }
        }
        if (e.which === 37) { // left arrow 37
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    lastx = position.x;
                    Autoplay('left', position.x, -1);
                } else {
                    position.x = 0; // go all the way
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
        }


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
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    lastx = position.x;
                    Autoplay('right', position.x, plot.bars.length);
                } else {
                    position.x = plot.bars.length - 1; // go all the way
                    updateInfoThisRound = true;
                }
            } else if (e.altKey && e.shiftKey && position.x != plot.bars.length - 1) {
                lastx = position.x;
                Autoplay('reverse-right', plot.bars.length, position.x);
            } else {
                position.x += 1;
                updateInfoThisRound = true;
                lockPosition();
            }
        } else if (e.which == 37) { // left arrow
            e.preventDefault();
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
                if (e.shiftKey) {
                    lastx = position.x;
                    Autoplay('left', position.x, -1);
                } else {
                    position.x = 0; // go all the way
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
        } else {
            e.preventDefault();
        }

        // update display / text / audio
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

        if (constants.isMac ? (e.which == 91 || e.which == 93) : e.which == 17) { // ctrl (either one)
            constants.KillAutoplay();
        }

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

    function lockPosition() {
        // lock to min / max postions
        if (position.x < 0) {
            position.x = 0;
        }
        if (position.x > plot.bars.length - 1) {
            position.x = plot.bars.length - 1;
        }
    }
    function UpdateAll() {
        if (constants.showDisplay) {
            display.displayValues(plot);
        }
        if (constants.showRect) {
            plot.Select();
        }
        if (constants.audioPlay) {
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
        if (constants.audioPlay) {
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
        if (constants.audioPlay) {
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
        this.bars = document.querySelectorAll('#' + constants.plotId.replaceAll('\.', '\\.') + ' > rect'); // get rect children of plotId. Note that we have to escape the . in plotId
        this.plotData = this.GetData();
        this.plotColumns = this.GetColumns();
        this.plotLegend = this.GetLegend();

        constants.maxX = this.bars.length - 1;
        constants.maxY = Number(constants.svg.getAttribute('height').replace(/\D/g, '')); // set max height as entire chart height, not max across all bars

        this.autoplay = null;
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

