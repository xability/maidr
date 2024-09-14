"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const plot_1 = require("./plot");
class LinePlot extends plot_1.AbstractPlot {
    constructor(audio, maidr) {
        super(audio, maidr);
        this.data = maidr.data;
    }
}
exports.default = LinePlot;
//# sourceMappingURL=line.js.map