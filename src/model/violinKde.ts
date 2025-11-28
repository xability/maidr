import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';
import { SmoothTrace } from './smooth';

const SVG_PATH_LINE_POINT_REGEX = /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;

/**
 * Specialized trace for violin plot KDE layers.
 * Overrides navigation so that:
 * - Left/Right arrows switch between violins (row changes)
 * - Up/Down arrows traverse along the curve (col changes)
 */
export class ViolinKdeTrace extends SmoothTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
  }

  public isMovable(direction: MovableDirection): boolean {
    // Swapped navigation for violin plots:
    // - FORWARD/BACKWARD check row bounds (switch between violins)
    // - UPWARD/DOWNWARD check col bounds (traverse along curve)
    switch (direction) {
      case 'FORWARD':
        return this.row < this.points.length - 1;
      case 'BACKWARD':
        return this.row > 0;
      case 'UPWARD':
        return this.col < this.points[this.row].length - 1;
      case 'DOWNWARD':
        return this.col > 0;
      default:
        return false;
    }
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

    // Swapped navigation for violin plots:
    // - FORWARD/BACKWARD (Left/Right) switch between violins (change row)
    // - UPWARD/DOWNWARD (Up/Down) traverse along the curve (change col)
    switch (direction) {
      case 'FORWARD':
        // Move to next violin (next row)
        if (this.row < this.points.length - 1) {
          const nextRow = this.row + 1;
          // Use the same column index if valid, otherwise use the last column
          const maxCol = this.points[nextRow].length - 1;
          this.row = nextRow;
          this.col = Math.min(this.col, maxCol);
          this.notifyStateUpdate();
        } else {
          this.notifyOutOfBounds();
        }
        break;

      case 'BACKWARD':
        // Move to previous violin (previous row)
        if (this.row > 0) {
          const prevRow = this.row - 1;
          // Use the same column index if valid, otherwise use the last column
          const maxCol = this.points[prevRow].length - 1;
          this.row = prevRow;
          this.col = Math.min(this.col, maxCol);
          this.notifyStateUpdate();
        } else {
          this.notifyOutOfBounds();
        }
        break;

      case 'UPWARD':
      case 'DOWNWARD':
        // Move along the curve of the current violin (change col)
        if (direction === 'UPWARD') {
          if (this.col < this.points[this.row].length - 1) {
            this.col += 1;
            this.notifyStateUpdate();
          } else {
            this.notifyOutOfBounds();
          }
        } else {
          // DOWNWARD
          if (this.col > 0) {
            this.col -= 1;
            this.notifyStateUpdate();
          } else {
            this.notifyOutOfBounds();
          }
        }
        break;
    }
  }


  /**
   * Maps selectors to SVG elements for violin KDE layers.
   * Supports both old format (single pattern selector) and new format (one selector per violin).
   * Each selector corresponds to one row in the points array.
   */
  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    if (!selectors || selectors.length === 0) {
      return null;
    }

    const elementsByViolin: SVGElement[][] = [];
    let allFailed = true;

    // Handle both formats:
    // 1. New format: one selector per violin (selectors.length === points.length)
    // 2. Old format: single pattern selector (selectors.length === 1)
    const isNewFormat = selectors.length === this.points.length;

    for (let r = 0; r < this.points.length; r++) {
      const violinElements: SVGElement[] = [];
      const dataPoints = this.points[r] as LinePoint[];
      
      // Get the selector for this violin
      let selector: string | undefined;
      if (isNewFormat) {
        // New format: use the selector at index r
        selector = selectors[r];
      } else {
        // Old format: use the single pattern selector (will match all violins)
        selector = selectors[0];
      }
      
      if (!selector) {
        elementsByViolin.push([]);
        continue;
      }

      // Try to find the SVG element(s) using the selector
      // Selector format: "g[id='...'] path, g[id='...'] use" (matches both path and use)
      const matchedElements = Svg.selectAllElements(selector, false);
      
      let primaryElement: SVGElement | null = null;
      
      if (matchedElements.length > 0) {
        // Filter to get <use> elements first (the rendered ones)
        const useElements = matchedElements.filter(el => el instanceof SVGUseElement);
        const pathElements = matchedElements.filter(el => el instanceof SVGPathElement);
        
        // Prefer <use> elements, fall back to <path>
        const candidates = useElements.length > 0 ? useElements : pathElements;
        
        if (candidates.length > 0) {
          // For new format (one selector per violin), should only be one element
          // For old format (pattern selector), select element at index r
          primaryElement = candidates[isNewFormat ? 0 : (r < candidates.length ? r : 0)];
        }
      }
      
      // Fallback: if selector didn't match, try finding by group ID pattern
      if (!primaryElement && isNewFormat) {
        const groupIdMatch = selector.match(/g\[id=['"]([^'"]+)['"]\]/);
        if (groupIdMatch) {
          const groupId = groupIdMatch[1];
          const groupElement = document.querySelector(`g[id='${groupId}']`);
          if (groupElement) {
            const useEl = groupElement.querySelector('use');
            const pathEl = groupElement.querySelector('defs > path');
            primaryElement = (useEl || pathEl) as SVGElement;
          }
        }
      }

      if (primaryElement && dataPoints) {
        // Use the data points (which have svg_x/svg_y) to create circle elements for highlighting
        for (const point of dataPoints) {
          // Check for svg_x/svg_y first (from SmoothPoint), then fall back to x/y
          let x: number;
          let y: number;
          
          if ('svg_x' in point && 'svg_y' in point) {
            x = (point as any).svg_x;
            y = (point as any).svg_y;
          } else if (typeof point.x === 'number' && typeof point.y === 'number') {
            x = point.x;
            y = point.y;
          } else {
            continue;
          }
          
          if (!Number.isNaN(x) && !Number.isNaN(y)) {
            violinElements.push(
              Svg.createCircleElement(x, y, primaryElement!),
            );
          }
        }

        if (violinElements.length > 0) {
          allFailed = false;
        }
      }

      elementsByViolin.push(violinElements);
    }

    return allFailed ? null : elementsByViolin;
  }
}

