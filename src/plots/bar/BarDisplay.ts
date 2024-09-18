import { DisplayManager } from "../../display/DisplayManager";
import { ReactivePosition } from "../../helpers/ReactivePosition";
import { BarPlot } from "./BarPlot";

export default class BarDisplay extends DisplayManager {
  plot: BarPlot;

  activeElement: HTMLElement | null = null;
  activeElementColor: string | null = null;

  constructor(plot: BarPlot, position: ReactivePosition) {
    super();
    this.position = position;
    this.plot = plot;
    this.position.subscribe(this.onPositionChange.bind(this));
    this.initializeActiveElementHighlight();
  }

  initializeActiveElementHighlight(){
    
    let xlevel: string[] = [];
    if ("axes" in this.plot.maidr) {
      if (this.plot.maidr.axes.x && this.plot.maidr.axes.x.level) {
        xlevel = this.plot.maidr.axes.x.level;
      }
    }

    let data: any[] | null = null;
    if ("data" in this.plot.maidr) {
      data = this.plot.maidr.data;
    }

    let elements: NodeListOf<HTMLElement> | null = null;
    if ("selector" in this.plot.maidr) {
      elements = document.querySelectorAll(this.plot.maidr.selector);
    }

    if (xlevel && data && elements) {
      if (elements.length !== data.length) {
        console.log("elements", elements, "data", data);
        window.constants.hasRect = 0;
        window.logError.LogDifferentLengths("elements", "data");
      } else if (xlevel.length !== elements.length) {
        window.constants.hasRect = 0;
        window.logError.LogDifferentLengths("x level", "elements");
      } else if (data.length !== xlevel.length) {
        window.constants.hasRect = 0;
        window.logError.LogDifferentLengths("x level", "data");
      } else {
        this.plot.bars = Array.from(elements);
        window.constants.hasRect = 1;
      }
    } else if (data && elements) {
      if (data.length !== elements.length) {
        window.constants.hasRect = 0;
        window.logError.LogDifferentLengths("data", "elements");
      } else {
        this.plot.bars = Array.from(elements);
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

    this.plot.columnLabels = [];
    let legendX = "";
    let legendY = "";

    if ("axes" in this.plot.maidr) {
      if (this.plot.maidr.axes.x && this.plot.maidr.axes.x.label && legendX === "") {
        legendX = this.plot.maidr.axes.x.label;
      }
      if (this.plot.maidr.axes.y && this.plot.maidr.axes.y.label && legendY === "") {
        legendY = this.plot.maidr.axes.y.label;
      }

      if (this.plot.maidr.axes.x && this.plot.maidr.axes.x.level) {
        this.plot.columnLabels = this.plot.maidr.axes.x.level;
      }
    }
   
    this.plot.title = "";
    if (this.plot.title === "" && "title" in this.plot.maidr) {
      this.plot.title = this.plot.maidr.title;
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

  selectActiveElement(){
    if (this.constants.showRect && this.constants.hasRect) {
      this.deselectPrevious();
      if (this.plot.bars) {
        this.activeElement = this.plot.bars[this.position.x];
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
  }


  onPositionChange(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
  }

  override displayValues(): void {
    this.displayValuesCommon("", "", "");
  }

  override toggleBrailleMode(): void {
    super.toggleBrailleMode();
  }

  override setBraille(plotData: any): void {
    let brailleArray: string[] = [];
    let range = (this.constants.maxY - this.constants.minY) / 4;
    let low = this.constants.minY + range;
    let medium = low + range;
    let medium_high = medium + range;
    for (let i = 0; i < plotData.length; i++) {
      if (plotData[i] <= low) {
        brailleArray.push("⣀");
      } else if (plotData[i] <= medium) {
        brailleArray.push("⠤");
      } else if (plotData[i] <= medium_high) {
        brailleArray.push("⠒");
      } else {
        brailleArray.push("⠉");
      }
    }
    this.displayBraille(brailleArray);
  }

  override updateBraillePos(): void {
    this.constants.brailleInput?.setSelectionRange(
      this.position.x,
      this.position.x
    );
  }

  
}
