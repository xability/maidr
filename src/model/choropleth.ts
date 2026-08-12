import type { ChoroplethPoint, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint, RotorFilterUnit } from './abstract';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

/** Rotor unit that walks the regions bordering the current one. */
const NEIGHBOUR_ROTOR_UNIT: RotorFilterUnit = {
  key: 'neighbours',
  label: 'Neighbours',
  noun: 'bordering regions',
};

/** Which share of the regions counts as high, when naming clusters. */
const HIGH_QUANTILE = 0.8;

/** How many border jumps the description lists. */
const NAMED_BORDERS = 3;

/** One region, placed in the grid the cursor walks. */
interface Region {
  /** What the region is called. */
  name: string;
  /** The shaded value. */
  value: number;
  /** Centroid latitude, degrees north, or NaN. */
  lat: number;
  /** Centroid longitude, degrees east, or NaN. */
  lon: number;
  /** Names of the regions the layer says share a border. */
  neighbours: string[];
  /** Index into the declared array, for highlight selectors. */
  source: number;
}

/**
 * Trace implementation for choropleth maps.
 *
 * A choropleth shades geographic regions by a value. What a reader gets from
 * one is **spatial**: where the high values sit, which way the gradient runs,
 * and which borders the value jumps across. A region list read in declared
 * order gives none of that -- it is a bar chart whose categories happen to be
 * places, which is the reading MAIDR could already do and the reason this is
 * a type of its own.
 *
 * **The arrows move across the map, out of centroids alone.** Regions are
 * sorted by latitude into bands and west to east within each band, so up is
 * north, down is south, left is west and right is east. The bands hold equal
 * counts* rather than equal spans of latitude: a band is "the next few
 * regions going north" rather than a fixed slice of it, which keeps every
 * region reachable and every row non-empty. The direction of a move is exact
 * either way, since the ordering is by latitude and longitude throughout.
 *
 * A centroid is a longitude and a latitude, never a projected coordinate.
 * Every producer has them -- `d3.geoCentroid` returns exactly this pair --
 * and asking for them in degrees is what removes the one thing MAIDR could
 * not otherwise resolve: whether a rising `y` means north or south.
 *
 * **Borders are declared, because they cannot be recovered.** Adjacency is
 * not derivable from rendered SVG paths, and it is not derivable from
 * centroids either -- two regions can have near centroids and no shared
 * border, and a long region can border one whose centroid is far away. So a
 * layer that declares neighbours gets the readings that depend on them: how
 * the region compares with the ones around it, a rotor that walks them, the
 * borders the value jumps hardest across, and the clusters of high regions
 * that are the map's actual finding. A layer that declares none keeps the
 * spatial walk and is told nothing about borders, rather than being told
 * something guessed.
 */
export class ChoroplethTrace extends AbstractTrace {
  // The go-to-extrema *dialog*, which is a list of named targets a trace
  // offers under `g`. A map has none: every region is already one arrow-step
  // from its neighbours, and the highest and lowest are named in the
  // description. Leaving this true without overriding `getExtremaTargets`
  // would put the reader in a scope showing an empty dialog with the arrow
  // keys no longer answering -- a keyboard trap.
  //
  // Unrelated to `moveToExtreme`, the Ctrl+arrow jump to the end of a band,
  // which runs through the movable and keeps working either way.
  protected readonly supportsExtrema = false;
  protected readonly movable: MovableGrid<Region>;

  /** Regions in the shape the cursor addresses them: bands, then west to east. */
  private readonly regions: Region[][];

  /** Where a region sits, by name, for adjacency lookups. */
  private readonly placeOf: Map<string, { row: number; col: number }>;

  private readonly regionValues: number[][];
  private readonly min: number;
  private readonly max: number;

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * Creates a new choropleth trace.
   *
   * @param layer - The MAIDR layer carrying the regions
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const points = layer.data as ChoroplethPoint[];
    this.regions = ChoroplethTrace.arrange(points);
    this.placeOf = new Map();
    for (const [row, band] of this.regions.entries()) {
      for (const [col, region] of band.entries()) {
        this.placeOf.set(region.name, { row, col });
      }
    }

    this.regionValues = this.regions.map(band => band.map(region => region.value));
    const flat = this.regionValues.flat();
    this.min = MathUtil.safeMin(flat);
    this.max = MathUtil.safeMax(flat);

    this.highlightValues = this.mapToSvgElements(layer.selectors, points.length);
    this.movable = new MovableGrid(this.regions);
  }

  /**
   * Lays the regions out south to north, then west to east.
   *
   * Bands hold equal counts, which is what keeps every row non-empty: equal
   * spans of latitude would leave a band with no regions in it wherever the
   * map has a gap, and a row of nothing is a position the cursor can reach
   * and read nothing from.
   *
   * A layer declaring no centroids keeps its declared order in one band. That
   * is the region list, which is a poorer reading -- but it is the reading the
   * data supports, and inventing positions for it would put regions in
   * directions from one another that the map does not.
   *
   * @param points - The declared regions
   * @returns The regions, banded
   */
  private static arrange(points: ChoroplethPoint[]): Region[][] {
    const regions: Region[] = points.map((point, source) => ({
      name: String(point.x),
      value: Number(point.y),
      lat: typeof point.lat === 'number' ? point.lat : Number.NaN,
      lon: typeof point.lon === 'number' ? point.lon : Number.NaN,
      neighbours: (point.neighbors ?? []).map(String),
      source,
    }));

    if (regions.length === 0) {
      return [];
    }
    const placed = regions.every(
      region => Number.isFinite(region.lat) && Number.isFinite(region.lon),
    );
    if (!placed) {
      return [regions];
    }

    // Square-ish, so a band holds about as many regions as there are bands --
    // the shape that makes a sweep across and a sweep down cost the same.
    const bands = Math.max(1, Math.round(Math.sqrt(regions.length)));
    const perBand = Math.ceil(regions.length / bands);
    // South first, because `MovableGrid` moves UPWARD by *incrementing* the
    // row: band zero has to be the southernmost one for up to mean north.
    // The braille service reverses row order on a physical multi-line display
    // for the same reason, so the map renders the right way up there too.
    const southFirst = [...regions].sort((a, b) => a.lat - b.lat);

    const arranged: Region[][] = [];
    for (let start = 0; start < southFirst.length; start += perBand) {
      arranged.push(
        southFirst
          .slice(start, start + perBand)
          .sort((a, b) => a.lon - b.lon),
      );
    }
    return arranged;
  }

  /** The region the cursor is on, when it is on one. */
  private get current(): Region | null {
    return this.regions[this.row]?.[this.col] ?? null;
  }

  /**
   * A region's declared neighbours, as regions.
   *
   * A name the layer lists but never declares is dropped rather than stood in
   * for: it is a region this map does not draw, and counting it would report
   * a border the reader cannot cross.
   *
   * @param region - The region to look around
   * @returns Its neighbours
   */
  private neighboursOf(region: Region): Region[] {
    const found: Region[] = [];
    for (const name of region.neighbours) {
      const at = this.placeOf.get(name);
      const neighbour = at === undefined ? undefined : this.regions[at.row]?.[at.col];
      if (neighbour !== undefined) {
        found.push(neighbour);
      }
    }
    return found;
  }

  protected get values(): number[][] {
    return this.regionValues;
  }

  protected get audio(): AudioState {
    // One scale for the whole map, unlike a tree's per-level one: every
    // region is shaded from the same colour ramp, so every region is
    // comparable with every other, which is the whole premise of the form.
    return {
      freq: {
        min: this.min,
        max: this.max,
        raw: this.current?.value ?? 0,
      },
      panning: {
        x: this.col,
        y: this.row,
        rows: this.regions.length,
        cols: this.regions[this.row]?.length ?? 1,
      },
    };
  }

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.regionValues,
      min: this.regions.map(() => this.min),
      max: this.regions.map(() => this.max),
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const region = this.current;
    if (region === null) {
      return {
        main: { label: this.xAxis, value: '' },
        cross: { label: this.yAxis, value: 0 },
        mainAxis: 'x',
        crossAxis: 'y',
      };
    }

    const state: TextState = {
      main: { label: this.xAxis, value: region.name },
      cross: { label: this.yAxis, value: region.value },
      mainAxis: 'x',
      crossAxis: 'y',
    };

    const neighbours = this.neighboursOf(region);
    if (neighbours.length > 0) {
      // How the region sits against the ones around it, which is the gradient
      // a sighted reader takes from the shading and the one thing a walk of
      // the regions in any order cannot assemble. Off both axes, so it
      // travels as an aside rather than through an axis formatter.
      const higher = neighbours.filter(one => one.value > region.value).length;
      const lower = neighbours.filter(one => one.value < region.value).length;
      let summary: string;
      if (higher === 0 && lower === neighbours.length) {
        // A local maximum. On the map this is a hotspot, and it is the shape
        // the reader is hunting for.
        summary = `${neighbours.length}, all lower`;
      } else if (lower === 0 && higher === neighbours.length) {
        summary = `${neighbours.length}, all higher`;
      } else {
        summary = `${neighbours.length}, ${higher} higher`;
      }
      state.asides = [{ label: 'Neighbours', value: summary }];
    }

    return state;
  }

  protected get dimension(): Dimension {
    return {
      rows: this.regions.length,
      cols: this.regions[this.row]?.length ?? 0,
    };
  }

  /**
   * Offers the bordering regions when the map declares any.
   *
   * Withheld on a layer that declares no adjacency: the mode would have no
   * answer at any position, and a mode whose only reply is "none found" is
   * worse than not offering it.
   *
   * @returns The neighbour unit alongside whatever else is offered
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    const inherited = super.getRotorFilterUnits();
    const hasBorders = this.regions
      .flat()
      .some(region => this.neighboursOf(region).length > 0);
    return hasBorders ? [...inherited, NEIGHBOUR_ROTOR_UNIT] : inherited;
  }

  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    if (key !== NEIGHBOUR_ROTOR_UNIT.key) {
      return super.moveToRotorFilter(key, direction);
    }

    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
    }

    const region = this.current;
    if (region === null) {
      this.notifyRotorBounds();
      return false;
    }

    // Ordered as the grid is, so walking the neighbours of a region runs
    // north to south and west to east rather than in whatever order the
    // producer happened to list the borders in.
    const around = this.neighboursOf(region)
      .map(one => this.placeOf.get(one.name))
      .filter((at): at is { row: number; col: number } => at !== undefined)
      .sort((a, b) => (a.row - b.row) || (a.col - b.col));

    const here = around.findIndex(
      at => at.row === this.row && at.col === this.col,
    );
    const next = direction === 'right'
      ? around[here + 1] ?? around[0]
      : around[here <= 0 ? around.length - 1 : here - 1];
    if (next === undefined) {
      this.notifyRotorBounds();
      return false;
    }

    this.movable.moveToIndex(next.row, next.col);
    this.notifyStateUpdate();
    return true;
  }

  public get description(): DescriptionState {
    const every = this.regions.flat();
    const stats: DescriptionState['stats'] = [
      { label: 'Number of regions', value: every.length },
      { label: 'Min value', value: this.min },
      { label: 'Max value', value: this.max },
    ];

    const highest = every.reduce<Region | null>(
      (best, region) => (best === null || region.value > best.value ? region : best),
      null,
    );
    const lowest = every.reduce<Region | null>(
      (best, region) => (best === null || region.value < best.value ? region : best),
      null,
    );
    if (highest !== null && lowest !== null && highest.name !== lowest.name) {
      stats.push({ label: 'Highest', value: `${highest.name}, ${highest.value}` });
      stats.push({ label: 'Lowest', value: `${lowest.name}, ${lowest.value}` });
    }

    const borders = this.sharpestBorders();
    if (borders.length > 0) {
      // Where the shading changes hardest between two regions that touch --
      // the edges an eye finds instantly and a value-ordered walk never
      // reports, because the two sides are far apart in that ordering.
      stats.push({
        label: 'Sharpest borders',
        value: borders
          .map(({ from, to, jump }) => `${from} to ${to}, ${jump}`)
          .join('; '),
      });
    }

    const cluster = this.largestHighCluster();
    if (cluster !== null) {
      // The map's actual finding: not that some regions are high, but that
      // the high ones touch. A reader given a ranked list is told the first
      // and never the second.
      stats.push({
        label: 'Largest cluster of high regions',
        value: `${cluster.length} regions, ${cluster.join(', ')}`,
      });
    }

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: {
        headers: [this.xAxis, this.yAxis],
        rows: every.map(region => [region.name, region.value]),
      },
    };
  }

  /**
   * The borders the value jumps hardest across.
   *
   * Each pair is counted once: adjacency is symmetric, and reporting a border
   * from both sides would spend the whole list on one edge.
   *
   * @returns The sharpest few, largest jump first
   */
  private sharpestBorders(): { from: string; to: string; jump: number }[] {
    const seen = new Set<string>();
    const edges: { from: string; to: string; jump: number }[] = [];

    for (const region of this.regions.flat()) {
      for (const neighbour of this.neighboursOf(region)) {
        // JSON rather than a joined string: a region name can contain the
        // separator, and "A B" beside "C" would otherwise key the same pair
        // as "A" beside "B C".
        const pair = JSON.stringify([region.name, neighbour.name].sort());
        if (seen.has(pair)) {
          continue;
        }
        seen.add(pair);
        const jump = Math.abs(region.value - neighbour.value);
        if (Number.isFinite(jump)) {
          // The higher region first, always. Taking the sides in the order
          // the grid walk happens to reach them would put a name first for a
          // reason about the layout rather than the data, and a reader would
          // hear a direction in it that was not there. Named this way the
          // first region is the high side every time, so the pair reads as
          // the drop it is.
          const downhill = region.value >= neighbour.value;
          edges.push({
            from: downhill ? region.name : neighbour.name,
            to: downhill ? neighbour.name : region.name,
            jump,
          });
        }
      }
    }

    return edges
      .sort((a, b) => b.jump - a.jump)
      .slice(0, NAMED_BORDERS);
  }

  /**
   * The largest run of touching regions that are all high.
   *
   * "High" is the top fifth by value, which is a cut of the data rather than
   * a threshold on it: a fixed number would mean something different on every
   * map. A component of one is not reported -- a single high region is
   * already the `Highest` stat, and calling it a cluster would say something
   * about the geography that is not there.
   *
   * @returns The region names, or null when nothing clusters
   */
  private largestHighCluster(): string[] | null {
    const every = this.regions.flat();
    const sorted = [...every].map(region => region.value).sort((a, b) => a - b);
    if (sorted.length === 0) {
      return null;
    }
    const cut = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * HIGH_QUANTILE))];
    const high = new Set(
      every.filter(region => region.value >= cut).map(region => region.name),
    );

    const visited = new Set<string>();
    let best: string[] = [];
    for (const region of every) {
      if (!high.has(region.name) || visited.has(region.name)) {
        continue;
      }
      const component: string[] = [];
      const queue = [region];
      visited.add(region.name);
      while (queue.length > 0) {
        const at = queue.pop() as Region;
        component.push(at.name);
        for (const neighbour of this.neighboursOf(at)) {
          if (high.has(neighbour.name) && !visited.has(neighbour.name)) {
            visited.add(neighbour.name);
            queue.push(neighbour);
          }
        }
      }
      if (component.length > best.length) {
        best = component;
      }
    }

    return best.length > 1 ? best : null;
  }

  /**
   * Maps the declared regions onto their drawn shapes.
   *
   * Indexed by `source` rather than by address, because the selector list is
   * in the order the layer declared its regions and the grid is in latitude
   * order. Withdrawn entirely on a count mismatch: a list that has slipped by
   * one shades the wrong country for the rest of the session.
   *
   * @param selectors - Whatever the layer declared
   * @param declared - How many regions the layer declared
   * @returns One element per region, in the cursor's own shape, or null
   */
  private mapToSvgElements(
    selectors: MaidrLayer['selectors'],
    declared: number,
  ): SVGElement[][] | null {
    let flat: SVGElement[];
    if (typeof selectors === 'string') {
      flat = Svg.selectAllElements(selectors);
    } else if (Array.isArray(selectors) && selectors.every(one => typeof one === 'string')) {
      flat = selectors.flatMap(one => Svg.selectAllElements(one));
    } else {
      return null;
    }

    if (flat.length !== declared) {
      return null;
    }

    return this.regions.map(band =>
      band.map(region => flat[region.source] ?? Svg.createEmptyElement()));
  }

  protected findNearestPoint(): NearestPoint | null {
    // The rendered shapes are arbitrary polygons rather than the rectangles
    // and points the pointer helpers measure against, and a centroid is not
    // inside every region that owns it -- a horseshoe's is in the gap.
    return null;
  }
}
