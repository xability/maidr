import type { JSX } from 'react';
import { LineChart } from '@mui/x-charts/LineChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function AreaChartExample(): JSX.Element {
  return (
    <div>
      <h2>Area Chart</h2>
      <p>A line chart series with its area filled.</p>
      <MaidrMuiCharts id="mui-area" title="Website Visitors">
        <LineChart
          width={600}
          height={360}
          xAxis={[{ data: [1, 2, 3, 4, 5, 6, 7], label: 'Day' }]}
          yAxis={[{ label: 'Visitors' }]}
          series={[{ data: [320, 410, 380, 520, 610, 450, 390], label: 'Visitors', area: true }]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
