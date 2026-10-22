import type {
  MaidrLayer,
  SequenceData,
  SequenceMessage,
  SequenceMessageKind,
  SequenceParticipant,
} from '@type/grammar';
import type { Coordinate, MovableDirection, Node } from '@type/movable';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension, NearestPoint, RotorFilterUnit } from './abstract';
import { t } from '@util/i18n';
import { Svg } from '@util/svg';
import { AbstractTrace, MAX_DESCRIPTION_TABLE_ROWS, named } from './abstract';
import { MovableGraph } from './movable';

/** The rotor unit's key, which the trace recognises a move request by. */
const FRAGMENT_ROTOR_KEY = 'fragments';

/** What a fragment path is joined with when it is announced. */
const PATH_JOIN = ' > ';

/**
 * Rotor unit that steps to where the next or previous combined fragment
 * begins or ends.
 *
 * @returns The unit, named in the active language
 */
function fragmentRotorUnit(): RotorFilterUnit {
  return {
    key: FRAGMENT_ROTOR_KEY,
    label: t('model.rotorUnitFragments'),
    noun: t('model.rotorNounFragments'),
  };
}

/** A participant as the trace reads it: declared or named by a message. */
interface Lane {
  id: string;
  name: string;
  kind?: string;
  group?: string;
}

/** A message as the trace reads it, its ends resolved to lanes. */
interface Step {
  message: SequenceMessage;
  kind: SequenceMessageKind;
  from: number;
  to: number;
  fragments: string[];
}

/**
 * The words a message kind is announced with.
 *
 * @param kind - The message's kind
 * @returns Its name in the active language
 */
function kindName(kind: SequenceMessageKind): string {
  switch (kind) {
    case 'async':
      return t('model.seqKindAsync');
    case 'reply':
      return t('model.seqKindReply');
    case 'create':
      return t('model.seqKindCreate');
    case 'destroy':
      return t('model.seqKindDestroy');
    case 'note':
      return t('model.seqKindNote');
    default:
      return t('model.seqKindSync');
  }
}

/**
 * The number the diagram prints beside a message, when it prints one. A note,
 * and a message the diagram does not number, has none.
 *
 * @param message - The message
 * @returns Its number, or undefined
 */
function printedNumber(message: SequenceMessage): number | undefined {
  const number = message.number;
  return typeof number === 'number' && Number.isFinite(number) ? number : undefined;
}

/**
 * Trace implementation for sequence diagrams.
 *
 * **The messages are the points, in the order they happen.** A sequence
 * diagram is read top to bottom: who calls whom, who answers, and what
 * happens inside each loop or alternative. Left and right walk the messages
 * in that order, which is the diagram's own reading order.
 *
 * **The first row is every message; the rows below are the lifelines.** Down
 * moves onto the first participant's lifeline, where left and right walk only
 * the messages that participant sends or receives, and down again moves to
 * the next participant. The cursor keeps its place in time as it changes
 * row: it stays on the same message when the new row holds it, and lands on
 * the latest one before it otherwise. That is the question a reader brings to
 * a lifeline -- what does the server do between the request and the reply --
 * answered without leaving the moment they were at.
 *
 * **The rotor's Fragments unit jumps between fragments**: to the next message
 * whose loop, alternative or option differs from the current one's, which is
 * where a block opens or closes.
 *
 * **The sound places the arrow.** Pitch and pan are the participant the
 * message arrives at, counted left to right, so a conversation between two
 * participants sounds as two alternating notes; the tone glides up for an
 * arrow pointing right and down for one pointing left, so the direction is
 * heard as well as the end.
 */
export class SequenceTrace extends AbstractTrace {
  /**
   * No go-to-extrema dialog: a message has no magnitude to rank, and the
   * dialog without targets is the keyboard trap `extremaContract` guards.
   */
  protected readonly supportsExtrema = false;
  protected readonly movable: MovableGraph;

  private readonly lanes: Lane[];
  private readonly steps: Step[];

  /**
   * The rows the cursor walks, each as indices into `steps`: every message,
   * then each participant's own.
   */
  private readonly rows: number[][];

  /** Each step's arriving lane counted from one, shaped as `rows`, which braille reads. */
  private readonly targets: number[][];

  protected readonly highlightValues: SVGElement[][] | null;

  /**
   * The message the reader last chose by moving along a row, as an index
   * into `steps`: the moment a change of row keeps.
   */
  private moment = 0;

  /**
   * Creates a new sequence trace.
   *
   * @param layer - The MAIDR layer carrying the participants and messages
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    const data = layer.data as SequenceData;
    const { lanes, steps } = SequenceTrace.resolve(
      data?.participants ?? [],
      data?.messages ?? [],
    );
    this.lanes = lanes;
    this.steps = steps;

    const all = steps.map((_, at) => at);
    const lifelines = lanes.map((_, lane) =>
      all.filter(at => steps[at].from === lane || steps[at].to === lane));
    this.rows = [all, ...lifelines];
    // Counted from one: a zero is the blank cell, and the leftmost
    // participant is a lane, not a gap.
    this.targets = this.rows.map(row => row.map(at => steps[at].to + 1));

    this.highlightValues = this.mapToSvgElements(layer.selectors);
    this.movable = new MovableGraph(this.buildGraph());
  }

  /**
   * Resolves the participants and the messages' ends.
   *
   * A participant a message names without declaring is added after the
   * declared ones, in the order the messages first name it, because a
   * diagram drawn from the messages alone is a real diagram.
   *
   * @param participants - The declared participants
   * @param messages - The messages, in order
   * @returns The lanes, and the messages resolved against them
   */
  private static resolve(
    participants: SequenceParticipant[],
    messages: SequenceMessage[],
  ): { lanes: Lane[]; steps: Step[] } {
    const lanes: Lane[] = [];
    const byId = new Map<string, number>();
    const lane = (id: string | number, declared?: SequenceParticipant): number => {
      const key = String(id);
      const existing = byId.get(key);
      if (existing !== undefined) {
        return existing;
      }
      lanes.push({
        id: key,
        name: String(declared?.label ?? key),
        kind: declared?.kind?.trim() || undefined,
        group: declared?.group?.trim() || undefined,
      });
      byId.set(key, lanes.length - 1);
      return lanes.length - 1;
    };

    for (const participant of participants) {
      lane(participant.id, participant);
    }
    const steps = messages.map(message => ({
      message,
      kind: message.kind ?? 'sync',
      from: lane(message.from),
      to: lane(message.to ?? message.from),
      fragments: (message.fragments ?? []).map(String).filter(one => one.trim() !== ''),
    }));
    return { lanes, steps };
  }

  /**
   * The cell of a row nearest a moment: the message itself when the row holds
   * it, otherwise the latest one before it, otherwise the row's first.
   *
   * @param row - The row to land in
   * @param step - The moment, as an index into `steps`
   * @returns The cell, or null for an empty row
   */
  private nearest(row: number, step: number): Coordinate | null {
    const cells = this.rows[row];
    if (cells === undefined || cells.length === 0) {
      return null;
    }
    let col = 0;
    for (let at = 0; at < cells.length; at++) {
      if (cells[at] <= step) {
        col = at;
      }
    }
    return { row, col };
  }

  /**
   * The next row with a message on it, passing over a participant no
   * message reaches, which has nothing to stand on.
   *
   * @param row - Where to start
   * @param by - Which way to look: 1 down, -1 up
   * @returns That row, or null when there is none
   */
  private nextRow(row: number, by: number): number | null {
    for (let at = row + by; at >= 0 && at < this.rows.length; at += by) {
      if (this.rows[at].length > 0) {
        return at;
      }
    }
    return null;
  }

  /**
   * Wires the rows into the graph the cursor walks.
   *
   * Left and right are the row's neighbours in time. Up and down are wired
   * to the message's own moment here, and {@link moveOnce} replaces that
   * with the moment the reader left from, so a run of vertical moves does
   * not drift earlier one row at a time.
   *
   * @returns The navigation graph, addressed as `rows`
   */
  private buildGraph(): (Node | null)[][] {
    const lastRow = this.nextRow(this.rows.length, -1);
    return this.rows.map((cells, row) =>
      cells.map((step, col) => {
        const above = this.nextRow(row, -1);
        const below = this.nextRow(row, 1);
        return {
          up: above === null ? null : this.nearest(above, step),
          down: below === null ? null : this.nearest(below, step),
          left: col > 0 ? { row, col: col - 1 } : null,
          right: col < cells.length - 1 ? { row, col: col + 1 } : null,
          start: { row, col: 0 },
          end: { row, col: cells.length - 1 },
          top: row === 0 ? null : this.nearest(0, step),
          bottom: lastRow === null || lastRow === row ? null : this.nearest(lastRow, step),
        };
      }));
  }

  /** Remembers the message under the cursor as the moment the reader is at. */
  private markMoment(): void {
    const step = this.rows[this.row]?.[this.col];
    if (step !== undefined) {
      this.moment = step;
    }
  }

  /**
   * Moves the cursor, keeping the moment across a change of row.
   *
   * A vertical move lands on the message nearest the moment the reader last
   * chose with left or right, rather than the one the previous row happened
   * to land on: down three lifelines from the database's reply lands on that
   * reply, not on whatever the browser was doing before it.
   *
   * @param direction - Which way to move
   * @returns True when the cursor moved
   */
  public override moveOnce(direction: MovableDirection): boolean {
    const vertical = direction === 'UPWARD' || direction === 'DOWNWARD';
    if (this.isInitialEntry || !vertical) {
      const moved = super.moveOnce(direction);
      this.markMoment();
      return moved;
    }
    const row = this.nextRow(this.row, direction === 'DOWNWARD' ? 1 : -1);
    const target = row === null ? null : this.nearest(row, this.moment);
    if (target === null) {
      this.notifyOutOfBounds();
      return false;
    }
    this.movable.moveToIndex(target.row, target.col);
    this.notifyStateUpdate();
    return true;
  }

  public override moveToExtreme(direction: MovableDirection): boolean {
    const moved = super.moveToExtreme(direction);
    if (direction === 'FORWARD' || direction === 'BACKWARD') {
      this.markMoment();
    }
    return moved;
  }

  public override moveToIndex(row: number, col: number): boolean {
    const moved = super.moveToIndex(row, col);
    this.markMoment();
    return moved;
  }

  /** The message the cursor is on, when it is on one. */
  private get current(): Step | null {
    const step = this.rows[this.row]?.[this.col];
    return step === undefined ? null : this.steps[step] ?? null;
  }

  /** What this chart calls a message, from the x axis when the layer names one. */
  private get messageLabel(): string {
    return named(this.layer.axes?.x?.label, t('model.seqMessage'));
  }

  /**
   * A participant as announced: its name, and its sort when the diagram
   * draws one.
   *
   * @param lane - Which participant
   * @returns The name to announce
   */
  private laneName(lane: number): string {
    const one = this.lanes[lane];
    if (one === undefined) {
      return '';
    }
    return one.kind === undefined || one.kind === 'participant'
      ? one.name
      : t('model.seqParticipantKind', { name: one.name, kind: one.kind });
  }

  /**
   * The ends of a message as one phrase: `Alice to Bob`, or `over Alice` for
   * a note on one participant.
   *
   * @param step - The message
   * @returns The phrase
   */
  private route(step: Step): string {
    const from = this.lanes[step.from]?.name ?? '';
    const to = this.lanes[step.to]?.name ?? '';
    if (step.kind === 'note') {
      return step.from === step.to
        ? t('model.seqNoteOver', { name: from })
        : t('model.seqNoteSpanning', { from, to });
    }
    return step.from === step.to
      ? t('model.seqToSelf', { name: from })
      : t('model.seqRoute', { from, to });
  }

  protected get values(): number[][] {
    return this.targets;
  }

  protected get dimension(): Dimension {
    return {
      rows: this.rows.length,
      cols: this.rows[this.row]?.length ?? 0,
    };
  }

  protected get audio(): AudioState {
    const step = this.current;
    const lanes = Math.max(1, this.lanes.length);
    const glide = step === null || step.from === step.to
      ? undefined
      : step.to > step.from ? 'up' as const : 'down' as const;
    return {
      freq: {
        min: 0,
        max: Math.max(1, lanes - 1),
        raw: step === null ? Number.NaN : step.to,
      },
      // The arriving participant's place across the diagram, so the sound
      // sits where the arrow ends.
      panning: {
        x: step === null ? 0 : step.to,
        y: this.row,
        rows: this.rows.length,
        cols: Math.max(2, lanes),
      },
      ...(glide === undefined ? {} : { glide }),
    };
  }

  protected get braille(): BrailleState {
    // One row per row of the cursor, each cell the lane the message arrives
    // at: a conversation shows as dots stepping between two heights.
    const max = Math.max(1, this.lanes.length);
    return {
      empty: false,
      id: this.id,
      values: this.targets,
      min: this.targets.map(() => 0),
      max: this.targets.map(() => max),
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const step = this.current;
    if (step === null) {
      return {
        main: { label: this.messageLabel, value: '' },
        mainAxis: 'x',
        crossAxis: 'y',
      };
    }

    const asides: { label: string; value: string }[] = [];
    if (this.row > 0) {
      // Said first, so a reader who has just moved down knows which
      // lifeline the left and right arrows now walk.
      asides.push({ label: t('model.seqLifeline'), value: this.laneName(this.row - 1) });
    }
    asides.push({ label: t('model.seqRouteLabel'), value: this.route(step) });
    if (step.kind !== 'sync' && step.kind !== 'note') {
      asides.push({ label: t('model.tableKind'), value: kindName(step.kind) });
    }
    if (step.fragments.length > 0) {
      asides.push({ label: t('model.seqFragment'), value: step.fragments.join(PATH_JOIN) });
    }
    const number = printedNumber(step.message);
    if (number !== undefined) {
      asides.push({ label: t('model.seqNumber'), value: String(number) });
    }
    const cells = this.rows[this.row];
    if (cells.length > 1) {
      asides.push({
        label: t('model.asideOrder'),
        value: t('model.dagOrder', { index: this.col + 1, total: cells.length }),
      });
    }

    const text = step.message.text?.trim();
    return {
      main: {
        label: step.kind === 'note' ? kindName('note') : this.messageLabel,
        value: text || t('model.seqUntitled'),
      },
      mainAxis: 'x',
      crossAxis: 'y',
      asides,
    };
  }

  /**
   * Offers the fragment jump, when the diagram has a fragment to jump to.
   *
   * @returns The fragment unit alongside whatever else is offered
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    const inherited = super.getRotorFilterUnits();
    return this.steps.some(step => step.fragments.length > 0)
      ? [...inherited, fragmentRotorUnit()]
      : inherited;
  }

  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    if (key !== FRAGMENT_ROTOR_KEY) {
      return super.moveToRotorFilter(key, direction);
    }
    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
    }

    const cells = this.rows[this.row] ?? [];
    const here = this.current;
    if (here === null) {
      this.notifyRotorBounds();
      return false;
    }
    const block = here.fragments.join('\u0000');
    const by = direction === 'right' ? 1 : -1;
    for (let col = this.col + by; col >= 0 && col < cells.length; col += by) {
      const other = this.steps[cells[col]].fragments.join('\u0000');
      if (other !== block) {
        // Backwards, land on the first message of the block found rather
        // than its last, so the jump reads the block from its start.
        let land = col;
        if (by < 0) {
          while (land > 0 && this.steps[cells[land - 1]].fragments.join('\u0000') === other) {
            land--;
          }
        }
        this.movable.moveToIndex(this.row, land);
        this.markMoment();
        this.notifyStateUpdate();
        return true;
      }
    }
    this.notifyRotorBounds();
    return false;
  }

  /**
   * How many combined fragments the diagram draws boxes for.
   *
   * Counted along the messages in time, so a fragment is the run of messages
   * that sit in it: two loops with one label, one after the other, are two.
   * A later section of a fragment is labelled with the fragment's own label,
   * a comma and the section -- `alt cached, else` -- and continues the
   * fragment rather than opening another, so an alt and its else are one, as
   * the diagram draws them. A fragment with no message in it is not counted:
   * nothing in the data says it is there.
   *
   * @returns The count
   */
  private countFragments(): number {
    let count = 0;
    let previous: string[] = [];
    // The label each fragment open at a depth was first met with.
    const open: string[] = [];
    for (const { fragments: path } of this.steps) {
      for (let depth = 0; depth < path.length; depth++) {
        const entry = path[depth];
        const sameOuter = path.slice(0, depth).every((outer, at) => outer === previous[at]);
        const continues = sameOuter && previous[depth] !== undefined
          && (entry === previous[depth] || entry.startsWith(`${open[depth]}, `));
        if (!continues) {
          count++;
          open[depth] = entry;
        }
      }
      previous = path;
    }
    return count;
  }

  public get description(): DescriptionState {
    const messages = this.steps.filter(step => step.kind !== 'note');
    const notes = this.steps.length - messages.length;
    const fragments = this.countFragments();
    const selfMessages = messages.filter(step => step.from === step.to).length;

    const stats: DescriptionState['stats'] = [
      { label: t('model.seqStatParticipants'), value: this.lanes.length },
      { label: t('model.seqStatMessages'), value: messages.length },
    ];
    if (this.lanes.length > 0) {
      stats.push({
        label: t('model.seqStatParticipantNames'),
        value: this.lanes.map((_, lane) => this.laneName(lane)).join(', '),
      });
    }
    if (notes > 0) {
      stats.push({ label: t('model.seqStatNotes'), value: notes });
    }
    if (fragments > 0) {
      stats.push({ label: t('model.seqStatFragments'), value: fragments });
    }
    if (selfMessages > 0) {
      stats.push({ label: t('model.seqStatSelfMessages'), value: selfMessages });
    }

    // The participant in the most messages: the hub of the interaction.
    const involvement = this.lanes.map((_, lane) =>
      messages.filter(step => step.from === lane || step.to === lane).length);
    const busiest = Math.max(0, ...involvement);
    if (busiest > 0 && this.lanes.length > 1) {
      stats.push({
        label: t('model.seqStatBusiest'),
        value: t('model.seqBusiest', {
          names: this.lanes.filter((_, lane) => involvement[lane] === busiest)
            .map(one => one.name)
            .join(', '),
          count: busiest,
        }),
      });
    }

    // Only the numbers the diagram prints: a row it leaves unnumbered is
    // blank, and a diagram that numbers nothing has no Number column.
    const numbered = this.steps.some(step => printedNumber(step.message) !== undefined);
    const allRows = this.steps.map(step => [
      ...(numbered ? [printedNumber(step.message) ?? ''] : []),
      this.lanes[step.from]?.name ?? '',
      this.lanes[step.to]?.name ?? '',
      kindName(step.kind),
      step.message.text ?? '',
      step.fragments.join(PATH_JOIN),
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
        headers: [
          ...(numbered ? [t('model.seqNumber')] : []),
          t('model.tableFrom'),
          t('model.tableTo'),
          t('model.tableKind'),
          this.messageLabel,
          t('model.seqFragment'),
        ],
        columnAxes: [...(numbered ? [undefined] : []), undefined, undefined, undefined, 'x', undefined],
        rows,
      },
    };
  }

  /**
   * Maps the messages onto their drawn arrows.
   *
   * One element per message, notes included, in declared order; withdrawn on
   * a count mismatch, since a list slipped by one outlines the wrong arrow
   * for the rest of the diagram.
   *
   * @param selectors - Whatever the layer declared
   * @returns One element per cell, shaped as `rows`, or null
   */
  private mapToSvgElements(selectors: MaidrLayer['selectors']): SVGElement[][] | null {
    let live: SVGElement[];
    if (typeof selectors === 'string') {
      live = Svg.selectAllElements(selectors, false);
    } else if (Array.isArray(selectors) && selectors.every(one => typeof one === 'string')) {
      live = (selectors as string[]).flatMap(one => Svg.selectAllElements(one, false));
    } else {
      return null;
    }
    if (live.length !== this.steps.length || live.length === 0) {
      return null;
    }
    const flat = live.map(element => Svg.cloneHidden(element));
    return this.rows.map(cells => cells.map(step => flat[step]));
  }

  protected findNearestPoint(x: number, y: number): NearestPoint | null {
    const row = this.highlightValues?.[0];
    if (!row) {
      return null;
    }
    let nearest: NearestPoint | null = null;
    let best = Number.POSITIVE_INFINITY;
    row.forEach((element, col) => {
      const box = element.getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      // Time runs down the page, so the vertical distance decides; the
      // horizontal only breaks a tie between messages drawn level.
      const distance = Math.abs(centerY - y) * 4 + Math.abs(centerX - x);
      if (distance < best) {
        best = distance;
        nearest = { element, row: 0, col, centerX, centerY };
      }
    });
    return nearest;
  }
}
