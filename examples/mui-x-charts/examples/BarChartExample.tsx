import type { JSX } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function BarChartExample(): JSX.Element {
  return (
    <div>
      <h2>Bar Chart</h2>
      <p>Simple bar chart showing quarterly revenue.</p>
      <MaidrMuiCharts id="mui-bar" title="Quarterly Revenue" subtitle="2024 Fiscal Year">
        <BarChart
          width={600}
          height={360}
          xAxis={[{ scaleType: 'band', data: ['Q1', 'Q2', 'Q3', 'Q4'], label: 'Quarter' }]}
          yAxis={[{ label: 'Revenue ($)', width: 60 }]}
          series={[{ data: [4200, 5800, 3900, 7100], label: 'Revenue' }]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
