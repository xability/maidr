import type { RotorFilterUnit } from '@model/abstract';
import type { MaidrLayer } from '@type/grammar';
import type { AudioState, DescriptionState, TextState, TraceState } from '@type/state';
import { MathUtil } from '@util/math';
import { isMeasured } from './bar';
import { LineTrace } from './line';

/**
 * Rotor units for jumping between the periods where a rank actually moved.
 *
 * A bump chart is read for its overtakes, and they are sparse: a twelve-team
 * table over a season is mostly periods where nothing changed, so a reader
 * scanning every column to find the three that matter spends the navigation on
 * the uninteresting part. These are the candlestick's bullish/bearish filters
 * applied to the event this chart is drawn for.
 */
const RANK_ROTOR_UNITS: readonly RotorFilterUnit[] = [
  { key: 'gained', label: 'Rank gained', noun: 'rank gain' },
  { key: 'lost', label: 'Rank lost', noun: 'rank loss' },
];

/**
 * Trace implementation for bump charts -- rank over time, one line per
 * competitor.
 *
 * Structurally a multi-line layer, so navigation, braille and highlighting
 * transfer. What is different is that **the y axis is a rank**, and a rank is
 * not a magnitude: it is inverted, bounded by the number of competitors, and
 * meaningful only relative to the others in the same period.
 *
 * Two consequences, and both are the difference between a readable chart and a
 * misleading one.
 *
 * **The pitch is inverted.** Rank 1 is the best position and the smallest
 * number, so sonifying it as a magnitude makes the leader sound like the
 * loser: a team climbing the table would be heard falling, on every move, with
 * nothing to say the reading was upside down. The bounds are handed to the
 * audio service the other way round, so first place is the highest note.
 *
 * **The change travels with the position.** What a reader wants from a bump
 * chart is who overtook whom, and that is not recoverable from hearing a
 * sequence of ranks one at a time -- it means holding the previous period's
 * number while navigating to the next and subtracting by ear, for every
 * competitor. So each point announces the places gained or lost alongside the
 * rank, and the rotor can jump between the periods where something moved.
 *
 * A *slope graph* of values is not this: two points per series on a value axis
 * is a line layer with two samples, which the line trace already reads
 * correctly. What makes this a type of its own is the rank.
 */
export class BumpTrace extends LineTrace {
  /** Best (numerically smallest) and worst rank anywhere in the chart. */
  private readonly bestRank: number;
  private readonly worstRank: number;

  /**
   * Places gained since the previous period, per competitor per period.
   *
   * Positive is an improvement -- a move towards rank 1 -- so the sign reads
   * the way a reader means it rather than the way the numbers subtract.
   * `undefined` in the first period, which has nothing to compare against and
   * must not be reported as "no change".
   */
  private readonly moves: (number | undefined)[][];

  /** How many periods the longest competitor runs to. */
  private readonly periods: number;

  /** Cached rotor units; see the constructor for why they are precomputed. */
  private readonly rotorUnits: readonly RotorFilterUnit[];

  /**
   * Creates a new bump trace.
   *
   * @param layer - The MAIDR layer carrying the ranks
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    // `MathUtil` rather than a spread into `Math.min`: the same helpers
    // `LineTrace` uses per row, without the call-stack limit a spread carries
    // on a large table and with one answer for an empty chart.
    this.bestRank = MathUtil.minFrom2D(this.lineValues);
    this.worstRank = MathUtil.maxFrom2D(this.lineValues);

    // The longest competitor, not row 0's. A table where one competitor
    // joined late is ragged, and reading row 0's length would take some other
    // row's *middle* period for its last one -- reporting the wrong finisher
    // and the wrong net move, quietly, since the comparison just fails rather
    // than erroring.
    this.periods = this.lineValues.reduce(
      (longest, row) => Math.max(longest, row.length),
      0,
    );

    // A period the competitor was not ranked in holds NaN, and a move into
    // or out of it would be NaN too -- which is not `undefined`, so the text
    // would read it out as a change and the rotor gate would count it as a
    // rank that moved. There is no previous rank to compare against, which
    // is the first period's situation, and it is treated the same way.
    this.moves = this.lineValues.map(row =>
      row.map((rank, column) => {
        const previous = row[column - 1];
        return column === 0 || !isMeasured(rank) || !isMeasured(previous)
          ? undefined
          : previous - rank;
      }));

    // Precomputed, as `Candlestick` precomputes its trend units and for the
    // same reason: the ranks are fixed at construction and the rotor service
    // asks for this twice per keystroke.
    this.rotorUnits = this.moves.some(row =>
      row.some(move => move !== undefined && move !== 0))
      ? RANK_ROTOR_UNITS
      : [];
  }

  protected override get audio(): AudioState {
    const base = super.audio;

    // Handed to the service the other way round, so `interpolate` maps the
    // best rank to the top of the register. `LineTrace` would give the leader
    // the lowest note it has, which is the reading a reader would have to
    // consciously invert on every single move.
    //
    // Scaled across the whole chart rather than per row: every competitor is
    // ranked in the same table, so their positions are comparable, and
    // per-row bounds would make each competitor's own best period the highest
    // note whether that was first place or eleventh.
    return {
      ...base,
      freq: { ...base.freq, min: this.worstRank, max: this.bestRank },
    };
  }

  protected override get text(): TextState {
    const base = super.text;
    const move = this.moves[this.row]?.[this.col];

    if (move === undefined) {
      // The first period has nothing to compare against. Saying "no change"
      // would report a stability the chart does not claim.
      return base;
    }

    // Named by direction rather than signed, for the reason the dumbbell
    // gives: "Places gained is 2" needs no interpretation, while "-2" asks
    // the reader to hear a minus sign and work out which way it points --
    // on a rank axis, where the arithmetic already runs backwards.
    return {
      ...base,
      stack: {
        label: move > 0 ? 'Places gained' : move < 0 ? 'Places lost' : 'Change',
        value: Math.abs(move),
      },
    };
  }

  protected override get groupFallbackLabel(): string {
    // Announced beside the competitor's own name on every move, so inheriting
    // the line's "Group" puts two words for one referent in one sentence --
    // "Competitor 1 of 4, Group is Ash".
    return 'Competitor';
  }

  protected override get seriesLabels(): {
    count: string;
    perSeries: string;
    names: string;
    column: string;
  } {
    return {
      count: 'Number of competitors',
      perSeries: 'Periods',
      names: 'Competitor names',
      column: 'Competitor',
    };
  }

  public override get description(): DescriptionState {
    const base = super.description;

    // `LineTrace` reports Min value and Max value, which on a rank axis are
    // "somebody came first" and "somebody came last" -- true of every bump
    // chart ever drawn, and so worth nothing.
    const stats = base.stats.filter(
      stat => stat.label !== 'Min value' && stat.label !== 'Max value',
    );

    const leaderAt = (column: number): string | null => {
      let best: number | null = null;
      for (const [row, ranks] of this.lineValues.entries()) {
        const rank = ranks[column];
        if (rank === undefined) {
          continue;
        }
        if (best === null || rank < this.lineValues[best][column]) {
          best = row;
        }
      }
      return best === null ? null : this.groupNameAt(best);
    };

    if (this.periods > 0) {
      const first = leaderAt(0);
      const last = leaderAt(this.periods - 1);
      if (first !== null) {
        stats.push({ label: 'Led at the start', value: first });
      }
      if (last !== null) {
        stats.push({ label: 'Led at the end', value: last });
      }
    }

    // Both directions, not the larger of the two. They are different
    // findings -- who came up and who went down -- and a chart whose biggest
    // climb and biggest fall are the same size is the ordinary case rather
    // than a rare one, since ranks are a permutation: somebody's gain is
    // somebody else's loss. Reporting the winner of that tie would drop one
    // of the two facts on exactly the charts where both are most obviously
    // present.
    const climber = this.extremeMover('up');
    const faller = this.extremeMover('down');
    if (climber !== null) {
      stats.push({
        label: 'Climbed furthest',
        value: `${this.groupNameAt(climber.row)}, ${climber.places}`,
      });
    }
    if (faller !== null) {
      stats.push({
        label: 'Fell furthest',
        value: `${this.groupNameAt(faller.row)}, ${-faller.places}`,
      });
    }

    return { ...base, stats };
  }

  /**
   * The competitor who moved furthest in one direction over the whole chart.
   *
   * Answers null when nobody moved that way, rather than naming whoever moved
   * least: "climbed furthest: Ash, 0 places" reports a rise on a chart where
   * every rank fell.
   *
   * Ties take the first, as {@link DumbbellTrace} does -- somebody has to be
   * named, and the earlier row is at least stable across renders.
   *
   * @param direction - Whether to find the biggest climb or the biggest fall
   * @returns The row and its net places gained (negative for a fall), or null
   */
  private extremeMover(
    direction: 'up' | 'down',
  ): { row: number; places: number } | null {
    if (this.lineValues.length === 0 || this.periods < 2) {
      return null;
    }

    let best: { row: number; places: number } | null = null;
    for (const [row, ranks] of this.lineValues.entries()) {
      // A competitor's own last period, not the table's. One that joined late
      // or dropped out has a shorter row, and reading past its end would
      // compare its start against nothing.
      const places = ranks[0] - ranks[ranks.length - 1];
      const moved = direction === 'up' ? places > 0 : places < 0;
      if (!moved) {
        continue;
      }
      if (best === null || Math.abs(places) > Math.abs(best.places)) {
        best = { row, places };
      }
    }
    return best;
  }

  public override get state(): TraceState {
    const base = super.state;
    if (base.empty) {
      return base;
    }

    return { ...base, plotType: 'bump' };
  }

  /**
   * Offers the two rank-change filters, when the chart has anything to filter.
   *
   * A chart with one period holds no moves at all, and offering a rotor unit
   * that can never find anything is worse than not offering it: the reader
   * cycles onto a mode whose only possible answer is "none found".
   *
   * @returns The rank-change rotor units, or none
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    return this.rotorUnits;
  }

  /**
   * Jumps to the next period where this competitor gained or lost places.
   *
   * Filtering runs along the period axis within the current competitor, which
   * is the question the filter answers -- "when did *this* team move?" The
   * rotor service handles up/down itself and only dispatches left/right here.
   *
   * @param key - Which direction of move to find ('gained' or 'lost')
   * @param direction - Which way along the periods to search
   * @returns True if a matching period was found and moved to
   */
  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    const row = this.moves[this.row];
    if (row === undefined) {
      this.notifyRotorBounds();
      return false;
    }

    const step = direction === 'right' ? 1 : -1;
    for (let col = this.col + step; col >= 0 && col < row.length; col += step) {
      const move = row[col];
      if (move === undefined || move === 0) {
        continue;
      }
      if ((key === 'gained' && move > 0) || (key === 'lost' && move < 0)) {
        this.moveToIndex(this.row, col);
        return true;
      }
    }

    this.notifyRotorBounds();
    return false;
  }
}
