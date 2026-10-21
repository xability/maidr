import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { FormatterService } from '@service/formatter';
import type { NotificationService } from '@service/notification';
import type { Disposable } from '@type/disposable';
import type { ChartObject, ChartObjectList, ObjectSortOption } from '@type/objectList';
import { AbstractTrace } from '@model/abstract';
import { Scope } from '@type/event';
import { getLocale, t } from '@util/i18n';
import { arrangeObjects } from '@util/objectList';

/** One row of the object list, ready to show and to speak. */
export interface ObjectListRow {
  /** The object's key, which is all the trace needs to move there. */
  readonly key: string;
  /** Its name. */
  readonly label: string;
  /** Everything else the row says: its value, the measure it is sorted by, its detail. */
  readonly detail: string;
  /** Whether the reader's cursor is on it. */
  readonly current: boolean;
}

/** The list as it stands under the chosen order and filter. */
export interface ObjectListView {
  /** What the objects are: "Nodes". */
  readonly title: string;
  /** The keys the list answers, in words. */
  readonly description: string;
  /** How many are shown, out of how many, in what order: "42 nodes, Name, A to Z". */
  readonly summary: string;
  readonly sortLabel: string;
  readonly filterLabel: string;
  /** Whether there is another order to step to. */
  readonly canSort: boolean;
  /** Whether there is a filter to step to. */
  readonly canFilter: boolean;
  readonly rows: readonly ObjectListRow[];
  /** The row of the object the cursor is on, or 0 when it is not shown. */
  readonly currentIndex: number;
}

/** The order and filter a reader last chose on a layer. */
interface Arrangement {
  sort: string;
  filter: string | null;
}

/** The list the dialog is showing, and how it is arranged. */
interface Session {
  layerId: string;
  list: ChartObjectList;
  /** The objects, with any deferred measure the reader has asked for filled in. */
  objects: readonly ChartObject[];
  sortIndex: number;
  /** An index into the list's filters, or -1 for every object. */
  filterIndex: number;
  /** The key of the object the cursor was on when the list opened. */
  currentKey: string | null;
}

/**
 * The object list behind `o`: every node, tile or region of a chart without
 * axes, sorted and filtered the ways that chart offers, and the jump to the
 * one the reader picks.
 *
 * Owns what the list is -- which objects, in what order, under which filter,
 * and what each row says -- so the view model only shows it and keeps the
 * selection. The objects come from the active trace, which alone knows what
 * they are on its chart.
 */
export class ObjectListService implements Disposable {
  private readonly context: Context;
  private readonly display: DisplayService;
  private readonly formatter: FormatterService;
  private readonly notification: NotificationService;

  private session: Session | null = null;

  /**
   * The order and filter last chosen on each layer, so "o, Down, Enter" from
   * a list sorted by links walks to the next hub rather than reopening on the
   * default every time. Kept by layer id for as long as the reader stays in
   * the chart.
   */
  private readonly arrangements = new Map<string, Arrangement>();

  /** The jump waiting for focus to return to the chart. */
  private pendingMove: ReturnType<typeof setTimeout> | null = null;

  public constructor(
    context: Context,
    display: DisplayService,
    formatter: FormatterService,
    notification: NotificationService,
  ) {
    this.context = context;
    this.display = display;
    this.formatter = formatter;
    this.notification = notification;
  }

  /**
   * Whether the layer the reader is on has a list to offer.
   * @returns True when `o` would open one
   */
  public isAvailable(): boolean {
    return this.activeList() !== null;
  }

  /**
   * Builds the list for the layer the reader is on, in the order and filter
   * they last chose on it. Does not open the dialog: the view model shows the
   * list first, so the dialog has it to render the moment its scope opens.
   * @returns The list, or null when the layer has none
   */
  public open(): ObjectListView | null {
    const active = this.activeList();
    if (active === null) {
      this.session = null;
      return null;
    }

    const { trace, list } = active;
    const remembered = this.arrangements.get(trace.getId());
    const sortIndex = Math.max(0, list.sorts.findIndex(sort => sort.id === remembered?.sort));
    const rememberedFilter = remembered?.filter ?? null;
    const filterIndex = rememberedFilter === null
      ? -1
      : list.filters.findIndex(filter => filter.id === rememberedFilter);

    const current = trace.isInitialEntry
      ? undefined
      : list.objects.find(object => object.row === trace.row && object.col === trace.col);

    this.session = {
      layerId: trace.getId(),
      list,
      objects: list.objects,
      sortIndex,
      filterIndex,
      currentKey: current?.key ?? null,
    };
    return this.view(this.session);
  }

  /** Puts the reader in the object list's scope. */
  public enterScope(): void {
    if (this.context.scope !== Scope.OBJECT_LIST) {
      this.display.toggleFocus(Scope.OBJECT_LIST);
    }
  }

  /**
   * Leaves the object list's scope for whichever scope opened it -- the chart,
   * or braille. Tested against OBJECT_LIST rather than "not TRACE" for the
   * reason {@link GoToExtremaService.returnToTraceScope} gives: a dismissal
   * that runs after the scope was restored must not push the list back.
   */
  public close(): void {
    if (this.context.scope === Scope.OBJECT_LIST) {
      this.display.toggleFocus(Scope.OBJECT_LIST);
    }
  }

  /**
   * Steps to the next or previous order the chart offers.
   * @param step - 1 for the next, -1 for the previous
   * @returns The list in the new order, or null when there is no other
   */
  public cycleSort(step: 1 | -1): ObjectListView | null {
    const session = this.session;
    if (session === null || session.list.sorts.length < 2) {
      return null;
    }
    const count = session.list.sorts.length;
    session.sortIndex = (session.sortIndex + step + count) % count;
    this.remember(session);
    return this.view(session);
  }

  /**
   * Steps to the next or previous filter, passing through "all" between the
   * last and the first.
   * @param step - 1 for the next, -1 for the previous
   * @returns The list under the new filter, or null when there is none
   */
  public cycleFilter(step: 1 | -1): ObjectListView | null {
    const session = this.session;
    if (session === null || session.list.filters.length === 0) {
      return null;
    }
    // -1 is "all": the cycle runs all, first, ..., last, all.
    const count = session.list.filters.length + 1;
    session.filterIndex = ((session.filterIndex + 1 + step + count) % count) - 1;
    this.remember(session);
    return this.view(session);
  }

  /**
   * Takes the reader to an object once the dialog has closed.
   *
   * The jump waits a turn, for the chart to have focus again: closing puts
   * focus back on the chart in a timer of its own, and a jump announced
   * before that would be talked over by the screen reader reading the chart
   * it has just landed on. Timers of the same delay run in the order they
   * were set, so this one runs after the refocus. From braille, the text
   * field is focused before either.
   *
   * The trace is read again when the jump runs, and must still be the layer
   * the list was built from: live data can replace the chart under an open
   * list, and a key that happens to exist in some other layer is not the
   * object the reader chose. When it is gone, the reader is told so.
   * @param key - The key of the chosen object
   * @param label - Its name, to say when it is no longer there
   */
  public moveToObject(key: string, label: string): void {
    const layerId = this.session?.layerId ?? null;
    this.cancelPendingMove();
    this.pendingMove = setTimeout(() => {
      this.pendingMove = null;
      const active = this.context.active;
      const moved = active instanceof AbstractTrace
        && active.getId() === layerId
        && active.moveToObject(key);
      if (!moved) {
        this.notification.notify(t('notification.objectListGone', { label }));
      }
    }, 0);
  }

  public dispose(): void {
    this.cancelPendingMove();
    this.session = null;
    this.arrangements.clear();
  }

  /** Drops a jump that has not run yet. */
  private cancelPendingMove(): void {
    if (this.pendingMove !== null) {
      clearTimeout(this.pendingMove);
      this.pendingMove = null;
    }
  }

  /**
   * The trace the reader is on and its list, when it has one with something
   * in it.
   * @returns Both, or null
   */
  private activeList(): { trace: AbstractTrace; list: ChartObjectList } | null {
    const trace = this.context.active;
    if (!(trace instanceof AbstractTrace)) {
      return null;
    }
    const list = trace.getObjectList();
    if (list === null || list.objects.length === 0 || list.sorts.length === 0) {
      return null;
    }
    return { trace, list };
  }

  /**
   * Keeps the order and filter of a layer for the next time its list opens.
   * @param session - The open list
   */
  private remember(session: Session): void {
    this.arrangements.set(session.layerId, {
      sort: session.list.sorts[session.sortIndex].id,
      filter: session.filterIndex < 0 ? null : session.list.filters[session.filterIndex].id,
    });
  }

  /**
   * The list as the session arranges it.
   * @param session - The open list
   * @returns The view
   */
  private view(session: Session): ObjectListView {
    const { list } = session;
    const sort = list.sorts[session.sortIndex];
    this.fillDeferred(session, sort);

    const filter = session.filterIndex < 0 ? null : list.filters[session.filterIndex];
    const shown = arrangeObjects(session.objects, sort.order, filter?.id ?? null);
    const rows = shown.map(object => this.row(session, object, sort));

    const total = session.objects.length;
    const summary = filter === null
      ? t('dialogs.objectListSummaryAll', { count: list.count(total), sort: sort.label })
      : t('dialogs.objectListSummaryFiltered', {
          filter: filter.label,
          shown: shown.length,
          total: list.count(total),
          sort: sort.label,
        });

    const keys = [t('dialogs.objectListKeys')];
    if (list.sorts.length > 1) {
      keys.push(t('dialogs.objectListKeysSort'));
    }
    if (list.filters.length > 0) {
      keys.push(t('dialogs.objectListKeysFilter'));
    }

    return {
      title: list.title,
      description: keys.join(' '),
      summary,
      sortLabel: sort.label,
      filterLabel: filter?.label ?? t('dialogs.objectListShowingAll'),
      canSort: list.sorts.length > 1,
      canFilter: list.filters.length > 0,
      rows,
      currentIndex: Math.max(0, rows.findIndex(row => row.current)),
    };
  }

  /**
   * Works out a measure the chart left until a sort asked for it, once per
   * opening of the list.
   * @param session - The open list
   * @param sort - The sort about to be applied
   */
  private fillDeferred(session: Session, sort: ObjectSortOption): void {
    if (sort.order.kind !== 'measure') {
      return;
    }
    const measure = sort.order.measure;
    const compute = session.list.deferred?.[measure];
    if (compute === undefined || session.objects.some(object => measure in object.measures)) {
      return;
    }
    const values = compute();
    session.objects = session.objects.map((object, index) => ({
      ...object,
      measures: { ...object.measures, [measure]: values[index] ?? Number.NaN },
    }));
  }

  /**
   * What a row shows and says: the object's name, then its value in the
   * layer's own format, the measure the list is sorted by when nothing else
   * on the row says it, and the rest of what the chart has to say about it.
   * @param session - The open list
   * @param object - The object
   * @param sort - The sort in force
   * @returns The row
   */
  private row(session: Session, object: ChartObject, sort: ObjectSortOption): ObjectListRow {
    const parts: string[] = [];
    if (object.value !== undefined && Number.isFinite(object.value.value)) {
      parts.push(t('dialogs.objectDetail', {
        label: object.value.label,
        value: this.formatter.formatSingleValue(object.value.value, session.layerId, object.value.axis),
      }));
    }
    if (sort.order.kind === 'measure') {
      const measureId = sort.order.measure;
      const measure = session.list.measures.find(candidate => candidate.id === measureId);
      const value = object.measures[measureId];
      if (measure !== undefined && !measure.spoken && value !== undefined && Number.isFinite(value)) {
        parts.push(t('dialogs.objectDetail', {
          label: measure.label,
          value: new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 3 }).format(value),
        }));
      }
    }
    if (object.detail !== undefined && object.detail !== '') {
      parts.push(object.detail);
    }
    return {
      key: object.key,
      label: object.label,
      detail: parts.join(t('dialogs.objectListSeparator')),
      current: object.key === session.currentKey,
    };
  }
}
