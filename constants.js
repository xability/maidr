
// todo list: 
// save user data in cookies

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
        this.nonMenuFocus = this.svg;
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
    MIN_FREQUENCY = 200;
    NULL_FREQUENCY = 100;

    // autoplay speed
    MAX_SPEED = 2000;
    MIN_SPEED = 50;
    INTERVAL = 50;

    // user settings
    vol = .4;
    autoPlayRate = 250; // ms per tone
    colorSelected = "#03C809";
    brailleDisplayLength = 18; // num characters in user's braille display. JooYoung says everyone has at least 18

    // advanced user settings
    showRect = 1;  // true / false
    duration = .2;
    autoPlayOutlierRate = 30; // ms per tone
    autoPlayPointsRate = 30;
    colorUnselected = "#595959"; // we don't use this yet, but remember: don't rely on color! also do a shape or pattern fill

    // user controls (not exposed to menu, with shortcuts usually)
    showDisplay = 1; // true / false
    showDisplayInBraille = 1; // true / false
    showDisplayInAutoplay = 0; // true / false
    textMode = "terse"; // off / terse / verbose
    brailleMode = "off"; // on / off
    audioPlay = 1; // 0/1 for most plots, also 2,3 for boxplot
    layer = 0; // 0 = points; 1 = best fit line => for scatterplot

    // platform controls
    isMac = navigator.userAgentData.platform == "macOS"; // true if macOS
    control = this.isMac ? 'Cmd' : 'Ctrl';
    alt = this.isMac ? 'option' : 'Alt';
    home = this.isMac ? 'fn + Left arrow' : 'Home';
    end = this.isMac ? 'fn + Right arrow' : 'End';

    // debug stuff
    debugLevel = 3; // 0 = no console output, 1 = some console, 2 = more console, etc

    PrepHtml() {
        // init html stuff. aria live regions, braille input, etc

        // info aria live
        if (!document.getElementById(this.info_id)) {
            document.getElementById(this.svg_container_id).insertAdjacentHTML('afterend', '<br>\n<div id="info" aria-live="assertive" aria-atomic="true">\n<p id="x"></p>\n<p id="y"></p>\n</div>\n');
        }

        // announcements aria live
        if (!document.getElementById(this.announcement_container_id)) {
            document.getElementById(info_id).insertAdjacentHTML('afterend', '<div id="announcements" aria-live="assertive" aria-atomic="true">\n</div>\n');
        }

        // braille
        if (!document.getElementById(this.braille_container_id)) {
            document.getElementById('container').insertAdjacentHTML('afterbegin', '<div id="braille-div">\n<input id="braille-input" class="braille-input hidden" type="text" />\n</div>\n');
        }

        // role app on svg
        if (document.getElementById(this.svg_container_id)) {
            document.querySelector('#' + this.svg_container_id + ' > svg').setAttribute('role', 'application');
            document.querySelector('#' + this.svg_container_id + ' > svg').setAttribute('tabindex', '0');
        }
    }

    KillAutoplay() {
        if (this.autoplayId) {
            clearInterval(this.autoplayId);
            this.autoplayId = null;
        }
    }

    SpeedUp() {
        if (constants.autoPlayRate - this.INTERVAL > this.MIN_SPEED) {
            constants.autoPlayRate -= this.INTERVAL;
        }
    }

    SpeedDown() {
        if (constants.autoPlayRate + this.INTERVAL <= this.MAX_SPEED) {
            constants.autoPlayRate += this.INTERVAL;
        }
    }
}

class Resources {

    constructor() { }

    language = "en"; // 2 char lang code
    knowledgeLevel = "basic" // basic, intermediate, expert

    // these strings run on getters, which pull in language, knowledgeLevel, chart, and actual requested string
    strings = {
        "en": {
            "basic": {
                "upper_outlier": "Upper Outlier",
                "lower_outlier": "Lower Outlier",
                "min": "Low",
                "max": "High",
                "25": "25%",
                "50": "50%",
                "75": "75%",
                "son_on": "Sonification on",
                "son_off": "Sonification off",
                "son_des": "Sonification descrete",
                "son_comp": "Sonification compare",
                "son_ch": "Sonification chord",
                "empty": "Empty"
            }
        }
    }

    GetString(id) {
        return this.strings[this.language][this.knowledgeLevel][id];
    }


}

class Menu {

    constructor() {
        this.CreateMenu();
    }

    menuHtml = `
        <div id="menu" class="modal hidden" role="dialog" tabindex="-1">
            <div class="modal-dialog" role="document" tabindex="0">
                <div class="modal-content">
                    <div class="modal-header">
                        <h4 class="modal-title">Menu</h4>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div>
                            <h5 class="modal-title">Keyboard Shortcuts</h5>
                            <table>
                                <caption class="sr-only">Keyboard Shortcuts</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">Function</th>
                                        <th scope="col">Key</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Move around plot</td>
                                        <td>Arrow keys</td>
                                    </tr>
                                    <tr>
                                        <td>Go to the very left right up down</td>
                                        <td>${constants.control} + Arrow key</td>
                                    </tr>
                                    <tr>
                                        <td>Autoplay speed up</td>
                                        <td>.</td>
                                    </tr>
                                    <tr>
                                        <td>Autoplay speed down</td>
                                        <td>,</td>
                                    </tr>
                                    <tr>
                                        <td>Toggle Braille Mode</td>
                                        <td>b</td>
                                    </tr>
                                    <tr>
                                        <td>Toggle Sonification Mode</td>
                                        <td>s</td>
                                    </tr>
                                    <tr>
                                        <td>Toggle Text Mode</td>
                                        <td>t</td>
                                    </tr>
                                    <tr>
                                        <td>Repeat current sound</td>
                                        <td>Space</td>
                                    </tr>
                                    <tr>
                                        <td>Autoplay in a direction</td>
                                        <td>${constants.control} + Shift + Arrow key</td>
                                    </tr>
                                    <tr>
                                        <td>Reverse Autoplay in a direction</td>
                                        <td>${constants.alt} + Shift + Arrow key</td>
                                    </tr>
                                    <tr>
                                        <td>Stop Autoplay</td>
                                        <td>${constants.control}</td>
                                    </tr>
                                    <tr>
                                        <td>Select the first element</td>
                                        <td>${constants.control} + ${constants.home}</td>
                                    </tr>
                                    <tr>
                                        <td>Select the last element</td>
                                        <td>${constants.control} + ${constants.end}</td>
                                    </tr>

                                </tbody>
                            </table>
                        </div>

                        <div>
                            <h5 class="modal-title">Settings</h5>
                            <p><input type="range" id="vol" name="vol" min="0" max="1" step=".05"><label for="vol">Volume</label></p>
                            <!-- <p><input type="checkbox" id="show_rect" name="show_rect"><label for="show_rect">Show Outline</label></p> //-->
                            <p><input type="number" min="4" max="2000" step="1" id="braille_display_length" name="braille_display_length"><label for="braille_display_length">Braille Display Size</label></p>
                            <p><input type="number" min="50" max="2000" step="50" id="autoplay_rate" name="autoplay_rate"><label for="autoplay_rate">Autoplay Rate</label></p>
                            <p><input type="color" id="color_selected" name="color_selected"><label for="color_selected">Outline Color</label></p>
                            <p><input type="number" min="10" max="2000" step="10" id="min_freq" name="min_freq"><label for="min_freq">Min Frequency (Hz)</label></p>
                            <p><input type="number" min="20" max="2010" step="10" id="max_freq" name="max_freq"><label for="max_freq">Max Frequency (Hz)</label></p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" id="save_and_close_menu">Save and close</button>
                        <button type="button" id="close_menu">Close</button>
                    </div>
                </div>
            </div>
        </div>
        <div id="modal_backdrop" class="modal-backdrop hidden"></div>
        `;

    CreateMenu() {
        document.querySelector('body').insertAdjacentHTML('beforeend', this.menuHtml);
    }

    Toggle(onoff) {
        if (typeof (onoff) == 'undefined') {
            if (document.getElementById('menu').classList.contains('hidden')) {
                onoff = true;
            } else {
                onoff = false;
            }
        }
        if (onoff) { // open
            this.PopulateData();
            document.getElementById('menu').classList.remove('hidden');
            document.getElementById('modal_backdrop').classList.remove('hidden');
            document.querySelector('#menu .close').focus();
        } else { // close
            document.getElementById('menu').classList.add('hidden');
            document.getElementById('modal_backdrop').classList.add('hidden');
            constants.nonMenuFocus.focus();
            console.log('nonMenuFocus', constants.nonMenuFocus);
            console.log('active focus', document.activeElement);

        }
    }

    PopulateData() {
        document.getElementById('vol').value = constants.vol;
        //document.getElementById('show_rect').checked = constants.showRect;
        document.getElementById('autoplay_rate').value = constants.autoPlayRate;
        document.getElementById('braille_display_length').value = constants.brailleDisplayLength;
        document.getElementById('color_selected').value = constants.colorSelected;
        document.getElementById('min_freq').value = constants.MIN_FREQUENCY;
        document.getElementById('max_freq').value = constants.MAX_FREQUENCY;
    }

    SaveData() {
        constants.vol = document.getElementById('vol').value;
        //constants.showRect = document.getElementById('show_rect').checked;
        constants.autoPlayRate = document.getElementById('autoplay_rate').value;
        constants.brailleDisplayLength = document.getElementById('braille_display_length').value;
        constants.colorSelected = document.getElementById('color_selected').value;
        constants.MIN_FREQUENCY = document.getElementById('min_freq').value;
        constants.MAX_FREQUENCY = document.getElementById('max_freq').value;
    }
}

class Position {
    constructor(x, y, z = -1) {
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

class Tracker {

    constructor() {
        this.data = {};
        this.data.userAgent = Object.assign(navigator.userAgent);
        this.data.language = Object.assign(navigator.language);
        this.data.platform = Object.assign(navigator.platform);
        this.data.events = [];
    }

    Save() {
        let link = document.createElement("a");
        let fileStr = new Blob([JSON.stringify(this.data)], { type: "text/plain" });
        link.href = URL.createObjectURL(fileStr);
        link.download = "tracking.json";
        link.click();
    }

    LogEvent(e) {
        let eventToLog = {};

        // computer stuff
        eventToLog.timestamp = Object.assign(e.timeStamp);
        eventToLog.time = Date().toString();
        eventToLog.key = Object.assign(e.key);
        eventToLog.which = Object.assign(e.which);
        eventToLog.altKey = Object.assign(e.altKey);
        eventToLog.ctrlKey = Object.assign(e.ctrlKey);
        eventToLog.shiftKey = Object.assign(e.shiftKey);
        eventToLog.focus = Object.assign(e.path[0].tagName);

        // settings etc, which we have to reassign otherwise they'll all be the same val
        if (!(constants.position === undefined || constants.position === null)) {
            eventToLog.position = Object.assign(constants.position);
        }
        if (!(constants.minX === undefined || constants.minX === null)) {
            eventToLog.minX = Object.assign(constants.minX);
        }
        if (!(constants.maxX === undefined || constants.maxX === null)) {
            eventToLog.maxX = Object.assign(constants.maxX);
        }
        if (!(constants.minY === undefined || constants.minY === null)) {
            eventToLog.minY = Object.assign(constants.minY);
        }
        if (!(constants.chartType === undefined || constants.chartType === null)) {
            eventToLog.chartType = Object.assign(constants.chartType);
        }
        if (!(constants.MAX_FREQUENCY === undefined || constants.MAX_FREQUENCY === null)) {
            eventToLog.MAX_FREQUENCY = Object.assign(constants.MAX_FREQUENCY);
        }
        if (!(constants.MIN_FREQUENCY === undefined || constants.MIN_FREQUENCY === null)) {
            eventToLog.MIN_FREQUENCY = Object.assign(constants.MIN_FREQUENCY);
        }
        if (!(constants.NULL_FREQUENCY === undefined || constants.NULL_FREQUENCY === null)) {
            eventToLog.NULL_FREQUENCY = Object.assign(constants.NULL_FREQUENCY);
        }
        if (!(constants.MAX_SPEED === undefined || constants.MAX_SPEED === null)) {
            eventToLog.MAX_SPEED = Object.assign(constants.MAX_SPEED);
        }
        if (!(constants.MIN_SPEED === undefined || constants.MIN_SPEED === null)) {
            eventToLog.MIN_SPEED = Object.assign(constants.MIN_SPEED);
        }
        if (!(constants.INTERVAL === undefined || constants.INTERVAL === null)) {
            eventToLog.INTERVAL = Object.assign(constants.INTERVAL);
        }
        if (!(constants.vol === undefined || constants.vol === null)) {
            eventToLog.volume = Object.assign(constants.vol);
        }
        if (!(constants.autoPlayRate === undefined || constants.autoPlayRate === null)) {
            eventToLog.autoPlayRate = Object.assign(constants.autoPlayRate);
        }
        if (!(constants.colorSelected === undefined || constants.colorSelected === null)) {
            eventToLog.color = Object.assign(constants.colorSelected);
        }
        if (!(constants.brailleDisplayLength === undefined || constants.brailleDisplayLength === null)) {
            eventToLog.brailleDisplayLength = Object.assign(constants.brailleDisplayLength);
        }
        if (!(constants.duration === undefined || constants.duration === null)) {
            eventToLog.toneDuration = Object.assign(constants.duration);
        }
        if (!(constants.autoPlayOutlierRate === undefined || constants.autoPlayOutlierRate === null)) {
            eventToLog.autoPlayOutlierRate = Object.assign(constants.autoPlayOutlierRate);
        }
        if (!(constants.autoPlayPointsRate === undefined || constants.autoPlayPointsRate === null)) {
            eventToLog.autoPlayPointsRate = Object.assign(constants.autoPlayPointsRate);
        }
        if (!(constants.textMode === undefined || constants.textMode === null)) {
            eventToLog.textMode = Object.assign(constants.textMode);
        }
        if (!(constants.audioPlay === undefined || constants.audioPlay === null)) {
            eventToLog.sonificationMode = Object.assign(constants.audioPlay);
        }
        if (!(constants.layer === undefined || constants.layer === null)) {
            eventToLog.scatterplotLayer = Object.assign(constants.layer);
        }

        this.data.events.push(eventToLog);

    }
}

// events and init functions
document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // create global vars
    // todo: add the rest
    window.constants = new Constants();
    window.resources = new Resources();
    window.menu = new Menu();
    window.tracker = new Tracker();

    // default page load focus on svg 
    // this is mostly for debugging, as first time load users must click or hit a key to focus
    // todo for publish: probably start users at a help / menu section, and they can tab to svg
    setTimeout(function () { constants.svg.focus(); }, 100); // it needs just a tick after DOMContentLoaded

    constants.svg_container.addEventListener("keydown", function (e) {
        // Menu open
        if (e.which == 77 || e.which == 72) { // M(77) for menu, or H(72) for help? I don't like it
            menu.Toggle();
        }
    });

    // menu close
    let allClose = document.querySelectorAll('#close_menu, #menu .close');
    for (let i = 0; i < allClose.length; i++) {
        allClose[i].addEventListener("click", function (e) {
            menu.Toggle(false);
        });
    }
    document.getElementById('save_and_close_menu').addEventListener("click", function (e) {
        menu.SaveData();
        menu.Toggle(false);
    });

    // save user focus so we can return after menu close
    let allFocus = document.querySelectorAll('#' + constants.svg_container_id + ' > svg, #' + constants.braille_input_id);
    for (let i = 0; i < allFocus.length; i++) {
        allFocus[i].addEventListener('focus', function (e) {
            constants.nonMenuFocus = allFocus[i];
        });
    }

    // Global events
    document.addEventListener('keydown', function (e) {

        // Tracker
        if (e.which == 121) {
            tracker.Save();
        } else {
            tracker.LogEvent(e);
        }

        // Kill autoplay
        if (constants.isMac ? (e.which == 91 || e.which == 93) : e.which == 17) { // ctrl (either one)
            constants.KillAutoplay();
        }
    });

});
