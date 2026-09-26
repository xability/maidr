import type { JSX } from 'react';
import { LineChart } from '@mui/x-charts/LineChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function StepLineExample(): JSX.Element {
  return (
    <div>
      <h2>Step Line Chart</h2>
      <p>A price that holds until it changes, drawn with a step curve.</p>
      <MaidrMuiCharts id="mui-step" title="Subscription Price">
        <LineChart
          width={600}
          height={360}
          xAxis={[{ scaleType: 'point', data: ['2020', '2021', '2022', '2023', '2024'], label: 'Year' }]}
          yAxis={[{ label: 'Price ($)' }]}
          series={[{ data: [8, 8, 10, 12, 12], label: 'Price', curve: 'stepAfter' }]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
