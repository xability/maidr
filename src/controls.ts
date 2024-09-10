import BarChart from "./barplot";
import { Position } from "./helpers/Position";
import { ReactivePosition } from "./helpers/ReactivePosition";
import { BarPlot } from "./plots/bar/BarPlot";

export default class Control {
  position: ReactivePosition;
  constructor(position: ReactivePosition) {
    this.SetControls();
    this.position = position;
    this.position.subscribe(this.onPositionChange.bind(this));
  }

  onPositionChange(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
  }

  SetControls() {
    let constants = window.constants;
    let display = window.display!;
    const controlElements = [
      window.constants.chart,
      window.constants.brailleInput,
    ];

    let pressedL = false;
    for (const controlElement of controlElements) {
      if (controlElement)
        window.constants.events.push([
          controlElement,
          "keydown",
          (e: KeyboardEvent) => {
            if (pressedL) return;

            if (e.key === "b") {
              window.constants.tabMovement = 0;
              e.preventDefault();
              window.display!.toggleBrailleMode();
            }

            if (e.key === "t") {
              window.display!.toggleTextMode();
            }

            if (e.key === "s") {
              window.display!.toggleSonificationMode();
            }
          },
        ]);
    }

    for (const controlElement of controlElements) {
      if (controlElement)
        window.constants.events.push([
          controlElement,
          "keydown",
          (e: KeyboardEvent) => {
            if (e.key === "Tab") {
              if (e.shiftKey) {
                window.constants.tabMovement = -1;
              } else {
                window.constants.tabMovement = 1;
              }
            }
          },
        ]);
    }

    if (window.maidr!.type === "bar") {
      // window.position = new Position(-1, -1);
      this.position.set(-1, -1);
      // window.plot = new BarChart();
      window.plot = new BarPlot();

      let constants = window.constants;
      window.constants.lastx = 0;

      document.addEventListener("selectionchange", () => {
        if (window.constants.brailleMode === "on") {
          let pos = window.constants.brailleInput!.selectionStart!;
          if (pos < 0) {
            pos = 0;
          }
          this.position.setX(pos);
          // window.position!.x = pos;
          lockPosition();
          let testEnd = true;

          if (testEnd) {
            UpdateAll();
          }
          if (testEnd) {
            window.audio!.playEnd();
          }
        }
      });

      window.constants.events.push([
        window.constants.chart!,
        "keydown",
        (e: KeyboardEvent) => {
          let updateInfoThisRound = false;
          let isAtEnd = false;

          if (e.key === "ArrowRight") {
            this.position.setX(this.position.x + 1);
            // window.position!.x += 1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          } else if (e.key === "ArrowLeft") {
            this.position.setX(this.position.x - 1);
            // window.position!.x -= 1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          }

          if (updateInfoThisRound && !isAtEnd) {
            UpdateAll();
          }
          if (isAtEnd) {
            window.audio!.playEnd();
          }
        },
      ]);

      window.constants.events.push([
        window.constants.brailleInput!,
        "keydown",
        (e: KeyboardEvent | Event) => {
          if (e instanceof KeyboardEvent) {
            let updateInfoThisRound = false;
            let isAtEnd = false;

            if (e.key === "ArrowRight") {
              e.preventDefault();
              this.position.setX(this.position.x + 1);
              // window.position!.x += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              this.position.setX(this.position.x - 1);
              // window.position!.x -= 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            } else if (e.key === "Tab") {
            } else {
              e.preventDefault();
            }

            if (updateInfoThisRound && !isAtEnd) {
              UpdateAllBraille();
            }
            if (isAtEnd) {
              window.audio!.playEnd();
            }
          }
        },
      ]);

      const lockPosition = () => {
        let didLockHappen = false;

        // if (window.position!.x < 0) {
        if (this.position.x < 0) {
          // window.position!.x = 0;
          this.position.setX(0);
          didLockHappen = true;
          if (window.constants.brailleMode !== "off") {
            window.constants.brailleInput!.selectionEnd = 0;
          }
        }
        // if (window.position!.x > window.plot.plotData.length - 1) {
        if (this.position.x > window.plot.plotData.length - 1) {
          window.position!.x = window.plot.plotData.length - 1;
          didLockHappen = true;
          window.constants.brailleInput!.selectionEnd =
            window.plot.plotData.length - 1;
        }

        return didLockHappen;
      };

      function UpdateAll() {
        if (window.constants.showDisplay) {
          window.display!.displayValues();
        }
        if (window.constants.showRect && window.constants.hasRect) {
          window.plot.Select();
        }
        if (window.constants.soundMode !== "off") {
          window.plot.PlayTones();
        }
      }
      function UpdateAllBraille() {
        if (window.constants.showDisplayInBraille) {
          window.display!.displayValues();
        }
        if (window.constants.showRect && window.constants.hasRect) {
          window.plot.Select();
        }
        if (window.constants.soundMode !== "off") {
          window.plot.PlayTones();
        }
        window.display!.updateBraillePos();
      }
    }
  }
}
