/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 225:
/***/ (() => {

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
// todo list: 
// save user data in cookies
var Constants = /*#__PURE__*/function () {
  // default constructor for boxplot
  function Constants() {
    _classCallCheck(this, Constants);
    // element ids
    _defineProperty(this, "svg_container_id", "svg-container");
    _defineProperty(this, "braille_container_id", "braille-div");
    _defineProperty(this, "braille_input_id", "braille-input");
    _defineProperty(this, "info_id", "info");
    _defineProperty(this, "announcement_container_id", "announcements");
    _defineProperty(this, "end_chime_id", "end_chime");
    _defineProperty(this, "container_id", "container");
    _defineProperty(this, "project_id", "maidr");
    _defineProperty(this, "review_id_container", "review_container");
    _defineProperty(this, "review_id", "review");
    _defineProperty(this, "reviewSaveSpot", void 0);
    _defineProperty(this, "reviewSaveBrailleMode", void 0);
    // basic chart properties
    _defineProperty(this, "minX", 0);
    _defineProperty(this, "maxX", 0);
    _defineProperty(this, "minY", 0);
    _defineProperty(this, "maxY", 0);
    _defineProperty(this, "plotId", '');
    // update with id in chart specific js
    _defineProperty(this, "chartType", "");
    // set as 'boxplot' or whatever later in chart specific js file
    _defineProperty(this, "navigation", 1);
    // 0 = row navigation (up/down), 1 = col navigation (left/right)
    // basic audio properties
    _defineProperty(this, "MAX_FREQUENCY", 1000);
    _defineProperty(this, "MIN_FREQUENCY", 200);
    _defineProperty(this, "NULL_FREQUENCY", 100);
    // autoplay speed
    _defineProperty(this, "MAX_SPEED", 2000);
    _defineProperty(this, "MIN_SPEED", 50);
    _defineProperty(this, "INTERVAL", 50);
    // user settings
    _defineProperty(this, "vol", .5);
    _defineProperty(this, "MAX_VOL", 30);
    _defineProperty(this, "autoPlayRate", 250);
    // ms per tone
    _defineProperty(this, "colorSelected", "#03C809");
    _defineProperty(this, "brailleDisplayLength", 40);
    // num characters in user's braille display. Common length for desktop / mobile applications
    // advanced user settings
    _defineProperty(this, "showRect", 1);
    // true / false
    _defineProperty(this, "hasRect", 1);
    // true / false
    _defineProperty(this, "duration", .3);
    _defineProperty(this, "outlierDuration", .06);
    _defineProperty(this, "autoPlayOutlierRate", 50);
    // ms per tone
    _defineProperty(this, "autoPlayPointsRate", 30);
    _defineProperty(this, "colorUnselected", "#595959");
    // we don't use this yet, but remember: don't rely on color! also do a shape or pattern fill
    _defineProperty(this, "isTracking", 1);
    // 0 / 1, is tracking on or off
    _defineProperty(this, "visualBraille", false);
    // do we want to represent braille based on what's visually there or actually there. Like if we have 2 outliers with the same position, do we show 1 (visualBraille true) or 2 (false)
    // user controls (not exposed to menu, with shortcuts usually)
    _defineProperty(this, "showDisplay", 1);
    // true / false
    _defineProperty(this, "showDisplayInBraille", 1);
    // true / false
    _defineProperty(this, "showDisplayInAutoplay", 0);
    // true / false
    _defineProperty(this, "textMode", "off");
    // off / terse / verbose
    _defineProperty(this, "brailleMode", "off");
    // on / off
    _defineProperty(this, "sonifMode", "off");
    // sep / same / off
    _defineProperty(this, "reviewMode", "off");
    // on / off
    _defineProperty(this, "layer", 1);
    // 1 = points; 2 = best fit line => for scatterplot
    _defineProperty(this, "outlierInterval", null);
    // platform controls
    _defineProperty(this, "isMac", navigator.userAgent.toLowerCase().includes("mac"));
    // true if macOS
    _defineProperty(this, "control", this.isMac ? 'Cmd' : 'Ctrl');
    _defineProperty(this, "alt", this.isMac ? 'option' : 'Alt');
    _defineProperty(this, "home", this.isMac ? 'fn + Left arrow' : 'Home');
    _defineProperty(this, "end", this.isMac ? 'fn + Right arrow' : 'End');
    _defineProperty(this, "keypressInterval", 2000);
    // ms or 2s
    // debug stuff
    _defineProperty(this, "debugLevel", 3);
    // 0 = no console output, 1 = some console, 2 = more console, etc
    _defineProperty(this, "canPlayEndChime", false);
    // 
    _defineProperty(this, "manualData", true);
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
  _createClass(Constants, [{
    key: "PrepChartHelperComponents",
    value:
    // pull from manual data like chart2music (true), or do the old method where we pull from the svg (false)

    function PrepChartHelperComponents() {
      // init html stuff. aria live regions, braille input, etc

      // info aria live
      if (!document.getElementById(this.info_id)) {
        if (document.getElementById(this.svg_container_id)) {
          document.getElementById(this.svg_container_id).insertAdjacentHTML('afterend', '<br>\n<div id="info" aria-live="assertive" aria-atomic="true">\n<p id="x"></p>\n<p id="y"></p>\n</div>\n');
        }
      }

      // announcements aria live
      if (!document.getElementById(this.announcement_container_id)) {
        if (document.getElementById(this.info_id)) {
          document.getElementById(this.info_id).insertAdjacentHTML('afterend', '<div id="announcements" aria-live="assertive" aria-atomic="true">\n</div>\n');
        }
      }

      // braille
      if (!document.getElementById(this.braille_container_id)) {
        if (document.getElementById(this.container_id)) {
          document.getElementById(this.container_id).insertAdjacentHTML('afterbegin', '<div id="braille-div">\n<input id="braille-input" class="braille-input hidden" type="text" />\n</div>\n');
        }
      }

      // role app on svg
      if (document.getElementById(this.svg_container_id)) {
        document.querySelector('#' + this.svg_container_id + ' > svg').setAttribute('role', 'application');
        document.querySelector('#' + this.svg_container_id + ' > svg').setAttribute('tabindex', '0');
      }

      // end chime audio element
      if (!document.getElementById(this.end_chime_id)) {
        if (document.getElementById(this.info_id)) {
          document.getElementById(this.info_id).insertAdjacentHTML('afterend', '<div class="hidden"> <audio src="../src/terminalBell.mp3" id="end_chime"></audio> </div>');
        }
      }
    }
  }, {
    key: "KillAutoplay",
    value: function KillAutoplay() {
      if (this.autoplayId) {
        clearInterval(this.autoplayId);
        this.autoplayId = null;
      }
    }
  }, {
    key: "KillSepPlay",
    value: function KillSepPlay() {
      if (this.sepPlayId) {
        clearInterval(this.sepPlayId);
        this.sepPlayId = null;
      }
    }
  }, {
    key: "SpeedUp",
    value: function SpeedUp() {
      if (constants.autoPlayRate - this.INTERVAL > this.MIN_SPEED) {
        constants.autoPlayRate -= this.INTERVAL;
      }
    }
  }, {
    key: "SpeedDown",
    value: function SpeedDown() {
      if (constants.autoPlayRate + this.INTERVAL <= this.MAX_SPEED) {
        constants.autoPlayRate += this.INTERVAL;
      }
    }
  }]);
  return Constants;
}();
var Resources = /*#__PURE__*/function () {
  function Resources() {
    _classCallCheck(this, Resources);
    _defineProperty(this, "language", "en");
    // 2 char lang code
    _defineProperty(this, "knowledgeLevel", "basic");
    // basic, intermediate, expert
    // these strings run on getters, which pull in language, knowledgeLevel, chart, and actual requested string
    _defineProperty(this, "strings", {
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
    });
  }
  _createClass(Resources, [{
    key: "GetString",
    value: function GetString(id) {
      return this.strings[this.language][this.knowledgeLevel][id];
    }
  }]);
  return Resources;
}();
var Menu = /*#__PURE__*/function () {
  function Menu() {
    _classCallCheck(this, Menu);
    _defineProperty(this, "menuHtml", "\n        <div id=\"menu\" class=\"modal hidden\" role=\"dialog\" tabindex=\"-1\">\n            <div class=\"modal-dialog\" role=\"document\" tabindex=\"0\">\n                <div class=\"modal-content\">\n                    <div class=\"modal-header\">\n                        <h4 class=\"modal-title\">Menu</h4>\n                        <button type=\"button\" class=\"close\" data-dismiss=\"modal\" aria-label=\"Close\">\n                            <span aria-hidden=\"true\">&times;</span>\n                        </button>\n                    </div>\n                    <div class=\"modal-body\">\n                        <div>\n                            <h5 class=\"modal-title\">Keyboard Shortcuts</h5>\n                            <table>\n                                <caption class=\"sr-only\">Keyboard Shortcuts</caption>\n                                <thead>\n                                    <tr>\n                                        <th scope=\"col\">Function</th>\n                                        <th scope=\"col\">Key</th>\n                                    </tr>\n                                </thead>\n                                <tbody>\n                                    <tr>\n                                        <td>Move around plot</td>\n                                        <td>Arrow keys</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Go to the very left right up down</td>\n                                        <td>".concat(constants.control, " + Arrow key</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Select the first element</td>\n                                        <td>").concat(constants.control, " + ").concat(constants.home, "</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Select the last element</td>\n                                        <td>").concat(constants.control, " + ").concat(constants.end, "</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Toggle Braille Mode</td>\n                                        <td>b</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Toggle Sonification Mode</td>\n                                        <td>s</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Toggle Text Mode</td>\n                                        <td>t</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Repeat current sound</td>\n                                        <td>Space</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Auto-play outward in direction of arrow</td>\n                                        <td>").concat(constants.control, " + Shift + Arrow key</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Auto-play inward in direction of arrow</td>\n                                        <td>").concat(constants.alt, " + Shift + Arrow key</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Stop Auto-play</td>\n                                        <td>").concat(constants.control, "</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Auto-play speed up</td>\n                                        <td>Period</td>\n                                    </tr>\n                                    <tr>\n                                        <td>Auto-play speed down</td>\n                                        <td>Comma</td>\n                                    </tr>\n                                </tbody>\n                            </table>\n                        </div>\n\n                        <div>\n                            <h5 class=\"modal-title\">Settings</h5>\n                            <p><input type=\"range\" id=\"vol\" name=\"vol\" min=\"0\" max=\"1\" step=\".05\"><label for=\"vol\">Volume</label></p>\n                            <!-- <p><input type=\"checkbox\" id=\"show_rect\" name=\"show_rect\"><label for=\"show_rect\">Show Outline</label></p> //-->\n                            <p><input type=\"number\" min=\"4\" max=\"2000\" step=\"1\" id=\"braille_display_length\" name=\"braille_display_length\"><label for=\"braille_display_length\">Braille Display Size</label></p>\n                            <p><input type=\"number\" min=\"50\" max=\"2000\" step=\"50\" id=\"autoplay_rate\" name=\"autoplay_rate\"><label for=\"autoplay_rate\">Autoplay Rate</label></p>\n                            <p><input type=\"color\" id=\"color_selected\" name=\"color_selected\"><label for=\"color_selected\">Outline Color</label></p>\n                            <p><input type=\"number\" min=\"10\" max=\"2000\" step=\"10\" id=\"min_freq\" name=\"min_freq\"><label for=\"min_freq\">Min Frequency (Hz)</label></p>\n                            <p><input type=\"number\" min=\"20\" max=\"2010\" step=\"10\" id=\"max_freq\" name=\"max_freq\"><label for=\"max_freq\">Max Frequency (Hz)</label></p>\n                            <p><input type=\"number\" min=\"500\" max=\"5000\" step=\"500\" id=\"keypress_interval\" name=\"keypress_interval\"><label for=\"keypress_interval\">Keypress Interval (ms)</label></p>\n                        </div>\n                    </div>\n                    <div class=\"modal-footer\">\n                        <button type=\"button\" id=\"save_and_close_menu\">Save and close</button>\n                        <button type=\"button\" id=\"close_menu\">Close</button>\n                    </div>\n                </div>\n            </div>\n        </div>\n        <div id=\"modal_backdrop\" class=\"modal-backdrop hidden\"></div>\n        "));
    this.CreateMenu();
    this.LoadDataFromLocalStorage();
  }
  _createClass(Menu, [{
    key: "CreateMenu",
    value: function CreateMenu() {
      document.querySelector('body').insertAdjacentHTML('beforeend', this.menuHtml);
    }
  }, {
    key: "Toggle",
    value: function Toggle(onoff) {
      if (typeof onoff == 'undefined') {
        if (document.getElementById('menu').classList.contains('hidden')) {
          onoff = true;
        } else {
          onoff = false;
        }
      }
      if (onoff) {
        // open
        this.PopulateData();
        document.getElementById('menu').classList.remove('hidden');
        document.getElementById('modal_backdrop').classList.remove('hidden');
        document.querySelector('#menu .close').focus();
      } else {
        // close
        document.getElementById('menu').classList.add('hidden');
        document.getElementById('modal_backdrop').classList.add('hidden');
        constants.nonMenuFocus.focus();
      }
    }
  }, {
    key: "PopulateData",
    value: function PopulateData() {
      document.getElementById('vol').value = constants.vol;
      //document.getElementById('show_rect').checked = constants.showRect;
      document.getElementById('autoplay_rate').value = constants.autoPlayRate;
      document.getElementById('braille_display_length').value = constants.brailleDisplayLength;
      document.getElementById('color_selected').value = constants.colorSelected;
      document.getElementById('min_freq').value = constants.MIN_FREQUENCY;
      document.getElementById('max_freq').value = constants.MAX_FREQUENCY;
      document.getElementById('keypress_interval').value = constants.keypressInterval;
    }
  }, {
    key: "SaveData",
    value: function SaveData() {
      constants.vol = document.getElementById('vol').value;
      //constants.showRect = document.getElementById('show_rect').checked;
      constants.autoPlayRate = document.getElementById('autoplay_rate').value;
      constants.brailleDisplayLength = document.getElementById('braille_display_length').value;
      constants.colorSelected = document.getElementById('color_selected').value;
      constants.MIN_FREQUENCY = document.getElementById('min_freq').value;
      constants.MAX_FREQUENCY = document.getElementById('max_freq').value;
      constants.keypressInterval = document.getElementById('keypress_interval').value;
    }
  }, {
    key: "SaveDataToLocalStorage",
    value: function SaveDataToLocalStorage() {
      // save all data in this.SaveData() to local storage
      var data = {};
      data.vol = constants.vol;
      //data.showRect = constants.showRect;
      data.autoPlayRate = constants.autoPlayRate;
      data.brailleDisplayLength = constants.brailleDisplayLength;
      data.colorSelected = constants.colorSelected;
      data.MIN_FREQUENCY = constants.MIN_FREQUENCY;
      data.MAX_FREQUENCY = constants.MAX_FREQUENCY;
      data.keypressInterval = constants.keypressInterval;
      localStorage.setItem('settings_data', JSON.stringify(data));
    }
  }, {
    key: "LoadDataFromLocalStorage",
    value: function LoadDataFromLocalStorage() {
      var data = JSON.parse(localStorage.getItem('settings_data'));
      if (data) {
        constants.vol = data.vol;
        //constants.showRect = data.showRect;
        constants.autoPlayRate = data.autoPlayRate;
        constants.brailleDisplayLength = data.brailleDisplayLength;
        constants.colorSelected = data.colorSelected;
        constants.MIN_FREQUENCY = data.MIN_FREQUENCY;
        constants.MAX_FREQUENCY = data.MAX_FREQUENCY;
        constants.keypressInterval = data.keypressInterval;
      }
    }
  }]);
  return Menu;
}();
var Position = /*#__PURE__*/(/* unused pure expression or super */ null && (_createClass(function Position(x, y) {
  var z = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : -1;
  _classCallCheck(this, Position);
  this.x = x;
  this.y = y;
  this.z = z; // rarely used
}))); // HELPER FUNCTIONS
var Helper = /*#__PURE__*/(/* unused pure expression or super */ null && (function () {
  function Helper() {
    _classCallCheck(this, Helper);
  }
  _createClass(Helper, null, [{
    key: "containsObject",
    value: function containsObject(obj, arr) {
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] === obj) return true;
      }
      return false;
    }
  }]);
  return Helper;
}()));
var Tracker = /*#__PURE__*/function () {
  function Tracker() {
    _classCallCheck(this, Tracker);
    this.DataSetup();
  }
  _createClass(Tracker, [{
    key: "DataSetup",
    value: function DataSetup() {
      var prevData = this.GetTrackerData();
      if (prevData) {
        // good to go already, do nothing
      } else {
        var data = {};
        data.userAgent = Object.assign(navigator.userAgent);
        data.vendor = Object.assign(navigator.vendor);
        data.language = Object.assign(navigator.language);
        data.platform = Object.assign(navigator.platform);
        data.events = [];
        this.SaveTrackerData(data);
      }
    }
  }, {
    key: "DownloadTrackerData",
    value: function DownloadTrackerData() {
      var link = document.createElement("a");
      var data = this.GetTrackerData();
      var fileStr = new Blob([JSON.stringify(data)], {
        type: "text/plain"
      });
      link.href = URL.createObjectURL(fileStr);
      link.download = "tracking.json";
      link.click();
    }
  }, {
    key: "SaveTrackerData",
    value: function SaveTrackerData(data) {
      localStorage.setItem(constants.project_id, JSON.stringify(data));
    }
  }, {
    key: "GetTrackerData",
    value: function GetTrackerData() {
      var data = JSON.parse(localStorage.getItem(constants.project_id));
      return data;
    }
  }, {
    key: "Delete",
    value: function Delete() {
      localStorage.removeItem(constants.project_id);
      this.data = null;
      if (constants.debugLevel > 0) {
        console.log("tracking data cleared");
      }
      this.DataSetup();
    }
  }, {
    key: "LogEvent",
    value: function LogEvent(e) {
      var eventToLog = {};

      // computer stuff
      eventToLog.timestamp = Object.assign(e.timeStamp);
      eventToLog.time = Date().toString();
      eventToLog.key = Object.assign(e.key);
      eventToLog.which = Object.assign(e.which);
      eventToLog.altKey = Object.assign(e.altKey);
      eventToLog.ctrlKey = Object.assign(e.ctrlKey);
      eventToLog.shiftKey = Object.assign(e.shiftKey);
      if (e.path) {
        eventToLog.focus = Object.assign(e.path[0].tagName);
      }

      // settings etc, which we have to reassign otherwise they'll all be the same val
      if (!this.isUndefinedOrNull(constants.position)) {
        eventToLog.position = Object.assign(constants.position);
      }
      if (!this.isUndefinedOrNull(constants.minX)) {
        eventToLog.min_x = Object.assign(constants.minX);
      }
      if (!this.isUndefinedOrNull(constants.maxX)) {
        eventToLog.max_x = Object.assign(constants.maxX);
      }
      if (!this.isUndefinedOrNull(constants.minY)) {
        eventToLog.min_y = Object.assign(constants.minY);
      }
      if (!this.isUndefinedOrNull(constants.MAX_FREQUENCY)) {
        eventToLog.max_frequency = Object.assign(constants.MAX_FREQUENCY);
      }
      if (!this.isUndefinedOrNull(constants.MIN_FREQUENCY)) {
        eventToLog.min_frequency = Object.assign(constants.MIN_FREQUENCY);
      }
      if (!this.isUndefinedOrNull(constants.NULL_FREQUENCY)) {
        eventToLog.null_frequency = Object.assign(constants.NULL_FREQUENCY);
      }
      if (!this.isUndefinedOrNull(constants.MAX_SPEED)) {
        eventToLog.max_speed = Object.assign(constants.MAX_SPEED);
      }
      if (!this.isUndefinedOrNull(constants.MIN_SPEED)) {
        eventToLog.min_speed = Object.assign(constants.MIN_SPEED);
      }
      if (!this.isUndefinedOrNull(constants.INTERVAL)) {
        eventToLog.interval = Object.assign(constants.INTERVAL);
      }
      if (!this.isUndefinedOrNull(constants.vol)) {
        eventToLog.volume = Object.assign(constants.vol);
      }
      if (!this.isUndefinedOrNull(constants.autoPlayRate)) {
        eventToLog.autoplay_rate = Object.assign(constants.autoPlayRate);
      }
      if (!this.isUndefinedOrNull(constants.colorSelected)) {
        eventToLog.color = Object.assign(constants.colorSelected);
      }
      if (!this.isUndefinedOrNull(constants.brailleDisplayLength)) {
        eventToLog.braille_display_length = Object.assign(constants.brailleDisplayLength);
      }
      if (!this.isUndefinedOrNull(constants.duration)) {
        eventToLog.tone_duration = Object.assign(constants.duration);
      }
      if (!this.isUndefinedOrNull(constants.autoPlayOutlierRate)) {
        eventToLog.autoplay_outlier_rate = Object.assign(constants.autoPlayOutlierRate);
      }
      if (!this.isUndefinedOrNull(constants.autoPlayPointsRate)) {
        eventToLog.autoplay_points_rate = Object.assign(constants.autoPlayPointsRate);
      }
      if (!this.isUndefinedOrNull(constants.textMode)) {
        eventToLog.text_mode = Object.assign(constants.textMode);
      }
      if (!this.isUndefinedOrNull(constants.sonifMode)) {
        eventToLog.sonification_mode = Object.assign(constants.sonifMode);
      }
      if (!this.isUndefinedOrNull(constants.brailleMode)) {
        eventToLog.braille_mode = Object.assign(constants.brailleMode);
      }
      if (!this.isUndefinedOrNull(constants.layer)) {
        eventToLog.layer = Object.assign(constants.layer);
      }
      if (!this.isUndefinedOrNull(constants.chartType)) {
        eventToLog.chart_type = Object.assign(constants.chartType);
      }
      if (!this.isUndefinedOrNull(constants.infoDiv.innerHTML)) {
        var textDisplay = Object.assign(constants.infoDiv.innerHTML);
        textDisplay = textDisplay.replaceAll(/<[^>]*>?/gm, '');
        eventToLog.text_display = textDisplay;
      }
      if (!this.isUndefinedOrNull(location.href)) {
        eventToLog.location = Object.assign(location.href);
      }

      // chart specific values
      var x_tickmark = "";
      var y_tickmark = "";
      var x_label = "";
      var y_label = "";
      var value = "";
      var fill_value = "";
      if (constants.chartType == "barplot") {
        if (!this.isUndefinedOrNull(plot.columnLabels[position.x])) {
          x_tickmark = plot.columnLabels[position.x];
        }
        if (!this.isUndefinedOrNull(plot.plotLegend.x)) {
          x_label = plot.plotLegend.x;
        }
        if (!this.isUndefinedOrNull(plot.plotLegend.y)) {
          y_label = plot.plotLegend.y;
        }
        if (!this.isUndefinedOrNull(plot.plotData[position.x])) {
          value = plot.plotData[position.x];
        }
      } else if (constants.chartType == "heatmap") {
        if (!this.isUndefinedOrNull(plot.x_labels[position.x])) {
          x_tickmark = plot.x_labels[position.x].trim();
        }
        if (!this.isUndefinedOrNull(plot.y_labels[position.y])) {
          y_tickmark = plot.y_labels[position.y].trim();
        }
        if (!this.isUndefinedOrNull(plot.x_group_label)) {
          x_label = plot.x_group_label;
        }
        if (!this.isUndefinedOrNull(plot.y_group_label)) {
          y_label = plot.y_group_label;
        }
        if (!this.isUndefinedOrNull(plot.values)) {
          if (!this.isUndefinedOrNull(plot.values[position.x][position.y])) {
            value = plot.values[position.x][position.y];
          }
        }
        if (!this.isUndefinedOrNull(plot.group_labels[2])) {
          fill_value = plot.group_labels[2];
        }
      } else if (constants.chartType == "boxplot") {
        var plotPos = constants.plotOrientation == "vert" ? position.x : position.y;
        var sectionPos = constants.plotOrientation == "vert" ? position.y : position.x;
        if (!this.isUndefinedOrNull(plot.x_group_label)) {
          x_label = plot.x_group_label;
        }
        if (!this.isUndefinedOrNull(plot.y_group_label)) {
          y_label = plot.y_group_label;
        }
        if (constants.plotOrientation == "vert") {
          if (plotPos > -1 && sectionPos > -1) {
            if (!this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].label)) {
              y_tickmark = plot.plotData[plotPos][sectionPos].label;
            }
            if (!this.isUndefinedOrNull(plot.x_labels[position.x])) {
              x_tickmark = plot.x_labels[position.x];
            }
            if (!this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].values)) {
              value = plot.plotData[plotPos][sectionPos].values;
            } else if (!this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].y)) {
              value = plot.plotData[plotPos][sectionPos].y;
            }
          }
        } else {
          if (plotPos > -1 && sectionPos > -1) {
            if (!this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].label)) {
              x_tickmark = plot.plotData[plotPos][sectionPos].label;
            }
            if (!this.isUndefinedOrNull(plot.y_labels[position.y])) {
              y_tickmark = plot.y_labels[position.y];
            }
            if (!this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].values)) {
              value = plot.plotData[plotPos][sectionPos].values;
            } else if (!this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].x)) {
              value = plot.plotData[plotPos][sectionPos].x;
            }
          }
        }
      } else if (constants.chartType == "scatterplot") {
        if (!this.isUndefinedOrNull(plot.x_group_label)) {
          x_label = plot.x_group_label;
        }
        if (!this.isUndefinedOrNull(plot.y_group_label)) {
          y_label = plot.y_group_label;
        }
        if (!this.isUndefinedOrNull(plot.x[position.x])) {
          x_tickmark = plot.x[position.x];
        }
        if (!this.isUndefinedOrNull(plot.y[position.x])) {
          y_tickmark = plot.y[position.x];
        }
        value = [x_tickmark, y_tickmark];
      }
      eventToLog.x_tickmark = Object.assign(x_tickmark);
      eventToLog.y_tickmark = Object.assign(y_tickmark);
      eventToLog.x_label = Object.assign(x_label);
      eventToLog.y_label = Object.assign(y_label);
      eventToLog.value = Object.assign(value);
      eventToLog.fill_value = Object.assign(fill_value);

      //console.log("x_tickmark: '", x_tickmark, "', y_tickmark: '", y_tickmark, "', x_label: '", x_label, "', y_label: '", y_label, "', value: '", value, "', fill_value: '", fill_value);

      var data = this.GetTrackerData();
      data.events.push(eventToLog);
      this.SaveTrackerData(data);
    }
  }, {
    key: "isUndefinedOrNull",
    value: function isUndefinedOrNull(item) {
      try {
        return item === undefined || item === null;
      } catch (_unused) {
        return true;
      }
    }
  }]);
  return Tracker;
}();
var Review = /*#__PURE__*/function () {
  function Review() {
    _classCallCheck(this, Review);
    // review mode form field
    if (!document.getElementById(constants.review_id)) {
      if (document.getElementById(constants.info_id)) {
        document.getElementById(constants.info_id).insertAdjacentHTML('beforebegin', '<div id="' + constants.review_id_container + '" class="hidden sr-only sr-only-focusable"><input id="' + constants.review_id + '" type="text" readonly size="50" /></div>');
      }
    }
    if (constants) {
      constants.review_container = document.querySelector('#' + constants.review_id_container);
      constants.review = document.querySelector('#' + constants.review_id);
    }
  }
  _createClass(Review, [{
    key: "ToggleReviewMode",
    value: function ToggleReviewMode() {
      var onoff = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;
      // true means on or show
      if (onoff) {
        constants.reviewSaveSpot = document.activeElement;
        constants.review_container.classList.remove('hidden');
        constants.reviewSaveBrailleMode = constants.brailleMode;
        constants.review.focus();
        display.announceText("Review on");
      } else {
        constants.review_container.classList.add('hidden');
        if (constants.reviewSaveBrailleMode == "on") {
          // we have to turn braille mode back on
          display.toggleBrailleMode('on');
        } else {
          constants.reviewSaveSpot.focus();
        }
        display.announceText("Review off");
      }
    }
  }]);
  return Review;
}(); // events and init functions
document.addEventListener('DOMContentLoaded', function (e) {
  // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

  // create global vars
  window.constants = new Constants();
  window.resources = new Resources();
  window.menu = new Menu();
  window.tracker = new Tracker();

  // run events and functions only on user study page
  if (document.getElementById('download_data_trigger')) {
    document.getElementById('download_data_trigger').addEventListener('click', function (e) {
      tracker.DownloadTrackerData();
    });
  }

  // run events only on pages with a chart (svg)
  if (document.getElementById(constants.svg_container_id)) {
    constants.PrepChartHelperComponents(); // init html
    window.review = new Review();
    window.display = new Display();

    // default page load focus on svg 
    // this is mostly for debugging, as first time load users must click or hit a key to focus
    // todo for publish: probably start users at a help / menu section, and they can tab to svg
    if (constants.debugLevel > 5) {
      setTimeout(function () {
        constants.svg.focus();
      }, 100); // it needs just a tick after DOMContentLoaded
    }

    if (constants.svg_container) {
      constants.svg_container.addEventListener("keydown", function (e) {
        // Menu open
        if (e.which == 72) {
          // M(77) for menu, or H(72) for help? I don't like it
          menu.Toggle(true);
        }
      });
    }

    // menu close
    var allClose = document.querySelectorAll('#close_menu, #menu .close');
    for (var i = 0; i < allClose.length; i++) {
      allClose[i].addEventListener("click", function (e) {
        menu.Toggle(false);
      });
    }
    document.getElementById('save_and_close_menu').addEventListener("click", function (e) {
      menu.SaveData();
      menu.Toggle(false);
    });
    document.getElementById('menu').addEventListener("keydown", function (e) {
      if (e.which == 27) {
        // esc
        menu.Toggle(false);
        svg.focus();
      }
    });

    // save user focus so we can return after menu close
    var allFocus = document.querySelectorAll('#' + constants.svg_container_id + ' > svg, #' + constants.braille_input_id);
    var _loop = function _loop(_i) {
      allFocus[_i].addEventListener('focus', function (e) {
        constants.nonMenuFocus = allFocus[_i];
      });
    };
    for (var _i = 0; _i < allFocus.length; _i++) {
      _loop(_i);
    }

    // Global events for pages with svg
    document.addEventListener('keydown', function (e) {
      // Tracker
      if (constants.isTracking) {
        if (e.which == 121) {
          //tracker.DownloadTrackerData();
        } else {
          if (plot) {
            tracker.LogEvent(e);
          }
        }
      }

      // Kill autoplay
      if (constants.isMac ? e.which == 91 || e.which == 93 : e.which == 17) {
        // ctrl (either one)
        constants.KillAutoplay();
      }

      // Review mode
      if (e.which == 82 && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        // R, but let Ctrl etc R go through cause I use that to refresh
        e.preventDefault();
        if (constants.review_container.classList.contains('hidden')) {
          review.ToggleReviewMode(true);
        } else {
          review.ToggleReviewMode(false);
        }
      }
    });
  }

  // global events for all files
  document.addEventListener('keydown', function (e) {
    // reset tracking with Ctrl + F5 / command + F5, and Ctrl + Shift + R / command + Shift + R
    // future todo: this should probably be a button with a confirmation. This is dangerous
    if (e.which == 116 && (constants.isMac ? e.metaKey : e.ctrlKey) || e.which == 82 && e.shiftKey && (constants.isMac ? e.metaKey : e.ctrlKey)) {
      e.preventDefault();
      tracker.Delete();
      location.reload(true);
    }
  });
});

/***/ }),

/***/ 529:
/***/ (() => {

function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return exports; }; var exports = {}, Op = Object.prototype, hasOwn = Op.hasOwnProperty, defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; }, $Symbol = "function" == typeof Symbol ? Symbol : {}, iteratorSymbol = $Symbol.iterator || "@@iterator", asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator", toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag"; function define(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: !0, configurable: !0, writable: !0 }), obj[key]; } try { define({}, ""); } catch (err) { define = function define(obj, key, value) { return obj[key] = value; }; } function wrap(innerFn, outerFn, self, tryLocsList) { var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator, generator = Object.create(protoGenerator.prototype), context = new Context(tryLocsList || []); return defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) }), generator; } function tryCatch(fn, obj, arg) { try { return { type: "normal", arg: fn.call(obj, arg) }; } catch (err) { return { type: "throw", arg: err }; } } exports.wrap = wrap; var ContinueSentinel = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var IteratorPrototype = {}; define(IteratorPrototype, iteratorSymbol, function () { return this; }); var getProto = Object.getPrototypeOf, NativeIteratorPrototype = getProto && getProto(getProto(values([]))); NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype); var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype); function defineIteratorMethods(prototype) { ["next", "throw", "return"].forEach(function (method) { define(prototype, method, function (arg) { return this._invoke(method, arg); }); }); } function AsyncIterator(generator, PromiseImpl) { function invoke(method, arg, resolve, reject) { var record = tryCatch(generator[method], generator, arg); if ("throw" !== record.type) { var result = record.arg, value = result.value; return value && "object" == _typeof(value) && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) { invoke("next", value, resolve, reject); }, function (err) { invoke("throw", err, resolve, reject); }) : PromiseImpl.resolve(value).then(function (unwrapped) { result.value = unwrapped, resolve(result); }, function (error) { return invoke("throw", error, resolve, reject); }); } reject(record.arg); } var previousPromise; defineProperty(this, "_invoke", { value: function value(method, arg) { function callInvokeWithMethodAndArg() { return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); }); } return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(innerFn, self, context) { var state = "suspendedStart"; return function (method, arg) { if ("executing" === state) throw new Error("Generator is already running"); if ("completed" === state) { if ("throw" === method) throw arg; return doneResult(); } for (context.method = method, context.arg = arg;;) { var delegate = context.delegate; if (delegate) { var delegateResult = maybeInvokeDelegate(delegate, context); if (delegateResult) { if (delegateResult === ContinueSentinel) continue; return delegateResult; } } if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) { if ("suspendedStart" === state) throw state = "completed", context.arg; context.dispatchException(context.arg); } else "return" === context.method && context.abrupt("return", context.arg); state = "executing"; var record = tryCatch(innerFn, self, context); if ("normal" === record.type) { if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue; return { value: record.arg, done: context.done }; } "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg); } }; } function maybeInvokeDelegate(delegate, context) { var methodName = context.method, method = delegate.iterator[methodName]; if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator["return"] && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel; var record = tryCatch(method, delegate.iterator, context.arg); if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel; var info = record.arg; return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel); } function pushTryEntry(locs) { var entry = { tryLoc: locs[0] }; 1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry); } function resetTryEntry(entry) { var record = entry.completion || {}; record.type = "normal", delete record.arg, entry.completion = record; } function Context(tryLocsList) { this.tryEntries = [{ tryLoc: "root" }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0); } function values(iterable) { if (iterable) { var iteratorMethod = iterable[iteratorSymbol]; if (iteratorMethod) return iteratorMethod.call(iterable); if ("function" == typeof iterable.next) return iterable; if (!isNaN(iterable.length)) { var i = -1, next = function next() { for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next; return next.value = undefined, next.done = !0, next; }; return next.next = next; } } return { next: doneResult }; } function doneResult() { return { value: undefined, done: !0 }; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) { var ctor = "function" == typeof genFun && genFun.constructor; return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name)); }, exports.mark = function (genFun) { return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun; }, exports.awrap = function (arg) { return { __await: arg }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) { void 0 === PromiseImpl && (PromiseImpl = Promise); var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl); return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); }); }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () { return this; }), define(Gp, "toString", function () { return "[object Generator]"; }), exports.keys = function (val) { var object = Object(val), keys = []; for (var key in object) keys.push(key); return keys.reverse(), function next() { for (; keys.length;) { var key = keys.pop(); if (key in object) return next.value = key, next.done = !1, next; } return next.done = !0, next; }; }, exports.values = values, Context.prototype = { constructor: Context, reset: function reset(skipTempReset) { if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined); }, stop: function stop() { this.done = !0; var rootRecord = this.tryEntries[0].completion; if ("throw" === rootRecord.type) throw rootRecord.arg; return this.rval; }, dispatchException: function dispatchException(exception) { if (this.done) throw exception; var context = this; function handle(loc, caught) { return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught; } for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i], record = entry.completion; if ("root" === entry.tryLoc) return handle("end"); if (entry.tryLoc <= this.prev) { var hasCatch = hasOwn.call(entry, "catchLoc"), hasFinally = hasOwn.call(entry, "finallyLoc"); if (hasCatch && hasFinally) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } else if (hasCatch) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); } else { if (!hasFinally) throw new Error("try statement without catch or finally"); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } } } }, abrupt: function abrupt(type, arg) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) { var finallyEntry = entry; break; } } finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null); var record = finallyEntry ? finallyEntry.completion : {}; return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record); }, complete: function complete(record, afterLoc) { if ("throw" === record.type) throw record.arg; return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel; }, finish: function finish(finallyLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel; } }, "catch": function _catch(tryLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc === tryLoc) { var record = entry.completion; if ("throw" === record.type) { var thrown = record.arg; resetTryEntry(entry); } return thrown; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(iterable, resultName, nextLoc) { return this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc }, "next" === this.method && (this.arg = undefined), ContinueSentinel; } }, exports; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArrayLimit(arr, i) { var _i = null == arr ? null : "undefined" != typeof Symbol && arr[Symbol.iterator] || arr["@@iterator"]; if (null != _i) { var _s, _e, _x, _r, _arr = [], _n = !0, _d = !1; try { if (_x = (_i = _i.call(arr)).next, 0 === i) { if (Object(_i) !== _i) return; _n = !1; } else for (; !(_n = (_s = _x.call(_i)).done) && (_arr.push(_s.value), _arr.length !== i); _n = !0); } catch (err) { _d = !0, _e = err; } finally { try { if (!_n && null != _i["return"] && (_r = _i["return"](), Object(_r) !== _r)) return; } finally { if (_d) throw _e; } } return _arr; } }
function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }
function _createForOfIteratorHelper(o, allowArrayLike) { var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"]; if (!it) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e2) { throw _e2; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = it.call(o); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e3) { didErr = true; err = _e3; }, f: function f() { try { if (!normalCompletion && it["return"] != null) it["return"](); } finally { if (didErr) throw err; } } }; }
function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _iterableToArray(iter) { if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter); }
function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) return _arrayLikeToArray(arr); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
document.addEventListener('DOMContentLoaded', function (e) {// we wrap in DOMContentLoaded to make sure everything has loaded before we run anything
});
var ScatterPlot = /*#__PURE__*/(/* unused pure expression or super */ null && (function () {
  function ScatterPlot() {
    _classCallCheck(this, ScatterPlot);
    // layer = 1
    if ('point_elements' in maidr) {
      this.plotPoints = maidr.point_elements;
    } else {
      this.plotPoints = document.querySelectorAll('#' + constants.plotId.replaceAll('\.', '\\.') + ' > use');
    }
    this.svgPointsX = this.GetSvgPointCoords()[0]; // x coordinates of points
    this.svgPointsY = this.GetSvgPointCoords()[1]; // y coordinates of points

    this.x = this.GetPointValues()[0]; // actual values of x
    this.y = this.GetPointValues()[1]; // actual values of y

    // for sound weight use
    this.points_count = this.GetPointValues()[2]; // number of each points
    this.max_count = this.GetPointValues()[3];

    // layer = 2
    if (constants.manualData) {
      this.plotLine = maidr.smooth_elements;
    } else {
      this.plotLine = document.querySelectorAll('#' + 'GRID.polyline.13.1'.replaceAll('\.', '\\.') + ' > polyline')[0];
    }
    this.svgLineX = this.GetSvgLineCoords()[0]; // x coordinates of curve
    this.svgLineY = this.GetSvgLineCoords()[1]; // y coordinates of curve

    this.curveX = this.GetSmoothCurvePoints()[0]; // actual values of x
    this.curvePoints = this.GetSmoothCurvePoints()[1]; // actual values of y 

    this.curveMinY = Math.min.apply(Math, _toConsumableArray(this.curvePoints));
    this.curveMaxY = Math.max.apply(Math, _toConsumableArray(this.curvePoints));
    this.gradient = this.GetGradient();
    this.x_group_label = "";
    this.y_group_label = "";
    this.title = "";
    if (typeof maidr !== 'undefined') {
      if ('axes' in maidr) {
        if ('x' in maidr.axes) {
          this.x_group_label = maidr.axes.x.label;
        }
        if ('y' in maidr.axes) {
          this.y_group_label = maidr.axes.y.label;
        }
      }
      if ('title' in maidr) {
        this.title = maidr.title;
      }
    }
  }
  _createClass(ScatterPlot, [{
    key: "GetSvgPointCoords",
    value: function GetSvgPointCoords() {
      var points = new Map();
      for (var i = 0; i < this.plotPoints.length; i++) {
        var x = parseFloat(this.plotPoints[i].getAttribute('x')); // .toFixed(1);
        var y = parseFloat(this.plotPoints[i].getAttribute('y'));
        if (!points.has(x)) {
          points.set(x, new Set([y]));
        } else {
          points.get(x).add(y);
        }
      }
      points = new Map(_toConsumableArray(points).sort(function (a, b) {
        return a[0] - b[0];
      }));
      points.forEach(function (value, key) {
        points[key] = Array.from(value).sort(function (a, b) {
          return a - b;
        });
      });
      var X = _toConsumableArray(points.keys());
      var Y = [];
      for (var _i = 0; _i < X.length; _i++) {
        Y.push(points[X[_i]]);
      }
      return [X, Y];
    }
  }, {
    key: "GetPointValues",
    value: function GetPointValues() {
      var points = new Map(); // keep track of x and y values

      var xValues = [];
      var yValues = [];
      for (var i = 0; i < maidr.data.data_point_layer.length; i++) {
        var x = maidr.data.data_point_layer[i]["x"];
        var y = maidr.data.data_point_layer[i]["y"];
        xValues.push(x);
        yValues.push(y);
        if (!points.has(x)) {
          points.set(x, new Map([[y, 1]]));
        } else {
          if (points.get(x).has(y)) {
            var mapy = points.get(x);
            mapy.set(y, mapy.get(y) + 1);
          } else {
            points.get(x).set(y, 1);
          }
        }
      }
      constants.minX = 0;
      constants.maxX = _toConsumableArray(new Set(xValues)).length;
      constants.minY = Math.min.apply(Math, yValues);
      constants.maxY = Math.max.apply(Math, yValues);
      points = new Map(_toConsumableArray(points).sort(function (a, b) {
        return a[0] - b[0];
      }));
      points.forEach(function (value, key) {
        points[key] = Array.from(value).sort(function (a, b) {
          return a[0] - b[0];
        });
      });
      var X = [];
      var Y = [];
      var points_count = [];
      var _iterator = _createForOfIteratorHelper(points),
        _step;
      try {
        for (_iterator.s(); !(_step = _iterator.n()).done;) {
          var _step$value = _slicedToArray(_step.value, 2),
            x_val = _step$value[0],
            y_val = _step$value[1];
          X.push(x_val);
          var y_arr = [];
          var y_count = [];
          var _iterator2 = _createForOfIteratorHelper(y_val),
            _step2;
          try {
            for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
              var _step2$value = _slicedToArray(_step2.value, 2),
                _y = _step2$value[0],
                count = _step2$value[1];
              y_arr.push(_y);
              y_count.push(count);
            }
          } catch (err) {
            _iterator2.e(err);
          } finally {
            _iterator2.f();
          }
          Y.push(y_arr.sort());
          points_count.push(y_count);
        }
      } catch (err) {
        _iterator.e(err);
      } finally {
        _iterator.f();
      }
      var max_points = Math.max.apply(Math, _toConsumableArray(points_count.map(function (a) {
        return Math.max.apply(Math, _toConsumableArray(a));
      })));
      return [X, Y, points_count, max_points];
    }
  }, {
    key: "PlayTones",
    value: function PlayTones(audio) {
      // kill the previous separate-points play before starting the next play
      if (constants.sepPlayId) {
        constants.KillSepPlay();
      }
      if (constants.layer == 1) {
        // point layer
        // we play a run of tones
        position.z = 0;
        constants.sepPlayId = setInterval(function () {
          // play this tone
          audio.playTone();

          // and then set up for the next one
          position.z += 1;

          // and kill if we're done
          if (position.z + 1 > plot.y[position.x].length) {
            constants.KillSepPlay();
            position.z = -1;
          }
        }, constants.sonifMode == "sep" ? constants.autoPlayPointsRate : 0); // play all tones at the same time
      } else if (constants.layer == 2) {
        // best fit line layer
        audio.playTone();
      }
    }
  }, {
    key: "GetSvgLineCoords",
    value: function GetSvgLineCoords() {
      // extract all the y coordinates from the point attribute of polyline
      var str = this.plotLine.getAttribute('points');
      var coords = str.split(' ');
      var X = [];
      var Y = [];
      for (var i = 0; i < coords.length; i++) {
        var coord = coords[i].split(',');
        X.push(parseFloat(coord[0]));
        Y.push(parseFloat(coord[1]));
      }
      return [X, Y];
    }
  }, {
    key: "GetSmoothCurvePoints",
    value: function GetSmoothCurvePoints() {
      var x_points = [];
      var y_points = [];
      for (var i = 0; i < maidr.data.data_smooth_layer.length; i++) {
        x_points.push(maidr.data.data_smooth_layer[i]['x']);
        y_points.push(maidr.data.data_smooth_layer[i]['y']);
      }
      return [x_points, y_points];
    }
  }, {
    key: "GetGradient",
    value: function GetGradient() {
      var gradients = [];
      for (var i = 0; i < this.curvePoints.length - 1; i++) {
        var abs_grad = Math.abs((this.curvePoints[i + 1] - this.curvePoints[i]) / (this.curveX[i + 1] - this.curveX[i])).toFixed(3);
        gradients.push(abs_grad);
      }
      gradients.push('end');
      return gradients;
    }
  }]);
  return ScatterPlot;
}()));
;
var Layer0Point = /*#__PURE__*/(/* unused pure expression or super */ null && (function () {
  function Layer0Point() {
    _classCallCheck(this, Layer0Point);
    this.x = plot.svgPointsX[0];
    this.y = plot.svgPointsY[0];
    this.strokeWidth = 1.35;
  }
  _createClass(Layer0Point, [{
    key: "UpdatePoints",
    value: function () {
      var _UpdatePoints = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee() {
        return _regeneratorRuntime().wrap(function _callee$(_context) {
          while (1) switch (_context.prev = _context.next) {
            case 0:
              _context.next = 2;
              return this.ClearPoints();
            case 2:
              this.x = plot.svgPointsX[position.x];
              this.y = plot.svgPointsY[position.x];
            case 4:
            case "end":
              return _context.stop();
          }
        }, _callee, this);
      }));
      function UpdatePoints() {
        return _UpdatePoints.apply(this, arguments);
      }
      return UpdatePoints;
    }()
  }, {
    key: "PrintPoints",
    value: function () {
      var _PrintPoints = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2() {
        var i, svgns, point;
        return _regeneratorRuntime().wrap(function _callee2$(_context2) {
          while (1) switch (_context2.prev = _context2.next) {
            case 0:
              _context2.next = 2;
              return this.ClearPoints();
            case 2:
              _context2.next = 4;
              return this.UpdatePoints();
            case 4:
              for (i = 0; i < this.y.length; i++) {
                svgns = "http://www.w3.org/2000/svg";
                point = document.createElementNS(svgns, 'circle');
                point.setAttribute('class', 'highlight_point');
                point.setAttribute('cx', this.x);
                point.setAttribute('cy', constants.svg.getBoundingClientRect().height - this.y[i]);
                point.setAttribute('r', 3.95);
                point.setAttribute('stroke', constants.colorSelected);
                point.setAttribute('stroke-width', this.strokeWidth);
                point.setAttribute('fill', constants.colorSelected);
                constants.svg.appendChild(point);
              }
            case 5:
            case "end":
              return _context2.stop();
          }
        }, _callee2, this);
      }));
      function PrintPoints() {
        return _PrintPoints.apply(this, arguments);
      }
      return PrintPoints;
    }()
  }, {
    key: "ClearPoints",
    value: function () {
      var _ClearPoints = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3() {
        var points, i;
        return _regeneratorRuntime().wrap(function _callee3$(_context3) {
          while (1) switch (_context3.prev = _context3.next) {
            case 0:
              if (document.getElementById('highlight_point')) document.getElementById('highlight_point').remove();
              points = document.getElementsByClassName('highlight_point');
              for (i = 0; i < points.length; i++) {
                document.getElementsByClassName('highlight_point')[i].remove();
              }
            case 3:
            case "end":
              return _context3.stop();
          }
        }, _callee3);
      }));
      function ClearPoints() {
        return _ClearPoints.apply(this, arguments);
      }
      return ClearPoints;
    }()
  }, {
    key: "UpdatePointDisplay",
    value: function UpdatePointDisplay() {
      this.ClearPoints();
      this.UpdatePoints();
      this.PrintPoints();
    }
  }]);
  return Layer0Point;
}()));
var Layer1Point = /*#__PURE__*/(/* unused pure expression or super */ null && (function () {
  function Layer1Point() {
    _classCallCheck(this, Layer1Point);
    this.x = plot.svgLineX[0];
    this.y = plot.svgLineY[0];
    this.strokeWidth = 1.35;
  }
  _createClass(Layer1Point, [{
    key: "UpdatePoints",
    value: function () {
      var _UpdatePoints2 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4() {
        return _regeneratorRuntime().wrap(function _callee4$(_context4) {
          while (1) switch (_context4.prev = _context4.next) {
            case 0:
              _context4.next = 2;
              return this.ClearPoints();
            case 2:
              this.x = plot.svgLineX[positionL1.x];
              this.y = plot.svgLineY[positionL1.x];
            case 4:
            case "end":
              return _context4.stop();
          }
        }, _callee4, this);
      }));
      function UpdatePoints() {
        return _UpdatePoints2.apply(this, arguments);
      }
      return UpdatePoints;
    }()
  }, {
    key: "PrintPoints",
    value: function () {
      var _PrintPoints2 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5() {
        var svgns, point;
        return _regeneratorRuntime().wrap(function _callee5$(_context5) {
          while (1) switch (_context5.prev = _context5.next) {
            case 0:
              _context5.next = 2;
              return this.ClearPoints();
            case 2:
              _context5.next = 4;
              return this.UpdatePoints();
            case 4:
              svgns = "http://www.w3.org/2000/svg";
              point = document.createElementNS(svgns, 'circle');
              point.setAttribute('id', 'highlight_point');
              point.setAttribute('cx', this.x);
              point.setAttribute('cy', constants.svg.getBoundingClientRect().height - this.y);
              point.setAttribute('r', 3.95);
              point.setAttribute('stroke', constants.colorSelected);
              point.setAttribute('stroke-width', this.strokeWidth);
              point.setAttribute('fill', constants.colorSelected);
              constants.svg.appendChild(point);
            case 14:
            case "end":
              return _context5.stop();
          }
        }, _callee5, this);
      }));
      function PrintPoints() {
        return _PrintPoints2.apply(this, arguments);
      }
      return PrintPoints;
    }()
  }, {
    key: "ClearPoints",
    value: function () {
      var _ClearPoints2 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee6() {
        var points, i;
        return _regeneratorRuntime().wrap(function _callee6$(_context6) {
          while (1) switch (_context6.prev = _context6.next) {
            case 0:
              points = document.getElementsByClassName('highlight_point');
              for (i = 0; i < points.length; i++) {
                document.getElementsByClassName('highlight_point')[i].remove();
              }
              if (document.getElementById('highlight_point')) document.getElementById('highlight_point').remove();
            case 3:
            case "end":
              return _context6.stop();
          }
        }, _callee6);
      }));
      function ClearPoints() {
        return _ClearPoints2.apply(this, arguments);
      }
      return ClearPoints;
    }()
  }, {
    key: "UpdatePointDisplay",
    value: function UpdatePointDisplay() {
      this.ClearPoints();
      this.UpdatePoints();
      this.PrintPoints();
    }
  }]);
  return Layer1Point;
}()));

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
/* harmony import */ var _js_constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(225);
/* harmony import */ var _js_constants_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_js_constants_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _js_scatterplot_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(529);
/* harmony import */ var _js_scatterplot_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_js_scatterplot_js__WEBPACK_IMPORTED_MODULE_1__);
// import all JS








// import all CSS

})();

/******/ })()
;