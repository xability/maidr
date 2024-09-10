import { DisplayManager } from "../../display/DisplayManager";
import { ReactivePosition } from "../../helpers/ReactivePosition";

export default class BarDisplay extends DisplayManager {
  constructor(position: ReactivePosition) {
    super();
    this.position = position;
    this.position.subscribe(this.onPositionChange.bind(this));
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
