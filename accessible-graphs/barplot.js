
// todo: save user data in cookies
// todo: braille? add to boxplot as well

document.addEventListener('DOMContentLoaded', function(e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // variable initialization

    window.constants = new Constants(); 
    constants.plotId = 'geom_rect.rect.2.1';
    constants.x_axes = ["GRID.text.16.1.1.text", "GRID.text.16.1.2.text", "GRID.text.16.1.3.text", "GRID.text.16.1.4.text", "GRID.text.16.1.5.text"]; // todo: this needs to be automated later
    window.position = new Position(-1, -1);
    window.plot = new BarChart();
    constants.chartType = "barchart";

    let audio = new Audio();
    let display = new Display();

    // control eventlisteners
    constants.svg_container.addEventListener("keydown", function (e) {
        // right arrow 39
        if (e.which === 39) {
            position.x += 1;
        }
        // left arrow 37
        if (e.which === 37) {
            position.x += -1;
        }

        // lock to min / max postions
        if ( position.x < 0 ) {
            position.x = 0;
        }
        if ( position.x > plot.bars.length - 1 ) {
            position.x = plot.bars.length - 1;
        }

        // T: aria live text output mode
        if (e.which == 84) {
            display.toggleTextMode();
        }

        // B: braille mode
        if ( e.which == 66 ) {
            display.toggleBrailleMode();
        }

        // update display and audio
        if ( constants.showRect ) {
            plot.Select(); 
            display.displayValues(); 
            //rect.UpdateRect(); // todo, convert
        }
        if ( constants.audioPlay > 0 ) {
            audio.playTone();
        }

    });
});

class BarChart {

    constructor() {
        this.bars = document.querySelectorAll('#' + constants.plotId.replaceAll('\.', '\\.') + ' > rect'); // get rect children of plotId. Note that we have to escape the . in plotId
        this.plotData = this.GetData();

        constants.maxX = this.bars.length - 1;
        constants.maxY = constants.svg.getAttribute('height'); // set max height as entire chart height, not max across all bars
    }

    GetData() {
        // set height for each bar

        let plotData = [];

        for ( let i = 0 ; i < this.bars.length; i++ ) {
            plotData.push(this.bars[i].getAttribute('height'));
        }

        return plotData;
    }

    Select() {
        this.DeselectAll();
        this.bars[position.x].style.fill = constants.colorSelected;
    }

    DeselectAll() {
        for ( let i = 0 ; i < this.bars.length; i++ ) {
            this.bars[i].style.fill = constants.colorUnselected;
        }
    }

}

