import type { MaidrLayer } from '@type/grammar';
import type { AudioState, TextState } from '@type/state';
import type { MovableDirection } from '@type/movable';
import { Svg } from '@util/svg';
import { LineTrace } from './line';

export class SmoothTrace extends LineTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
  }

  public moveToXValue(xValue: number): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    const points = this.points;
    if (!points || !points.length)
      return false;

    const success = this.navigationService.moveToXValueInPoints(
      points,
      xValue,
      this.moveToIndex.bind(this),
    );

    if (success) {
      this.notifyStateUpdate();
    }
    return success;
  }

  protected audio(): AudioState {
    const rowYValues = this.lineValues[this.row];
    const col = this.col;

    const getY = (i: number): number =>
      rowYValues[Math.max(0, Math.min(i, rowYValues.length - 1))];

    const prev = col > 0 ? getY(col - 1) : getY(col);
    const curr = getY(col);
    const next = col < rowYValues.length - 1 ? getY(col + 1) : getY(col);

    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: rowYValues.length,
      index: col,
      value: [prev, curr, next],
      isContinuous: true,
      // Only use groupIndex if there are multiple lines (actual multiline smooth plot)
      ...this.getAudioGroupIndex(),
    };
  }

  protected text(): TextState {
    const point = this.points[this.row][this.col];
    const baseText = super.text();

    // Note: Violin plots are handled by ViolinTrace class, not here
    // This method is for regular smooth plots without density data

    return baseText;
  }

  public moveToNextCompareValue(direction: string, type: 'lower' | 'higher'): boolean {
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.lineValues.length) {
      return false;
    }

    const groupValues = this.lineValues[currentGroup];
    if (!groupValues || groupValues.length === 0) {
      return false;
    }

    const currentIndex = this.col;
    // For smooth plots, map up/down to horizontal movement instead of left/right
    const step = (direction === 'up' || direction === 'right') ? 1 : -1;
    let i = currentIndex + step;

    while (i >= 0 && i < groupValues.length) {
      if (this.compareValues(groupValues[i], groupValues[currentIndex], type)) {
        this.col = i;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }

    return false;
  }

  private compareValues(a: number, b: number, type: 'lower' | 'higher'): boolean {
    if (type === 'lower') {
      return a < b;
    }
    if (type === 'higher') {
      return a > b;
    }
    return false;
  }

  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    // For smooth plots, up arrow should move forward (right) along the line
    this.moveOnce('FORWARD');
    return true;
  }

  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    // For smooth plots, down arrow should move backward (left) along the line
    this.moveOnce('BACKWARD');
    return true;
  }

  public moveLeftRotor(_mode?: 'lower' | 'higher'): boolean {
    // For smooth plots, left arrow should move backward along the line
    this.moveOnce('BACKWARD');
    return true;
  }

  public moveRightRotor(_mode?: 'lower' | 'higher'): boolean {
    // For smooth plots, right arrow should move forward along the line
    this.moveOnce('FORWARD');
    return true;
  }

  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    if (!selectors || selectors.length !== this.lineValues.length) {
      return null;
    }

    const svgElements: SVGElement[][] = [];
    let allFailed = true;
    for (let r = 0; r < selectors.length; r++) {
      const lineElement = Svg.selectElement(selectors[r], false);
      if (!lineElement) {
        svgElements.push([]);
        continue;
      }

      // For violin plots, we need to work with the path element directly
      // Check if this is a violin plot by looking for density data
      const isViolinPlot = this.points?.[r]?.some(pt => 'density' in pt);
      
      if (isViolinPlot) {
        // For violin plots, let the ViolinTrace class handle this
        // Don't interfere with violin plot rendering
        svgElements.push([]);
        allFailed = false;
      } else {
        // For regular smooth plots, create point elements along the line
        const linePointElements: SVGElement[] = [];
        const dataPoints = this.points?.[r];
        if (dataPoints) {
          for (const pt of dataPoints) {
            if (typeof pt.x === 'number' && typeof pt.y === 'number') {
              // Convert data coordinates to SVG coordinates
              // This is a simplified approach - in practice, you'd need proper coordinate transformation
              const svgX = pt.x; // This should be converted to actual SVG coordinates
              const svgY = pt.y; // This should be converted to actual SVG coordinates
              linePointElements.push(Svg.createCircleElement(svgX, svgY, lineElement));
            }
          }
        }

        if (linePointElements.length > 0) {
          allFailed = false;
        }
        svgElements.push(linePointElements);
      }
    }

    if (allFailed) {
      return null;
    }
    return svgElements;
  }
}
