"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hotkeys_js_1 = require("hotkeys-js");
const command_1 = require("./command");
var Keymap;
(function (Keymap) {
    // Navigation
    Keymap["MOVE_UP"] = "up";
    Keymap["MOVE_DOWN"] = "down";
    Keymap["MOVE_RIGHT"] = "right";
    Keymap["MOVE_LEFT"] = "left";
    // BTS
    // TOGGLE_BRAILLE = "b",
    Keymap["TOGGLE_TEXT"] = "t";
    Keymap["TOGGLE_SOUND"] = "s";
})(Keymap || (Keymap = {}));
class KeyBinding {
    constructor(audio, display, plot) {
        this.audio = audio;
        this.display = display;
        this.plot = plot;
        this.bindings = this.createBindings();
    }
    createBindings() {
        const bindings = new Map();
        for (const key of Object.values(Keymap)) {
            const command = this.createCommand(key);
            this.bindings.set(key, command);
        }
        return bindings;
    }
    createCommand(key) {
        switch (key) {
            case Keymap.MOVE_UP:
                return new command_1.MoveUpCommand(this.plot);
            case Keymap.MOVE_DOWN:
                return new command_1.MoveDownCommand(this.plot);
            case Keymap.MOVE_RIGHT:
                return new command_1.MoveRightCommand(this.plot);
            case Keymap.MOVE_LEFT:
                return new command_1.MoveLeftCommand(this.plot);
            case Keymap.TOGGLE_SOUND:
                return new command_1.ToggleSoundCommand(this.audio);
            case Keymap.TOGGLE_TEXT:
                return new command_1.ToggleTextCommand(this.display);
            default:
                throw new Error(`Unsupported key: ${key}`);
        }
    }
    register() {
        for (const [key, command] of this.bindings.entries()) {
            (0, hotkeys_js_1.default)(key, (event) => {
                event.preventDefault();
                command.execute(event);
            });
        }
    }
    unregister() {
        hotkeys_js_1.default.unbind();
    }
}
exports.default = KeyBinding;
//# sourceMappingURL=key_binding.js.map