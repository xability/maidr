import type { BoxBound, BoxBoundPoint, BoxPoint } from '@model/grammar';
import type { Maidr } from '@type/maidr';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { AbstractPlot } from '@model/plot';
import { Orientation } from '@type/plot';
import { Constant } from '@util/constant';

const LOWER_OUTLIER = 'Lower outlier(s)';
const UPPER_OUTLIER = 'Upper outlier(s)';
const MIN = 'Minimum';
const MAX = 'Maximum';
const Q1 = '25%';
const Q2 = '50%';
const Q3 = '75%';

export class BoxPlot extends AbstractPlot<number[] | number> {
  private readonly points: BoxPoint[];
  private readonly orientation: Orientation;
  private readonly sections: string[];
  readonly id: string;

  private readonly min: number;
  private readonly max: number;

  // highlight rect properties
  private plotBounds: BoxBound[] = [];
  private readonly chartOffsetLeft: number;
  private readonly chartOffsetTop: number;
  private readonly boxPointKeys = [
    'lowerOutliers',
    'min',
    'q1',
    'q2',
    'q3',
    'max',
    'upperOutliers',
  ];

  constructor(maidr: Maidr) {
    super(maidr);

    this.points = maidr.data as BoxPoint[];
    this.orientation = maidr.orientation ?? Orientation.VERTICAL;
    this.id = maidr.id;

    this.sections = [LOWER_OUTLIER, MIN, Q1, Q2, Q3, MAX, UPPER_OUTLIER];
    this.values = this.points.map(point => [
      point.lowerOutliers,
      point.min,
      point.q1,
      point.q2,
      point.q3,
      point.max,
      point.upperOutliers,
    ]);

    const flattenedValues = this.values.map(row =>
      row.flatMap(cell => (Array.isArray(cell) ? cell : [cell])),
    );
    this.min = Math.min(...flattenedValues.flat());
    this.max = Math.max(...flattenedValues.flat());

    this.row = this.values.length - 1;

    const chartBounds = document
      .getElementById(this.id)
      ?.getBoundingClientRect();
    this.chartOffsetLeft = chartBounds?.left ?? 0;
    this.chartOffsetTop = chartBounds?.top ?? 0;

    this.plotBounds = this.GetPlotBounds(maidr.selector);
  }

  public notifyStateUpdate(): void {
    super.notifyStateUpdate();
    this.UpdateRectDisplay();
  }

  protected audio(): AudioState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;

    const value = isHorizontal
      ? this.values[this.row][this.col]
      : this.values[this.col][this.row];
    const index = isHorizontal ? this.col : this.row;

    return {
      min: this.min,
      max: this.max,
      size: this.sections.length,
      index,
      value,
    };
  }

  protected braille(): BrailleState {
    return {
      empty: true,
      type: this.type,
    };
  }

  protected text(): TextState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const point = isHorizontal ? this.points[this.row] : this.points[this.col];

    const mainLabel = isHorizontal ? this.yAxis : this.xAxis;
    const section = isHorizontal
      ? this.sections[this.col]
      : this.sections[this.row];

    const crossLabel = isHorizontal ? this.xAxis : this.yAxis;
    const crossValue = isHorizontal
      ? this.values[this.row][this.col]
      : this.values[this.col][this.row];

    return {
      mainLabel,
      mainValue: point.fill,
      crossLabel,
      crossValue,
      section,
    };
  }

  /**
   * Calculates the bounding boxes for all elements in the parent element, including outliers, whiskers, and range.
   * @returns An array of bounding boxes for all elements.
   */
  GetPlotBounds(selector: string | undefined): BoxBound[] {
    const elements = document.querySelectorAll(selector ?? '*');
    const plots = Array.from(
      [...elements].flatMap(element => Array.from(element.children)),
    );
    const plotBounds: BoxBound[] = [];

    // get the initial set of elements: a parent element for all outliers, whiskers, and range segments
    const initialElemSet = plots.map(plot => this.ExtractPlotSegments(plot));

    // we build our structure based on the full set we need, and have blanks as placeholders
    // many of these overlap or are missing in the html, so now we go through and make the actual array structure we need
    // like, all outliers are in 1 set, so we have to split those out and then get the bounding boxes
    initialElemSet.forEach((plotSet) => {
      const plotBound: BoxBound = this.createBoxBound();

      // Extract 50% value from range, as we need it to set up 25 50  75
      const rangeBounds = plotSet.range.getBoundingClientRect();
      const midPointSize = this.CalcMidpointSize(plotSet.range, rangeBounds);

      // Ok now we do 25 and 75
      const midBounds = this.SetRangeBounds(
        plotBound,
        rangeBounds,
        midPointSize,
      );
      plotBound.q1 = midBounds.q1;
      plotBound.q2 = midBounds.q2;
      plotBound.q3 = midBounds.q3;

      // Handle whiskers if present
      if (plotSet.whisker) {
        const wRect = this.SetWhiskerBounds(
          plotBound,
          plotSet.whisker,
          rangeBounds,
        );
        plotBound.min = wRect.min;
        plotBound.max = wRect.max;
      }

      // Handle outliers if present
      if (plotSet.outlier) {
        const outlierBounds: BoxBound = this.GetOutlierBounds(
          plotSet.outlier,
          plotBound.q2,
        );
        plotBound.lowerOutliers = outlierBounds.lowerOutliers;
        plotBound.upperOutliers = outlierBounds.upperOutliers;
      }

      plotBounds.push(plotBound);
    });

    return plotBounds;
  }

  /**
   * Factory function to init BoxBound and BoxBoundPoint objects.
   */
  createBoxBound(): BoxBound {
    return {
      lowerOutliers: this.createBoxBoundPoint(),
      min: this.createBoxBoundPoint(),
      q1: this.createBoxBoundPoint(),
      q2: this.createBoxBoundPoint(),
      q3: this.createBoxBoundPoint(),
      max: this.createBoxBoundPoint(),
      upperOutliers: this.createBoxBoundPoint(),
    };
  }

  createBoxBoundPoint(): BoxBoundPoint {
    return {
      x: 0,
      y: 0,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
      type: '',
    };
  }

  /**
   * Extracts plot segments into an object based on their ID attributes.
   */
  private ExtractPlotSegments(plot: Element): Record<string, Element> {
    const plotSet: Record<string, Element> = {};
    Array.from(plot.children).forEach((section) => {
      const elemType = this.GetBoxplotSegmentType(
        section.getAttribute('id') || '',
      );
      plotSet[elemType] = section;
    });
    return plotSet;
  }

  private GetBoxplotSegmentType(id: string): string {
    // We look for types outlier, range (25%, 50%, 75%), and whisker segments
    // Why? because these are the unique types of objects in the svg
    // These will need to be adapted and standardized for output beyond ggplot (todo)
    let segmentType = 'outlier';
    if (id.includes('geom_crossbar')) {
      segmentType = 'range';
    } else if (id.includes('GRID')) {
      segmentType = 'whisker';
    } else if (id.includes('points')) {
      segmentType = 'outlier';
    }

    return segmentType;
  }

  /**
   * Calculates the midpoint percentage based on plot range values.
   */
  private CalcMidpointSize(range: Element, rangeBounds: DOMRect): number {
    const regex = /\d+(?:\.\d*)?|\.\d+/g;
    const midPoints = range
      .querySelector('polyline[id^="GRID"]')
      ?.getAttribute('points')
      ?.match(regex);
    const rangePoints = range
      .querySelector('polygon[id^="geom_polygon"]')
      ?.getAttribute('points')
      ?.match(regex);

    if (!midPoints || !rangePoints)
      return 0;

    let midPercent = 0;
    if (this.orientation === Orientation.VERTICAL) {
      midPercent
        = (Number.parseFloat(midPoints[1]) - Number.parseFloat(rangePoints[3]))
          / (Number.parseFloat(rangePoints[1]) - Number.parseFloat(rangePoints[3]));
    } else {
      midPercent
        = (Number.parseFloat(midPoints[0]) - Number.parseFloat(rangePoints[2]))
          / (Number.parseFloat(rangePoints[0]) - Number.parseFloat(rangePoints[2]));
    }
    midPercent = Number.isNaN(midPercent) ? 0 : midPercent;

    const midSize
      = this.orientation === Orientation.VERTICAL
        ? rangeBounds.height * midPercent
        : rangeBounds.width * midPercent;

    return midSize;
  }

  /**
   * Sets the bounding box values for the range segment (25%, 50%, 75%).
   */
  private SetRangeBounds(
    plotBound: BoxBound,
    rangeBounds: DOMRect,
    midPointsize: number,
  ): BoxBound {
    plotBound.q1.bottom
      = plotBound.q2.bottom
      = plotBound.q3.bottom
        = rangeBounds.bottom;
    plotBound.q1.top = plotBound.q2.top = plotBound.q3.top = rangeBounds.top;
    plotBound.q1.left
      = plotBound.q2.left
      = plotBound.q3.left
        = rangeBounds.left;
    plotBound.q1.right
      = plotBound.q2.right
      = plotBound.q3.right
        = rangeBounds.right;

    plotBound.q1.type = 'q1';
    plotBound.q2.type = 'q2';
    plotBound.q3.type = 'q3';

    if (this.orientation === Orientation.VERTICAL) {
      plotBound.q1.height = midPointsize;
      plotBound.q1.top = plotBound.q1.bottom - midPointsize;
      plotBound.q1.width = rangeBounds.width;

      plotBound.q2.height = 0;
      plotBound.q2.top = rangeBounds.bottom - midPointsize;
      plotBound.q2.width = rangeBounds.width;

      plotBound.q3.height = rangeBounds.height - midPointsize;
      plotBound.q3.bottom = plotBound.q2.top;
      plotBound.q3.width = rangeBounds.width;
    } else {
      plotBound.q1.width = midPointsize;
      plotBound.q1.height = rangeBounds.height;

      plotBound.q2.width = 0;
      plotBound.q2.left = rangeBounds.left + midPointsize;
      plotBound.q2.height = rangeBounds.height;

      plotBound.q3.width = rangeBounds.width - midPointsize;
      plotBound.q3.left = plotBound.q2.left;
      plotBound.q3.height = rangeBounds.height;
    }

    return plotBound;
  }

  /**
   * Sets the bounding box values for whiskers if they exist.
   */
  private SetWhiskerBounds(
    plotBound: BoxBound,
    whisker: Element,
    rangeBounds: DOMRect,
  ): BoxBound {
    const wBound: BoxBound = this.createBoxBound(); // return value
    let wRectMin: DOMRect | undefined;
    let wRecMax: DOMRect | undefined;

    // get children of whisker, which are the actual whisker lines, get the rect
    const wChildren = Array.from(whisker.children);
    if (wChildren.length === 0) {
      return wBound;
    } else if (wChildren.length === 1) {
      // which one is it?
      if (this.orientation === Orientation.VERTICAL) {
        if (wChildren[0].getBoundingClientRect().bottom > rangeBounds.bottom) {
          wRectMin = wChildren[0].getBoundingClientRect();
        } else {
          wRecMax = wChildren[0].getBoundingClientRect();
        }
      } else {
        if (wChildren[0].getBoundingClientRect().left < rangeBounds.left) {
          wRectMin = wChildren[0].getBoundingClientRect();
        } else {
          wRecMax = wChildren[0].getBoundingClientRect();
        }
      }
    } else {
      // we have both
      wRecMax = wChildren[0].getBoundingClientRect();
      wRectMin = wChildren[1].getBoundingClientRect();
    }

    // assign rect values to the return whisker object
    // min
    if (wRectMin) {
      wBound.min.bottom = wRectMin.bottom;
      wBound.min.top = wRectMin.top;
      wBound.min.left = wRectMin.left;
      wBound.min.right = wRectMin.right;
      wBound.min.height = wRectMin.height;
      wBound.min.width = wRectMin.width;
      wBound.min.type = 'min';
    }

    // max
    if (wRecMax) {
      wBound.max.bottom = wRecMax.bottom;
      wBound.max.top = wRecMax.top;
      wBound.max.left = wRecMax.left;
      wBound.max.right = wRecMax.right;
      wBound.max.height = wRecMax.height;
      wBound.max.width = wRecMax.width;
      wBound.max.type = 'max';
    }

    return wBound;
  }

  /**
   * Sets the bounding box values for outliers if they exist.
   */
  private GetOutlierBounds(outlier: Element, q2: BoxBoundPoint): BoxBound {
    const outlierElems = Array.from(outlier.children);
    const returnBound: BoxBound = this.createBoxBound();
    let lowerOutliers: BoxBoundPoint = this.createBoxBoundPoint();
    let upperOutliers: BoxBoundPoint = this.createBoxBoundPoint();

    outlierElems.forEach((elem) => {
      const outlierRect = elem.getBoundingClientRect();

      // is this an upper or lower outlier?
      let outlierType: string = '';
      if (this.orientation === Orientation.VERTICAL) {
        if (outlierRect.top > q2.top) {
          outlierType = 'lowerOutliers';
        } else {
          outlierType = 'upperOutliers';
        }
      } else {
        if (outlierRect.left < q2.left) {
          outlierType = 'lowerOutliers';
        } else {
          outlierType = 'upperOutliers';
        }
      }

      // set the bounds
      if (outlierType === 'lowerOutliers') {
        if (lowerOutliers.type === '') {
          // if first time, set the bounds
          lowerOutliers.y = outlierRect.y;
          lowerOutliers.x = outlierRect.x;
          lowerOutliers.bottom = outlierRect.bottom;
          lowerOutliers.top = outlierRect.top;
          lowerOutliers.left = outlierRect.left;
          lowerOutliers.right = outlierRect.right;
          lowerOutliers.height = outlierRect.height;
          lowerOutliers.width = outlierRect.width;
          lowerOutliers.type = 'lowerOutliers';
        } else {
          // other times, expand the bounds
          lowerOutliers = this.ExpandOutlierBounds(lowerOutliers, outlierRect);
        }
      } else {
        if (upperOutliers.type === '') {
          // if first time, set the bounds
          upperOutliers.y = outlierRect.y;
          upperOutliers.x = outlierRect.x;
          upperOutliers.bottom = outlierRect.bottom;
          upperOutliers.top = outlierRect.top;
          upperOutliers.left = outlierRect.left;
          upperOutliers.right = outlierRect.right;
          upperOutliers.height = outlierRect.height;
          upperOutliers.width = outlierRect.width;
          upperOutliers.type = 'upperOutliers';
        } else {
          // other times, expand the bounds
          upperOutliers = this.ExpandOutlierBounds(upperOutliers, outlierRect);
        }
      }
    });

    returnBound.lowerOutliers = lowerOutliers;
    returnBound.upperOutliers = upperOutliers;

    return returnBound;
  }

  private ExpandOutlierBounds(
    bound: BoxBoundPoint,
    rect: DOMRect,
  ): BoxBoundPoint {
    // expand the bounds to include the new rect
    bound.bottom = Math.max(bound.bottom, rect.bottom);
    bound.top = Math.min(bound.top, rect.top);
    bound.left = Math.min(bound.left, rect.left);
    bound.right = Math.max(bound.right, rect.right);
    bound.height = bound.bottom - bound.top;
    bound.width = bound.right - bound.left;
    return bound;
  }

  /**
   * Creates a visual outline using the given bounding points.
   */
  private UpdateRectDisplay(): void {
    document.getElementById(Constant.HIGHLIGHT_RECT_ID)?.remove();

    let plotIndex: number;
    let secIndex: number;
    if (this.orientation === Orientation.VERTICAL) {
      plotIndex = this.col;
      secIndex = this.row;
    } else {
      plotIndex = this.row;
      secIndex = this.col;
    }

    if (this.plotBounds) {
      const key = this.boxPointKeys[secIndex] as keyof BoxBound;
      const currentBound: BoxBoundPoint = this.plotBounds[plotIndex][key];

      if (currentBound.type !== '' && currentBound.type !== 'blank') {
        const x: number
          = currentBound.left - Constant.RECT_PADDING - this.chartOffsetLeft;
        const width: number = currentBound.width + Constant.RECT_PADDING * 2;
        const y: number
          = currentBound.top - Constant.RECT_PADDING - this.chartOffsetTop;
        const height: number = currentBound.height + Constant.RECT_PADDING * 2;

        const svgns = 'http://www.w3.org/2000/svg';
        const rect = document.createElementNS(svgns, 'rect');

        rect.setAttribute('id', Constant.HIGHLIGHT_RECT_ID);
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(width));
        rect.setAttribute('height', String(height));
        rect.setAttribute('stroke', Constant.DEFAULT_HIGHLIGHT_COLOR);
        rect.setAttribute('stroke-width', String(Constant.RECT_STROKE_WIDTH));
        rect.setAttribute('fill', 'none');

        document.getElementById(this.id)?.appendChild(rect);
      }
    }
  }
}
