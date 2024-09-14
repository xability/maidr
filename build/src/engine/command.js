"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToggleTextCommand = exports.ToggleSoundCommand = exports.MoveRightCommand = exports.MoveLeftCommand = exports.MoveDownCommand = exports.MoveUpCommand = void 0;
class MoveUpCommand {
    constructor(plot) {
        this.plot = plot;
    }
    execute() {
        this.plot.moveUp();
    }
}
exports.MoveUpCommand = MoveUpCommand;
class MoveDownCommand {
    constructor(plot) {
        this.plot = plot;
    }
    execute() {
        this.plot.moveDown();
    }
}
exports.MoveDownCommand = MoveDownCommand;
class MoveLeftCommand {
    constructor(plot) {
        this.plot = plot;
    }
    execute() {
        this.plot.moveLeft();
    }
}
exports.MoveLeftCommand = MoveLeftCommand;
class MoveRightCommand {
    constructor(plot) {
        this.plot = plot;
    }
    execute() {
        this.plot.moveRight();
    }
}
exports.MoveRightCommand = MoveRightCommand;
class ToggleSoundCommand {
    constructor(audio) {
        this.audio = audio;
    }
    execute() {
        this.audio.toggle();
    }
}
exports.ToggleSoundCommand = ToggleSoundCommand;
class ToggleTextCommand {
    constructor(display) {
        this.display = display;
    }
    execute() {
        this.display.toggle();
    }
}
exports.ToggleTextCommand = ToggleTextCommand;
//# sourceMappingURL=command.js.map