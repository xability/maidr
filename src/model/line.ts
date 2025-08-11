import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { Movable, Node } from '@type/movable';
import type { AudioState, AutoplayState, BrailleState, TextState } from '@type/state';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGraph } from './movable';

const TYPE = 'Type';
const SVG_PATH_LINE_POINT_REGEX = /[ML]\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)/g;

export class LineTrace extends AbstractTrace {
  protected readonly movable: Movable;

  private readonly points: LinePoint[][];
  protected readonly lineValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;

  protected readonly min: number[];
  protected readonly max: number[];

  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as LinePoint[][];
    this.lineValues = this.points.map(row => row.map(point => Number(point.y)));

    this.min = this.lineValues.map(row => Math.min(...row));
    this.max = this.lineValues.map(row => Math.max(...row));

    this.highlightValues = this.mapToSvgElements(layer.selectors as string[]);
    this.movable = new MovableGraph(this.buildGraph());
  }

  public dispose(): void {
    this.points.length = 0;

    this.min.length = 0;
    this.max.length = 0;

    super.dispose();
  }

  private buildGraph(): (Node | null)[][] {
    const rowCount = this.points.length;
    if (rowCount === 0) {
      return new Array<Array<Node | null>>();
    }

    const maxCols = Math.max(0, ...this.points.map(row => row.length));
    const graph: (Node | null)[][] = this.points.map(row =>
      row.map(() => ({ up: null, down: null, left: null, right: null, top: null, bottom: null, start: null, end: null }))
    );

    for (let c = 0; c < maxCols; c++) {
      const pointsAtCol = this.points
        .map((row, idx) => ({ y: row[c]?.y, row: idx }))
        .filter(p => p.y !== undefined);
      if (pointsAtCol.length === 0) {
        continue;
      }

      const sortedPoints = [...pointsAtCol].sort((a, b) => a.y - b.y);
      const bottom = { row: sortedPoints[0].row, col: c };
      const top = { row: sortedPoints[sortedPoints.length - 1].row, col: c };
      for (let i = 0; i < sortedPoints.length; i++) {
        const { row } = sortedPoints[i];
        const node = graph[row][c];
        if (!node) {
          continue;
        }

        i > 0 && (node.down = { row: sortedPoints[i - 1].row, col: c });
        i < sortedPoints.length - 1 && (node.up = { row: sortedPoints[i + 1].row, col: c });
        node.bottom = bottom;
        node.top = top;
      }
    }

    for (let r = 0; r < rowCount; r++) {
      const start = this.points[r].length > 0 ? { row: r, col: 0 } : null;
      const end = this.points[r].length > 0
        ? { row: r, col: this.points[r].length - 1 }
        : null;

      for (let c = 0; c < this.points[r].length; c++) {
        const node = graph[r][c];
        if (!node) {
          continue;
        }

        c > 0 && (node.left = { row: r, col: c - 1 });
        c < this.points[r].length - 1 && (node.right = { row: r, col: c + 1 });
        node.start = start;
        node.end = end;
      }
    }

    return graph;
  }

  protected audio(): AudioState {
    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: this.points[this.row].length,
      index: this.col,
      group: this.row,
      value: this.points[this.row][this.col].y,
    };
  }

  protected braille(): BrailleState {
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
    const fillData = point.fill
      ? { fill: { label: TYPE, value: point.fill } }
      : {};

    return {
      main: { label: this.xAxis, value: this.points[this.row][this.col].x },
      cross: { label: this.yAxis, value: this.points[this.row][this.col].y },
      ...fillData,
    };
  }

  protected autoplay(): AutoplayState {
    return {
      UPWARD: this.lineValues.length,
      DOWNWARD: this.lineValues.length,
      FORWARD: this.lineValues[this.row].length,
      BACKWARD: this.lineValues[this.row].length,
    };
  }

  private mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    if (!selectors || selectors.length !== this.lineValues.length) {
      return null;
    }

    const svgElements = new Array<Array<SVGElement>>();
    for (let r = 0; r < selectors.length; r++) {
      const lineElement = Svg.selectElement(selectors[r], false);
      if (!lineElement) {
        return null;
      }

      const coordinates = new Array<LinePoint>();
      if (lineElement instanceof SVGPathElement) {
        const pathD = lineElement.getAttribute(Constant.D) || Constant.EMPTY;
        let match = SVG_PATH_LINE_POINT_REGEX.exec(pathD);
        while (match !== null) {
          coordinates.push({ x: Number.parseFloat(match[1]), y: Number.parseFloat(match[3]) });
          match = SVG_PATH_LINE_POINT_REGEX.exec(pathD);
        }
      } else if (lineElement instanceof SVGPolylineElement) {
        const pointsAttr = lineElement.getAttribute(Constant.POINTS) || Constant.EMPTY;
        const strCoords = pointsAttr.split(/\s+/).filter(Boolean);
        for (const coordinate of strCoords) {
          const [x, y] = coordinate.split(Constant.COMMA);
          coordinates.push({ x: Number.parseFloat(x), y: Number.parseFloat(y) });
        }
      }
      if (coordinates.length !== this.lineValues[r].length) {
        return null;
      }

      const linePointElements = new Array<SVGElement>();
      for (const coordinate of coordinates) {
        if (Number.isNaN(coordinate.x) || Number.isNaN(coordinate.y)) {
          return null;
        }
        linePointElements.push(Svg.createCircleElement(coordinate.x, coordinate.y, lineElement));
      }
      svgElements.push(linePointElements);
    }

    return svgElements;
  }
}
