"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const plot_1 = require("./plot");
class LinePlot extends plot_1.AbstractPlot {
    constructor(audio, maidr) {
        super(audio, maidr);
    }
    initCoordinate(data) {
        return new LineCoordinate();
    }
}
exports.default = LinePlot;
class LineCoordinate {
    x() {
        return "";
    }
    y() {
        return "";
    }
}
//# sourceMappingURL=line.js.map