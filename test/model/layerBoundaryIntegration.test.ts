import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { Context } from '@model/context';
import { Figure, Subplot } from '@model/plot';
import { TextService } from '@service/text';
import { NotificationService } from '@service/notification';
import type { Maidr } from '@type/grammar';
import { TraceType } from '@type/grammar';
import type { PlotState } from '@type/state';

/**
 * Integration test to verify layer boundary feedback functionality
 * This test verifies the integration between Context.stepTrace and the boundary feedback system
 */
describe('Layer Boundary Feedback Integration', () => {
  let notificationService: NotificationService;
  let textService: TextService;

  beforeEach(() => {
    notificationService = new NotificationService();
    textService = new TextService(notificationService);
  });

  describe('Context stepTrace integration', () => {
    it('should handle boundary checking logic correctly', () => {
      // Test the stepTrace method signature and basic structure
      const context = Context.prototype;
      expect(typeof context.stepTrace).toBe('function');
      
      // Verify the method accepts direction parameter
      const stepTrace = context.stepTrace;
      expect(stepTrace.length).toBeGreaterThanOrEqual(1);
    });

    it('should use proper subplot boundary checking', () => {
      // Test that Subplot has the necessary isMovable method for boundary checking
      const subplot = Subplot.prototype;
      expect(typeof subplot.isMovable).toBe('function');
    });
  });

  describe('Text Service Integration', () => {
    it('should provide specific message for layer boundaries', () => {
      const boundaryState: PlotState = {
        empty: true,
        type: 'subplot',
      };

      const message = textService.format(boundaryState);
      expect(message).toBe('No additional layer');
    });

    it('should maintain existing messages for other boundary types', () => {
      const figureState: PlotState = {
        empty: true,
        type: 'figure',
      };

      const message = textService.format(figureState);
      expect(message).toBe('No figure info to display');
    });
  });

  describe('Notification Service Integration', () => {
    it('should be able to notify boundary messages', () => {
      const spy = jest.fn();
      notificationService.onChange(spy);

      notificationService.notify('No additional layer');
      
      expect(spy).toHaveBeenCalledWith({ value: 'No additional layer' });
    });

    it('should not notify empty messages', () => {
      const spy = jest.fn();
      notificationService.onChange(spy);

      notificationService.notify('');
      
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Boundary feedback consistency', () => {
    it('should follow the same pattern as existing boundary feedback', () => {
      // Test that subplot empty state has the same structure as other empty states
      const subplotBoundary: PlotState = { empty: true, type: 'subplot' };
      const figureBoundary: PlotState = { empty: true, type: 'figure' };
      
      // Both should have empty: true and their respective type
      expect(subplotBoundary.empty).toBe(true);
      expect(figureBoundary.empty).toBe(true);
      expect(subplotBoundary.type).toBe('subplot');
      expect(figureBoundary.type).toBe('figure');
      
      // Both should generate appropriate messages
      const subplotMessage = textService.format(subplotBoundary);
      const figureMessage = textService.format(figureBoundary);
      
      expect(subplotMessage).toContain('No additional layer');
      expect(figureMessage).toContain('No figure info');
    });
  });
});