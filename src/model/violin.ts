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
    console.log('ViolinTrace: Constructor called - ViolinTrace is being used!');
    console.log('ViolinTrace: Layer data:', layer);
    console.log('ViolinTrace: Points data:', this.points);
  }

  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    console.log('ViolinTrace: mapToSvgElements called with selectors:', selectors);
    
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
                // Get the path element that the use element references
                const href = useElement.getAttribute('href') || useElement.getAttribute('xlink:href');
                console.log('ViolinTrace: Use element href:', href);
                if (href) {
                  const pathId = href.replace('#', '');
                  // Try multiple ways to find the path element
                  let pathElement = document.getElementById(pathId) as SVGElement | null;
                  if (!pathElement) {
                    // Try querySelector as fallback
                    pathElement = document.querySelector(`#${pathId}`) as SVGElement | null;
                  }
                  if (!pathElement) {
                    // Try to find it in the same group
                    pathElement = groupElement.querySelector(`#${pathId}`) as SVGElement | null;
                  }
                  if (!pathElement) {
                    // Try to find it in the entire document
                    pathElement = groupElement.closest('svg')?.querySelector(`#${pathId}`) as SVGElement | null;
                  }
                  console.log('ViolinTrace: Found referenced path element:', pathElement);
                  if (pathElement) {
                    lineElement = pathElement;
                    console.log('ViolinTrace: Using referenced path element as lineElement');
                  }
                }
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

      // For violin plots, we need to find the actual rendered element for highlighting
      const linePointElements: SVGElement[] = [];
      if (lineElement && lineElement instanceof SVGElement) {
        // Check if this path is in defs - if so, we need to find the use element
        if (lineElement.tagName === 'path') {
          const isInDefs = lineElement.closest('defs') !== null;
          
          // Find the actual rendered element (use element for defs paths, or the path itself)
          let actualElement: SVGElement | null = null;
          if (isInDefs) {
            console.log('ViolinTrace: Path is in defs, finding use element');
            const pathId = lineElement.getAttribute('id');
            if (pathId) {
              // Fallback: query all use elements and check attributes
              // This is necessary because IDs starting with numbers are not valid CSS selectors
              const allUseElements = document.querySelectorAll('use');
              for (const useEl of Array.from(allUseElements)) {
                const href = useEl.getAttribute('href') || useEl.getAttribute('xlink:href');
                if (href === `#${pathId}`) {
                  actualElement = useEl as SVGElement;
                  break;
                }
              }
              if (actualElement) {
                console.log('ViolinTrace: Found use element for defs path');
              }
            }
          } else {
            actualElement = lineElement;
          }
          
          if (actualElement) {
            // Create circle elements for each point on the violin shape, similar to LineTrace
            // Find the parent container that will hold the circles
            const container = actualElement.closest('g[clip-path]') || actualElement.parentElement;
            if (container) {
              for (const point of this.points[r]) {
                // For violin plots, points have svg_x and svg_y properties
                const smoothPoint = point as any;
                if (smoothPoint.svg_x !== undefined && smoothPoint.svg_y !== undefined) {
                  const circle = Svg.createCircleElement(smoothPoint.svg_x, smoothPoint.svg_y, actualElement);
                  linePointElements.push(circle);
                }
              }
              allFailed = false;
              console.log('ViolinTrace: Created', linePointElements.length, 'circle elements for highlighting');
            }
          } else {
            console.log('ViolinTrace: Could not find actual rendered element for path');
          }
        } else {
          console.log('ViolinTrace: Skipping non-path element:', lineElement.tagName);
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

    console.log('ViolinTrace: text() called with point:', point);

    // For violin plots, display Y value, X coordinate, and density (width)
    if (point.density !== undefined && point.density !== null) {
      // Find the min and max density values across all points
      const allDensities = this.points[this.row]
        .map(p => (p as any).density)
        .filter(d => d !== undefined && d !== null) as number[];
      
      const maxDensity = Math.max(...allDensities);
      const minDensity = Math.min(...allDensities);
      const currentDensity = (point as any).density;
      
      console.log('ViolinTrace: Density check - current:', currentDensity, 'max:', maxDensity, 'min:', minDensity);
      console.log('ViolinTrace: All densities:', allDensities);
      
      // Determine if current point has max or min density
      let densityLabel = 'Width (Density)';
      const tolerance = 0.0001; // Tolerance for floating point comparison
      
      const isHigh = Math.abs(currentDensity - maxDensity) < tolerance;
      const isLow = Math.abs(currentDensity - minDensity) < tolerance;
      
      console.log('ViolinTrace: isHigh:', isHigh, 'isLow:', isLow, 'diff from max:', Math.abs(currentDensity - maxDensity), 'diff from min:', Math.abs(currentDensity - minDensity));
      
      if (isHigh) {
        densityLabel = 'Width (Density) - High density';
        console.log('ViolinTrace: High density detected');
      } else if (isLow) {
        densityLabel = 'Width (Density) - Low density';
        console.log('ViolinTrace: Low density detected');
      }
      
      const textState = {
        ...baseText,
        main: {
          label: 'Y Value',
          value: point.y.toFixed(2),
        },
        cross: {
          label: 'X Coordinate',
          value: typeof point.x === 'number' ? point.x.toFixed(4) : String(point.x),
        },
        density: {
          label: densityLabel,
          value: currentDensity.toFixed(4), // Density represents the width at this y-level
        },
      };
      console.log('ViolinTrace: returning text state:', textState);
      console.log('ViolinTrace: Density label being returned:', densityLabel);
      return textState;
    }

    console.log('ViolinTrace: no density data, returning base text');
    return baseText;
  }
}