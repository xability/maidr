// const constants = new Constants();
// document.addEventListener('DOMContentLoaded', function () {
//   console.log(maidr.elements);
//   let line = maidr.elements[0]; // todo, ask if line plot is always going to be the first element
//   //   line.setAttribute('stroke', 'rgb(127,12,30)');
//   let points = line.getAttribute('points');
//   points = points.split(' ');
//   let newPoints = [];
//   for (let i = 0; i < points.length; i++) {
//     let point = points[i].split(',');
//     newPoints.push([point[0], point[1]]);
//   }
//   for (let i = 0; i < newPoints.length; i++) {
//     let point = newPoints[i];
//     let circle = document.createElementNS(
//       'http://www.w3.org/2000/svg',
//       'circle'
//     );
//     circle.setAttribute('cx', point[0]);
//     circle.setAttribute(
//       'cy',
//       document.getElementById('lineplot1').getBoundingClientRect().height -
//         point[1]
//     );
//     circle.setAttribute('r', 1);
//     circle.setAttribute('fill', 'rgb(127,12,30)');
//     circle.setAttribute('stroke', 'rgb(127,12,30)');
//     document.getElementById('lineplot1').appendChild(circle);
//   }

//   var data = maidr.data;
//   var sum = 0;
//   var count = 0;
//   for (let i = 0; i < data.length; i++) {
//     if (data[i].x == 1952) {
//       sum += data[i].y;
//       count++;
//     }
//   }
//   var avg = sum / count;
//   console.log(sum, count, data[count / 2], avg);
// });

// properties: type, id, title, elements, data
document.addEventListener('DOMContentLoaded', function () {
  var lineplot = new LinePlot();
});

class LinePlot {
  constructor() {
    let legendX = '';
    let legendY = '';
    if ('axes' in singleMaidr) {
      // legend labels
      if (singleMaidr.axes.x) {
        if (singleMaidr.axes.x.label) {
          if (legendX == '') {
            legendX = singleMaidr.axes.x.label;
          }
        }
      }
      if (singleMaidr.axes.y) {
        if (singleMaidr.axes.y.label) {
          if (legendY == '') {
            legendY = singleMaidr.axes.y.label;
          }
        }
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

    if ('data' in singleMaidr) {
      let points = new Map();
      let data = singleMaidr.data;
      for (let i = 0; i < data.length; i++) {
        if (!points.has(data[i].x)) {
          points.set(data[i].x, [data[i].y]);
        } else {
          points.get(data[i].x).push(data[i].y);
        }
      }
      // this.plotData = singleMaidr.data;
      this.plotData = points;
    }

    // set the max and min values for the plot
    this.SetMaxMin();

    this.autoplay = null;
    console.log(this.title);
    console.log(this.plotData);
  }

  SetMaxMin() {
    for (let i = 0; i < this.plotData.length; i++) {
      for (let j = 0; j < this.plotData[i].length; j++) {
        if (i == 0 && j == 0) {
          constants.maxY = this.plotData[i][j];
          constants.minY = this.plotData[i][j];
        } else {
          if (this.plotData[i][j] > constants.maxY) {
            constants.maxY = this.plotData[i];
          }
          if (this.plotData[i][j] < constants.minY) {
            constants.minY = this.plotData[i];
          }
        }
      }
    }
    constants.maxX = this.plotData.length;
  }

  //   GetData() {
  //     // set height for each bar

  //     let plotData = [];

  //     if (this.bars) {
  //       for (let i = 0; i < this.bars.length; i++) {
  //         plotData.push(this.bars[i].getAttribute('height'));
  //       }
  //     }

  //     return plotData;
  //   }

  //   GetLegend() {
  //     let legend = {};
  //     let els = constants.chart.querySelectorAll('tspan[dy="12"]'); // todo, generalize this selector
  //     legend.x = els[1].innerHTML;
  //     legend.y = els[0].innerHTML;

  //     return legend;
  //   }

  //   ParseInnerHTML(els) {
  //     // parse innerHTML of elements
  //     let parsed = [];
  //     for (var i = 0; i < els.length; i++) {
  //       parsed.push(els[i].innerHTML);
  //     }
  //     return parsed;
  //   }
}
