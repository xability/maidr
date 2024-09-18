/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/audio/AudioManager.ts":
/*!***********************************!*\
  !*** ./src/audio/AudioManager.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AudioManager: () => (/* binding */ AudioManager)
/* harmony export */ });
/* harmony import */ var _constants__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../constants */ "./src/constants.ts");
/* harmony import */ var _helpers_ReactivePosition__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../helpers/ReactivePosition */ "./src/helpers/ReactivePosition.ts");


class AudioManager {
    constructor() {
        this.smoothId = null;
        this.isSmoothAutoplay = false;
        this.endChime = null;
        this.canPlayEndChime = false;
        this.constants = window.constants;
        this.AudioContext =
            window["AudioContext"] || window["webkitAudioContext"];
        this.audioContext = new AudioContext();
        this.compressor = this.compressorSetup();
        this.smoothGain = this.audioContext.createGain();
        this.position = new _helpers_ReactivePosition__WEBPACK_IMPORTED_MODULE_1__.ReactivePosition();
    }
    compressorSetup() {
        const compressor = this.audioContext.createDynamicsCompressor();
        const smoothGain = this.audioContext.createGain();
        compressor.threshold.value = -50;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        smoothGain.gain.value = 0.5;
        compressor.release.value = 0.25;
        compressor.connect(smoothGain);
        smoothGain.connect(this.audioContext.destination);
        return compressor;
    }
    playOscillator(frequency, currentDuration, panning, currentVol = 1, wave = _constants__WEBPACK_IMPORTED_MODULE_0__.Constants.OSCILLATOR_TYPES.SINE) {
        const t = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = wave;
        oscillator.frequency.value = Number(frequency);
        oscillator.start();
        // create gain for this event
        const gainThis = this.audioContext.createGain();
        gainThis.gain.setValueCurveAtTime([
            0.5 * currentVol,
            1 * currentVol,
            0.5 * currentVol,
            0.5 * currentVol,
            0.5 * currentVol,
            0.1 * currentVol,
            1e-4 * currentVol,
        ], t, currentDuration); // this is what makes the tones fade out properly and not clip
        let MAX_DISTANCE = 10000;
        let posZ = 1;
        const panner = new PannerNode(this.audioContext, {
            panningModel: "HRTF",
            distanceModel: "linear",
            positionX: this.position.x,
            positionY: this.position.y,
            positionZ: posZ,
            orientationX: 0.0,
            orientationY: 0.0,
            orientationZ: -1.0,
            refDistance: 1,
            maxDistance: MAX_DISTANCE,
            rolloffFactor: 10,
            coneInnerAngle: 40,
            coneOuterAngle: 50,
            coneOuterGain: 0.4,
        });
        // create panning
        const stereoPanner = this.audioContext.createStereoPanner();
        stereoPanner.pan.value = panning;
        oscillator.connect(gainThis);
        gainThis.connect(stereoPanner);
        stereoPanner.connect(panner);
        panner.connect(this.compressor);
        // create panner node
        // play sound for duration
        setTimeout(() => {
            panner.disconnect();
            gainThis.disconnect();
            oscillator.stop();
            oscillator.disconnect();
        }, currentDuration * 1e3 * 2);
    }
    playSmooth({ freqArr = [600, 500, 400, 300], duration = 2, panningArr = [-1, 0, 1], volume = 1, wave = _constants__WEBPACK_IMPORTED_MODULE_0__.Constants.OSCILLATOR_TYPES.SINE, } = {}) {
        const startTime = this.audioContext.currentTime;
        const gainArr = this.createGainArray(freqArr.length, volume);
        const smoothOscillator = this.createAndStartOscillator(wave, freqArr, startTime, duration);
        this.smoothGain = this.createGainNode(gainArr, startTime, duration);
        const panner = this.createPannerNode();
        const stereoPanner = this.createStereoPanner(panningArr, startTime, duration);
        this.connectAudioNodes(smoothOscillator, this.smoothGain, stereoPanner, panner);
        this.isSmoothAutoplay = true;
        this.smoothId = this.scheduleCleanup(smoothOscillator, panner, duration);
    }
    createGainArray(length, volume) {
        const gainArr = new Array(length * 3).fill(0.5 * volume);
        gainArr.push(1e-4 * volume);
        return gainArr;
    }
    createAndStartOscillator(wave, freqArr, startTime, duration) {
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = wave;
        oscillator.frequency.setValueCurveAtTime(freqArr, startTime, duration);
        oscillator.start();
        return oscillator;
    }
    createGainNode(gainArr, startTime, duration) {
        const gainNode = this.audioContext.createGain();
        gainNode.gain.setValueCurveAtTime(gainArr, startTime, duration);
        return gainNode;
    }
    createPannerNode() {
        return new PannerNode(this.audioContext, {
            panningModel: "HRTF",
            distanceModel: "linear",
            positionX: this.position.x,
            positionY: this.position.y,
            positionZ: 1,
            orientationX: 0.0,
            orientationY: 0.0,
            orientationZ: -1.0,
            refDistance: 1,
            maxDistance: 10000,
            rolloffFactor: 10,
            coneInnerAngle: 40,
            coneOuterAngle: 50,
            coneOuterGain: 0.4,
        });
    }
    createStereoPanner(panningArr, startTime, duration) {
        const stereoPanner = this.audioContext.createStereoPanner();
        stereoPanner.pan.setValueCurveAtTime(panningArr, startTime, duration);
        return stereoPanner;
    }
    connectAudioNodes(oscillator, gain, stereoPanner, panner) {
        oscillator.connect(gain);
        gain.connect(stereoPanner);
        stereoPanner.connect(panner);
        panner.connect(this.compressor);
    }
    scheduleCleanup(oscillator, panner, duration) {
        return setTimeout(() => {
            panner.disconnect();
            this.smoothGain.disconnect();
            oscillator.stop();
            oscillator.disconnect();
            this.isSmoothAutoplay = false;
        }, duration * 1e3 * 2);
    }
    PlayNull() {
        let frequency = this.constants.NULL_FREQUENCY;
        let duration = this.constants.duration;
        let panning = 0;
        let vol = this.constants.vol;
        let wave = _constants__WEBPACK_IMPORTED_MODULE_0__.Constants.OSCILLATOR_TYPES.TRIANGLE;
        this.playOscillator(frequency, duration, panning, vol, wave);
        setTimeout(function (audioThis) {
            audioThis.playOscillator((frequency * 23) / 24, duration, panning, vol, wave);
        }, Math.round((duration / 5) * 1000), this);
    }
    playEnd() {
        if (this.canPlayEndChime && this.endChime instanceof AudioBuffer) {
            try {
                const source = this.audioContext.createBufferSource();
                source.buffer = this.endChime;
                source.connect(this.audioContext.destination);
                source.start();
                // Clean up after the sound has finished playing
                source.onended = () => {
                    source.disconnect();
                };
            }
            catch (error) {
                console.error("Failed to play end chime:", error);
            }
        }
    }
    KillSmooth() {
        if (this.smoothId !== null) {
            this.smoothGain.gain.cancelScheduledValues(0);
            this.smoothGain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + 0.03);
            clearTimeout(this.smoothId);
            this.isSmoothAutoplay = false;
        }
    }
}


/***/ }),

/***/ "./src/constants.ts":
/*!**************************!*\
  !*** ./src/constants.ts ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ChatLLM: () => (/* binding */ ChatLLM),
/* harmony export */   Constants: () => (/* binding */ Constants),
/* harmony export */   LogError: () => (/* binding */ LogError),
/* harmony export */   Resources: () => (/* binding */ Resources)
/* harmony export */ });
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class Constants {
    constructor() {
        this.chartContainerId = "chart-container";
        this.mainContainerId = "maidr-container";
        this.brailleContainerId = "braille-div";
        this.brailleInputId = "braille-input";
        this.brailleInput = null;
        this.infoId = "info";
        this.infoDiv = null;
        this.announcementContainerId = "announcements";
        this.announcementContainer = null;
        this.LLMmaxResponseTokens = 1000;
        this.endChimeId = "end_chime";
        this.containerId = "container";
        this.projectId = "maidr";
        this.announcement_container_id = 'announcements';
        this.chartId = "";
        this.chart = null;
        this.chartContainer = null;
        this.mainContainer = null;
        this.review_container = null;
        this.events = [];
        this.postLoadEvents = [];
        this.textMode = "verbose";
        this.brailleMode = "off";
        this.soundMode = "on";
        this.reviewMode = "off";
        this.sonifMode = 'on';
        this.minX = 0;
        this.maxX = 0;
        this.minY = 0;
        this.maxY = 0;
        this.plotId = "";
        this.chartType = "";
        this.navigation = 1;
        this.MAX_FREQUENCY = 1000;
        this.MIN_FREQUENCY = 200;
        this.NULL_FREQUENCY = 100;
        this.combinedVolMin = 0.25;
        this.combinedVolMax = 1.25;
        this.MAX_SPEED = 500;
        this.MIN_SPEED = 50;
        this.DEFAULT_SPEED = 250;
        this.INTERVAL = 20;
        this.AUTOPLAY_DURATION = 5000;
        this.vol = 0.5;
        this.MAX_VOL = 30;
        this.autoPlayRate = this.DEFAULT_SPEED;
        this.colorSelected = "#03C809";
        this.brailleDisplayLength = 32;
        this.showRect = 1;
        this.hasRect = 1;
        this.hasSmooth = 1;
        this.duration = 0.3;
        this.outlierDuration = 0.06;
        this.autoPlayOutlierRate = 50;
        this.autoPlayPointsRate = 50;
        this.colorUnselected = "#595959";
        this.canTrack = 0;
        this.isTracking = 1;
        this.visualBraille = false;
        this.ariaMode = "assertive";
        this.userSettingsKeys = [
            "vol",
            "autoPlayRate",
            "brailleDisplayLength",
            "colorSelected",
            "MIN_FREQUENCY",
            "MAX_FREQUENCY",
            "keypressInterval",
            "ariaMode",
            "openAIAuthKey",
            "geminiAuthKey",
            "skillLevel",
            "skillLevelOther",
            "LLMModel",
            "LLMPreferences",
            "LLMOpenAiMulti",
            "LLMGeminiMulti",
            "autoInitLLM",
        ];
        this.openAIAuthKey = null;
        this.geminiAuthKey = null;
        this.maxLLMResponseTokens = 1000;
        this.playLLMWaitingSound = true;
        this.LLMDetail = "high";
        this.LLMModel = "openai";
        this.LLMSystemMessage = "You are a helpful assistant describing the chart to a blind person. ";
        this.skillLevel = "basic";
        this.skillLevelOther = "";
        this.autoInitLLM = true;
        this.verboseText = "";
        this.waitingQueue = 0;
        this.showDisplay = 1;
        this.showDisplayInBraille = 1;
        this.showDisplayInAutoplay = 0;
        this.outlierInterval = null;
        this.isMac = navigator.userAgent.toLowerCase().includes("mac");
        this.control = this.isMac ? "Cmd" : "Ctrl";
        this.alt = this.isMac ? "option" : "Alt";
        this.home = this.isMac ? "fn + Left arrow" : "Home";
        this.end = this.isMac ? "fn + Right arrow" : "End";
        this.keypressInterval = 2000;
        this.tabMovement = null;
        this.debugLevel = 3;
        this.manualData = true;
        this.brailleContainer = null;
        this.lastx = 0;
        this.autoplayId = null;
    }
    ConvertHexToRGBString(hexColorString) {
        return ("rgb(" +
            parseInt(hexColorString.slice(1, 3), 16) +
            "," +
            parseInt(hexColorString.slice(3, 5), 16) +
            "," +
            parseInt(hexColorString.slice(5, 7), 16) +
            ")");
    }
    ColorInvert(color) {
        const rgb = color.replace(/[^\d,]/g, "").split(",");
        const r = 255 - parseInt(rgb[0]);
        const g = 255 - parseInt(rgb[1]);
        const b = 255 - parseInt(rgb[2]);
        return `rgb(${r},${g},${b})`;
    }
    GetBetterColor(oldColor) {
        if (oldColor.indexOf("#") !== -1) {
            oldColor = this.ConvertHexToRGBString(oldColor);
        }
        let newColor = this.ColorInvert(oldColor);
        const rgb = newColor.replace(/[^\d,]/g, "").split(",");
        if (Math.abs(parseInt(rgb[1]) - parseInt(rgb[0])) < 10 &&
            Math.abs(parseInt(rgb[2]) - parseInt(rgb[0])) < 10 &&
            (parseInt(rgb[0]) > 86 || parseInt(rgb[0]) < 169)) {
            newColor = this.colorSelected;
        }
        return newColor;
    }
    GetStyleArrayFromString(styleString) {
        return styleString.replaceAll(" ", "").split(/[:;]/);
    }
    GetStyleStringFromArray(styleArray) {
        let styleString = "";
        for (let i = 0; i < styleArray.length; i++) {
            if (i % 2 === 0) {
                if (i !== styleArray.length - 1) {
                    styleString += styleArray[i] + ": ";
                }
                else {
                    styleString += styleArray[i];
                }
            }
            else {
                styleString += styleArray[i] + "; ";
            }
        }
        return styleString;
    }
    // The methods SpeedUp(), SpeedDown(), SpeedReset() and KillAutoplay() are codebase-wide utilized methods. Should they be moved out of constants?
    SpeedUp() {
        if (this.autoPlayRate - this.INTERVAL > this.MIN_SPEED) {
            this.autoPlayRate -= this.INTERVAL;
        }
    }
    SpeedDown() {
        if (this.autoPlayRate + this.INTERVAL <= this.MAX_SPEED) {
            this.autoPlayRate += this.INTERVAL;
        }
    }
    SpeedReset() {
        this.autoPlayRate = this.DEFAULT_SPEED;
    }
    KillAutoplay(autoplayId) {
        if (autoplayId !== null) {
            clearInterval(autoplayId);
        }
    }
}
Constants.OSCILLATOR_TYPES = {
    SINE: 'sine',
    SQUARE: 'square',
    SAWTOOTH: 'sawtooth',
    TRIANGLE: 'triangle'
};
class Resources {
    constructor() {
        this.strings = {
            upper_outlier: "Upper Outlier",
            lower_outlier: "Lower Outlier",
            min: "Minimum",
            max: "Maximum",
            25: "25%",
            50: "50%",
            75: "75%",
            q1: "25%",
            q2: "50%",
            q3: "75%",
            son_on: "Sonification on",
            son_off: "Sonification off",
            son_des: "Sonification descrete",
            son_comp: "Sonification compare",
            son_ch: "Sonification chord",
            son_sep: "Sonification separate",
            son_same: "Sonification combined",
            empty: "Empty",
            openai: "OpenAI Vision",
            gemini: "Gemini Pro Vision",
            multi: "Multiple AI",
            processing: "Processing Chart...",
        };
    }
    GetString(id) {
        return this.strings[id];
    }
}
class ChatLLM {
    constructor() {
        this.firstTime = true;
        this.firstMulti = true;
        this.firstOpen = true;
        this.shown = false;
        this.whereWasMyFocus = null;
        this.waitingInterval = null;
        this.waitingSoundOverride = null;
        this.requestJson = null;
        this.LLMImage = null;
        this.tabMovement = null;
    }
    CreateComponent() {
        var _a;
        const html = `
        <div id="chatLLM" class="modal hidden" role="dialog" tabindex="-1">
            <div class="modal-dialog" role="document" tabindex="0">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="chatLLM_title" class="modal-title">Ask a Question</h2>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div id="chatLLM_chat_history_wrapper">
                        <div id="chatLLM_chat_history" aria-live="${window.constants.ariaMode}" aria-relevant="additions">
                        </div>
                        <p id="chatLLM_copy_all_wrapper"><button id="chatLLM_copy_all">Copy all to clipboard</button></p>
                        </div>
                        <div id="chatLLM_content">
                          <p><input type="text" id="chatLLM_input" class="form-control" name="chatLLM_input" aria-labelledby="chatLLM_title" size="50"></p>
                          <div class="LLM_suggestions">
                            <p><button type="button">What is the title?</button></p>
                            <p><button type="button">What are the high and low values?</button></p>
                            <p><button type="button">What is the general shape of the chart?</button></p>
                          </div>
                          <div id="more_suggestions_container" class="LLM_suggestions">
                            <p><button type="button">Please provide the title of this visualization, then provide a description for someone who is blind or low vision. Include general overview of axes and the data at a high-level.</button></p>
                            <p><button type="button">For the visualization I shared, please provide the following (where applicable): mean, standard deviation, extreme, correlations, relational comparisons like greater than OR lesser than.</button></p>
                            <p><button type="button">Based on the visualization shared, address the following: Do you observe any unforeseen trends? If yes, what?  Please convey any complex multi-faceted patterns present. Can you identify any noteworthy exceptions that aren't readily apparent through non-visual methods of analysis?</button></p>
                            <p><button type="button">Provide context to help explain the data depicted in this visualization based on domain-specific insight.</button></p>
                          </div>
                          <p><button type="button" id="chatLLM_submit">Submit</button></p>
                        </div>
                    </div>
                    <div class="modal-footer">
                      <button type="button" id="reset_chatLLM">Reset</button>
                      <button type="button" id="close_chatLLM">Close</button>
                    </div>
                </div>
            </div>
        </div>
        <div id="chatLLM_modal_backdrop" class="modal-backdrop hidden"></div>
    `;
        (_a = document.querySelector("body")) === null || _a === void 0 ? void 0 : _a.insertAdjacentHTML("beforeend", html);
    }
    setEvents() {
        let constants = window.constants;
        const allClose = document.querySelectorAll("#close_chatLLM, #chatLLM .close");
        allClose.forEach((closeElem) => window.constants.events.push([
            closeElem,
            "click",
            () => {
                this.Toggle(false);
            },
        ]));
        window.constants.events.push([
            document.getElementById("chatLLM"),
            "keyup",
            (e) => {
                if (e.key === "Esc") {
                    this.Toggle(false);
                }
            },
        ]);
        window.constants.events.push([
            document,
            "keyup",
            (e) => {
                if ((e.key === "?" && (e.ctrlKey || e.metaKey)) || e.key === "¿") {
                    this.Toggle();
                }
            },
        ]);
        window.constants.events.push([
            document.getElementById("chatLLM_submit"),
            "click",
            () => {
                const text = document.getElementById("chatLLM_input").value;
                this.DisplayChatMessage("User", text);
                this.Submit(text);
            },
        ]);
        window.constants.events.push([
            document.getElementById("chatLLM_input"),
            "keyup",
            (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    const text = document.getElementById("chatLLM_input").value;
                    this.DisplayChatMessage("User", text);
                    this.Submit(text);
                }
            },
        ]);
        const suggestions = document.querySelectorAll("#chatLLM .LLM_suggestions button:not(#more_suggestions)");
        suggestions.forEach((suggestion) => window.constants.events.push([
            suggestion,
            "click",
            (e) => {
                const text = e.target.innerHTML;
                this.DisplayChatMessage("User", text);
                this.Submit(text);
            },
        ]));
        window.constants.events.push([
            document.getElementById("delete_openai_key"),
            "click",
            () => {
                document.getElementById("openai_auth_key").value =
                    "";
            },
        ]);
        window.constants.events.push([
            document.getElementById("delete_gemini_key"),
            "click",
            () => {
                document.getElementById("gemini_auth_key").value =
                    "";
            },
        ]);
        window.constants.events.push([
            document.getElementById("reset_chatLLM"),
            "click",
            () => {
                this.ResetLLM();
            },
        ]);
        window.constants.events.push([
            document.getElementById("chatLLM"),
            "click",
            (e) => {
                this.CopyChatHistory(e);
            },
        ]);
        window.constants.events.push([
            document.getElementById("chatLLM"),
            "keyup",
            (e) => {
                this.CopyChatHistory(e);
            },
        ]);
    }
    CopyChatHistory(e) {
        let text = "";
        if (typeof e === "undefined") {
            text = document.getElementById("chatLLM_chat_history").innerHTML;
        }
        else if (e.type === "click") {
            if (e.target.id === "chatLLM_copy_all") {
                text = document.getElementById("chatLLM_chat_history").innerHTML;
            }
            else if (e.target.classList.contains("chatLLM_message_copy_button")) {
                text = e.target.closest("p").previousElementSibling
                    .innerHTML;
            }
        }
        else if (e.type === "keyup" && e instanceof KeyboardEvent) {
            if (e.key === "C" &&
                (e.ctrlKey ||
                    e.metaKey ||
                    e.altKey) &&
                e.shiftKey) {
                e.preventDefault();
                const elem = document.querySelector("#chatLLM_chat_history > .chatLLM_message_other:last-of-type");
                if (elem) {
                    text = elem.innerHTML;
                }
            }
            else if (e.key === "A" &&
                (e.ctrlKey ||
                    e.metaKey ||
                    e.altKey) &&
                e.shiftKey) {
                e.preventDefault();
                text = document.getElementById("chatLLM_chat_history").innerHTML;
            }
        }
        if (text !== "") {
            const cleanElems = document.createElement("div");
            cleanElems.innerHTML = text;
            const removeThese = cleanElems.querySelectorAll(".chatLLM_message_copy");
            removeThese.forEach((elem) => elem.remove());
            let markdown = this.htmlToMarkdown(cleanElems);
            markdown = markdown.replace(/\n{3,}/g, "\n\n");
            try {
                navigator.clipboard.writeText(markdown);
            }
            catch (err) {
                console.error("Failed to copy: ", err);
            }
            return markdown;
        }
    }
    htmlToMarkdown(element) {
        let markdown = "";
        const convertElementToMarkdown = (element) => {
            switch (element.tagName) {
                case "H1":
                    return `# ${element.textContent}`;
                case "H2":
                    return `## ${element.textContent}`;
                case "H3":
                    return `### ${element.textContent}`;
                case "H4":
                    return `#### ${element.textContent}`;
                case "H5":
                    return `##### ${element.textContent}`;
                case "H6":
                    return `###### ${element.textContent}`;
                case "P":
                    return element.textContent;
                case "DIV":
                    return (Array.from(element.childNodes)
                        .map((child) => convertElementToMarkdown(child))
                        .join("\n") + "\n\n");
                default:
                    return Array.from(element.childNodes)
                        .map((child) => convertElementToMarkdown(child))
                        .join("");
            }
        };
        if (element.nodeType === Node.ELEMENT_NODE) {
            markdown += convertElementToMarkdown(element);
        }
        else if (element.nodeType === Node.TEXT_NODE &&
            element.textContent.trim() !== "") {
            markdown += element.textContent.trim();
        }
        return markdown.trim();
    }
    Submit(text_1) {
        return __awaiter(this, arguments, void 0, function* (text, firsttime = false) {
            let img = null;
            let constants = window.constants;
            this.firstMulti = true;
            if ((this.firstOpen || window.constants.LLMModel === "gemini") &&
                !firsttime &&
                window.constants.verboseText.length > 0) {
                text =
                    "Here is the current position in the chart; no response necessarily needed, use this info only if it's relevant to future questions: " +
                        window.constants.verboseText +
                        ". My question is: " +
                        text;
                this.firstOpen = false;
            }
            if (window.constants.playLLMWaitingSound) {
                this.WaitingSound(true);
            }
            if (window.constants.LLMModel === "openai") {
                if (firsttime) {
                    img = yield this.ConvertSVGtoJPG(window.maidr.id, "openai");
                }
                this.OpenAIPrompt(text, img);
            }
        });
    }
    WaitingSound(onoff = true) {
        const delay = 1000;
        const freq = 440;
        const inprogressFreq = freq * 2;
        if (onoff) {
            if (this.waitingInterval) {
                clearInterval(this.waitingInterval);
                this.waitingInterval = null;
            }
            if (this.waitingSoundOverride) {
                clearTimeout(this.waitingSoundOverride);
                this.waitingSoundOverride = null;
            }
        }
        else {
            if (window.audio && this.shown) {
                window.audio.playOscillator(inprogressFreq, 0.2, 0);
            }
            this.KillAllWaitingSounds();
        }
    }
    KillAllWaitingSounds() {
        if (this.waitingInterval) {
            clearInterval(this.waitingInterval);
            this.waitingInterval = null;
        }
        if (this.waitingSoundOverride) {
            clearTimeout(this.waitingSoundOverride);
            this.waitingSoundOverride = null;
        }
    }
    InitChatMessage() {
        const LLMName = window.resources.GetString(window.constants.LLMModel);
        this.firstTime = false;
        this.DisplayChatMessage(LLMName, window.resources.GetString("processing"), true);
        const defaultPrompt = this.GetDefaultPrompt();
        this.Submit(defaultPrompt, true);
    }
    ProcessLLMResponse(data, model) {
        this.WaitingSound(false);
        console.log("LLM response: ", data);
        let text = "";
        const LLMName = window.resources.GetString(model);
        if (model === "openai") {
            text = data.choices[0].message.content;
            const i = this.requestJson.messages.length;
            this.requestJson.messages[i] = {};
            this.requestJson.messages[i].role = "assistant";
            this.requestJson.messages[i].content = text;
            if (data.error) {
                this.DisplayChatMessage(LLMName, "Error processing request.", true);
                this.WaitingSound(false);
            }
            else {
                this.DisplayChatMessage(LLMName, text);
            }
        }
        else if (model === "gemini") {
            if (data.text()) {
                text = data.text();
                this.DisplayChatMessage(LLMName, text);
            }
            else {
                if (!data.error) {
                    data.error = "Error processing request.";
                    this.WaitingSound(false);
                }
            }
            if (data.error) {
                this.DisplayChatMessage(LLMName, "Error processing request.", true);
                this.WaitingSound(false);
            }
            else {
                // todo: display actual response
            }
        }
    }
    fakeLLMResponseData() {
        let responseText;
        if (this.requestJson.messages.length > 2) {
            responseText = {
                id: "chatcmpl-8Y44iRCRrohYbAqm8rfBbJqTUADC7",
                object: "chat.completion",
                created: 1703129508,
                model: "gpt-4-1106-vision-preview",
                usage: {
                    prompt_tokens: 451,
                    completion_tokens: 16,
                    total_tokens: 467,
                },
                choices: [
                    {
                        message: {
                            role: "assistant",
                            content: "A fake response from the LLM. Nice.",
                        },
                        finish_reason: "length",
                        index: 0,
                    },
                ],
            };
        }
        else {
            responseText = {
                id: "chatcmpl-8Y44iRCRrohYbAqm8rfBbJqTUADC7",
                object: "chat.completion",
                created: 1703129508,
                model: "gpt-4-1106-vision-preview",
                usage: {
                    prompt_tokens: 451,
                    completion_tokens: 16,
                    total_tokens: 467,
                },
                choices: [
                    {
                        message: {
                            role: "assistant",
                            content: "The chart you're referring to is a bar graph titled \"The Number of Diamonds",
                        },
                        finish_reason: "length",
                        index: 0,
                    },
                ],
            };
        }
        return responseText;
    }
    OpenAIPrompt(text, img = null) {
        const url = "https://api.openai.com/v1/chat/completions";
        const auth = window.constants.openAIAuthKey;
        const requestJson = this.OpenAIJson(text, img);
        console.log("LLM request: ", requestJson);
        fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + auth,
            },
            body: JSON.stringify(requestJson),
        })
            .then((response) => response.json())
            .then((data) => {
            this.ProcessLLMResponse(data, "openai");
        })
            .catch((error) => {
            this.WaitingSound(false);
            console.error("Error:", error);
            this.DisplayChatMessage("OpenAI", "Error processing request.", true);
        });
    }
    OpenAIJson(text, img = null) {
        let sysMessage = window.constants.LLMSystemMessage;
        const backupMessage = "Describe " + window.maidr.type + " charts to a blind person";
        if (!this.requestJson) {
            this.requestJson = {
                model: "gpt-4o",
                max_tokens: window.constants.LLMmaxResponseTokens,
                messages: [
                    {
                        role: "system",
                        content: sysMessage,
                    },
                ],
            };
        }
        const i = this.requestJson.messages.length;
        this.requestJson.messages[i] = {
            role: "user",
            content: img
                ? [
                    {
                        type: "text",
                        text,
                    },
                    {
                        type: "image_url",
                        image_url: { url: img },
                    },
                ]
                : text,
        };
        return this.requestJson;
    }
    DisplayChatMessage(user = "User", text = "", isSystem = false) {
        const hLevel = "h3";
        const multiAIName = window.resources.GetString("multi");
        const titleHtml = `
      <div class="chatLLM_message chatLLM_message_other">
        <h3 class="chatLLM_message_user">${multiAIName} Responses</h3>
      </div>
    `;
        const html = `
      <div class="chatLLM_message ${user === "User" ? "chatLLM_message_self" : "chatLLM_message_other"}">
      ${text !== window.resources.GetString("processing")
            ? `<${hLevel} class="chatLLM_message_user">${user}</${hLevel}>`
            : ""}
      <p class="chatLLM_message_text">${text}</p>
      </div>
      ${user !== "User" && text !== window.resources.GetString("processing")
            ? `<p class="chatLLM_message_copy"><button class="chatLLM_message_copy_button">Copy</button></p>`
            : ""}
    `;
        this.RenderChatMessage(html);
    }
    RenderChatMessage(html) {
        document
            .getElementById("chatLLM_chat_history")
            .insertAdjacentHTML("beforeend", html);
        document.getElementById("chatLLM_input").value = "";
        document.getElementById("chatLLM_chat_history").scrollTop =
            document.getElementById("chatLLM_chat_history").scrollHeight;
    }
    ResetLLM() {
        document.getElementById("chatLLM_chat_history").innerHTML = "";
        this.requestJson = null;
        this.firstTime = true;
        if (window.constants.autoInitLLM || this.shown) {
            this.InitChatMessage();
        }
    }
    Destroy() {
        const chatLLM = document.getElementById("chatLLM");
        if (chatLLM) {
            chatLLM.remove();
        }
        const backdrop = document.getElementById("chatLLM_modal_backdrop");
        if (backdrop) {
            backdrop.remove();
        }
    }
    Toggle(onoff) {
        if (typeof onoff === "undefined") {
            onoff = document.getElementById("chatLLM").classList.contains("hidden");
        }
        this.shown = onoff;
        if (onoff) {
            this.whereWasMyFocus = document.activeElement;
            this.tabMovement = 0;
            document.getElementById("chatLLM").classList.remove("hidden");
            document
                .getElementById("chatLLM_modal_backdrop")
                .classList.remove("hidden");
            // document.querySelector('#chatLLM .close')!.focus();
            if (this.firstTime) {
                this.InitChatMessage();
            }
        }
        else {
            document.getElementById("chatLLM").classList.add("hidden");
            document
                .getElementById("chatLLM_modal_backdrop")
                .classList.add("hidden");
            this.whereWasMyFocus.focus();
            this.whereWasMyFocus = null;
            this.firstOpen = true;
        }
    }
    ConvertSVGtoJPG(id, model) {
        return __awaiter(this, void 0, void 0, function* () {
            const svgElement = document.getElementById(id);
            return new Promise((resolve, reject) => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                let svgData = new XMLSerializer().serializeToString(svgElement);
                if (!svgData.startsWith("<svg xmlns")) {
                    svgData = `<svg xmlns="http://www.w3.org/2000/svg" ${svgData.slice(4)}`;
                }
                const svgSize = svgElement.viewBox.baseVal ||
                    svgElement.getBoundingClientRect();
                canvas.width = svgSize.width;
                canvas.height = svgSize.height;
                const img = new Image();
                img.onload = function () {
                    ctx.drawImage(img, 0, 0, svgSize.width, svgSize.height);
                    const jpegData = canvas.toDataURL("image/jpeg", 0.9);
                    if (model === "openai") {
                        resolve(jpegData);
                    }
                    else if (model === "gemini") {
                        const base64Data = jpegData.split(",")[1];
                        resolve(base64Data);
                    }
                    URL.revokeObjectURL(url);
                };
                img.onerror = function () {
                    reject(new Error("Error loading SVG"));
                };
                const svgBlob = new Blob([svgData], {
                    type: "image/svg+xml;charset=utf-8",
                });
                const url = URL.createObjectURL(svgBlob);
                img.src = url;
            });
        });
    }
    GetDefaultPrompt() {
        let text = "Describe this chart to a blind person";
        let constants = window.constants;
        let singleMaidr = window.maidr;
        if (window.constants.skillLevel) {
            if (window.constants.skillLevel === "other" &&
                window.constants.skillLevelOther) {
                text +=
                    " who has a " +
                        window.constants.skillLevelOther +
                        " understanding of statistical charts. ";
            }
            else {
                text +=
                    " who has a " +
                        window.constants.skillLevel +
                        " understanding of statistical charts. ";
            }
        }
        else {
            text += " who has a basic understanding of statistical charts. ";
        }
        text += "Here is a chart in image format";
        if (singleMaidr) {
            text += " and raw data in json format: \n";
            text += JSON.stringify(singleMaidr);
        }
        return text;
    }
}
class LogError {
    LogAbsentElement(a) {
        console.log(a, "not found. Visual highlighting is turned off.");
    }
    LogCriticalElement(a) {
        console.log(a, "is critical. MAIDR unable to run");
    }
    LogDifferentLengths(a, b) {
        console.log(a, "and", b, "do not have the same length. Visual highlighting is turned off.");
    }
}


/***/ }),

/***/ "./src/control/ControlManager.ts":
/*!***************************************!*\
  !*** ./src/control/ControlManager.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ControlManager: () => (/* binding */ ControlManager)
/* harmony export */ });
/* harmony import */ var _helpers_ChartType__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../helpers/ChartType */ "./src/helpers/ChartType.ts");
/* harmony import */ var _helpers_ReactivePosition__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../helpers/ReactivePosition */ "./src/helpers/ReactivePosition.ts");


class ControlManager {
    constructor(type) {
        this.audio = null;
        this.display = null;
        this.controlElements = [];
        this.pressedL = false;
        this.pressedTimeout = null;
        this.position = new _helpers_ReactivePosition__WEBPACK_IMPORTED_MODULE_1__.ReactivePosition();
        this.constants = window.constants;
        this.maidr = window.maidr;
        this.type = type;
        this.controlElements = [
            this.constants.chart,
            this.constants.brailleInput,
            this.constants.review_container
        ];
        this.SetControls();
    }
    SetControls() {
        this.controlElements.forEach(element => {
            element === null || element === void 0 ? void 0 : element.addEventListener('keydown', this.handleKeyDown.bind(this));
        });
    }
    handleKeyDown(e) {
        if (this.pressedL)
            return;
        switch (e.key.toLowerCase()) {
            case 'b':
                e.preventDefault();
                this.handleBrailleMode(e);
                break;
            case 't':
                this.handleTextMode();
                break;
            case 's':
                this.handleSonificationMode();
                break;
            case 'r':
                this.handleReviewMode(e);
                break;
            case ' ':
                this.handleSpaceKey();
                break;
            case 'tab':
                this.handleTabKey(e);
            case 'pagedown':
            case 'pageup':
                this.handleLayerChange(e);
                break;
        }
    }
    handleBrailleMode(e) {
        var _a;
        this.constants.tabMovement = 0;
        e.preventDefault();
        this.display.toggleBrailleMode();
        (_a = this.display) === null || _a === void 0 ? void 0 : _a.announceText(this.constants.brailleMode === 'on' ? 'Braille mode on' : 'Braille mode off');
    }
    handleTextMode() {
        var _a;
        this.display.toggleTextMode();
        (_a = this.display) === null || _a === void 0 ? void 0 : _a.announceText(this.constants.textMode === 'verbose' ? 'Verbose mode on' : 'Verbose mode off');
    }
    handleSonificationMode() {
        var _a;
        this.display.toggleSonificationMode();
        (_a = this.display) === null || _a === void 0 ? void 0 : _a.announceText(this.constants.sonifMode === 'on' ? 'Sonification on' : 'Sonification off');
    }
    handleReviewMode(e) {
        if (e.ctrlKey || e.shiftKey)
            return;
        this.constants.tabMovement = 0;
        e.preventDefault();
        // Review is originally defined in constants.js. Need to confirm how we want to utilize review.
        // review.ToggleReviewMode(this.constants.review_container.classList.contains('hidden')); - Should be included for r key press
    }
    handleSpaceKey() {
        var _a;
        if (this.position.x < 0)
            this.position.x = 0;
        if (this.position.y < 0)
            this.position.y = 0;
        if (this.constants.showDisplay) {
            this.display.displayValues();
        }
        if (this.constants.sonifMode !== 'off') {
            (_a = this.audio) === null || _a === void 0 ? void 0 : _a.playTone(null);
        }
    }
    handleTabKey(e) {
        if (e.shiftKey) {
            this.constants.tabMovement = -1;
        }
        else {
            this.constants.tabMovement = 1;
        }
    }
    handleLayerChange(e) {
        if (!Array.isArray(this.type) || this.constants.brailleMode !== 'off')
            return;
        const types = Array.isArray(this.type) ? this.type : [this.type];
        if (types.includes(_helpers_ChartType__WEBPACK_IMPORTED_MODULE_0__.ChartType.Point) && types.includes(_helpers_ChartType__WEBPACK_IMPORTED_MODULE_0__.ChartType.Smooth)) {
            // Need to integrate changeChartLayer method to display manager before uncommenting this line
            // this.display!.changeChartLayer(e.key === 'PageDown' ? 'down' : 'up');
        }
    }
    setPrefixEvents() {
        document.addEventListener('keydown', this.handlePrefixKeyDown.bind(this));
    }
    handlePrefixKeyDown(e) {
        if (e.key.toLowerCase() === 'l') {
            this.pressedL = true;
            if (this.pressedTimeout !== null) {
                clearTimeout(this.pressedTimeout);
            }
            this.pressedTimeout = setTimeout(() => {
                this.pressedL = false;
            }, this.constants.keypressInterval);
        }
        else if (this.pressedL) {
            this.handlePrefixCommand(e.key.toLowerCase());
        }
    }
    // ctrl/cmd key prefix should be handled in every plot separately. Should handlePrefixCommand be abstract?
    handlePrefixCommand(key) {
        switch (key) {
            case 'x':
                this.displayInfo('x label', this.getXLabel());
                break;
            case 'y':
                this.displayInfo('y label', this.getYLabel());
                break;
            case 't':
                this.displayInfo('title', this.plotData.title);
                break;
            case 's':
                this.displayInfo('subtitle', this.plotData.subtitle);
                break;
            case 'c':
                this.displayInfo('caption', this.plotData.caption);
                break;
            case 'f':
                this.displayInfo('fill', this.plotData.fill);
                break;
        }
        this.pressedL = false;
    }
    displayInfo(type, content) {
        // displayInfo method has not been migrated as of now to DisplayManager
        this.display.displayInfo(type, content);
    }
    // A map can be used to combine x and y values for each plot. Need to discuss whether this change can be implemented.
    getXLabel() {
        if (['bar', 'line'].includes(this.maidr.type)) {
            return this.plotData.plotLegend.x;
        }
        else if (this.maidr.type === 'hist') {
            return this.plotData.legendX;
        }
        else if (['heat', 'box', 'point'].includes(this.maidr.type) || this.maidr.type.includes('point')) {
            return this.plotData.x_group_label;
        }
        else if (['stacked_bar', 'stacked_normalized_bar', 'dodged_bar'].includes(this.maidr.type)) {
            return this.plotData.plotLegend.x;
        }
        return '';
    }
    getYLabel() {
        if (['bar', 'line'].includes(this.maidr.type)) {
            return this.plotData.plotLegend.y;
        }
        else if (this.maidr.type === 'hist') {
            return this.plotData.legendY;
        }
        else if (['heat', 'box', 'point', 'line'].includes(this.maidr.type) || this.maidr.type.includes('point')) {
            return this.plotData.y_group_label;
        }
        else if (['stacked_bar', 'stacked_normalized_bar', 'dodged_bar'].includes(this.maidr.type)) {
            return this.plotData.plotLegend.y;
        }
        return '';
    }
}


/***/ }),

/***/ "./src/display/DisplayManager.ts":
/*!***************************************!*\
  !*** ./src/display/DisplayManager.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   DisplayManager: () => (/* binding */ DisplayManager)
/* harmony export */ });
/* harmony import */ var _helpers_ReactivePosition__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../helpers/ReactivePosition */ "./src/helpers/ReactivePosition.ts");

class DisplayManager {
    constructor() {
        this.constants = window.constants;
        this.infoDiv = this.constants.infoDiv;
        this.x = { id: "x", textBase: "x-value: " };
        this.y = { id: "y", textBase: "y-value: " };
        this.position = new _helpers_ReactivePosition__WEBPACK_IMPORTED_MODULE_0__.ReactivePosition();
    }
    announceText(text) {
        const announcement = document.createElement("p");
        announcement.textContent = text;
        announcement.setAttribute("aria-live", "assertive");
        announcement.setAttribute("role", "alert");
        this.constants.announcementContainer.appendChild(announcement);
        setTimeout(() => {
            this.constants.announcementContainer.removeChild(announcement);
        }, 1000);
    }
    toggleBrailleMode() {
        let constants = window.constants;
        let onOff;
        if (constants.brailleMode == "on") {
            onOff = "off";
        }
        else {
            onOff = "on";
        }
        constants.brailleMode = onOff;
    }
    toggleSonificationMode() {
        let constants = window.constants;
        if (constants.soundMode == "off") {
            constants.soundMode = "on";
            this.announceText(window.resources.GetString("son_on"));
        }
        else {
            constants.soundMode = "off";
            this.announceText(window.resources.GetString("son_off"));
        }
    }
    displayValuesCommon(output, verboseText, terseText) {
        let constants = window.constants;
        if (constants.textMode == "verbose") {
            output = verboseText;
        }
        else if (constants.textMode == "terse") {
            output = terseText;
        }
        constants.verboseText = verboseText;
        if (constants.infoDiv)
            constants.infoDiv.innerHTML = output;
        // if (constants.review) {
        //   if (output.length > 0) {
        //     constants.review.value = output.replace(/<[^>]*>?/gm, "");
        //   } else {
        //     constants.review.value = verboseText;
        //   }
        // }
    }
    displayBraille(brailleArray) {
        if (this.constants.brailleInput) {
            this.constants.brailleInput.value = brailleArray.join("");
            if (this.constants.debugLevel > 5) {
                console.log("braille:", this.constants.brailleInput.value);
            }
        }
    }
    toggleTextMode() {
        if (this.constants.textMode == "off") {
            this.constants.textMode = "terse";
        }
        else if (this.constants.textMode == "terse") {
            this.constants.textMode = "verbose";
        }
        else if (this.constants.textMode == "verbose") {
            this.constants.textMode = "off";
        }
        this.announceText('<span aria-hidden="true">Text mode:</span> ' + this.constants.textMode);
    }
    displayInfo(textType, textValue) {
        let textToAdd = '';
        var elem = this.constants.infoDiv;
        if (textType == 'announce') {
            if (textValue) {
                textToAdd = textValue;
            }
        }
        else if (textType) {
            if (textValue) {
                if (this.constants.textMode == 'terse') {
                    textToAdd = textValue;
                }
                else if (this.constants.textMode == 'verbose') {
                    let capsTextType = textType.charAt(0).toUpperCase() + textType.slice(1);
                    textToAdd = capsTextType + ' is ' + textValue;
                }
            }
            else {
                let aOrAn = ['a', 'e', 'i', 'o', 'u'].includes(textType.charAt(0))
                    ? 'an'
                    : 'a';
                textToAdd = 'Plot does not have ' + aOrAn + ' ' + textType;
            }
        }
        if (textToAdd.length > 0 && elem) {
            elem.innerHTML = '';
            let p = document.createElement('p');
            p.innerHTML = textToAdd;
            elem === null || elem === void 0 ? void 0 : elem.appendChild(p);
        }
    }
}


/***/ }),

/***/ "./src/helpers/ChartType.ts":
/*!**********************************!*\
  !*** ./src/helpers/ChartType.ts ***!
  \**********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ChartType: () => (/* binding */ ChartType),
/* harmony export */   convertToChartType: () => (/* binding */ convertToChartType)
/* harmony export */ });
var ChartType;
(function (ChartType) {
    ChartType["Bar"] = "bar";
    ChartType["Hist"] = "hist";
    ChartType["Heat"] = "heat";
    ChartType["Line"] = "line";
    ChartType["Box"] = "box";
    ChartType["Scatter"] = "scatter";
    ChartType["StackedBar"] = "stacked_bar";
    ChartType["StackedNormalizedBar"] = "stacked_normalized_bar";
    ChartType["DodgedBar"] = "dodged_bar";
    ChartType["Point"] = "point";
    ChartType["Smooth"] = "smooth";
})(ChartType || (ChartType = {}));
function convertToChartType(type) {
    switch (type) {
        case "bar":
            return ChartType.Bar;
        case "hist":
            return ChartType.Hist;
        case "heat":
            return ChartType.Heat;
        case "line":
            return ChartType.Line;
        case "box":
            return ChartType.Box;
        case "scatter":
            return ChartType.Scatter;
        case "stacked_bar":
            return ChartType.StackedBar;
        case "stacked_normalized_bar":
            return ChartType.StackedNormalizedBar;
        case "dodged_bar":
            return ChartType.DodgedBar;
        case "point":
            return ChartType.Point;
        case "smooth":
            return ChartType.Smooth;
        default:
            return undefined;
    }
}


/***/ }),

/***/ "./src/helpers/Point.ts":
/*!******************************!*\
  !*** ./src/helpers/Point.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Point: () => (/* binding */ Point)
/* harmony export */ });
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class Point {
    /**
     * Creates a new instance of Point.
     * @constructor
     */
    constructor(plot, x, y) {
        this.x = x.toString();
        this.y = y.toString();
        this.constants = window.constants;
        this.plot = plot;
    }
    /**
     * Clears the existing points and updates the x and y coordinates for the chart line.
     * @async
     * @returns {Promise<void>}
     */
    updatePoints() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.clearPoints();
            this.x = this.plot.chartLineX[this.plot.position.x];
            this.y = this.plot.chartLineY[this.plot.position.x];
        });
    }
    /**
     * Clears existing points, updates the points, and prints a new point on the chart.
     * @async
     * @returns {Promise<void>}
     */
    printPoints() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            yield this.clearPoints();
            yield this.updatePoints();
            const svgns = 'http://www.w3.org/2000/svg';
            var point = document.createElementNS(svgns, 'circle');
            point.setAttribute('id', 'highlight_point');
            point.setAttribute('cx', this.x);
            point.setAttribute('cy', this.y);
            point.setAttribute('r', "1.75");
            point.setAttribute('style', 'fill:' + this.constants.colorSelected + ';stroke:' + this.constants.colorSelected);
            (_a = this.constants.chart) === null || _a === void 0 ? void 0 : _a.appendChild(point);
        });
    }
    /**
     * Removes all highlighted points from the line plot.
     * @async
     */
    clearPoints() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let points = document.getElementsByClassName('highlight_point');
            for (let i = 0; i < points.length; i++) {
                document.getElementsByClassName('highlight_point')[i].remove();
            }
            if (document.getElementById('highlight_point'))
                (_a = document.getElementById('highlight_point')) === null || _a === void 0 ? void 0 : _a.remove();
        });
    }
    /**
     * Clears the points, updates them, and prints them to the display.
     */
    updatePointDisplay() {
        this.clearPoints();
        this.updatePoints();
        this.printPoints();
    }
}


/***/ }),

/***/ "./src/helpers/Position.ts":
/*!*********************************!*\
  !*** ./src/helpers/Position.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Position: () => (/* binding */ Position)
/* harmony export */ });
/**
 * Represents a position in 3D space.
 * @class
 */
class Position {
    constructor(x = 0, y = 0, z = -1) {
        this.x = x;
        this.y = y;
        this.z = z; // rarely used
    }
}


/***/ }),

/***/ "./src/helpers/ReactivePosition.ts":
/*!*****************************************!*\
  !*** ./src/helpers/ReactivePosition.ts ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ReactivePosition: () => (/* binding */ ReactivePosition)
/* harmony export */ });
/* harmony import */ var _Position__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Position */ "./src/helpers/Position.ts");

class ReactivePosition extends _Position__WEBPACK_IMPORTED_MODULE_0__.Position {
    constructor(x = 0, y = 0, z = -1) {
        super(x, y, z);
        this.subscribers = [];
    }
    set(x, y, z = this.z) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.notifySubscribers();
    }
    setX(x) {
        this.x = x;
        this.notifySubscribers();
    }
    setY(y) {
        this.y = y;
        this.notifySubscribers();
    }
    setZ(z) {
        this.z = z;
        this.notifySubscribers();
    }
    subscribe(callback) {
        this.subscribers.push(callback);
    }
    notifySubscribers() {
        this.subscribers.forEach((callback) => callback(this.x, this.y, this.z));
    }
}


/***/ }),

/***/ "./src/helpers/utils.ts":
/*!******************************!*\
  !*** ./src/helpers/utils.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   slideBetween: () => (/* binding */ slideBetween)
/* harmony export */ });
function slideBetween(val, a, b, min, max) {
    val = Number(val);
    a = Number(a);
    b = Number(b);
    min = Number(min);
    max = Number(max);
    let newVal = ((val - a) / (b - a)) * (max - min) + min;
    if (a === 0 && b === 0) {
        newVal = 0;
    }
    return newVal;
}


/***/ }),

/***/ "./src/plots/Plot.ts":
/*!***************************!*\
  !*** ./src/plots/Plot.ts ***!
  \***************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Plot: () => (/* binding */ Plot)
/* harmony export */ });
class Plot {
}


/***/ }),

/***/ "./src/plots/PlotFactory.ts":
/*!**********************************!*\
  !*** ./src/plots/PlotFactory.ts ***!
  \**********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PlotFactory: () => (/* binding */ PlotFactory)
/* harmony export */ });
/* harmony import */ var _helpers_ChartType__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../helpers/ChartType */ "./src/helpers/ChartType.ts");
/* harmony import */ var _bar_BarPlot__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./bar/BarPlot */ "./src/plots/bar/BarPlot.ts");
/* harmony import */ var _line_LinePlot__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./line/LinePlot */ "./src/plots/line/LinePlot.ts");



class PlotFactory {
    static createPlot(chartType, maidr) {
        switch (chartType) {
            case _helpers_ChartType__WEBPACK_IMPORTED_MODULE_0__.ChartType.Bar:
                return new _bar_BarPlot__WEBPACK_IMPORTED_MODULE_1__.BarPlot(maidr);
            case _helpers_ChartType__WEBPACK_IMPORTED_MODULE_0__.ChartType.Line:
                return new _line_LinePlot__WEBPACK_IMPORTED_MODULE_2__.LinePlot(maidr);
            default:
                throw new Error(`Unsupported chart type: ${chartType}`);
        }
    }
}


/***/ }),

/***/ "./src/plots/bar/BarAudio.ts":
/*!***********************************!*\
  !*** ./src/plots/bar/BarAudio.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   BarAudio: () => (/* binding */ BarAudio)
/* harmony export */ });
/* harmony import */ var _audio_AudioManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../audio/AudioManager */ "./src/audio/AudioManager.ts");
/* harmony import */ var _helpers_utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../helpers/utils */ "./src/helpers/utils.ts");


class BarAudio extends _audio_AudioManager__WEBPACK_IMPORTED_MODULE_0__.AudioManager {
    constructor(plot, position) {
        super();
        this.plot = plot;
        this.position = position;
        this.position.subscribe(this.onPositionChange.bind(this));
    }
    onPositionChange(x, y, z) {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
    }
    playTone(params) {
        let currentDuration = this.constants.duration;
        let volume = this.constants.vol;
        if (params === null || params === void 0 ? void 0 : params.volScale) {
            volume *= params.volScale;
        }
        const rawFreq = this.plot.plotData[this.position.x];
        const rawPanning = this.position.x;
        console.log("Playing tone", this.plot.minY, this.plot.maxY, this.plot.minX, this.plot.maxX);
        const frequency = (0,_helpers_utils__WEBPACK_IMPORTED_MODULE_1__.slideBetween)(rawFreq, this.plot.minY, this.plot.maxY, this.constants.MIN_FREQUENCY, this.constants.MAX_FREQUENCY);
        const panning = (0,_helpers_utils__WEBPACK_IMPORTED_MODULE_1__.slideBetween)(rawPanning, this.plot.minX, this.plot.maxX, -1, 1);
        this.playOscillator(frequency, currentDuration, panning, volume, "sine");
    }
}


/***/ }),

/***/ "./src/plots/bar/BarControl.ts":
/*!*************************************!*\
  !*** ./src/plots/bar/BarControl.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   BarControl: () => (/* binding */ BarControl)
/* harmony export */ });
/* harmony import */ var _control_ControlManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../control/ControlManager */ "./src/control/ControlManager.ts");
/* harmony import */ var _helpers_ChartType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../helpers/ChartType */ "./src/helpers/ChartType.ts");


/**
 * Note that this class is not completely refactored this is just
 * copy pasted from previous JS implementation with some typescript
 */
class BarControl extends _control_ControlManager__WEBPACK_IMPORTED_MODULE_0__.ControlManager {
    constructor(plot, position, audio, display) {
        super(_helpers_ChartType__WEBPACK_IMPORTED_MODULE_1__.ChartType.Bar);
        this.lastPlayed = '';
        this.autoplayId = null;
        this.plot = plot;
        this.position = position;
        this.position.subscribe(this.onPositionChange.bind(this));
        this.audio = audio;
        this.display = display;
    }
    onPositionChange(x, y, z) {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
    }
    additionalSetControls() {
        this.controlElements.forEach(element => {
            element === null || element === void 0 ? void 0 : element.addEventListener('keydown', this.handleKeyDown.bind(this));
        });
        document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
    }
    // The following methods are event listeners specific to bar plot. The key handling and speed change handling have been separated into their own methods for modularity.
    // if-else conditional blocks have been replaced with switch-break wherever possible to promote easy logic.
    handleKeyDown(e) {
        super.handleKeyDown(e);
        if (this.pressedL || ['b', 't', 's', 'r', ' ', 'tab', 'pagedown', 'pageup'].includes(e.key.toLowerCase())) {
            return;
        }
        const isCommandKey = this.constants.isMac ? e.metaKey : e.ctrlKey;
        const isShiftKey = e.shiftKey;
        const isAltKey = e.altKey;
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowLeft':
                e.preventDefault();
                this.handleArrowKey(e.key, isCommandKey, isShiftKey, isAltKey);
                break;
            case '.':
            case ',':
            case '/':
                e.preventDefault();
                this.handleSpeedChange(e.key);
                break;
            default:
                return;
        }
    }
    handleArrowKey(key, isCommandKey, isShiftKey, isAltKey) {
        const direction = key === 'ArrowRight' ? 1 : -1;
        const endPosition = direction > 0 ? this.plot.plotData.length - 1 : 0;
        let updateInfo = false;
        let isAtEnd = false;
        if (isCommandKey) {
            if (isShiftKey) {
                this.position.setX(this.position.x - direction);
                this.autoplay(key === 'ArrowRight' ? 'right' : 'left', this.position.x, direction > 0 ? this.plot.plotData.length : -1);
            }
            else {
                this.position.setX(endPosition);
                updateInfo = true;
                isAtEnd = this.lockPosition();
            }
        }
        else if (isAltKey && isShiftKey && this.position.x !== endPosition) {
            this.constants.lastx = this.position.x;
            this.autoplay(`reverse-${key === 'ArrowRight' ? 'right' : 'left'}`, endPosition, this.position.x);
        }
        else {
            console.log('position.x | else', this.position.x);
            this.position.setX(this.position.x + direction);
            updateInfo = true;
            isAtEnd = this.lockPosition();
        }
        if (updateInfo && !isAtEnd) {
            this.updateAll();
        }
        if (isAtEnd) {
            this.audio.playEnd();
        }
    }
    handleSpeedChange(key) {
        switch (key) {
            case '.':
                this.constants.SpeedUp();
                this.display.announceText('Speed up');
                break;
            case ',':
                this.constants.SpeedDown();
                this.display.announceText('Speed down');
                break;
            case '/':
                this.constants.SpeedReset();
                this.display.announceText('Speed reset');
                break;
        }
        this.playDuringSpeedChange();
    }
    handleSelectionChange(e) {
        var _a, _b;
        if (this.constants.brailleMode === 'on') {
            let pos = (_b = (_a = this.constants.brailleInput) === null || _a === void 0 ? void 0 : _a.selectionStart) !== null && _b !== void 0 ? _b : 0;
            if (pos < 0) {
                pos = 0;
            }
            this.position.setX(pos);
            this.lockPosition();
            this.updateAll();
        }
    }
    // Updated lockPosition() to utilize Math.max and Math.min to clamp the position value within the valid range. 
    // It stores the original position and compares it at the end to determine if a lock happened
    lockPosition() {
        const minPosition = 0;
        const maxPosition = this.plot.plotData.length - 1;
        const originalPosition = this.position.x;
        this.position.x = Math.max(minPosition, Math.min(maxPosition, this.position.x));
        if (this.constants.brailleMode !== 'off') {
            this.constants.brailleInput.selectionEnd = this.position.x;
        }
        return originalPosition !== this.position.x;
    }
    //Already in most optimized form in maidr-js and hence adapted the same implementation to maidr-ts.
    updateAll() {
        if (this.constants.showDisplay) {
            this.display.displayValues();
        }
        if (this.constants.showRect && this.constants.hasRect) {
            this.display.selectActiveElement();
        }
        if (this.constants.sonifMode !== 'off') {
            this.audio.playTone(null);
        }
    }
    // Destructured this, constants, and frequently used methods at the beginning to reduce property lookups.
    autoplay(dir, start, end) {
        var _a, _b;
        const { constants, position } = this;
        const { KillAutoplay } = constants;
        const autoPlayRate = this.plot.autoPlayRate;
        const step = (dir === 'left' || dir === 'reverse-right') ? -1 : 1;
        this.lastPlayed = dir;
        if (constants.autoplayId != null) {
            KillAutoplay(this.autoplayId);
        }
        if (dir.startsWith('reverse-')) {
            position.x = start;
        }
        const plotDataLength = (_b = (_a = this.plot.plotData) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
        this.autoplayId = setInterval(() => {
            position.x += step;
            if (!(this === null || this === void 0 ? void 0 : this.plot.plotData) || position.x < 0 || position.x > plotDataLength - 1) {
                KillAutoplay(this.autoplayId);
                this.lockPosition();
                return;
            }
            if (position.x === end) {
                KillAutoplay(this.autoplayId);
            }
            this.updateAll();
        }, autoPlayRate);
    }
    // Replaced if-else with ternary for better readabalility.
    playDuringSpeedChange() {
        if (this.constants.autoplayId == null)
            return;
        this.constants.KillAutoplay(this.autoplayId);
        const direction = this.lastPlayed.startsWith('reverse-')
            ? this.lastPlayed.replace('reverse-', '') === 'left' ? 'right' : 'left'
            : this.lastPlayed;
        this.autoplay(direction, this.position.x, this.constants.lastx);
    }
}


/***/ }),

/***/ "./src/plots/bar/BarDisplay.ts":
/*!*************************************!*\
  !*** ./src/plots/bar/BarDisplay.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ BarDisplay)
/* harmony export */ });
/* harmony import */ var _display_DisplayManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../display/DisplayManager */ "./src/display/DisplayManager.ts");

class BarDisplay extends _display_DisplayManager__WEBPACK_IMPORTED_MODULE_0__.DisplayManager {
    constructor(plot, position) {
        super();
        this.activeElement = null;
        this.activeElementColor = null;
        this.position = position;
        this.plot = plot;
        this.position.subscribe(this.onPositionChange.bind(this));
        this.initializeActiveElementHighlight();
    }
    initializeActiveElementHighlight() {
        let xlevel = [];
        if ("axes" in this.plot.maidr) {
            if (this.plot.maidr.axes.x && this.plot.maidr.axes.x.level) {
                xlevel = this.plot.maidr.axes.x.level;
            }
        }
        let data = null;
        if ("data" in this.plot.maidr) {
            data = this.plot.maidr.data;
        }
        let elements = null;
        if ("selector" in this.plot.maidr) {
            elements = document.querySelectorAll(this.plot.maidr.selector);
        }
        if (xlevel && data && elements) {
            if (elements.length !== data.length) {
                console.log("elements", elements, "data", data);
                window.constants.hasRect = 0;
                window.logError.LogDifferentLengths("elements", "data");
            }
            else if (xlevel.length !== elements.length) {
                window.constants.hasRect = 0;
                window.logError.LogDifferentLengths("x level", "elements");
            }
            else if (data.length !== xlevel.length) {
                window.constants.hasRect = 0;
                window.logError.LogDifferentLengths("x level", "data");
            }
            else {
                this.plot.bars = Array.from(elements);
                window.constants.hasRect = 1;
            }
        }
        else if (data && elements) {
            if (data.length !== elements.length) {
                window.constants.hasRect = 0;
                window.logError.LogDifferentLengths("data", "elements");
            }
            else {
                this.plot.bars = Array.from(elements);
                window.constants.hasRect = 1;
            }
        }
        else if (xlevel && data) {
            if (xlevel.length !== data.length) {
                window.constants.hasRect = 0;
                window.logError.LogDifferentLengths("x level", "data");
            }
            window.logError.LogAbsentElement("elements");
        }
        else if (data) {
            window.logError.LogAbsentElement("x level");
            window.logError.LogAbsentElement("elements");
        }
        this.plot.columnLabels = [];
        let legendX = "";
        let legendY = "";
        if ("axes" in this.plot.maidr) {
            if (this.plot.maidr.axes.x && this.plot.maidr.axes.x.label && legendX === "") {
                legendX = this.plot.maidr.axes.x.label;
            }
            if (this.plot.maidr.axes.y && this.plot.maidr.axes.y.label && legendY === "") {
                legendY = this.plot.maidr.axes.y.label;
            }
            if (this.plot.maidr.axes.x && this.plot.maidr.axes.x.level) {
                this.plot.columnLabels = this.plot.maidr.axes.x.level;
            }
        }
        this.plot.title = "";
        if (this.plot.title === "" && "title" in this.plot.maidr) {
            this.plot.title = this.plot.maidr.title;
        }
    }
    deselectPrevious() {
        if (this.activeElement) {
            if (this.activeElement.hasAttribute("fill")) {
                this.activeElement.setAttribute("fill", this.activeElementColor);
                this.activeElement = null;
            }
            else if (this.activeElement.hasAttribute("style") &&
                this.activeElement.getAttribute("style").indexOf("fill") !== -1) {
                const styleString = this.activeElement.getAttribute("style");
                const styleArray = window.constants.GetStyleArrayFromString(styleString);
                styleArray[styleArray.indexOf("fill") + 1] = this.activeElementColor;
                this.activeElement.setAttribute("style", window.constants.GetStyleStringFromArray(styleArray));
                this.activeElement = null;
            }
        }
    }
    selectActiveElement() {
        if (this.constants.showRect && this.constants.hasRect) {
            this.deselectPrevious();
            if (this.plot.bars) {
                this.activeElement = this.plot.bars[this.position.x];
                if (this.activeElement) {
                    if (this.activeElement.hasAttribute("fill")) {
                        this.activeElementColor = this.activeElement.getAttribute("fill");
                        this.activeElement.setAttribute("fill", window.constants.GetBetterColor(this.activeElementColor));
                    }
                    else if (this.activeElement.hasAttribute("style") &&
                        this.activeElement.getAttribute("style").indexOf("fill") !== -1) {
                        const styleString = this.activeElement.getAttribute("style");
                        const styleArray = window.constants.GetStyleArrayFromString(styleString);
                        this.activeElementColor = styleArray[styleArray.indexOf("fill") + 1];
                        styleArray[styleArray.indexOf("fill") + 1] =
                            window.constants.GetBetterColor(this.activeElementColor);
                        this.activeElement.setAttribute("style", window.constants.GetStyleStringFromArray(styleArray));
                    }
                }
            }
        }
    }
    onPositionChange(x, y, z) {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
    }
    displayValues() {
        this.displayValuesCommon("", "", "");
    }
    toggleBrailleMode() {
        super.toggleBrailleMode();
    }
    setBraille(plotData) {
        let brailleArray = [];
        let range = (this.constants.maxY - this.constants.minY) / 4;
        let low = this.constants.minY + range;
        let medium = low + range;
        let medium_high = medium + range;
        for (let i = 0; i < plotData.length; i++) {
            if (plotData[i] <= low) {
                brailleArray.push("⣀");
            }
            else if (plotData[i] <= medium) {
                brailleArray.push("⠤");
            }
            else if (plotData[i] <= medium_high) {
                brailleArray.push("⠒");
            }
            else {
                brailleArray.push("⠉");
            }
        }
        this.displayBraille(brailleArray);
    }
    updateBraillePos() {
        var _a;
        (_a = this.constants.brailleInput) === null || _a === void 0 ? void 0 : _a.setSelectionRange(this.position.x, this.position.x);
    }
}


/***/ }),

/***/ "./src/plots/bar/BarPlot.ts":
/*!**********************************!*\
  !*** ./src/plots/bar/BarPlot.ts ***!
  \**********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   BarPlot: () => (/* binding */ BarPlot)
/* harmony export */ });
/* harmony import */ var _BarAudio__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./BarAudio */ "./src/plots/bar/BarAudio.ts");
/* harmony import */ var _BarDisplay__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./BarDisplay */ "./src/plots/bar/BarDisplay.ts");
/* harmony import */ var _Plot__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../Plot */ "./src/plots/Plot.ts");
/* harmony import */ var _helpers_ReactivePosition__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../helpers/ReactivePosition */ "./src/helpers/ReactivePosition.ts");
/* harmony import */ var _BarControl__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./BarControl */ "./src/plots/bar/BarControl.ts");





class BarPlot extends _Plot__WEBPACK_IMPORTED_MODULE_2__.Plot {
    constructor(maidr) {
        super();
        /* Plot Data and related variables */
        this.maxY = 0;
        this.maxX = 0;
        this.minY = 0;
        this.minX = 0;
        this.autoPlayRate = 0;
        /* Previous Plot Related things
         * Have to check if any of these are needed and refactor
         * the constructor accordingly
         */
        this.plotLegend = null;
        this.columnLabels = [];
        this.title = "";
        this.bars = [];
        this.activeElement = null;
        this.activeElementColor = null;
        this.maidr = maidr;
        this.plotData = maidr.data;
        this.position = new _helpers_ReactivePosition__WEBPACK_IMPORTED_MODULE_3__.ReactivePosition(-1, -1);
        this.audio = new _BarAudio__WEBPACK_IMPORTED_MODULE_0__.BarAudio(this, this.position);
        this.display = new _BarDisplay__WEBPACK_IMPORTED_MODULE_1__["default"](this, this.position);
        this.control = new _BarControl__WEBPACK_IMPORTED_MODULE_4__.BarControl(this, this.position, this.audio, this.display);
        this.SetMaxMin();
        /* Previous Constructor Code ENDS Here */
    }
    /* Previous Functions STARTS Here */
    SetMaxMin() {
        for (let i = 0; i < this.plotData.length; i++) {
            if (i === 0) {
                this.maxY = this.plotData[i];
                this.minY = this.plotData[i];
            }
            else {
                if (this.plotData[i] > this.maxY) {
                    this.maxY = this.plotData[i];
                }
                if (this.plotData[i] < this.minY) {
                    this.minY = this.plotData[i];
                }
            }
        }
        this.maxX = this.columnLabels.length;
        this.autoPlayRate = Math.min(Math.ceil(window.constants.AUTOPLAY_DURATION / (this.maxX + 1)), window.constants.MAX_SPEED);
        if (this.autoPlayRate < window.constants.MIN_SPEED) {
            window.constants.MIN_SPEED = this.autoPlayRate;
        }
    }
    GetData() {
        const plotData = [];
        if (this.bars) {
            for (const bar of this.bars) {
                plotData.push(bar.getAttribute("height"));
            }
        }
        return plotData;
    }
    GetLegend() {
        const legend = { x: "", y: "" };
        const els = window.constants.chart.querySelectorAll('tspan[dy="12"]');
        legend.x = els[1].innerHTML;
        legend.y = els[0].innerHTML;
        return legend;
    }
    Select() {
        this.deselectPrevious();
        if (this.bars) {
            this.activeElement = this.bars[this.position.x];
            if (this.activeElement) {
                if (this.activeElement.hasAttribute("fill")) {
                    this.activeElementColor = this.activeElement.getAttribute("fill");
                    this.activeElement.setAttribute("fill", window.constants.GetBetterColor(this.activeElementColor));
                }
                else if (this.activeElement.hasAttribute("style") &&
                    this.activeElement.getAttribute("style").indexOf("fill") !== -1) {
                    const styleString = this.activeElement.getAttribute("style");
                    const styleArray = window.constants.GetStyleArrayFromString(styleString);
                    this.activeElementColor = styleArray[styleArray.indexOf("fill") + 1];
                    styleArray[styleArray.indexOf("fill") + 1] =
                        window.constants.GetBetterColor(this.activeElementColor);
                    this.activeElement.setAttribute("style", window.constants.GetStyleStringFromArray(styleArray));
                }
            }
        }
    }
    deselectPrevious() {
        if (this.activeElement) {
            if (this.activeElement.hasAttribute("fill")) {
                this.activeElement.setAttribute("fill", this.activeElementColor);
                this.activeElement = null;
            }
            else if (this.activeElement.hasAttribute("style") &&
                this.activeElement.getAttribute("style").indexOf("fill") !== -1) {
                const styleString = this.activeElement.getAttribute("style");
                const styleArray = window.constants.GetStyleArrayFromString(styleString);
                styleArray[styleArray.indexOf("fill") + 1] = this.activeElementColor;
                this.activeElement.setAttribute("style", window.constants.GetStyleStringFromArray(styleArray));
                this.activeElement = null;
            }
        }
    }
    /* Previous Functions ENDS Here */
    /* New Functions STARTS Here */
    playTones() {
        // this.audio.playTone(null, this.plotData);
    }
}


/***/ }),

/***/ "./src/plots/line/LineAudio.ts":
/*!*************************************!*\
  !*** ./src/plots/line/LineAudio.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   LineAudio: () => (/* binding */ LineAudio)
/* harmony export */ });
/* harmony import */ var _audio_AudioManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../audio/AudioManager */ "./src/audio/AudioManager.ts");
/* harmony import */ var _helpers_utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../helpers/utils */ "./src/helpers/utils.ts");


class LineAudio extends _audio_AudioManager__WEBPACK_IMPORTED_MODULE_0__.AudioManager {
    constructor(plot, position) {
        super();
        this.plot = plot;
        this.position = position;
        this.position.subscribe(this.onPositionChange.bind(this));
    }
    onPositionChange(x, y, z) {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
    }
    playTone(params) {
        let currentDuration = this.constants.duration;
        let volume = this.constants.vol;
        if (params === null || params === void 0 ? void 0 : params.volScale) {
            volume *= params.volScale;
        }
        const rawFreq = this.plot.pointValuesY[this.position.x];
        const rawPanning = this.position.x;
        const frequency = (0,_helpers_utils__WEBPACK_IMPORTED_MODULE_1__.slideBetween)(rawFreq, this.plot.minY, this.plot.maxY, this.constants.MIN_FREQUENCY, this.constants.MAX_FREQUENCY);
        const panning = (0,_helpers_utils__WEBPACK_IMPORTED_MODULE_1__.slideBetween)(rawPanning, this.plot.minX, this.plot.maxX, -1, 1);
        this.playOscillator(frequency, currentDuration, panning, volume, "sine");
    }
}


/***/ }),

/***/ "./src/plots/line/LineControl.ts":
/*!***************************************!*\
  !*** ./src/plots/line/LineControl.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   LineControl: () => (/* binding */ LineControl)
/* harmony export */ });
/* harmony import */ var _control_ControlManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../control/ControlManager */ "./src/control/ControlManager.ts");
/* harmony import */ var _helpers_ChartType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../helpers/ChartType */ "./src/helpers/ChartType.ts");
/* harmony import */ var _helpers_Point__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../helpers/Point */ "./src/helpers/Point.ts");



class LineControl extends _control_ControlManager__WEBPACK_IMPORTED_MODULE_0__.ControlManager {
    constructor(plot, position, audio, display) {
        super(_helpers_ChartType__WEBPACK_IMPORTED_MODULE_1__.ChartType.Line);
        this.autoplayId = null;
        this.lastPlayed = "";
        this.plot = plot;
        this.position = position;
        this.position.subscribe(this.onPositionChange.bind(this));
        this.audio = audio;
        this.display = display;
        this.point = new _helpers_Point__WEBPACK_IMPORTED_MODULE_2__.Point(this.plot, this.position.x, this.position.y);
    }
    onPositionChange(x, y, z) {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
    }
    additionalSetControls() {
        this.controlElements.forEach((element) => {
            element === null || element === void 0 ? void 0 : element.addEventListener("keydown", this.handleKeyDown.bind(this));
        });
        document.addEventListener("selectionchange", this.handleSelectionChange.bind(this));
    }
    handleSelectionChange(e) {
        var _a, _b, _c;
        if (this.constants.brailleMode == "on") {
            let pos = (_a = this.constants.brailleInput) === null || _a === void 0 ? void 0 : _a.selectionStart;
            // we're using braille cursor, update the selection from what was clicked
            pos = (_c = (_b = this.constants.brailleInput) === null || _b === void 0 ? void 0 : _b.selectionStart) !== null && _c !== void 0 ? _c : 0;
            if (pos < 0) {
                pos = 0;
            }
            this.position.setX(pos);
            this.lockPosition();
            let testEnd = true;
            // update display / text / audio
            if (testEnd) {
                this.updateAll();
            }
            if (testEnd) {
                this.audio.playEnd();
            }
        }
    }
    handleKeyDown(e) {
        super.handleKeyDown(e);
        if (this.pressedL ||
            ["b", "t", "s", "r", " ", "tab", "pagedown", "pageup"].includes(e.key.toLowerCase())) {
            return;
        }
        const isCommandKey = this.constants.isMac ? e.metaKey : e.ctrlKey;
        const isShiftKey = e.shiftKey;
        const isAltKey = e.altKey;
        switch (e.key) {
            case "ArrowRight":
            case "ArrowLeft":
                e.preventDefault();
                this.handleArrowKey(e.key, isCommandKey, isShiftKey, isAltKey);
                break;
            case ".":
            case ",":
            case "/":
                e.preventDefault();
                this.handleSpeedChange(e.key);
                break;
            default:
                return;
        }
    }
    handleSpeedChange(key) {
        switch (key) {
            case ".":
                this.constants.SpeedUp();
                this.display.announceText("Speed up");
                break;
            case ",":
                this.constants.SpeedDown();
                this.display.announceText("Speed down");
                break;
            case "/":
                this.constants.SpeedReset();
                this.display.announceText("Speed reset");
                break;
        }
        this.playDuringSpeedChange();
    }
    playDuringSpeedChange() {
        if (this.constants.autoplayId == null)
            return;
        this.constants.KillAutoplay(this.autoplayId);
        const direction = this.lastPlayed.startsWith("reverse-")
            ? this.lastPlayed.replace("reverse-", "") === "left"
                ? "right"
                : "left"
            : this.lastPlayed;
        this.autoplay(direction, this.position.x, this.constants.lastx);
    }
    handleArrowKey(key, isCommandKey, isShiftKey, isAltKey) {
        const direction = key === 'ArrowRight' ? 1 : -1;
        let updateInfoThisRound = false;
        let isAtEnd = false;
        if (isCommandKey) {
            if (isShiftKey) {
                this.position.setX(this.position.x - direction);
                this.autoplay("right", this.position.x, this.plot.pointValuesY.length);
            }
            else {
                this.position.setX(this.plot.pointValuesY.length - 1); // go all the way
                updateInfoThisRound = true;
                isAtEnd = this.lockPosition();
            }
        }
        else if (isAltKey &&
            isShiftKey &&
            this.position.x != this.plot.pointValuesY.length - 1) {
            this.constants.lastx = this.position.x;
            this.autoplay("reverse-right", this.plot.pointValuesY.length, this.position.x);
        }
        else {
            this.position.setX(this.position.x + direction);
            updateInfoThisRound = true;
            isAtEnd = this.lockPosition();
        }
        if (updateInfoThisRound && !isAtEnd) {
            this.updateAll();
        }
        if (isAtEnd) {
            this.audio.playEnd();
        }
    }
    autoplay(dir, start, end) {
        let step = 1; // default right and reverse-left
        if (dir == "left" || dir == "reverse-right") {
            step = -1;
        }
        // clear old autoplay if exists
        if (this.autoplayId != null) {
            this.constants.KillAutoplay(this.autoplayId);
        }
        if (dir == "reverse-right" || dir == "reverse-left") {
            this.position.setX(start);
        }
        this.autoplayId = setInterval(() => {
            this.position.setX(this.position.x + step);
            if (this.position.x < 0 ||
                this.plot.pointValuesY.length - 1 < this.position.x) {
                this.constants.KillAutoplay(this.autoplayId);
                this.lockPosition();
            }
            else if (this.position.x == end) {
                this.constants.KillAutoplay(this.autoplayId);
                this.updateAllAutoplay();
            }
            else {
                this.updateAllAutoplay();
            }
        }, this.plot.autoPlayRate);
    }
    lockPosition() {
        // lock to min / max postions
        let didLockHappen = false;
        // if (!constants.hasRect) {
        //   return didLockHappen;
        // }
        if (this.position.x < 0) {
            this.position.setX(0);
            didLockHappen = true;
        }
        if (this.position.x > this.plot.pointValuesY.length - 1) {
            this.position.setX(this.plot.pointValuesY.length - 1);
            didLockHappen = true;
        }
        return didLockHappen;
    }
    updateAll() {
        if (this.constants.showDisplay) {
            this.display.displayValues();
        }
        if (this.constants.showRect && this.constants.hasRect) {
            this.point.updatePointDisplay();
        }
        if (this.constants.sonifMode != "off") {
            this.plot.playTones();
        }
    }
    updateAllAutoplay() {
        if (this.constants.showDisplayInAutoplay) {
            this.display.displayValues();
        }
        if (this.constants.showRect) {
            this.point.updatePointDisplay();
        }
        if (this.constants.sonifMode != "off") {
            this.plot.playTones();
        }
        if (this.constants.brailleMode != "off") {
            this.display.updateBraillePos();
        }
    }
    updateAllBraille() {
        if (this.constants.showDisplayInBraille) {
            this.display.displayValues();
        }
        if (this.constants.showRect) {
            this.point.updatePointDisplay();
        }
        if (this.constants.sonifMode != "off") {
            this.plot.playTones();
        }
        this.display.updateBraillePos();
    }
}


/***/ }),

/***/ "./src/plots/line/LineDisplay.ts":
/*!***************************************!*\
  !*** ./src/plots/line/LineDisplay.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   LineDisplay: () => (/* binding */ LineDisplay)
/* harmony export */ });
/* harmony import */ var _display_DisplayManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../display/DisplayManager */ "./src/display/DisplayManager.ts");

class LineDisplay extends _display_DisplayManager__WEBPACK_IMPORTED_MODULE_0__.DisplayManager {
    constructor(plot, position) {
        super();
        this.plot = plot;
        this.position = position;
        this.position.subscribe(this.onPositionChange.bind(this));
    }
    onPositionChange(x, y, z) {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
    }
    displayValues() {
        let verboseText = '';
        let terseText = '';
        if (this.plot.plotLegend) {
            verboseText += this.plot.plotLegend.x + ' is ';
        }
        verboseText += this.plot.pointValuesX[this.position.x] + ', ';
        if (this.plot.plotLegend) {
            this.plot.plotLegend.y + ' is ';
        }
        verboseText += this.plot.pointValuesY[this.position.x];
        // terse
        terseText +=
            '<p>' +
                this.plot.pointValuesX[this.position.x] +
                ', ' +
                this.plot.pointValuesY[this.position.x] +
                '</p>\n';
        verboseText = '<p>' + verboseText + '</p>\n';
        this.displayValuesCommon("", verboseText, terseText);
    }
    setBraille(...args) {
        throw new Error("Method not implemented.");
    }
    updateBraillePos() {
        throw new Error("Method not implemented.");
    }
}


/***/ }),

/***/ "./src/plots/line/LinePlot.ts":
/*!************************************!*\
  !*** ./src/plots/line/LinePlot.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   LinePlot: () => (/* binding */ LinePlot)
/* harmony export */ });
/* harmony import */ var _helpers_ReactivePosition__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../helpers/ReactivePosition */ "./src/helpers/ReactivePosition.ts");
/* harmony import */ var _Plot__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../Plot */ "./src/plots/Plot.ts");
/* harmony import */ var _LineAudio__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./LineAudio */ "./src/plots/line/LineAudio.ts");
/* harmony import */ var _LineControl__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./LineControl */ "./src/plots/line/LineControl.ts");
/* harmony import */ var _LineDisplay__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./LineDisplay */ "./src/plots/line/LineDisplay.ts");





class LinePlot extends _Plot__WEBPACK_IMPORTED_MODULE_1__.Plot {
    constructor(maidr) {
        super();
        /* Plot Data and related variables */
        this.maxY = 0;
        this.maxX = 0;
        this.minY = 0;
        this.minX = 0;
        this.pointValuesY = [];
        this.pointValuesX = [];
        this.autoPlayRate = 0;
        this.chartLineX = [];
        this.chartLineY = [];
        this.curveMinY = 0;
        this.curveMaxY = 0;
        this.plotLegend = null;
        this.title = "";
        this.subtitle = "";
        this.caption = "";
        this.maidr = maidr;
        this.plotData = maidr.data;
        this.position = new _helpers_ReactivePosition__WEBPACK_IMPORTED_MODULE_0__.ReactivePosition(-1, -1);
        this.audio = new _LineAudio__WEBPACK_IMPORTED_MODULE_2__.LineAudio(this, this.position);
        this.display = new _LineDisplay__WEBPACK_IMPORTED_MODULE_4__.LineDisplay(this, this.position);
        this.control = new _LineControl__WEBPACK_IMPORTED_MODULE_3__.LineControl(this, this.position, this.audio, this.display);
        this.constants = window.constants;
        this.setLineLayer();
        this.setAxes();
        this.updateConstants();
        /* Previous Constructor Code ENDS Here */
    }
    setLineLayer() {
        let elements;
        if ("selector" in this.maidr) {
            elements = document.querySelectorAll(this.maidr.selector);
        }
        else if ("elements" in this.maidr) {
            elements = this.maidr.elements;
        }
        if (elements) {
            this.plotLine = elements[elements.length - 1];
        }
        else {
            this.constants.hasRect = 0;
        }
        let pointCoords = this.getPointCoords();
        let pointValues = this.getPoints();
        this.chartLineX = pointCoords[0]; // x coordinates of curve
        this.chartLineY = pointCoords[1]; // y coordinates of curve
        this.pointValuesX = pointValues[0]; // actual values of x
        this.pointValuesY = pointValues[1]; // actual values of y
        this.curveMinY = Math.min(...this.pointValuesY);
        this.curveMaxY = Math.max(...this.pointValuesY);
    }
    getPointCoords() {
        var _a;
        let svgLineCoords = [[], []];
        if (this.plotLine) {
            if (this.plotLine instanceof SVGPathElement) {
                const pathD = (_a = this.plotLine.getAttribute("d")) !== null && _a !== void 0 ? _a : "";
                const regex = /[ML]\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)/g;
                let match;
                while ((match = regex.exec(pathD)) !== null) {
                    svgLineCoords[0].push(match[1]);
                    svgLineCoords[1].push(match[3]);
                }
            }
            else {
                let points = this.plotLine.getAttribute("points").split(" ");
                for (let i = 0; i < points.length; i++) {
                    if (points[i] !== "") {
                        let point = points[i].split(",");
                        svgLineCoords[0].push(point[0]);
                        svgLineCoords[1].push(point[1]);
                    }
                }
            }
        }
        else {
            // fetch from data instead
            let x_points = [];
            let y_points = [];
            let data;
            if ("data" in this.maidr) {
                data = this.maidr.data;
            }
            if (typeof data !== "undefined") {
                for (let i = 0; i < data.length; i++) {
                    x_points.push(data[i].x);
                    y_points.push(data[i].y);
                }
            }
            return [x_points, y_points];
        }
        console.log(svgLineCoords);
        return svgLineCoords;
    }
    getPoints() {
        let x_points = [];
        let y_points = [];
        let data;
        if ("data" in this.maidr) {
            data = this.maidr.data;
        }
        if (typeof data !== "undefined") {
            for (let i = 0; i < data.length; i++) {
                x_points.push(data[i].x);
                y_points.push(data[i].y);
            }
            return [x_points, y_points];
        }
        return [[], []];
    }
    updateConstants() {
        this.minX = 0;
        this.maxX = this.maidr.data.length - 1;
        this.minY = this.maidr.data.reduce((min, item) => (item.y < min ? item.y : min), this.maidr.data[0].y);
        this.maxY = this.maidr.data.reduce((max, item) => (item.y > max ? item.y : max), this.maidr.data[0].y);
        this.autoPlayRate = Math.min(Math.ceil(this.constants.AUTOPLAY_DURATION / (this.maxX + 1)), this.constants.MAX_SPEED);
        if (this.autoPlayRate < this.constants.MIN_SPEED) {
            this.constants.MIN_SPEED = this.constants.autoPlayRate;
        }
    }
    setAxes() {
        let legendX = '';
        let legendY = '';
        if ('axes' in this.maidr) {
            // legend labels
            if (this.maidr.axes.x) {
                if (this.maidr.axes.x.label) {
                    if (legendX == '') {
                        legendX = this.maidr.axes.x.label;
                    }
                }
            }
            if (this.maidr.axes.y) {
                if (this.maidr.axes.y.label) {
                    if (legendY == '') {
                        legendY = this.maidr.axes.y.label;
                    }
                }
            }
        }
        this.plotLegend = {
            x: legendX,
            y: legendY,
        };
        // title
        this.title = '';
        if ('labels' in this.maidr) {
            if ('title' in this.maidr.labels) {
                this.title = this.maidr.labels.title;
            }
        }
        if (this.title == '') {
            if ('title' in this.maidr) {
                this.title = this.maidr.title;
            }
        }
        // subtitle
        if ('labels' in this.maidr) {
            if ('subtitle' in this.maidr.labels) {
                this.subtitle = this.maidr.labels.subtitle;
            }
        }
        // caption
        if ('labels' in this.maidr) {
            if ('caption' in this.maidr.labels) {
                this.caption = this.maidr.labels.caption;
            }
        }
    }
    playTones() {
        this.audio.playTone(null);
    }
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
/*!*********************!*\
  !*** ./src/init.ts ***!
  \*********************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _constants__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants */ "./src/constants.ts");
/* harmony import */ var _helpers_ChartType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./helpers/ChartType */ "./src/helpers/ChartType.ts");
/* harmony import */ var _plots_PlotFactory__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./plots/PlotFactory */ "./src/plots/PlotFactory.ts");



document.addEventListener("DOMContentLoaded", function () {
    window.constants = new _constants__WEBPACK_IMPORTED_MODULE_0__.Constants();
    window.resources = new _constants__WEBPACK_IMPORTED_MODULE_0__.Resources();
    window.logError = new _constants__WEBPACK_IMPORTED_MODULE_0__.LogError();
    let maidr = window.maidr;
    destroyMaidr();
    const maidrElement = document.getElementById(maidr.id);
    if (maidrElement) {
        maidrElement.setAttribute("tabindex", "0");
        maidrElement.addEventListener("focus", () => onPlotFocus(maidr));
    }
});
function initMaidr(maidr) {
    var _a;
    let constants = window.constants;
    if (typeof constants !== "undefined") {
        window.maidr = maidr;
        window.constants.chartId = maidr.id;
        window.constants.chartType = maidr.type;
        createChartComponents(maidr);
        const maidrObjects = [];
        if ("panels" in maidr) {
            const panels = maidr.panels; // Create proper type for this
            for (const panel of panels) {
                const layers = panel.layers; // Create proper type for this
                for (const layer of layers) {
                    const chartType = (0,_helpers_ChartType__WEBPACK_IMPORTED_MODULE_1__.convertToChartType)(layer.type);
                    const plot = _plots_PlotFactory__WEBPACK_IMPORTED_MODULE_2__.PlotFactory.createPlot(chartType, layer);
                    maidrObjects.push(plot);
                }
            }
            console.log(maidrObjects);
        }
        else {
            var chartType = (0,_helpers_ChartType__WEBPACK_IMPORTED_MODULE_1__.convertToChartType)(maidr.type);
            window.plot = _plots_PlotFactory__WEBPACK_IMPORTED_MODULE_2__.PlotFactory.createPlot(chartType, maidr);
        }
        const controlElements = [
            window.constants.chart,
            window.constants.brailleInput,
        ];
        for (const controlElement of controlElements) {
            if (controlElement)
                window.constants.events.push([
                    controlElement,
                    "blur",
                    onMaidrDestroy,
                ]);
        }
        setEvents();
        if ("title" in maidr) {
            (_a = window.display) === null || _a === void 0 ? void 0 : _a.announceText(maidr.title);
        }
    }
}
function onPlotFocus(maidr) {
    var _a;
    if (maidr && maidr.id !== ((_a = window.maidr) === null || _a === void 0 ? void 0 : _a.id)) {
        destroyMaidr();
        initMaidr(maidr);
    }
}
function onMaidrDestroy() {
    let constants = window.constants;
    setTimeout(() => {
        if (window.constants.tabMovement === 0) {
            window.constants.tabMovement = null;
        }
        else if (window.constants.tabMovement === 1 ||
            window.constants.tabMovement === -1) {
            onNonFocus();
            destroyMaidr();
        }
    }, 0);
}
function onNonFocus() {
    var _a, _b;
    let constants = window.constants;
    if (window.constants.tabMovement === 1) {
        const focusTemp = document.createElement("div");
        focusTemp.setAttribute("tabindex", "0");
        (_a = window.constants.mainContainer) === null || _a === void 0 ? void 0 : _a.after(focusTemp);
        focusTemp.focus();
        focusTemp.remove();
    }
    else if (window.constants.tabMovement === -1) {
        const focusTemp = document.createElement("div");
        focusTemp.setAttribute("tabindex", "0");
        (_b = window.constants.mainContainer) === null || _b === void 0 ? void 0 : _b.before(focusTemp);
        focusTemp.focus();
        focusTemp.remove();
    }
}
function destroyMaidr() {
    if (window.constants.chartType === "bar") {
        if (window.plot && "deselectAll" in window.plot) {
            window.plot.deselectAll();
        }
        if (window.plot && "deselectPrevious" in window.plot) {
            window.plot.deselectPrevious();
        }
    }
    for (const event of window.constants.events) {
        if (Array.isArray(event[0])) {
            for (const el of event[0]) {
                el.removeEventListener(event[1], event[2]);
            }
        }
        else {
            event[0].removeEventListener(event[1], event[2]);
        }
    }
    for (const event of window.constants.postLoadEvents) {
        if (Array.isArray(event[0])) {
            for (const el of event[0]) {
                el.removeEventListener(event[1], event[2]);
            }
        }
        else {
            event[0].removeEventListener(event[1], event[2]);
        }
    }
    window.constants.events = [];
    window.constants.postLoadEvents = [];
    window.constants.chartId = "";
    window.constants.chartType = "";
    window.constants.tabMovement = null;
    destroyChartComponents();
    window.display = null;
    window.control = null;
    window.plot = null;
    window.audio = null;
    window.maidr = null;
}
function setEvents() {
    for (const event of window.constants.events) {
        if (Array.isArray(event[0])) {
            for (const el of event[0]) {
                el.addEventListener(event[1], event[2]);
            }
        }
        else {
            event[0].addEventListener(event[1], event[2]);
        }
    }
    setTimeout(() => {
        for (const event of window.constants.postLoadEvents) {
            if (Array.isArray(event[0])) {
                for (const el of event[0]) {
                    el.addEventListener(event[1], event[2]);
                }
            }
            else {
                event[0].addEventListener(event[1], event[2]);
            }
        }
    }, 100);
}
function createChartComponents(maidr) {
    var _a, _b;
    const chart = document.getElementById(maidr.id);
    const mainContainer = document.createElement("div");
    const chartContainer = document.createElement("div");
    const constants = window.constants;
    mainContainer.id = window.constants.mainContainerId;
    chartContainer.id = window.constants.chartContainerId;
    console.log("CHART: ", chart);
    if (chart) {
        (_a = chart.parentNode) === null || _a === void 0 ? void 0 : _a.replaceChild(mainContainer, chart);
        mainContainer.appendChild(chart);
        (_b = chart.parentNode) === null || _b === void 0 ? void 0 : _b.replaceChild(chartContainer, chart);
        chartContainer.appendChild(chart);
        chart.focus();
    }
    window.constants.chart = chart;
    window.constants.chartContainer = chartContainer;
    window.constants.mainContainer = mainContainer;
    window.constants.chartContainer.insertAdjacentHTML("beforebegin", `<div class="hidden" id="${window.constants.brailleContainerId}">
      <input id="${window.constants.brailleInputId}" class="braille-input" type="text" size="${window.constants.brailleDisplayLength}" autocomplete="off" />
    </div>`);
    window.constants.chartContainer.insertAdjacentHTML("afterend", `<br><div id="${window.constants.infoId}" aria-live="assertive" aria-atomic="true">
      <p id="x"></p>
      <p id="y"></p>
    </div>`);
    document
        .getElementById(window.constants.infoId)
        .insertAdjacentHTML("afterend", `<div id="${window.constants.announcementContainerId}" aria-live="assertive" aria-atomic="true" class="mb-3"></div>`);
    window.constants.chartContainer.setAttribute("role", "application");
    window.constants.brailleContainer = document.getElementById(window.constants.brailleContainerId);
    window.constants.brailleInput = document.getElementById(window.constants.brailleInputId);
    window.constants.infoDiv = document.getElementById(window.constants.infoId);
    window.constants.announcementContainer = document.getElementById(window.constants.announcementContainerId);
    if (window.audio) {
        window.audio.endChime = document.getElementById(window.constants.endChimeId);
    }
    window.chatLLM = new _constants__WEBPACK_IMPORTED_MODULE_0__.ChatLLM();
}
function destroyChartComponents() {
    let constants = window.constants;
    if (window.constants.chartContainer !== null) {
        if (window.constants.chart !== null) {
            if (window.constants.chartContainer.parentNode !== null) {
                window.constants.chartContainer.parentNode.replaceChild(window.constants.chart, window.constants.chartContainer);
            }
        }
        window.constants.chartContainer.remove();
    }
    if (window.constants.brailleContainer !== null) {
        window.constants.brailleContainer.remove();
    }
    if (window.constants.infoDiv !== null) {
        window.constants.infoDiv.remove();
    }
    if (window.constants.announcementContainer !== null) {
        window.constants.announcementContainer.remove();
    }
    window.constants.chart = null;
    window.constants.chart = null;
    window.constants.brailleContainer = null;
    window.constants.brailleInput = null;
    window.constants.infoDiv = null;
    window.constants.announcementContainer = null;
    if (window.audio) {
        window.audio.endChime = null;
    }
}

/******/ })()
;
//# sourceMappingURL=bundle.js.map