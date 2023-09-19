// events and init functions
// we do some setup, but most of the work is done when user focuses on an element matching an id from maidr user data
document.addEventListener('DOMContentLoaded', function (e) {
  // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

  // create global vars
  window.constants = new Constants();
  window.resources = new Resources();
  window.menu = new Menu();
  window.tracker = new Tracker();
  window.logError = new LogError();

  // set focus events for all charts matching maidr ids
  let maidrObjects = [];
  if (!Array.isArray(maidr)) {
    maidrObjects.push(maidr);
  } else {
    maidrObjects = maidr;
  }
  // set focus events for all maidr ids
  DestroyMaidr(); // just in case
  window.maidrIds = [];
  for (let i = 0; i < maidrObjects.length; i++) {
    let maidrId = maidrObjects[i].id;
    maidrIds.push(maidrId);
    let maidrElemn = document.getElementById(maidrId);
    if (maidrElemn) {
      maidrElemn.addEventListener('focus', function (e) {
        ShouldWeInitMaidr(maidrObjects[i]);
      });
      // blur done elsewhere
    }
  }

  // events etc for user study page
  // run tracker stuff only on user study page
  if (document.getElementById('download_data_trigger')) {
    // download data button
    document
      .getElementById('download_data_trigger')
      .addEventListener('click', function (e) {
        tracker.DownloadTrackerData();
      });

    // general events
    document.addEventListener('keydown', function (e) {
      // reset tracking with Ctrl + F5 / command + F5, and Ctrl + Shift + R / command + Shift + R
      // future todo: this should probably be a button with a confirmation. This is dangerous
      if (
        (e.key == 'F5' && (constants.isMac ? e.metaKey : e.ctrlKey)) ||
        (e.key == 'R' && (constants.isMac ? e.metaKey : e.ctrlKey))
      ) {
        e.preventDefault();
        tracker.Delete();
        location.reload(true);
      }

      // Tracker
      if (constants.isTracking) {
        if (e.key == 'F10') {
          //tracker.DownloadTrackerData();
        } else {
          if (plot) {
            tracker.LogEvent(e);
          }
        }
      }

      // Stuff to only run if we're on a chart (so check if the info div exists?)
      if (document.getElementById('info')) {
      }
    });
  }
});

function InitMaidr(thisMaidr) {
  // just in case
  if (typeof constants != 'undefined') {
    // init vars and html
    window.singleMaidr = thisMaidr;
    constants.chartId = singleMaidr.id;
    if (Array.isArray(singleMaidr.type)) {
      constants.chartType = singleMaidr.type[0];
    } else {
      constants.chartType = singleMaidr.type;
    }
    CreateChartComponents(singleMaidr);
    window.control = new Control(); // this inits the plot
    window.review = new Review();
    window.display = new Display();

    // blur destruction events
    constants.events.push([
      document.getElementById(singleMaidr.id),
      'blur',
      ShouldWeDestroyMaidr,
    ]);

    // kill autoplay event
    constants.events.push([document, 'keydown', KillAutoplayEvent]);

    // add all events
    for (let i = 0; i < constants.events.length; i++) {
      constants.events[i][0].addEventListener(
        constants.events[i][1],
        constants.events[i][2]
      );
    }

    // once everything is set up, announce the chart name (or title as a backup) to the user
    if ('name' in singleMaidr) {
      display.announceText(singleMaidr.name);
    } else if ('title' in singleMaidr) {
      display.announceText(singleMaidr.title);
    }
  }
}

function ShouldWeInitMaidr(thisMaidr) {
  // conditions:
  // - maidr isn't enabled (check if singleMaidr is undefined or false)
  // - the chart we're moving to isn't the same as the one we're on
  // note: if we move from one to another, destroy the current first

  if (typeof singleMaidr == 'undefined') {
    // not enabled
    InitMaidr(thisMaidr);
  } else if (!singleMaidr) {
    // not enabled
    InitMaidr(thisMaidr);
  } else if (thisMaidr.id !== singleMaidr.id) {
    // different chart, destroy first
    DestroyMaidr();
    InitMaidr(thisMaidr);
  }
}

function ShouldWeDestroyMaidr(e) {
  // conditions: we're not about to focus on any chart that is maidr enabled, or braille, or review input
  // note: the case where we move from one maidr enabled chart to another is handled by ShouldWeInitMaidr

  // timeout to delay blur event
  setTimeout(() => {
    let focusedElement = document.activeElement;
    if (focusedElement.id) {
      if (maidrIds.includes(focusedElement.id)) {
        return; // about to focus on self, don't destroy
      } else if (focusedElement.id == constants.braille_input_id) {
        return; // about to focus on braille, don't destroy
      } else if (focusedElement.id == constants.review.id) {
        return; // about to focus on review, don't destroy
      } else {
        DestroyMaidr();
      }
    } else {
      // we're focused somewhere on the page that doesn't have an id, which means not maidr, so destroy
      DestroyMaidr();
    }
  }, 0);
}

function DestroyMaidr() {
  // chart cleanup
  if (constants.chartType == 'bar') {
    plot.DeselectAll();
  }

  // remove events
  for (let i = 0; i < constants.events.length; i++) {
    constants.events[i][0].removeEventListener(
      constants.events[i][1],
      constants.events[i][2]
    );
  }
  constants.events = [];

  // remove global vars
  constants.chartId = null;
  constants.chartType = null;
  DestroyChartComponents();

  window.review = null;
  window.display = null;
  window.control = null;
  window.plot = null;
  window.singleMaidr = null;
}
function KillAutoplayEvent(e) {
  // Kill autoplay
  if (
    constants.isMac
      ? e.key == 'Meta' || e.key == 'ContextMenu'
      : e.key == 'Control'
  ) {
    // ctrl (either one)
    constants.KillAutoplay();
  }
}

function CreateChartComponents() {
  // init html stuff. aria live regions, braille input, etc

  // core chart
  let chart = document.getElementById(singleMaidr.id);

  // chart container, we create a parent of chart
  let chart_container = document.createElement('div');
  chart_container.id = constants.chart_container_id;
  // replace chart with chart container, and append chart to chart container
  chart.parentNode.replaceChild(chart_container, chart);
  chart_container.appendChild(chart);
  chart.focus(); // focus used to be on chart and just got lost as we rearranged, so redo focus

  constants.chart = chart;
  constants.chart_container = chart_container;

  // braille input, pre sibling of chart container
  constants.chart_container.insertAdjacentHTML(
    'beforebegin',
    '<div class="hidden" id="' +
      constants.braille_container_id +
      '">\n<input id="' +
      constants.braille_input_id +
      '" class="braille-input" type="text" size="' +
      constants.brailleDisplayLength +
      '" ' +
      'aria-brailleroledescription="" ' + // this kills the 2 char 'edit' that screen readers add
      '/>\n</div>\n'
  );

  // set destruction possibility on braille
  constants.events.push([
    document.getElementById(constants.braille_input_id),
    'blur',
    ShouldWeDestroyMaidr,
  ]);

  // info aria live, next sibling of chart container
  constants.chart_container.insertAdjacentHTML(
    'afterend',
    '<br>\n<div id="' +
      constants.info_id +
      '" aria-live="assertive" aria-atomic="true">\n<p id="x"></p>\n<p id="y"></p>\n</div>\n'
  );

  // announcements, next sibling of info
  document
    .getElementById(constants.info_id)
    .insertAdjacentHTML(
      'afterend',
      '<div id="announcements" aria-live="assertive" aria-atomic="true" class="mb-3"></div>\n'
    );

  // end chime audio element
  document
    .getElementById(constants.info_id)
    .insertAdjacentHTML(
      'afterend',
      '<div class="hidden"> <audio src="../src/terminalBell.mp3" id="end_chime"></audio> </div>'
    );

  // some tweaks
  constants.chart_container.setAttribute('role', 'application');

  // set page elements
  constants.brailleContainer = document.getElementById(
    constants.braille_container_id
  );
  constants.brailleInput = document.getElementById(constants.braille_input_id);
  constants.infoDiv = document.getElementById(constants.info_id);
  constants.announceContainer = document.getElementById(
    constants.announcement_container_id
  );
  constants.nonMenuFocus = constants.chart;
  constants.endChime = document.getElementById(constants.end_chime_id);
}

function DestroyChartComponents() {
  // remove html stuff
  if (constants.chart_container != null) {
    if (constants.chart != null) {
      if (constants.chart_container.parentNode != null) {
        constants.chart_container.parentNode.replaceChild(
          constants.chart,
          constants.chart_container
        );
      }
    }
    constants.chart_container.remove();
  }
  if (constants.brailleContainer != null) {
    constants.brailleContainer.remove();
  }
  if (constants.infoDiv != null) {
    constants.infoDiv.remove();
  }
  if (constants.announceContainer != null) {
    constants.announceContainer.remove();
  }
  if (constants.endChime != null) {
    constants.endChime.remove();
  }

  constants.chart = null;
  constants.chart_container = null;
  constants.brailleContainer = null;
  constants.brailleInput = null;
  constants.infoDiv = null;
  constants.announceContainer = null;
  constants.endChime = null;
}
