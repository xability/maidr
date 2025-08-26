import type { Context } from '@model/context';
import type { GoToSpecificValueService } from '@service/goToSpecificValue';
import type { XValue } from '@type/navigation';
import type { AppStore } from '../store';
import { AbstractViewModel } from './viewModel';

export class GoToSpecificValueViewModel extends AbstractViewModel<null> {
  private readonly context: Context;
  private readonly goToSpecificValueService: GoToSpecificValueService;

  public constructor(store: AppStore, context: Context, goToSpecificValueService: GoToSpecificValueService) {
    super(store);
    this.context = context;
    this.goToSpecificValueService = goToSpecificValueService;
  }

  public dispose(): void {
    super.dispose();
  }

  public get state(): null {
    return null; // This ViewModel doesn't maintain state, just delegates to service
  }

  public show(): void {
    const currentState = this.context.state;
    if (currentState.type === 'trace') {
      this.goToSpecificValueService.toggle(currentState);
    }
  }

  public hide(): void {
    this.goToSpecificValueService.returnToTraceScope();
  }

  public getAvailableXValues(): XValue[] {
    const currentState = this.context.state;
    if (currentState.type !== 'trace' || currentState.empty) {
      return [];
    }

    const activeTrace = this.context.active;

    if (!activeTrace || !('getAvailableXValues' in activeTrace)) {
      return [];
    }

    const trace = activeTrace as { getAvailableXValues: () => XValue[] };
    return trace.getAvailableXValues();
  }

  /**
   * Get X values with group information for stacked/dodged plots
   * This provides more context than just the basic X values
   */
  public getXValuesWithGroups(): Array<{ value: XValue; group?: string; description: string }> {
    const currentState = this.context.state;
    if (currentState.type !== 'trace' || currentState.empty) {
      return [];
    }

    const activeTrace = this.context.active;

    if (!activeTrace) {
      return [];
    }

    // First try to use the method with group information if available (for SegmentedTrace)
    if ('getXValuesWithGroups' in activeTrace) {
      const trace = activeTrace as { getXValuesWithGroups: () => Array<{ value: any; group: string; description: string }> };
      const valuesWithGroups = trace.getXValuesWithGroups();
      return valuesWithGroups;
    }

    // Fallback to navigable references if available
    if ('getNavigableReferences' in activeTrace) {
      const trace = activeTrace as { getNavigableReferences: () => any[] };
      const references = trace.getNavigableReferences();

      const result = references.map((ref) => {
        // For stacked bars, use the fill value as the group identifier
        let groupLabel: string | undefined;
        if (ref.context?.groupIndex !== undefined) {
          // Try to get the actual fill value from the reference
          if (ref.accessibility?.description) {
            // Extract fill value from description like "Segmented bar at X in Drive: 'r'"
            const match = ref.accessibility.description.match(/in (.+)$/);
            if (match) {
              groupLabel = match[1];
            } else {
              // Fallback to the description itself
              groupLabel = ref.accessibility.description;
            }
          } else {
            // Fallback to generic group label
            groupLabel = `Group ${ref.context.groupIndex + 1}`;
          }
        }

        const enhanced = {
          value: ref.value,
          group: groupLabel,
          description: String(ref.value), // Just show the value, not the full description
        };

        return enhanced;
      });

      return result;
    }

    // Final fallback to basic X values
    return this.getAvailableXValues().map(value => ({
      value,
      description: String(value), // Just show the value, not a description
    }));
  }

  public navigateToXValue(value: XValue): void {
    const activeTrace = this.context.active;
    if (!activeTrace || !('moveToXValue' in activeTrace)) {
      return;
    }
    const trace = activeTrace as { moveToXValue: (value: XValue) => boolean };
    trace.moveToXValue(value);
  }

  public get activeContext(): Context {
    return this.context;
  }
}
