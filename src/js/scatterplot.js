document.addEventListener('DOMContentLoaded', function (e) {
  // we wrap in DOMContentLoaded to make sure everything has loaded before we run anything
});

class ScatterPlot {
  constructor() {
    this.prefix = this.GetPrefix();
    this.SetScatterLayer();
    this.SetLineLayer();
    this.SetAxes();
    this.svgScales = this.GetSVGScales();
  }

  SetAxes() {
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

  SetScatterLayer() {
    // initially set as smooth layer (layer 2), if possible
    let elIndex = this.GetElementIndex('point');
    if (elIndex != -1) {
      this.plotPoints = maidr.elements[elIndex];
    } else if (maidr.type == 'point') {
      this.plotPoints = maidr.elements;
    }
    if (typeof this.plotPoints !== 'undefined') {
      this.chartPointsX = this.GetSvgPointCoords()[0]; // x coordinates of points
      this.chartPointsY = this.GetSvgPointCoords()[1]; // y coordinates of points

      this.x = this.GetPointValues()[0]; // actual values of x
      this.y = this.GetPointValues()[1]; // actual values of y

      // for sound weight use
      this.points_count = this.GetPointValues()[2]; // number of each points
      this.max_count = this.GetPointValues()[3];
    }
  }

  SetLineLayer() {
    // layer = 2, smooth layer (from maidr types)
    let elIndex = this.GetElementIndex('smooth');
    if (elIndex != -1) {
      this.plotLine = maidr.elements[elIndex];
    } else if (maidr.type == 'smooth') {
      this.plotLine = maidr.elements;
    }
    if (typeof this.plotLine !== 'undefined') {
      this.chartLineX = this.GetSvgLineCoords()[0]; // x coordinates of curve
      this.chartLineY = this.GetSvgLineCoords()[1]; // y coordinates of curve

      this.curveX = this.GetSmoothCurvePoints()[0]; // actual values of x
      this.curvePoints = this.GetSmoothCurvePoints()[1]; // actual values of y

      this.curveMinY = Math.min(...this.curvePoints);
      this.curveMaxY = Math.max(...this.curvePoints);
      this.gradient = this.GetGradient();
    }
  }

  GetSvgPointCoords() {
    let points = new Map();

    for (let i = 0; i < this.plotPoints.length; i++) {
      let x = parseFloat(this.plotPoints[i].getAttribute(this.prefix + 'x')); // .toFixed(1);
      let y = parseFloat(this.plotPoints[i].getAttribute(this.prefix + 'y'));
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

  GetElementIndex(elementName = 'point') {
    let elIndex = -1;
    if ('type' in maidr) {
      elIndex = maidr.type.indexOf(elementName);
    }
    return elIndex;
  }

  GetSVGScales() {
    let scaleX = 1;
    let scaleY = 1;
    // start with some square (first), look all the way up the parents to the svg, and record any scales along the way

    // but first, are we even in an svg that can be scaled?
    let isSvg = false;
    let element = this.plotPoints[0]; // a random start, may as well be the first
    while (element) {
      if (element.tagName.toLowerCase() == 'body') {
        break;
      }
      if (element.tagName && element.tagName.toLowerCase() === 'svg') {
        isSvg = true;
      }
      element = element.parentNode;
    }

    if (isSvg) {
      let element = this.plotPoints[0]; // a random start, may as well be the first
      while (element) {
        if (element.tagName.toLowerCase() == 'body') {
          break;
        }
        if (element.getAttribute('transform')) {
          let transform = element.getAttribute('transform');
          let match = transform.match(
            /scale\((-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)\)/
          );
          if (match) {
            if (!isNaN(match[1])) {
              scaleX *= parseFloat(match[1]);
            }
            if (!isNaN(match[3])) {
              scaleY *= parseFloat(match[3]);
            }
          }
        }
        element = element.parentNode;
      }
    }

    return [scaleX, scaleY];
  }

  GetPrefix() {
    let elIndex = this.GetElementIndex('point');
    let element;
    if (elIndex != -1) {
      element = maidr.elements[elIndex][0];
    } else if (maidr.type == 'point') {
      element = maidr.elements[0];
    }
    let prefix = '';
    if (element.tagName.toLowerCase() == 'circle') {
      prefix = 'c';
    }
    return prefix;
  }

  GetPointValues() {
    let points = new Map(); // keep track of x and y values

    let xValues = [];
    let yValues = [];

    let elIndex = this.GetElementIndex('point');

    let data;
    if (elIndex > -1) {
      data = maidr.data[elIndex];
    } else if (maidr.type == 'point') {
      data = maidr.data;
    }
    if (typeof data !== 'undefined') {
      for (let i = 0; i < maidr.data[elIndex].length; i++) {
        let x = maidr.data[elIndex][i]['x'];
        let y = maidr.data[elIndex][i]['y'];
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
    } else {
      return;
    }
  }

  PlayTones(audio) {
    // kill the previous separate-points play before starting the next play
    if (constants.sepPlayId) {
      constants.KillSepPlay();
    }
    if (constants.chartType == 'point') {
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
        constants.sonifMode == 'on' ? constants.autoPlayPointsRate : 0
      ); // play all tones at the same time
    } else if (constants.chartType == 'smooth') {
      // best fit smooth layer
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

    let elIndex = this.GetElementIndex('smooth');

    let data;
    if (elIndex > -1) {
      data = maidr.data[elIndex];
    } else if (maidr.type == 'smooth') {
      data = maidr.data;
    }
    if (typeof data !== 'undefined') {
      for (let i = 0; i < maidr.data[elIndex].length; i++) {
        x_points.push(maidr.data[elIndex][i]['x']);
        y_points.push(maidr.data[elIndex][i]['y']);
      }

      return [x_points, y_points];
    } else {
      return;
    }
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
  // circles

  constructor() {
    this.x = plot.chartPointsX[0];
    this.y = plot.chartPointsY[0];
    this.strokeWidth = 1.35;
    this.circleIndex = [];
  }

  async UpdatePoints() {
    await this.ClearPoints();
    this.x = plot.chartPointsX[position.x];
    this.y = plot.chartPointsY[position.x];
    // find which circles we're on by searching for the x value
    this.circleIndex = [];
    for (let j = 0; j < this.y.length; j++) {
      for (let i = 0; i < plot.plotPoints.length; i++) {
        if (
          plot.plotPoints[i].getAttribute(plot.prefix + 'x') == this.x &&
          plot.plotPoints[i].getAttribute(plot.prefix + 'y') == this.y[j]
        ) {
          this.circleIndex.push(i);
          break;
        }
      }
    }
  }

  async PrintPoints() {
    await this.ClearPoints();
    await this.UpdatePoints();
    for (let i = 0; i < this.circleIndex.length; i++) {
      const svgns = 'http://www.w3.org/2000/svg';
      var point = document.createElementNS(svgns, 'circle');
      point.setAttribute('class', 'highlight_point');
      point.setAttribute('cx', this.x);
      if (plot.svgScales[1] == -1) {
        point.setAttribute(
          'cy',
          constants.chart.getBoundingClientRect().height - this.y[i]
        );
      } else {
        point.setAttribute(
          'cy',
          plot.plotPoints[this.circleIndex[i]].getAttribute('cy')
        );
      }
      point.setAttribute('r', 3.95);
      point.setAttribute('stroke', constants.colorSelected);
      point.setAttribute('stroke-width', this.strokeWidth);
      point.setAttribute('fill', constants.colorSelected);
      if (plot.svgScales[1] == -1) {
        constants.chart.appendChild(point);
      } else {
        plot.plotPoints[this.circleIndex[i]].parentNode.appendChild(point);
      }
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
  // smooth segments

  constructor() {
    this.x = plot.chartLineX[0];
    this.y = plot.chartLineY[0];
    this.strokeWidth = 1.35;
  }

  async UpdatePoints() {
    await this.ClearPoints();
    this.x = plot.chartLineX[positionL1.x];
    this.y = plot.chartLineY[positionL1.x];
  }

  async PrintPoints() {
    await this.ClearPoints();
    await this.UpdatePoints();
    const svgns = 'http://www.w3.org/2000/svg';
    var point = document.createElementNS(svgns, 'circle');
    point.setAttribute('id', 'highlight_point');
    point.setAttribute(plot.prefix + 'x', this.x);
    if (plot.svgScales[1] == -1) {
      point.setAttribute(
        plot.prefix + 'y',
        constants.chart.getBoundingClientRect().height - this.y
      );
    } else {
      point.setAttribute(plot.prefix + 'y', this.y);
    }
    point.setAttribute('r', 3.95);
    point.setAttribute('stroke', constants.colorSelected);
    point.setAttribute('stroke-width', this.strokeWidth);
    point.setAttribute('fill', constants.colorSelected);
    constants.chart.appendChild(point);
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
