"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const audio_1 = require("../engine/audio");
const bar_1 = require("./bar");
const line_1 = require("./line");
var PlotType;
(function (PlotType) {
    PlotType["BAR"] = "bar";
    PlotType["LINE"] = "line";
})(PlotType || (PlotType = {}));
class PlotFactory {
    static create(maidr) {
        switch (maidr.type) {
            case PlotType.BAR:
                return new bar_1.default(this.audio, maidr);
            case PlotType.LINE:
                return new line_1.default(this.audio, maidr);
            default:
                throw new Error(`Invalid plot type: ${maidr.type}`);
        }
    }
}
PlotFactory.audio = new audio_1.default();
exports.default = PlotFactory;
//# sourceMappingURL=factory.js.map