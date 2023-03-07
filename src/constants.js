
// todo list: 
// save user data in cookies

class Constants {

    // element ids
    svg_container_id = "svg-container";
    braille_container_id = "braille-div";
    braille_input_id = "braille-input";
    info_id = "info";
    announcement_container_id = "announcements";
    end_chime_id = "end_chime";
    container_id = "container"
    project_id = "maidr";

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
        this.endChime = document.getElementById(this.end_chime_id);
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
    MAX_VOL = 30;
    autoPlayRate = 250; // ms per tone
    colorSelected = "#03C809";
    brailleDisplayLength = 18; // num characters in user's braille display. JooYoung says everyone has at least 18

    // advanced user settings
    showRect = 1;  // true / false
    duration = .2;
    autoPlayOutlierRate = 30; // ms per tone
    autoPlayPointsRate = 30;
    colorUnselected = "#595959"; // we don't use this yet, but remember: don't rely on color! also do a shape or pattern fill
    isTracking = 1; // 0 / 1, is tracking on or off

    // user controls (not exposed to menu, with shortcuts usually)
    showDisplay = 1; // true / false
    showDisplayInBraille = 1; // true / false
    showDisplayInAutoplay = 0; // true / false
    textMode = "off"; // off / terse / verbose
    brailleMode = "off"; // on / off
    sonifMode = "off"; // sep / same / off
    audioPlay = 0; // 0/1 for most plots, also 2,3 for boxplot
    layer = 0; // 0 = points; 1 = best fit line => for scatterplot

    // platform controls
    isMac = navigator.userAgent.toLowerCase().includes("mac"); // true if macOS
    control = this.isMac ? 'Cmd' : 'Ctrl';
    alt = this.isMac ? 'option' : 'Alt';
    home = this.isMac ? 'fn + Left arrow' : 'Home';
    end = this.isMac ? 'fn + Right arrow' : 'End';

    // debug stuff
    debugLevel = 3; // 0 = no console output, 1 = some console, 2 = more console, etc
    canPlayEndChime = false; // 
    manualData = true; // pull from manual data like chart2music (true), or do the old method where we pull from the svg (false)

    PrepHtml() {
        // init html stuff. aria live regions, braille input, etc

        // info aria live
        if (!document.getElementById(this.info_id)) {
            if ( document.getElementById(this.svg_container_id) ) {
                document.getElementById(this.svg_container_id).insertAdjacentHTML('afterend', '<br>\n<div id="info" aria-live="assertive" aria-atomic="true">\n<p id="x"></p>\n<p id="y"></p>\n</div>\n');
            }
        }

        // announcements aria live
        if (!document.getElementById(this.announcement_container_id)) {
            if ( document.getElementById(this.info_id) ) {
                document.getElementById(this.info_id).insertAdjacentHTML('afterend', '<div id="announcements" aria-live="assertive" aria-atomic="true">\n</div>\n');
            }
        }

        // braille
        if (!document.getElementById(this.braille_container_id)) {
            if ( document.getElementById(this.container_id) ) {
            document.getElementById(this.container_id).insertAdjacentHTML('afterbegin', '<div id="braille-div">\n<input id="braille-input" class="braille-input hidden" type="text" />\n</div>\n');
            }
        }

        // role app on svg
        if (document.getElementById(this.svg_container_id)) {
            document.querySelector('#' + this.svg_container_id + ' > svg').setAttribute('role', 'application');
            document.querySelector('#' + this.svg_container_id + ' > svg').setAttribute('tabindex', '0');
        }

        // end chime audio element
        if ( ! document.getElementById(this.end_chime_id) ) {
            if ( document.getElementById(this.info_id) ) {
                document.getElementById(this.info_id).insertAdjacentHTML('afterend', ' <div class="hidden"> <audio src="../src/terminalBell.mp3" id="end_chime"></audio> </div>');
            }
        }
    }

    KillAutoplay() {
        if (this.autoplayId) {
            clearInterval(this.autoplayId);
            this.autoplayId = null;
        }
    }

    KillSepPlay() {
        if (this.sepPlayId) {
            clearInterval(this.sepPlayId);
            this.sepPlayId = null;
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
                "min": "Minimum",
                "max": "Maximum",
                "25": "25%",
                "50": "50%",
                "75": "75%",
                "son_on": "Sonification on",
                "son_off": "Sonification off",
                "son_des": "Sonification descrete",
                "son_comp": "Sonification compare",
                "son_ch": "Sonification chord",
                "son_sep": "Sonification separate",
                "son_same": "Sonification combined",
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
                                        <td>Select the first element</td>
                                        <td>${constants.control} + ${constants.home}</td>
                                    </tr>
                                    <tr>
                                        <td>Select the last element</td>
                                        <td>${constants.control} + ${constants.end}</td>
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
                                        <td>Auto-play outward in direction of arrow</td>
                                        <td>${constants.control} + Shift + Arrow key</td>
                                    </tr>
                                    <tr>
                                        <td>Auto-play inward in direction of arrow</td>
                                        <td>${constants.alt} + Shift + Arrow key</td>
                                    </tr>
                                    <tr>
                                        <td>Stop Auto-play</td>
                                        <td>${constants.control}</td>
                                    </tr>
                                    <tr>
                                        <td>Auto-play speed up</td>
                                        <td>.</td>
                                    </tr>
                                    <tr>
                                        <td>Auto-play speed down</td>
                                        <td>,</td>
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
        this.DataSetup();
    }

    DataSetup() {

        let prevData = this.GetTrackerData();
        if ( prevData ) {
            // good to go already, do nothing
        } else {
            let data = {};
            data.userAgent = Object.assign(navigator.userAgent);
            data.language = Object.assign(navigator.language);
            data.platform = Object.assign(navigator.platform);
            data.events = [];

            this.SaveTrackerData(data);
        }
    }

    DownloadTrackerData() {
        let link = document.createElement("a");
        let data = this.GetTrackerData();
        let fileStr = new Blob([JSON.stringify(data)], { type: "text/plain" });
        link.href = URL.createObjectURL(fileStr);
        link.download = "tracking.json";
        link.click();
    }

    SaveTrackerData(data) {
        localStorage.setItem(constants.project_id, JSON.stringify(data));
    }

    GetTrackerData() {
        let data = JSON.parse(localStorage.getItem(constants.project_id));
        return data;
    }

    Delete() {
        localStorage.removeItem(constants.project_id);
        this.data = null;

        this.DataSetup();
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
        if ( e.path ) {
            eventToLog.focus = Object.assign(e.path[0].tagName);
        }

        // settings etc, which we have to reassign otherwise they'll all be the same val
        if (! this.isUndefinedOrNull(constants.position)) {
            eventToLog.position = Object.assign(constants.position);
        }
        if (! this.isUndefinedOrNull(constants.minX)) {
            eventToLog.minX = Object.assign(constants.minX);
        }
        if (! this.isUndefinedOrNull(constants.maxX)) {
            eventToLog.maxX = Object.assign(constants.maxX);
        }
        if (! this.isUndefinedOrNull(constants.minY)) {
            eventToLog.minY = Object.assign(constants.minY);
        }
        if (! this.isUndefinedOrNull(constants.MAX_FREQUENCY)) {
            eventToLog.MAX_FREQUENCY = Object.assign(constants.MAX_FREQUENCY);
        }
        if (! this.isUndefinedOrNull(constants.MIN_FREQUENCY)) {
            eventToLog.MIN_FREQUENCY = Object.assign(constants.MIN_FREQUENCY);
        }
        if (! this.isUndefinedOrNull(constants.NULL_FREQUENCY)) {
            eventToLog.NULL_FREQUENCY = Object.assign(constants.NULL_FREQUENCY);
        }
        if (! this.isUndefinedOrNull(constants.MAX_SPEED)) {
            eventToLog.MAX_SPEED = Object.assign(constants.MAX_SPEED);
        }
        if (! this.isUndefinedOrNull(constants.MIN_SPEED)) {
            eventToLog.MIN_SPEED = Object.assign(constants.MIN_SPEED);
        }
        if (! this.isUndefinedOrNull(constants.INTERVAL)) {
            eventToLog.INTERVAL = Object.assign(constants.INTERVAL);
        }
        if (! this.isUndefinedOrNull(constants.vol)) {
            eventToLog.volume = Object.assign(constants.vol);
        }
        if (! this.isUndefinedOrNull(constants.autoPlayRate)) {
            eventToLog.autoPlayRate = Object.assign(constants.autoPlayRate);
        }
        if (! this.isUndefinedOrNull(constants.colorSelected)) {
            eventToLog.color = Object.assign(constants.colorSelected);
        }
        if (! this.isUndefinedOrNull(constants.brailleDisplayLength)) {
            eventToLog.brailleDisplayLength = Object.assign(constants.brailleDisplayLength);
        }
        if (! this.isUndefinedOrNull(constants.duration)) {
            eventToLog.toneDuration = Object.assign(constants.duration);
        }
        if (! this.isUndefinedOrNull(constants.autoPlayOutlierRate)) {
            eventToLog.autoPlayOutlierRate = Object.assign(constants.autoPlayOutlierRate);
        }
        if (! this.isUndefinedOrNull(constants.autoPlayPointsRate)) {
            eventToLog.autoPlayPointsRate = Object.assign(constants.autoPlayPointsRate);
        }
        if (! this.isUndefinedOrNull(constants.textMode)) {
            eventToLog.textMode = Object.assign(constants.textMode);
        }
        if (! this.isUndefinedOrNull(constants.audioPlay)) {
            eventToLog.sonificationMode = Object.assign(constants.audioPlay);
        }
        if (! this.isUndefinedOrNull(constants.layer)) {
            eventToLog.scatterplotLayer = Object.assign(constants.layer);
        }
        if (! this.isUndefinedOrNull(constants.chartType)) {
            eventToLog.chartType = Object.assign(constants.chartType);
        }
        if (! this.isUndefinedOrNull(constants.infoDiv.innerHTML)) {
            eventToLog.textDisplay = Object.assign(constants.infoDiv.innerHTML);
        }
        if (! this.isUndefinedOrNull(location.href)) {
            eventToLog.location = Object.assign(location.href);
        }

        // chart specific values
        if ( constants.chartType == "barchart" ) {
            if (! this.isUndefinedOrNull(plot.plotColumns[position.x])) {
                eventToLog.chart_label = Object.assign(plot.plotColumns[position.x]);
            }
            if (! this.isUndefinedOrNull(plot.plotLegend.y)) {
                eventToLog.chart_legend_y = Object.assign(plot.plotLegend.y);
            }
            if (! this.isUndefinedOrNull(plot.plotLegend.x)) {
                eventToLog.chart_legend_x = Object.assign(plot.plotLegend.x);
            }
        } else if ( constants.chartType == "heatmap" ) {
            if (! this.isUndefinedOrNull(plot.x_labels[position.x].trim())) {
                eventToLog.chart_label_x = Object.assign(plot.x_labels[position.x].trim());
            }
            if (! this.isUndefinedOrNull(plot.y_labels[position.y].trim())) {
                eventToLog.chart_label_y = Object.assign(plot.y_labels[position.y].trim());
            }
        } else if ( constants.chartType == "boxplot" ) {
            let xy = orientation == "vert" ? position.x : position.y;
            let yx = orientation == "vert" ? position.y : position.x;
            if (! this.isUndefinedOrNull(plot.x_labels[xy])) {
                eventToLog.chart_label_x = Object.assign(plot.x_labels[xy]);
            }
            if ( position ) {
                if ( position.x > -1 && position.y > -1 ) {
                    if (! this.isUndefinedOrNull(plot.plotData[xy][yx].label)) {
                        eventToLog.chart_section = Object.assign(plot.plotData[xy][yx].label);
                    }
                }
            }
        } else if ( constants.chartType == "scatterplot" ) {
            if (! this.isUndefinedOrNull(plot.groupLabels[0])) {
                eventToLog.chart_label_x = Object.assign(plot.groupLabels[0]);
            }
            if (! this.isUndefinedOrNull(plot.groupLabels[1])) {
                eventToLog.chart_label_y = Object.assign(plot.groupLabels[1]);
            }
        }

        //this.data.events.push(eventToLog);
        let data = this.GetTrackerData();
        data.events.push(eventToLog);
        this.SaveTrackerData(data);
    }

    isUndefinedOrNull(item) {
        return ( item === undefined || item === null ) ;
    }

}

// events and init functions
document.addEventListener('DOMContentLoaded', function (e) { // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

    // create global vars
    window.constants = new Constants();
    window.resources = new Resources();
    window.menu = new Menu();
    window.tracker = new Tracker();

    // run events and functions only on user study page
    if ( document.getElementById('download_data_trigger') ) {
        document.getElementById('download_data_trigger').addEventListener('click', function(e) {
            tracker.DownloadTrackerData();
        });
    }

    // run events only on pages with a chart (svg)
    if ( document.getElementById(constants.svg_container_id) ) {
        // default page load focus on svg 
        // this is mostly for debugging, as first time load users must click or hit a key to focus
        // todo for publish: probably start users at a help / menu section, and they can tab to svg
        if ( constants.debugLevel > -1 ) {
            setTimeout(function () { constants.svg.focus(); }, 100); // it needs just a tick after DOMContentLoaded
        }

        if ( constants.svg_container ) {
            constants.svg_container.addEventListener("keydown", function (e) {
                // Menu open
                if (e.which == 72) { // M(77) for menu, or H(72) for help? I don't like it
                    menu.Toggle(true);
                }
            });
        }

        if ( constants.brailleInput ) {
            constants.brailleInput.addEventListener("keydown", function (e) {
                if (e.which == 72) {
                    e.preventDefault();
                    menu.Toggle(true);
                }
            });
        }

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
        document.getElementById('menu').addEventListener("keydown", function (e) {
            if (e.which == 27) { // esc
                menu.Toggle(false);
                // svg.focus(); // commented this out because menu might be toggled in brailleInput too
            }
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
            if ( constants.isTracking ) {
                if (e.which == 121) {
                    //tracker.DownloadTrackerData();
                } else {
                    if ( plot ) {
                        tracker.LogEvent(e);
                    }
                }
            }

            // reset tracking with Ctrl + F5 / command + F5
            // future todo: this should probably be a button with a confirmation. This is dangerous
            if ( e.which == 116 && ( constants.isMac ? e.metaKey : e.ctrlKey ) ) {
                e.preventDefault();
                tracker.Delete();
                location.reload(true);
            }


            // Kill autoplay
            if (constants.isMac ? (e.which == 91 || e.which == 93) : e.which == 17) { // ctrl (either one)
                constants.KillAutoplay();
            }
        });
    }

});
