import { Constants } from "../../constants";
import { ReactivePosition } from "../../helpers/ReactivePosition";
import { Plot } from "../Plot";
import { LineAudio } from "./LineAudio";
import { LineControl } from "./LineControl";
import { LineDisplay } from "./LineDisplay";

export class LinePlot extends Plot {
  /* Plot Components */
  audio: LineAudio;
  display: LineDisplay;
  control: LineControl;

  /* Plot Data and related variables */
  maxY: number = 0;
  maxX: number = 0;
  minY: number = 0;
  minX: number = 0;
  pointValuesY: number[] = [];
  pointValuesX: number[] = [];
  plotData: any;
  autoPlayRate: number = 0;

  position: ReactivePosition;

  maidr: any;

  plotLine: any;

  constants: Constants;
  chartLineX: string[] = [];
  chartLineY: string[] = [];
  curveMinY: number = 0;
  curveMaxY: number = 0;

  plotLegend: { x: string; y: string } | null = null;
  title: string = "";
  subtitle: string = "";
  caption: string = "";

  constructor(maidr: any) {
    super();
    this.maidr = maidr;
    this.plotData = maidr.data;
    this.position = new ReactivePosition(-1, -1);
    this.audio = new LineAudio(this, this.position);
    this.display = new LineDisplay(this, this.position);
    this.control = new LineControl(
      this,
      this.position,
      this.audio,
      this.display
    );
    this.constants = window.constants;
    this.setLineLayer();
    this.setAxes();
    this.updateConstants();
    /* Previous Constructor Code ENDS Here */
  }

  setLineLayer() {
    let elements;
    if ("selector" in this.maidr) {
      elements = document.querySelectorAll(this.maidr.selector);
    } else if ("elements" in this.maidr) {
      elements = this.maidr.elements;
    }

    if (elements) {
      this.plotLine = elements[elements.length - 1];
    } else {
      this.constants.hasRect = 0;
    }

    let pointCoords: string[][] = this.getPointCoords();
    let pointValues: number[][] = this.getPoints();

    this.chartLineX = pointCoords[0]; // x coordinates of curve
    this.chartLineY = pointCoords[1]; // y coordinates of curve

    this.pointValuesX = pointValues[0]; // actual values of x
    this.pointValuesY = pointValues[1]; // actual values of y

    this.curveMinY = Math.min(...this.pointValuesY);
    this.curveMaxY = Math.max(...this.pointValuesY);
  }

  getPointCoords() {
    let svgLineCoords: [string[], string[]] = [[], []];

    if (this.plotLine) {
      if (this.plotLine instanceof SVGPathElement) {
        const pathD = this.plotLine.getAttribute("d") ?? "";
        const regex = /[ML]\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)/g;

        let match;
        while ((match = regex.exec(pathD)) !== null) {
          svgLineCoords[0].push(match[1]); 
          svgLineCoords[1].push(match[3]); 
        }
      } else {
        let points = this.plotLine.getAttribute("points").split(" ");
        for (let i = 0; i < points.length; i++) {
          if (points[i] !== "") {
            let point = points[i].split(",");
            svgLineCoords[0].push(point[0]);
            svgLineCoords[1].push(point[1]);
          }
        }
      }
    } else {
      // fetch from data instead
      let x_points = [];
      let y_points = [];

      let data;
      if ("data" in this.maidr) {
        data = this.maidr.data;
      }
      if (typeof data !== "undefined") {
        for (let i = 0; i < data.length; i++) {
          x_points.push(data[i].x);
          y_points.push(data[i].y);
        }
      }
      return [x_points, y_points];
    }
    console.log(svgLineCoords);
    return svgLineCoords;
  }

  getPoints(): [number[], number[]] {
    let x_points: number[] = [];
    let y_points: number[] = [];

    let data;
    if ("data" in this.maidr) {
      data = this.maidr.data;
    }
    if (typeof data !== "undefined") {
      for (let i = 0; i < data.length; i++) {
        x_points.push(data[i].x);
        y_points.push(data[i].y);
      }
      return [x_points, y_points];
    }
    return [[], []];
  }

  updateConstants(){
    this.minX = 0;
    this.maxX = this.maidr.data.length - 1;
    this.minY = this.maidr.data.reduce(
      (min: number, item: { y: number; }) => (item.y < min ? item.y : min),
      this.maidr.data[0].y
    );

    
    this.maxY = this.maidr.data.reduce(
      (max: number, item: { y: number; }) => (item.y > max ? item.y : max),
      this.maidr.data[0].y
    );

    this.autoPlayRate = Math.min(
      Math.ceil(this.constants.AUTOPLAY_DURATION / (this.maxX + 1)),
      this.constants.MAX_SPEED
    );
    if (this.autoPlayRate < this.constants.MIN_SPEED) {
      this.constants.MIN_SPEED = this.constants.autoPlayRate;
    }
  }

  setAxes() {
    let legendX = '';
    let legendY = '';
    if ('axes' in this.maidr) {
      // legend labels
      if (this.maidr.axes.x) {
        if (this.maidr.axes.x.label) {
          if (legendX == '') {
            legendX = this.maidr.axes.x.label;
          }
        }
      }
      if (this.maidr.axes.y) {
        if (this.maidr.axes.y.label) {
          if (legendY == '') {
            legendY = this.maidr.axes.y.label;
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
    if ('labels' in this.maidr) {
      if ('title' in this.maidr.labels) {
        this.title = this.maidr.labels.title;
      }
    }
    if (this.title == '') {
      if ('title' in this.maidr) {
        this.title = this.maidr.title;
      }
    }

    // subtitle
    if ('labels' in this.maidr) {
      if ('subtitle' in this.maidr.labels) {
        this.subtitle = this.maidr.labels.subtitle;
      }
    }
    // caption
    if ('labels' in this.maidr) {
      if ('caption' in this.maidr.labels) {
        this.caption = this.maidr.labels.caption;
      }
    }
  }

  playTones(){
    this.audio.playTone(null);
  }
}
