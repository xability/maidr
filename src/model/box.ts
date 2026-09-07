import type { BoxplotSectionType } from '@type/boxplotSection';
import type { BoxPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Edge, LineRequest, WhiskerRequest } from '@util/svg';
import type { Dimension, NearestPoint } from './abstract';
import { BoxplotSection } from '@type/boxplotSection';
import { Orientation } from '@type/grammar';
import { Constant } from '@util/constant';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { watchViewport } from '@util/viewport';
import { AbstractTrace } from './abstract';
import { extremeStat, groupNameAt, isHigher, isLower } from './boxExtremes';
import { MovableGrid } from './movable';

/**
 * The sections a standard box carries, in navigation order.
 *
 * One rule with two callers, as `candlestickSectionsOf` is for a candlestick:
 * the trace lays its values out along these, and the live data service asks
 * where a section sits to announce a streamed box on it. They must agree — an
 * index counted off a different list names a different section, or none.
 *
 * Copied into the trace rather than held by it: `dispose()` truncates the
 * array it was given, which held by reference would empty this one.
 */
export const BOX_SECTIONS: readonly BoxplotSectionType[] = [
  BoxplotSection.LOWER_OUTLIER,
  BoxplotSection.MIN,
  BoxplotSection.Q1,
  BoxplotSection.Q2,
  BoxplotSection.Q3,
  BoxplotSection.MAX,
  BoxplotSection.UPPER_OUTLIER,
];

/**
 * Concrete implementation of a box plot trace supporting vertical and horizontal orientations.
 * Handles boxplot sections (min, Q1, Q2, Q3, max, outliers) and rotor-based navigation.
 *
 * This is a pure box plot — violin-specific behavior lives in ViolinBoxTrace.
 */
export class BoxTrace extends AbstractTrace {
  protected readonly supportsExtrema = false;
  protected readonly movable: Movable;

  private readonly points: BoxPoint[];
  private readonly boxValues: (number[] | number)[][];
  protected readonly highlightValues: (SVGElement[] | SVGElement)[][] | null;

  /**
   * The box as the chart drew it: each body, median and cap, the outliers,
   * and a whisker between each cap and its box.
   *
   * The highlight is built from edges -- the top and bottom of the box are
   * lines derived from it, because a section is what the cursor stands on.
   * Drawn from those alone a box is three stacked dashes with two more
   * floating beyond them, and nothing joins them into the shape the chart
   * has. This list is the shape, for a renderer that wants it.
   */
  private readonly geometry: SVGElement[] = [];
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  /**
   * Whether a scroll or resize has moved the boxes since they were measured.
   *
   * `highlightCenters` holds viewport coordinates, and the pointer positions
   * they are compared against are always current -- so a page, or a container
   * the chart sits in, scrolling underneath leaves every centre off by
   * however far the chart moved, and the guidance beep points at a section
   * that is no longer there. Rebuilding on the next hover rather than on the
   * event keeps a scroll itself free of layout reads.
   *
   * It starts stale, so the first hover measures rather than the constructor.
   * Measuring there is a forced layout right after the writes that inserted
   * the marks, once per trace, before the first announcement -- and a
   * keyboard reader, who is the primary audience, never asks the question.
   */
  private highlightCentersDirty = true;

  private readonly stopViewportWatch = watchViewport((): void => {
    this.highlightCentersDirty = true;
  });

  private readonly orientation: Orientation;
  private readonly sections: string[];

  private readonly min: number;
  private readonly max: number;

  /**
   * Compute box values array based on section accessors and orientation.
   * Handles the transformation from section-based to position-based layout.
   *
   * @param sectionAccessors - Array of functions that extract section values from BoxPoint
   * @returns 2D array where layout depends on orientation:
   *         - Vertical: [sections][positions]
   *         - Horizontal: [positions][sections]
   */
  private computeBoxValues(sectionAccessors: ((p: BoxPoint) => number | number[])[]): (number[] | number)[][] {
    if (this.orientation === Orientation.HORIZONTAL) {
      return this.points.map(point =>
        sectionAccessors.map(accessor => accessor(point)),
      );
    } else {
      return sectionAccessors.map(accessor =>
        this.points.map(point => accessor(point)),
      );
    }
  }

  constructor(layer: MaidrLayer) {
    super(layer);

    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    // For horizontal orientation, reverse points to match visual order (lower-left start)
    if (this.orientation === Orientation.HORIZONTAL) {
      this.points = [...(layer.data as BoxPoint[])].reverse();
    } else {
      // Copied, like the reversed branch above: `dispose()` truncates the
      // array it holds, and held by reference that would empty the caller's
      // spec, so a figure rebuilt from it came up empty.
      this.points = [...(layer.data as BoxPoint[])];
    }

    // Standard box plot sections: full Tukey structure
    const { sections, accessors } = this.buildStandardBoxDataSections();
    this.sections = sections;
    this.boxValues = this.computeBoxValues(accessors);

    const flatBoxValues = this.boxValues.map(row =>
      row.flatMap(cell => (Array.isArray(cell) ? cell : [cell])),
    );
    const filteredValues = flatBoxValues.map(row =>
      row.filter(value => !Number.isNaN(value)),
    );
    this.min = MathUtil.minFrom2D(filteredValues);
    this.max = MathUtil.maxFrom2D(filteredValues);

    this.highlightValues = this.mapToSvgElements(
      layer.selectors as BoxSelector[],
    );

    if (this.orientation === Orientation.HORIZONTAL) {
      this.highlightValues?.reverse();
    }

    // Left for the first hover to measure. `highlightCentersDirty` starts
    // true, so findNearestPoint builds them the same way it does after a
    // scroll.
    this.highlightCenters = null;
    this.movable = new MovableGrid<number[] | number>(this.boxValues, { row: 0 });
  }

  /**
   * Build data sections and accessors for standard box plots.
   * Exposes full Tukey structure including all quartiles.
   */
  private buildStandardBoxDataSections(): {
    sections: string[];
    accessors: ((p: BoxPoint) => number | number[])[];
  } {
    return {
      sections: [...BOX_SECTIONS],
      accessors: [
        (p: BoxPoint) => p.lowerOutliers,
        (p: BoxPoint) => p.min,
        (p: BoxPoint) => p.q1,
        (p: BoxPoint) => p.q2,
        (p: BoxPoint) => p.q3,
        (p: BoxPoint) => p.max,
        (p: BoxPoint) => p.upperOutliers,
      ],
    };
  }

  /**
   * Gets the description state for the box plot trace.
   * @returns The description state containing chart metadata and data table
   */
  public get description(): DescriptionState {
    // Filtered, not joined blind. `BoxPoint.z` is typed `string` but is absent
    // at runtime for the violin/box family and for any producer that names its
    // groups on the axis instead, so an unnamed chart of three boxes read
    // "Group names: undefined, undefined, undefined" — and a single unnamed
    // box read as an empty line with a stray colon.
    const groupNames = this.points
      .map(point => (point.z ?? point.fill))
      .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
      .map(name => name.trim());

    const outliers = this.points.reduce(
      (total, point) =>
        total + (point.lowerOutliers?.length ?? 0) + (point.upperOutliers?.length ?? 0),
      0,
    );

    const stats: DescriptionState['stats'] = [
      { label: 'Number of groups', value: this.points.length },
      ...(groupNames.length > 0
        ? [{ label: 'Group names', value: groupNames.join(', ') }]
        : []),
      ...this.rangeStats(),
      // Unconditional: a box plot always draws whiskers, so "Outliers: 0" is a
      // reading about the data rather than an absence of it.
      { label: 'Outliers', value: outliers },
    ];

    // Both the headers and the cells walk `this.sections`, so every section the
    // user can navigate to — the outliers included — gets a column, and the two
    // stay aligned if the section list ever changes.
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    // The authored label for whichever axis carries the categories, read off
    // the layer rather than through `this.xAxis` so the 'X'/'Y' placeholders
    // `named()` substitutes do not become a column heading.
    const categorical = isHorizontal
      ? this.layer.axes?.y?.label
      : this.layer.axes?.x?.label;
    const headers = [categorical?.trim() ? categorical.trim() : 'Group', ...this.sections];

    const rows: DescriptionState['dataTable']['rows'] = this.points.map((point, pointIdx) => {
      const sectionValues = this.sections.map((_, sectionIdx) => {
        const value = isHorizontal
          ? this.boxValues[pointIdx]?.[sectionIdx]
          : this.boxValues[sectionIdx]?.[pointIdx];
        // Outlier sections hold an array, which travels on unjoined so the
        // description service can round each value before joining them.
        return value ?? '';
      });
      return [groupNameAt(this.points, pointIdx), ...sectionValues];
    });

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  /**
   * Builds the two range rows of the summary.
   *
   * Every box carries its own whisker ends, so a single chart-wide Min/Max pair
   * reads as though a chart of several boxes had one minimum and one maximum. A
   * lone group reports its whisker ends plainly; several report each extreme
   * attributed to the group it came from, and the per-group breakdown is left
   * to the data table below.
   *
   * These are whisker ends, not the trace-wide `min`/`max` used for
   * sonification: those fold the outliers in, which would contradict the
   * Minimum and Maximum columns of the very table underneath.
   */
  private rangeStats(): DescriptionState['stats'] {
    // Nothing to describe, and `extremeStat`'s singular branch would otherwise
    // emit "Minimum: missing" and "Maximum: missing" for a chart with no boxes
    // at all.
    if (this.points.length === 0) {
      return [];
    }

    const single = this.points.length === 1;
    return [
      extremeStat(
        this.points,
        { single: 'Minimum', grouped: 'Lowest minimum' },
        p => p.min,
        isLower,
      ),
      // The median and the spread between the quartiles are the statistics a
      // box plot is drawn for, and they reached the description only as table
      // columns — so a reader had to walk the table to learn what the chart
      // was about.
      ...(single
        ? [
            { label: 'Median', value: this.points[0].q2 },
            {
              label: 'Interquartile range',
              value: MathUtil.spannedOrMissing(this.points[0].q1, this.points[0].q3),
            },
          ]
        : [
            extremeStat(
              this.points,
              { single: 'Median', grouped: 'Lowest median' },
              p => p.q2,
              isLower,
            ),
            extremeStat(
              this.points,
              { single: 'Median', grouped: 'Highest median' },
              p => p.q2,
              isHigher,
            ),
          ]),
      extremeStat(
        this.points,
        { single: 'Maximum', grouped: 'Highest maximum' },
        p => p.max,
        isHigher,
      ),
    ];
  }

  public override dispose(): void {
    this.stopViewportWatch();

    this.points.length = 0;
    this.sections.length = 0;
    super.dispose();
  }

  public override moveToIndex(row: number, col: number): boolean {
    return super.moveToIndex(row, col);
  }

  protected get values(): (number[] | number)[][] {
    return this.boxValues;
  }

  protected get audio(): AudioState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const value = this.boxValues[this.row][this.col];
    const index = isHorizontal ? this.col : this.row;

    const panning = Array.isArray(value)
      ? value.length === 0 ? index : value[value.length - 1] - this.min
      : Number.isNaN(value) ? index : value - this.min;
    return {
      freq: {
        min: this.min,
        max: this.max,
        raw: this.boxValues[this.row][this.col],
      },
      // Stereo position follows the on-screen x: on a vertical layout that is
      // the box (the column), not the section (the row) being climbed.
      panning: {
        x: isHorizontal ? panning : this.col,
        y: isHorizontal ? this.row : panning,
        rows: isHorizontal ? this.boxValues.length : this.max - this.min,
        cols: isHorizontal ? this.max - this.min : (this.boxValues[this.row]?.length ?? 1),
      },
    };
  }

  protected get braille(): BrailleState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const row = isHorizontal ? this.row : this.col;
    const col = isHorizontal ? this.col : this.row;

    return {
      empty: false,
      id: this.id,
      values: this.points,
      min: this.min,
      max: this.max,
      row,
      col,
    };
  }

  protected get text(): TextState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const point = isHorizontal ? this.points[this.row] : this.points[this.col];

    const mainLabel = isHorizontal ? this.yAxis : this.xAxis;
    const section = isHorizontal
      ? this.sections[this.col]
      : this.sections[this.row];

    const crossLabel = isHorizontal ? this.xAxis : this.yAxis;
    const crossValue = this.boxValues[this.row][this.col];

    return {
      main: { label: mainLabel, value: point.z },
      cross: { label: crossLabel, value: crossValue },
      section,
      mainAxis: isHorizontal ? 'y' : 'x',
      crossAxis: isHorizontal ? 'x' : 'y',
    };
  }

  protected get dimension(): Dimension {
    // boxValues is orientation-normalized (row = navigation row, col =
    // navigation col), so rows/cols map directly to its shape.
    return {
      rows: this.boxValues.length,
      cols: this.boxValues[this.row]?.length ?? 0,
    };
  }

  private mapToSvgElements(
    selectors: BoxSelector[] | undefined,
  ): (SVGElement[] | SVGElement)[][] | null {
    if (!selectors || selectors.length !== this.points.length) {
      return null;
    }

    const isVertical = this.orientation === Orientation.VERTICAL;
    const svgElements = new Array<Array<SVGElement[] | SVGElement>>();

    if (isVertical) {
      for (let i = 0; i < this.sections.length; i++) {
        svgElements.push(Array.from({ length: selectors.length }));
      }
    }

    // Phase 1: Collect all original elements without cloning (prevents nth-child() DOM shifts)
    const originals: Array<{
      lowerOutliers: SVGElement[];
      upperOutliers: SVGElement[];
      min: SVGElement | null;
      max: SVGElement | null;
      iq: SVGElement | null;
      q2: SVGElement | null;
      q1Direct: SVGElement | null;
      q3Direct: SVGElement | null;
    }> = [];

    selectors.forEach((selector) => {
      const lowerOutliersOriginals = selector.lowerOutliers?.flatMap(s =>
        Svg.selectAllElements(s, false),
      ) ?? [];
      const upperOutliersOriginals = selector.upperOutliers?.flatMap(s =>
        Svg.selectAllElements(s, false),
      ) ?? [];

      const minOriginal = Svg.selectElement(selector.min, false);
      const maxOriginal = Svg.selectElement(selector.max, false);
      const iqOriginal = Svg.selectElement(selector.iq, false);
      const q2Original = Svg.selectElement(selector.q2, false);

      // Direct Q1/Q3 selectors bypass iq edge derivation (used by Plotly)
      const q1DirectOriginal = selector.q1 ? Svg.selectElement(selector.q1, false) : null;
      const q3DirectOriginal = selector.q3 ? Svg.selectElement(selector.q3, false) : null;

      originals.push({
        lowerOutliers: lowerOutliersOriginals,
        upperOutliers: upperOutliersOriginals,
        min: minOriginal,
        max: maxOriginal,
        iq: iqOriginal,
        q2: q2Original,
        q1Direct: q1DirectOriginal,
        q3Direct: q3DirectOriginal,
      });
    });

    // Phase 1.5: measure and build everything that has to be measured, for
    // every box at once. Each derived quartile edge costs a `getBBox` and a
    // `getComputedStyle` on the box, and each whisker costs a `getBBox` on
    // the box and on the cap; drawing them a box at a time put those reads
    // straight after the previous box's inserts, so the chart was laid out
    // again before each -- measured at 4 forced layouts per box, 120 over 30
    // boxes, paid again on every live-data rebuild. The same box was measured
    // four times over.
    //
    // Nothing is inserted here. The lines come back detached and Phase 2 puts
    // them in exactly where the one-at-a-time code did, because a box whose
    // body element is also one of its own parts -- Victory names one `<path>`
    // as both `iq` and `q1`, Plotly's violin box names one as `min`, `iq`,
    // `q2` and `max` -- would otherwise have its hidden clone land directly
    // after that element instead of behind the derived lines, and
    // `getAllOriginalElements` pairs clone to original by
    // `previousElementSibling`.
    const isIqrReversed = this.layer.domMapping?.iqrDirection === 'reverse';
    const edgeRequests: LineRequest[] = [];
    const edgeOwners: number[] = [];
    originals.forEach((original, boxIdx) => {
      // Direct Q1/Q3 selectors bypass iq edge derivation (used by Plotly).
      if ((original.q1Direct && original.q3Direct) || !original.iq) {
        return;
      }
      const [q1Edge, q3Edge]: [Edge, Edge] = isVertical
        ? (isIqrReversed ? ['top', 'bottom'] : ['bottom', 'top'])
        : ['left', 'right'];
      edgeRequests.push(
        { box: original.iq, edge: q1Edge },
        { box: original.iq, edge: q3Edge },
      );
      edgeOwners.push(boxIdx);
    });
    const edges = Svg.buildLineElements(edgeRequests);
    const derivedEdges = new Map<number, [SVGElement, SVGElement]>();
    edgeOwners.forEach((boxIdx, request) => {
      derivedEdges.set(boxIdx, [edges[request * 2], edges[request * 2 + 1]]);
    });

    // The lower cap's whisker then the upper cap's, box by box, which is the
    // order `getGeometryElements` reports them in and `test/model/
    // boxGeometry.test.ts` pins, and the order `offerGeometry` inserts them
    // in.
    const whiskerRequests: WhiskerRequest[] = [];
    const whiskerOwners: number[] = [];
    originals.forEach((original, boxIdx) => {
      const body = original.iq ?? original.q1Direct;
      if (body === null) {
        return;
      }
      for (const cap of [original.min, original.max]) {
        if (cap === null) {
          continue;
        }
        whiskerRequests.push({ cap, body, vertical: isVertical });
        whiskerOwners.push(boxIdx);
      }
    });
    const whiskers = Svg.buildWhiskerElements(whiskerRequests);
    const whiskersByBox: SVGElement[][] = originals.map(() => []);
    whiskerOwners.forEach((boxIdx, request) => {
      const whisker = whiskers[request];
      if (whisker !== null) {
        whiskersByBox[boxIdx].push(whisker);
      }
    });

    // Phase 2: Clone and create elements from originals (DOM queries complete)
    originals.forEach((original, boxIdx) => {
      const lowerOutliers = original.lowerOutliers.map((el) => {
        const clone = Svg.markOwned(el.cloneNode(true) as SVGElement);
        clone.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
        el.insertAdjacentElement(Constant.AFTER_END, clone);
        return clone;
      });
      const upperOutliers = original.upperOutliers.map((el) => {
        const clone = Svg.markOwned(el.cloneNode(true) as SVGElement);
        clone.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
        el.insertAdjacentElement(Constant.AFTER_END, clone);
        return clone;
      });

      const min = this.cloneElementOrEmpty(original.min);
      const max = this.cloneElementOrEmpty(original.max);
      const q2 = this.cloneElementOrEmpty(original.q2);

      // Use direct Q1/Q3 selectors if provided (Plotly: highlight entire box).
      // Otherwise, take the Q1/Q3 edges derived from iq in Phase 1.5
      // (matplotlib/seaborn) and insert them here, after this box's clones,
      // where deriving them one at a time used to insert them.
      const derived = derivedEdges.get(boxIdx);
      let q1: SVGElement;
      let q3: SVGElement;
      if (original.q1Direct && original.q3Direct) {
        q1 = this.cloneElementOrEmpty(original.q1Direct);
        q3 = this.cloneElementOrEmpty(original.q3Direct);
      } else if (derived && original.iq) {
        [q1, q3] = derived;
        Svg.insertDerived(original.iq, q1, q3);
      } else {
        q1 = Svg.createEmptyElement('line');
        q3 = Svg.createEmptyElement('line');
      }

      this.offerGeometry(original, whiskersByBox[boxIdx]);

      const sections = [lowerOutliers, min, q1, q2, q3, max, upperOutliers];

      if (isVertical) {
        sections.forEach((section, sectionIdx) => {
          svgElements[sectionIdx][boxIdx] = section;
        });
      } else {
        svgElements.push(sections);
      }
    });

    return svgElements;
  }

  /**
   * The elements whose geometry is the box as the chart drew it. Empty when
   * the selectors did not resolve, so a caller can fall back in one check.
   */
  public getGeometryElements(): SVGElement[] {
    return [...this.geometry];
  }

  /**
   * Records one box's drawn shape. See {@link geometry}.
   * @param original - The chart's own elements for the box
   * @param original.lowerOutliers - Points below the lower whisker
   * @param original.upperOutliers - Points above the upper whisker
   * @param original.min - The lower cap
   * @param original.max - The upper cap
   * @param original.iq - The box body, where the chart drew one shape for it
   * @param original.q2 - The median
   * @param original.q1Direct - The lower quartile, where the chart drew it
   * @param original.q3Direct - The upper quartile, where the chart drew it
   * @param whiskers - The box's whiskers, built in Phase 1.5 and inserted
   *   here, lower cap first; the ones that could not be drawn are already
   *   left out
   */
  private offerGeometry(
    original: {
      lowerOutliers: SVGElement[];
      upperOutliers: SVGElement[];
      min: SVGElement | null;
      max: SVGElement | null;
      iq: SVGElement | null;
      q2: SVGElement | null;
      q1Direct: SVGElement | null;
      q3Direct: SVGElement | null;
    },
    whiskers: readonly SVGElement[],
  ): void {
    const body = original.iq ?? original.q1Direct;
    const parts = new Set<SVGElement>();
    for (const part of [
      body,
      original.q1Direct,
      original.q3Direct,
      original.q2,
      original.min,
      original.max,
      ...original.lowerOutliers,
      ...original.upperOutliers,
    ]) {
      if (part !== null) {
        parts.add(part);
      }
    }
    // The whiskers go in beside the box here rather than when they were
    // built, so that on a box whose body element is also one of its own
    // parts the hidden clones stand between the body and its whiskers, as
    // they did when each whisker was drawn at this point.
    for (const whisker of whiskers) {
      if (body !== null) {
        Svg.insertDerived(body, whisker);
      }
      parts.add(whisker);
    }
    this.geometry.push(...parts);
  }

  /**
   * Clones an SVG element with hidden visibility or returns an empty element.
   */
  private cloneElementOrEmpty(original: SVGElement | null): SVGElement {
    if (!original) {
      return Svg.createEmptyElement();
    }
    const clone = Svg.markOwned(original.cloneNode(true) as SVGElement);
    clone.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
    original.insertAdjacentElement(Constant.AFTER_END, clone);
    return clone;
  }

  /**
   * Moves to the next boxplot section that matches the comparison criteria.
   */
  public override moveToNextCompareValue(direction: 'left' | 'right' | 'up' | 'down', type: 'lower' | 'higher'): boolean {
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.boxValues.length) {
      return false;
    }
    let values: any[] = [];
    let currentIndex = 0;

    if (direction === 'left' || direction === 'right') {
      values = this.boxValues[this.row];
      currentIndex = this.col;
    } else {
      values = this.boxValues.map(box => box[this.col]);
      currentIndex = this.row;
    }
    if (values.length <= 0) {
      return false;
    }

    const step = direction === 'right' || direction === 'up' ? 1 : -1;
    let i = currentIndex + step;

    while (i >= 0 && i < values.length) {
      const current_value = values[currentIndex];
      const next_value = values[i];
      if (Array.isArray(next_value) || Array.isArray(current_value)) {
        // Outlier sections hold arrays, not scalar section values; skip them
        // instead of falsely reporting a successful move.
        i += step;
        continue;
      }

      if (this.compare(next_value, current_value, type)) {
        this.set_point(direction, i);
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }
    this.notifyRotorBounds();
    return false;
  }

  /**
   * Sets the current point based on direction and index.
   */
  public set_point(direction: 'left' | 'right' | 'up' | 'down', pointIndex: number): void {
    if (direction === 'left' || direction === 'right') {
      this.col = pointIndex;
    } else {
      this.row = pointIndex;
    }
  }

  public override moveUpRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.VERTICAL) {
      this.moveOnce('UPWARD');
      return true;
    }
    return this.moveToNextCompareValue('up', mode);
  }

  public override moveDownRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.VERTICAL) {
      this.moveOnce('DOWNWARD');
      return true;
    }
    return this.moveToNextCompareValue('down', mode);
  }

  public override moveLeftRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.HORIZONTAL) {
      this.moveOnce('BACKWARD');
      return true;
    }
    return this.moveToNextCompareValue('left', mode);
  }

  public override moveRightRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.HORIZONTAL) {
      this.moveOnce('FORWARD');
      return true;
    }
    return this.moveToNextCompareValue('right', mode);
  }

  protected mapSvgElementsToCenters():
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null {
    const svgElements: (SVGElement | SVGElement[])[][] | null = this.highlightValues;

    if (!svgElements) {
      return null;
    }

    const centers: {
      x: number;
      y: number;
      row: number;
      col: number;
      element: SVGElement;
    }[] = [];
    for (let row = 0; row < svgElements.length; row++) {
      for (let col = 0; col < svgElements[row].length; col++) {
        const element = svgElements[row][col];
        const targetElement = Array.isArray(element) ? element[0] : element;
        if (targetElement) {
          const bbox = targetElement.getBoundingClientRect();
          centers.push({
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
            row,
            col,
            element: targetElement,
          });
        }
      }
    }

    return centers;
  }

  public findNearestPoint(
    x: number,
    y: number,
  ): NearestPoint | null {
    // Measure again when a scroll or resize has moved the cached centres out
    // from under the pointer coordinates they are compared against.
    if (this.highlightCentersDirty) {
      this.highlightCenters = this.mapSvgElementsToCenters();
      this.highlightCentersDirty = false;
    }

    if (!this.highlightCenters) {
      return null;
    }

    let nearestDistance = Infinity;
    let nearestIndex = -1;

    for (let i = 0; i < this.highlightCenters.length; i++) {
      const center = this.highlightCenters[i];
      const distance = Math.hypot(center.x - x, center.y - y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    if (nearestIndex === -1) {
      return null;
    }

    return {
      element: this.highlightCenters[nearestIndex].element,
      row: this.highlightCenters[nearestIndex].row,
      col: this.highlightCenters[nearestIndex].col,
      centerX: this.highlightCenters[nearestIndex].x,
      centerY: this.highlightCenters[nearestIndex].y,
    };
  }

  /**
   * Hover-driven movement is disabled for boxplots, but pointer guidance
   * still surfaces directional cues toward the nearest box element.
   *
   * Parameters retained on the signature (rather than the zero-arg form
   * TypeScript permits) so the override matches the base contract at a
   * glance.
   */
  protected override moveToNearest(
    _x: number,
    _y: number,
    _nearest: NearestPoint,
    _onCurve: boolean,
  ): void {
    // Disabled for boxplots
  }
}
