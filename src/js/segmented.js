class Segmented {
  constructor() {
    // initialize variables level, data, and elements
    let level = null;
    let fill = null;
    let data = null;
    let elements = null;
    if ('axes' in singleMaidr) {
      //axes.x.level
      if ('x' in singleMaidr.axes) {
        if ('level' in singleMaidr.axes.x) {
          level = singleMaidr.axes.x.level;
        }
      } else if ('y' in singleMaidr.axes) {
        if ('level' in singleMaidr.axes.y) {
          level = singleMaidr.axes.y.level;
        }
      }
      // axes.fill
      if ('fill' in singleMaidr.axes) {
        if ('level' in singleMaidr.axes.fill) {
          fill = singleMaidr.axes.fill.level;
        }
      }
    }
    if ('data' in singleMaidr) {
      data = singleMaidr.data;
    }
    if ('elements' in singleMaidr) {
      elements = singleMaidr.elements;
    }

    // gracefull failure: must have level + fill + data, elements optional
    if (elements == null) {
      LogError.LogAbsentElement('elements');
      constants.hasRect = 0;
    }
    if (level != null && fill != null && data != null) {
      this.level = level;
      this.fill = fill.reverse(); // typically fill is in reverse order
      let dataAndELements = this.ParseData(data, elements);
      this.plotData = dataAndELements[0];
      this.elements = dataAndELements[1];
    } else {
      console.log(
        'Segmented chart missing level, fill, or data. Unable to create chart.'
      );
      return;
    }

    // column labels, both legend and tick
    let legendX = '';
    let legendY = '';
    if ('axes' in singleMaidr) {
      // legend labels
      if (singleMaidr.axes.x) {
        if (singleMaidr.axes.x.label) {
          legendX = singleMaidr.axes.x.label;
        }
      }
      if (singleMaidr.axes.y) {
        if (singleMaidr.axes.y.label) {
          legendY = singleMaidr.axes.y.label;
        }
      }
    }
    // labels override axes
    if ('labels' in singleMaidr) {
      if ('x' in singleMaidr.labels) {
        legendX = singleMaidr.labels.x;
      }
      if ('y' in singleMaidr.labels) {
        legendY = singleMaidr.labels.y;
      }
    }

    this.plotLegend = {
      x: legendX,
      y: legendY,
    };

    // title
    this.title = '';
    if ('labels' in singleMaidr) {
      if ('title' in singleMaidr.labels) {
        this.title = singleMaidr.labels.title;
      }
    }
    if (this.title == '') {
      if ('title' in singleMaidr) {
        this.title = singleMaidr.title;
      }
    }

    // subtitle
    if ('labels' in singleMaidr) {
      if ('subtitle' in singleMaidr.labels) {
        this.subtitle = singleMaidr.labels.subtitle;
      }
    }
    // caption
    if ('labels' in singleMaidr) {
      if ('caption' in singleMaidr.labels) {
        this.caption = singleMaidr.labels.caption;
      }
    }

    // set the max and min values for the plot
    this.SetMaxMin();

    // create summary and all levels
    this.CreateSummaryLevel();
    this.CreateAllLevel();

    this.autoplay = null;
  }

  ParseData(data, elements = null) {
    let plotData = [];
    let plotElements = [];

    if (elements.length != data.length) {
      plotElements = null;
    }

    // create a full 2d array of data using level and fill
    for (let i = 0; i < this.level.length; i++) {
      for (let j = 0; j < this.fill.length; j++) {
        // loop through data, find matching level and fill, assign value
        // if no match, assign null
        for (let k = 0; k < data.length; k++) {
          // init
          if (!plotData[i]) {
            plotData[i] = [];
            if (plotElements != null) {
              if (!plotElements[i]) {
                plotElements[i] = [];
              }
            }
          }
          if (!plotData[i][j]) {
            plotData[i][j] = 0;
            if (plotElements != null) {
              if (!plotElements[i][j]) {
                plotElements[i][j] = null;
              }
            }
          }
          // set actual values
          if (data[k].x == this.level[i] && data[k].fill == this.fill[j]) {
            plotData[i][j] = data[k].y;
            plotElements[i][j] = elements[k];
            break;
          }
        }
      }
    }

    return [plotData, plotElements];
  }

  CreateSummaryLevel() {
    // create another y level that is the sum of all the other levels

    for (let i = 0; i < this.plotData.length; i++) {
      let sum = 0;
      for (let j = 0; j < this.plotData[i].length; j++) {
        sum += this.plotData[i][j];
      }
      this.plotData[i].push(sum);
    }

    this.fill.push('Sum');
  }

  CreateAllLevel() {
    // create another y level that plays all the other levels seperately

    for (let i = 0; i < this.plotData.length; i++) {
      let all = [];
      for (let j = 0; j < this.plotData[i].length; j++) {
        all.push(this.plotData[i][j]);
      }
      this.plotData[i].push(all);
    }

    this.fill.push('All');
  }

  PlayTones() {
    if (Array.isArray(this.plotData[position.x][position.y])) {
      // we play a run of tones
      position.z = 0;
      constants.sepPlayId = setInterval(
        function () {
          // play this tone
          audio.playTone();

          // and then set up for the next one
          position.z += 1;

          // and kill if we're done
          if (position.z + 1 > plot.plotData[position.x][position.y].length) {
            constants.KillSepPlay();
            position.z = -1;
          }
        },
        constants.sonifMode == 'on' ? constants.autoPlayPointsRate : 0
      );
    } else {
      audio.playTone();
    }
  }

  SetMaxMin() {
    for (let i = 0; i < singleMaidr.data.length; i++) {
      if (i == 0) {
        constants.maxY = singleMaidr.data[i].y;
        constants.minY = singleMaidr.data[i].y;
      } else {
        if (singleMaidr.data[i].y > constants.maxY) {
          constants.maxY = singleMaidr.data[i].y;
        }
        if (singleMaidr.data[i].y < constants.minY) {
          constants.minY = singleMaidr.data[i].y;
        }
      }
    }
    constants.maxX = this.level.length;
    constants.autoPlayRate = Math.min(
      Math.ceil(constants.AUTOPLAY_DURATION / (constants.maxX + 1)),
      constants.MAX_SPEED
    );
    constants.DEFAULT_SPEED = constants.autoPlayRate;
    if (constants.autoPlayRate < constants.MIN_SPEED) {
      constants.MIN_SPEED = constants.autoPlayRate;
    }
  }

  Select() {
    this.UnSelectPrevious();
    if (this.elements) {
      this.activeElement = this.elements[position.x][position.y];
      if (this.activeElement) {
        this.activeElementColor = this.activeElement.style.fill;
        let invertedColor = constants.ColorInvert(this.activeElementColor);
        this.activeElement.style.fill = invertedColor;
      }
    }
  }

  UnSelectPrevious() {
    if (this.activeElement) {
      this.activeElement.style.fill = this.activeElementColor;
      this.activeElement = null;
    }
  }
}
