
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
    minY = 0;
    maxY = 0;
    plotId = ''; // update with id in chart specific js
    chartType = ""; // set as 'boxplot' or whatever later in chart specific js file

    // page elements
    svg_container = document.getElementById("svg-container");
    svg = document.querySelector("#svg-container > svg");
    brailleContainer = document.getElementById('braille-div');
    brailleInput = document.getElementById('braille-input');
    infoDiv = document.getElementById("info"); 
    //infoVerbose = document.getElementById("verbose_info"); 
    announceContainer = document.getElementById('announcements');

    // added features for info display and braille display
    info_container = document.getElementById("info");
    braille_container = document.getElementById("braille-div");

    // basic audio properties
    MAX_FREQUENCY = 1000;
    MIN_FREQUENCY = 100;

    // user controls
    duration = .3
    vol = .5;
    showRect = 1;  // true / false

    showDisplay = 1; // true / false
    textMode = "terse"; // off / terse / verbose
    brailleMode = "off" ; // on / off
    audioPlay = 1; // true / false
    colorUnselected = "rgb(89,89,89)";
    colorSelected = "rgb(3,200,9)";

    // debug stuff
    debugLevel = 3; // 0 = no console output, 1 = some console, 2 = more console, etc
}

class Position {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
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

