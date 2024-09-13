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
  autoPlayRate: number = 0;
  plotData: any;

  /* Plot's Currently Active Position in Co-ordinate Space */
  position: ReactivePosition;

  /* Previous Plot Related things
   * Have to check if any of these are needed and refactor
   * the constructor accordingly
   */
  plotLegend: { x: string; y: string } | null = null;
  columnLabels: string[] = [];
  title: string = "";
  bars: HTMLElement[] = [];
  
  activeElement: HTMLElement | null = null;
  activeElementColor: string | null = null;
  maidr: any;

  constructor(maidr: any) {
    super();
    this.maidr = maidr;
    this.plotData = maidr.data;
    this.position = new ReactivePosition(-1, -1);
    this.audio = new BarAudio(this, this.position);
    this.display = new BarDisplay(this, this.position);
    this.control = new BarControl(this, this.position, this.audio, this.display);

    this.SetMaxMin();
    /* Previous Constructor Code ENDS Here */
  }

  /* Previous Functions STARTS Here */
  SetMaxMin() {
    for (let i = 0; i < this.plotData.length; i++) {
      if (i === 0) {
        this.maxY = this.plotData[i];
        this.minY = this.plotData[i];
      } else {
        if (this.plotData[i] > this.maxY) {
          this.maxY = this.plotData[i];
        }
        if (this.plotData[i] < this.minY) {
          this.minY = this.plotData[i];
        }
      }
    }
    this.maxX = this.columnLabels.length;
    this.autoPlayRate = Math.min(
      Math.ceil(
        window.constants.AUTOPLAY_DURATION / (this.maxX + 1)
      ),
      window.constants.MAX_SPEED
    );
    if (this.autoPlayRate < window.constants.MIN_SPEED) {
      window.constants.MIN_SPEED = this.autoPlayRate;
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
    // this.audio.playTone(null, this.plotData);
  }
}
