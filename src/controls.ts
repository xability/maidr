import BarChart from "./barplot";
import { Position } from "./helpers/Position";
import { BarPlot } from "./plots/bar/BarPlot";

export default class Control {
  constructor() {
    this.SetControls();
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
      window.position = new Position(-1, -1);
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
          window.position!.x = pos;
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
            window.position!.x += 1;
            updateInfoThisRound = true;
            isAtEnd = lockPosition();
          } else if (e.key === "ArrowLeft") {
            window.position!.x -= 1;
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
              window.position!.x += 1;
              updateInfoThisRound = true;
              isAtEnd = lockPosition();
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              window.position!.x -= 1;
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

      function lockPosition() {
        let didLockHappen = false;

        if (window.position!.x < 0) {
          window.position!.x = 0;
          didLockHappen = true;
          if (window.constants.brailleMode !== "off") {
            window.constants.brailleInput!.selectionEnd = 0;
          }
        }
        if (window.position!.x > window.plot.plotData.length - 1) {
          window.position!.x = window.plot.plotData.length - 1;
          didLockHappen = true;
          window.constants.brailleInput!.selectionEnd =
            window.plot.plotData.length - 1;
        }

        return didLockHappen;
      }

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
