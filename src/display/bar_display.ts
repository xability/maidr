import { Display } from "./display";

export default class BarDisplay extends Display {
  constructor() {
    super();
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
}
