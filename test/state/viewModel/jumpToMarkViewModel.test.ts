import type { Context } from '@model/context';
import type { JumpToMarkService } from '@service/jumpToMark';
import type { MarkService } from '@service/mark';
import type { Mark } from '@type/mark';
import { describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { JumpToMarkViewModel } from '@state/viewModel/jumpToMarkViewModel';

/** A stored-mark entry as MarkService.getSetMarks() returns it. */
function setMark(slot: number, mark: Partial<Mark> = {}): { slot: number; mark: Mark } {
  return {
    slot,
    mark: {
      traceId: 't1',
      row: 0,
      col: 0,
      terseText: `terse-${slot}`,
      verboseText: `verbose-${slot}`,
      ...mark,
    },
  };
}

function setup(options: {
  setMarks?: Array<{ slot: number; mark: Mark }>;
  hasMark?: boolean;
  verbose?: boolean;
} = {}): {
  store: ReturnType<typeof createMaidrStore>;
  vm: JumpToMarkViewModel;
  markService: {
    getSetMarks: jest.Mock;
    hasMarkAtSlot: jest.Mock;
    jumpToMark: jest.Mock;
    isVerboseMode: jest.Mock;
  };
  jumpService: { toggle: jest.Mock; returnToTraceScope: jest.Mock };
} {
  const store = createMaidrStore();
  const markService = {
    getSetMarks: jest.fn(() => options.setMarks ?? []),
    hasMarkAtSlot: jest.fn(() => options.hasMark ?? true),
    jumpToMark: jest.fn(),
    isVerboseMode: jest.fn(() => options.verbose ?? false),
  };
  const jumpService = {
    toggle: jest.fn(),
    returnToTraceScope: jest.fn(),
  };

  const vm = new JumpToMarkViewModel(
    store,
    jumpService as unknown as JumpToMarkService,
    markService as unknown as MarkService,
    {} as unknown as Context,
  );

  return { store, vm, markService, jumpService };
}

describe('JumpToMarkViewModel.toggle', () => {
  test('shows the marks from the service and enters the dialog scope', () => {
    const { store, vm, jumpService } = setup({
      setMarks: [setMark(2), setMark(5)],
    });

    vm.toggle();

    expect(store.getState().jumpToMark.visible).toBe(true);
    expect(store.getState().jumpToMark.marks).toEqual([
      { slot: 2, terseText: 'terse-2', verboseText: 'verbose-2' },
      { slot: 5, terseText: 'terse-5', verboseText: 'verbose-5' },
    ]);
    expect(jumpService.toggle).toHaveBeenCalledTimes(1);
  });

  test('coerces a mark with no captured text to empty strings', () => {
    const { store, vm } = setup({
      setMarks: [setMark(0, { terseText: '', verboseText: '' })],
    });

    vm.toggle();

    expect(store.getState().jumpToMark.marks).toEqual([
      { slot: 0, terseText: '', verboseText: '' },
    ]);
  });
});

describe('JumpToMarkViewModel.hide', () => {
  test('clears the dialog and returns to trace scope', () => {
    const { store, vm, jumpService } = setup({ setMarks: [setMark(1)] });
    vm.toggle();

    vm.hide();

    expect(store.getState().jumpToMark.visible).toBe(false);
    expect(store.getState().jumpToMark.marks).toEqual([]);
    expect(jumpService.returnToTraceScope).toHaveBeenCalledTimes(1);
  });
});

describe('JumpToMarkViewModel selection movement', () => {
  test('moveDown then moveUp clamp within the list bounds', () => {
    const { store, vm } = setup({ setMarks: [setMark(2), setMark(5)] });
    vm.toggle();

    vm.moveDown();
    expect(store.getState().jumpToMark.selectedIndex).toBe(1);

    vm.moveDown(); // already at the last mark
    expect(store.getState().jumpToMark.selectedIndex).toBe(1);

    vm.moveUp();
    expect(store.getState().jumpToMark.selectedIndex).toBe(0);

    vm.moveUp(); // already at the first mark
    expect(store.getState().jumpToMark.selectedIndex).toBe(0);
  });

  test('moveDown is a no-op with no marks', () => {
    const { store, vm } = setup({ setMarks: [] });
    vm.toggle();

    vm.moveDown();

    expect(store.getState().jumpToMark.selectedIndex).toBe(0);
  });
});

describe('JumpToMarkViewModel.selectCurrent', () => {
  test('recalls the highlighted mark', () => {
    const { vm, markService, jumpService } = setup({
      setMarks: [setMark(2), setMark(5)],
      hasMark: true,
    });
    vm.toggle();
    vm.moveDown(); // highlight slot 5

    vm.selectCurrent();

    expect(markService.jumpToMark).toHaveBeenCalledWith(5);
    expect(jumpService.returnToTraceScope).toHaveBeenCalledTimes(1);
  });

  test('does nothing when there are no marks', () => {
    const { vm, markService } = setup({ setMarks: [] });
    vm.toggle();

    vm.selectCurrent();

    expect(markService.jumpToMark).not.toHaveBeenCalled();
  });
});

describe('JumpToMarkViewModel.jumpToSlot', () => {
  test('ignores an empty slot', () => {
    const { vm, markService, jumpService } = setup({ hasMark: false });

    vm.jumpToSlot(4);

    expect(markService.jumpToMark).not.toHaveBeenCalled();
    expect(jumpService.returnToTraceScope).not.toHaveBeenCalled();
  });

  test('hides the dialog, returns to trace scope, and recalls a set slot', () => {
    const { store, vm, markService, jumpService } = setup({
      setMarks: [setMark(3)],
      hasMark: true,
    });
    vm.toggle();

    vm.jumpToSlot(3);

    expect(store.getState().jumpToMark.visible).toBe(false);
    expect(jumpService.returnToTraceScope).toHaveBeenCalledTimes(1);
    expect(markService.jumpToMark).toHaveBeenCalledWith(3);
  });
});

describe('JumpToMarkViewModel text mode', () => {
  test('getMarkDisplayText returns terse text in terse mode', () => {
    const { vm } = setup({ verbose: false });

    expect(vm.getMarkDisplayText({ slot: 1, terseText: 'short', verboseText: 'long' }))
      .toBe('short');
  });

  test('getMarkDisplayText returns verbose text in verbose mode', () => {
    const { vm } = setup({ verbose: true });

    expect(vm.getMarkDisplayText({ slot: 1, terseText: 'short', verboseText: 'long' }))
      .toBe('long');
  });

  test('isVerboseMode delegates to the mark service', () => {
    const { vm, markService } = setup({ verbose: true });

    expect(vm.isVerboseMode()).toBe(true);
    expect(markService.isVerboseMode).toHaveBeenCalled();
  });
});

describe('JumpToMarkViewModel.dispose', () => {
  test('hides the dialog on disposal', () => {
    const { store, vm } = setup({ setMarks: [setMark(1)] });
    vm.toggle();

    vm.dispose();

    expect(store.getState().jumpToMark.visible).toBe(false);
  });
});
