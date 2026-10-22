import type { MaidrLayer, VennPoint } from '@type/grammar';
import type { Coordinate, MovableDirection, Node } from '@type/movable';
import type {
  ChartObject,
  ChartObjectList,
  ObjectFilterOption,
  ObjectMeasure,
  ObjectSortOption,
} from '@type/objectList';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint } from './abstract';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import {
  chartOrderSort,
  counter,
  measureSort,
  measureVaries,
  nameSort,
  offerFilters,
} from '@util/objectList';
import { Svg } from '@util/svg';
import { AbstractTrace, MAX_DESCRIPTION_TABLE_ROWS, named } from './abstract';
import { MovableGraph } from './movable';

/** How many items a region's announcement names before it counts the rest. */
const NAMED_ITEMS = 5;

/**
 * How many sets a diagram may join before the object list stops offering an
 * "Including" filter for each: past it, stepping through one per set takes
 * longer than walking the regions.
 */
const INCLUDING_FILTER_LIMIT = 8;

/** The object list's measures, by id. */
const SIZE_MEASURE = 'size';
const SETS_MEASURE = 'sets';

/** The object list's filter for the sets themselves, by id. */
const SINGLE_SETS = 'single-sets';

/**
 * The id of the object list's filter for the overlaps of so many sets.
 *
 * @param count - How many sets the overlaps join
 * @returns The id
 */
function overlapsFilterId(count: number): string {
  return `overlaps-${count}`;
}

/**
 * The id of the object list's filter for every region one set takes part in.
 *
 * By the set's name rather than its index: the index follows the order the
 * regions first mention the sets in, which a rebuild of the layer can change.
 *
 * @param set - The set's name
 * @returns The id
 */
function includingFilterId(set: string): string {
  return `including:${set}`;
}

/** A region as the trace reads it. */
interface Region {
  /** The sets it is the overlap of, as indices into the trace's sets. */
  sets: number[];
  /** Its size, when the diagram gives one. */
  size?: number;
  label?: string;
  items: string[];
  /** Index into the declared array, or null for a set no region declared alone. */
  source: number | null;
}

/**
 * Trace implementation for Venn and Euler diagrams.
 *
 * **The regions are read by how many sets they join.** The first row is the
 * sets themselves; the second, every overlap of two; the third, of three, and
 * so on. Left and right walk one row; **down** goes deeper, onto the first
 * overlap the current region is part of, and **up** comes back out the way
 * the reader came down -- onto the region they went down from, while the
 * overlap they are on is made of it, and otherwise onto the first set it is
 * made of. That is the question a Venn
 * diagram answers -- what A shares with B, and what all three share -- asked
 * one arrow at a time.
 *
 * Each move announces the region's sets, its name, its size and its share of
 * the sets it joins, the items written in it, and -- on a set -- the sets it
 * overlaps.
 *
 * Pitch is the region's size when the diagram gives sizes, and otherwise how
 * many items are written in it, so a crowded overlap sounds crowded.
 */
export class VennTrace extends AbstractTrace {
  /** No extrema dialog: the largest set and overlap are in the description. */
  protected readonly supportsExtrema = false;
  protected readonly movable: MovableGraph;

  private readonly sets: string[];
  private readonly levels: Region[][];
  private readonly magnitudes: number[][];
  private readonly min: number;
  private readonly max: number;
  /** Whether any region declares a size, which decides what the pitch is. */
  private readonly sized: boolean;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * The regions the reader came down from, the most recent last, so up
   * retraces the way down instead of taking the first set an overlap is made
   * of. An overlap has a parent per set it joins, so no fixed link up can undo
   * every way down: from Data into Pipelines, Backend and Data, up used to
   * land on Backend. Each entry is checked against the region the cursor is
   * on before it is used, so a move that does not clear it cannot send up
   * somewhere the overlap is not made of.
   */
  private readonly descent: Coordinate[] = [];

  /**
   * Creates a new Venn trace.
   *
   * @param layer - The MAIDR layer carrying the regions
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const points = Array.isArray(layer.data) ? layer.data as VennPoint[] : [];
    const { sets, regions } = VennTrace.resolve(points);
    this.sets = sets;

    const byDegree: Region[][] = [];
    for (const region of regions) {
      const degree = region.sets.length - 1;
      (byDegree[degree] ??= []).push(region);
    }
    this.levels = byDegree.filter(level => level !== undefined && level.length > 0);

    this.sized = regions.some(region => region.size !== undefined);
    this.magnitudes = this.levels.map(level => level.map(region => this.magnitudeOf(region)));
    const flat = this.magnitudes.flat().filter(Number.isFinite);
    this.min = flat.length > 0 ? Math.min(0, MathUtil.safeMin(flat)) : 0;
    this.max = flat.length > 0 ? MathUtil.safeMax(flat) : 1;

    this.highlightValues = this.mapToSvgElements(layer.selectors, points.length);
    this.movable = new MovableGraph(this.buildGraph());
  }

  /**
   * Resolves the declared regions against the sets they name.
   *
   * The sets are taken in the order the regions first name them. A set named
   * only in overlaps still gets a region of its own, with no size, so the
   * first row always holds every set.
   *
   * @param points - The declared regions
   * @returns The sets, and the regions
   */
  private static resolve(points: VennPoint[]): { sets: string[]; regions: Region[] } {
    const sets: string[] = [];
    const index = (name: string | number): number => {
      const key = String(name);
      let at = sets.indexOf(key);
      if (at < 0) {
        sets.push(key);
        at = sets.length - 1;
      }
      return at;
    };

    const regions: Region[] = [];
    const seen = new Set<string>();
    points.forEach((point, source) => {
      const members = [...new Set((point.sets ?? []).map(index))].sort((a, b) => a - b);
      if (members.length === 0) {
        return;
      }
      const key = members.join(',');
      if (seen.has(key)) {
        // Only the first region of a combination is read; its drawn area is
        // left unhighlighted and uncloned (see mapToSvgElements).
        console.warn(`[VennTrace] Dropped region ${source}: the sets ${members.map(set => sets[set]).join(' & ')} were already declared by an earlier region.`);
        return;
      }
      seen.add(key);
      const label = point.label?.trim();
      regions.push({
        sets: members,
        size: typeof point.size === 'number' && Number.isFinite(point.size) ? point.size : undefined,
        label: label || undefined,
        items: (point.items ?? []).map(String),
        source,
      });
    });

    sets.forEach((_, set) => {
      if (!seen.has(String(set))) {
        regions.push({ sets: [set], items: [], source: null });
      }
    });
    // Within a row, sets in their own order and overlaps by the sets they
    // join, so A∩B comes before A∩C before B∩C.
    regions.sort((a, b) => {
      if (a.sets.length !== b.sets.length) {
        return a.sets.length - b.sets.length;
      }
      for (let at = 0; at < a.sets.length; at++) {
        if (a.sets[at] !== b.sets[at]) {
          return a.sets[at] - b.sets[at];
        }
      }
      return 0;
    });
    return { sets, regions };
  }

  /**
   * What a region sounds and reads as: its size when the diagram is sized,
   * and otherwise its item count.
   *
   * @param region - The region
   * @returns The magnitude, NaN for a sized diagram's unsized region
   */
  private magnitudeOf(region: Region): number {
    if (this.sized) {
      return region.size ?? Number.NaN;
    }
    return region.items.length;
  }

  /**
   * Wires the regions into the graph the cursor walks: left and right along
   * a row, down into the first overlap holding every set of this region, up
   * out to the first region whose sets this one contains. Up is the fallback:
   * {@link moveOnce} first retraces the way the reader came down.
   *
   * @returns The navigation graph, addressed by row and position
   */
  private buildGraph(): (Node | null)[][] {
    const contains = (outer: Region, inner: Region): boolean =>
      inner.sets.every(set => outer.sets.includes(set));
    const find = (row: number, test: (region: Region) => boolean): Coordinate | null => {
      const col = this.levels[row]?.findIndex(test) ?? -1;
      return col < 0 ? null : { row, col };
    };

    return this.levels.map((level, row) =>
      level.map((region, col) => {
        let down: Coordinate | null = null;
        for (let deeper = row + 1; deeper < this.levels.length && down === null; deeper++) {
          down = find(deeper, other => contains(other, region));
        }
        let up: Coordinate | null = null;
        for (let shallower = row - 1; shallower >= 0 && up === null; shallower--) {
          up = find(shallower, other => contains(region, other));
        }
        return {
          up,
          down,
          left: col > 0 ? { row, col: col - 1 } : null,
          right: col < level.length - 1 ? { row, col: col + 1 } : null,
          start: { row, col: 0 },
          end: { row, col: level.length - 1 },
          top: row === 0 ? null : find(0, other => contains(region, other)),
          bottom: null,
        };
      }));
  }

  /**
   * Whether up from the cursor may land on a region: one in a shallower row
   * whose sets the current region contains.
   *
   * @param at - The region
   * @returns True when it is a way back out of the current region
   */
  private isWayOut(at: Coordinate): boolean {
    const here = this.current;
    const there = this.levels[at.row]?.[at.col];
    return here !== null && there !== undefined && at.row < this.row
      && there.sets.every(set => here.sets.includes(set));
  }

  /**
   * Moves along the graph, remembering each step down so up can retrace it.
   *
   * Left and right keep the memory: from Desirable and Viable to Feasible and
   * Viable, up still returns to Viable, which both are made of; a sideways
   * step onto an overlap the remembered region is not part of falls back to
   * the first set, once {@link isWayOut} rejects it.
   *
   * @param direction - The key's direction
   * @returns Whether the cursor moved
   */
  public override moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.descent.length = 0;
      return super.moveOnce(direction);
    }
    if (direction === 'UPWARD') {
      const back = this.descent.pop();
      if (back !== undefined && this.isWayOut(back)) {
        this.movable.moveToIndex(back.row, back.col);
        this.notifyStateUpdate();
        return true;
      }
      this.descent.length = 0;
      return super.moveOnce(direction);
    }
    const from = { row: this.row, col: this.col };
    const moved = super.moveOnce(direction);
    if (moved && direction === 'DOWNWARD') {
      this.descent.push(from);
    }
    return moved;
  }

  /**
   * Control + Up returns to the set the reader started down from, while the
   * overlap they are on is made of it, and otherwise to the first set it is
   * made of.
   *
   * @param direction - The key's direction
   * @returns Whether the cursor moved
   */
  public override moveToExtreme(direction: MovableDirection): boolean {
    if (direction === 'UPWARD' && !this.isInitialEntry) {
      const first = this.descent[0];
      this.descent.length = 0;
      if (first !== undefined && first.row === 0 && this.isWayOut(first)) {
        this.movable.moveToIndex(first.row, first.col);
        this.notifyStateUpdate();
        return true;
      }
    }
    return super.moveToExtreme(direction);
  }

  /**
   * A jump -- the object list, a pointer, Go To -- forgets the way down.
   *
   * @param row - The row to go to
   * @param col - The region in it
   * @returns Whether the cursor moved
   */
  public override moveToIndex(row: number, col: number): boolean {
    this.descent.length = 0;
    return super.moveToIndex(row, col);
  }

  public override resetToInitialEntry(): void {
    this.descent.length = 0;
    super.resetToInitialEntry();
  }

  /** The region the cursor is on, when it is on one. */
  private get current(): Region | null {
    return this.levels[this.row]?.[this.col] ?? null;
  }

  /** What this chart calls a region, from the x axis when the layer names one. */
  private get regionLabel(): string {
    return named(this.layer.axes?.x?.label, t('model.vennRegion'));
  }

  /** What the sizes measure, from the y axis when the layer names one. */
  private get sizeLabel(): string {
    return named(this.layer.axes?.y?.label, t('model.vennSize'));
  }

  /**
   * A region's sets as one phrase: `Desirable`, or `Desirable and Feasible`.
   *
   * @param region - The region
   * @returns The phrase
   */
  private setsOf(region: Region): string {
    const names = region.sets.map(set => this.sets[set]);
    if (names.length === 1) {
      return names[0];
    }
    return t('model.vennAnd', {
      first: names.slice(0, -1).join(', '),
      last: names[names.length - 1],
    });
  }

  /**
   * The sets a set overlaps, by any overlap declared.
   *
   * @param set - The set's index
   * @returns The names of the sets it shares a region with
   */
  private overlapsOf(set: number): string[] {
    const others = new Set<number>();
    for (const level of this.levels.slice(1)) {
      for (const region of level) {
        if (region.sets.includes(set)) {
          region.sets.filter(one => one !== set).forEach(one => others.add(one));
        }
      }
    }
    return [...others].sort((a, b) => a - b).map(one => this.sets[one]);
  }

  /**
   * The size of the smallest set an overlap joins, which its share is of.
   *
   * @param region - An overlap
   * @returns That size, or undefined when a set is unsized
   */
  private smallestSetSize(region: Region): number | undefined {
    const sizes = region.sets.map(set =>
      this.levels[0]?.find(one => one.sets[0] === set)?.size);
    if (sizes.some(size => size === undefined || size <= 0)) {
      return undefined;
    }
    return Math.min(...(sizes as number[]));
  }

  protected get values(): number[][] {
    return this.magnitudes;
  }

  protected get dimension(): Dimension {
    return {
      rows: this.levels.length,
      cols: this.levels[this.row]?.length ?? 0,
    };
  }

  protected get audio(): AudioState {
    return {
      freq: {
        min: this.min,
        max: this.max,
        raw: this.magnitudes[this.row]?.[this.col] ?? Number.NaN,
      },
      panning: {
        x: this.col,
        y: this.row,
        rows: this.levels.length,
        cols: Math.max(2, this.levels[this.row]?.length ?? 1),
      },
    };
  }

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.magnitudes.map(row => row.map(value => Number.isFinite(value) ? value : 0)),
      min: this.magnitudes.map(() => this.min),
      max: this.magnitudes.map(() => this.max),
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const region = this.current;
    if (region === null) {
      return {
        main: { label: this.regionLabel, value: '' },
        mainAxis: 'x',
        crossAxis: 'y',
      };
    }

    const asides: { label: string; value: string }[] = [];
    if (region.label !== undefined) {
      asides.push({ label: t('model.asideName'), value: region.label });
    }
    if (region.sets.length > 1 && region.size !== undefined) {
      const of = this.smallestSetSize(region);
      if (of !== undefined) {
        asides.push({
          label: t('model.vennShare'),
          value: `${Math.round((region.size / of) * 1000) / 10}%`,
        });
      }
    }
    if (region.items.length > 0) {
      const shown = region.items.slice(0, NAMED_ITEMS).join(', ');
      asides.push({
        label: t('model.vennItems'),
        value: region.items.length > NAMED_ITEMS
          ? `${shown}${t('model.networkAndMore', { count: region.items.length - NAMED_ITEMS })}`
          : shown,
      });
    }
    if (region.sets.length === 1) {
      const overlaps = this.overlapsOf(region.sets[0]);
      asides.push({
        label: t('model.vennOverlaps'),
        value: overlaps.length > 0 ? overlaps.join(', ') : t('model.vennOverlapsNone'),
      });
    }

    const magnitude = this.magnitudes[this.row]?.[this.col] ?? Number.NaN;
    return {
      main: { label: this.regionLabel, value: this.setsOf(region) },
      ...(this.sized
        ? { cross: { label: this.sizeLabel, value: magnitude } }
        : {}),
      mainAxis: 'x',
      crossAxis: 'y',
      asides,
    };
  }

  /**
   * Every region of the diagram, as the `o` list offers them.
   *
   * In the order the arrows reach them -- the sets, then every overlap of
   * two, then of three -- and each named by its sets exactly as it is
   * announced, which is the one name every region has and no two share. A
   * region's own label ("Buildable") is a name the author gave some regions
   * and not others, so it goes beside the sets rather than in place of them.
   *
   * The filters ask what the diagram is drawn to answer: which regions are
   * the sets and which their overlaps, how many sets an overlap joins, and
   * everything one set takes part in.
   *
   * @returns The list, or null when the diagram has no region
   */
  public override getObjectList(): ChartObjectList | null {
    if (this.levels.length === 0) {
      return null;
    }

    const separator = t('dialogs.objectListSeparator');
    const offersIncluding = this.sets.length <= INCLUDING_FILTER_LIMIT;
    const objects = this.levels.flatMap((level, row) => level.map((region, col): ChartObject => {
      const names = region.sets.map(set => this.sets[set]);
      const details: string[] = [];
      if (region.label !== undefined) {
        details.push(t('dialogs.objectDetail', { label: t('model.asideName'), value: region.label }));
      }
      // An unsized diagram sounds a region by its item count, and the count
      // is said nowhere else in the list.
      if (!this.sized && region.items.length > 0) {
        details.push(t('dialogs.objectDetail', {
          label: t('model.vennItems'),
          value: region.items.length,
        }));
      }

      const groups = [region.sets.length === 1 ? SINGLE_SETS : overlapsFilterId(region.sets.length)];
      if (offersIncluding) {
        groups.push(...names.map(includingFilterId));
      }

      return {
        // The names sorted, not the indices: a set's index follows the order
        // the regions first mention it in, which a rebuild can change.
        key: JSON.stringify([...names].sort()),
        label: this.setsOf(region),
        ...(this.sized && region.size !== undefined
          ? { value: { label: this.sizeLabel, value: region.size, axis: 'y' } }
          : {}),
        ...(details.length > 0 ? { detail: details.join(separator) } : {}),
        row,
        col,
        measures: {
          [SIZE_MEASURE]: this.magnitudeOf(region),
          [SETS_MEASURE]: region.sets.length,
        },
        groups,
      };
    }));

    // What the pitch is: the size on a sized diagram, and otherwise the
    // number of items written in the region.
    const size: ObjectMeasure = {
      id: SIZE_MEASURE,
      label: this.sized ? this.sizeLabel : t('model.vennItems'),
      spoken: true,
    };
    const sets: ObjectMeasure = {
      id: SETS_MEASURE,
      label: t('model.objectMeasureSets'),
      spoken: false,
    };

    const sorts: ObjectSortOption[] = [chartOrderSort()];
    if (measureVaries(objects, SIZE_MEASURE)) {
      sorts.push(measureSort(size, 'descending'), measureSort(size, 'ascending'));
    }
    sorts.push(nameSort());

    // Counted from the regions, not from the rows: a degree no region has is
    // not a row at all, so the third row can be the overlaps of four sets.
    const candidates: ObjectFilterOption[] = [
      { id: SINGLE_SETS, label: t('model.objectFilterSingleSets') },
      ...this.levels
        .map(level => level[0]?.sets.length ?? 0)
        .filter(count => count > 1)
        .map(count => ({
          id: overlapsFilterId(count),
          label: t('model.objectFilterOverlaps', { count }),
        })),
      ...(offersIncluding
        ? this.sets.map(set => ({
            id: includingFilterId(set),
            label: t('model.objectFilterIncluding', { set }),
          }))
        : []),
    ];

    return {
      title: t('model.objectsRegions'),
      count: counter('model.objectRegionsOne', 'model.objectRegionsMany'),
      objects,
      measures: [size, sets],
      sorts,
      filters: offerFilters(objects, candidates),
    };
  }

  public get description(): DescriptionState {
    const all = this.levels.flat();
    const overlaps = all.filter(region => region.sets.length > 1);
    const stats: DescriptionState['stats'] = [
      { label: t('model.vennStatSets'), value: this.sets.length },
      { label: t('model.vennStatSetNames'), value: this.sets.join(', ') },
      { label: t('model.vennStatOverlaps'), value: overlaps.length },
    ];
    if (this.levels.length > 1) {
      stats.push({ label: t('model.vennStatDeepest'), value: this.levels[this.levels.length - 1][0].sets.length });
    }
    const largest = (regions: Region[]): Region | null => {
      const sized = regions.filter(region => region.size !== undefined);
      return sized.length === 0
        ? null
        : sized.reduce((best, one) => ((one.size as number) > (best.size as number) ? one : best));
    };
    const biggestSet = largest(this.levels[0] ?? []);
    if (biggestSet !== null) {
      stats.push({
        label: t('model.vennStatLargestSet'),
        value: t('model.vennRegionSized', { name: this.setsOf(biggestSet), size: biggestSet.size as number }),
      });
    }
    const biggestOverlap = largest(overlaps);
    if (biggestOverlap !== null) {
      stats.push({
        label: t('model.vennStatLargestOverlap'),
        value: t('model.vennRegionSized', { name: this.setsOf(biggestOverlap), size: biggestOverlap.size as number }),
      });
    }

    const allRows = all.map(region => [
      this.setsOf(region),
      region.label ?? '',
      region.size ?? '',
      region.items.join(', '),
    ]);
    const rows = allRows.slice(0, MAX_DESCRIPTION_TABLE_ROWS);
    if (allRows.length > rows.length) {
      stats.push({
        label: t('model.statTableRows'),
        value: t('model.statTableRowsFirstOf', { shown: rows.length, total: allRows.length }),
      });
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: {
        headers: [this.regionLabel, t('model.asideName'), this.sizeLabel, t('model.vennItems')],
        columnAxes: ['x', undefined, 'y', undefined],
        rows,
      },
    };
  }

  /**
   * Maps the declared regions onto their drawn areas.
   *
   * One element per declared region, in declared order; a set no region
   * declared alone has nothing drawn of its own and gets a placeholder.
   * Withdrawn on a count mismatch. Only the regions the trace kept are
   * cloned: a dropped duplicate's element still counts towards the match,
   * since the selectors pair with the declared regions by position, but no
   * hidden copy of it is left in the chart.
   *
   * @param selectors - Whatever the layer declared
   * @param declared - How many regions the layer declared
   * @returns One element per region, shaped as the rows, or null
   */
  private mapToSvgElements(
    selectors: MaidrLayer['selectors'],
    declared: number,
  ): SVGElement[][] | null {
    let live: SVGElement[];
    if (typeof selectors === 'string') {
      live = Svg.selectAllElements(selectors, false);
    } else if (Array.isArray(selectors) && selectors.every(one => typeof one === 'string')) {
      live = (selectors as string[]).flatMap(one => Svg.selectAllElements(one, false));
    } else {
      return null;
    }
    if (live.length !== declared || declared === 0) {
      return null;
    }
    return this.levels.map(level => level.map(region =>
      region.source === null ? Svg.createEmptyElement() : Svg.cloneHidden(live[region.source])));
  }

  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const elements = this.highlightValues;
    if (!elements) {
      return null;
    }
    // The deepest overlap under the pointer wins, since it is drawn inside
    // every set it joins: a point inside A∩B is also inside A.
    for (let row = elements.length - 1; row >= 0; row--) {
      for (let col = 0; col < elements[row].length; col++) {
        const element = elements[row][col];
        const box = element.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) {
          continue;
        }
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;
        const inside = Math.hypot((x - centerX) / (box.width / 2), (y - centerY) / (box.height / 2)) <= 1;
        if (inside) {
          return { element, row, col, centerX, centerY };
        }
      }
    }
    return null;
  }
}
