
class Constants {
    // default constructor for boxplot
    constructor() {}

    // we have diff id names for diff plots
    constructor(plotId) {
        this.plotId = plotId;
    }

    // basic chart properties
    minX = 0;
    maxX = 0;
    plotId = 'geom_boxplot.gTree.68.1';
    svg_container = document.getElementById("svg-container");
    svg = document.querySelector("#svg-container > svg");
    chartType = ""; // set as 'boxplot' or whatever later

    // added features for info display and braille display
    info_container = document.getElementById("info");
    braille_container = document.getElementById("braille-div");

    // basic audio properties
    MAX_FREQUENCY = 1000;
    MIN_FREQUENCY = 100;

    // user controls
    duration = .3
    vol = .5;
    audioPlay = 1; // true / false
    showRect = 1;  // true / false
    verbose = 1; // true / false
    showBraille = 1; // true / false

    // debug stuff
    debugLevel = 5; // 0 = no console output, 1 = some console, 2 = more console, etc
}

// HELPER FUNCTIONS
class Helper {

    static containsObject(obj, arr) {
        for ( let i = 0 ; i < arr.length ; i++ ) {
            if ( arr[i] === obj ) return true;
        }
        return false;
    }
}

