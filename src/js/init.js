// events and init functions
// we do some setup, but most of the work is done when user focuses on an element matching an id from maidr user data
document.addEventListener('DOMContentLoaded', function (e) {
  // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

  // create global vars
  window.constants = new Constants();
  window.resources = new Resources();
  window.menu = new Menu();
  window.tracker = new Tracker();

  // set focus events for all svgs matching maidr ids
  let maidrObjects = [];
  if (typeof maidr == 'object') {
    maidrObjects.push(maidr);
  } else if (typeof maidr == 'array') {
    for (let i = 0; i < maidr.length; i++) {
      maidrObjects.push(maidr[i]);
    }
  }
  // set focus events for all maidr ids
  for (let i = 0; i < maidrObjects.length; i++) {
    let maidrId = maidrObjects[i].id;
    let maidrElemn = document.getElementById(maidrId);
    if (maidrElemn) {
      maidrElemn.addEventListener('focus', function (e) {
        InitMaidr(maidrObjects[i]);
      });
      maidrElemn.addEventListener('blur', function (e) {
        DestroyMaidr();
      });
    }
  }

  // events etc for user study page
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
        (e.which == 116 && (constants.isMac ? e.metaKey : e.ctrlKey)) ||
        (e.which == 82 &&
          e.shiftKey &&
          (constants.isMac ? e.metaKey : e.ctrlKey))
      ) {
        e.preventDefault();
        tracker.Delete();
        location.reload(true);
      }

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

      // Stuff to only run if we're on a chart (so check if the info div exists?)
      if (document.getElementById('info')) {
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
      }
    });
  }
});

function InitMaidr(maidrObj) {
  // just in case
  if (typeof constants != 'undefined') {
    // init vars and html
    constants.chartId = maidrObj.id;
    constants.chartType = maidrObj.type;
    CreateChartComponents();
    window.review = new Review();
    window.display = new Display();
    window.controls = new Controls();
    controls.SetControls();

    // initialize braille mode on page load
    display.toggleBrailleMode('on');

    constants.events.push([
      constants.svg_container,
      'keydown',
      function (e) {
        // Menu open
        if (e.which == 72) {
          // M(77) for menu, or H(72) for help? I don't like it
          menu.Toggle(true);
        }
      },
    ]);

    // add all events
    for (let i = 0; i < constants.events.length; i++) {
      constants.events[i][0].addEventListener(
        constants.events[i][1],
        constants.events[i][2]
      );
    }
  }
}

function DestroyMaidr() {
  // remove events
  for (let i = 0; i < constants.events.length; i++) {
    constants.events[i][0].removeEventListener(
      constants.events[i][1],
      constants.events[i][2]
    );
  }

  // remove global vars
  constants.chartId = null;
  constants.chartType = null;
  DestroyChartComponents();

  window.review = null;
  window.display = null;
  window.controls = null;
  window.plot = null;
}

function CreateChartComponents() {
  // init html stuff. aria live regions, braille input, etc

  // core svg
  constants.svg = document.getElementById(constants.chartId);

  // svg container, we create a parent of svg
  constants.svg_container = document.createElement('div');
  constants.svg_container.id = constants.svg_container_id;
  // replace svg with svg container, and append svg to svg container
  constants.svg.parentNode.replaceChild(constants.svg_container, constants.svg);
  constants.svg_container.appendChild(constants.svg);

  // braille input, pre sibling of svg container
  constants.svg_container.insertAdjacentHTML(
    'beforebegin',
    '<div id="' +
      constants.braille_container_id +
      '">\n<input id="' +
      constants.braille_input_id +
      '" class="braille-input hidden" type="text" size="' +
      constants.brailleDisplayLength +
      '" />\n</div>\n'
  );

  // info aria live, next sibling of svg container
  constants.svg_container.insertAdjacentHTML(
    'afterend',
    '<br>\n<div id="info" aria-live="assertive" aria-atomic="true">\n<p id="x"></p>\n<p id="y"></p>\n</div>\n'
  );

  // announcements, next sibling of info
  document
    .getElementById('info')
    .insertAdjacentHTML(
      'afterend',
      '<div id="announcements" aria-live="assertive" aria-atomic="true"></div>\n'
    );

  // end chime audio element
  document
    .getElementById(this.info_id)
    .insertAdjacentHTML(
      'afterend',
      '<div class="hidden"> <audio src="../src/terminalBell.mp3" id="end_chime"></audio> </div>'
    );

  // some tweaks
  constants.svg_container.setAttribute('role', 'application');

  // set page elements
  constants.brailleContainer = document.getElementById(
    constants.braille_container_id
  );
  constants.brailleInput = document.getElementById(constants.braille_input_id);
  constants.infoDiv = document.getElementById(constants.info_id);
  constants.announceContainer = document.getElementById(
    constants.announcement_container_id
  );
  constants.nonMenuFocus = constants.svg;
  constants.endChime = document.getElementById(constants.end_chime_id);
}

function DestroyChartComponents() {
  // remove html stuff
  constants.svg_container.parentNode.replaceChild(
    constants.svg,
    constants.svg_container
  );
  constants.svg_container.remove();
  constants.brailleContainer.remove();
  constants.infoDiv.remove();
  constants.announceContainer.remove();
  constants.endChime.remove();

  constants.svg = null;
  constants.svg_container = null;
  constants.brailleContainer = null;
  constants.brailleInput = null;
  constants.infoDiv = null;
  constants.announceContainer = null;
  constants.endChime = null;
}
