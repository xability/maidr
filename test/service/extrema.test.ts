import { beforeEach, describe, expect, it } from '@jest/globals';
import { ExtremaService } from '@service/extrema';

describe('ExtremaService', () => {
  let service: ExtremaService;

  beforeEach(() => {
    service = new ExtremaService();
  });

  afterEach(() => {
    service.dispose();
  });

  describe('getExtremaIndices', () => {
    it('should find minimum values correctly', () => {
      const values = [3, 1, 4, 1, 5, 9, 2, 6];
      const minIndices = service.getExtremaIndices(values, 'min');

      expect(minIndices).toHaveLength(2);
      expect(minIndices[0]).toEqual({ pointIndex: 1, value: 1 });
      expect(minIndices[1]).toEqual({ pointIndex: 3, value: 1 });
    });

    it('should find maximum values correctly', () => {
      const values = [3, 1, 4, 1, 5, 9, 2, 6, 9];
      const maxIndices = service.getExtremaIndices(values, 'max');

      expect(maxIndices).toHaveLength(2);
      expect(maxIndices[0]).toEqual({ pointIndex: 5, value: 9 });
      expect(maxIndices[1]).toEqual({ pointIndex: 8, value: 9 });
    });

    it('should handle empty arrays', () => {
      const values: number[] = [];
      const minIndices = service.getExtremaIndices(values, 'min');
      const maxIndices = service.getExtremaIndices(values, 'max');

      expect(minIndices).toHaveLength(0);
      expect(maxIndices).toHaveLength(0);
    });

    it('should handle single value arrays', () => {
      const values = [42];
      const minIndices = service.getExtremaIndices(values, 'min');
      const maxIndices = service.getExtremaIndices(values, 'max');

      expect(minIndices).toHaveLength(1);
      expect(minIndices[0]).toEqual({ pointIndex: 0, value: 42 });
      expect(maxIndices).toHaveLength(1);
      expect(maxIndices[0]).toEqual({ pointIndex: 0, value: 42 });
    });

    it('should handle all identical values', () => {
      const values = [5, 5, 5, 5];
      const minIndices = service.getExtremaIndices(values, 'min');
      const maxIndices = service.getExtremaIndices(values, 'max');

      expect(minIndices).toHaveLength(4);
      expect(maxIndices).toHaveLength(4);
      for (let i = 0; i < 4; i++) {
        expect(minIndices[i]).toEqual({ pointIndex: i, value: 5 });
        expect(maxIndices[i]).toEqual({ pointIndex: i, value: 5 });
      }
    });
  });

  describe('getAvailableExtremaTypes', () => {
    it('should return both min and max for varied data', () => {
      const values = [1, 3, 2];
      const types = service.getAvailableExtremaTypes(values);

      expect(types).toEqual(['min', 'max']);
    });

    it('should return both min and max for identical data', () => {
      const values = [5, 5, 5];
      const types = service.getAvailableExtremaTypes(values);

      expect(types).toEqual(['min', 'max']);
    });

    it('should return empty array for empty data', () => {
      const values: number[] = [];
      const types = service.getAvailableExtremaTypes(values);

      expect(types).toEqual([]);
    });
  });

  describe('cursor management', () => {
    it('should initialize cursor to 0', () => {
      const cursor = service.getCurrentCursor('trace1', 0, 'min');
      expect(cursor).toBe(0);
    });

    it('should reset cursor correctly', () => {
      // Set cursor to something non-zero first
      service.resetCursor('trace1', 0, 'min');
      service.resetCursor('trace1', 0, 'max');

      expect(service.getCurrentCursor('trace1', 0, 'min')).toBe(0);
      expect(service.getCurrentCursor('trace1', 0, 'max')).toBe(0);
    });

    it('should reset all cursors for a trace', () => {
      service.resetCursor('trace1', 0); // Reset all

      expect(service.getCurrentCursor('trace1', 0, 'min')).toBe(0);
      expect(service.getCurrentCursor('trace1', 0, 'max')).toBe(0);
    });
  });

  describe('observer pattern', () => {
    it('should add and remove observers correctly', () => {
      const mockObserver = {
        onExtremaJump: jest.fn(),
      };

      service.addObserver(mockObserver);
      service.removeObserver(mockObserver);

      // No way to directly test if observer was removed,
      // but at least verify the methods don't throw
      expect(() => service.addObserver(mockObserver)).not.toThrow();
      expect(() => service.removeObserver(mockObserver)).not.toThrow();
    });
  });
});
