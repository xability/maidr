import { ControlManager } from "../../control/ControlManager";
import { ChartType } from "../../helpers/ChartType";
import { ReactivePosition } from "../../helpers/ReactivePosition";
import { BarAudio } from "./BarAudio";
import BarDisplay from "./BarDisplay";
import { BarPlot } from "./BarPlot";

/**
 * Note that this class is not completely refactored this is just
 * copy pasted from previous JS implementation with some typescript
 */
export class BarControl extends ControlManager {
  position: ReactivePosition;
  audio: BarAudio;
  display: BarDisplay;
  lastPlayed: string = '';
  plot: BarPlot;
  autoplayId: number | NodeJS.Timeout | null = null;

  constructor(
    plot: BarPlot,
    position: ReactivePosition,
    audio: BarAudio,
    display: BarDisplay,
  ) {
    super(ChartType.Bar);
    this.plot = plot;
    this.position = position;
    this.position.subscribe(this.onPositionChange.bind(this));
    this.audio = audio;
    this.display = display;
  }

  onPositionChange(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
  }

  additionalSetControls(): void {
    this.controlElements.forEach(element => {
        element?.addEventListener('keydown', this.handleKeyDown.bind(this));
      });
      document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
  }

  // The following methods are event listeners specific to bar plot. The key handling and speed change handling have been separated into their own methods for modularity.
  // if-else conditional blocks have been replaced with switch-break wherever possible to promote easy logic.
  
  handleKeyDown(e: KeyboardEvent): void {
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
  
  handleArrowKey(key: 'ArrowRight' | 'ArrowLeft', isCommandKey: boolean, isShiftKey: boolean, isAltKey: boolean): void {
    const direction = key === 'ArrowRight' ? 1 : -1;
    const endPosition = direction > 0 ? this.plot.plotData.length - 1 : 0;
    let updateInfo = false;
    let isAtEnd = false;
  
    if (isCommandKey) {
      if (isShiftKey) {
        this.position.setX(this.position.x - direction)
        this.autoplay(key === 'ArrowRight' ? 'right' : 'left', this.position.x, direction > 0 ? this.plot.plotData.length : -1);
      } else {
        this.position.setX(endPosition)
        updateInfo = true;
        isAtEnd = this.lockPosition();
      }
    } else if (isAltKey && isShiftKey && this.position.x !== endPosition) {
      this.constants.lastx = this.position.x;
      this.autoplay(`reverse-${key === 'ArrowRight' ? 'right' : 'left'}`, endPosition, this.position.x);
    } else {
      console.log('position.x | else', this.position.x);
      this.position.setX(this.position.x + direction)
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
  
  handleSpeedChange(key: '.' | ',' | '/'): void {
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

  handleSelectionChange(e: Event): void {
    if (this.constants.brailleMode === 'on') {
      let pos = this.constants.brailleInput?.selectionStart ?? 0;
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

  lockPosition(): boolean {
    const minPosition = 0;
    const maxPosition = this.plot.plotData.length - 1;
    const originalPosition = this.position.x;
  
    this.position.x = Math.max(minPosition, Math.min(maxPosition, this.position.x));
  
    if (this.constants.brailleMode !== 'off') {
      this.constants.brailleInput!.selectionEnd = this.position.x;
    }
  
    return originalPosition !== this.position.x;
  }
  
  //Already in most optimized form in maidr-js and hence adapted the same implementation to maidr-ts.

  updateAll(): void {
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

  autoplay(dir: string, start: number, end: number): void {
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
  
    const plotDataLength = this.plot.plotData?.length ?? 0;
  
    this.autoplayId = setInterval(() => {
      position.x += step;
  
      if (!this?.plot.plotData || position.x < 0 || position.x > plotDataLength - 1) {
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

  playDuringSpeedChange(): void {
    if (this.constants.autoplayId == null) return;
  
    this.constants.KillAutoplay(this.autoplayId);
  
    const direction = this.lastPlayed.startsWith('reverse-') 
      ? this.lastPlayed.replace('reverse-', '') === 'left' ? 'right' : 'left'
      : this.lastPlayed;
  
    this.autoplay(direction, this.position.x, this.constants.lastx);
  }

}
