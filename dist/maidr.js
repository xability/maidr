class Constants {
  // element ids
  svg_container_id = 'svg-container';
  braille_container_id = 'braille-div';
  braille_input_id = 'braille-input';
  info_id = 'info';
  announcement_container_id = 'announcements';
  end_chime_id = 'end_chime';
  container_id = 'container';
  project_id = 'maidr';
  review_id_container = 'review_container';
  review_id = 'review';
  reviewSaveSpot;
  reviewSaveBrailleMode;

  // default constructor for boxplot
  constructor() {
    // page elements
    this.svg_container = document.getElementById(this.svg_container_id);
    this.svg = document.querySelector('#' + this.svg_container_id + ' > svg');
    this.brailleContainer = document.getElementById(this.braille_container_id);
    this.brailleInput = document.getElementById(this.braille_input_id);
    this.infoDiv = document.getElementById(this.info_id);
    this.announceContainer = document.getElementById(
      this.announcement_container_id
    );
    this.nonMenuFocus = this.svg;
    this.endChime = document.getElementById(this.end_chime_id);
  }

  // basic chart properties
  minX = 0;
  maxX = 0;
  minY = 0;
  maxY = 0;
  plotId = ''; // update with id in chart specific js
  chartType = ''; // set as 'boxplot' or whatever later in chart specific js file
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
  vol = 0.5;
  MAX_VOL = 30;
  autoPlayRate = 250; // ms per tone
  colorSelected = '#03C809';
  brailleDisplayLength = 40; // num characters in user's braille display. Common length for desktop / mobile applications

  // advanced user settings
  showRect = 1; // true / false
  hasRect = 1; // true / false
  duration = 0.3;
  outlierDuration = 0.06;
  autoPlayOutlierRate = 50; // ms per tone
  autoPlayPointsRate = 30;
  colorUnselected = '#595959'; // we don't use this yet, but remember: don't rely on color! also do a shape or pattern fill
  isTracking = 1; // 0 / 1, is tracking on or off
  visualBraille = false; // do we want to represent braille based on what's visually there or actually there. Like if we have 2 outliers with the same position, do we show 1 (visualBraille true) or 2 (false)

  // user controls (not exposed to menu, with shortcuts usually)
  showDisplay = 1; // true / false
  showDisplayInBraille = 1; // true / false
  showDisplayInAutoplay = 0; // true / false
  textMode = 'off'; // off / terse / verbose
  brailleMode = 'off'; // on / off
  sonifMode = 'off'; // sep / same / off
  reviewMode = 'off'; // on / off
  layer = 1; // 1 = points; 2 = best fit line => for scatterplot
  outlierInterval = null;

  // platform controls
  isMac = navigator.userAgent.toLowerCase().includes('mac'); // true if macOS
  control = this.isMac ? 'Cmd' : 'Ctrl';
  alt = this.isMac ? 'option' : 'Alt';
  home = this.isMac ? 'fn + Left arrow' : 'Home';
  end = this.isMac ? 'fn + Right arrow' : 'End';
  keypressInterval = 2000; // ms or 2s

  // debug stuff
  debugLevel = 3; // 0 = no console output, 1 = some console, 2 = more console, etc
  canPlayEndChime = false; //
  manualData = true; // pull from manual data like chart2music (true), or do the old method where we pull from the svg (false)

  PrepChartHelperComponents() {
    // init html stuff. aria live regions, braille input, etc

    // info aria live
    if (!document.getElementById(this.info_id)) {
      if (document.getElementById(this.svg_container_id)) {
        document
          .getElementById(this.svg_container_id)
          .insertAdjacentHTML(
            'afterend',
            '<br>\n<div id="info" aria-live="assertive" aria-atomic="true">\n<p id="x"></p>\n<p id="y"></p>\n</div>\n'
          );
      }
    }

    // announcements aria live
    if (!document.getElementById(this.announcement_container_id)) {
      if (document.getElementById(this.info_id)) {
        document
          .getElementById(this.info_id)
          .insertAdjacentHTML(
            'afterend',
            '<div id="announcements" aria-live="assertive" aria-atomic="true">\n</div>\n'
          );
      }
    }

    // braille
    if (!document.getElementById(this.braille_container_id)) {
      if (document.getElementById(this.container_id)) {
        document
          .getElementById(this.container_id)
          .insertAdjacentHTML(
            'afterbegin',
            '<div id="braille-div">\n<input id="braille-input" class="braille-input hidden" type="text" />\n</div>\n'
          );
      }
    }

    // role app on svg
    if (document.getElementById(this.svg_container_id)) {
      document
        .querySelector('#' + this.svg_container_id + ' > svg')
        .setAttribute('role', 'application');
      document
        .querySelector('#' + this.svg_container_id + ' > svg')
        .setAttribute('tabindex', '0');
    }

    // end chime audio element
    if (!document.getElementById(this.end_chime_id)) {
      if (document.getElementById(this.info_id)) {
        document
          .getElementById(this.info_id)
          .insertAdjacentHTML(
            'afterend',
            '<div class="hidden"> <audio src="../src/terminalBell.mp3" id="end_chime"></audio> </div>'
          );
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
  constructor() {}

  language = 'en'; // 2 char lang code
  knowledgeLevel = 'basic'; // basic, intermediate, expert

  // these strings run on getters, which pull in language, knowledgeLevel, chart, and actual requested string
  strings = {
    en: {
      basic: {
        upper_outlier: 'Upper Outlier',
        lower_outlier: 'Lower Outlier',
        min: 'Minimum',
        max: 'Maximum',
        25: '25%',
        50: '50%',
        75: '75%',
        son_on: 'Sonification on',
        son_off: 'Sonification off',
        son_des: 'Sonification descrete',
        son_comp: 'Sonification compare',
        son_ch: 'Sonification chord',
        son_sep: 'Sonification separate',
        son_same: 'Sonification combined',
        empty: 'Empty',
      },
    },
  };

  GetString(id) {
    return this.strings[this.language][this.knowledgeLevel][id];
  }
}

class Menu {
  constructor() {
    this.CreateMenu();
    this.LoadDataFromLocalStorage();
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
                                        <td>Period</td>
                                    </tr>
                                    <tr>
                                        <td>Auto-play speed down</td>
                                        <td>Comma</td>
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
                            <p><input type="number" min="500" max="5000" step="500" id="keypress_interval" name="keypress_interval"><label for="keypress_interval">Keypress Interval (ms)</label></p>
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
    document
      .querySelector('body')
      .insertAdjacentHTML('beforeend', this.menuHtml);
  }

  Toggle(onoff) {
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

  PopulateData() {
    document.getElementById('vol').value = constants.vol;
    //document.getElementById('show_rect').checked = constants.showRect;
    document.getElementById('autoplay_rate').value = constants.autoPlayRate;
    document.getElementById('braille_display_length').value =
      constants.brailleDisplayLength;
    document.getElementById('color_selected').value = constants.colorSelected;
    document.getElementById('min_freq').value = constants.MIN_FREQUENCY;
    document.getElementById('max_freq').value = constants.MAX_FREQUENCY;
    document.getElementById('keypress_interval').value =
      constants.keypressInterval;
  }

  SaveData() {
    constants.vol = document.getElementById('vol').value;
    //constants.showRect = document.getElementById('show_rect').checked;
    constants.autoPlayRate = document.getElementById('autoplay_rate').value;
    constants.brailleDisplayLength = document.getElementById(
      'braille_display_length'
    ).value;
    constants.colorSelected = document.getElementById('color_selected').value;
    constants.MIN_FREQUENCY = document.getElementById('min_freq').value;
    constants.MAX_FREQUENCY = document.getElementById('max_freq').value;
    constants.keypressInterval =
      document.getElementById('keypress_interval').value;
  }

  SaveDataToLocalStorage() {
    // save all data in this.SaveData() to local storage
    let data = {};
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
  LoadDataFromLocalStorage() {
    let data = JSON.parse(localStorage.getItem('settings_data'));
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
    if (prevData) {
      // good to go already, do nothing
    } else {
      let data = {};
      data.userAgent = Object.assign(navigator.userAgent);
      data.vendor = Object.assign(navigator.vendor);
      data.language = Object.assign(navigator.language);
      data.platform = Object.assign(navigator.platform);
      data.events = [];

      this.SaveTrackerData(data);
    }
  }

  DownloadTrackerData() {
    let link = document.createElement('a');
    let data = this.GetTrackerData();
    let fileStr = new Blob([JSON.stringify(data)], { type: 'text/plain' });
    link.href = URL.createObjectURL(fileStr);
    link.download = 'tracking.json';
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

    if (constants.debugLevel > 0) {
      console.log('tracking data cleared');
    }

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
      eventToLog.braille_display_length = Object.assign(
        constants.brailleDisplayLength
      );
    }
    if (!this.isUndefinedOrNull(constants.duration)) {
      eventToLog.tone_duration = Object.assign(constants.duration);
    }
    if (!this.isUndefinedOrNull(constants.autoPlayOutlierRate)) {
      eventToLog.autoplay_outlier_rate = Object.assign(
        constants.autoPlayOutlierRate
      );
    }
    if (!this.isUndefinedOrNull(constants.autoPlayPointsRate)) {
      eventToLog.autoplay_points_rate = Object.assign(
        constants.autoPlayPointsRate
      );
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
      let textDisplay = Object.assign(constants.infoDiv.innerHTML);
      textDisplay = textDisplay.replaceAll(/<[^>]*>?/gm, '');
      eventToLog.text_display = textDisplay;
    }
    if (!this.isUndefinedOrNull(location.href)) {
      eventToLog.location = Object.assign(location.href);
    }

    // chart specific values
    let x_tickmark = '';
    let y_tickmark = '';
    let x_label = '';
    let y_label = '';
    let value = '';
    let fill_value = '';
    if (constants.chartType == 'barplot') {
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
    } else if (constants.chartType == 'heatmap') {
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
    } else if (constants.chartType == 'boxplot') {
      let plotPos =
        constants.plotOrientation == 'vert' ? position.x : position.y;
      let sectionPos =
        constants.plotOrientation == 'vert' ? position.y : position.x;

      if (!this.isUndefinedOrNull(plot.x_group_label)) {
        x_label = plot.x_group_label;
      }
      if (!this.isUndefinedOrNull(plot.y_group_label)) {
        y_label = plot.y_group_label;
      }
      if (constants.plotOrientation == 'vert') {
        if (plotPos > -1 && sectionPos > -1) {
          if (
            !this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].label)
          ) {
            y_tickmark = plot.plotData[plotPos][sectionPos].label;
          }
          if (!this.isUndefinedOrNull(plot.x_labels[position.x])) {
            x_tickmark = plot.x_labels[position.x];
          }
          if (
            !this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].values)
          ) {
            value = plot.plotData[plotPos][sectionPos].values;
          } else if (
            !this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].y)
          ) {
            value = plot.plotData[plotPos][sectionPos].y;
          }
        }
      } else {
        if (plotPos > -1 && sectionPos > -1) {
          if (
            !this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].label)
          ) {
            x_tickmark = plot.plotData[plotPos][sectionPos].label;
          }
          if (!this.isUndefinedOrNull(plot.y_labels[position.y])) {
            y_tickmark = plot.y_labels[position.y];
          }
          if (
            !this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].values)
          ) {
            value = plot.plotData[plotPos][sectionPos].values;
          } else if (
            !this.isUndefinedOrNull(plot.plotData[plotPos][sectionPos].x)
          ) {
            value = plot.plotData[plotPos][sectionPos].x;
          }
        }
      }
    } else if (constants.chartType == 'scatterplot') {
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

    let data = this.GetTrackerData();
    data.events.push(eventToLog);
    this.SaveTrackerData(data);
  }

  isUndefinedOrNull(item) {
    try {
      return item === undefined || item === null;
    } catch {
      return true;
    }
  }
}

class Review {
  constructor() {
    // review mode form field
    if (!document.getElementById(constants.review_id)) {
      if (document.getElementById(constants.info_id)) {
        document
          .getElementById(constants.info_id)
          .insertAdjacentHTML(
            'beforebegin',
            '<div id="' +
              constants.review_id_container +
              '" class="hidden sr-only sr-only-focusable"><input id="' +
              constants.review_id +
              '" type="text" readonly size="50" /></div>'
          );
      }
    }

    if (constants) {
      constants.review_container = document.querySelector(
        '#' + constants.review_id_container
      );
      constants.review = document.querySelector('#' + constants.review_id);
    }
  }

  ToggleReviewMode(onoff = true) {
    // true means on or show
    if (onoff) {
      constants.reviewSaveSpot = document.activeElement;
      constants.review_container.classList.remove('hidden');
      constants.reviewSaveBrailleMode = constants.brailleMode;
      constants.review.focus();

      display.announceText('Review on');
    } else {
      constants.review_container.classList.add('hidden');
      if (constants.reviewSaveBrailleMode == 'on') {
        // we have to turn braille mode back on
        display.toggleBrailleMode('on');
      } else {
        constants.reviewSaveSpot.focus();
      }
      display.announceText('Review off');
    }
  }
}

// Audio class
// Sets up audio stuff (compressor, gain),
// sets up an oscillator that has good falloff (no clipping sounds) and can be instanced to be played anytime and can handle overlaps,
// sets up an actual playTone function that plays tones based on current chart position
class Audio {
  constructor() {
    this.AudioContext = window['AudioContext'] || window['webkitAudioContext'];
    this.audioContext = new AudioContext();
    this.compressor = this.compressorSetup(this.audioContext);
  }

  compressorSetup() {
    let compressor = this.audioContext.createDynamicsCompressor(); // create compressor for better audio quality

    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;
    let gainMaster = this.audioContext.createGain(); // create master gain
    gainMaster.gain.value = constants.vol;
    compressor.connect(gainMaster);
    gainMaster.connect(this.audioContext.destination);

    return compressor;
  }

  // an oscillator is created and destroyed after some falloff
  playTone() {
    let currentDuration = constants.duration;
    let volume = constants.vol;

    let rawPanning = 0;
    let rawFreq = 0;
    let frequency = 0;
    let panning = 0;
    // freq goes between min / max as rawFreq goes between min(0) / max
    if (constants.chartType == 'barplot') {
      rawFreq = plot.plotData[position.x];
      rawPanning = position.x;
      frequency = this.SlideBetween(
        rawFreq,
        constants.minY,
        constants.maxY,
        constants.MIN_FREQUENCY,
        constants.MAX_FREQUENCY
      );
      panning = this.SlideBetween(
        rawPanning,
        constants.minX,
        constants.maxX,
        -1,
        1
      );
    } else if (constants.chartType == 'boxplot') {
      let plotPos =
        constants.plotOrientation == 'vert' ? position.x : position.y;
      let sectionPos =
        constants.plotOrientation == 'vert' ? position.y : position.x;
      if (
        position.z > -1 &&
        Object.hasOwn(plot.plotData[plotPos][sectionPos], 'values')
      ) {
        // outliers are stored in values with a seperate itterator
        rawFreq = plot.plotData[plotPos][sectionPos].values[position.z];
      } else {
        // normal points
        if (constants.plotOrientation == 'vert') {
          rawFreq = plot.plotData[plotPos][sectionPos].y;
        } else {
          rawFreq = plot.plotData[plotPos][sectionPos].x;
        }
      }
      if (plot.plotData[plotPos][sectionPos].type != 'blank') {
        if (constants.plotOrientation == 'vert') {
          frequency = this.SlideBetween(
            rawFreq,
            constants.minY,
            constants.maxY,
            constants.MIN_FREQUENCY,
            constants.MAX_FREQUENCY
          );
          panning = this.SlideBetween(
            rawFreq,
            constants.minY,
            constants.maxY,
            -1,
            1
          );
        } else {
          frequency = this.SlideBetween(
            rawFreq,
            constants.minX,
            constants.maxX,
            constants.MIN_FREQUENCY,
            constants.MAX_FREQUENCY
          );
          panning = this.SlideBetween(
            rawFreq,
            constants.minX,
            constants.maxX,
            -1,
            1
          );
        }
      } else {
        frequency = constants.MIN_FREQUENCY;
        panning = 0;
      }
    } else if (constants.chartType == 'heatmap') {
      rawFreq = plot.values[position.y][position.x];
      rawPanning = position.x;
      frequency = this.SlideBetween(
        rawFreq,
        constants.minY,
        constants.maxY,
        constants.MIN_FREQUENCY,
        constants.MAX_FREQUENCY
      );
      panning = this.SlideBetween(
        rawPanning,
        constants.minX,
        constants.maxX,
        -1,
        1
      );
    } else if (constants.chartType == 'scatterplot') {
      if (constants.layer == 1) {
        // point layer
        // more than one point with same x-value
        rawFreq = plot.y[position.x][position.z];
        if (plot.max_count == 1) {
          volume = constants.vol;
        } else {
          volume = this.SlideBetween(
            plot.points_count[position.x][position.z],
            1,
            plot.max_count,
            constants.vol,
            constants.MAX_VOL
          );
        }

        rawPanning = position.x;
        frequency = this.SlideBetween(
          rawFreq,
          constants.minY,
          constants.maxY,
          constants.MIN_FREQUENCY,
          constants.MAX_FREQUENCY
        );
        panning = this.SlideBetween(
          rawPanning,
          constants.minX,
          constants.maxX,
          -1,
          1
        );
      } else if (constants.layer == 2) {
        // best fit line layer

        rawFreq = plot.curvePoints[positionL1.x];
        rawPanning = positionL1.x;
        frequency = this.SlideBetween(
          rawFreq,
          plot.curveMinY,
          plot.curveMaxY,
          constants.MIN_FREQUENCY,
          constants.MAX_FREQUENCY
        );
        panning = this.SlideBetween(
          rawPanning,
          constants.minX,
          constants.maxX,
          -1,
          1
        );
      }
    }

    if (constants.debugLevel > 5) {
      console.log('will play tone at freq', frequency);
      if (constants.chartType == 'boxplot') {
        console.log(
          'based on',
          constants.minY,
          '<',
          rawFreq,
          '<',
          constants.maxY,
          ' | freq min',
          constants.MIN_FREQUENCY,
          'max',
          constants.MAX_FREQUENCY
        );
      } else {
        console.log(
          'based on',
          constants.minX,
          '<',
          rawFreq,
          '<',
          constants.maxX,
          ' | freq min',
          constants.MIN_FREQUENCY,
          'max',
          constants.MAX_FREQUENCY
        );
      }
    }

    if (constants.chartType == 'boxplot') {
      // different types of sounds for different regions.
      // outlier = short tone
      // whisker = normal tone
      // range = chord
      let plotPos =
        constants.plotOrientation == 'vert' ? position.x : position.y;
      let sectionPos =
        constants.plotOrientation == 'vert' ? position.y : position.x;
      let sectionType = plot.plotData[plotPos][sectionPos].type;
      if (sectionType == 'outlier') {
        currentDuration = constants.outlierDuration;
      } else if (sectionType == 'whisker') {
        //currentDuration = constants.duration * 2;
      } else {
        //currentDuration = constants.duration * 2;
      }
    }

    // create tones
    this.playOscillator(frequency, currentDuration, panning, volume, 'sine');
    if (constants.chartType == 'boxplot') {
      let plotPos =
        constants.plotOrientation == 'vert' ? position.x : position.y;
      let sectionPos =
        constants.plotOrientation == 'vert' ? position.y : position.x;
      let sectionType = plot.plotData[plotPos][sectionPos].type;
      if (sectionType == 'range') {
        // also play an octive below at lower vol
        let freq2 = frequency / 2;
        this.playOscillator(
          freq2,
          currentDuration,
          panning,
          constants.vol / 4,
          'triangle'
        );
      }
    } else if (constants.chartType == 'heatmap') {
      // Added heatmap tone feature
      if (rawFreq == 0) {
        this.PlayNull();
      }
    }
  }

  playOscillator(
    frequency,
    currentDuration,
    panning,
    currentVol = 1,
    wave = 'sine'
  ) {
    const t = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.value = parseFloat(frequency);
    oscillator.start();

    // create gain for this event
    const gainThis = this.audioContext.createGain();
    gainThis.gain.setValueCurveAtTime(
      [
        0.5 * currentVol,
        1 * currentVol,
        0.5 * currentVol,
        0.5 * currentVol,
        0.5 * currentVol,
        0.1 * currentVol,
        1e-4 * currentVol,
      ],
      t,
      currentDuration
    ); // this is what makes the tones fade out properly and not clip

    let MAX_DISTANCE = 10000;
    let posZ = 1;
    const panner = new PannerNode(this.audioContext, {
      panningModel: 'HRTF',
      distanceModel: 'linear',
      positionX: position.x,
      positionY: position.y,
      positionZ: posZ,
      plotOrientationX: 0.0,
      plotOrientationY: 0.0,
      plotOrientationZ: -1.0,
      refDistance: 1,
      maxDistance: MAX_DISTANCE,
      rolloffFactor: 10,
      coneInnerAngle: 40,
      coneOuterAngle: 50,
      coneOuterGain: 0.4,
    });

    // create panning
    const stereoPanner = this.audioContext.createStereoPanner();
    stereoPanner.pan.value = panning;
    oscillator.connect(gainThis);
    gainThis.connect(stereoPanner);
    stereoPanner.connect(panner);
    panner.connect(this.compressor);

    // create panner node

    // play sound for duration
    setTimeout(() => {
      panner.disconnect();
      gainThis.disconnect();
      oscillator.stop();
      oscillator.disconnect();
    }, currentDuration * 1e3 * 2);
  }

  playSmooth(
    freqArr = [600, 500, 400, 300],
    currentDuration = 2,
    panningArr = [-1, 0, 1],
    currentVol = 1,
    wave = 'sine'
  ) {
    // todo: make smooth duration dependant on how much line there is to do. Like, at max it should be max duration, but if we only have like a tiny bit to play we should just play for a tiny bit

    let gainArr = new Array(freqArr.length * 3).fill(0.5 * currentVol);
    gainArr.push(1e-4 * currentVol);

    const t = this.audioContext.currentTime;
    const smoothOscillator = this.audioContext.createOscillator();
    smoothOscillator.type = wave;
    smoothOscillator.frequency.setValueCurveAtTime(freqArr, t, currentDuration);
    smoothOscillator.start();
    constants.isSmoothAutoplay = true;

    // create gain for this event
    this.smoothGain = this.audioContext.createGain();
    this.smoothGain.gain.setValueCurveAtTime(gainArr, t, currentDuration); // this is what makes the tones fade out properly and not clip

    let MAX_DISTANCE = 10000;
    let posZ = 1;
    const panner = new PannerNode(this.audioContext, {
      panningModel: 'HRTF',
      distanceModel: 'linear',
      positionX: position.x,
      positionY: position.y,
      positionZ: posZ,
      plotOrientationX: 0.0,
      plotOrientationY: 0.0,
      plotOrientationZ: -1.0,
      refDistance: 1,
      maxDistance: MAX_DISTANCE,
      rolloffFactor: 10,
      coneInnerAngle: 40,
      coneOuterAngle: 50,
      coneOuterGain: 0.4,
    });

    // create panning
    const stereoPanner = this.audioContext.createStereoPanner();
    stereoPanner.pan.setValueCurveAtTime(panningArr, t, currentDuration);
    smoothOscillator.connect(this.smoothGain);
    this.smoothGain.connect(stereoPanner);
    stereoPanner.connect(panner);
    panner.connect(this.compressor);

    // play sound for duration
    constants.smoothId = setTimeout(() => {
      panner.disconnect();
      this.smoothGain.disconnect();
      smoothOscillator.stop();
      smoothOscillator.disconnect();
      constants.isSmoothAutoplay = false;
    }, currentDuration * 1e3 * 2);
  }

  PlayNull() {
    console.log('playing null');
    let frequency = constants.NULL_FREQUENCY;
    let duration = constants.duration;
    let panning = 0;
    let vol = constants.vol;
    let wave = 'triangle';

    this.playOscillator(frequency, duration, panning, vol, wave);

    setTimeout(
      function (audioThis) {
        audioThis.playOscillator(
          (frequency * 23) / 24,
          duration,
          panning,
          vol,
          wave
        );
      },
      Math.round((duration / 5) * 1000),
      this
    );
  }

  playEnd() {
    // play a pleasent end chime. We'll use terminal chime from VSCode
    if (constants.canPlayEndChime) {
      let chimeClone = constants.endChime.cloneNode(true); // we clone so that we can trigger a tone while one is already playing
      /* 
             * the following (panning) only works if we're on a server
        let panning = 0;
        try {
            if ( constants.chartType == 'barplot' ) {
                panning = this.SlideBetween(position.x, 0, plot.bars.length-1, -1, 1);
            } else if ( constants.chartType == 'boxplot' ) {
                panning = this.SlideBetween(position.x, 0, plot.plotData[position.y].length-1, -1, 1);
            } else if ( constants.chartType == 'heatmap' ) {
                panning = this.SlideBetween(position.x, 0, plot.num_cols-1, -1, 1);
            } else if ( constants.chartType == 'scatterplot' ) {
                panning = this.SlideBetween(position.x, 0, plot.x.length-1, -1, 1);
            }
        } catch {
        }

        const track = this.audioContext.createMediaElementSource(chimeClone);
        const stereoNode = new StereoPannerNode(this.audioContext, {pan:panning} );
        track.connect(stereoNode).connect(this.audioContext.destination);
        */
      chimeClone.play();
      chimeClone = null;
    }
  }

  KillSmooth() {
    if (constants.smoothId) {
      this.smoothGain.gain.cancelScheduledValues(0);
      this.smoothGain.gain.exponentialRampToValueAtTime(
        0.0001,
        this.audioContext.currentTime + 0.03
      );

      clearTimeout(constants.smoothId);

      constants.isSmoothAutoplay = false;
    }
  }

  SlideBetween(val, a, b, min, max) {
    // helper function that goes between min and max proportional to how val goes between a and b
    let newVal = ((val - a) / (b - a)) * (max - min) + min;
    return newVal;
  }
}

class Display {
  constructor() {
    this.infoDiv = constants.infoDiv;

    this.x = {};
    this.x.id = 'x';
    this.x.textBase = 'x-value: ';

    this.y = {};
    this.y.id = 'y';
    this.y.textBase = 'y-value: ';

    this.boxplotGridPlaceholders = [
      resources.GetString('lower_outlier'),
      resources.GetString('min'),
      resources.GetString('25'),
      resources.GetString('50'),
      resources.GetString('75'),
      resources.GetString('max'),
      resources.GetString('upper_outlier'),
    ];
  }

  toggleTextMode() {
    if (constants.textMode == 'off') {
      constants.textMode = 'terse';
    } else if (constants.textMode == 'terse') {
      constants.textMode = 'verbose';
    } else if (constants.textMode == 'verbose') {
      constants.textMode = 'off';
    }

    this.announceText(
      '<span aria-hidden="true">Text mode:</span> ' + constants.textMode
    );
  }

  toggleBrailleMode(onoff) {
    if (constants.chartType == 'scatterplot' && constants.layer == 1) {
      this.announceText('Braille is not supported in point layer.');
      return;
    }
    if (typeof onoff === 'undefined') {
      onoff = constants.brailleMode == 'on' ? 'off' : 'on';
    }
    if (onoff == 'on') {
      if (constants.chartType == 'boxplot') {
        // braille mode is on before any plot is selected
        if (
          constants.plotOrientation != 'vert' &&
          position.x == -1 &&
          position.y == plot.plotData.length
        ) {
          position.x += 1;
          position.y -= 1;
        } else if (
          constants.plotOrientation == 'vert' &&
          position.x == 0 &&
          position.y == plot.plotData[0].length - 1
        ) {
          // do nothing; don't think there's any problem
        }
      }

      constants.brailleMode = 'on';
      constants.brailleInput.classList.remove('hidden');
      constants.brailleInput.focus();
      constants.brailleInput.setSelectionRange(position.x, position.x);

      this.SetBraille(plot);

      if (constants.chartType == 'heatmap') {
        let pos = position.y * (plot.num_cols + 1) + position.x;
        constants.brailleInput.setSelectionRange(pos, pos);
      }

      // braille mode is on before navigation of svg
      // very important to make sure braille works properly
      if (position.x == -1 && position.y == -1) {
        constants.brailleInput.setSelectionRange(0, 0);
      }
    } else {
      constants.brailleMode = 'off';
      constants.brailleInput.classList.add('hidden');

      if (constants.review_container) {
        if (!constants.review_container.classList.contains('hidden')) {
          constants.review.focus();
        } else {
          constants.svg.focus();
        }
      } else {
        constants.svg.focus();
      }
    }

    this.announceText('Braille ' + constants.brailleMode);
  }

  toggleSonificationMode() {
    if (constants.chartType == 'scatterplot' && constants.layer == 1) {
      if (constants.sonifMode == 'off') {
        constants.sonifMode = 'sep';
        this.announceText(resources.GetString('son_sep'));
      } else if (constants.sonifMode == 'sep') {
        constants.sonifMode = 'same';
        this.announceText(resources.GetString('son_same'));
      } else if (constants.sonifMode == 'same') {
        constants.sonifMode = 'off';
        this.announceText(resources.GetString('son_off'));
      }
    } else {
      if (constants.sonifMode == 'off') {
        constants.sonifMode = 'on';
        this.announceText(resources.GetString('son_on'));
      } else {
        constants.sonifMode = 'off';
        this.announceText(resources.GetString('son_off'));
      }
    }
  }

  toggleLayerMode() {
    if (constants.layer == 1) {
      constants.layer = 2;
      this.announceText('Layer 2: Smoothed line');
    } else if (constants.layer == 2) {
      constants.layer = 1;
      this.announceText('Layer 1: Point');
    }
  }

  announceText(txt) {
    constants.announceContainer.innerHTML = txt;
  }

  UpdateBraillePos() {
    if (constants.chartType == 'barplot') {
      constants.brailleInput.setSelectionRange(position.x, position.x);
    } else if (constants.chartType == 'heatmap') {
      let pos = position.y * (plot.num_cols + 1) + position.x;
      constants.brailleInput.setSelectionRange(pos, pos);
    } else if (constants.chartType == 'boxplot') {
      // on boxplot we extend characters a lot and have blanks, so we go to our label
      let sectionPos =
        constants.plotOrientation == 'vert' ? position.y : position.x;
      let targetLabel = this.boxplotGridPlaceholders[sectionPos];
      let haveTargetLabel = false;
      let adjustedPos = 0;
      if (constants.brailleData) {
        for (let i = 0; i < constants.brailleData.length; i++) {
          if (constants.brailleData[i].type != 'blank') {
            if (
              resources.GetString(constants.brailleData[i].label) == targetLabel
            ) {
              haveTargetLabel = true;
              break;
            }
          }
          adjustedPos += constants.brailleData[i].numChars;
        }
      } else {
        throw 'Braille data not set up, cannot move cursor in braille, sorry.';
      }
      // but sometimes we don't have our targetLabel, go to the start
      // future todo: look for nearby label and go to the nearby side of that
      if (!haveTargetLabel) {
        adjustedPos = 0;
      }

      constants.brailleInput.setSelectionRange(adjustedPos, adjustedPos);
    } else if (constants.chartType == 'scatterplot') {
      constants.brailleInput.setSelectionRange(positionL1.x, positionL1.x);
    }
  }

  displayValues(plot) {
    // we build an html text string to output to both visual users and aria live based on what chart we're on, our position, and the mode
    // note: we do this all as one string rather than changing individual element IDs so that aria-live receives a single update

    let output = '';
    let verboseText = '';
    let reviewText = '';
    if (constants.chartType == 'barplot') {
      // {legend x} is {colname x}, {legend y} is {value y}
      verboseText =
        plot.plotLegend.x +
        ' is ' +
        plot.columnLabels[position.x] +
        ', ' +
        plot.plotLegend.y +
        ' is ' +
        plot.plotData[position.x];
      if (constants.textMode == 'off') {
        // do nothing :D
      } else if (constants.textMode == 'terse') {
        // {colname} {value}
        output +=
          '<p>' +
          plot.columnLabels[position.x] +
          ' ' +
          plot.plotData[position.x] +
          '</p>\n';
      } else if (constants.textMode == 'verbose') {
        output += '<p>' + verboseText + '</p>\n';
      }
    } else if (constants.chartType == 'heatmap') {
      // col name and value
      if (constants.navigation == 1) {
        verboseText +=
          plot.x_group_label +
          ' ' +
          plot.x_labels[position.x] +
          ', ' +
          plot.y_group_label +
          ' ' +
          plot.y_labels[position.y] +
          ', ' +
          plot.box_label +
          ' is ';
        if (constants.hasRect) {
          verboseText += plot.plotData[2][position.y][position.x];
        }
      } else {
        verboseText +=
          plot.y_group_label +
          ' ' +
          plot.y_labels[position.y] +
          ', ' +
          plot.x_group_label +
          ' ' +
          plot.x_labels[position.x] +
          ', ' +
          plot.box_label +
          ' is ';
        if (constants.hasRect) {
          verboseText += plot.plotData[2][position.y][position.x];
        }
      }
      // terse and verbose alternate between columns and rows
      if (constants.textMode == 'off') {
        // do nothing :D
      } else if (constants.textMode == 'terse') {
        // value only
        if (constants.navigation == 1) {
          // column navigation
          output +=
            '<p>' +
            plot.x_labels[position.x] +
            ', ' +
            plot.plotData[2][position.y][position.x] +
            '</p>\n';
        } else {
          // row navigation
          output +=
            '<p>' +
            plot.y_labels[position.y] +
            ', ' +
            plot.plotData[2][position.y][position.x] +
            '</p>\n';
        }
      } else if (constants.textMode == 'verbose') {
        output += '<p>' + verboseText + '</p>\n';
      }
    } else if (constants.chartType == 'boxplot') {
      // setup
      let val = 0;
      let numPoints = 1;
      let isOutlier = false;
      let plotPos =
        constants.plotOrientation == 'vert' ? position.x : position.y;
      let sectionPos =
        constants.plotOrientation == 'vert' ? position.y : position.x;
      let textTerse = '';
      let textVerbose = '';

      if (
        plot.plotData[plotPos][sectionPos].label == 'lower_outlier' ||
        plot.plotData[plotPos][sectionPos].label == 'upper_outlier'
      ) {
        isOutlier = true;
      }
      if (plot.plotData[plotPos][sectionPos].type == 'outlier') {
        val = plot.plotData[plotPos][sectionPos].values.join(', ');
        if (plot.plotData[plotPos][sectionPos].values.length > 0) {
          numPoints = plot.plotData[plotPos][sectionPos].values.length;
        } else {
          numPoints = 0;
        }
      } else if (plot.plotData[plotPos][sectionPos].type == 'blank') {
        val = '';
        if (isOutlier) numPoints = 0;
      } else {
        if (constants.plotOrientation == 'vert') {
          val = plot.plotData[plotPos][sectionPos].y;
        } else {
          val = plot.plotData[plotPos][sectionPos].x;
        }
      }

      // set output

      // group label for verbose
      if (constants.navigation) {
        if (plot.x_group_label) textVerbose += plot.x_group_label;
      } else if (!constants.navigation) {
        if (plot.y_group_label) textVerbose += plot.y_group_label;
      }
      // and axis label
      if (constants.navigation) {
        if (plot.x_labels[plotPos]) {
          textVerbose += ' is ';
          textTerse += plot.x_labels[plotPos] + ', ';
          textVerbose += plot.x_labels[plotPos] + ', ';
        } else {
          textVerbose += ', ';
        }
      } else if (!constants.navigation) {
        if (plot.y_labels[plotPos]) {
          textVerbose += ' is ';
          textTerse += plot.y_labels[plotPos] + ', ';
          textVerbose += plot.y_labels[plotPos] + ', ';
        } else {
          textVerbose += ', ';
        }
      }
      // outliers
      if (isOutlier) {
        textTerse += numPoints + ' ';
        textVerbose += numPoints + ' ';
      }
      // label
      textVerbose += resources.GetString(
        plot.plotData[plotPos][sectionPos].label
      );
      if (numPoints == 1) textVerbose += ' is ';
      else {
        textVerbose += 's ';
        if (numPoints > 1) textVerbose += ' are ';
      }
      if (
        isOutlier ||
        (constants.navigation && constants.plotOrientation == 'horz') ||
        (!constants.navigation && constants.plotOrientation == 'vert')
      ) {
        textTerse += resources.GetString(
          plot.plotData[plotPos][sectionPos].label
        );

        // grammar
        if (numPoints != 1) {
          textTerse += 's';
        }
        textTerse += ' ';
      }
      // val
      if (plot.plotData[plotPos][sectionPos].type == 'blank' && !isOutlier) {
        textTerse += 'empty';
        textVerbose += 'empty';
      } else {
        textTerse += val;
        textVerbose += val;
      }

      verboseText = textVerbose; // yeah it's an extra var, who cares
      if (constants.textMode == 'verbose')
        output = '<p>' + textVerbose + '</p>\n';
      else if (constants.textMode == 'terse')
        output = '<p>' + textTerse + '</p>\n';
    } else if (constants.chartType == 'scatterplot') {
      if (constants.layer == 1) {
        // point layer
        verboseText +=
          plot.x_group_label +
          ' ' +
          plot.x[position.x] +
          ', ' +
          plot.y_group_label +
          ' [' +
          plot.y[position.x].join(', ') +
          ']';

        if (constants.textMode == 'off') {
          // do nothing
        } else if (constants.textMode == 'terse') {
          output +=
            '<p>' +
            plot.x[position.x] +
            ', ' +
            '[' +
            plot.y[position.x].join(', ') +
            ']' +
            '</p>\n';
        } else if (constants.textMode == 'verbose') {
          // set from verboseText
        }
      } else if (constants.layer == 2) {
        // best fit line layer
        verboseText +=
          plot.x_group_label +
          ' ' +
          plot.curveX[positionL1.x] +
          ', ' +
          plot.y_group_label +
          ' ' +
          plot.curvePoints[positionL1.x]; // verbose mode: x and y values

        if (constants.textMode == 'off') {
          // do nothing
        } else if (constants.textMode == 'terse') {
          // terse mode: gradient trend
          // output += '<p>' + plot.gradient[positionL1.x] + '<p>\n';

          // display absolute gradient of the graph
          output += '<p>' + plot.curvePoints[positionL1.x] + '<p>\n';
        } else if (constants.textMode == 'verbose') {
          // set from verboseText
        }
      }
      if (constants.textMode == 'verbose')
        output = '<p>' + verboseText + '</p>\n';
    }

    if (constants.infoDiv) constants.infoDiv.innerHTML = output;
    if (constants.review) {
      if (output.length > 0) {
        constants.review.value = output.replace(/<[^>]*>?/gm, '');
      } else {
        constants.review.value = verboseText;
      }
    }
  }

  displayXLabel(plot) {
    let xlabel = '';
    if (constants.chartType == 'barplot') {
      xlabel = plot.plotLegend.x;
    } else if (
      constants.chartType == 'heatmap' ||
      constants.chartType == 'boxplot' ||
      constants.chartType == 'scatterplot'
    ) {
      xlabel = plot.x_group_label;
    }
    if (constants.textMode == 'terse') {
      constants.infoDiv.innerHTML = '<p>' + xlabel + '<p>';
    } else if (constants.textMode == 'verbose') {
      constants.infoDiv.innerHTML = '<p>x label is ' + xlabel + '<p>';
    }
  }

  displayYLabel(plot) {
    let ylabel = '';
    if (constants.chartType == 'barplot') {
      ylabel = plot.plotLegend.y;
    } else if (
      constants.chartType == 'heatmap' ||
      constants.chartType == 'boxplot' ||
      constants.chartType == 'scatterplot'
    ) {
      ylabel = plot.y_group_label;
    }
    if (constants.textMode == 'terse') {
      constants.infoDiv.innerHTML = '<p>' + ylabel + '<p>';
    } else if (constants.textMode == 'verbose') {
      constants.infoDiv.innerHTML = '<p>y label is ' + ylabel + '<p>';
    }
  }

  displayTitle(plot) {
    if (constants.textMode == 'terse') {
      if (plot.title != '') {
        constants.infoDiv.innerHTML = '<p>' + plot.title + '<p>';
      } else {
        constants.infoDiv.innerHTML = '<p>Plot does not have a title.<p>';
      }
    } else if (constants.textMode == 'verbose') {
      if (plot.title != '') {
        constants.infoDiv.innerHTML = '<p>Title is ' + plot.title + '<p>';
      } else {
        constants.infoDiv.innerHTML = '<p>Plot does not have a title.<p>';
      }
    }
  }

  displayFill(plot) {
    if (constants.textMode == 'terse') {
      if (constants.chartType == 'heatmap') {
        constants.infoDiv.innerHTML = '<p>' + plot.box_label + '<p>';
      }
    } else if (constants.textMode == 'verbose') {
      if (constants.chartType == 'heatmap') {
        constants.infoDiv.innerHTML =
          '<p>Fill label is ' + plot.box_label + '<p>';
      }
    }
  }

  SetBraille(plot) {
    let brailleArray = [];

    if (constants.chartType == 'heatmap') {
      let range = (constants.maxY - constants.minY) / 3;
      let low = constants.minY + range;
      let medium = low + range;
      let high = medium + range;
      for (let i = 0; i < plot.y_coord.length; i++) {
        for (let j = 0; j < plot.x_coord.length; j++) {
          if (plot.values[i][j] == 0) {
            brailleArray.push('⠀');
          } else if (plot.values[i][j] <= low) {
            brailleArray.push('⠤');
          } else if (plot.values[i][j] <= medium) {
            brailleArray.push('⠒');
          } else {
            brailleArray.push('⠉');
          }
        }
        brailleArray.push('⠳');
      }
    } else if (constants.chartType == 'barplot') {
      let range = (constants.maxY - constants.minY) / 4;
      let low = constants.minY + range;
      let medium = low + range;
      let medium_high = medium + range;
      for (let i = 0; i < plot.plotData.length; i++) {
        if (plot.plotData[i] <= low) {
          brailleArray.push('⣀');
        } else if (plot.plotData[i] <= medium) {
          brailleArray.push('⠤');
        } else if (plot.plotData[i] <= medium_high) {
          brailleArray.push('⠒');
        } else {
          brailleArray.push('⠉');
        }
      }
    } else if (constants.chartType == 'scatterplot') {
      let range = (plot.curveMaxY - plot.curveMinY) / 4;
      let low = plot.curveMinY + range;
      let medium = low + range;
      let medium_high = medium + range;
      let high = medium_high + range;
      for (let i = 0; i < plot.curvePoints.length; i++) {
        if (plot.curvePoints[i] <= low) {
          brailleArray.push('⣀');
        } else if (plot.curvePoints[i] <= medium) {
          brailleArray.push('⠤');
        } else if (plot.curvePoints[i] <= medium_high) {
          brailleArray.push('⠒');
        } else if (plot.curvePoints[i] <= high) {
          brailleArray.push('⠉');
        }
      }
    } else if (constants.chartType == 'boxplot' && position.y > -1) {
      // only run if we're on a plot
      // Idea here is to use different braille characters to physically represent the boxplot
      // if sections are longer or shorter we'll add more characters
      // example: outlier, small space, long min, med 25/50/75, short max: ⠂ ⠒⠒⠒⠒⠒⠒⠿⠸⠿⠒
      //
      // So, we get weighted lengths of each section (or gaps between outliers, etc),
      // and then create the appropriate number of characters
      // Full explanation on readme
      //
      // This is messy and long (250 lines). If anyone wants to improve. Be my guest

      // First some prep work, we make an array of lengths and types that represent our plot
      let brailleData = [];
      let isBeforeMid = true;
      let plotPos =
        constants.plotOrientation == 'vert' ? position.x : position.y;
      let valCoord = constants.plotOrientation == 'vert' ? 'y' : 'x';
      for (let i = 0; i < plot.plotData[plotPos].length; i++) {
        let point = plot.plotData[plotPos][i];
        // pre clean up, we may want to remove outliers that share the same coordinates. Reasoning: We want this to visually represent the data, and I can't see 2 points on top of each other
        if (point.values && constants.visualBraille) {
          point.values = [...new Set(point.values)];
        }

        let nextPoint = null;
        let prevPoint = null;
        if (i < plot.plotData[plotPos].length - 1) {
          nextPoint = plot.plotData[plotPos][i + 1];
        }
        if (i > 0) {
          prevPoint = plot.plotData[plotPos][i - 1];
        }

        let charData = {};

        if (i == 0) {
          // first point, add space to next actual point
          let firstCoord = 0;
          for (let j = 0; j < plot.plotData[plotPos].length; j++) {
            // find next actual point
            if (valCoord in plot.plotData[plotPos][j]) {
              firstCoord = plot.plotData[plotPos][j][valCoord];
              break;
            }
          }
          charData = {};
          let minVal =
            constants.plotOrientation == 'vert'
              ? constants.minY
              : constants.minX;
          if (firstCoord - minVal > 0) {
            charData.length = firstCoord;
          } else {
            charData.length = 0;
          }
          if (charData.length < 0) charData.length = 0; // dunno why, but this happens sometimes
          charData.type = 'blank';
          charData.label = 'blank';
          brailleData.push(charData);
        }

        if (point.type == 'blank') {
          // this is a placeholder point, do nothing
        } else if (point.type == 'outlier') {
          // there might be lots of these or none

          // Spacing is messy:
          // isBeforeMid: no pre space, yes after space
          // ! isBeforeMid: yes pre space, no after space
          // either way add spaces in between outlier points

          // pre point space
          if (isBeforeMid) {
            // no pre space
          } else {
            // yes after space
            charData = {};
            charData.length = point.values[0] - prevPoint[valCoord];
            charData.type = 'blank';
            charData.label = 'blank';
            brailleData.push(charData);
          }

          // now add points with spaces in between
          for (var k = 0; k < point.values.length; k++) {
            if (k == 0) {
              charData = {};
              charData.length = 0;
              charData.type = 'outlier';
              charData.label = point.label;
              brailleData.push(charData);
            } else {
              charData = {};
              charData.length = point.values[k] - point.values[k - 1];
              charData.type = 'blank';
              charData.label = 'blank';
              brailleData.push(charData);

              charData = {};
              charData.length = 0;
              charData.type = 'outlier';
              charData.label = point.label;
              brailleData.push(charData);
            }
          }

          // after point space
          if (isBeforeMid) {
            // yes pre space
            charData = {};
            charData.length =
              nextPoint[valCoord] - point.values[point.values.length - 1];
            charData.type = 'blank';
            charData.label = 'blank';
            brailleData.push(charData);
          } else {
            // no after space
          }
        } else {
          if (point.label == '50') {
            // exception: another 0 width point here
            charData = {};
            charData.length = 0;
            charData.type = point.type;
            charData.label = point.label;
            brailleData.push(charData);

            isBeforeMid = false; // mark this as we pass
          } else {
            // normal points: we calc dist between this point and point closest to middle
            charData = {};
            if (isBeforeMid) {
              charData.length = nextPoint[valCoord] - point[valCoord];
            } else {
              charData.length = point[valCoord] - prevPoint[valCoord];
            }
            charData.type = point.type;
            charData.label = point.label;
            brailleData.push(charData);
          }
        }
        if (i == plot.plotData[plotPos].length - 1) {
          // last point gotta add ending space manually
          charData = {};
          let lastCoord = 0;
          for (let j = 0; j < plot.plotData[plotPos].length; j++) {
            // find last actual point

            if (point.type == 'outlier') {
              lastCoord = valCoord == 'y' ? point.yMax : point.xMax;
            } else if (valCoord in plot.plotData[plotPos][j]) {
              lastCoord = plot.plotData[plotPos][j][valCoord];
            }
          }
          charData.length =
            valCoord == 'y'
              ? constants.maxY - lastCoord
              : constants.maxX - lastCoord;
          charData.type = 'blank';
          charData.label = 'blank';
          brailleData.push(charData);
        }
      }
      // cleanup
      for (let i = 0; i < brailleData.length; i++) {
        // A bit of rounding to account for floating point errors
        brailleData[i].length = Math.round(brailleData[i].length); // we currently just use rounding to whole number (pixel), but if other rounding is needed add it here
      }

      // We create a set of braille characters based on the lengths

      // Method:
      // We normalize the lengths of each characters needed length
      // by the total number of characters we have availble
      // (including offset from characters requiring 1 character).
      // Then apply the appropriate number of characters to each

      // A few exceptions:
      // exception: each must have min 1 character (not blanks or length 0)
      // exception: for 25/75 and min/max, if they aren't exactly equal, assign different num characters
      // exception: center is always 456 123

      // Step 1, prepopulate each section with a single character, and log for character offset
      let locMin = -1;
      let locMax = -1;
      let loc25 = -1;
      let loc75 = -1;
      let numDefaultChars = 0;
      for (let i = 0; i < brailleData.length; i++) {
        if (
          brailleData[i].type != 'blank' &&
          (brailleData[i].length > 0 || brailleData[i].type == 'outlier')
        ) {
          brailleData[i].numChars = 1;
          numDefaultChars++;
        } else {
          brailleData[i].numChars = 0;
        }

        // store 25/75 min/max locations so we can check them later more easily
        if (brailleData[i].label == 'min' && brailleData[i].length > 0)
          locMin = i;
        if (brailleData[i].label == 'max' && brailleData[i].length > 0)
          locMax = i;
        if (brailleData[i].label == '25') loc25 = i;
        if (brailleData[i].label == '75') loc75 = i;

        // 50 gets 2 characters by default
        if (brailleData[i].label == '50') {
          brailleData[i].numChars = 2;
          numDefaultChars++;
        }
      }
      // add extras to 25/75 min/max if needed
      let currentPairs = ['25', '75'];
      if (locMin > -1 && locMax > -1) {
        currentPairs.push('min'); // we add these seperately because we don't always have both min and max
        currentPairs.push('max');
        if (brailleData[locMin].length != brailleData[locMax].length) {
          if (brailleData[locMin].length > brailleData[locMax].length) {
            // make sure if they're different, they appear different
            brailleData[locMin].numChars++;
            numDefaultChars++;
          } else {
            brailleData[locMax].numChars++;
            numDefaultChars++;
          }
        }
      }
      if (brailleData[loc25].length != brailleData[loc75].length) {
        if (brailleData[loc25].length > brailleData[loc75].length) {
          brailleData[loc25].numChars++;
          numDefaultChars++;
        } else {
          brailleData[loc75].numChars++;
          numDefaultChars++;
        }
      }

      // Step 2: normalize and allocate remaining characters and add to our main braille array
      let charsAvailable = constants.brailleDisplayLength - numDefaultChars;
      let allocateCharacters = this.AllocateCharacters(
        brailleData,
        charsAvailable
      );
      for (let i = 0; i < allocateCharacters.length; i++) {
        if (allocateCharacters[i]) {
          brailleData[i].numChars += allocateCharacters[i];
        }
      }

      constants.brailleData = brailleData;
      if (constants.debugLevel > 5) {
        console.log('plotData[i]', plot.plotData[plotPos]);
        console.log('brailleData', brailleData);
      }

      // convert to braille characters
      for (let i = 0; i < brailleData.length; i++) {
        for (let j = 0; j < brailleData[i].numChars; j++) {
          let brailleChar = '⠀'; // blank
          if (brailleData[i].label == 'min' || brailleData[i].label == 'max') {
            brailleChar = '⠒';
          } else if (
            brailleData[i].label == '25' ||
            brailleData[i].label == '75'
          ) {
            brailleChar = '⠿';
          } else if (brailleData[i].label == '50') {
            if (j == 0) {
              brailleChar = '⠸';
            } else {
              brailleChar = '⠇';
            }
          } else if (brailleData[i].type == 'outlier') {
            brailleChar = '⠂';
          }
          brailleArray.push(brailleChar);
        }
      }
    }

    constants.brailleInput.value = brailleArray.join('');

    constants.brailleInput.value = brailleArray.join('');
    if (constants.debugLevel > 5) {
      console.log('braille:', constants.brailleInput.value);
    }

    this.UpdateBraillePos();
  }

  CharLenImpact(charData) {
    return charData.length / charData.numChars;
  }

  /**
   * This function allocates a total number of characters among an array of lengths,
   * proportionally to each length.
   *
   * @param {Array} arr - The array of lengths. Each length should be a positive number.
   * @param {number} totalCharacters - The total number of characters to be allocated.
   *
   * The function first calculates the sum of all lengths in the array. Then, it
   * iterates over the array and calculates an initial allocation for each length,
   * rounded to the nearest integer, based on its proportion of the total length.
   *
   * If the sum of these initial allocations is not equal to the total number of
   * characters due to rounding errors, the function makes adjustments to the allocations.
   *
   * The adjustments are made in a loop that continues until the difference between
   * the total number of characters and the sum of the allocations is zero, or until
   * the loop has run a maximum number of iterations equal to the length of the array.
   *
   * In each iteration of the loop, the function calculates a rounding adjustment for
   * each length, again based on its proportion of the total length, and adds this
   * adjustment to the length's allocation.
   *
   * If there's still a difference after the maximum number of iterations, the function
   * falls back to a simpler method of distributing the difference: it sorts the lengths
   * by their allocations and adds or subtracts 1 from each length in this order until
   * the difference is zero.
   *
   * The function returns an array of the final allocations.
   *
   * @returns {Array} The array of allocations.
   */
  AllocateCharacters(arr, totalCharacters) {
    // init
    let allocation = [];
    let sumLen = 0;
    for (let i = 0; i < arr.length; i++) {
      sumLen += arr[i].length;
    }
    let notAllowed = ['lower_outlier', 'upper_outlier', '50'];

    // main allocation
    for (let i = 0; i < arr.length; i++) {
      if (!notAllowed.includes(arr[i].label)) {
        allocation[i] = Math.round((arr[i].length / sumLen) * totalCharacters);
      }
    }

    // did it work? check for differences
    let allocatedSum = allocation.reduce((a, b) => a + b, 0);
    let difference = totalCharacters - allocatedSum;

    // If there's a rounding error, add/subtract characters proportionally
    let maxIterations = arr.length; // inf loop handler :D
    while (difference !== 0 && maxIterations > 0) {
      // (same method as above)
      for (let i = 0; i < arr.length; i++) {
        if (!notAllowed.includes(arr[i].label)) {
          allocation[i] += Math.round((arr[i].length / sumLen) * difference);
        }
      }
      allocatedSum = allocation.reduce((a, b) => a + b, 0);
      difference = totalCharacters - allocatedSum;

      maxIterations--;
    }

    // if there's still a rounding error after max iterations, fuck it, just distribute it evenly
    if (difference !== 0) {
      // create an array of indices sorted low to high based on current allocations
      let indices = [];
      for (let i = 0; i < arr.length; i++) {
        indices.push(i);
      }
      indices.sort((a, b) => allocation[a] - allocation[b]);

      // if we need to add or remove characters, do so from the beginning
      let plusminus = -1; // add or remove?
      if (difference > 0) {
        plusminus = 1;
      }
      let i = 0;
      let maxIterations = indices.length * 3; // run it for a while just in case
      while (difference > 0 && maxIterations > 0) {
        allocation[indices[i]] += plusminus;
        difference += -plusminus;

        i += 1;
        // loop back to start if we end
        if (i >= indices.length) {
          i = 0;
        }

        maxIterations += -1;
      }
    }

    return allocation;
  }
}

class BarChart {
  constructor() {
    // bars. The actual bar elements in the SVG. Used to highlight visually
    if ('elements' in maidr) {
      this.bars = maidr.elements;
      constants.hasRect = 1;
    } else {
      this.bars = document.querySelectorAll('g[id^="geom_rect"] > rect');
      constants.hasRect = 0;
    }

    // column labels, both legend and tick
    this.columnLabels = [];
    let legendX = '';
    let legendY = '';
    if ('axis' in maidr) {
      // legend labels
      if (maidr.axis.x) {
        if (maidr.axis.x.label) {
          legendX = maidr.axis.x.label;
        }
      }
      if (maidr.axis.y) {
        if (maidr.axis.y.label) {
          legendY = maidr.axis.y.label;
        }
      }

      // tick labels
      if (maidr.axis.x) {
        if (maidr.axis.x.format) {
          this.columnLabels = maidr.axis.x.format;
        }
      }
      if (maidr.axis.y) {
        if (maidr.axis.y.format) {
          this.columnLabels = maidr.axis.y.format;
        }
      }
    } else {
      // legend labels
      if (document.querySelector('g[id^="xlab"] tspan')) {
        legendX = document.querySelector('g[id^="xlab"] tspan').innerHTML;
      }
      if (document.querySelector('g[id^="ylab"] tspan')) {
        legendY = document.querySelector('g[id^="ylab"] tspan').innerHTML;
      }

      // tick labels
      this.columnLabels = this.ParseInnerHTML(
        document.querySelectorAll(
          'g:not([id^="xlab"]):not([id^="ylab"]) > g > g > g > text[text-anchor="middle"]'
        )
      );
    }

    this.plotLegend = {
      x: legendX,
      y: legendY,
    };

    // title, either pulled from data or from the SVG
    this.title = '';
    if ('title' in maidr) {
      this.title = maidr.title;
    } else if (document.querySelector('g[id^="plot.title..titleGrob"] tspan')) {
      this.title = document.querySelector(
        'g[id^="plot.title..titleGrob"] tspan'
      ).innerHTML;
      this.title = this.title.replace('\n', '').replace(/ +(?= )/g, ''); // there are multiple spaces and newlines, sometimes
    }

    if (typeof maidr == 'array') {
      this.plotData = maidr;
    } else if (typeof maidr == 'object') {
      if ('data' in maidr) {
        this.plotData = maidr.data;
      }
    } else {
      // TODO: throw error
    }

    // set the max and min values for the plot
    this.SetMaxMin();

    this.autoplay = null;
  }

  SetMaxMin() {
    for (let i = 0; i < this.plotData.length; i++) {
      if (i == 0) {
        constants.maxY = this.plotData[i];
        constants.minY = this.plotData[i];
      } else {
        if (this.plotData[i] > constants.maxY) {
          constants.maxY = this.plotData[i];
        }
        if (this.plotData[i] < constants.minY) {
          constants.minY = this.plotData[i];
        }
      }
    }
    constants.maxX = this.columnLabels.length;
  }

  GetLegendFromManualData() {
    let legend = {};

    legend.x = barplotLegend.x;
    legend.y = barplotLegend.y;

    return legend;
  }

  GetData() {
    // set height for each bar

    let plotData = [];

    if (this.bars) {
      for (let i = 0; i < this.bars.length; i++) {
        plotData.push(this.bars[i].getAttribute('height'));
      }
    }

    return plotData;
  }

  GetColumns() {
    // get column names
    // the pattern seems to be a <tspan> with dy="10", but check this for future output (todo)

    let columnLabels = [];
    let els = document.querySelectorAll('tspan[dy="10"]'); // todo, generalize this selector
    for (var i = 0; i < els.length; i++) {
      columnLabels.push(els[i].innerHTML);
    }

    return columnLabels;
  }

  GetLegend() {
    let legend = {};
    let els = document.querySelectorAll('tspan[dy="12"]'); // todo, generalize this selector
    legend.x = els[1].innerHTML;
    legend.y = els[0].innerHTML;

    return legend;
  }

  ParseInnerHTML(els) {
    // parse innerHTML of elements
    let parsed = [];
    for (var i = 0; i < els.length; i++) {
      parsed.push(els[i].innerHTML);
    }
    return parsed;
  }

  Select() {
    this.DeselectAll();
    if (this.bars) {
      this.bars[position.x].style.fill = constants.colorSelected;
    }
  }

  DeselectAll() {
    if (this.bars) {
      for (let i = 0; i < this.bars.length; i++) {
        this.bars[i].style.fill = constants.colorUnselected;
      }
    }
  }
}

//
// BoxPlot class.
// This initializes and contains the JSON data model for this chart
//
class BoxPlot {
  constructor() {
    constants.plotId = 0;

    constants.plotOrientation = 'horz'; // default
    if (typeof maidr !== 'undefined') {
      constants.plotOrientation = maidr.orientation;
    }

    if (
      document.querySelector('g[id^="panel"] > g[id^="geom_boxplot.gTree"]')
    ) {
      constants.plotId = document
        .querySelector('g[id^="panel"] > g[id^="geom_boxplot.gTree"]')
        .getAttribute('id');
    }

    if (constants.manualData) {
      // title
      let boxplotTitle = '';
      if (typeof maidr !== 'undefined' && typeof maidr.title !== 'undefined') {
        boxplotTitle = maidr.title;
      } else if (document.querySelector('tspan[dy="9.45"]')) {
        boxplotTitle = document.querySelector('tspan[dy="9.45"]').innerHTML;
        boxplotTitle = boxplotTitle.replace('\n', '').replace(/ +(?= )/g, ''); // there are multiple spaces and newlines, sometimes
      }
      this.title =
        typeof boxplotTitle !== 'undefined' && typeof boxplotTitle != null
          ? boxplotTitle
          : '';

      // axis labels
      if (typeof maidr !== 'undefined') {
        this.x_group_label = maidr.x_group_label;
      } else {
        this.x_group_label = document.querySelector(
          'text:not([transform^="rotate"]) > tspan[dy="7.88"]'
        ).innerHTML;
      }
      if (typeof maidr !== 'undefined') {
        this.y_group_label = maidr.y_group_label;
      } else {
        this.y_group_label = document.querySelector(
          'text[transform^="rotate"] > tspan[dy="7.88"]'
        ).innerHTML;
      }

      // x y tick labels
      let labels = [];
      if (typeof maidr !== 'undefined') {
        this.x_labels = maidr.x_labels;
        this.y_labels = maidr.y_labels;
      } else {
        let elDy = '3.15';
        if (constants.plotOrientation == 'vert') {
          elDy = '6.3';
        }
        let els = document.querySelectorAll('tspan[dy="' + elDy + '"]');
        for (let i = 0; i < els.length; i++) {
          labels.push(els[i].innerHTML.trim());
        }
        if (constants.plotOrientation == 'vert') {
          this.x_labels = labels;
          this.y_labels = [];
        } else {
          this.x_labels = [];
          this.y_labels = labels;
        }
      }

      // main data
      if (typeof maidr !== 'undefined') {
        this.plotData = maidr.data;
      } else {
        this.plotData = maidr;
      }
    } else {
      this.x_group_label = document.getElementById(
        'GRID.text.199.1.1.tspan.1'
      ).innerHTML;
      this.y_group_label = document.getElementById(
        'GRID.text.202.1.1.tspan.1'
      ).innerHTML;
      if (constants.plotOrientation == 'vert') {
        this.x_labels = this.GetLabels();
        this.y_labels = [];
      } else {
        this.x_labels = [];
        this.y_labels = this.GetLabels();
      }
      this.plotData = this.GetData(); // main json data
    }

    if (constants.plotId) {
      this.plotBounds = this.GetPlotBounds(constants.plotId); // bound data
      constants.hasRect = true;
    } else {
      constants.hasRect = false;
    }

    this.CleanData();
  }

  GetLabels() {
    let labels = [];
    let query = 'tspan[dy="5"]';
    let els = document.querySelectorAll(query);
    for (let i = 0; i < els.length; i++) {
      labels.push(els[i].innerHTML.trim());
    }
    return labels;
  }

  CleanData() {
    // we manually input data, so now we need to clean it up and set other vars

    if (constants.plotOrientation == 'vert') {
      constants.minY = 0;
      constants.maxY = 0;
      for (let i = 0; i < this.plotData.length; i++) {
        // each plot
        for (let j = 0; j < this.plotData[i].length; j++) {
          // each section in plot
          let point = this.plotData[i][j];
          if (point.hasOwnProperty('y')) {
            if (point.y < constants.minY) {
              constants.yMin = point.y;
            }
            if (point.hasOwnProperty('yMax')) {
              if (point.yMax > constants.maxY) {
                constants.maxY = point.yMax;
              }
            } else {
              if (point.y > constants.maxY) {
                constants.maxY = point.y;
              }
            }
          }
          if (point.hasOwnProperty('x')) {
            if (point.x < constants.minX) {
              constants.minX = point.x;
            }
            if (point.x > constants.maxX) {
              constants.maxX = point.x;
            }
          }
        }
      }
    } else {
      constants.minX = 0;
      constants.maxX = 0;
      for (let i = 0; i < this.plotData.length; i++) {
        // each plot
        for (let j = 0; j < this.plotData[i].length; j++) {
          // each section in plot
          let point = this.plotData[i][j];
          if (point.hasOwnProperty('x')) {
            if (point.x < constants.minX) {
              constants.xMin = point.x;
            }
            if (point.hasOwnProperty('xMax')) {
              if (point.xMax > constants.maxX) {
                constants.maxX = point.xMax;
              }
            } else {
              if (point.x > constants.maxX) {
                constants.maxX = point.x;
              }
            }
          }
          if (point.hasOwnProperty('y')) {
            if (point.y < constants.minY) {
              constants.minY = point.y;
            }
            if (point.y > constants.maxY) {
              constants.maxY = point.y;
            }
          }
        }
      }
    }
  }

  GetData() {
    // data in svg is formed as nested <g> elements. Loop through and get all point data
    // goal is to get bounding x values and type (outlier, whisker, range, placeholder)

    let plotData = [];

    let plots = document.getElementById(constants.plotId).children;
    for (let i = 0; i < plots.length; i++) {
      // each plot

      let sections = plots[i].children;
      let points = [];
      for (let j = 0; j < sections.length; j++) {
        // each segment (outlier, whisker, etc)
        // get segments for this section, there are 2 each
        // sometimes they're 0, so ignore those TODO
        let segments = sections[j].children;
        for (let k = 0; k < segments.length; k++) {
          let segment = segments[k];

          let segmentType = this.GetBoxplotSegmentType(
            sections[j].getAttribute('id')
          );
          let segmentPoints = this.GetBoxplotSegmentPoints(
            segment,
            segmentType
          );

          for (let l = 0; l < segmentPoints.length; l += 2) {
            if (
              segmentType == 'whisker' &&
              l == 0 &&
              constants.plotOrientation == 'vert'
            ) {
            } else {
              let thisPoint = {
                x: Number(segmentPoints[l]),
                y: Number(segmentPoints[l + 1]),
                type: segmentType,
              };
              if (thisPoint.y > constants.maxY) constants.maxY = thisPoint.y;
              points.push(thisPoint);
            }
          }
        }
      }

      // post processing
      // Sort this plot
      points.sort(function (a, b) {
        if (constants.plotOrientation == 'vert') {
          return a.y - b.y;
        } else {
          return a.x - b.x;
        }
      });

      if (constants.plotOrientation == 'horz') {
        // and remove whisker from range dups
        let noDupPoints = [];
        for (let d = 0; d < points.length; d++) {
          if (d > 0) {
            if (points[d - 1].x == points[d].x) {
              if (points[d - 1].type == 'whisker') {
                noDupPoints.splice(-1, 1);
                noDupPoints.push(points[d]);
              } else {
              }
            } else {
              noDupPoints.push(points[d]);
            }
          } else {
            noDupPoints.push(points[d]);
          }
        }
        points = noDupPoints;
      }

      plotData.push(points);
    }

    // put plots in order
    plotData.sort(function (a, b) {
      if (constants.plotOrientation == 'vert') {
        return a[0].x - b[0].x;
      } else {
        return a[0].y - b[0].y;
      }
    });

    // combine outliers into a single object for easier display
    // info to grab: arr of values=y's or x's, y or x = ymin or xmin, yn xn = ymax xmax. The rest can stay as is
    for (let i = 0; i < plotData.length; i++) {
      let section = plotData[i];
      // loop through points and find outliers
      let outlierGroup = [];
      for (let j = 0; j < section.length + 1; j++) {
        let runProcessOutliers = false; // run if we're past outliers (catching the first set), or if we're at the end (catching the last set)
        if (j == section.length) {
          runProcessOutliers = true;
        } else if (section[j].type != 'outlier') {
          runProcessOutliers = true;
        }
        if (!runProcessOutliers) {
          // add this to the group and continue
          outlierGroup.push(section[j]);
        } else if (outlierGroup.length > 0) {
          // process!! This is the main bit of work done
          let vals = [];
          for (let k = 0; k < outlierGroup.length; k++) {
            // save array of values
            if (constants.plotOrientation == 'vert') {
              vals.push(outlierGroup[k].y);
            } else {
              vals.push(outlierGroup[k].x);
            }

            // We're only keeping 1 outlier value, so mark all others to delete after we're done processing
            if (k > 0) {
              plotData[i][j + k - outlierGroup.length].type = 'delete';
            }
          }

          // save data
          if (constants.plotOrientation == 'vert') {
            plotData[i][j - outlierGroup.length].y = outlierGroup[0].y;
            plotData[i][j - outlierGroup.length].yMax =
              outlierGroup[outlierGroup.length - 1].y;
          } else {
            plotData[i][j - outlierGroup.length].x = outlierGroup[0].x;
            plotData[i][j - outlierGroup.length].xMax =
              outlierGroup[outlierGroup.length - 1].x;
          }
          plotData[i][j - outlierGroup.length].values = vals;

          // reset for next set
          outlierGroup = [];
        }
      }
    }
    // clean up from the above outlier processing
    let cleanData = [];
    for (let i = 0; i < plotData.length; i++) {
      cleanData[i] = [];
      for (let j = 0; j < plotData[i].length; j++) {
        if (plotData[i][j].type != 'delete') {
          cleanData[i][j] = plotData[i][j];
        }
      }
      cleanData[i] = cleanData[i].filter(function () {
        return true;
      });
    }
    plotData = cleanData;

    // add labeling for display
    for (let i = 0; i < plotData.length; i++) {
      // each boxplot section
      let rangeCounter = 0;
      for (let j = 0; j < plotData[i].length; j++) {
        let point = plotData[i][j];
        // each point, decide based on position with respect to range
        if (point.type == 'outlier') {
          if (rangeCounter > 0) {
            plotData[i][j].label = resources.GetString('upper_outlier');
          } else {
            plotData[i][j].label = resources.GetString('lower_outlier');
          }
        } else if (point.type == 'whisker') {
          if (rangeCounter > 0) {
            plotData[i][j].label = resources.GetString('max');
          } else {
            plotData[i][j].label = resources.GetString('min');
          }
        } else if (point.type == 'range') {
          if (rangeCounter == 0) {
            plotData[i][j].label = resources.GetString('25');
          } else if (rangeCounter == 1) {
            plotData[i][j].label = resources.GetString('50');
          } else if (rangeCounter == 2) {
            plotData[i][j].label = resources.GetString('75');
          }
          rangeCounter++;
        }
      }
    }

    // often a plot doesn't have various sections.
    // we expect outlier - min - 25 - 50 - 75 - max - outlier
    // add blank placeholders where they don't exist for better vertical navigation
    let allWeNeed = this.GetAllSegmentTypes();
    for (let i = 0; i < plotData.length; i++) {
      if (plotData[i].length == 7) {
        // skip, this one has it all. The rare boi
      } else {
        let whatWeGot = []; // we'll get a set of labels that we have so we can find what's missing
        for (let j = 0; j < plotData[i].length; j++) {
          whatWeGot.push(plotData[i][j].label);
        }

        // add missing stuff where it should go. We use .label as the user facing var (todo, might be a mistake, maybe use .type?)
        for (let j = 0; j < allWeNeed.length; j++) {
          if (!whatWeGot.includes(allWeNeed[j])) {
            // add a blank where it belongs
            let blank = { type: 'blank', label: allWeNeed[j] };
            plotData[i].splice(j, 0, blank);
            whatWeGot.splice(j, 0, allWeNeed[j]);
          }
        }
      }
    }

    // update 50% value as a midpoint of 25 and 75
    for (let i = 0; i < plotData.length; i++) {
      plotData[i][3].y = Math.round((plotData[i][2].y + plotData[i][4].y) / 2);
    }

    if (constants.debugLevel > 1) {
      console.log('plotData:', plotData);
    }

    return plotData;
  }

  GetPlotBounds(plotId) {
    // we fetch the elements in our parent, and similar to GetData we run through and get bounding boxes (or blanks) for everything, and store in an identical structure

    let plotBounds = [];
    let allWeNeed = this.GetAllSegmentTypes();
    let re = /(?:\d+(?:\.\d*)?|\.\d+)/g;

    // get initial set of elements, a parent element for all outliers, whiskers, and range
    let initialElemSet = [];
    let plots = document.getElementById(constants.plotId).children;
    for (let i = 0; i < plots.length; i++) {
      // each plot
      let plotSet = {};
      let sections = plots[i].children;
      for (let j = 0; j < sections.length; j++) {
        let elemType = this.GetBoxplotSegmentType(
          sections[j].getAttribute('id')
        );
        plotSet[elemType] = sections[j];
      }
      initialElemSet.push(plotSet);
    }

    // we build our structure based on the full set we need, and have blanks as placeholders
    // many of these overlap or are missing, so now we go through and make the actual array structure we need
    // like, all outliers are in 1 set, so we have to split those out and then get the bounding boxes
    for (let i = 0; i < initialElemSet.length; i++) {
      let plotBound = [];

      // we always have a range, and need those bounds to set others, so we'll do this first
      let rangeBounds = initialElemSet[i].range.getBoundingClientRect();

      // we get the midpoint from actual point values in the svg GRID.segments
      let midPoints = initialElemSet[i].range
        .querySelector('polyline[id^="GRID"]')
        .getAttribute('points')
        .match(re);
      let rangePoints = initialElemSet[i].range
        .querySelector('polygon[id^="geom_polygon"]')
        .getAttribute('points')
        .match(re);
      // get midpoint as percentage from bottom to mid to apply to bounding boxes
      // vert: top(rangePoints[1]) | mid(midPoints[1]) | bottom(rangePoints[3])
      // horz: top(rangePoints[0]) | mid(midPoints[0]) | bottom(rangePoints[2])
      let midPercent = 0;
      if (constants.plotOrientation == 'vert') {
        midPercent =
          (midPoints[1] - rangePoints[3]) / (rangePoints[1] - rangePoints[3]);
      } else {
        midPercent =
          (midPoints[0] - rangePoints[2]) / (rangePoints[0] - rangePoints[2]);
      }
      let midSize = 0;
      if (constants.plotOrientation == 'vert') {
        midSize = rangeBounds.height * midPercent;
      } else {
        midSize = rangeBounds.width * midPercent;
      }

      // set bounding box values
      // we critically need x / left, y / top, width, height. We can ignore the rest or let it be wrong

      // 25%
      plotBound[2] = this.convertBoundingClientRectToObj(rangeBounds);
      plotBound[2].label = allWeNeed[2];
      plotBound[2].type = 'range';
      if (constants.plotOrientation == 'vert') {
        plotBound[2].height = midSize;
        plotBound[2].top = plotBound[2].bottom - midSize;
        plotBound[2].y = plotBound[2].top;
      } else {
        plotBound[2].width = midSize;
      }
      // 50%
      plotBound[3] = this.convertBoundingClientRectToObj(rangeBounds);
      plotBound[3].label = allWeNeed[3];
      plotBound[3].type = 'range';
      if (constants.plotOrientation == 'vert') {
        plotBound[3].height = 0;
        plotBound[3].top = rangeBounds.bottom - midSize;
        plotBound[3].y = plotBound[3].top;
        plotBound[3].bottom = plotBound[3].top;
      } else {
        plotBound[3].width = 0;
        plotBound[3].left = rangeBounds.left + midSize;
      }
      // 75%
      plotBound[4] = this.convertBoundingClientRectToObj(rangeBounds);
      plotBound[4].label = allWeNeed[4];
      plotBound[4].type = 'range';
      if (constants.plotOrientation == 'vert') {
        plotBound[4].height = rangeBounds.height - midSize;
        plotBound[4].bottom = plotBound[3].top;
      } else {
        plotBound[4].width = rangeBounds.width - midSize;
        plotBound[4].left = plotBound[3].left;
      }

      // now the tricky ones, outliers and whiskers, if we have them
      if (Object.hasOwn(initialElemSet[i], 'whisker')) {
        // ok great we have a whisker. It could be just above or below or span across the range (in which case we need to split it up). Let's check
        let whiskerBounds = initialElemSet[i].whisker.getBoundingClientRect();
        let hasBelow = false;
        let hasAbove = false;
        if (constants.plotOrientation == 'vert') {
          if (whiskerBounds.bottom > rangeBounds.bottom) hasBelow = true;
          if (whiskerBounds.top < rangeBounds.top) hasAbove = true;
        } else {
          if (whiskerBounds.left < rangeBounds.left) hasBelow = true;
          if (whiskerBounds.right > rangeBounds.right) hasAbove = true;
        }

        // lower whisker
        if (hasBelow) {
          plotBound[1] = this.convertBoundingClientRectToObj(whiskerBounds);
          plotBound[1].label = allWeNeed[1];
          plotBound[1].type = 'whisker';
          if (constants.plotOrientation == 'vert') {
            plotBound[1].top = plotBound[2].bottom;
            plotBound[1].y = plotBound[1].top;
            plotBound[1].height = plotBound[1].bottom - plotBound[1].top;
          } else {
            plotBound[1].width = plotBound[2].left - plotBound[1].left;
          }
        } else {
          plotBound[1] = {};
          plotBound[1].label = allWeNeed[1];
          plotBound[1].type = 'blank';
        }
        // upper whisker
        if (hasAbove) {
          plotBound[5] = this.convertBoundingClientRectToObj(whiskerBounds);
          plotBound[5].label = allWeNeed[5];
          plotBound[5].type = 'whisker';
          if (constants.plotOrientation == 'vert') {
            plotBound[5].bottom = plotBound[4].top;
            plotBound[5].height = plotBound[5].bottom - plotBound[5].top;
          } else {
            plotBound[5].left = plotBound[4].right;
            plotBound[5].x = plotBound[4].right;
            plotBound[5].width = plotBound[5].right - plotBound[5].left;
          }
        } else {
          plotBound[5] = {};
          plotBound[5].label = allWeNeed[5];
          plotBound[5].type = 'blank';
        }
      }
      if (Object.hasOwn(initialElemSet[i], 'outlier')) {
        // we have one or more outliers.
        // Where do they appear? above or below the range? both?
        // we want to split them up and put 1 bounding box around each above and below

        let outlierElems = initialElemSet[i].outlier.children;
        let outlierUpperBounds = null;
        let outlierLowerBounds = null;
        for (let j = 0; j < outlierElems.length; j++) {
          // add this outlier's bounds, or expand if more than one
          let newOutlierBounds = outlierElems[j].getBoundingClientRect();

          if (constants.plotOrientation == 'vert') {
            if (newOutlierBounds.y < rangeBounds.y) {
              // higher, remember y=0 is at the bottom of the page
              if (!outlierUpperBounds) {
                outlierUpperBounds =
                  this.convertBoundingClientRectToObj(newOutlierBounds);
              } else {
                if (newOutlierBounds.y < outlierUpperBounds.y)
                  outlierUpperBounds.y = newOutlierBounds.y;
                if (newOutlierBounds.top < outlierUpperBounds.top)
                  outlierUpperBounds.top = newOutlierBounds.top;
                if (newOutlierBounds.bottom > outlierUpperBounds.bottom)
                  outlierUpperBounds.bottom = newOutlierBounds.bottom;
              }
            } else {
              if (!outlierLowerBounds) {
                outlierLowerBounds =
                  this.convertBoundingClientRectToObj(newOutlierBounds);
              } else {
                if (newOutlierBounds.y < outlierLowerBounds.y)
                  outlierLowerBounds.y = newOutlierBounds.y;
                if (newOutlierBounds.top < outlierLowerBounds.top)
                  outlierLowerBounds.top = newOutlierBounds.top;
                if (newOutlierBounds.bottom > outlierLowerBounds.bottom)
                  outlierLowerBounds.bottom = newOutlierBounds.bottom;
              }
            }
          } else {
            if (newOutlierBounds.x > rangeBounds.x) {
              // higher, remember x=0 is at the left of the page
              if (!outlierUpperBounds) {
                outlierUpperBounds =
                  this.convertBoundingClientRectToObj(newOutlierBounds);
              } else {
                if (newOutlierBounds.x < outlierUpperBounds.x)
                  outlierUpperBounds.x = newOutlierBounds.x;
                if (newOutlierBounds.left < outlierUpperBounds.left)
                  outlierUpperBounds.left = newOutlierBounds.left;
                if (newOutlierBounds.right > outlierUpperBounds.right)
                  outlierUpperBounds.right = newOutlierBounds.right;
              }
            } else {
              if (!outlierLowerBounds) {
                outlierLowerBounds =
                  this.convertBoundingClientRectToObj(newOutlierBounds);
              } else {
                if (newOutlierBounds.x < outlierLowerBounds.x)
                  outlierLowerBounds.x = newOutlierBounds.x;
                if (newOutlierBounds.left < outlierLowerBounds.left)
                  outlierLowerBounds.left = newOutlierBounds.left;
                if (newOutlierBounds.right > outlierLowerBounds.right)
                  outlierLowerBounds.right = newOutlierBounds.right;
              }
            }
          }
        }

        // now we add plotBound outlier stuff
        if (outlierLowerBounds) {
          outlierLowerBounds.height =
            outlierLowerBounds.bottom - outlierLowerBounds.top;
          outlierLowerBounds.width =
            outlierLowerBounds.right - outlierLowerBounds.left;

          plotBound[0] =
            this.convertBoundingClientRectToObj(outlierLowerBounds);
          plotBound[0].label = allWeNeed[0];
          plotBound[0].type = 'outlier';
        } else {
          plotBound[0] = {};
          plotBound[0].label = allWeNeed[0];
          plotBound[0].type = 'blank';
        }
        if (outlierUpperBounds) {
          outlierUpperBounds.height =
            outlierUpperBounds.bottom - outlierUpperBounds.top;
          outlierUpperBounds.width =
            outlierUpperBounds.right - outlierUpperBounds.left;

          plotBound[6] =
            this.convertBoundingClientRectToObj(outlierUpperBounds);
          plotBound[6].label = allWeNeed[6];
          plotBound[6].type = 'outlier';
        } else {
          plotBound[6] = {};
          plotBound[6].label = allWeNeed[6];
          plotBound[6].type = 'blank';
        }
      } else {
        // add all blanks
        plotBound[0] = {};
        plotBound[0].label = allWeNeed[0];
        plotBound[0].type = 'blank';
        plotBound[6] = {};
        plotBound[6].label = allWeNeed[6];
        plotBound[6].type = 'blank';
      }

      plotBounds.push(plotBound);
    }

    if (constants.debugLevel > 5) {
      console.log('plotBounds', plotBounds);
    }

    return plotBounds;
  }

  GetAllSegmentTypes() {
    let allWeNeed = [
      resources.GetString('lower_outlier'),
      resources.GetString('min'),
      resources.GetString('25'),
      resources.GetString('50'),
      resources.GetString('75'),
      resources.GetString('max'),
      resources.GetString('upper_outlier'),
    ];

    return allWeNeed;
  }

  GetBoxplotSegmentType(sectionId) {
    // Helper function for main GetData:
    // Fetch type, which comes from section id:
    // geom_polygon = range
    // GRID = whisker
    // points = outlier

    let segmentType = 'outlier'; // default? todo: should probably default null, and then throw error instead of return if not set after ifs
    if (sectionId.includes('geom_crossbar')) {
      segmentType = 'range';
    } else if (sectionId.includes('GRID')) {
      segmentType = 'whisker';
    } else if (sectionId.includes('points')) {
      segmentType = 'outlier';
    }

    return segmentType;
  }
  GetBoxplotSegmentPoints(segment, segmentType) {
    // Helper function for main GetData:
    // Fetch x and y point data from svg

    let re = /(?:\d+(?:\.\d*)?|\.\d+)/g;
    let pointString = '';
    let points = [];
    if (segmentType == 'range') {
      // ranges go a level deeper
      let matches = segment.children[0].getAttribute('points').match(re);
      points.push(matches[0], matches[1]);
      // the middle bar has 2 points but we just need one, check if they're the same
      if (matches[0] != matches[2]) {
        points.push(matches[2], matches[3]);
      }
    } else if (segmentType == 'outlier') {
      // outliers use x attr directly, but have multiple children
      points.push(segment.getAttribute('x'), segment.getAttribute('y'));
    } else {
      // whisker. Get first and third number from points attr
      // but sometimes it's null, giving the same for both, and don't add if that's true
      let matches = segment.getAttribute('points').match(re);
      if (constants.plotOrientation == 'vert') {
        if (matches[1] != matches[3]) {
          points.push(matches[0], matches[1], matches[2], matches[3]);
        }
      } else {
        if (matches[0] != matches[2]) {
          points.push(matches[0], matches[1], matches[2], matches[3]);
        }
      }
    }

    return points;
  }

  convertBoundingClientRectToObj(rect) {
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y,
    };
  }

  PlayTones(audio) {
    let plotPos = null;
    let sectionPos = null;
    if (constants.outlierInterval) clearInterval(constants.outlierInterval);
    if (constants.plotOrientation == 'vert') {
      plotPos = position.x;
      sectionPos = position.y;
    } else {
      plotPos = position.y;
      sectionPos = position.x;
    }
    if (plot.plotData[plotPos][sectionPos].type == 'blank') {
      audio.PlayNull();
    } else if (plot.plotData[plotPos][sectionPos].type != 'outlier') {
      audio.playTone();
    } else {
      // outlier(s): we play a run of tones
      position.z = 0;
      constants.outlierInterval = setInterval(function () {
        // play this tone
        audio.playTone();

        // and then set up for the next one
        position.z += 1;

        // and kill if we're done
        if (!Object.hasOwn(plot.plotData[plotPos][sectionPos], 'values')) {
          clearInterval(constants.outlierInterval);
          position.z = -1;
        } else if (
          position.z + 1 >
          plot.plotData[plotPos][sectionPos].values.length
        ) {
          clearInterval(constants.outlierInterval);
          position.z = -1;
        }
      }, constants.autoPlayOutlierRate);
    }
  }
}

// BoxplotRect class
// Initializes and updates the visual outline around sections of the chart
class BoxplotRect {
  // maybe put this stuff in user config?
  rectPadding = 15; // px
  rectStrokeWidth = 4; // px

  constructor() {
    this.x1 = 0;
    this.width = 0;
    this.y1 = 0;
    this.height = 0;
    this.svgOffsetLeft = constants.svg.getBoundingClientRect().left;
    this.svgOffsetTop = constants.svg.getBoundingClientRect().top;
  }

  UpdateRect() {
    // UpdateRect takes bounding box values from the object and gets bounds of visual outline to be drawn

    if (document.getElementById('highlight_rect'))
      document.getElementById('highlight_rect').remove(); // destroy to be recreated

    let plotPos = position.x;
    let sectionPos = position.y;
    if (constants.plotOrientation == 'vert') {
    } else {
      plotPos = position.y;
      sectionPos = position.x;
    }

    if (
      (constants.plotOrientation == 'vert' && position.y > -1) ||
      (constants.plotOrientation == 'horz' && position.x > -1)
    ) {
      // initial value could be -1, which throws errors, so ignore that

      let bounds = plot.plotBounds[plotPos][sectionPos];

      if (bounds.type != 'blank') {
        //let svgBounds = constants.svg.getBoundingClientRect();

        this.x1 = bounds.left - this.rectPadding - this.svgOffsetLeft;
        this.width = bounds.width + this.rectPadding * 2;
        this.y1 = bounds.top - this.rectPadding - this.svgOffsetTop;
        this.height = bounds.height + this.rectPadding * 2;

        if (constants.debugLevel > 5) {
          console.log(
            'Point',
            plot.plotData[plotPos][sectionPos].label,
            'bottom:',
            bounds.bottom,
            'top:',
            bounds.top
          );
          console.log(
            'x1:',
            this.x1,
            'y1:',
            this.y1,
            'width:',
            this.width,
            'height:',
            this.height
          );
        }

        this.CreateRectDisplay();
      }
    }
  }

  CreateRectDisplay() {
    // CreateRectDisplay takes bounding points and creates the visual outline

    const svgns = 'http://www.w3.org/2000/svg';
    let rect = document.createElementNS(svgns, 'rect');
    rect.setAttribute('id', 'highlight_rect');
    rect.setAttribute('x', this.x1);
    rect.setAttribute('y', this.y1); // y coord is inverse from plot data
    rect.setAttribute('width', this.width);
    rect.setAttribute('height', this.height);
    rect.setAttribute('stroke', constants.colorSelected);
    rect.setAttribute('stroke-width', this.rectStrokeWidth);
    rect.setAttribute('fill', 'none');
    constants.svg.appendChild(rect);
  }
}

class HeatMap {
  constructor() {
    if ('elements' in maidr) {
      this.plots = maidr.elements;
      constants.hasRect = 1;
    } else {
      this.plots = document.querySelectorAll('g[id^="geom_rect"] > rect');
      constants.hasRect = 0;
    }

    this.group_labels = this.getGroupLabels();
    this.x_labels = this.getXLabels();
    this.y_labels = this.getYLabels();
    this.title = this.getTitle();

    this.plotData = this.getHeatMapData();
    this.updateConstants();

    this.x_coord = this.plotData[0];
    this.y_coord = this.plotData[1];
    this.values = this.plotData[2];
    this.num_rows = this.plotData[3];
    this.num_cols = this.plotData[4];

    this.x_group_label = this.group_labels[0].trim();
    this.y_group_label = this.group_labels[1].trim();
    this.box_label = this.group_labels[2].trim();
  }

  getHeatMapData() {
    // get the x_coord and y_coord to check if a square exists at the coordinates
    let x_coord_check = [];
    let y_coord_check = [];

    let unique_x_coord = [];
    let unique_y_coord = [];
    if (constants.hasRect) {
      for (let i = 0; i < this.plots.length; i++) {
        if (this.plots[i]) {
          x_coord_check.push(parseFloat(this.plots[i].getAttribute('x')));
          y_coord_check.push(parseFloat(this.plots[i].getAttribute('y')));
        }
      }

      // sort the squares to access from left to right, up to down
      x_coord_check.sort(function (a, b) {
        return a - b;
      }); // ascending
      y_coord_check
        .sort(function (a, b) {
          return a - b;
        })
        .reverse(); // descending

      // get unique elements from x_coord and y_coord
      unique_x_coord = [...new Set(x_coord_check)];
      unique_y_coord = [...new Set(y_coord_check)];
    }

    // get num of rows, num of cols, and total numbers of squares
    let num_rows = 0;
    let num_cols = 0;
    let num_squares = 0;
    if ('data' in maidr) {
      num_rows = maidr.data.length;
      num_cols = maidr.data[0].length;
    } else {
      num_rows = unique_y_coord.length;
      num_cols = unique_x_coord.length;
    }
    num_squares = num_rows * num_cols;

    let norms = [];
    if ('data' in maidr) {
      norms = [...maidr.data];
    } else {
      norms = Array(num_rows)
        .fill()
        .map(() => Array(num_cols).fill(0));
      let min_norm = 3 * Math.pow(255, 2);
      let max_norm = 0;

      for (var i = 0; i < this.plots.length; i++) {
        var x_index = unique_x_coord.indexOf(x_coord_check[i]);
        var y_index = unique_y_coord.indexOf(y_coord_check[i]);
        let norm = this.getRGBNorm(i);
        norms[y_index][x_index] = norm;

        if (norm < min_norm) min_norm = norm;
        if (norm > max_norm) max_norm = norm;
      }
    }

    let plotData = [unique_x_coord, unique_y_coord, norms, num_rows, num_cols];

    return plotData;
  }

  updateConstants() {
    constants.minX = 0;
    constants.maxX = this.plotData[4];
    constants.minY = this.plotData[2][0][0]; // initial val
    constants.maxY = this.plotData[2][0][0]; // initial val
    for (let i = 0; i < this.plotData[2].length; i++) {
      for (let j = 0; j < this.plotData[2][i].length; j++) {
        if (this.plotData[2][i][j] < constants.minY)
          constants.minY = this.plotData[2][i][j];
        if (this.plotData[2][i][j] > constants.maxY)
          constants.maxY = this.plotData[2][i][j];
      }
    }
  }

  getRGBNorm(i) {
    let rgb_string = this.plots[i].getAttribute('fill');
    let rgb_array = rgb_string.slice(4, -1).split(',');
    // just get the sum of squared value of rgb, similar without sqrt, save computation
    return rgb_array
      .map(function (x) {
        return Math.pow(x, 2);
      })
      .reduce(function (a, b) {
        return a + b;
      });
  }

  getGroupLabels() {
    let labels_nodelist;
    let title = '';
    let legendX = '';
    let legendY = '';

    if ('title' in maidr) {
      title = maidr.title;
    } else {
      title = document.querySelector(
        'g[id^="guide.title"] text > tspan'
      ).innerHTML;
    }

    if ('axes' in maidr) {
      if ('x' in maidr.axes) {
        if ('label' in maidr.axes.x) {
          legendX = maidr.axes.x.label;
        }
      }
      if ('y' in maidr.axes) {
        if ('label' in maidr.axes.y) {
          legendY = maidr.axes.y.label;
        }
      }
    } else {
      legendX = document.querySelector('g[id^="xlab"] text > tspan').innerHTML;
      legendY = document.querySelector('g[id^="ylab"] text > tspan').innerHTML;
    }

    labels_nodelist = [legendX, legendY, title];

    return labels_nodelist;
  }

  getXLabels() {
    if ('axes' in maidr) {
      if ('x' in maidr.axes) {
        if ('format' in maidr.axes.x) {
          return maidr.axes.x.format;
        }
      }
    } else {
      let x_labels_nodelist;
      x_labels_nodelist = document.querySelectorAll('tspan[dy="10"]');
      let labels = [];
      for (let i = 0; i < x_labels_nodelist.length; i++) {
        labels.push(x_labels_nodelist[i].innerHTML.trim());
      }

      return labels;
    }
  }

  getYLabels() {
    if ('axes' in maidr) {
      if ('y' in maidr.axes) {
        if ('format' in maidr.axes.y) {
          return maidr.axes.y.format;
        }
      }
    } else {
      let y_labels_nodelist;
      let labels = [];
      y_labels_nodelist = document.querySelectorAll(
        'tspan[id^="GRID.text.19.1"]'
      );
      for (let i = 0; i < y_labels_nodelist.length; i++) {
        labels.push(y_labels_nodelist[i].innerHTML.trim());
      }

      return labels.reverse();
    }
  }

  getTitle() {
    if ('title' in maidr) {
      return maidr.title;
    } else {
      let heatmapTitle = document.querySelector(
        'g[id^="layout::title"] text > tspan'
      ).innerHTML;
      if (
        constants.manualData &&
        typeof heatmapTitle !== 'undefined' &&
        typeof heatmapTitle != null
      ) {
        return heatmapTitle;
      } else {
        return '';
      }
    }
  }
}

class HeatMapRect {
  constructor() {
    if (constants.hasRect) {
      this.x = plot.x_coord[0];
      this.y = plot.y_coord[0];
      this.rectStrokeWidth = 4; // px
      this.height = Math.abs(plot.y_coord[1] - plot.y_coord[0]);
    }
  }

  UpdateRect() {
    this.x = plot.x_coord[position.x];
    this.y = plot.y_coord[position.y];
  }

  UpdateRectDisplay() {
    this.UpdateRect();
    if (document.getElementById('highlight_rect'))
      document.getElementById('highlight_rect').remove(); // destroy and recreate
    const svgns = 'http://www.w3.org/2000/svg';
    var rect = document.createElementNS(svgns, 'rect');
    rect.setAttribute('id', 'highlight_rect');
    rect.setAttribute('x', this.x);
    rect.setAttribute(
      'y',
      constants.svg.getBoundingClientRect().height - this.height - this.y
    ); // y coord is inverse from plot data
    rect.setAttribute('width', this.height);
    rect.setAttribute('height', this.height);
    rect.setAttribute('stroke', constants.colorSelected);
    rect.setAttribute('stroke-width', this.rectStrokeWidth);
    rect.setAttribute('fill', 'none');
    constants.svg.appendChild(rect);
  }
}

document.addEventListener('DOMContentLoaded', function (e) {
  // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything
});

class ScatterPlot {
  constructor() {
    // layer = 1
    if ('point_elements' in maidr) {
      this.plotPoints = maidr.point_elements;
    } else {
      this.plotPoints = document.querySelectorAll(
        '#' + constants.plotId.replaceAll('.', '\\.') + ' > use'
      );
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
      this.plotLine = document.querySelectorAll(
        '#' + 'GRID.polyline.13.1'.replaceAll('.', '\\.') + ' > polyline'
      )[0];
    }
    this.svgLineX = this.GetSvgLineCoords()[0]; // x coordinates of curve
    this.svgLineY = this.GetSvgLineCoords()[1]; // y coordinates of curve

    this.curveX = this.GetSmoothCurvePoints()[0]; // actual values of x
    this.curvePoints = this.GetSmoothCurvePoints()[1]; // actual values of y

    this.curveMinY = Math.min(...this.curvePoints);
    this.curveMaxY = Math.max(...this.curvePoints);
    this.gradient = this.GetGradient();

    this.x_group_label = '';
    this.y_group_label = '';
    this.title = '';
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

  GetSvgPointCoords() {
    let points = new Map();

    for (let i = 0; i < this.plotPoints.length; i++) {
      let x = parseFloat(this.plotPoints[i].getAttribute('x')); // .toFixed(1);
      let y = parseFloat(this.plotPoints[i].getAttribute('y'));
      if (!points.has(x)) {
        points.set(x, new Set([y]));
      } else {
        points.get(x).add(y);
      }
    }

    points = new Map(
      [...points].sort(function (a, b) {
        return a[0] - b[0];
      })
    );

    points.forEach(function (value, key) {
      points[key] = Array.from(value).sort(function (a, b) {
        return a - b;
      });
    });

    let X = [...points.keys()];

    let Y = [];
    for (let i = 0; i < X.length; i++) {
      Y.push(points[X[i]]);
    }

    return [X, Y];
  }

  GetPointValues() {
    let points = new Map(); // keep track of x and y values

    let xValues = [];
    let yValues = [];

    for (let i = 0; i < maidr.data.data_point_layer.length; i++) {
      let x = maidr.data.data_point_layer[i]['x'];
      let y = maidr.data.data_point_layer[i]['y'];
      xValues.push(x);
      yValues.push(y);
      if (!points.has(x)) {
        points.set(x, new Map([[y, 1]]));
      } else {
        if (points.get(x).has(y)) {
          let mapy = points.get(x);
          mapy.set(y, mapy.get(y) + 1);
        } else {
          points.get(x).set(y, 1);
        }
      }
    }

    constants.minX = 0;
    constants.maxX = [...new Set(xValues)].length;

    constants.minY = Math.min(...yValues);
    constants.maxY = Math.max(...yValues);

    points = new Map(
      [...points].sort(function (a, b) {
        return a[0] - b[0];
      })
    );

    points.forEach(function (value, key) {
      points[key] = Array.from(value).sort(function (a, b) {
        return a[0] - b[0];
      });
    });

    let X = [];
    let Y = [];
    let points_count = [];
    for (const [x_val, y_val] of points) {
      X.push(x_val);
      let y_arr = [];
      let y_count = [];
      for (const [y, count] of y_val) {
        y_arr.push(y);
        y_count.push(count);
      }
      Y.push(y_arr.sort());
      points_count.push(y_count);
    }
    let max_points = Math.max(...points_count.map((a) => Math.max(...a)));

    return [X, Y, points_count, max_points];
  }

  PlayTones(audio) {
    // kill the previous separate-points play before starting the next play
    if (constants.sepPlayId) {
      constants.KillSepPlay();
    }
    if (constants.layer == 1) {
      // point layer
      // we play a run of tones
      position.z = 0;
      constants.sepPlayId = setInterval(
        function () {
          // play this tone
          audio.playTone();

          // and then set up for the next one
          position.z += 1;

          // and kill if we're done
          if (position.z + 1 > plot.y[position.x].length) {
            constants.KillSepPlay();
            position.z = -1;
          }
        },
        constants.sonifMode == 'sep' ? constants.autoPlayPointsRate : 0
      ); // play all tones at the same time
    } else if (constants.layer == 2) {
      // best fit line layer
      audio.playTone();
    }
  }

  GetSvgLineCoords() {
    // extract all the y coordinates from the point attribute of polyline
    let str = this.plotLine.getAttribute('points');
    let coords = str.split(' ');

    let X = [];
    let Y = [];

    for (let i = 0; i < coords.length; i++) {
      let coord = coords[i].split(',');
      X.push(parseFloat(coord[0]));
      Y.push(parseFloat(coord[1]));
    }

    return [X, Y];
  }

  GetSmoothCurvePoints() {
    let x_points = [];
    let y_points = [];

    for (let i = 0; i < maidr.data.data_smooth_layer.length; i++) {
      x_points.push(maidr.data.data_smooth_layer[i]['x']);
      y_points.push(maidr.data.data_smooth_layer[i]['y']);
    }

    return [x_points, y_points];
  }

  GetGradient() {
    let gradients = [];

    for (let i = 0; i < this.curvePoints.length - 1; i++) {
      let abs_grad = Math.abs(
        (this.curvePoints[i + 1] - this.curvePoints[i]) /
          (this.curveX[i + 1] - this.curveX[i])
      ).toFixed(3);
      gradients.push(abs_grad);
    }

    gradients.push('end');

    return gradients;
  }
}

class Layer0Point {
  constructor() {
    this.x = plot.svgPointsX[0];
    this.y = plot.svgPointsY[0];
    this.strokeWidth = 1.35;
  }

  async UpdatePoints() {
    await this.ClearPoints();
    this.x = plot.svgPointsX[position.x];
    this.y = plot.svgPointsY[position.x];
  }

  async PrintPoints() {
    await this.ClearPoints();
    await this.UpdatePoints();
    for (let i = 0; i < this.y.length; i++) {
      const svgns = 'http://www.w3.org/2000/svg';
      var point = document.createElementNS(svgns, 'circle');
      point.setAttribute('class', 'highlight_point');
      point.setAttribute('cx', this.x);
      point.setAttribute(
        'cy',
        constants.svg.getBoundingClientRect().height - this.y[i]
      );
      point.setAttribute('r', 3.95);
      point.setAttribute('stroke', constants.colorSelected);
      point.setAttribute('stroke-width', this.strokeWidth);
      point.setAttribute('fill', constants.colorSelected);
      constants.svg.appendChild(point);
    }
  }

  async ClearPoints() {
    if (document.getElementById('highlight_point'))
      document.getElementById('highlight_point').remove();
    let points = document.getElementsByClassName('highlight_point');
    for (let i = 0; i < points.length; i++) {
      document.getElementsByClassName('highlight_point')[i].remove();
    }
  }

  UpdatePointDisplay() {
    this.ClearPoints();
    this.UpdatePoints();
    this.PrintPoints();
  }
}

class Layer1Point {
  constructor() {
    this.x = plot.svgLineX[0];
    this.y = plot.svgLineY[0];
    this.strokeWidth = 1.35;
  }

  async UpdatePoints() {
    await this.ClearPoints();
    this.x = plot.svgLineX[positionL1.x];
    this.y = plot.svgLineY[positionL1.x];
  }

  async PrintPoints() {
    await this.ClearPoints();
    await this.UpdatePoints();
    const svgns = 'http://www.w3.org/2000/svg';
    var point = document.createElementNS(svgns, 'circle');
    point.setAttribute('id', 'highlight_point');
    point.setAttribute('cx', this.x);
    point.setAttribute(
      'cy',
      constants.svg.getBoundingClientRect().height - this.y
    );
    point.setAttribute('r', 3.95);
    point.setAttribute('stroke', constants.colorSelected);
    point.setAttribute('stroke-width', this.strokeWidth);
    point.setAttribute('fill', constants.colorSelected);
    constants.svg.appendChild(point);
  }

  async ClearPoints() {
    let points = document.getElementsByClassName('highlight_point');
    for (let i = 0; i < points.length; i++) {
      document.getElementsByClassName('highlight_point')[i].remove();
    }
    if (document.getElementById('highlight_point'))
      document.getElementById('highlight_point').remove();
  }

  UpdatePointDisplay() {
    this.ClearPoints();
    this.UpdatePoints();
    this.PrintPoints();
  }
}

// events and init functions
document.addEventListener('DOMContentLoaded', function (e) {
  // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

  // create global vars
  window.constants = new Constants();
  window.resources = new Resources();
  window.menu = new Menu();
  window.tracker = new Tracker();

  // run events and functions only on user study page
  if (document.getElementById('download_data_trigger')) {
    document
      .getElementById('download_data_trigger')
      .addEventListener('click', function (e) {
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
      constants.svg_container.addEventListener('keydown', function (e) {
        // Menu open
        if (e.which == 72) {
          // M(77) for menu, or H(72) for help? I don't like it
          menu.Toggle(true);
        }
      });
    }

    // menu close
    let allClose = document.querySelectorAll('#close_menu, #menu .close');
    for (let i = 0; i < allClose.length; i++) {
      allClose[i].addEventListener('click', function (e) {
        menu.Toggle(false);
      });
    }
    document
      .getElementById('save_and_close_menu')
      .addEventListener('click', function (e) {
        menu.SaveData();
        menu.Toggle(false);
      });
    document.getElementById('menu').addEventListener('keydown', function (e) {
      if (e.which == 27) {
        // esc
        menu.Toggle(false);
        svg.focus();
      }
    });

    // save user focus so we can return after menu close
    let allFocus = document.querySelectorAll(
      '#' +
        constants.svg_container_id +
        ' > svg, #' +
        constants.braille_input_id
    );
    for (let i = 0; i < allFocus.length; i++) {
      allFocus[i].addEventListener('focus', function (e) {
        constants.nonMenuFocus = allFocus[i];
      });
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
    if (
      (e.which == 116 && (constants.isMac ? e.metaKey : e.ctrlKey)) ||
      (e.which == 82 && e.shiftKey && (constants.isMac ? e.metaKey : e.ctrlKey))
    ) {
      e.preventDefault();
      tracker.Delete();
      location.reload(true);
    }
  });
});

document.addEventListener('DOMContentLoaded', function (e) {
  // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

  // variable initialization

  if (typeof maidr !== 'undefined') {
    if ('type' in maidr) {
      constants.chartType = maidr.type;
    }
  }

  if (typeof constants.chartType !== 'undefined') {
    if (constants.chartType == 'barplot') {
      window.position = new Position(-1, -1);
      window.plot = new BarChart();

      let audio = new Audio();

      // global variables
      let lastPlayed = '';
      let lastx = 0;
      let lastKeyTime = 0;
      let pressedL = false;

      // control eventlisteners
      constants.svg_container.addEventListener('keydown', function (e) {
        let updateInfoThisRound = false; // we only update info and play tones on certain keys
        let isAtEnd = false;

        if (e.which === 39) {
          // right arrow 39
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              // lastx = position.x;
              position.x -= 1;
              Autoplay('right', position.x, plot.bars.length);
            } else {
              position.x = plot.bars.length - 1; // go all the way
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (
            e.altKey &&
            e.shiftKey &&
            position.x != plot.bars.length - 1
          ) {
            lastx = position.x;
            Autoplay('reverse-right', plot.bars.length, position.x);
          } else {
            position.x += 1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
        }
        if (e.which === 37) {
          // left arrow 37
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              // lastx = position.x;
              position.x += 1;
              Autoplay('left', position.x, -1);
            } else {
              position.x = 0; // go all the way
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.x != 0) {
            lastx = position.x;
            Autoplay('reverse-left', -1, position.x);
          } else {
            position.x += -1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
        }

        // update display / text / audio
        if (updateInfoThisRound && !isAtEnd) {
          UpdateAll();
        }
        if (isAtEnd) {
          audio.playEnd();
        }
      });

      constants.brailleInput.addEventListener('keydown', function (e) {
        // We block all input, except if it's B or Tab so we move focus

        let updateInfoThisRound = false; // we only update info and play tones on certain keys
        let isAtEnd = false;

        if (e.which == 9) {
          // tab
          // do nothing, let the user Tab away
        } else if (e.which == 39) {
          // right arrow
          e.preventDefault();
          if (e.target.selectionStart > e.target.value.length - 2) {
          } else if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              // lastx = position.x;
              position.x -= 1;
              Autoplay('right', position.x, plot.bars.length);
            } else {
              position.x = plot.bars.length - 1; // go all the way
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (
            e.altKey &&
            e.shiftKey &&
            position.x != plot.bars.length - 1
          ) {
            lastx = position.x;
            Autoplay('reverse-right', plot.bars.length, position.x);
          } else {
            position.x += 1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
        } else if (e.which == 37) {
          // left arrow
          e.preventDefault();
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              // lastx = position.x;
              position.x += 1;
              Autoplay('left', position.x, -1);
            } else {
              position.x = 0; // go all the way
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.x != 0) {
            lastx = position.x;
            Autoplay('reverse-left', -1, position.x);
          } else {
            position.x += -1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
        } else {
          e.preventDefault();
        }

        // auto turn off braille mode if we leave the braille box
        constants.brailleInput.addEventListener('focusout', function (e) {
          display.toggleBrailleMode('off');
        });

        // update display / text / audio
        if (updateInfoThisRound && !isAtEnd) {
          UpdateAllBraille();
        }
        if (isAtEnd) {
          audio.playEnd();
        }
      });

      // var keys;
      let controlElements = [constants.svg_container, constants.brailleInput];
      for (let i = 0; i < controlElements.length; i++) {
        controlElements[i].addEventListener('keydown', function (e) {
          // B: braille mode
          if (e.which == 66) {
            display.toggleBrailleMode();
            e.preventDefault();
          }
          // keys = (keys || []);
          // keys[e.keyCode] = true;
          // if (keys[84] && !keys[76]) {
          //     display.toggleTextMode();
          // }

          // T: aria live text output mode
          if (e.which == 84) {
            let timediff = window.performance.now() - lastKeyTime;
            if (!pressedL || timediff > constants.keypressInterval) {
              display.toggleTextMode();
            }
          }

          // S: sonification mode
          if (e.which == 83) {
            display.toggleSonificationMode();
          }

          if (e.which === 32) {
            // space 32, replay info but no other changes
            UpdateAll();
          }
        });
      }

      document.addEventListener('keydown', function (e) {
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

        // for concurrent key press
        // keys = (keys || []);
        // keys[e.keyCode] = true;
        // // lx: x label, ly: y label, lt: title
        // if (keys[76] && keys[88]) { // lx
        //     display.displayXLabel(plot);
        // }

        // if (keys[76] && keys[89]) { // ly
        //     display.displayYLabel(plot);
        // }

        // if (keys[76] && keys[84]) { // lt
        //     display.displayTitle(plot);
        // }

        // must come before prefix L
        if (pressedL) {
          if (e.which == 88) {
            // X: x label
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayXLabel(plot);
            }
            pressedL = false;
          } else if (e.which == 89) {
            // Y: y label
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayYLabel(plot);
            }
            pressedL = false;
          } else if (e.which == 84) {
            // T: title
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayTitle(plot);
            }
            pressedL = false;
          } else if (e.which == 76) {
            lastKeyTime = window.performance.now();
            pressedL = true;
          } else {
            pressedL = false;
          }
        }

        // L: prefix for label; must come after the suffix
        if (e.which == 76) {
          lastKeyTime = window.performance.now();
          pressedL = true;
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

      // document.addEventListener("keyup", function (e) {
      //     keys[e.keyCode] = false;
      //     stop();
      // }, false);

      function lockPosition() {
        // lock to min / max postions
        let isLockNeeded = false;
        if (!constants.hasRect) {
          return isLockNeeded;
        }

        if (position.x < 0) {
          position.x = 0;
          isLockNeeded = true;
        }
        if (position.x > plot.bars.length - 1) {
          position.x = plot.bars.length - 1;
          isLockNeeded = true;
        }

        return isLockNeeded;
      }
      function UpdateAll() {
        if (constants.showDisplay) {
          display.displayValues(plot);
        }
        if (constants.showRect && constants.hasRect) {
          plot.Select();
        }
        if (constants.sonifMode != 'off') {
          audio.playTone();
        }
      }
      function UpdateAllAutoplay() {
        if (constants.showDisplayInAutoplay) {
          display.displayValues(plot);
        }
        if (constants.showRect && constants.hasRect) {
          plot.Select();
        }
        if (constants.sonifMode != 'off') {
          audio.playTone();
        }

        if (constants.brailleMode != 'off') {
          display.UpdateBraillePos(plot);
        }
      }
      function UpdateAllBraille() {
        if (constants.showDisplayInBraille) {
          display.displayValues(plot);
        }
        if (constants.showRect && constants.hasRect) {
          plot.Select();
        }
        if (constants.sonifMode != 'off') {
          audio.playTone();
        }
        display.UpdateBraillePos(plot);
      }
      function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right and reverse-left
        if (dir == 'left' || dir == 'reverse-right') {
          step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId != null) {
          constants.KillAutoplay();
        }

        if (dir == 'reverse-right' || dir == 'reverse-left') {
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
    } else if (constants.chartType == 'boxplot') {
      // variable initialization
      constants.plotId = 'geom_boxplot.gTree.78.1';
      window.plot = new BoxPlot();
      constants.chartType = 'boxplot';
      if (constants.plotOrientation == 'vert') {
        window.position = new Position(0, plot.plotData[0].length - 1);
      } else {
        window.position = new Position(-1, plot.plotData.length);
      }
      let rect = new BoxplotRect();
      let audio = new Audio();
      let lastPlayed = '';
      let lastY = 0;
      let lastx = 0;
      let lastKeyTime = 0;
      let pressedL = false;

      // control eventlisteners
      constants.svg_container.addEventListener('keydown', function (e) {
        let updateInfoThisRound = false; // we only update info and play tones on certain keys
        let isAtEnd = false;

        // right arrow
        if (e.which === 39) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              if (constants.plotOrientation == 'vert') {
                Autoplay('right', position.x, plot.plotData.length - 1);
              } else {
                Autoplay('right', position.x, plot.plotData[position.y].length);
              }
            } else {
              isAtEnd = lockPosition();
              if (constants.plotOrientation == 'vert') {
                position.x = plot.plotData.length - 1;
              } else {
                position.x = plot.plotData[position.y].length - 1;
              }
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (constants.plotOrientation == 'vert') {
            if (
              e.altKey &&
              e.shiftKey &&
              plot.plotData.length - 1 != position.x
            ) {
              lastY = position.y;
              Autoplay('reverse-right', plot.plotData.length - 1, position.x);
            } else {
              if (
                position.x == -1 &&
                position.y == plot.plotData[position.x].length
              ) {
                position.y -= 1;
              }
              position.x += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else {
            if (
              e.altKey &&
              e.shiftKey &&
              plot.plotData[position.y].length - 1 != position.x
            ) {
              lastx = position.x;
              Autoplay(
                'reverse-right',
                plot.plotData[position.y].length - 1,
                position.x
              );
            } else {
              if (position.x == -1 && position.y == plot.plotData.length) {
                position.y -= 1;
              }
              position.x += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          }
          constants.navigation = 1;
        }
        // left arrow
        if (e.which === 37) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              Autoplay('left', position.x, -1);
            } else {
              position.x = 0;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.x > 0) {
            if (constants.plotOrientation == 'vert') {
              lastY = position.y;
            } else {
              lastx = position.x;
            }
            Autoplay('reverse-left', 0, position.x);
          } else {
            position.x += -1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
          constants.navigation = 1;
        }
        // up arrow
        if (e.which === 38) {
          let oldY = position.y;
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              if (constants.plotOrientation == 'vert') {
                Autoplay('up', position.y, plot.plotData[position.x].length);
              } else {
                Autoplay('up', position.y, plot.plotData.length);
              }
            } else {
              if (constants.plotOrientation == 'vert') {
                position.y = plot.plotData[position.x].length - 1;
              } else {
                position.y = plot.plotData.length - 1;
              }
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (constants.plotOrientation == 'vert') {
            if (
              e.altKey &&
              e.shiftKey &&
              position.y != plot.plotData[position.x].length - 1
            ) {
              lastY = position.y;
              Autoplay(
                'reverse-up',
                plot.plotData[position.x].length - 1,
                position.y
              );
            } else {
              position.y += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else {
            if (
              e.altKey &&
              e.shiftKey &&
              position.y != plot.plotData.length - 1
            ) {
              lastx = position.x;
              Autoplay('reverse-up', plot.plotData.length - 1, position.y);
            } else {
              position.y += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          }
          constants.navigation = 0;
        }
        // down arrow
        if (e.which === 40) {
          let oldY = position.y;
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              Autoplay('down', position.y, -1);
            } else {
              position.y = 0;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.y != 0) {
            if (constants.plotOrientation == 'vert') {
              lastY = position.y;
            } else {
              lastx = position.x;
            }
            Autoplay('reverse-down', 0, position.y);
          } else {
            if (constants.plotOrientation == 'vert') {
              if (
                position.x == -1 &&
                position.y == plot.plotData[position.x].length
              ) {
                position.x += 1;
              }
            } else {
              if (position.x == -1 && position.y == plot.plotData.length) {
                position.x += 1;
              }
            }
            position.y += -1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
          //position.x = GetRelativeBoxPosition(oldY, position.y);
          constants.navigation = 0;
        }

        // update display / text / audio
        if (updateInfoThisRound && !isAtEnd) {
          UpdateAll();
        }
        if (isAtEnd) {
          audio.playEnd();
        }
      });

      constants.brailleInput.addEventListener('keydown', function (e) {
        // We block all input, except if it's B or Tab so we move focus

        let updateInfoThisRound = false; // we only update info and play tones on certain keys
        let setBrailleThisRound = false;
        let isAtEnd = false;

        if (e.which == 9) {
          // tab
          // do nothing, let the user Tab away
        } else if (e.which == 39) {
          // right arrow
          e.preventDefault();
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              if (constants.plotOrientation == 'vert') {
                Autoplay('right', position.x, plot.plotData.length - 1);
              } else {
                Autoplay('right', position.x, plot.plotData[position.y].length);
              }
            } else {
              if (constants.plotOrientation == 'vert') {
                position.x = plot.plotData.length - 1;
              } else {
                position.x = plot.plotData[position.y].length - 1;
              }
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (constants.plotOrientation == 'vert') {
            if (
              e.altKey &&
              e.shiftKey &&
              plot.plotData.length - 1 != position.x
            ) {
              lastY = position.y;
              Autoplay('reverse-right', plot.plotData.length - 1, position.x);
            } else {
              if (
                position.x == -1 &&
                position.y == plot.plotData[position.x].length
              ) {
                position.y -= 1;
              }
              position.x += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else {
            if (
              e.altKey &&
              e.shiftKey &&
              plot.plotData[position.y].length - 1 != position.x
            ) {
              lastx = position.x;
              Autoplay(
                'reverse-right',
                plot.plotData[position.y].length - 1,
                position.x
              );
            } else {
              if (position.x == -1 && position.y == plot.plotData.length) {
                position.y -= 1;
              }
              position.x += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          }
          setBrailleThisRound = true;
          constants.navigation = 1;
        } else if (e.which == 37) {
          // left arrow
          e.preventDefault();
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              Autoplay('left', position.x, -1);
            } else {
              position.x = 0;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.x > 0) {
            if (constants.plotOrientation == 'vert') {
              lastY = position.y;
            } else {
              lastx = position.x;
            }
            Autoplay('reverse-left', 0, position.x);
          } else {
            position.x += -1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
          setBrailleThisRound = true;
          constants.navigation = 1;
        } else if (e.which === 38) {
          // up arrow
          let oldY = position.y;
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              if (constants.plotOrientation == 'vert') {
                if (position.x < 0) position.x = 0;
                Autoplay('up', position.y, plot.plotData[position.x].length);
              } else {
                Autoplay('up', position.y, plot.plotData.length);
              }
            } else if (constants.plotOrientation == 'vert') {
              position.y = plot.plotData[position.x].length - 1;
              updateInfoThisRound = true;
            } else {
              position.y = plot.plotData.length - 1;
              updateInfoThisRound = true;
            }
          } else if (constants.plotOrientation == 'vert') {
            if (
              e.altKey &&
              e.shiftKey &&
              position.y != plot.plotData[position.x].length - 1
            ) {
              lasY = position.y;
              Autoplay(
                'reverse-up',
                plot.plotData[position.x].length - 1,
                position.y
              );
            } else {
              position.y += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else {
            if (
              e.altKey &&
              e.shiftKey &&
              position.y != plot.plotData.length - 1
            ) {
              lastx = position.x;
              Autoplay('reverse-up', plot.plotData.length - 1, position.y);
            } else {
              position.y += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          }
          if (constants.plotOrientation == 'vert') {
          } else {
            setBrailleThisRound = true;
          }
          constants.navigation = 0;
        } else if (e.which === 40) {
          // down arrow
          let oldY = position.y;
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              Autoplay('down', position.y, -1);
            } else {
              position.y = 0;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.y != 0) {
            if (constants.plotOrientation == 'vert') {
              lastY = position.y;
            } else {
              lastx = position.x;
            }
            Autoplay('reverse-down', 0, position.y);
          } else {
            if (constants.plotOrientation == 'vert') {
              if (
                position.x == -1 &&
                position.y == plot.plotData[position.x].length
              ) {
                position.x += 1;
              }
            } else {
              if (position.x == -1 && position.y == plot.plotData.length) {
                position.x += 1;
              }
            }
            position.y += -1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
          constants.navigation = 0;
          if (constants.plotOrientation == 'vert') {
          } else {
            setBrailleThisRound = true;
          }
          constants.navigation = 0;
        } else {
          e.preventDefault();
          // todo: allow some controls through like page refresh
        }

        // update audio. todo: add a setting for this later
        if (updateInfoThisRound && !isAtEnd) {
          if (setBrailleThisRound) display.SetBraille(plot);
          setTimeout(UpdateAllBraille, 50); // we delay this by just a moment as otherwise the cursor position doesn't get set
        }
        if (isAtEnd) {
          audio.playEnd();
        }

        // auto turn off braille mode if we leave the braille box
        constants.brailleInput.addEventListener('focusout', function (e) {
          display.toggleBrailleMode('off');
        });
      });

      // var keys;
      let controlElements = [constants.svg_container, constants.brailleInput];
      for (let i = 0; i < controlElements.length; i++) {
        controlElements[i].addEventListener('keydown', function (e) {
          // B: braille mode
          if (e.which == 66) {
            display.toggleBrailleMode();
            e.preventDefault();
          }
          // T: aria live text output mode
          if (e.which == 84) {
            let timediff = window.performance.now() - lastKeyTime;
            if (!pressedL || timediff > constants.keypressInterval) {
              display.toggleTextMode();
            }
          }

          // keys = (keys || []);
          // keys[e.keyCode] = true;
          // if (keys[84] && !keys[76]) {
          //     display.toggleTextMode();
          // }

          // S: sonification mode
          if (e.which == 83) {
            display.toggleSonificationMode();
          }

          if (e.which === 32) {
            // space 32, replay info but no other changes
            UpdateAll();
          }
        });
      }

      document.addEventListener('keydown', function (e) {
        if (constants.isMac ? e.metaKey : e.ctrlKey) {
          // (ctrl/cmd)+(home/fn+left arrow): top left element
          if (e.which == 36) {
            position.x = 0;
            position.y = plot.plotData.length - 1;
            UpdateAllBraille();
          }

          // (ctrl/cmd)+(end/fn+right arrow): right bottom element
          else if (e.which == 35) {
            position.x = plot.plotData[0].length - 1;
            position.y = 0;
            UpdateAllBraille();
          }
        }

        // keys = (keys || []);
        // keys[e.keyCode] = true;
        // // lx: x label, ly: y label, lt: title, lf: fill
        // if (keys[76] && keys[88]) { // lx
        //     display.displayXLabel(plot);
        // }

        // if (keys[76] && keys[89]) { // ly
        //     display.displayYLabel(plot);
        // }

        // if (keys[76] && keys[84]) { // lt
        //     display.displayTitle(plot);
        // }

        // must come before the prefix L
        if (pressedL) {
          if (e.which == 88) {
            // X: x label
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayXLabel(plot);
            }
            pressedL = false;
          } else if (e.which == 89) {
            // Y: y label
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayYLabel(plot);
            }
            pressedL = false;
          } else if (e.which == 84) {
            // T: title
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayTitle(plot);
            }
            pressedL = false;
          } else if (e.which == 76) {
            lastKeyTime = window.performance.now();
            pressedL = true;
          } else {
            pressedL = false;
          }
        }

        // L: prefix for label; must come after suffix
        if (e.which == 76) {
          lastKeyTime = window.performance.now();
          pressedL = true;
        }

        // period: speed up
        if (e.which == 190) {
          constants.SpeedUp();
          if (constants.autoplayId != null) {
            constants.KillAutoplay();
            if (lastPlayed == 'reverse-left') {
              if (constants.plotOrientation == 'vert') {
                Autoplay('right', position.y, lastY);
              } else {
                Autoplay('right', position.x, lastx);
              }
            } else if (lastPlayed == 'reverse-right') {
              if (constants.plotOrientation == 'vert') {
                Autoplay('left', position.y, lastY);
              } else {
                Autoplay('left', position.x, lastx);
              }
            } else if (lastPlayed == 'reverse-up') {
              if (constants.plotOrientation == 'vert') {
                Autoplay('down', position.y, lastY);
              } else {
                Autoplay('down', position.x, lastx);
              }
            } else if (lastPlayed == 'reverse-down') {
              if (constants.plotOrientation == 'vert') {
                Autoplay('up', position.y, lastY);
              } else {
                Autoplay('up', position.x, lastx);
              }
            } else {
              if (constants.plotOrientation == 'vert') {
                Autoplay(lastPlayed, position.y, lastY);
              } else {
                Autoplay(lastPlayed, position.x, lastx);
              }
            }
          }
        }

        // comma: speed down
        if (e.which == 188) {
          constants.SpeedDown();
          if (constants.autoplayId != null) {
            constants.KillAutoplay();
            if (lastPlayed == 'reverse-left') {
              if (constants.plotOrientation == 'vert') {
                Autoplay('right', position.y, lastY);
              } else {
                Autoplay('right', position.x, lastx);
              }
            } else if (lastPlayed == 'reverse-right') {
              if (constants.plotOrientation == 'vert') {
                Autoplay('left', position.y, lastY);
              } else {
                Autoplay('left', position.x, lastx);
              }
            } else if (lastPlayed == 'reverse-up') {
              if (constants.plotOrientation == 'vert') {
                Autoplay('down', position.y, lastY);
              } else {
                Autoplay('down', position.x, lastx);
              }
            } else if (lastPlayed == 'reverse-down') {
              if (constants.plotOrientation == 'vert') {
                Autoplay('up', position.y, lastY);
              } else {
                Autoplay('up', position.x, lastx);
              }
            } else {
              if (constants.plotOrientation == 'vert') {
                Autoplay(lastPlayed, position.y, lastY);
              } else {
                Autoplay(lastPlayed, position.x, lastx);
              }
            }
          }
        }
      });

      // document.addEventListener("keyup", function (e) {
      //     keys[e.keyCode] = false;
      //     stop();
      // }, false);

      function UpdateAll() {
        if (constants.showDisplay) {
          display.displayValues(plot);
        }
        if (constants.showRect && constants.hasRect) {
          rect.UpdateRect();
        }
        if (constants.sonifMode != 'off') {
          plot.PlayTones(audio);
        }
      }
      function UpdateAllAutoplay() {
        if (constants.showDisplayInAutoplay) {
          display.displayValues(plot);
        }
        if (constants.showRect && constants.hasRect) {
          rect.UpdateRect();
        }
        if (constants.sonifMode != 'off') {
          plot.PlayTones(audio);
        }
        if (constants.brailleMode != 'off') {
          display.UpdateBraillePos(plot);
        }
      }
      function UpdateAllBraille() {
        if (constants.showDisplayInBraille) {
          display.displayValues(plot);
        }
        if (constants.showRect && constants.hasRect) {
          rect.UpdateRect();
        }
        if (constants.sonifMode != 'off') {
          plot.PlayTones(audio);
        }
        display.UpdateBraillePos(plot);
      }
      function lockPosition() {
        // lock to min / max postions
        let isLockNeeded = false;
        if (constants.plotOrientation == 'vert') {
          if (position.y < 0) {
            position.y = 0;
            isLockNeeded = true;
          }
          if (position.x < 0) {
            position.x = 0;
            isLockNeeded = true;
          }
          if (position.x > plot.plotData.length - 1) {
            position.x = plot.plotData.length - 1;
            isLockNeeded = true;
          }
          if (position.y > plot.plotData[position.x].length - 1) {
            position.y = plot.plotData[position.x].length - 1;
            isLockNeeded = true;
          }
        } else {
          if (position.x < 0) {
            position.x = 0;
            isLockNeeded = true;
          }
          if (position.y < 0) {
            position.y = 0;
            isLockNeeded = true;
          }
          if (position.y > plot.plotData.length - 1) {
            position.y = plot.plotData.length - 1;
            isLockNeeded = true;
          }
          if (position.x > plot.plotData[position.y].length - 1) {
            position.x = plot.plotData[position.y].length - 1;
            isLockNeeded = true;
          }
        }

        return isLockNeeded;
      }

      // deprecated. We now use grid system and x values are always available
      function GetRelativeBoxPosition(yOld, yNew) {
        // Used when we move up / down to another plot
        // We want to go to the relative position in the new plot
        // ie, if we were on the 50%, return the position.x of the new 50%

        // init
        let xNew = 0;
        // lock yNew
        if (yNew < 1) {
          ynew = 0;
        } else if (yNew > plot.plotData.length - 1) {
          yNew = plot.plotData.length - 1;
        }

        if (yOld < 0) {
          // not on any chart yet, just start at 0
        } else {
          let oldLabel = '';
          if ('label' in plot.plotData[yOld][position.x]) {
            oldLabel = plot.plotData[yOld][position.x].label;
          }
          // does it exist on the new plot? we'll just get that val
          for (let i = 0; i < plot.plotData[yNew].length; i++) {
            if (plot.plotData[yNew][i].label == oldLabel) {
              xNew = i;
            }
          }
        }

        return xNew;
      }

      function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right / up / reverse-left / reverse-down
        if (
          dir == 'left' ||
          dir == 'down' ||
          dir == 'reverse-right' ||
          dir == 'reverse-up'
        ) {
          step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId != null) {
          constants.KillAutoplay();
        }

        if (dir == 'reverse-left' || dir == 'reverse-right') {
          position.x = start;
        } else if (dir == 'reverse-up' || dir == 'reverse-down') {
          position.y = start;
        }

        if (constants.debugLevel > 0) {
          console.log('starting autoplay', dir);
        }

        UpdateAllAutoplay(); // play current tone before we move
        constants.autoplayId = setInterval(function () {
          let doneNext = false;
          if (dir == 'left' || dir == 'right' || dir == 'up' || dir == 'down') {
            if (
              (position.x < 1 && dir == 'left') ||
              (constants.plotOrientation == 'vert' &&
                dir == 'up' &&
                position.y > plot.plotData[position.x].length - 2) ||
              (constants.plotOrientation == 'horz' &&
                dir == 'up' &&
                position.y > plot.plotData.length - 2) ||
              (constants.plotOrientation == 'horz' &&
                dir == 'right' &&
                position.x > plot.plotData[position.y].length - 2) ||
              (constants.plotOrientation == 'vert' &&
                dir == 'right' &&
                position.x > plot.plotData.length - 2) ||
              (constants.plotOrientation == 'horz' &&
                dir == 'down' &&
                position.y < 1) ||
              (constants.plotOrientation == 'vert' &&
                dir == 'down' &&
                position.y < 1)
            ) {
              doneNext = true;
            }
          } else {
            if (
              (dir == 'reverse-left' && position.x >= end) ||
              (dir == 'reverse-right' && position.x <= end) ||
              (dir == 'reverse-up' && position.y <= end) ||
              (dir == 'reverse-down' && position.y >= end)
            ) {
              doneNext = true;
            }
          }

          if (doneNext) {
            constants.KillAutoplay();
          } else {
            if (
              dir == 'left' ||
              dir == 'right' ||
              dir == 'reverse-left' ||
              dir == 'reverse-right'
            ) {
              position.x += step;
            } else {
              position.y += step;
            }
            UpdateAllAutoplay();
          }
          if (constants.debugLevel > 5) {
            console.log('autoplay pos', position);
          }
        }, constants.autoPlayRate);
      }
    } else if (constants.chartType == 'heatmap') {
      // variable initialization
      constants.plotId = 'geom_rect.rect.2.1';
      window.position = new Position(-1, -1);
      window.plot = new HeatMap();
      constants.chartType = 'heatmap';
      let rect = new HeatMapRect();
      let audio = new Audio();
      let lastPlayed = '';
      let lastx = 0;
      let lastKeyTime = 0;
      let pressedL = false;

      // control eventlisteners
      constants.svg_container.addEventListener('keydown', function (e) {
        let updateInfoThisRound = false;
        let isAtEnd = false;

        // right arrow 39
        if (e.which === 39) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              // lastx = position.x;
              position.x -= 1;
              Autoplay('right', position.x, plot.num_cols);
            } else {
              position.x = plot.num_cols - 1;
              updateInfoThisRound = true;
            }
          } else if (
            e.altKey &&
            e.shiftKey &&
            position.x != plot.num_cols - 1
          ) {
            lastx = position.x;
            Autoplay('reverse-right', plot.num_cols, position.x);
          } else {
            if (position.x == -1 && position.y == -1) {
              position.y += 1;
            }
            position.x += 1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
          constants.navigation = 1;
        }

        // left arrow 37
        if (e.which === 37) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              // lastx = position.x;
              position.x += 1;
              Autoplay('left', position.x, -1);
            } else {
              position.x = 0;
              updateInfoThisRound = true;
            }
          } else if (e.altKey && e.shiftKey && position.x != 0) {
            lastx = position.x;
            Autoplay('reverse-left', -1, position.x);
          } else {
            position.x -= 1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
          constants.navigation = 1;
        }

        // up arrow 38
        if (e.which === 38) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              // lastx = position.y;
              position.y += 1;
              Autoplay('up', position.y, -1);
            } else {
              position.y = 0;
              updateInfoThisRound = true;
            }
          } else if (e.altKey && e.shiftKey && position.y != 0) {
            lastx = position.x;
            Autoplay('reverse-up', -1, position.y);
          } else {
            position.y -= 1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
          constants.navigation = 0;
        }

        // down arrow 40
        if (e.which === 40) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              // lastx = position.y;
              position.y -= 1;
              Autoplay('down', position.y, plot.num_rows);
            } else {
              position.y = plot.num_rows - 1;
              updateInfoThisRound = true;
            }
          } else if (
            e.altKey &&
            e.shiftKey &&
            position.y != plot.num_rows - 1
          ) {
            lastx = position.x;
            Autoplay('reverse-down', plot.num_rows, position.y);
          } else {
            if (position.x == -1 && position.y == -1) {
              position.x += 1;
            }
            position.y += 1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
          constants.navigation = 0;
        }

        // update text, display, and audio
        if (updateInfoThisRound && !isAtEnd) {
          UpdateAll();
        }
        if (isAtEnd) {
          audio.playEnd();
        }
      });

      constants.brailleInput.addEventListener('keydown', function (e) {
        let updateInfoThisRound = false;
        let isAtEnd = false;

        if (e.which == 9) {
          // let user tab
        } else if (e.which == 39) {
          // right arrow
          if (
            e.target.selectionStart > e.target.value.length - 3 ||
            e.target.value.substring(
              e.target.selectionStart + 1,
              e.target.selectionStart + 2
            ) == '⠳'
          ) {
            // already at the end, do nothing
            e.preventDefault();
          } else {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (position.x == -1 && position.y == -1) {
                position.x += 1;
                position.y += 1;
              }
              if (e.shiftKey) {
                position.x -= 1;
                Autoplay('right', position.x, plot.num_cols);
              } else {
                position.x = plot.num_cols - 1;
                updateInfoThisRound = true;
              }
            } else if (
              e.altKey &&
              e.shiftKey &&
              position.x != plot.num_cols - 1
            ) {
              lastx = position.x;
              Autoplay('reverse-right', plot.num_cols, position.x);
            } else {
              if (position.x == -1 && position.y == -1) {
                position.y += 1;
              }
              position.x += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }

            // we need pos to be y*(num_cols+1), (and num_cols+1 because there's a spacer character)
            let pos = position.y * (plot.num_cols + 1) + position.x;
            e.target.setSelectionRange(pos, pos);
            e.preventDefault();

            constants.navigation = 1;
          }
        } else if (e.which == 37) {
          // left
          if (
            e.target.selectionStart == 0 ||
            e.target.value.substring(
              e.target.selectionStart - 1,
              e.target.selectionStart
            ) == '⠳'
          ) {
            e.preventDefault();
          } else {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                // lastx = position.x;
                position.x += 1;
                Autoplay('left', position.x, -1);
              } else {
                position.x = 0;
                updateInfoThisRound = true;
              }
            } else if (e.altKey && e.shiftKey && position.x != 0) {
              lastx = position.x;
              Autoplay('reverse-left', -1, position.x);
            } else {
              position.x += -1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }

            let pos = position.y * (plot.num_cols + 1) + position.x;
            e.target.setSelectionRange(pos, pos);
            e.preventDefault();

            constants.navigation = 1;
          }
        } else if (e.which == 40) {
          // down
          if (position.y + 1 == plot.num_rows) {
            e.preventDefault();
          } else {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (position.x == -1 && position.y == -1) {
                position.x += 1;
                position.y += 1;
              }
              if (e.shiftKey) {
                position.y -= 1;
                Autoplay('down', position.y, plot.num_rows);
              } else {
                position.y = plot.num_rows - 1;
                updateInfoThisRound = true;
              }
            } else if (
              e.altKey &&
              e.shiftKey &&
              position.y != plot.num_rows - 1
            ) {
              lastx = position.x;
              Autoplay('reverse-down', plot.num_rows, position.y);
            } else {
              if (position.x == -1 && position.y == -1) {
                position.x += 1;
              }
              position.y += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }

            let pos = position.y * (plot.num_cols + 1) + position.x;
            e.target.setSelectionRange(pos, pos);
            e.preventDefault();

            constants.navigation = 0;
          }
        } else if (e.which == 38) {
          // up
          if (e.target.selectionStart - plot.num_cols - 1 < 0) {
            e.preventDefault();
          } else {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                // lastx = position.y;
                position.y += 1;
                Autoplay('up', position.y, -1);
              } else {
                position.y = 0;
                updateInfoThisRound = true;
              }
            } else if (e.altKey && e.shiftKey && position.y != 0) {
              lastx = position.x;
              Autoplay('reverse-up', -1, position.y);
            } else {
              position.y += -1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }

            let pos = position.y * (plot.num_cols + 1) + position.x;
            e.target.setSelectionRange(pos, pos);
            e.preventDefault();

            constants.navigation = 0;
          }
        } else {
          e.preventDefault();
        }

        // auto turn off braille mode if we leave the braille box
        constants.brailleInput.addEventListener('focusout', function (e) {
          display.toggleBrailleMode('off');
        });

        if (updateInfoThisRound && !isAtEnd) {
          UpdateAllBraille();
        }
        if (isAtEnd) {
          audio.playEnd();
        }
      });

      // var keys;

      let controlElements = [constants.svg_container, constants.brailleInput];
      for (let i = 0; i < controlElements.length; i++) {
        controlElements[i].addEventListener('keydown', function (e) {
          // B: braille mode
          if (e.which == 66) {
            display.toggleBrailleMode();
            e.preventDefault();
          }
          // keys = (keys || []);
          // keys[e.keyCode] = true;
          // if (keys[84] && !keys[76]) {
          //     display.toggleTextMode();
          // }

          // T: aria live text output mode
          if (e.which == 84) {
            let timediff = window.performance.now() - lastKeyTime;
            if (!pressedL || timediff > constants.keypressInterval) {
              display.toggleTextMode();
            }
          }

          // S: sonification mode
          if (e.which == 83) {
            display.toggleSonificationMode();
          }

          // space: replay info but no other changes
          if (e.which === 32) {
            UpdateAll();
          }
        });
      }

      document.addEventListener('keydown', function (e) {
        if (constants.isMac ? e.metaKey : e.ctrlKey) {
          // (ctrl/cmd)+(home/fn+left arrow): first element
          if (e.which == 36) {
            position.x = 0;
            position.y = 0;
            UpdateAllBraille();
          }

          // (ctrl/cmd)+(end/fn+right arrow): last element
          else if (e.which == 35) {
            position.x = plot.num_cols - 1;
            position.y = plot.num_rows - 1;
            UpdateAllBraille();
          }
        }

        // keys = (keys || []);
        // keys[e.keyCode] = true;
        // // lx: x label, ly: y label, lt: title, lf: fill
        // if (keys[76] && keys[88]) { // lx
        //     display.displayXLabel(plot);
        // }

        // if (keys[76] && keys[89]) { // ly
        //     display.displayYLabel(plot);
        // }

        // if (keys[76] && keys[84]) { // lt
        //     display.displayTitle(plot);
        // }

        // if (keys[76] && keys[70]) { // lf
        //     display.displayFill(plot);
        // }

        // must come before the prefix L
        if (pressedL) {
          if (e.which == 88) {
            // X: x label
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayXLabel(plot);
            }
            pressedL = false;
          } else if (e.which == 89) {
            // Y: y label
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayYLabel(plot);
            }
            pressedL = false;
          } else if (e.which == 84) {
            // T: title
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayTitle(plot);
            }
            pressedL = false;
          } else if (e.which == 70) {
            // F: fill label
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayFill(plot);
            }
            pressedL = false;
          } else if (e.which == 76) {
            lastKeyTime = window.performance.now();
            pressedL = true;
          } else {
            pressedL = false;
          }
        }

        // L: prefix for label; must come after suffix
        if (e.which == 76) {
          lastKeyTime = window.performance.now();
          pressedL = true;
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
            } else if (lastPlayed == 'reverse-up') {
              Autoplay('down', position.x, lastx);
            } else if (lastPlayed == 'reverse-down') {
              Autoplay('up', position.x, lastx);
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
            } else if (lastPlayed == 'reverse-up') {
              Autoplay('down', position.x, lastx);
            } else if (lastPlayed == 'reverse-down') {
              Autoplay('up', position.x, lastx);
            } else {
              Autoplay(lastPlayed, position.x, lastx);
            }
          }
        }
      });

      // document.addEventListener("keyup", function (e) {
      //     keys[e.keyCode] = false;
      //     stop();
      // }, false);

      function sleep(time) {
        return new Promise((resolve) => setTimeout(resolve, time));
      }

      // helper functions
      function lockPosition() {
        // lock to min / max postions
        let isLockNeeded = false;

        if (position.x < 0) {
          position.x = 0;
          isLockNeeded = true;
        }
        if (position.x > plot.num_cols - 1) {
          position.x = plot.num_cols - 1;
          isLockNeeded = true;
        }
        if (position.y < 0) {
          position.y = 0;
          isLockNeeded = true;
        }
        if (position.y > plot.num_rows - 1) {
          position.y = plot.num_rows - 1;
          isLockNeeded = true;
        }

        return isLockNeeded;
      }

      function UpdateAll() {
        if (constants.showDisplay) {
          display.displayValues(plot);
        }
        if (constants.showRect && constants.hasRect) {
          rect.UpdateRectDisplay();
        }
        if (constants.sonifMode != 'off') {
          audio.playTone();
        }
      }
      function UpdateAllAutoplay() {
        if (constants.showDisplayInAutoplay) {
          display.displayValues(plot);
        }
        if (constants.showRect && constants.hasRect) {
          rect.UpdateRectDisplay();
        }
        if (constants.sonifMode != 'off') {
          audio.playTone();
        }
        if (constants.brailleMode != 'off') {
          display.UpdateBraillePos(plot);
        }
      }
      function UpdateAllBraille() {
        if (constants.showDisplayInBraille) {
          display.displayValues(plot);
        }
        if (constants.showRect && constants.hasRect) {
          rect.UpdateRectDisplay();
        }
        if (constants.sonifMode != 'off') {
          audio.playTone();
        }
        display.UpdateBraillePos(plot);
      }

      function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right, down, reverse-left, and reverse-up
        if (
          dir == 'left' ||
          dir == 'up' ||
          dir == 'reverse-right' ||
          dir == 'reverse-down'
        ) {
          step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId != null) {
          constants.KillAutoplay();
        }

        if (dir == 'reverse-left' || dir == 'reverse-right') {
          position.x = start;
        } else if (dir == 'reverse-up' || dir == 'reverse-down') {
          position.y = start;
        }

        constants.autoplayId = setInterval(function () {
          if (
            dir == 'left' ||
            dir == 'right' ||
            dir == 'reverse-left' ||
            dir == 'reverse-right'
          ) {
            position.x += step;
            if (position.x < 0 || plot.num_cols - 1 < position.x) {
              constants.KillAutoplay();
              lockPosition();
            } else if (position.x == end) {
              constants.KillAutoplay();
              UpdateAllAutoplay();
            } else {
              UpdateAllAutoplay();
            }
          } else {
            // up or down
            position.y += step;
            if (position.y < 0 || plot.num_rows - 1 < position.y) {
              constants.KillAutoplay();
              lockPosition();
            } else if (position.y == end) {
              constants.KillAutoplay();
              UpdateAllAutoplay();
            } else {
              UpdateAllAutoplay();
            }
          }
        }, constants.autoPlayRate);
      }
    } else if (
      constants.chartType == 'scatterplot' ||
      constants.chartType.includes('scatterplot')
    ) {
      // variable initialization
      constants.plotId = 'geom_point.points.12.1';
      window.position = new Position(-1, -1);
      window.plot = new ScatterPlot();
      constants.chartType = 'scatterplot';
      let audio = new Audio();
      let layer0Point = new Layer0Point();
      let layer1Point = new Layer1Point();

      let lastPlayed = ''; // for autoplay use
      let lastx = 0; // for layer 1 autoplay use
      let lastx1 = 0; // for layer 2 autoplay use
      let lastKeyTime = 0;
      let pressedL = false;

      window.positionL1 = new Position(lastx1, lastx1);

      // control eventlisteners
      constants.svg_container.addEventListener('keydown', function (e) {
        let updateInfoThisRound = false;
        let isAtEnd = false;

        // left and right arrows are enabled only at point layer
        if (constants.layer == 1) {
          // right arrow 39
          if (e.which === 39) {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                // lastx = position.x;
                position.x -= 1;
                Autoplay('outward_right', position.x, plot.x.length);
              } else {
                position.x = plot.x.length - 1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
              }
            } else if (
              e.altKey &&
              e.shiftKey &&
              position.x != plot.x.length - 1
            ) {
              lastx = position.x;
              Autoplay('inward_right', plot.x.length, position.x);
            } else {
              position.x += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          }

          // left arrow 37
          if (e.which === 37) {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                // lastx = position.x;
                position.x += 1;
                Autoplay('outward_left', position.x, -1);
              } else {
                position.x = 0;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
              }
            } else if (e.altKey && e.shiftKey && position.x != 0) {
              lastx = position.x;
              Autoplay('inward_left', -1, position.x);
            } else {
              position.x -= 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          }
        } else if (constants.layer == 2) {
          positionL1.x = lastx1;

          if (e.which == 39 && e.shiftKey) {
            if (
              (constants.isMac ? e.metaKey : e.ctrlKey) &&
              constants.sonifMode != 'off'
            ) {
              PlayLine('outward_right');
            } else if (e.altKey && constants.sonifMode != 'off') {
              PlayLine('inward_right');
            }
          }

          if (e.which == 37 && e.shiftKey) {
            if (
              (constants.isMac ? e.metaKey : e.ctrlKey) &&
              constants.sonifMode != 'off'
            ) {
              PlayLine('outward_left');
            } else if (e.altKey && constants.sonifMode != 'off') {
              PlayLine('inward_left');
            }
          }
        }

        // update text, display, and audio
        if (updateInfoThisRound && constants.layer == 1 && !isAtEnd) {
          UpdateAll();
        }
        if (isAtEnd) {
          audio.playEnd();
        }
      });

      constants.brailleInput.addEventListener('keydown', function (e) {
        let updateInfoThisRound = false;
        let isAtEnd = false;

        // @TODO
        // only line layer can access to braille display
        if (e.which == 9) {
          // constants.brailleInput.setSelectionRange(positionL1.x, positionL1.x);
        } else if (constants.layer == 2) {
          lockPosition();
          if (e.which == 9) {
          } else if (e.which == 39) {
            // right arrow
            e.preventDefault();
            constants.brailleInput.setSelectionRange(
              positionL1.x,
              positionL1.x
            );
            if (e.target.selectionStart > e.target.value.length - 2) {
              e.preventDefault();
            } else if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                positionL1.x -= 1;
                Autoplay(
                  'outward_right',
                  positionL1.x,
                  plot.curvePoints.length
                );
              } else {
                positionL1.x = plot.curvePoints.length - 1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
              }
            } else if (
              e.altKey &&
              e.shiftKey &&
              positionL1.x != plot.curvePoints.length - 1
            ) {
              lastx1 = positionL1.x;
              Autoplay('inward_right', plot.curvePoints.length, positionL1.x);
            } else {
              positionL1.x += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.which == 37) {
            // left
            e.preventDefault();
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                // lastx = position.x;
                positionL1.x += 1;
                Autoplay('outward_left', positionL1.x, -1);
              } else {
                positionL1.x = 0; // go all the way
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
              }
            } else if (e.altKey && e.shiftKey && positionL1.x != 0) {
              Autoplay('inward_left', -1, positionL1.x);
            } else {
              positionL1.x -= 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else {
            e.preventDefault();
          }
        } else {
          e.preventDefault();
        }

        // auto turn off braille mode if we leave the braille box
        constants.brailleInput.addEventListener('focusout', function (e) {
          display.toggleBrailleMode('off');
        });

        lastx1 = positionL1.x;

        if (updateInfoThisRound && !isAtEnd) {
          UpdateAllBraille();
        }
        if (isAtEnd) {
          audio.playEnd();
        }
      });

      // var keys;
      let controlElements = [constants.svg_container, constants.brailleInput];
      for (let i = 0; i < controlElements.length; i++) {
        controlElements[i].addEventListener('keydown', function (e) {
          // B: braille mode
          if (e.which == 66) {
            display.toggleBrailleMode();
            e.preventDefault();
          }
          // T: aria live text output mode
          if (e.which == 84) {
            let timediff = window.performance.now() - lastKeyTime;
            if (!pressedL || timediff > constants.keypressInterval) {
              display.toggleTextMode();
            }
          }

          // keys = (keys || []);
          // keys[e.keyCode] = true;
          // if (keys[84] && !keys[76]) {
          //     display.toggleTextMode();
          // }

          // S: sonification mode
          if (e.which == 83) {
            display.toggleSonificationMode();
          }

          // page down /(fn+down arrow): point layer(1)
          if (
            e.which == 34 &&
            constants.layer == 2 &&
            constants.brailleMode == 'off'
          ) {
            lastx1 = positionL1.x;
            display.toggleLayerMode();
          }

          // page up / (fn+up arrow): line layer(2)
          if (
            e.which == 33 &&
            constants.layer == 1 &&
            constants.brailleMode == 'off'
          ) {
            display.toggleLayerMode();
          }

          // space: replay info but no other changes
          if (e.which === 32) {
            UpdateAll();
          }
        });
      }

      document.addEventListener('keydown', function (e) {
        if (constants.isMac ? e.metaKey : e.ctrlKey) {
          // (ctrl/cmd)+(home/fn+left arrow): first element
          if (e.which == 36) {
            if (constants.layer == 1) {
              position.x = 0;
              UpdateAll();
              // move cursor for braille
              constants.brailleInput.setSelectionRange(0, 0);
            } else if (constants.layer == 2) {
              positionL1.x = 0;
              UpdateAllBraille();
            }
          }

          // (ctrl/cmd)+(end/fn+right arrow): last element
          else if (e.which == 35) {
            if (constants.layer == 1) {
              position.x = plot.y.length - 1;
              UpdateAll();
              // move cursor for braille
              constants.brailleInput.setSelectionRange(
                plot.curvePoints.length - 1,
                plot.curvePoints.length - 1
              );
            } else if (constants.layer == 2) {
              positionL1.x = plot.curvePoints.length - 1;
              UpdateAllBraille();
            }
          }

          // if you're only hitting control
          if (!e.shiftKey) {
            audio.KillSmooth();
          }
        }

        // keys = (keys || []);
        // keys[e.keyCode] = true;
        // // lx: x label, ly: y label, lt: title, lf: fill
        // if (keys[76] && keys[88]) { // lx
        //     display.displayXLabel(plot);
        // }

        // if (keys[76] && keys[89]) { // ly
        //     display.displayYLabel(plot);
        // }

        // if (keys[76] && keys[84]) { // lt
        //     display.displayTitle(plot);
        // }

        if (pressedL) {
          if (e.which == 88) {
            // X: x label
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayXLabel(plot);
            }
            pressedL = false;
          } else if (e.which == 89) {
            // Y: y label
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayYLabel(plot);
            }
            pressedL = false;
          } else if (e.which == 84) {
            // T: title
            let timediff = window.performance.now() - lastKeyTime;
            if (pressedL && timediff <= constants.keypressInterval) {
              display.displayTitle(plot);
            }
            pressedL = false;
          } else if (e.which == 76) {
            lastKeyTime = window.performance.now();
            pressedL = true;
          } else {
            pressedL = false;
          }
        }

        // L: prefix for label
        if (e.which == 76) {
          lastKeyTime = window.performance.now();
          pressedL = true;
        }

        // period: speed up
        if (e.which == 190) {
          constants.SpeedUp();
          if (constants.autoplayId != null) {
            constants.KillAutoplay();
            audio.KillSmooth();
            if (lastPlayed == 'inward_left') {
              if (constants.layer == 1) {
                Autoplay('outward_right', position.x, lastx);
              } else if (constants.layer == 2) {
                Autoplay('outward_right', positionL1.x, lastx1);
              }
            } else if (lastPlayed == 'inward_right') {
              if (constants.layer == 1) {
                Autoplay('outward_left', position.x, lastx);
              } else if (constants.layer == 2) {
                Autoplay('outward_left', positionL1.x, lastx1);
              }
            } else {
              if (constants.layer == 1) {
                Autoplay(lastPlayed, position.x, lastx);
              } else if (constants.layer == 2) {
                Autoplay(lastPlayed, positionL1.x, lastx1);
              }
            }
          }
        }

        // comma: speed down
        if (e.which == 188) {
          constants.SpeedDown();
          if (constants.autoplayId != null) {
            constants.KillAutoplay();
            audio.KillSmooth();
            if (lastPlayed == 'inward_left') {
              if (constants.layer == 1) {
                Autoplay('outward_right', position.x, lastx);
              } else if (constants.layer == 2) {
                Autoplay('outward_right', positionL1.x, lastx1);
              }
            } else if (lastPlayed == 'inward_right') {
              if (constants.layer == 1) {
                Autoplay('outward_left', position.x, lastx);
              } else if (constants.layer == 2) {
                Autoplay('outward_left', positionL1.x, lastx1);
              }
            } else {
              if (constants.layer == 1) {
                Autoplay(lastPlayed, position.x, lastx);
              } else if (constants.layer == 2) {
                Autoplay(lastPlayed, positionL1.x, lastx1);
              }
            }
          }
        }
      });

      // document.addEventListener("keyup", function (e) {
      //     keys[e.keyCode] = false;
      //     stop();
      // }, false);

      // helper functions
      function lockPosition() {
        // lock to min / max positions
        let isLockNeeded = false;
        if (constants.layer == 1) {
          if (position.x < 0) {
            position.x = 0;
            isLockNeeded = true;
          }
          if (position.x > plot.x.length - 1) {
            position.x = plot.x.length - 1;
            isLockNeeded = true;
          }
        } else if (constants.layer == 2) {
          if (positionL1.x < 0) {
            positionL1.x = 0;
            isLockNeeded = true;
          }
          if (positionL1.x > plot.curvePoints.length - 1) {
            positionL1.x = plot.curvePoints.length - 1;
            isLockNeeded = true;
          }
        }

        return isLockNeeded;
      }

      function UpdateAll() {
        if (constants.showDisplay) {
          display.displayValues(plot);
        }
        if (constants.showRect) {
          layer0Point.UpdatePointDisplay();
        }
        if (constants.sonifMode != 'off') {
          plot.PlayTones(audio);
        }
      }

      function UpdateAllAutoplay() {
        if (constants.showDisplayInAutoplay) {
          display.displayValues(plot);
        }
        if (constants.showRect) {
          if (constants.layer == 1) {
            layer0Point.UpdatePointDisplay();
          } else {
            layer1Point.UpdatePointDisplay();
          }
        }
        if (constants.sonifMode != 'off') {
          plot.PlayTones(audio);
        }
        if (constants.brailleMode != 'off') {
          display.UpdateBraillePos(plot);
        }
      }
      function UpdateAllBraille() {
        if (constants.showDisplayInBraille) {
          display.displayValues(plot);
        }
        if (constants.showRect) {
          layer1Point.UpdatePointDisplay();
        }
        if (constants.sonifMode != 'off') {
          plot.PlayTones(audio);
        }
        display.UpdateBraillePos(plot);
      }

      function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right and reverse left
        if (dir == 'outward_left' || dir == 'inward_right') {
          step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId) {
          constants.KillAutoplay();
        }
        if (constants.isSmoothAutoplay) {
          audio.KillSmooth();
        }

        if (dir == 'inward_left' || dir == 'inward_right') {
          position.x = start;
          position.L1x = start;
        }

        if (constants.layer == 1) {
          constants.autoplayId = setInterval(function () {
            position.x += step;
            // autoplay for two layers: point layer & line layer in braille
            // plot.numPoints is not available anymore
            if (position.x < 0 || position.x > plot.y.length - 1) {
              constants.KillAutoplay();
              lockPosition();
            } else if (position.x == end) {
              constants.KillAutoplay();
              UpdateAllAutoplay();
            } else {
              UpdateAllAutoplay();
            }
          }, constants.autoPlayRate);
        } else if (constants.layer == 2) {
          constants.autoplayId = setInterval(function () {
            positionL1.x += step;
            // autoplay for two layers: point layer & line layer in braille
            // plot.numPoints is not available anymore
            if (
              positionL1.x < 0 ||
              positionL1.x > plot.curvePoints.length - 1
            ) {
              constants.KillAutoplay();
              lockPosition();
            } else if (positionL1.x == end) {
              constants.KillAutoplay();
              UpdateAllAutoplay();
            } else {
              UpdateAllAutoplay();
            }
          }, constants.autoPlayRate);
        }
      }

      function PlayLine(dir) {
        lastPlayed = dir;

        let freqArr = [];
        let panningArr = [];
        let panPoint = audio.SlideBetween(
          positionL1.x,
          0,
          plot.curvePoints.length - 1,
          -1,
          1
        );
        let x = positionL1.x < 0 ? 0 : positionL1.x;
        let duration = 0;
        if (dir == 'outward_right') {
          for (let i = x; i < plot.curvePoints.length; i++) {
            freqArr.push(
              audio.SlideBetween(
                plot.curvePoints[i],
                plot.curveMinY,
                plot.curveMaxY,
                constants.MIN_FREQUENCY,
                constants.MAX_FREQUENCY
              )
            );
          }
          panningArr = [panPoint, 1];
          duration =
            (Math.abs(plot.curvePoints.length - x) / plot.curvePoints.length) *
            3;
        } else if (dir == 'outward_left') {
          for (let i = x; i >= 0; i--) {
            freqArr.push(
              audio.SlideBetween(
                plot.curvePoints[i],
                plot.curveMinY,
                plot.curveMaxY,
                constants.MIN_FREQUENCY,
                constants.MAX_FREQUENCY
              )
            );
          }
          panningArr = [panPoint, -1];
          duration = (Math.abs(x) / plot.curvePoints.length) * 3;
        } else if (dir == 'inward_right') {
          for (let i = plot.curvePoints.length - 1; i >= x; i--) {
            freqArr.push(
              audio.SlideBetween(
                plot.curvePoints[i],
                plot.curveMinY,
                plot.curveMaxY,
                constants.MIN_FREQUENCY,
                constants.MAX_FREQUENCY
              )
            );
          }
          panningArr = [1, panPoint];
          duration =
            (Math.abs(plot.curvePoints.length - x) / plot.curvePoints.length) *
            3;
        } else if (dir == 'inward_left') {
          for (let i = 0; i <= x; i++) {
            freqArr.push(
              audio.SlideBetween(
                plot.curvePoints[i],
                plot.curveMinY,
                plot.curveMaxY,
                constants.MIN_FREQUENCY,
                constants.MAX_FREQUENCY
              )
            );
          }
          panningArr = [-1, panPoint];
          duration = (Math.abs(x) / plot.curvePoints.length) * 3;
        }

        if (constants.isSmoothAutoplay) {
          audio.KillSmooth();
        }

        // audio.playSmooth(freqArr, 2, panningArr, constants.vol, 'sine');
        audio.playSmooth(freqArr, duration, panningArr, constants.vol, 'sine');
      }
    }
  }
});
