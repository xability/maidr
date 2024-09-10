import { BarAudio } from "./BarAudio";
import BarDisplay from "./BarDisplay";
import { Position } from "../../helpers/Position";
import { Plot } from "../Plot";
import Control from "../../controls";
import { ReactivePosition } from "../../helpers/ReactivePosition";
import { BarControl } from "./BarControl";

export class BarPlot extends Plot {
  /* Plot Components */
  audio: BarAudio;
  display: BarDisplay;
  control: BarControl;

  /* Plot Data and related variables */
  maxY: number = 0;
  maxX: number = 0;
  minY: number = 0;
  minX: number = 0;
  plotData: any;

  /* Plot's Currently Active Position in Co-ordinate Space */
  position: ReactivePosition;

  /* Previous Plot Related things
   * Have to check if any of these are needed and refactor
   * the constructor accordingly
   */
  bars: HTMLElement[] | null = null;
  plotLegend: { x: string; y: string };
  columnLabels: string[];
  title: string;
  activeElement: HTMLElement | null = null;
  activeElementColor: string | null = null;

  constructor() {
    super();
    this.position = new ReactivePosition();
    this.audio = new BarAudio(this.position);
    this.display = new BarDisplay(this.position);
    this.control = new BarControl(this.position, this.audio, this.display);

    /* Previous Constructor Code STARTS Here */
    let maidr = window.maidr!;

    let xlevel: string[] = [];
    if ("axes" in maidr) {
      if (maidr.axes.x && maidr.axes.x.level) {
        xlevel = maidr.axes.x.level;
      }
    }

    let data: any[] | null = null;
    if ("data" in maidr) {
      data = maidr.data;
    }

    let elements: NodeListOf<HTMLElement> | null = null;
    if ("selector" in maidr) {
      elements = document.querySelectorAll(maidr.selector);
    }

    if (xlevel && data && elements) {
      if (elements.length !== data.length) {
        window.constants.hasRect = 0;
        window.logError.LogDifferentLengths("elements", "data");
      } else if (xlevel.length !== elements.length) {
        window.constants.hasRect = 0;
        window.logError.LogDifferentLengths("x level", "elements");
      } else if (data.length !== xlevel.length) {
        window.constants.hasRect = 0;
        window.logError.LogDifferentLengths("x level", "data");
      } else {
        this.bars = Array.from(elements);
        window.constants.hasRect = 1;
      }
    } else if (data && elements) {
      if (data.length !== elements.length) {
        window.constants.hasRect = 0;
        window.logError.LogDifferentLengths("data", "elements");
      } else {
        this.bars = Array.from(elements);
        window.constants.hasRect = 1;
      }
    } else if (xlevel && data) {
      if (xlevel.length !== data.length) {
        window.constants.hasRect = 0;
        window.logError.LogDifferentLengths("x level", "data");
      }
      window.logError.LogAbsentElement("elements");
    } else if (data) {
      window.logError.LogAbsentElement("x level");
      window.logError.LogAbsentElement("elements");
    }

    this.columnLabels = [];
    let legendX = "";
    let legendY = "";

    if ("axes" in maidr) {
      if (maidr.axes.x && maidr.axes.x.label && legendX === "") {
        legendX = maidr.axes.x.label;
      }
      if (maidr.axes.y && maidr.axes.y.label && legendY === "") {
        legendY = maidr.axes.y.label;
      }

      if (maidr.axes.x && maidr.axes.x.level) {
        this.columnLabels = maidr.axes.x.level;
      }
    }

    this.plotLegend = {
      x: legendX,
      y: legendY,
    };

    this.title = "";
    if (this.title === "" && "title" in maidr) {
      this.title = maidr.title;
    }

    if (Array.isArray(maidr)) {
      this.plotData = maidr;
    } else if ("data" in maidr) {
      this.plotData = maidr.data;
    }

    this.SetMaxMin();
    /* Previous Constructor Code ENDS Here */
  }

  /* Previous Functions STARTS Here */
  SetMaxMin() {
    for (let i = 0; i < this.plotData.length; i++) {
      if (i === 0) {
        window.constants.maxY = this.plotData[i];
        window.constants.minY = this.plotData[i];
      } else {
        if (this.plotData[i] > window.constants.maxY) {
          window.constants.maxY = this.plotData[i];
        }
        if (this.plotData[i] < window.constants.minY) {
          window.constants.minY = this.plotData[i];
        }
      }
    }
    window.constants.maxX = this.columnLabels.length;
    window.constants.autoPlayRate = Math.min(
      Math.ceil(
        window.constants.AUTOPLAY_DURATION / (window.constants.maxX + 1)
      ),
      window.constants.MAX_SPEED
    );
    window.constants.DEFAULT_SPEED = window.constants.autoPlayRate;
    if (window.constants.autoPlayRate < window.constants.MIN_SPEED) {
      window.constants.MIN_SPEED = window.constants.autoPlayRate;
    }
  }
  PlayTones() {
    if (this.audio) {
      this.audio.playTone(null, this.plotData);
    }
  }

  GetData() {
    const plotData: string[] = [];
    if (this.bars) {
      for (const bar of this.bars) {
        plotData.push(bar.getAttribute("height")!);
      }
    }
    return plotData;
  }
  GetLegend() {
    const legend: { x: string; y: string } = { x: "", y: "" };
    const els = window.constants.chart!.querySelectorAll('tspan[dy="12"]');
    legend.x = els[1].innerHTML;
    legend.y = els[0].innerHTML;
    return legend;
  }
  Select() {
    this.deselectPrevious();
    if (this.bars) {
      this.activeElement = this.bars[this.position.x];
      if (this.activeElement) {
        if (this.activeElement.hasAttribute("fill")) {
          this.activeElementColor = this.activeElement.getAttribute("fill")!;
          this.activeElement.setAttribute(
            "fill",
            window.constants.GetBetterColor(this.activeElementColor)
          );
        } else if (
          this.activeElement.hasAttribute("style") &&
          this.activeElement.getAttribute("style")!.indexOf("fill") !== -1
        ) {
          const styleString = this.activeElement.getAttribute("style")!;
          const styleArray =
            window.constants.GetStyleArrayFromString(styleString);
          this.activeElementColor = styleArray[styleArray.indexOf("fill") + 1];
          styleArray[styleArray.indexOf("fill") + 1] =
            window.constants.GetBetterColor(this.activeElementColor);
          this.activeElement.setAttribute(
            "style",
            window.constants.GetStyleStringFromArray(styleArray)
          );
        }
      }
    }
  }

  deselectPrevious() {
    if (this.activeElement) {
      if (this.activeElement.hasAttribute("fill")) {
        this.activeElement.setAttribute("fill", this.activeElementColor!);
        this.activeElement = null;
      } else if (
        this.activeElement.hasAttribute("style") &&
        this.activeElement.getAttribute("style")!.indexOf("fill") !== -1
      ) {
        const styleString = this.activeElement.getAttribute("style")!;
        const styleArray =
          window.constants.GetStyleArrayFromString(styleString);
        styleArray[styleArray.indexOf("fill") + 1] = this.activeElementColor!;
        this.activeElement.setAttribute(
          "style",
          window.constants.GetStyleStringFromArray(styleArray)
        );
        this.activeElement = null;
      }
    }
  }
  /* Previous Functions ENDS Here */

  /* New Functions STARTS Here */
  playTones() {
    this.audio.playTone(null, this.plotData);
  }
}
