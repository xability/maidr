"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var DisplayMode;
(function (DisplayMode) {
    DisplayMode["OFF"] = "off";
    DisplayMode["TERSE"] = "terse";
    DisplayMode["VERBOSE"] = "verbose";
})(DisplayMode || (DisplayMode = {}));
class Display {
    constructor() {
        this.mode = DisplayMode.TERSE;
    }
    showText() {
        // Show text only if turned on.
        if (this.mode === DisplayMode.OFF) {
            return;
        }
    }
    toggle() {
        switch (this.mode) {
            case DisplayMode.OFF:
                this.mode = DisplayMode.TERSE;
                break;
            case DisplayMode.TERSE:
                this.mode = DisplayMode.VERBOSE;
                break;
            case DisplayMode.VERBOSE:
                this.mode = DisplayMode.OFF;
                break;
        }
    }
}
exports.default = Display;
//# sourceMappingURL=display.js.map