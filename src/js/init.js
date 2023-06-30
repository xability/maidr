// events and init functions
document.addEventListener("DOMContentLoaded", function (e) {
  // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

  // create global vars
  window.constants = new Constants();
  window.resources = new Resources();
  window.menu = new Menu();
  window.tracker = new Tracker();

  // run events and functions only on user study page
  if (document.getElementById("download_data_trigger")) {
    document
      .getElementById("download_data_trigger")
      .addEventListener("click", function (e) {
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
    let allClose = document.querySelectorAll("#close_menu, #menu .close");
    for (let i = 0; i < allClose.length; i++) {
      allClose[i].addEventListener("click", function (e) {
        menu.Toggle(false);
      });
    }
    document
      .getElementById("save_and_close_menu")
      .addEventListener("click", function (e) {
        menu.SaveData();
        menu.Toggle(false);
      });
    document.getElementById("menu").addEventListener("keydown", function (e) {
      if (e.which == 27) {
        // esc
        menu.Toggle(false);
        svg.focus();
      }
    });

    // save user focus so we can return after menu close
    let allFocus = document.querySelectorAll(
      "#" +
        constants.svg_container_id +
        " > svg, #" +
        constants.braille_input_id
    );
    for (let i = 0; i < allFocus.length; i++) {
      allFocus[i].addEventListener("focus", function (e) {
        constants.nonMenuFocus = allFocus[i];
      });
    }

    // Global events for pages with svg
    document.addEventListener("keydown", function (e) {
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
        if (constants.review_container.classList.contains("hidden")) {
          review.ToggleReviewMode(true);
        } else {
          review.ToggleReviewMode(false);
        }
      }
    });
  }

  // global events for all files
  document.addEventListener("keydown", function (e) {
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
