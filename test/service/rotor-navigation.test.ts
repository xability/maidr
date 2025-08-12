import { beforeEach, describe, expect, it } from '@jest/globals';
import { RotorDirection, RotorNavigationService, RotorNavigationUnit } from '../../src/service/rotor-navigation';

describe('RotorNavigationService', () => {
  let service: RotorNavigationService;

  beforeEach(() => {
    service = new RotorNavigationService();
  });

  afterEach(() => {
    service.dispose();
  });

  describe('initialization', () => {
    it('should start with DATA_POINT as default unit', () => {
      expect(service.getCurrentUnit()).toBe(RotorNavigationUnit.DATA_POINT);
    });

    it('should return correct unit names', () => {
      expect(service.getUnitName(RotorNavigationUnit.DATA_POINT)).toBe('Data point');
      expect(service.getUnitName(RotorNavigationUnit.HIGHER_VALUE)).toBe('Higher value');
      expect(service.getUnitName(RotorNavigationUnit.LOWER_VALUE)).toBe('Lower value');
    });
  });

  describe('cycling navigation units', () => {
    it('should cycle forward through units', () => {
      // Start at DATA_POINT (index 0)
      expect(service.getCurrentUnit()).toBe(RotorNavigationUnit.DATA_POINT);

      // Cycle to HIGHER_VALUE (index 1)
      service.cycleNext();
      expect(service.getCurrentUnit()).toBe(RotorNavigationUnit.HIGHER_VALUE);

      // Cycle to LOWER_VALUE (index 2)
      service.cycleNext();
      expect(service.getCurrentUnit()).toBe(RotorNavigationUnit.LOWER_VALUE);

      // Cycle back to DATA_POINT (wrap around)
      service.cycleNext();
      expect(service.getCurrentUnit()).toBe(RotorNavigationUnit.DATA_POINT);
    });

    it('should cycle backward through units', () => {
      // Start at DATA_POINT (index 0)
      expect(service.getCurrentUnit()).toBe(RotorNavigationUnit.DATA_POINT);

      // Cycle backward to LOWER_VALUE (wrap around)
      service.cyclePrev();
      expect(service.getCurrentUnit()).toBe(RotorNavigationUnit.LOWER_VALUE);

      // Cycle backward to HIGHER_VALUE
      service.cyclePrev();
      expect(service.getCurrentUnit()).toBe(RotorNavigationUnit.HIGHER_VALUE);

      // Cycle backward to DATA_POINT
      service.cyclePrev();
      expect(service.getCurrentUnit()).toBe(RotorNavigationUnit.DATA_POINT);
    });
  });

  describe('events', () => {
    it('should emit unit changed event when cycling next', () => {
      let eventFired = false;
      let emittedEvent: any = null;

      service.onUnitChanged((event) => {
        eventFired = true;
        emittedEvent = event;
      });

      service.cycleNext();

      expect(eventFired).toBe(true);
      expect(emittedEvent).toEqual({
        unit: RotorNavigationUnit.HIGHER_VALUE,
        unitName: 'Higher value',
      });
    });

    it('should emit unit changed event when cycling previous', () => {
      let eventFired = false;
      let emittedEvent: any = null;

      service.onUnitChanged((event) => {
        eventFired = true;
        emittedEvent = event;
      });

      service.cyclePrev();

      expect(eventFired).toBe(true);
      expect(emittedEvent).toEqual({
        unit: RotorNavigationUnit.LOWER_VALUE,
        unitName: 'Lower value',
      });
    });

    it('should emit target not found event', () => {
      let eventFired = false;
      let emittedEvent: any = null;

      service.onTargetNotFound((event) => {
        eventFired = true;
        emittedEvent = event;
      });

      service.emitTargetNotFound(RotorNavigationUnit.HIGHER_VALUE, RotorDirection.FORWARD);

      expect(eventFired).toBe(true);
      expect(emittedEvent).toEqual({
        unit: RotorNavigationUnit.HIGHER_VALUE,
        direction: RotorDirection.FORWARD,
        message: 'No higher value found forward',
      });
    });
  });

  describe('findTargetForValueNavigation', () => {
    it('should return null for DATA_POINT navigation unit', () => {
      const mockContext = {
        active: { constructor: { name: 'Candlestick' } },
      } as any;

      const result = service.findTargetForValueNavigation(
        mockContext,
        RotorDirection.FORWARD,
        RotorNavigationUnit.DATA_POINT,
      );

      expect(result).toBeNull();
    });

    it('should return null when no current trace', () => {
      const mockContext = {
        active: null,
      } as any;

      const result = service.findTargetForValueNavigation(
        mockContext,
        RotorDirection.FORWARD,
        RotorNavigationUnit.HIGHER_VALUE,
      );

      expect(result).toBeNull();
    });

    it('should return null for unsupported trace types', () => {
      const mockContext = {
        active: { constructor: { name: 'UnsupportedTrace' } },
      } as any;

      const result = service.findTargetForValueNavigation(
        mockContext,
        RotorDirection.FORWARD,
        RotorNavigationUnit.HIGHER_VALUE,
      );

      expect(result).toBeNull();
    });
  });

  describe('candlestick navigation', () => {
    it('should find higher value in candlestick trace', () => {
      const mockTrace = {
        constructor: { name: 'Candlestick' },
        row: 1,
        col: 0,
        values: [
          [null, 10, 15, 8, 12], // volatility, open, high, low, close
          [null, 9, 14, 7, 11], // Current position (close=11)
          [null, 11, 16, 9, 13], // Higher close value (13)
          [null, 8, 13, 6, 10], // Lower close value (10)
        ],
        currentSegmentType: null, // Will use Close (index 4)
        sections: ['volatility', 'open', 'high', 'low', 'close'],
      };

      const mockContext = {
        active: mockTrace,
      } as any;

      const result = service.findTargetForValueNavigation(
        mockContext,
        RotorDirection.FORWARD,
        RotorNavigationUnit.HIGHER_VALUE,
      );

      expect(result).toEqual({ row: 2, col: 0 });
    });

    it('should find lower value in candlestick trace', () => {
      const mockTrace = {
        constructor: { name: 'Candlestick' },
        row: 1,
        col: 0,
        values: [
          [null, 10, 15, 8, 12], // volatility, open, high, low, close
          [null, 9, 14, 7, 11], // Current position (close=11)
          [null, 11, 16, 9, 13], // Higher close value (13)
          [null, 8, 13, 6, 10], // Lower close value (10)
        ],
        currentSegmentType: null,
        sections: ['volatility', 'open', 'high', 'low', 'close'],
      };

      const mockContext = {
        active: mockTrace,
      } as any;

      const result = service.findTargetForValueNavigation(
        mockContext,
        RotorDirection.FORWARD,
        RotorNavigationUnit.LOWER_VALUE,
      );

      expect(result).toEqual({ row: 3, col: 0 });
    });

    it('should return null when no higher value found in candlestick', () => {
      const mockTrace = {
        constructor: { name: 'Candlestick' },
        row: 1,
        col: 0,
        values: [
          [null, 10, 15, 8, 12], // volatility, open, high, low, close
          [null, 9, 14, 7, 15], // Current position (close=15) - highest
          [null, 11, 16, 9, 13], // Lower close value (13)
          [null, 8, 13, 6, 10], // Lower close value (10)
        ],
        currentSegmentType: null,
        sections: ['volatility', 'open', 'high', 'low', 'close'],
      };

      const mockContext = {
        active: mockTrace,
      } as any;

      const result = service.findTargetForValueNavigation(
        mockContext,
        RotorDirection.FORWARD,
        RotorNavigationUnit.HIGHER_VALUE,
      );

      expect(result).toBeNull();
    });
  });

  describe('line trace navigation', () => {
    it('should find higher value in line trace', () => {
      const mockTrace = {
        constructor: { name: 'LineTrace' },
        row: 0,
        col: 1,
        values: [
          [5, 10, 15, 8, 12], // Current row (current value = 10)
          [7, 9, 11, 6, 14], // Other row (not searched)
        ],
      };

      const mockContext = {
        active: mockTrace,
      } as any;

      const result = service.findTargetForValueNavigation(
        mockContext,
        RotorDirection.FORWARD,
        RotorNavigationUnit.HIGHER_VALUE,
      );

      expect(result).toEqual({ row: 0, col: 2 }); // Value 15 at column 2
    });

    it('should find lower value in line trace', () => {
      const mockTrace = {
        constructor: { name: 'LineTrace' },
        row: 0,
        col: 1,
        values: [
          [5, 10, 15, 8, 12], // Current row (current value = 10)
          [7, 9, 11, 6, 14], // Other row (not searched)
        ],
      };

      const mockContext = {
        active: mockTrace,
      } as any;

      const result = service.findTargetForValueNavigation(
        mockContext,
        RotorDirection.FORWARD,
        RotorNavigationUnit.LOWER_VALUE,
      );

      expect(result).toEqual({ row: 0, col: 3 }); // Value 8 at column 3
    });
  });

  describe('heatmap navigation', () => {
    it('should find higher value horizontally in heatmap', () => {
      const mockTrace = {
        constructor: { name: 'Heatmap' },
        row: 1,
        col: 1,
        values: [
          [1, 2, 3, 4],
          [5, 6, 7, 8], // Current row (current value = 6)
          [9, 10, 11, 12],
        ],
      };

      const mockContext = {
        active: mockTrace,
      } as any;

      const result = service.findTargetForValueNavigation(
        mockContext,
        RotorDirection.FORWARD,
        RotorNavigationUnit.HIGHER_VALUE,
      );

      expect(result).toEqual({ row: 1, col: 2 }); // Value 7 at column 2
    });

    it('should find higher value vertically in heatmap', () => {
      const mockTrace = {
        constructor: { name: 'Heatmap' },
        row: 1,
        col: 1,
        values: [
          [1, 2, 3, 4],
          [5, 6, 7, 8], // Current row (current value = 6)
          [9, 10, 11, 12],
        ],
      };

      const mockContext = {
        active: mockTrace,
      } as any;

      const result = service.findTargetForValueNavigation(
        mockContext,
        RotorDirection.UPWARD,
        RotorNavigationUnit.LOWER_VALUE,
      );

      expect(result).toEqual({ row: 0, col: 1 }); // Value 2 at row 0
    });
  });

  describe('disposal', () => {
    it('should dispose without errors', () => {
      expect(() => service.dispose()).not.toThrow();
    });
  });
});
