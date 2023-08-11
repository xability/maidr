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
    if (constants.chartType == 'scatter') {
      this.announceText('Braille is not supported in point layer.');
      return;
    }
    if (typeof onoff === 'undefined') {
      if (typeof constants.brailleMode === 'undefined') {
        constants.brailleMode = 'off';
        onoff = constants.brailleMode == 'on';
      } else {
        // switch on/off
        if (constants.brailleMode == 'on') {
          onoff = 'off';
        } else {
          onoff = 'on';
        }
        constants.brailleMode = onoff;
      }
    }
    if (onoff == 'on') {
      if (constants.chartType == 'box') {
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
      document
        .getElementById(constants.braille_container_id)
        .classList.remove('hidden');
      constants.brailleInput.focus();
      constants.brailleInput.setSelectionRange(position.x, position.x);

      this.SetBraille(plot);

      if (constants.chartType == 'heat') {
        let pos = position.y * (plot.num_cols + 1) + position.x;
        constants.brailleInput.setSelectionRange(pos, pos);
      }

      // braille mode is on before navigation of chart
      // very important to make sure braille works properly
      if (position.x == -1 && position.y == -1) {
        constants.brailleInput.setSelectionRange(0, 0);
      }
    } else {
      constants.brailleMode = 'off';
      document
        .getElementById(constants.braille_container_id)
        .classList.add('hidden');

      if (constants.review_container) {
        if (!constants.review_container.classList.contains('hidden')) {
          constants.review.focus();
        } else {
          constants.chart.focus();
        }
      } else {
        constants.chart.focus();
      }
    }

    this.announceText('Braille ' + constants.brailleMode);
  }

  toggleSonificationMode() {
    if (constants.chartType == 'scatter') {
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

  changeChartLayer(updown = 'down') {
    // get possible chart types, where we are, and move between them
    let chartTypes = maidr.type;
    if (Array.isArray(chartTypes)) {
      let currentIndex = chartTypes.indexOf(constants.chartType);
      if (updown == 'down') {
        if (currentIndex == 0) {
          constants.chartType = chartTypes[chartTypes.length - 1];
        } else {
          constants.chartType = chartTypes[currentIndex - 1];
        }
      } else {
        if (currentIndex == chartTypes.length - 1) {
          constants.chartType = chartTypes[0];
        } else {
          constants.chartType = chartTypes[currentIndex + 1];
        }
      }
      this.announceText('Switched to ' + constants.chartType); // todo: connect this to a resource file so it can be localized
    }
  }

  announceText(txt) {
    constants.announceContainer.innerHTML = txt;
  }

  UpdateBraillePos() {
    if (constants.chartType == 'bar') {
      constants.brailleInput.setSelectionRange(position.x, position.x);
    } else if (constants.chartType == 'heat') {
      let pos = position.y * (plot.num_cols + 1) + position.x;
      constants.brailleInput.setSelectionRange(pos, pos);
    } else if (constants.chartType == 'box') {
      // on box we extend characters a lot and have blanks, so we go to our label
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
    } else if (constants.chartType == 'scatter') {
      constants.brailleInput.setSelectionRange(positionL1.x, positionL1.x);
    }
  }

  displayValues(plot) {
    // we build an html text string to output to both visual users and aria live based on what chart we're on, our position, and the mode
    // note: we do this all as one string rather than changing individual element IDs so that aria-live receives a single update

    let output = '';
    let verboseText = '';
    let reviewText = '';
    if (constants.chartType == 'bar') {
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
    } else if (constants.chartType == 'heat') {
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
    } else if (constants.chartType == 'box') {
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
    } else if (constants.chartType == 'scatter') {
      if (constants.chartType == 'scatter') {
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
      } else if (constants.chartType == 'line') {
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
    if (constants.chartType == 'bar') {
      xlabel = plot.plotLegend.x;
    } else if (
      constants.chartType == 'heat' ||
      constants.chartType == 'box' ||
      constants.chartType == 'scatter'
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
    if (constants.chartType == 'bar') {
      ylabel = plot.plotLegend.y;
    } else if (
      constants.chartType == 'heat' ||
      constants.chartType == 'box' ||
      constants.chartType == 'scatter'
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
      if (constants.chartType == 'heat') {
        constants.infoDiv.innerHTML = '<p>' + plot.box_label + '<p>';
      }
    } else if (constants.textMode == 'verbose') {
      if (constants.chartType == 'heat') {
        constants.infoDiv.innerHTML =
          '<p>Fill label is ' + plot.box_label + '<p>';
      }
    }
  }

  SetBraille(plot) {
    let brailleArray = [];

    if (constants.chartType == 'heat') {
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
    } else if (constants.chartType == 'bar') {
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
    } else if (constants.chartType == 'line') {
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
    } else if (constants.chartType == 'box' && position.y > -1) {
      // only run if we're on a plot
      // Idea here is to use different braille characters to physically represent the box
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
