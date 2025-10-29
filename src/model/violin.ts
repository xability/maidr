import type { MaidrLayer, SmoothPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import { Svg } from '@util/svg';
import { SmoothTrace } from './smooth';

/**
 * ViolinTrace extends SmoothTrace to provide violin-specific navigation behavior.
 * For violin plots, only up/down arrows are allowed for navigation along the density curve.
 * Left/right arrows are disabled to ensure consistent navigation for KDE density exploration.
 */
export class ViolinTrace extends SmoothTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
    console.log('ViolinTrace: Constructor called for violin plot');
  }

  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    if (!selectors || selectors.length !== this.lineValues.length) {
      return null;
    }

    const svgElements: SVGElement[][] = [];
    let allFailed = true;
    for (let r = 0; r < selectors.length; r++) {
      // For violin plots, try to find the actual rendered element
      let lineElement = Svg.selectElement(selectors[r], false);
      
      // If selector targets defs > path, try to find the use element that references it
      if (!lineElement && selectors[r].includes('defs > path')) {
        // For selectors like "g[id='...'] > defs > path", look for the clipped group containing the use element
        const groupId = selectors[r].match(/g\[id='([^']+)'\]/);
        if (groupId && groupId[1]) {
          const groupElement = document.querySelector(`g[id='${groupId[1]}']`) as SVGElement | null;
          if (groupElement) {
            // Look for the clipped group containing the use element
            const clippedGroup = groupElement.querySelector('g[clip-path]') as SVGElement | null;
            if (clippedGroup) {
              // Use the clipped group for highlighting - this contains the actual rendered use element
              lineElement = clippedGroup;
            } else {
              // Fallback: look for use element and use its parent
              const useElement = groupElement.querySelector('use');
              if (useElement && useElement.parentElement instanceof SVGElement) {
                lineElement = useElement.parentElement as SVGElement;
              }
            }
          }
        }
      }
      
      // If we still don't have a lineElement, try to find the use element directly
      if (!lineElement) {
        const groupId = selectors[r].match(/g\[id='([^']+)'\]/);
        if (groupId && groupId[1]) {
          const groupElement = document.querySelector(`g[id='${groupId[1]}']`) as SVGElement | null;
          if (groupElement) {
            // Look for the clipped group containing the use element
            const clippedGroup = groupElement.querySelector('g[clip-path]') as SVGElement | null;
            if (clippedGroup) {
              lineElement = clippedGroup;
            } else {
              // Fallback: look for use element directly
              const useElement = groupElement.querySelector('use');
              if (useElement && useElement.parentElement instanceof SVGElement) {
                lineElement = useElement.parentElement as SVGElement;
              }
            }
          }
        }
      }

      // For violin plots, highlight the entire violin shape
      const linePointElements: SVGElement[] = [];
      if (lineElement && lineElement instanceof SVGElement) {
        linePointElements.push(lineElement);
        allFailed = false;
      }

      svgElements.push(linePointElements);
    }

    if (allFailed) {
      return null;
    }
    return svgElements;
  }

  public moveOnce(direction: MovableDirection): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return;
    }

    // For violin plots, only allow up/down arrow navigation
    // Left/right arrows are disabled for violin plots
    switch (direction) {
      case 'UPWARD':
        // Up arrow moves forward along the density curve
        this.col += 1;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        break;
      case 'DOWNWARD':
        // Down arrow moves backward along the density curve
        this.col -= 1;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        break;
      case 'FORWARD':
      case 'BACKWARD':
        // Left/right arrows are disabled for violin plots
        this.notifyOutOfBounds();
        break;
    }
  }

  public isMovable(direction: MovableDirection): boolean {
    // For violin plots, map up/down arrows to column movement
    // and disable left/right arrows
    switch (direction) {
      case 'UPWARD':
        // Up arrow: check if we can move forward (increase column)
        return this.col < this.lineValues[this.row].length - 1;
      case 'DOWNWARD':
        // Down arrow: check if we can move backward (decrease column)
        return this.col > 0;
      case 'FORWARD':
      case 'BACKWARD':
        // Left/right arrows are disabled for violin plots
        return false;
      default:
        // Handle array-based movements (for compatibility)
        return super.isMovable(direction);
    }
  }

  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    // For violin plots, up arrow should move forward along the density curve
    this.moveOnce('UPWARD');
    return true;
  }

  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    // For violin plots, down arrow should move backward along the density curve
    this.moveOnce('DOWNWARD');
    return true;
  }

  public moveLeftRotor(_mode?: 'lower' | 'higher'): boolean {
    // Left arrow is disabled for violin plots - only up/down arrows are allowed
    return false;
  }

  public moveRightRotor(_mode?: 'lower' | 'higher'): boolean {
    // Right arrow is disabled for violin plots - only up/down arrows are allowed
    return false;
  }
}