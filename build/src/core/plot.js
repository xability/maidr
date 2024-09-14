"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractPlot = void 0;
var Orientation;
(function (Orientation) {
    Orientation["VERTICAL"] = "vert";
    Orientation["HORIZONTAL"] = "horz";
})(Orientation || (Orientation = {}));
class AbstractPlot {
    constructor(audio, maidr) {
        var _a, _b, _c, _d, _e;
        this.audio = audio;
        this.title = (_a = maidr.title) !== null && _a !== void 0 ? _a : AbstractPlot.DEFAULT_TITLE;
        this.xAxis = (_c = (_b = maidr.axes) === null || _b === void 0 ? void 0 : _b.x) !== null && _c !== void 0 ? _c : AbstractPlot.DEFAULT_X_AXIS;
        this.yAxis = (_e = (_d = maidr.axes) === null || _d === void 0 ? void 0 : _d.y) !== null && _e !== void 0 ? _e : AbstractPlot.DEFAULT_Y_AXIS;
        this.orientation =
            maidr.orientation === Orientation.HORIZONTAL
                ? Orientation.HORIZONTAL
                : Orientation.VERTICAL;
        this.coordinate = this.initCoordinate(maidr.data);
    }
    moveDown() { }
    moveLeft() { }
    moveRight() { }
    moveUp() { }
    autoplayBackward() { }
    autoplayForward() { }
}
exports.AbstractPlot = AbstractPlot;
// Default values.
AbstractPlot.DEFAULT_TITLE = 'MAIDR Plot';
AbstractPlot.DEFAULT_X_AXIS = 'X';
AbstractPlot.DEFAULT_Y_AXIS = 'Y';
//# sourceMappingURL=plot.js.map