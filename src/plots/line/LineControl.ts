import { ControlManager } from "../../control/ControlManager";
import { ChartType } from "../../helpers/ChartType";
import { Point } from "../../helpers/Point";
import { ReactivePosition } from "../../helpers/ReactivePosition";
import { LineAudio } from "./LineAudio";
import { LineDisplay } from "./LineDisplay";
import { LinePlot } from "./LinePlot";

export class LineControl extends ControlManager {
  plot: LinePlot;
  audio: LineAudio;
  display: LineDisplay;
  position: ReactivePosition;
  point: Point;
  autoplayId: number | NodeJS.Timeout | null = null;
  lastPlayed: string = "";

  constructor(
    plot: LinePlot,
    position: any,
    audio: LineAudio,
    display: LineDisplay
  ) {
    super(ChartType.Line);
    this.plot = plot;
    this.position = position;
    this.position.subscribe(this.onPositionChange.bind(this));
    this.audio = audio;
    this.display = display;
    this.point = new Point(this.plot, this.position.x, this.position.y);
  }

  onPositionChange(x: number, y: number, z: number): void {
    
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
  }

  additionalSetControls(): void {
    this.controlElements.forEach((element) => {
      element?.addEventListener("keydown", this.handleKeyDown.bind(this));
    });
    document.addEventListener(
      "selectionchange",
      this.handleSelectionChange.bind(this)
    );
  }

  handleSelectionChange(e: Event): void {
    if (this.constants.brailleMode == "on") {
      let pos = this.constants.brailleInput?.selectionStart;
      // we're using braille cursor, update the selection from what was clicked
      pos = this.constants.brailleInput?.selectionStart ?? 0;
      if (pos < 0) {
        pos = 0;
      }
      this.position.setX(pos);
      this.lockPosition();
      let testEnd = true;

      // update display / text / audio
      if (testEnd) {
        this.updateAll();
      }
      if (testEnd) {
        this.audio.playEnd();
      }
    }
  }

  handleKeyDown(e: KeyboardEvent): void {
    super.handleKeyDown(e);
    if (
      this.pressedL ||
      ["b", "t", "s", "r", " ", "tab", "pagedown", "pageup"].includes(
        e.key.toLowerCase()
      )
    ) {
      return;
    }
    const isCommandKey = this.constants.isMac ? e.metaKey : e.ctrlKey;
    const isShiftKey = e.shiftKey;
    const isAltKey = e.altKey;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowLeft":
        e.preventDefault();
        this.handleArrowKey(e.key, isCommandKey, isShiftKey, isAltKey);
        break;

      case ".":
      case ",":
      case "/":
        e.preventDefault();
        this.handleSpeedChange(e.key);
        break;

      default:
        return;
    }
  }

  handleSpeedChange(key: "." | "," | "/"): void {
    switch (key) {
      case ".":
        this.constants.SpeedUp();
        this.display.announceText("Speed up");
        break;
      case ",":
        this.constants.SpeedDown();
        this.display.announceText("Speed down");
        break;
      case "/":
        this.constants.SpeedReset();
        this.display.announceText("Speed reset");
        break;
    }
    this.playDuringSpeedChange();
  }

  playDuringSpeedChange(): void {
    if (this.constants.autoplayId == null) return;

    this.constants.KillAutoplay(this.autoplayId);

    const direction = this.lastPlayed.startsWith("reverse-")
      ? this.lastPlayed.replace("reverse-", "") === "left"
        ? "right"
        : "left"
      : this.lastPlayed;

    this.autoplay(direction, this.position.x, this.constants.lastx);
  }

  handleArrowKey(
    key: "ArrowRight" | "ArrowLeft",
    isCommandKey: boolean,
    isShiftKey: boolean,
    isAltKey: boolean
  ): void {
    console.log("handleArrowKey");
    let updateInfoThisRound = false;
    let isAtEnd = false;
    if (isCommandKey) {
      if (isShiftKey) {
        this.position.setX(this.position.x - 1);
        this.autoplay("right", this.position.x, this.plot.pointValuesY.length);
      } else {
        this.position.setX(this.plot.pointValuesY.length - 1); // go all the way
        updateInfoThisRound = true;
        isAtEnd = this.lockPosition();
      }
    } else if (
      isAltKey &&
      isShiftKey &&
      this.position.x != this.plot.pointValuesY.length - 1
    ) {
      this.constants.lastx = this.position.x;
      this.autoplay(
        "reverse-right",
        this.plot.pointValuesY.length,
        this.position.x
      );
    } else {
      this.position.setX(this.position.x + 1);
      updateInfoThisRound = true;
      isAtEnd = this.lockPosition();
    }
  }

  autoplay(dir: string, start: any, end: number): void {
    let step = 1; // default right and reverse-left
    if (dir == "left" || dir == "reverse-right") {
      step = -1;
    }

    // clear old autoplay if exists
    if (this.autoplayId != null) {
      this.constants.KillAutoplay(this.autoplayId);
    }

    if (dir == "reverse-right" || dir == "reverse-left") {
      this.position.setX(start);
    }

    this.autoplayId = setInterval(() => {
      this.position.setX(this.position.x + step);
      if (
        this.position.x < 0 ||
        this.plot.pointValuesY.length - 1 < this.position.x
      ) {
        this.constants.KillAutoplay(this.autoplayId);
        this.lockPosition();
      } else if (this.position.x == end) {
        this.constants.KillAutoplay(this.autoplayId);
        this.updateAllAutoplay();
      } else {
        this.updateAllAutoplay();
      }
    }, this.plot.autoPlayRate);
  }

  lockPosition(): boolean {
    // lock to min / max postions
    let didLockHappen = false;
    // if (!constants.hasRect) {
    //   return didLockHappen;
    // }

    if (this.position.x < 0) {
      this.position.setX(0);
      didLockHappen = true;
    }
    if (this.position.x > this.plot.pointValuesY.length - 1) {
      this.position.setX(this.plot.pointValuesY.length - 1);
      didLockHappen = true;
    }

    return didLockHappen;
  }

  updateAll(): void {
    if (this.constants.showDisplay) {
      this.display.displayValues();
    }
    if (this.constants.showRect && this.constants.hasRect) {
      this.point.updatePointDisplay();
    }
    if (this.constants.sonifMode != "off") {
      this.plot.playTones();
    }
  }

  updateAllAutoplay(): void {
    if (this.constants.showDisplayInAutoplay) {
      this.display.displayValues();
    }
    if (this.constants.showRect) {
      this.point.updatePointDisplay();
    }
    if (this.constants.sonifMode != "off") {
      this.plot.playTones();
    }

    if (this.constants.brailleMode != "off") {
      this.display.updateBraillePos();
    }
  }
  updateAllBraille() {
    if (this.constants.showDisplayInBraille) {
      this.display.displayValues();
    }
    if (this.constants.showRect) {
      this.point.updatePointDisplay();
    }
    if (this.constants.sonifMode != "off") {
      this.plot.playTones();
    }
    this.display.updateBraillePos();
  }
}
