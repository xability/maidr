import type { PayloadAction } from '@reduxjs/toolkit';
import type { ObjectListRow, ObjectListService, ObjectListView } from '@service/objectList';
import type { AppStore } from '@state/store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';
import { t } from '@util/i18n';

/** How many rows PageUp and PageDown move. */
const PAGE = 10;

/**
 * A message for the dialog's own live region: what moving focus cannot say.
 * The id changes with every message, so saying the same thing twice --
 * pressing Up again at the top -- is announced twice.
 */
export interface ObjectListMessage {
  id: number;
  text: string;
}

export interface ObjectListState {
  visible: boolean;
  title: string;
  description: string;
  summary: string;
  sortLabel: string;
  filterLabel: string;
  canSort: boolean;
  canFilter: boolean;
  rows: ObjectListRow[];
  selectedIndex: number;
  /**
   * Counts the arrangements the list has been shown in -- each opening, each
   * new order, each new filter. The dialog keys its rows by it, so a new
   * arrangement mounts new rows and moving focus onto the first is a focus
   * change the screen reader announces, even when the selection was already
   * on row 0.
   */
  revision: number;
  /**
   * Whether the selected row should say the new order or filter before its
   * own name, until the reader moves. Set when the order or filter changed
   * from the keyboard: the summary and the first object then arrive as one
   * utterance on the focus move, instead of a live region and a focus move
   * talking over each other.
   */
  announceSummary: boolean;
  /**
   * Whether focus should stay where it is rather than follow the selection:
   * set only when a button changed the order or filter, so pressing it again
   * presses it again. Any key that moves the list or the selection clears it,
   * from wherever focus was -- a key that changed the list while focus stayed
   * on a button would change it out of earshot.
   */
  keepFocus: boolean;
  message: ObjectListMessage | null;
}

const initialState: ObjectListState = {
  visible: false,
  title: '',
  description: '',
  summary: '',
  sortLabel: '',
  filterLabel: '',
  canSort: false,
  canFilter: false,
  rows: [],
  selectedIndex: 0,
  revision: 0,
  announceSummary: false,
  keepFocus: false,
  message: null,
};

interface ArrangePayload {
  view: ObjectListView;
  selectedIndex: number;
  announceSummary: boolean;
  keepFocus: boolean;
}

const objectListSlice = createSlice({
  name: 'objectList',
  initialState,
  reducers: {
    show(state, action: PayloadAction<ArrangePayload>): ObjectListState {
      return {
        ...arranged(state, action.payload),
        visible: true,
        message: null,
      };
    },
    arrange(state, action: PayloadAction<ArrangePayload>): ObjectListState {
      return arranged(state, action.payload);
    },
    // The rows stay: the dialog is unmounted when the chart has focus again,
    // and a row that vanished before then would drop focus to the page.
    hide(state): void {
      state.visible = false;
      state.announceSummary = false;
    },
    select(state, action: PayloadAction<number>): void {
      state.selectedIndex = action.payload;
      state.announceSummary = false;
      state.keepFocus = false;
    },
    say(state, action: PayloadAction<string>): void {
      state.message = { id: (state.message?.id ?? 0) + 1, text: action.payload };
    },
    reset(): ObjectListState {
      return initialState;
    },
  },
});

/**
 * The state a view puts the list in.
 * @param state - The state before
 * @param payload - The view, the row to select, and whether to say the summary
 * @returns The state after
 */
function arranged(state: ObjectListState, payload: ArrangePayload): ObjectListState {
  const { view } = payload;
  return {
    ...state,
    title: view.title,
    description: view.description,
    summary: view.summary,
    sortLabel: view.sortLabel,
    filterLabel: view.filterLabel,
    canSort: view.canSort,
    canFilter: view.canFilter,
    rows: [...view.rows],
    selectedIndex: payload.selectedIndex,
    revision: state.revision + 1,
    announceSummary: payload.announceSummary,
    keepFocus: payload.keepFocus,
  };
}

const { show, arrange, hide, select, say, reset } = objectListSlice.actions;

/** Where a key or a button asked the list to change from. */
export type ObjectListOrigin = 'keyboard' | 'button';

/**
 * The object list dialog's state: the rows the service arranged, which one is
 * selected, and what the dialog has to say that focus does not.
 */
export class ObjectListViewModel extends AbstractViewModel<ObjectListState> {
  private readonly service: ObjectListService;

  public constructor(store: AppStore, service: ObjectListService) {
    super(store);
    this.service = service;
  }

  public override dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  public get state(): ObjectListState {
    return this.store.getState().objectList;
  }

  /**
   * Whether the layer the reader is on has a list to open.
   * @returns True when there is one
   */
  public isAvailable(): boolean {
    return this.service.isAvailable();
  }

  /**
   * Opens the list on the object the reader is on.
   *
   * The rows are in the store before the scope changes, so the dialog has
   * them on the render that mounts it.
   * @returns False when the layer has no list
   */
  public open(): boolean {
    const view = this.service.open();
    if (view === null) {
      return false;
    }
    this.store.dispatch(show({ view, selectedIndex: view.currentIndex, announceSummary: false, keepFocus: false }));
    this.service.enterScope();
    return true;
  }

  /** Closes the list without moving. */
  public hide(): void {
    this.store.dispatch(hide());
    this.service.close();
  }

  public moveUp(): void {
    this.moveBy(-1);
  }

  public moveDown(): void {
    this.moveBy(1);
  }

  public pageUp(): void {
    this.moveBy(-PAGE);
  }

  public pageDown(): void {
    this.moveBy(PAGE);
  }

  public moveToFirst(): void {
    this.moveTo(0);
  }

  public moveToLast(): void {
    this.moveTo(this.state.rows.length - 1);
  }

  /**
   * Selects a row, as a click does, without jumping.
   * @param index - The row
   */
  public moveTo(index: number): void {
    const { rows, selectedIndex } = this.state;
    if (rows.length === 0) {
      return;
    }
    const target = Math.max(0, Math.min(rows.length - 1, index));
    if (target === selectedIndex) {
      // A press that cannot move says why, rather than nothing.
      this.store.dispatch(say(t(index <= 0 ? 'dialogs.objectListTop' : 'dialogs.objectListEnd')));
      return;
    }
    this.store.dispatch(select(target));
  }

  /** Jumps to the selected object. */
  public selectCurrent(): void {
    const row = this.state.rows[this.state.selectedIndex];
    if (row === undefined) {
      return;
    }
    // Closed first, so the jump is announced on the chart rather than into a
    // dialog on its way out; the service waits for the chart to have focus.
    this.hide();
    this.service.moveToObject(row.key, row.label);
  }

  /**
   * Jumps to a row, as clicking it does.
   * @param index - The row
   */
  public selectIndex(index: number): void {
    if (this.state.rows[index] === undefined) {
      return;
    }
    this.store.dispatch(select(index));
    this.selectCurrent();
  }

  /**
   * Steps to another order.
   * @param step - 1 for the next, -1 for the previous
   * @param origin - The keyboard, which moves focus to the first row, or a
   * button, which keeps focus where the reader pressed it
   */
  public cycleSort(step: 1 | -1, origin: ObjectListOrigin = 'keyboard'): void {
    const view = this.service.cycleSort(step);
    if (view === null) {
      this.store.dispatch(say(t('dialogs.objectListOneOrder')));
      return;
    }
    this.rearrange(view, origin);
  }

  /**
   * Steps to another filter.
   * @param step - 1 for the next, -1 for the previous
   * @param origin - The keyboard or a button, as for {@link cycleSort}
   */
  public cycleFilter(step: 1 | -1, origin: ObjectListOrigin = 'keyboard'): void {
    const view = this.service.cycleFilter(step);
    if (view === null) {
      this.store.dispatch(say(t('dialogs.objectListNoFilters')));
      return;
    }
    this.rearrange(view, origin);
  }

  /**
   * Shows the list in a new arrangement, from its first row.
   *
   * From the keyboard, focus goes to the new first row, which says the new
   * order or filter as it is focused. From a button, focus stays on the
   * button -- moving it to a row would turn the next Enter, meant to press
   * the button again, into a jump -- so the live region says it instead.
   * @param view - The list in its new arrangement
   * @param origin - What asked for it
   */
  private rearrange(view: ObjectListView, origin: ObjectListOrigin): void {
    const fromKeyboard = origin === 'keyboard';
    this.store.dispatch(arrange({
      view,
      selectedIndex: 0,
      announceSummary: fromKeyboard,
      keepFocus: !fromKeyboard,
    }));
    if (!fromKeyboard) {
      this.store.dispatch(say(view.summary));
    }
  }

  /**
   * Moves the selection by a number of rows, stopping at the ends.
   * @param delta - How many rows, up when negative
   */
  private moveBy(delta: number): void {
    this.moveTo(this.state.selectedIndex + delta);
  }
}

export default objectListSlice.reducer;
