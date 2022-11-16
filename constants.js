
// todo list: 
// save user data in cookies
// all html except scripts / css, and main svg need to be in some Init function, including:
//  * aria live region setup
//  * tabindex on svg
//  * hidden braille input
//  * role application on svg

class Constants {

    // element ids
    svg_container_id = "svg-container";
    braille_container_id = "braille-div";
    braille_input_id = "braille-input";
    info_id = "info";
    announcement_container_id = "announcements";

    // default constructor for boxplot
    constructor() {
        this.PrepHtml(); // init html

        // page elements
        this.svg_container = document.getElementById(this.svg_container_id);
        this.svg = document.querySelector('#' + this.svg_container_id + ' > svg');
        this.brailleContainer = document.getElementById(this.braille_container_id);
        this.brailleInput = document.getElementById(this.braille_input_id);
        this.infoDiv = document.getElementById(this.info_id);
        this.announceContainer = document.getElementById(this.announcement_container_id);
    }

    // basic chart properties
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
    plotId = ''; // update with id in chart specific js
    chartType = ""; // set as 'boxplot' or whatever later in chart specific js file
    navigation = 1; // 0 = row navigation (up/down), 1 = col navigation (left/right)

    // basic audio properties
    MAX_FREQUENCY = 1000;
    MIN_FREQUENCY = 100;

    // user settings
    vol = .5;
    showRect = 1;  // true / false
    autoPlayRate = 250; // ms per tone
    colorUnselected = "rgb(89,89,89)"; // todo: don't rely on color! also do a shape or pattern fill
    colorSelected = "rgb(3,200,9)";

    // advanced user settings
    duration = .2;
    autoPlayOutlierRate = 50; // ms per tone

    // user controls (with shortcuts usually)
    showDisplay = 1; // true / false
    textMode = "terse"; // off / terse / verbose
    brailleMode = "off"; // on / off
    audioPlay = 1; // true / false

    // debug stuff
    debugLevel = 3; // 0 = no console output, 1 = some console, 2 = more console, etc

    PrepHtml() {
        // init html stuff. aria live regions, braille input, etc

        // info aria live
        if ( ! document.getElementById(this.info_id) ) {
            document.getElementById(this.svg_container_id).insertAdjacentHTML('afterend', '<br>\n<div id="info" aria-live="assertive" aria-atomic="true">\n<p id="x"></p>\n<p id="y"></p>\n</div>\n');
        }

        // announcements aria live
        if ( ! document.getElementById(this.announcement_container_id) ) {
            document.getElementById(info_id).insertAdjacentHTML('afterend', '<div id="announcements" aria-live="assertive" aria-atomic="true">\n</div>\n');
        }

        // braille
        if ( ! document.getElementById(this.braille_container_id) ) {
            document.getElementById('container').insertAdjacentHTML('afterbegin', '<div id="braille-div">\n<input id="braille-input" class="braille-input hidden" type="text" />\n</div>\n');
        }

        // role app on svg
        if ( document.getElementById(this.svg_container_id) ) {
            document.querySelector('#' + this.svg_container_id + ' > svg').setAttribute('role', 'application');
        }
    }
}

class Position {
    constructor(x, y, z=-1) {
        this.x = x;
        this.y = y;
        this.z = z; // rarely used
    }
}

// HELPER FUNCTIONS
class Helper {

    static containsObject(obj, arr) {
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] === obj) return true;
        }
        return false;
    }
}

