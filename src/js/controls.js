document.addEventListener("DOMContentLoaded", function (e) {
  // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything

  // variable initialization

  if (typeof maidr !== "undefined") {
    if ("type" in maidr) {
      constants.chartType = maidr.type;
    }
  }

  if (typeof constants.chartType !== "undefined") {
    if (constants.chartType == "barplot") {
      window.position = new Position(-1, -1);
      window.plot = new BarChart();

      let audio = new Audio();

      // global variables
      let lastPlayed = "";
      let lastx = 0;
      let lastKeyTime = 0;
      let pressedL = false;

      // control eventlisteners
      constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false; // we only update info and play tones on certain keys
        let isAtEnd = false;

        if (e.which === 39) {
          // right arrow 39
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              // lastx = position.x;
              position.x -= 1;
              Autoplay("right", position.x, plot.bars.length);
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
            Autoplay("reverse-right", plot.bars.length, position.x);
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
              Autoplay("left", position.x, -1);
            } else {
              position.x = 0; // go all the way
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.x != 0) {
            lastx = position.x;
            Autoplay("reverse-left", -1, position.x);
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

      constants.brailleInput.addEventListener("keydown", function (e) {
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
              Autoplay("right", position.x, plot.bars.length);
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
            Autoplay("reverse-right", plot.bars.length, position.x);
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
              Autoplay("left", position.x, -1);
            } else {
              position.x = 0; // go all the way
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.x != 0) {
            lastx = position.x;
            Autoplay("reverse-left", -1, position.x);
          } else {
            position.x += -1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }
        } else {
          e.preventDefault();
        }

        // auto turn off braille mode if we leave the braille box
        constants.brailleInput.addEventListener("focusout", function (e) {
          display.toggleBrailleMode("off");
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
        controlElements[i].addEventListener("keydown", function (e) {
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

      document.addEventListener("keydown", function (e) {
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
            if (lastPlayed == "reverse-left") {
              Autoplay("right", position.x, lastx);
            } else if (lastPlayed == "reverse-right") {
              Autoplay("left", position.x, lastx);
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
            if (lastPlayed == "reverse-left") {
              Autoplay("right", position.x, lastx);
            } else if (lastPlayed == "reverse-right") {
              Autoplay("left", position.x, lastx);
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
        if (constants.sonifMode != "off") {
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
        if (constants.sonifMode != "off") {
          audio.playTone();
        }

        if (constants.brailleMode != "off") {
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
        if (constants.sonifMode != "off") {
          audio.playTone();
        }
        display.UpdateBraillePos(plot);
      }
      function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right and reverse-left
        if (dir == "left" || dir == "reverse-right") {
          step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId != null) {
          constants.KillAutoplay();
        }

        if (dir == "reverse-right" || dir == "reverse-left") {
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
    } else if (constants.chartType == "boxplot") {
      // variable initialization
      constants.plotId = "geom_boxplot.gTree.78.1";
      window.plot = new BoxPlot();
      constants.chartType = "boxplot";
      if (constants.plotOrientation == "vert") {
        window.position = new Position(0, plot.plotData[0].length - 1);
      } else {
        window.position = new Position(-1, plot.plotData.length);
      }
      let rect = new BoxplotRect();
      let audio = new Audio();
      let lastPlayed = "";
      let lastY = 0;
      let lastx = 0;
      let lastKeyTime = 0;
      let pressedL = false;

      // control eventlisteners
      constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false; // we only update info and play tones on certain keys
        let isAtEnd = false;

        // right arrow
        if (e.which === 39) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              if (constants.plotOrientation == "vert") {
                Autoplay("right", position.x, plot.plotData.length - 1);
              } else {
                Autoplay("right", position.x, plot.plotData[position.y].length);
              }
            } else {
              isAtEnd = lockPosition();
              if (constants.plotOrientation == "vert") {
                position.x = plot.plotData.length - 1;
              } else {
                position.x = plot.plotData[position.y].length - 1;
              }
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (constants.plotOrientation == "vert") {
            if (
              e.altKey &&
              e.shiftKey &&
              plot.plotData.length - 1 != position.x
            ) {
              lastY = position.y;
              Autoplay("reverse-right", plot.plotData.length - 1, position.x);
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
                "reverse-right",
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
              Autoplay("left", position.x, -1);
            } else {
              position.x = 0;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.x > 0) {
            if (constants.plotOrientation == "vert") {
              lastY = position.y;
            } else {
              lastx = position.x;
            }
            Autoplay("reverse-left", 0, position.x);
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
              if (constants.plotOrientation == "vert") {
                Autoplay("up", position.y, plot.plotData[position.x].length);
              } else {
                Autoplay("up", position.y, plot.plotData.length);
              }
            } else {
              if (constants.plotOrientation == "vert") {
                position.y = plot.plotData[position.x].length - 1;
              } else {
                position.y = plot.plotData.length - 1;
              }
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (constants.plotOrientation == "vert") {
            if (
              e.altKey &&
              e.shiftKey &&
              position.y != plot.plotData[position.x].length - 1
            ) {
              lastY = position.y;
              Autoplay(
                "reverse-up",
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
              Autoplay("reverse-up", plot.plotData.length - 1, position.y);
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
              Autoplay("down", position.y, -1);
            } else {
              position.y = 0;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.y != 0) {
            if (constants.plotOrientation == "vert") {
              lastY = position.y;
            } else {
              lastx = position.x;
            }
            Autoplay("reverse-down", 0, position.y);
          } else {
            if (constants.plotOrientation == "vert") {
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

      constants.brailleInput.addEventListener("keydown", function (e) {
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
              if (constants.plotOrientation == "vert") {
                Autoplay("right", position.x, plot.plotData.length - 1);
              } else {
                Autoplay("right", position.x, plot.plotData[position.y].length);
              }
            } else {
              if (constants.plotOrientation == "vert") {
                position.x = plot.plotData.length - 1;
              } else {
                position.x = plot.plotData[position.y].length - 1;
              }
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (constants.plotOrientation == "vert") {
            if (
              e.altKey &&
              e.shiftKey &&
              plot.plotData.length - 1 != position.x
            ) {
              lastY = position.y;
              Autoplay("reverse-right", plot.plotData.length - 1, position.x);
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
                "reverse-right",
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
              Autoplay("left", position.x, -1);
            } else {
              position.x = 0;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.x > 0) {
            if (constants.plotOrientation == "vert") {
              lastY = position.y;
            } else {
              lastx = position.x;
            }
            Autoplay("reverse-left", 0, position.x);
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
              if (constants.plotOrientation == "vert") {
                if (position.x < 0) position.x = 0;
                Autoplay("up", position.y, plot.plotData[position.x].length);
              } else {
                Autoplay("up", position.y, plot.plotData.length);
              }
            } else if (constants.plotOrientation == "vert") {
              position.y = plot.plotData[position.x].length - 1;
              updateInfoThisRound = true;
            } else {
              position.y = plot.plotData.length - 1;
              updateInfoThisRound = true;
            }
          } else if (constants.plotOrientation == "vert") {
            if (
              e.altKey &&
              e.shiftKey &&
              position.y != plot.plotData[position.x].length - 1
            ) {
              lasY = position.y;
              Autoplay(
                "reverse-up",
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
              Autoplay("reverse-up", plot.plotData.length - 1, position.y);
            } else {
              position.y += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          }
          if (constants.plotOrientation == "vert") {
          } else {
            setBrailleThisRound = true;
          }
          constants.navigation = 0;
        } else if (e.which === 40) {
          // down arrow
          let oldY = position.y;
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              Autoplay("down", position.y, -1);
            } else {
              position.y = 0;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            }
          } else if (e.altKey && e.shiftKey && position.y != 0) {
            if (constants.plotOrientation == "vert") {
              lastY = position.y;
            } else {
              lastx = position.x;
            }
            Autoplay("reverse-down", 0, position.y);
          } else {
            if (constants.plotOrientation == "vert") {
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
          if (constants.plotOrientation == "vert") {
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
        constants.brailleInput.addEventListener("focusout", function (e) {
          display.toggleBrailleMode("off");
        });
      });

      // var keys;
      let controlElements = [constants.svg_container, constants.brailleInput];
      for (let i = 0; i < controlElements.length; i++) {
        controlElements[i].addEventListener("keydown", function (e) {
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

      document.addEventListener("keydown", function (e) {
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
            if (lastPlayed == "reverse-left") {
              if (constants.plotOrientation == "vert") {
                Autoplay("right", position.y, lastY);
              } else {
                Autoplay("right", position.x, lastx);
              }
            } else if (lastPlayed == "reverse-right") {
              if (constants.plotOrientation == "vert") {
                Autoplay("left", position.y, lastY);
              } else {
                Autoplay("left", position.x, lastx);
              }
            } else if (lastPlayed == "reverse-up") {
              if (constants.plotOrientation == "vert") {
                Autoplay("down", position.y, lastY);
              } else {
                Autoplay("down", position.x, lastx);
              }
            } else if (lastPlayed == "reverse-down") {
              if (constants.plotOrientation == "vert") {
                Autoplay("up", position.y, lastY);
              } else {
                Autoplay("up", position.x, lastx);
              }
            } else {
              if (constants.plotOrientation == "vert") {
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
            if (lastPlayed == "reverse-left") {
              if (constants.plotOrientation == "vert") {
                Autoplay("right", position.y, lastY);
              } else {
                Autoplay("right", position.x, lastx);
              }
            } else if (lastPlayed == "reverse-right") {
              if (constants.plotOrientation == "vert") {
                Autoplay("left", position.y, lastY);
              } else {
                Autoplay("left", position.x, lastx);
              }
            } else if (lastPlayed == "reverse-up") {
              if (constants.plotOrientation == "vert") {
                Autoplay("down", position.y, lastY);
              } else {
                Autoplay("down", position.x, lastx);
              }
            } else if (lastPlayed == "reverse-down") {
              if (constants.plotOrientation == "vert") {
                Autoplay("up", position.y, lastY);
              } else {
                Autoplay("up", position.x, lastx);
              }
            } else {
              if (constants.plotOrientation == "vert") {
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
        if (constants.sonifMode != "off") {
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
        if (constants.sonifMode != "off") {
          plot.PlayTones(audio);
        }
        if (constants.brailleMode != "off") {
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
        if (constants.sonifMode != "off") {
          plot.PlayTones(audio);
        }
        display.UpdateBraillePos(plot);
      }
      function lockPosition() {
        // lock to min / max postions
        let isLockNeeded = false;
        if (constants.plotOrientation == "vert") {
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
          let oldLabel = "";
          if ("label" in plot.plotData[yOld][position.x]) {
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
          dir == "left" ||
          dir == "down" ||
          dir == "reverse-right" ||
          dir == "reverse-up"
        ) {
          step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId != null) {
          constants.KillAutoplay();
        }

        if (dir == "reverse-left" || dir == "reverse-right") {
          position.x = start;
        } else if (dir == "reverse-up" || dir == "reverse-down") {
          position.y = start;
        }

        if (constants.debugLevel > 0) {
          console.log("starting autoplay", dir);
        }

        UpdateAllAutoplay(); // play current tone before we move
        constants.autoplayId = setInterval(function () {
          let doneNext = false;
          if (dir == "left" || dir == "right" || dir == "up" || dir == "down") {
            if (
              (position.x < 1 && dir == "left") ||
              (constants.plotOrientation == "vert" &&
                dir == "up" &&
                position.y > plot.plotData[position.x].length - 2) ||
              (constants.plotOrientation == "horz" &&
                dir == "up" &&
                position.y > plot.plotData.length - 2) ||
              (constants.plotOrientation == "horz" &&
                dir == "right" &&
                position.x > plot.plotData[position.y].length - 2) ||
              (constants.plotOrientation == "vert" &&
                dir == "right" &&
                position.x > plot.plotData.length - 2) ||
              (constants.plotOrientation == "horz" &&
                dir == "down" &&
                position.y < 1) ||
              (constants.plotOrientation == "vert" &&
                dir == "down" &&
                position.y < 1)
            ) {
              doneNext = true;
            }
          } else {
            if (
              (dir == "reverse-left" && position.x >= end) ||
              (dir == "reverse-right" && position.x <= end) ||
              (dir == "reverse-up" && position.y <= end) ||
              (dir == "reverse-down" && position.y >= end)
            ) {
              doneNext = true;
            }
          }

          if (doneNext) {
            constants.KillAutoplay();
          } else {
            if (
              dir == "left" ||
              dir == "right" ||
              dir == "reverse-left" ||
              dir == "reverse-right"
            ) {
              position.x += step;
            } else {
              position.y += step;
            }
            UpdateAllAutoplay();
          }
          if (constants.debugLevel > 5) {
            console.log("autoplay pos", position);
          }
        }, constants.autoPlayRate);
      }
    } else if (constants.chartType == "heatmap") {
      // variable initialization
      constants.plotId = "geom_rect.rect.2.1";
      window.position = new Position(-1, -1);
      window.plot = new HeatMap();
      constants.chartType = "heatmap";
      let rect = new HeatMapRect();
      let audio = new Audio();
      let lastPlayed = "";
      let lastx = 0;
      let lastKeyTime = 0;
      let pressedL = false;

      // control eventlisteners
      constants.svg_container.addEventListener("keydown", function (e) {
        let updateInfoThisRound = false;
        let isAtEnd = false;

        // right arrow 39
        if (e.which === 39) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            if (e.shiftKey) {
              // lastx = position.x;
              position.x -= 1;
              Autoplay("right", position.x, plot.num_cols);
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
            Autoplay("reverse-right", plot.num_cols, position.x);
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
              Autoplay("left", position.x, -1);
            } else {
              position.x = 0;
              updateInfoThisRound = true;
            }
          } else if (e.altKey && e.shiftKey && position.x != 0) {
            lastx = position.x;
            Autoplay("reverse-left", -1, position.x);
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
              Autoplay("up", position.y, -1);
            } else {
              position.y = 0;
              updateInfoThisRound = true;
            }
          } else if (e.altKey && e.shiftKey && position.y != 0) {
            lastx = position.x;
            Autoplay("reverse-up", -1, position.y);
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
              Autoplay("down", position.y, plot.num_rows);
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
            Autoplay("reverse-down", plot.num_rows, position.y);
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

      constants.brailleInput.addEventListener("keydown", function (e) {
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
            ) == "⠳"
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
                Autoplay("right", position.x, plot.num_cols);
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
              Autoplay("reverse-right", plot.num_cols, position.x);
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
            ) == "⠳"
          ) {
            e.preventDefault();
          } else {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                // lastx = position.x;
                position.x += 1;
                Autoplay("left", position.x, -1);
              } else {
                position.x = 0;
                updateInfoThisRound = true;
              }
            } else if (e.altKey && e.shiftKey && position.x != 0) {
              lastx = position.x;
              Autoplay("reverse-left", -1, position.x);
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
                Autoplay("down", position.y, plot.num_rows);
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
              Autoplay("reverse-down", plot.num_rows, position.y);
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
                Autoplay("up", position.y, -1);
              } else {
                position.y = 0;
                updateInfoThisRound = true;
              }
            } else if (e.altKey && e.shiftKey && position.y != 0) {
              lastx = position.x;
              Autoplay("reverse-up", -1, position.y);
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
        constants.brailleInput.addEventListener("focusout", function (e) {
          display.toggleBrailleMode("off");
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
        controlElements[i].addEventListener("keydown", function (e) {
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

      document.addEventListener("keydown", function (e) {
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
            if (lastPlayed == "reverse-left") {
              Autoplay("right", position.x, lastx);
            } else if (lastPlayed == "reverse-right") {
              Autoplay("left", position.x, lastx);
            } else if (lastPlayed == "reverse-up") {
              Autoplay("down", position.x, lastx);
            } else if (lastPlayed == "reverse-down") {
              Autoplay("up", position.x, lastx);
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
            if (lastPlayed == "reverse-left") {
              Autoplay("right", position.x, lastx);
            } else if (lastPlayed == "reverse-right") {
              Autoplay("left", position.x, lastx);
            } else if (lastPlayed == "reverse-up") {
              Autoplay("down", position.x, lastx);
            } else if (lastPlayed == "reverse-down") {
              Autoplay("up", position.x, lastx);
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
        if (constants.sonifMode != "off") {
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
        if (constants.sonifMode != "off") {
          audio.playTone();
        }
        if (constants.brailleMode != "off") {
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
        if (constants.sonifMode != "off") {
          audio.playTone();
        }
        display.UpdateBraillePos(plot);
      }

      function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right, down, reverse-left, and reverse-up
        if (
          dir == "left" ||
          dir == "up" ||
          dir == "reverse-right" ||
          dir == "reverse-down"
        ) {
          step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId != null) {
          constants.KillAutoplay();
        }

        if (dir == "reverse-left" || dir == "reverse-right") {
          position.x = start;
        } else if (dir == "reverse-up" || dir == "reverse-down") {
          position.y = start;
        }

        constants.autoplayId = setInterval(function () {
          if (
            dir == "left" ||
            dir == "right" ||
            dir == "reverse-left" ||
            dir == "reverse-right"
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
      constants.chartType == "scatterplot" ||
      constants.chartType.includes("scatterplot")
    ) {
      // variable initialization
      constants.plotId = "geom_point.points.12.1";
      window.position = new Position(-1, -1);
      window.plot = new ScatterPlot();
      constants.chartType = "scatterplot";
      let audio = new Audio();
      let layer0Point = new Layer0Point();
      let layer1Point = new Layer1Point();

      let lastPlayed = ""; // for autoplay use
      let lastx = 0; // for layer 1 autoplay use
      let lastx1 = 0; // for layer 2 autoplay use
      let lastKeyTime = 0;
      let pressedL = false;

      window.positionL1 = new Position(lastx1, lastx1);

      // control eventlisteners
      constants.svg_container.addEventListener("keydown", function (e) {
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
                Autoplay("outward_right", position.x, plot.x.length);
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
              Autoplay("inward_right", plot.x.length, position.x);
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
                Autoplay("outward_left", position.x, -1);
              } else {
                position.x = 0;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
              }
            } else if (e.altKey && e.shiftKey && position.x != 0) {
              lastx = position.x;
              Autoplay("inward_left", -1, position.x);
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
              constants.sonifMode != "off"
            ) {
              PlayLine("outward_right");
            } else if (e.altKey && constants.sonifMode != "off") {
              PlayLine("inward_right");
            }
          }

          if (e.which == 37 && e.shiftKey) {
            if (
              (constants.isMac ? e.metaKey : e.ctrlKey) &&
              constants.sonifMode != "off"
            ) {
              PlayLine("outward_left");
            } else if (e.altKey && constants.sonifMode != "off") {
              PlayLine("inward_left");
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

      constants.brailleInput.addEventListener("keydown", function (e) {
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
                  "outward_right",
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
              Autoplay("inward_right", plot.curvePoints.length, positionL1.x);
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
                Autoplay("outward_left", positionL1.x, -1);
              } else {
                positionL1.x = 0; // go all the way
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
              }
            } else if (e.altKey && e.shiftKey && positionL1.x != 0) {
              Autoplay("inward_left", -1, positionL1.x);
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
        constants.brailleInput.addEventListener("focusout", function (e) {
          display.toggleBrailleMode("off");
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
        controlElements[i].addEventListener("keydown", function (e) {
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
            constants.brailleMode == "off"
          ) {
            lastx1 = positionL1.x;
            display.toggleLayerMode();
          }

          // page up / (fn+up arrow): line layer(2)
          if (
            e.which == 33 &&
            constants.layer == 1 &&
            constants.brailleMode == "off"
          ) {
            display.toggleLayerMode();
          }

          // space: replay info but no other changes
          if (e.which === 32) {
            UpdateAll();
          }
        });
      }

      document.addEventListener("keydown", function (e) {
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
            if (lastPlayed == "inward_left") {
              if (constants.layer == 1) {
                Autoplay("outward_right", position.x, lastx);
              } else if (constants.layer == 2) {
                Autoplay("outward_right", positionL1.x, lastx1);
              }
            } else if (lastPlayed == "inward_right") {
              if (constants.layer == 1) {
                Autoplay("outward_left", position.x, lastx);
              } else if (constants.layer == 2) {
                Autoplay("outward_left", positionL1.x, lastx1);
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
            if (lastPlayed == "inward_left") {
              if (constants.layer == 1) {
                Autoplay("outward_right", position.x, lastx);
              } else if (constants.layer == 2) {
                Autoplay("outward_right", positionL1.x, lastx1);
              }
            } else if (lastPlayed == "inward_right") {
              if (constants.layer == 1) {
                Autoplay("outward_left", position.x, lastx);
              } else if (constants.layer == 2) {
                Autoplay("outward_left", positionL1.x, lastx1);
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
        if (constants.sonifMode != "off") {
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
        if (constants.sonifMode != "off") {
          plot.PlayTones(audio);
        }
        if (constants.brailleMode != "off") {
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
        if (constants.sonifMode != "off") {
          plot.PlayTones(audio);
        }
        display.UpdateBraillePos(plot);
      }

      function Autoplay(dir, start, end) {
        lastPlayed = dir;
        let step = 1; // default right and reverse left
        if (dir == "outward_left" || dir == "inward_right") {
          step = -1;
        }

        // clear old autoplay if exists
        if (constants.autoplayId) {
          constants.KillAutoplay();
        }
        if (constants.isSmoothAutoplay) {
          audio.KillSmooth();
        }

        if (dir == "inward_left" || dir == "inward_right") {
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
        if (dir == "outward_right") {
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
        } else if (dir == "outward_left") {
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
        } else if (dir == "inward_right") {
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
        } else if (dir == "inward_left") {
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
        audio.playSmooth(freqArr, duration, panningArr, constants.vol, "sine");
      }
    }
  }
});
