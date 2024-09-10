import { Constants } from "../constants";
import { Position } from "../helpers/Position";
import { ReactivePosition } from "../helpers/ReactivePosition";

export abstract class DisplayManager {
  infoDiv: HTMLElement | null;
  constants: Constants;
  x: { id: string; textBase: string };
  y: { id: string; textBase: string };
  position: ReactivePosition;

  constructor() {
    this.constants = window.constants;
    this.infoDiv = this.constants.infoDiv;
    this.x = { id: "x", textBase: "x-value: " };
    this.y = { id: "y", textBase: "y-value: " };
    this.position = new ReactivePosition();
  }

  announceText(text: string) {
    const announcement = document.createElement("p");
    announcement.textContent = text;
    announcement.setAttribute("aria-live", "assertive");
    announcement.setAttribute("role", "alert");
    this.constants.announcementContainer!.appendChild(announcement);
    setTimeout(() => {
      this.constants.announcementContainer!.removeChild(announcement);
    }, 1000);
  }

  toggleBrailleMode() {
    let constants = window.constants;
    let onOff: "off" | "on";

    if (constants.brailleMode == "on") {
      onOff = "off";
    } else {
      onOff = "on";
    }
    constants.brailleMode = onOff;
  }

  toggleSonificationMode(): void {
    let constants = window.constants;
    if (constants.soundMode == "off") {
      constants.soundMode = "on";
      this.announceText(window.resources.GetString("son_on"));
    } else {
      constants.soundMode = "off";
      this.announceText(window.resources.GetString("son_off"));
    }
  }

  displayValuesCommon(
    output: string,
    verboseText: string,
    terseText: any
  ): void {
    let constants = window.constants;
    if (constants.textMode == "verbose") {
      output = verboseText;
    } else if (constants.textMode == "terse") {
      output = terseText;
    }
    constants.verboseText = verboseText;

    if (constants.infoDiv) constants.infoDiv.innerHTML = output;
    // if (constants.review) {
    //   if (output.length > 0) {
    //     constants.review.value = output.replace(/<[^>]*>?/gm, "");
    //   } else {
    //     constants.review.value = verboseText;
    //   }
    // }
  }

  displayBraille(brailleArray: string[]): void {
    if (this.constants.brailleInput) {
      this.constants.brailleInput.value = brailleArray.join("");
      if (this.constants.debugLevel > 5) {
        console.log("braille:", this.constants.brailleInput.value);
      }
    }
  }

  toggleTextMode() {
    if (this.constants.textMode == "off") {
      this.constants.textMode = "terse";
    } else if (this.constants.textMode == "terse") {
      this.constants.textMode = "verbose";
    } else if (this.constants.textMode == "verbose") {
      this.constants.textMode = "off";
    }

    this.announceText(
      '<span aria-hidden="true">Text mode:</span> ' + this.constants.textMode
    );
  }

  abstract displayValues(): void;
  abstract setBraille(...args: any[]): void;
  abstract updateBraillePos(): void;
}
