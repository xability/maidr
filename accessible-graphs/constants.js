
class Constants {

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
    braille_container = document.getElementById('braille-div');
    braille_input = document.getElementById('braille-input');
    infoContainer = document.getElementById("info"); 
    infoVerbose = document.getElementById("verbose_info"); 
    announceContainer = document.getElementById('announcements');

    // basic audio properties
    MAX_FREQUENCY = 1000;
    MIN_FREQUENCY = 100;

    // user controls
    duration = .3;
    vol = .5;
    audioPlay = 1; // true / false
    showRect = 1;  // true / false
    textMode = "terse"; // off / terse / verbose
    brailleMode = "off"; // off / on
    colorUnselected = "rgb(89,89,89)";
    colorSelected = "rgb(3,200,9)";

    // debug stuff
    debugLevel = 5; // 0 = no console output, 1 = some console, 2 = more console, etc
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

