"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const plot_1 = require("./plot");
class BarPlot extends plot_1.AbstractPlot {
    constructor(audio, maidr) {
        super(audio, maidr);
    }
    initCoordinate(data) {
        return new BarCoordinate(data);
    }
}
exports.default = BarPlot;
class BarCoordinate {
    constructor(data) {
        this.xLevel = data.x;
        this.yLevel = data.y;
        const { min: minX, max: maxX } = this.calculateMinMax(this.xLevel);
        const { min: minY, max: maxY } = this.calculateMinMax(this.yLevel);
        this.minX = minX;
        this.maxX = maxX;
        this.minY = minY;
        this.maxY = maxY;
    }
    calculateMinMax(arr) {
        const numbers = arr.filter(value => typeof value === 'number');
        if (numbers.length === 0) {
            return { min: undefined, max: undefined };
        }
        return {
            min: Math.min(...numbers),
            max: Math.max(...numbers),
        };
    }
    x() {
        return '';
    }
    y() {
        return '';
    }
}
//# sourceMappingURL=bar.js.map