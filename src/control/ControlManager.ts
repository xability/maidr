import { Constants } from "../constants";
import { DisplayManager } from "../display/DisplayManager";
import { ReactivePosition } from "../helpers/ReactivePosition";

export abstract class ControlManager {
    position: ReactivePosition;
    display: DisplayManager | null = null;
    constants: Constants;
    plotData: any;
    controlElements: HTMLElement[] = [];
    pressedL: boolean = false;
    pressedTimeout: NodeJS.Timeout | null = null;
    maidr: any;

    constructor() {
        this.position = new ReactivePosition();
        this.constants = window.constants;
        this.display = window.display;
        this.maidr = window.maidr;
        this.controlElements = [
            this.constants.chart,
            this.constants.brailleInput,
            // Review container is added to constants.js dynamically when an instance of controls is created. Need to analyze how to inject the review HTML element.
            this.constants.review_container
          ];
        this.SetControls();
    }

    SetControls(): void {
        this.controlElements.forEach(element => {
          element.addEventListener('keydown', this.handleKeyDown.bind(this));
        });
        this.additionalSetControls();
    }

    handleKeyDown(e: KeyboardEvent): void {
        if (this.pressedL) return;
    
        switch (e.key.toLowerCase()) {
          case 'b':
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

    handleBrailleMode(e: KeyboardEvent): void {
        this.constants.tabMovement = 0;
        e.preventDefault();
        this.display!.toggleBrailleMode();
    }

    handleTextMode(): void {
        this.display!.toggleTextMode();
    }

    handleSonificationMode(): void {        
        this.display!.toggleSonificationMode();
    }

    handleReviewMode(e: KeyboardEvent): void {
        if (e.ctrlKey || e.shiftKey) return;
        this.constants.tabMovement = 0;
        e.preventDefault();
        // Review is originally defined in constants.js. Need to confirm how we want to utilize review.
        // review.ToggleReviewMode(this.constants.review_container.classList.contains('hidden')); - Should be included for r key press
    }

    handleSpaceKey(): void {
        if (this.position.x < 0) this.position.x = 0;
        if (this.position.y < 0) this.position.y = 0;
    
        if (this.constants.showDisplay) {
          this.display!.displayValues();
        }
        if (this.constants.sonifMode !== 'off') {
          this.plotData.PlayTones();
        }
    }
    
    handleTabKey(e: KeyboardEvent): void {
        if (e.shiftKey) {
          this.constants.tabMovement = -1;
        } else {
          this.constants.tabMovement = 1;
        }
    }

    handleLayerChange(e: KeyboardEvent): void {
        if (!Array.isArray(this.maidr.type) || this.constants.brailleMode !== 'off') return;
        
        const types = Array.isArray(this.maidr.type) ? this.maidr.type : [this.maidr.type];
        if (types.includes('point') && types.includes('smooth')) {
           // Need to integrate changeChartLayer method to display manager before uncommenting this line
          // this.display!.changeChartLayer(e.key === 'PageDown' ? 'down' : 'up');
        }
    }

    setPrefixEvents(): void {
        document.addEventListener('keydown', this.handlePrefixKeyDown.bind(this));
    }

    handlePrefixKeyDown(e: KeyboardEvent): void {
        if (e.key.toLowerCase() === 'l') {
          this.pressedL = true;
          if (this.pressedTimeout !== null) {
            clearTimeout(this.pressedTimeout);
          }
          this.pressedTimeout = setTimeout(() => {
            this.pressedL = false;
          }, this.constants.keypressInterval);
        } else if (this.pressedL) {
          this.handlePrefixCommand(e.key.toLowerCase());
        }
    }
    // ctrl/cmd key prefix should be handled in every plot separately. Should handlePrefixCommand be abstract?
    handlePrefixCommand(key: string): void {
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
    
    displayInfo(type: string, content: string): void {
        // displayInfo method has not been migrated as of now to DisplayManager
        this.display!.displayInfo(type, content);
    }
    
    // A map can be used to combine x and y values for each plot. Need to discuss whether this change can be implemented.
    getXLabel(): string {
        if (['bar', 'line'].includes(this.maidr.type)) {
          return this.plotData.plotLegend.x;
        } else if (this.maidr.type === 'hist') {
          return this.plotData.legendX;
        } else if (['heat', 'box', 'point'].includes(this.maidr.type) || this.maidr.type.includes('point')) {
          return this.plotData.x_group_label;
        } else if (['stacked_bar', 'stacked_normalized_bar', 'dodged_bar'].includes(this.maidr.type)) {
          return this.plotData.plotLegend.x;
        }
        return '';
    }
    
    getYLabel(): string {
        if (['bar', 'line'].includes(this.maidr.type)) {
          return this.plotData.plotLegend.y;
        } else if (this.maidr.type === 'hist') {
          return this.plotData.legendY;
        } else if (['heat', 'box', 'point', 'line'].includes(this.maidr.type) || this.maidr.type.includes('point')) {
          return this.plotData.y_group_label;
        } else if (['stacked_bar', 'stacked_normalized_bar', 'dodged_bar'].includes(this.maidr.type)) {
          return this.plotData.plotLegend.y;
        }
        return '';
    }

    abstract additionalSetControls(): void;
    // GetNextPrevFocusable method has not been utilized anywhere else. Need to confirm if it is a method in development
    
}
