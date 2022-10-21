
class Constants {

    // basic chart properties
    minX = 0;
    maxX = 0;
    plotId = 'geom_boxplot.gTree.68.1';
    svg_container = document.getElementById("svg-container");
    svg = document.querySelector("#svg-container > svg");
    chartType = ""; // set as 'boxplot' or whatever later

    // basic audio properties
    MAX_FREQUENCY = 1000;
    MIN_FREQUENCY = 100;

    // user controls
    duration = .3;
    vol = .5;
    audioPlay = 1; // true / false
    showRect = 1;  // true / false

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

