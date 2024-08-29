import {Constants} from "./constants";

export default class Display {
    infoDiv: HTMLElement | null;
    constants: Constants;
    x: { id: string; textBase: string };
    y: { id: string; textBase: string };

    constructor() {
        this.constants = window.constants;
        this.infoDiv = this.constants.infoDiv;

        this.x = {id: 'x', textBase: 'x-value: '};
        this.y = {id: 'y', textBase: 'y-value: '};
    }

    announceText(text: string) {
        const announcement = document.createElement('p');
        let constants = window.constants;
        announcement.textContent = text;
        announcement.setAttribute('aria-live', 'assertive');
        announcement.setAttribute('role', 'alert');
        constants.announcementContainer!.appendChild(announcement);

        setTimeout(() => {
            constants.announcementContainer!.removeChild(announcement);
        }, 5000);
    }

    updateX(value: string) {
        if (this.infoDiv) {
            const xElement = document.getElementById(this.x.id);
            if (xElement) {
                xElement.innerHTML = this.x.textBase + value;
            }
        }
    }

    updateY(value: string) {
        if (this.infoDiv) {
            const yElement = document.getElementById(this.y.id);
            if (yElement) {
                yElement.innerHTML = this.y.textBase + value;
            }
        }
    }

    toggleBrailleMode() {
        let constants = window.constants;
        let onOff: "off" | "on";

        if (constants.brailleMode == 'on') {
            onOff = 'off';
        } else {
            onOff = 'on';
        }

        constants.brailleMode = onOff;
    }

    toggleTextMode() {
        let constants = window.constants;
        if (constants.textMode == 'off') {
            constants.textMode = 'terse';
        } else if (constants.textMode == 'terse') {
            constants.textMode = 'verbose';
        } else if (constants.textMode == 'verbose') {
            constants.textMode = 'off';
        }

        this.announceText(
            '<span aria-hidden="true">Text mode:</span> ' + constants.textMode
        );
    }

    toggleSonificationMode() {
        let constants = window.constants;
        if (constants.soundMode == 'off') {
            constants.soundMode = 'on';
            this.announceText(window.resources.GetString('son_on'));
        } else {
            constants.soundMode = 'off';
            this.announceText(window.resources.GetString('son_off'));
        }
    }

    displayValues() {
        // verbose: {legend x} is {colname x}, {legend y} is {value y}
        let output = '';
        let verboseText = '';
        let terseText = '';
        if (window.plot.columnLabels[window.position!.x]) {
            if (window.plot.plotLegend.x.length > 0) {
                verboseText += window.plot.plotLegend.x + ' is ';
            }
            verboseText += window.plot.columnLabels[window.position!.x] + ', ';
        }
        if (window.plot.plotData[window.position!.x]) {
            if (window.plot.plotLegend) {
                verboseText += window.plot.plotLegend.y + ' is ';
            }
            verboseText += window.plot.plotData[window.position!.x];
        }
        // terse: {colname} {value}
        terseText +=
            '<p>' +
            window.plot.columnLabels[window.position!.x] +
            ' ' +
            window.plot.plotData[window.position!.x] +
            '</p>\n';
        verboseText = '<p>' + verboseText + '</p>\n';

        // set outout text
        if (this.constants.textMode == 'verbose') {
            output = verboseText;
        } else if (this.constants.textMode == 'terse') {
            output = terseText;
        }

        if (window.constants.infoDiv) {
            window.constants.infoDiv.innerHTML = output;
        }
    }

    UpdateBraillePos() {
        window.constants.brailleInput!.setSelectionRange(window.position!.x, window.position!.x);
    }
}
