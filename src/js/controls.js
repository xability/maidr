class Control {
  constructor() {
    this.SetControls();
  }

  SetControls() {
    // variable initialization
    if ([].concat(singleMaidr.type).includes('bar')) {
      window.position = new Position(-1, -1);
      window.plot = new BarChart();

      let audio = new Audio();

      // global variables
      let lastPlayed = '';
      let lastx = 0;
      let lastKeyTime = 0;
      let pressedL = false;

      // control eventlisteners
      constants.events.push([
        constants.chart,
        'keydown',
        function (e) {
          let updateInfoThisRound = false; // we only update info and play tones on certain keys
          let isAtEnd = false;

          if (e.key == 'ArrowRight') {
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
          } else if (e.key == 'ArrowLeft') {
            // var prevLink = document.getElementById('prev');   // what is prev in the html?
            // if (prevLink) {
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
            // }
          }

          // update display / text / audio
          if (updateInfoThisRound && !isAtEnd) {
            UpdateAll();
          }
          if (isAtEnd) {
            audio.playEnd();
          }
        },
      ]);

      constants.events.push([
        constants.brailleInput,
        'keydown',
        function (e) {
          // We block all input, except if it's B or Tab so we move focus

          let updateInfoThisRound = false; // we only update info and play tones on certain keys
          let isAtEnd = false;

          if (e.key == 'Tab') {
            // tab
            // do nothing, let the user Tab away
          } else if (e.key == 'ArrowRight') {
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
          } else if (e.key == 'ArrowLeft') {
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
        },
      ]);

      // main BTS controls
      let controlElements = [constants.chart, constants.brailleInput];
      for (let i = 0; i < controlElements.length; i++) {
        constants.events.push([
          controlElements[i],
          'keyup',
          function (e) {
            // B: braille mode
            if (e.key == 'b') {
              display.toggleBrailleMode();
              e.preventDefault();
            }
            // keys = (keys || []);
            // keys[e.keyCode] = true;
            // if (keys[84] && !keys[76]) {
            //     display.toggleTextMode();
            // }

            // T: aria live text output mode
            if (e.key == 't') {
              let timediff = window.performance.now() - lastKeyTime;
              if (!pressedL || timediff > constants.keypressInterval) {
                display.toggleTextMode();
              }
            }

            // S: sonification mode
            if (e.key == 's') {
              display.toggleSonificationMode();
            }

            if (e.key == ' ') {
              // space 32, replay info but no other changes
              UpdateAll();
            }
          },
        ]);
      }

      constants.events.push([
        document,
        'keydown',
        function (e) {
          // ctrl/cmd: stop autoplay
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            // (ctrl/cmd)+(home/fn+left arrow): first element
            if (e.key == 'Home') {
              position.x = 0;
              UpdateAllBraille();
            }

            // (ctrl/cmd)+(end/fn+right arrow): last element
            else if (e.key == 'End') {
              position.x = plot.bars.length - 1;
              UpdateAllBraille();
            }
          }

          // must come before prefix L
          if (pressedL) {
            if (e.key == 'x') {
              // X: x label
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayXLabel(plot);
              }
              pressedL = false;
            } else if (e.key == 'y') {
              // Y: y label
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayYLabel(plot);
              }
              pressedL = false;
            } else if (e.key == 't') {
              // T: title
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayTitle(plot);
              }
              pressedL = false;
            } else if (e.key == 'l') {
              lastKeyTime = window.performance.now();
              pressedL = true;
            } else {
              pressedL = false;
            }
          }

          // L: prefix for label; must come after the suffix
          if (e.key == 'l') {
            lastKeyTime = window.performance.now();
            pressedL = true;
          }

          // period: speed up
          if (e.key == '.') {
            constants.SpeedUp();
            display.announceText('Speed up');
          }

          // comma: speed down
          if (e.key == ',') {
            constants.SpeedDown();
            display.announceText('Speed down');
          }
          // /: reset speed
          if (e.key == '/') {
            constants.SpeedReset();
            display.announceText('Speed reset');
          }
        },
      ]);

      function lockPosition() {
        // lock to min / max postions
        let didLockHappen = false;
        if (!constants.hasRect) {
          return didLockHappen;
        }

        if (position.x < 0) {
          position.x = 0;
          didLockHappen = true;
        }
        if (position.x > plot.bars.length - 1) {
          position.x = plot.bars.length - 1;
          didLockHappen = true;
        }

        return didLockHappen;
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
    } else if ([].concat(singleMaidr.type).includes('box')) {
      // variable initialization
      constants.plotId = 'geom_boxplot.gTree.78.1';
      window.plot = new BoxPlot();
      if (constants.plotOrientation == 'vert') {
        window.position = new Position(0, 6); // always 6
      } else {
        window.position = new Position(-1, plot.plotData.length);
      }
      let rect;
      constants.hasRect = false;
      if ('elements' in singleMaidr) {
        rect = new BoxplotRect();
        constants.hasRect = true;
      }
      let audio = new Audio();
      let lastPlayed = '';
      let lastKeyTime = 0;
      let pressedL = false;

      // control eventlisteners
      constants.events.push([
        constants.chart,
        'keydown',
        function (e) {
          let updateInfoThisRound = false; // we only update info and play tones on certain keys
          let isAtEnd = false;

          // right arrow
          // bookmark: need to totally redo the position system for boxplot.
          // We no longer use sectionPos, we use sectionKey.
          // It works by chance, and could probably be made to work,
          // but it's going to get very spaghetti unless we redo it.
          if (e.key == 'ArrowRight') {
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                if (constants.plotOrientation == 'vert') {
                  Autoplay('right', position.x, plot.plotData.length - 1);
                } else {
                  Autoplay('right', position.x, plot.sections.length - 1);
                }
              } else {
                isAtEnd = lockPosition();
                if (constants.plotOrientation == 'vert') {
                  position.x = plot.plotData.length - 1;
                } else {
                  position.x = plot.sections.length - 1;
                }
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
              }
            } else if (constants.plotOrientation == 'vert') {
              if (
                e.altKey &&
                e.shiftKey &&
                plot.sections.length - 1 != position.x
              ) {
                lastY = position.y;
                Autoplay('reverse-right', plot.plotData.length - 1, position.x);
              } else {
                if (position.x == -1 && position.y == plot.sections.length) {
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
                plot.sections.length - 1 != position.x
              ) {
                lastx = position.x;
                Autoplay('reverse-right', plot.sections.length - 1, position.x);
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
          if (e.key == 'ArrowLeft') {
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
          if (e.key == 'ArrowUp') {
            let oldY = position.y;
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                if (constants.plotOrientation == 'vert') {
                  Autoplay('up', position.y, plot.sections.length);
                } else {
                  Autoplay('up', position.y, plot.plotData.length);
                }
              } else {
                if (constants.plotOrientation == 'vert') {
                  position.y = plot.sections.length - 1;
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
                position.y != plot.sections.length - 1
              ) {
                lastY = position.y;
                Autoplay('reverse-up', plot.sections.length - 1, position.y);
              } else {
                position.y += 1;
                updateInfoThisRound = true;
                isAtEnd = lockPosition();
              }
            } else {
              if (
                e.altKey &&
                e.shiftKey &&
                position.y != plot.sections.length - 1
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
          if (e.key == 'ArrowDown') {
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
                if (position.x == -1 && position.y == plot.sections.length) {
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
        },
      ]);

      constants.events.push([
        constants.brailleInput,
        'keydown',
        function (e) {
          // We block all input, except if it's B or Tab so we move focus

          let updateInfoThisRound = false; // we only update info and play tones on certain keys
          let setBrailleThisRound = false;
          let isAtEnd = false;

          if (e.key == 'Tab') {
            // tab
            // do nothing, let the user Tab away
          } else if (e.key == 'ArrowRight') {
            // right arrow
            e.preventDefault();
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                if (constants.plotOrientation == 'vert') {
                  Autoplay('right', position.x, plot.plotData.length - 1);
                } else {
                  Autoplay('right', position.x, plot.sections.length);
                }
              } else {
                if (constants.plotOrientation == 'vert') {
                  position.x = plot.plotData.length - 1;
                } else {
                  position.x = plot.sections.length - 1;
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
                plot.sections.length - 1 != position.x
              ) {
                lastx = position.x;
                Autoplay('reverse-right', plot.sections.length - 1, position.x);
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
          } else if (e.key == 'ArrowLeft') {
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
          } else if (e.key == 'ArrowUp') {
            // up arrow
            let oldY = position.y;
            if (constants.isMac ? e.metaKey : e.ctrlKey) {
              if (e.shiftKey) {
                if (constants.plotOrientation == 'vert') {
                  if (position.x < 0) position.x = 0;
                  Autoplay('up', position.y, plot.sections.length);
                } else {
                  Autoplay('up', position.y, plot.plotData.length);
                }
              } else if (constants.plotOrientation == 'vert') {
                position.y = plot.sections.length - 1;
                updateInfoThisRound = true;
              } else {
                position.y = plot.plotData.length - 1;
                updateInfoThisRound = true;
              }
            } else if (constants.plotOrientation == 'vert') {
              if (
                e.altKey &&
                e.shiftKey &&
                position.y != plot.sections.length - 1
              ) {
                lasY = position.y;
                Autoplay('reverse-up', plot.sections.length - 1, position.y);
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
          } else if (e.key == 'ArrowDown') {
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
                if (position.x == -1 && position.y == plot.sections.length) {
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
        },
      ]);

      // main BTS controls
      let controlElements = [constants.chart, constants.brailleInput];
      for (let i = 0; i < controlElements.length; i++) {
        constants.events.push([
          controlElements[i],
          'keydown',
          function (e) {
            // B: braille mode
            if (e.key == 'b') {
              display.toggleBrailleMode();
              e.preventDefault();
            }
            // T: aria live text output mode
            if (e.key == 't') {
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
            if (e.key == 's') {
              display.toggleSonificationMode();
            }

            if (e.key == ' ') {
              // space 32, replay info but no other changes
              UpdateAll();
            }
          },
        ]);
      }

      constants.events.push([
        document,
        'keydown',
        function (e) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            // (ctrl/cmd)+(home/fn+left arrow): top left element
            if (e.key == 'Home') {
              position.x = 0;
              position.y = plot.sections.length - 1;
              UpdateAllBraille();
            }

            // (ctrl/cmd)+(end/fn+right arrow): right bottom element
            else if (e.key == 'End') {
              position.x = plot.sections.length - 1;
              position.y = 0;
              UpdateAllBraille();
            }
          }

          // must come before the prefix L
          if (pressedL) {
            if (e.key == 'x') {
              // X: x label
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayXLabel(plot);
              }
              pressedL = false;
            } else if (e.key == 'y') {
              // Y: y label
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayYLabel(plot);
              }
              pressedL = false;
            } else if (e.key == 't') {
              // T: title
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayTitle(plot);
              }
              pressedL = false;
            } else if (e.key == 'l') {
              lastKeyTime = window.performance.now();
              pressedL = true;
            } else {
              pressedL = false;
            }
          }

          // L: prefix for label; must come after suffix
          if (e.key == 'l') {
            lastKeyTime = window.performance.now();
            pressedL = true;
          }

          // period: speed up
          if (e.key == '.') {
            constants.SpeedUp();
            display.announceText('Speed up');
          }

          // comma: speed down
          if (e.key == ',') {
            constants.SpeedDown();
            display.announceText('Speed down');
          }
          // /: reset speed
          if (e.key == '/') {
            constants.SpeedReset();
            display.announceText('Speed reset');
          }
        },
      ]);

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
        let didLockHappen = false;
        if (position.y < 0) {
          position.y = 0;
          didLockHappen = true;
        }
        if (position.x < 0) {
          position.x = 0;
          didLockHappen = true;
        }
        if (constants.plotOrientation == 'vert') {
          if (position.x > plot.plotData.length - 1) {
            position.x = plot.plotData.length - 1;
            didLockHappen = true;
          }
          if (position.y > plot.sections.length - 1) {
            position.y = plot.sections.length - 1;
            didLockHappen = true;
          }
        } else {
          if (position.y > plot.plotData.length - 1) {
            position.y = plot.plotData.length - 1;
            didLockHappen = true;
          }
          if (position.x > plot.sections.length - 1) {
            position.x = plot.sections.length - 1;
            didLockHappen = true;
          }
        }

        return didLockHappen;
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
          console.log('starting autoplay', dir, start, end);
        }

        UpdateAllAutoplay(); // play current tone before we move
        constants.autoplayId = setInterval(function () {
          let doneNext = false;
          if (dir == 'left' || dir == 'right' || dir == 'up' || dir == 'down') {
            if (
              (position.x < 1 && dir == 'left') ||
              (constants.plotOrientation == 'vert' &&
                dir == 'up' &&
                position.y > plot.sections.length - 2) ||
              (constants.plotOrientation == 'horz' &&
                dir == 'up' &&
                position.y > plot.plotData.length - 2) ||
              (constants.plotOrientation == 'horz' &&
                dir == 'right' &&
                position.x > plot.sections.length - 2) ||
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
    } else if ([].concat(singleMaidr.type).includes('heat')) {
      // variable initialization
      constants.plotId = 'geom_rect.rect.2.1';
      window.position = new Position(-1, -1);
      window.plot = new HeatMap();
      let rect = new HeatMapRect();
      let audio = new Audio();
      let lastPlayed = '';
      let lastx = 0;
      let lastKeyTime = 0;
      let pressedL = false;

      // control eventlisteners
      constants.events.push([
        constants.chart,
        'keydown',
        function (e) {
          let updateInfoThisRound = false;
          let isAtEnd = false;

          // right arrow 39
          if (e.key == 'ArrowRight') {
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
          if (e.key == 'ArrowLeft') {
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
          if (e.key == 'ArrowUp') {
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
          if (e.key == 'ArrowDown') {
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
        },
      ]);

      constants.events.push([
        constants.brailleInput,
        'keydown',
        function (e) {
          let updateInfoThisRound = false;
          let isAtEnd = false;

          if (e.key == 'Tab') {
            // let user tab
          } else if (e.key == 'ArrowRight') {
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
          } else if (e.key == 'ArrowLeft') {
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
          } else if (e.key == 'ArrowDown') {
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
          } else if (e.key == 'ArrowUp') {
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
        },
      ]);

      // main BTS controls
      let controlElements = [constants.chart, constants.brailleInput];
      for (let i = 0; i < controlElements.length; i++) {
        constants.events.push([
          controlElements[i],
          'keydown',
          function (e) {
            // B: braille mode
            if (e.key == 'b') {
              display.toggleBrailleMode();
              e.preventDefault();
            }
            // keys = (keys || []);
            // keys[e.keyCode] = true;
            // if (keys[84] && !keys[76]) {
            //     display.toggleTextMode();
            // }

            // T: aria live text output mode
            if (e.key == 't') {
              let timediff = window.performance.now() - lastKeyTime;
              if (!pressedL || timediff > constants.keypressInterval) {
                display.toggleTextMode();
              }
            }

            // S: sonification mode
            if (e.key == 's') {
              display.toggleSonificationMode();
            }

            // space: replay info but no other changes
            if (e.key == ' ') {
              UpdateAll();
            }
          },
        ]);
      }

      constants.events.push([
        document,
        'keydown',
        function (e) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            // (ctrl/cmd)+(home/fn+left arrow): first element
            if (e.key == 'Home') {
              position.x = 0;
              position.y = 0;
              UpdateAllBraille();
            }

            // (ctrl/cmd)+(end/fn+right arrow): last element
            else if (e.key == 'End') {
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
            if (e.key == 'x') {
              // X: x label
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayXLabel(plot);
              }
              pressedL = false;
            } else if (e.key == 'y') {
              // Y: y label
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayYLabel(plot);
              }
              pressedL = false;
            } else if (e.key == 't') {
              // T: title
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayTitle(plot);
              }
              pressedL = false;
            } else if (e.key == 'f') {
              // F: fill label
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayFill(plot);
              }
              pressedL = false;
            } else if (e.key == 'l') {
              lastKeyTime = window.performance.now();
              pressedL = true;
            } else {
              pressedL = false;
            }
          }

          // L: prefix for label; must come after suffix
          if (e.key == 'l') {
            lastKeyTime = window.performance.now();
            pressedL = true;
          }

          // period: speed up
          if (e.key == '.') {
            constants.SpeedUp();
            display.announceText('Speed up');
          }

          // comma: speed down
          if (e.key == ',') {
            constants.SpeedDown();
            display.announceText('Speed down');
          }
          // /: reset speed
          if (e.key == '/') {
            constants.SpeedReset();
            display.announceText('Speed reset');
          }
        },
      ]);

      function sleep(time) {
        return new Promise((resolve) => setTimeout(resolve, time));
      }

      // helper functions
      function lockPosition() {
        // lock to min / max postions
        let didLockHappen = false;

        if (position.x < 0) {
          position.x = 0;
          didLockHappen = true;
        }
        if (position.x > plot.num_cols - 1) {
          position.x = plot.num_cols - 1;
          didLockHappen = true;
        }
        if (position.y < 0) {
          position.y = 0;
          didLockHappen = true;
        }
        if (position.y > plot.num_rows - 1) {
          position.y = plot.num_rows - 1;
          didLockHappen = true;
        }

        return didLockHappen;
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
      [].concat(singleMaidr.type).includes('point') ||
      singleMaidr.type == 'point'
    ) {
      // variable initialization
      constants.plotId = 'geom_point.points.12.1';
      window.position = new Position(-1, -1);
      window.plot = new ScatterPlot();
      let audio = new Audio();
      let layer0Point = new Layer0Point();
      let layer1Point = new Layer1Point();

      let lastPlayed = ''; // for autoplay use
      let lastx = 0; // for scatter point layer autoplay use
      let lastx1 = 0; // for smooth layer autoplay use
      let lastKeyTime = 0;
      let pressedL = false;

      window.positionL1 = new Position(lastx1, lastx1);

      // control eventlisteners
      constants.events.push([
        constants.chart,
        'keydown',
        function (e) {
          let updateInfoThisRound = false;
          let isAtEnd = false;

          // left and right arrows are enabled only at point layer
          if (constants.chartType == 'point') {
            // right arrow 39
            if (e.key == 'ArrowRight') {
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
            if (e.key == 'ArrowLeft') {
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
          } else if (constants.chartType == 'smooth') {
            positionL1.x = lastx1;

            if (e.key == 'ArrowRight' && e.shiftKey) {
              if (
                (constants.isMac ? e.metaKey : e.ctrlKey) &&
                constants.sonifMode != 'off'
              ) {
                PlayLine('outward_right');
              } else if (e.altKey && constants.sonifMode != 'off') {
                PlayLine('inward_right');
              }
            }

            if (e.key == 'ArrowLeft' && e.shiftKey) {
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
          if (
            updateInfoThisRound &&
            constants.chartType == 'point' &&
            !isAtEnd
          ) {
            UpdateAll();
          }
          if (isAtEnd) {
            audio.playEnd();
          }
        },
      ]);

      constants.events.push([
        constants.brailleInput,
        'keydown',
        function (e) {
          let updateInfoThisRound = false;
          let isAtEnd = false;

          // @TODO
          // only smooth layer can access to braille display
          if (e.key == 'Tab') {
            // constants.brailleInput.setSelectionRange(positionL1.x, positionL1.x);
          } else if (constants.chartType == 'smooth') {
            lockPosition();
            if (e.key == 'Tab') {
            } else if (e.key == 'ArrowRight') {
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
            } else if (e.key == 'ArrowLeft') {
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
        },
      ]);

      // main BTS controls
      let controlElements = [constants.chart, constants.brailleInput];
      for (let i = 0; i < controlElements.length; i++) {
        constants.events.push([
          controlElements[i],
          'keydown',
          function (e) {
            // B: braille mode
            if (e.key == 'b') {
              display.toggleBrailleMode();
              e.preventDefault();
            }
            // T: aria live text output mode
            if (e.key == 't') {
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
            if (e.key == 's') {
              display.toggleSonificationMode();
            }

            // page down /(fn+down arrow): change chart type (layer)
            if (e.key == 'PageDown' && constants.brailleMode == 'off') {
              lastx1 = positionL1.x;
              display.changeChartLayer('down');
            }

            // page up / (fn+up arrow): change chart type (layer)
            if (e.key == 'PageUp' && constants.brailleMode == 'off') {
              display.changeChartLayer('up');
            }

            // space: replay info but no other changes
            if (e.key == ' ') {
              UpdateAll();
            }
          },
        ]);
      }

      constants.events.push([
        document,
        'keydown',
        function (e) {
          if (constants.isMac ? e.metaKey : e.ctrlKey) {
            // (ctrl/cmd)+(home/fn+left arrow): first element
            if (e.key == 'Home') {
              if (constants.chartType == 'point') {
                position.x = 0;
                UpdateAll();
                // move cursor for braille
                constants.brailleInput.setSelectionRange(0, 0);
              } else if (constants.chartType == 'smooth') {
                positionL1.x = 0;
                UpdateAllBraille();
              }
            }

            // (ctrl/cmd)+(end/fn+right arrow): last element
            else if (e.key == 'End') {
              if (constants.chartType == 'point') {
                position.x = plot.y.length - 1;
                UpdateAll();
                // move cursor for braille
                constants.brailleInput.setSelectionRange(
                  plot.curvePoints.length - 1,
                  plot.curvePoints.length - 1
                );
              } else if (constants.chartType == 'smooth') {
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
            if (e.key == 'x') {
              // X: x label
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayXLabel(plot);
              }
              pressedL = false;
            } else if (e.key == 'y') {
              // Y: y label
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayYLabel(plot);
              }
              pressedL = false;
            } else if (e.key == 't') {
              // T: title
              let timediff = window.performance.now() - lastKeyTime;
              if (pressedL && timediff <= constants.keypressInterval) {
                display.displayTitle(plot);
              }
              pressedL = false;
            } else if (e.key == 'l') {
              lastKeyTime = window.performance.now();
              pressedL = true;
            } else {
              pressedL = false;
            }
          }

          // L: prefix for label
          if (e.key == 'l') {
            lastKeyTime = window.performance.now();
            pressedL = true;
          }

          // period: speed up
          if (e.key == '.') {
            constants.SpeedUp();
            display.announceText('Speed up');
          }

          // comma: speed down
          if (e.key == ',') {
            constants.SpeedDown();
            display.announceText('Speed down');
          }
          // /: reset speed
          if (e.key == '/') {
            constants.SpeedReset();
            display.announceText('Speed reset');
          }
        },
      ]);

      // helper functions
      function lockPosition() {
        // lock to min / max positions
        let didLockHappen = false;
        if (constants.chartType == 'point') {
          if (position.x < 0) {
            position.x = 0;
            didLockHappen = true;
          }
          if (position.x > plot.x.length - 1) {
            position.x = plot.x.length - 1;
            didLockHappen = true;
          }
        } else if (constants.chartType == 'smooth') {
          if (positionL1.x < 0) {
            positionL1.x = 0;
            didLockHappen = true;
          }
          if (positionL1.x > plot.curvePoints.length - 1) {
            positionL1.x = plot.curvePoints.length - 1;
            didLockHappen = true;
          }
        }

        return didLockHappen;
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
          if (constants.chartType == 'point') {
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

        if (constants.chartType == 'point') {
          constants.autoplayId = setInterval(function () {
            position.x += step;
            // autoplay for two layers: point layer & smooth layer in braille
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
        } else if (constants.chartType == 'smooth') {
          constants.autoplayId = setInterval(function () {
            positionL1.x += step;
            // autoplay for two layers: point layer & smooth layer in braille
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
}
