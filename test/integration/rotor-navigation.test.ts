import { beforeEach, describe, expect, it } from '@jest/globals';
import { RotorNextCommand, RotorPrevCommand } from '../../src/command/rotor';
import { RotorAwareMoveRightCommand } from '../../src/command/rotor-aware-move';
import { RotorNavigationService, RotorNavigationUnit } from '../../src/service/rotor-navigation';

describe('Rotor Navigation Integration', () => {
  let rotorService: RotorNavigationService;
  let mockCommandContext: any;

  beforeEach(() => {
    rotorService = new RotorNavigationService();

    // Mock command context
    mockCommandContext = {
      context: {
        active: {
          constructor: { name: 'LineTrace' },
          row: 0,
          col: 1,
          values: [
            [5, 10, 15, 8, 12], // Current row (current value = 10)
            [7, 9, 11, 6, 14], // Other row (not searched)
          ],
        },
        moveOnce: jest.fn(),
        moveToIndex: jest.fn(),
      },
      rotorNavigationService: rotorService,
      audioService: {},
      autoplayService: {},
      highlightService: {},
      brailleViewModel: {},
      chatViewModel: {},
      helpViewModel: {},
      reviewViewModel: {},
      settingsViewModel: {},
      textViewModel: {},
    };
  });

  afterEach(() => {
    rotorService.dispose();
  });

  describe('Rotor cycling commands', () => {
    it('should cycle through navigation units with RotorNextCommand', () => {
      const rotorNextCommand = new RotorNextCommand(mockCommandContext);

      // Start at DATA_POINT
      expect(rotorService.getCurrentUnit()).toBe(RotorNavigationUnit.DATA_POINT);

      // Cycle to HIGHER_VALUE
      rotorNextCommand.execute();
      expect(rotorService.getCurrentUnit()).toBe(RotorNavigationUnit.HIGHER_VALUE);

      // Cycle to LOWER_VALUE
      rotorNextCommand.execute();
      expect(rotorService.getCurrentUnit()).toBe(RotorNavigationUnit.LOWER_VALUE);

      // Cycle back to DATA_POINT (wrap around)
      rotorNextCommand.execute();
      expect(rotorService.getCurrentUnit()).toBe(RotorNavigationUnit.DATA_POINT);
    });

    it('should cycle backwards through navigation units with RotorPrevCommand', () => {
      const rotorPrevCommand = new RotorPrevCommand(mockCommandContext);

      // Start at DATA_POINT
      expect(rotorService.getCurrentUnit()).toBe(RotorNavigationUnit.DATA_POINT);

      // Cycle backwards to LOWER_VALUE (wrap around)
      rotorPrevCommand.execute();
      expect(rotorService.getCurrentUnit()).toBe(RotorNavigationUnit.LOWER_VALUE);

      // Cycle backwards to HIGHER_VALUE
      rotorPrevCommand.execute();
      expect(rotorService.getCurrentUnit()).toBe(RotorNavigationUnit.HIGHER_VALUE);

      // Cycle backwards to DATA_POINT
      rotorPrevCommand.execute();
      expect(rotorService.getCurrentUnit()).toBe(RotorNavigationUnit.DATA_POINT);
    });
  });

  describe('Rotor-aware movement commands', () => {
    it('should use normal movement when rotor is set to DATA_POINT', () => {
      const moveRightCommand = new RotorAwareMoveRightCommand(mockCommandContext);

      // Should be at DATA_POINT by default
      expect(rotorService.getCurrentUnit()).toBe(RotorNavigationUnit.DATA_POINT);

      moveRightCommand.execute();

      // Should use normal movement (moveOnce)
      expect(mockCommandContext.context.moveOnce).toHaveBeenCalledWith('FORWARD');
      expect(mockCommandContext.context.moveToIndex).not.toHaveBeenCalled();
    });

    it('should use rotor navigation when rotor is set to HIGHER_VALUE', () => {
      const moveRightCommand = new RotorAwareMoveRightCommand(mockCommandContext);

      // Set rotor to HIGHER_VALUE
      rotorService.cycleNext(); // DATA_POINT -> HIGHER_VALUE
      expect(rotorService.getCurrentUnit()).toBe(RotorNavigationUnit.HIGHER_VALUE);

      moveRightCommand.execute();

      // Should use rotor navigation (moveToIndex)
      expect(mockCommandContext.context.moveOnce).not.toHaveBeenCalled();
      expect(mockCommandContext.context.moveToIndex).toHaveBeenCalledWith(0, 2); // Higher value at col 2
    });

    it('should emit target not found when no higher value exists', () => {
      let targetNotFoundEmitted = false;
      let emittedEvent: any = null;

      rotorService.onTargetNotFound((event) => {
        targetNotFoundEmitted = true;
        emittedEvent = event;
      });

      // Create a mock context where current value is the highest
      mockCommandContext.context.active.values = [
        [5, 10, 8, 7, 6], // Current value = 10 (highest)
      ];
      mockCommandContext.context.active.col = 1;

      const moveRightCommand = new RotorAwareMoveRightCommand(mockCommandContext);

      // Set rotor to HIGHER_VALUE
      rotorService.cycleNext(); // DATA_POINT -> HIGHER_VALUE

      moveRightCommand.execute();

      // Should emit target not found
      expect(targetNotFoundEmitted).toBe(true);
      expect(emittedEvent.unit).toBe(RotorNavigationUnit.HIGHER_VALUE);
      expect(emittedEvent.message).toBe('No higher value found forward');

      // Should not move
      expect(mockCommandContext.context.moveOnce).not.toHaveBeenCalled();
      expect(mockCommandContext.context.moveToIndex).not.toHaveBeenCalled();
    });
  });

  describe('Event emission', () => {
    it('should emit unit changed events when cycling', () => {
      let unitChangedEmitted = false;
      let emittedEvent: any = null;

      rotorService.onUnitChanged((event) => {
        unitChangedEmitted = true;
        emittedEvent = event;
      });

      rotorService.cycleNext();

      expect(unitChangedEmitted).toBe(true);
      expect(emittedEvent.unit).toBe(RotorNavigationUnit.HIGHER_VALUE);
      expect(emittedEvent.unitName).toBe('Higher value');
    });
  });
});
