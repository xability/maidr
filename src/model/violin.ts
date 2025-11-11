import type { MaidrLayer, SmoothPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { BrailleState, TextState } from '@type/state';
import { Svg } from '@util/svg';
import { SmoothTrace } from './smooth';

/**
 * ViolinTrace extends SmoothTrace to provide violin-specific navigation behavior.
 * For violin plots, up/down arrows navigate within a single violin's density curve.
 * Left/right arrows switch between violins within the same KDE layer when available.
 */
export class ViolinTrace extends SmoothTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
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
              // Find the use element inside the clipped group - this is the actual rendered violin shape
              const useElement = clippedGroup.querySelector('use');
              if (useElement) {
                // Use the use element directly instead of the defs path
                lineElement = useElement as SVGElement;
              }
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
      
      // If we still don't have a lineElement, the path is in defs and needs special handling
      // For violin plots with paths in defs, we can't directly highlight the defs path
      // Instead, we need to work with the use element or find another approach
      if (!lineElement) {
        // console.log('Could not find path element for highlighting');
      }
      
      // For violin plots, create circle elements for each point (like LineTrace does)
      // This avoids the issue with highlighting defs paths or use elements
      const linePointElements: SVGElement[] = [];
      if (lineElement && lineElement instanceof SVGElement) {
        // Check if this is a path in defs - if so, we need to create circles for highlighting
        if (lineElement.tagName === 'path' && lineElement.closest('defs')) {
          // Create circle elements for each point along the violin curve
          const dataPoints = this.points?.[r] as any[];
          if (dataPoints) {
            for (const pt of dataPoints) {
              if (typeof pt.svg_x === 'number' && typeof pt.svg_y === 'number') {
                // Create a circle element for this point
                const circleElement = Svg.createCircleElement(pt.svg_x, pt.svg_y, lineElement);
                // Override the radius to make it smaller (3px instead of the default)
                circleElement.setAttribute('r', '3');
                linePointElements.push(circleElement);
              }
            }
          }
          if (linePointElements.length > 0) {
            allFailed = false;
          }
        } else if (lineElement.tagName === 'use') {
          // For use elements, try to make them visible and highlightable
          // Make the use element visible and add it to linePointElements
          linePointElements.push(lineElement);
          allFailed = false;
          
          // Also create circles for each point for better visibility
          const dataPoints = this.points?.[r] as any[];
          if (dataPoints) {
            for (const pt of dataPoints) {
              if (typeof pt.svg_x === 'number' && typeof pt.svg_y === 'number') {
                // Create a circle element for this point
                const circleElement = Svg.createCircleElement(pt.svg_x, pt.svg_y, lineElement);
                // Override the radius to make it smaller (3px instead of the default)
                circleElement.setAttribute('r', '3');
                linePointElements.push(circleElement);
              }
            }
          }
          if (linePointElements.length > 0) {
            allFailed = false;
          }
        } else {
          // console.log('Skipping non-path/non-use element:', lineElement.tagName);
        }
      } else {
        // console.log('No valid lineElement found for this selector');
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

    if (direction === 'FORWARD' || direction === 'BACKWARD') {
      const nextRow = direction === 'FORWARD' ? this.row + 1 : this.row - 1;
      const lastRowIndex = this.lineValues.length - 1;
      if (nextRow < 0 || nextRow > lastRowIndex) {
        this.notifyOutOfBounds();
        return;
      }

      this.row = nextRow;
      const targetRowLength = this.lineValues[this.row]?.length ?? 0;
      if (targetRowLength === 0) {
        this.col = 0;
      } else if (this.col >= targetRowLength) {
        this.col = targetRowLength - 1;
      }
      this.updateVisualPointPosition();
      this.notifyStateUpdate();
      return;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return;
    }

    // For violin plots, up/down arrows navigate along the smooth violin curve (density curve)
    // This moves along the density curve within a violin (col movement)
    switch (direction) {
      case 'UPWARD':
        // Up arrow moves forward along the density curve (increase column)
        this.col += 1;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        break;
      case 'DOWNWARD':
        // Down arrow moves backward along the density curve (decrease column)
        this.col -= 1;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        break;
    }
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    // Handle array-based movements
    if (Array.isArray(target)) {
      return super.isMovable(target);
    }

    const direction = target;
    
    if (direction === 'FORWARD' || direction === 'BACKWARD') {
      if (direction === 'FORWARD') {
        return this.row < this.lineValues.length - 1;
      }
      return this.row > 0;
    }

    // For violin plots, up/down arrows navigate along the density curve within a violin
    switch (direction) {
      case 'UPWARD':
        // Up arrow: check if we can move forward (increase column) along density curve
        const canMoveUp = this.col < this.lineValues[this.row].length - 1;
        return canMoveUp;
      case 'DOWNWARD':
        // Down arrow: check if we can move backward (decrease column) along density curve
        const canMoveDown = this.col > 0;
        return canMoveDown;
      default:
        // Handle array-based movements (for compatibility)
        const superMovable = super.isMovable(direction);
        return superMovable;
    }
  }

  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    // Fn+Up switches between BOX and KDE layers within a violin
    // Let the subplot handle layer switching by not handling UPWARD
    // This allows Fn+Up/Down to switch between BOX and KDE layers
    // Regular Up/Down navigates along the density curve
    this.notifyOutOfBounds(); // Let subplot handle layer switching
    return true;
  }

  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    // Fn+Down switches between BOX and KDE layers within a violin
    // Let the subplot handle layer switching by not handling DOWNWARD
    // This allows Fn+Up/Down to switch between BOX and KDE layers
    // Regular Up/Down navigates along the density curve
    this.notifyOutOfBounds(); // Let subplot handle layer switching
    return true;
  }

  public moveLeftRotor(_mode?: 'lower' | 'higher'): boolean {
    // Left arrow switches between violin layers (BACKWARD)
    this.moveOnce('BACKWARD');
    return true;
  }

  public moveRightRotor(_mode?: 'lower' | 'higher'): boolean {
    // Right arrow switches between violin layers (FORWARD)
    this.moveOnce('FORWARD');
    return true;
  }

  protected audio() {
    // Use density (width) to drive pitch and volume for KDE layer
    const rowPoints = this.points[this.row] as Array<any>;
    const densities = rowPoints.map(p => typeof p.density === 'number' ? p.density : 0);
    const minD = Math.min(...densities);
    const maxD = Math.max(...densities);
    const safeRange = maxD - minD || 1; // avoid divide-by-zero

    const col = this.col;
    const getD = (i: number) => densities[Math.max(0, Math.min(i, densities.length - 1))];
    const prev = col > 0 ? getD(col - 1) : getD(col);
    const curr = getD(col);
    const next = col < densities.length - 1 ? getD(col + 1) : getD(col);

    // Volume scale proportional to normalized density at current point
    const normalized = (curr - minD) / safeRange; // 0..1
    const volumeScale = Math.max(0.05, normalized); // keep audible floor

    return {
      min: minD,
      max: maxD,
      size: densities.length,
      index: col,
      value: [prev, curr, next], // drive frequency curve from density
      isContinuous: true,
      volumeScale,
      ...this.getAudioGroupIndex(),
    };
  }

  protected braille(): BrailleState {
    // Ensure braille is properly displayed for violin plots
    // ViolinTrace inherits lineValues, min, max from LineTrace, so this should work
    return {
      empty: false,
      id: this.id,
      values: this.lineValues,
      min: this.min,
      max: this.max,
      row: this.row,
      col: this.col,
    };
  }

  protected text(): TextState {
    const point = this.points[this.row][this.col];
    const baseText = super.text();

    // For violin plots, display Y value, X coordinate, and density (width) -- simplified
    if (point.density !== undefined && point.density !== null) {
      const textState = {
        ...baseText,
        main: {
          label: 'Y Value',
          value: typeof point.y === 'number' ? point.y : Number(point.y),
        },
        cross: {
          label: '',
          value: '',
        },
        density: {
          label: 'Volume',
          value: point.density,
        },
      };
      return textState;
    }

    return baseText;
  }
}