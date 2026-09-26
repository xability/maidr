import type { JSX } from 'react';
import { LineChart } from '@mui/x-charts/LineChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function StackedAreaExample(): JSX.Element {
  return (
    <div>
      <h2>Stacked Area Chart</h2>
      <p>Traffic sources stacked into a daily total.</p>
      <MaidrMuiCharts id="mui-stacked-area" title="Traffic by Source">
        <LineChart
          width={600}
          height={360}
          xAxis={[{ data: [1, 2, 3, 4, 5], label: 'Week' }]}
          yAxis={[{ label: 'Sessions' }]}
          series={[
            { data: [100, 120, 140, 130, 160], label: 'Search', stack: 'total', area: true },
            { data: [60, 70, 65, 80, 90], label: 'Social', stack: 'total', area: true },
            { data: [30, 35, 40, 38, 45], label: 'Direct', stack: 'total', area: true },
          ]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
