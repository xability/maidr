import type { MonitorService } from '@service/monitor';
import { ToggleMonitorCommand } from '@command/toggle';
import { describe, expect, jest, test } from '@jest/globals';

describe('toggleMonitorCommand', () => {
  test('execute delegates to MonitorService.toggle', () => {
    const monitorService = { toggle: jest.fn() } as unknown as MonitorService;
    const command = new ToggleMonitorCommand(monitorService);

    command.execute();

    expect(monitorService.toggle).toHaveBeenCalledTimes(1);
  });
});
