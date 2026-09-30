/**
 * Tests for CommandPaletteViewModel list navigation: moveUp() from the search
 * box (nothing selected) lands on the last command, and moveUp()/moveDown()
 * from an existing selection step by one.
 */
import type { CommandPaletteService } from '@service/commandPalette';
import { describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { CommandPaletteViewModel, filterCommands } from '@state/viewModel/commandPaletteViewModel';

function createViewModel(): CommandPaletteViewModel {
  const service = {
    toggle: jest.fn(),
    returnToTraceScope: jest.fn(),
  } as unknown as CommandPaletteService;
  const viewModel = new CommandPaletteViewModel(createMaidrStore(), service);
  viewModel.show();
  return viewModel;
}

describe('CommandPaletteViewModel navigation', () => {
  test('moveUp from the search box selects the last command', () => {
    const viewModel = createViewModel();
    const count = viewModel.state.commands.length;
    expect(count).toBeGreaterThan(2);
    expect(viewModel.state.selectedIndex).toBe(-1);

    viewModel.moveUp();

    expect(viewModel.state.selectedIndex).toBe(count - 1);
  });

  test('moveUp from the search box selects the last of a filtered list', () => {
    const viewModel = createViewModel();
    viewModel.updateSearch('move');
    const count = filterCommands(viewModel.state.commands, 'move').length;
    expect(count).toBeGreaterThan(1);

    viewModel.moveUp();

    expect(viewModel.state.selectedIndex).toBe(count - 1);
  });

  test('moveUp and moveDown from a selection step by one', () => {
    const viewModel = createViewModel();
    viewModel.moveDown();
    expect(viewModel.state.selectedIndex).toBe(0);
    viewModel.moveDown();
    viewModel.moveDown();
    expect(viewModel.state.selectedIndex).toBe(2);
    viewModel.moveUp();
    expect(viewModel.state.selectedIndex).toBe(1);
    viewModel.moveUp();
    expect(viewModel.state.selectedIndex).toBe(0);
    viewModel.moveUp();
    expect(viewModel.state.selectedIndex).toBe(0);
  });
});
