import type { MaidrLayer, SmoothPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { TextState } from '@type/state';
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
    console.log('========================================');
    console.log('ViolinTrace: Constructor called - ViolinTrace is being used!');
    console.log('ViolinTrace: Layer data:', layer);
    console.log('ViolinTrace: Points data:', this.points);
    console.log('ViolinTrace: First point:', this.points[0]?.[0]);
    console.log('ViolinTrace: First point has density?', this.points[0]?.[0] && 'density' in this.points[0][0]);
    console.log('========================================');
  }

  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    console.log('========================================');
    console.log('ViolinTrace: mapToSvgElements called with selectors:', selectors);
    console.log('ViolinTrace: lineValues length:', this.lineValues?.length);
    console.log('========================================');
    
    if (!selectors || selectors.length !== this.lineValues.length) {
      console.log('ViolinTrace: Invalid selectors or lineValues length mismatch');
      return null;
    }

    const svgElements: SVGElement[][] = [];
    let allFailed = true;
    for (let r = 0; r < selectors.length; r++) {
      console.log(`ViolinTrace: Processing selector ${r}:`, selectors[r]);
      
      // For violin plots, try to find the actual rendered element
      let lineElement = Svg.selectElement(selectors[r], false);
      console.log('ViolinTrace: Initial lineElement found:', lineElement);
      
      // If selector targets defs > path, try to find the use element that references it
      if (!lineElement && selectors[r].includes('defs > path')) {
        console.log('ViolinTrace: Selector targets defs > path, looking for use element');
        // For selectors like "g[id='...'] > defs > path", look for the clipped group containing the use element
        const groupId = selectors[r].match(/g\[id='([^']+)'\]/);
        console.log('ViolinTrace: Extracted groupId:', groupId);
        if (groupId && groupId[1]) {
          const groupElement = document.querySelector(`g[id='${groupId[1]}']`) as SVGElement | null;
          console.log('ViolinTrace: Found group element:', groupElement);
          if (groupElement) {
            // Look for the clipped group containing the use element
            const clippedGroup = groupElement.querySelector('g[clip-path]') as SVGElement | null;
            console.log('ViolinTrace: Found clipped group:', clippedGroup);
            if (clippedGroup) {
              // Find the use element inside the clipped group - this is the actual rendered violin shape
              const useElement = clippedGroup.querySelector('use');
              console.log('ViolinTrace: Found use element in clipped group:', useElement);
              if (useElement) {
                // Use the use element directly instead of the defs path
                lineElement = useElement as SVGElement;
                console.log('ViolinTrace: Using use element as lineElement');
                // Reset any debugging styles - don't modify the violin shape
                console.log('ViolinTrace: Found and using use element');
              }
            } else {
              // Fallback: look for use element and use its parent
              const useElement = groupElement.querySelector('use');
              console.log('ViolinTrace: Found use element:', useElement);
              if (useElement && useElement.parentElement instanceof SVGElement) {
                lineElement = useElement.parentElement as SVGElement;
                console.log('ViolinTrace: Using use element parent as lineElement');
              }
            }
          }
        }
      }
      
      // If we still don't have a lineElement, the path is in defs and needs special handling
      // For violin plots with paths in defs, we can't directly highlight the defs path
      // Instead, we need to work with the use element or find another approach
      if (!lineElement) {
        console.log('ViolinTrace: Could not find path element for highlighting');
      }
      
      console.log('ViolinTrace: Final lineElement:', lineElement);

      // For violin plots, create circle elements for each point (like LineTrace does)
      // This avoids the issue with highlighting defs paths or use elements
      const linePointElements: SVGElement[] = [];
      if (lineElement && lineElement instanceof SVGElement) {
        // Check if this is a path in defs - if so, we need to create circles for highlighting
        if (lineElement.tagName === 'path' && lineElement.closest('defs')) {
          console.log('ViolinTrace: Path is in defs, creating circle elements for highlighting');
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
                console.log('ViolinTrace: Created circle element at', pt.svg_x, pt.svg_y, 'element:', circleElement);
              }
            }
          }
          if (linePointElements.length > 0) {
            allFailed = false;
            console.log('ViolinTrace: Created', linePointElements.length, 'circle elements for highlighting');
          }
        } else if (lineElement.tagName === 'use') {
          console.log('ViolinTrace: Found use element, making it visible for highlighting');
          // For use elements, try to make them visible and highlightable
          // Make the use element visible and add it to linePointElements
          linePointElements.push(lineElement);
          allFailed = false;
          console.log('ViolinTrace: Added use element to linePointElements');
          
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
                console.log('ViolinTrace: Created circle element at', pt.svg_x, pt.svg_y, 'element:', circleElement);
              }
            }
          }
          if (linePointElements.length > 0) {
            allFailed = false;
            console.log('ViolinTrace: Created', linePointElements.length, 'elements for highlighting');
          }
        } else {
          console.log('ViolinTrace: Skipping non-path/non-use element:', lineElement.tagName);
        }
      } else {
        console.log('ViolinTrace: No valid lineElement found for this selector');
      }

      svgElements.push(linePointElements);
      console.log('ViolinTrace: Pushed elements for this selector:', linePointElements.length, 'elements');
    }

    console.log('ViolinTrace: Final svgElements:', svgElements);
    console.log('ViolinTrace: Total elements across all selectors:', svgElements.reduce((sum, arr) => sum + arr.length, 0));
    console.log('ViolinTrace: allFailed:', allFailed);

    if (allFailed) {
      console.log('ViolinTrace: All selectors failed, returning null');
      return null;
    }
    return svgElements;
  }

  public moveOnce(direction: MovableDirection): void {
    console.log('ViolinTrace: moveOnce called with direction:', direction, 'isInitialEntry:', this.isInitialEntry);
    
    if (this.isInitialEntry) {
      console.log('ViolinTrace: Handling initial entry');
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return;
    }

    // For violin plots, disable left/right arrows completely
    if (direction === 'FORWARD' || direction === 'BACKWARD') {
      console.log('ViolinTrace: Left/right arrows disabled for violin plots');
      this.notifyOutOfBounds();
      return;
    }

    console.log('ViolinTrace: Checking if movable for direction:', direction);
    if (!this.isMovable(direction)) {
      console.log('ViolinTrace: Not movable in direction:', direction);
      this.notifyOutOfBounds();
      return;
    }

    // For violin plots, map up/down arrows to column movement along the density curve
    // This is different from the base class which maps up/down to row movement
    console.log('ViolinTrace: moveOnce called with direction:', direction);
    switch (direction) {
      case 'UPWARD':
        // Up arrow moves forward along the density curve (increase column)
        console.log('ViolinTrace: UPWARD - moving from col', this.col, 'to', this.col + 1);
        this.col += 1;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        break;
      case 'DOWNWARD':
        // Down arrow moves backward along the density curve (decrease column)
        console.log('ViolinTrace: DOWNWARD - moving from col', this.col, 'to', this.col - 1);
        this.col -= 1;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        break;
    }
  }

  public isMovable(direction: MovableDirection): boolean {
    console.log('ViolinTrace: isMovable called with direction:', direction, 'col:', this.col, 'row:', this.row);
    console.log('ViolinTrace: lineValues length:', this.lineValues?.[this.row]?.length);
    
    // For violin plots, disable left/right arrows completely
    if (direction === 'FORWARD' || direction === 'BACKWARD') {
      console.log('ViolinTrace: FORWARD/BACKWARD disabled');
      return false;
    }

    // For violin plots, map up/down arrows to column movement
    switch (direction) {
      case 'UPWARD':
        // Up arrow: check if we can move forward (increase column)
        const canMoveUp = this.col < this.lineValues[this.row].length - 1;
        console.log('ViolinTrace: UPWARD movable:', canMoveUp, 'col:', this.col, 'max:', this.lineValues[this.row].length - 1);
        return canMoveUp;
      case 'DOWNWARD':
        // Down arrow: check if we can move backward (decrease column)
        const canMoveDown = this.col > 0;
        console.log('ViolinTrace: DOWNWARD movable:', canMoveDown, 'col:', this.col);
        return canMoveDown;
      default:
        // Handle array-based movements (for compatibility)
        const superMovable = super.isMovable(direction);
        console.log('ViolinTrace: Using super.isMovable for direction:', direction, 'result:', superMovable);
        return superMovable;
    }
  }

  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    // For violin plots, up arrow moves forward along the density curve (rightward)
    // This navigates through the KDE density points from left to right
    console.log('ViolinTrace: moveUpRotor called - using UPWARD direction');
    this.moveOnce('UPWARD');
    return true;
  }

  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    // For violin plots, down arrow moves backward along the density curve (leftward)
    // This navigates through the KDE density points from right to left
    console.log('ViolinTrace: moveDownRotor called - using DOWNWARD direction');
    this.moveOnce('DOWNWARD');
    return true;
  }

  public moveLeftRotor(_mode?: 'lower' | 'higher'): boolean {
    // Left arrow is disabled for violin plots
    // Only up/down arrows are allowed for violin plot KDE navigation
    console.log('ViolinTrace: moveLeftRotor called - disabled for violin plots');
    return false;
  }

  public moveRightRotor(_mode?: 'lower' | 'higher'): boolean {
    // Right arrow is disabled for violin plots
    // Only up/down arrows are allowed for violin plot KDE navigation
    console.log('ViolinTrace: moveRightRotor called - disabled for violin plots');
    return false;
  }

  protected text(): TextState {
    const point = this.points[this.row][this.col];
    const baseText = super.text();

    // For violin plots, display Y value, X coordinate, and density (width)
    if (point.density !== undefined && point.density !== null) {
      // Find the min and max density values across all points
      // Filter to get unique densities (in case of duplicate points)
      const allDensities = this.points[this.row]
        .map(p => (p as any).density)
        .filter(d => d !== undefined && d !== null) as number[];
      
      // Get unique density values
      const uniqueDensities = Array.from(new Set(allDensities));
      
      const maxDensity = Math.max(...uniqueDensities);
      const minDensity = Math.min(...uniqueDensities);
      const currentDensity = (point as any).density;
      
      // Determine if current point has max or min density
      let densityLabel = 'Density';
      const tolerance = 0.0001; // Tolerance for floating point comparison
      
      const isHigh = Math.abs(currentDensity - maxDensity) < tolerance;
      const isLow = Math.abs(currentDensity - minDensity) < tolerance;
      
      if (isHigh) {
        densityLabel = 'Density - High density';
      } else if (isLow) {
        densityLabel = 'Density - Low density';
      }
      
      const textState = {
        ...baseText,
        main: {
          label: 'Y Value',
          value: point.y, // Keep as number for proper formatting
        },
        cross: {
          label: 'X Coordinate',
          value: typeof point.x === 'number' ? point.x : Number(point.x),
        },
        density: {
          label: densityLabel,
          value: currentDensity, // Density represents the width at this y-level
        },
      };
      return textState;
    }

    return baseText;
  }
}