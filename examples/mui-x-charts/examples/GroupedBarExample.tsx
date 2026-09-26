import type { JSX } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

const dataset = [
  { quarter: 'Q1', north: 42, south: 31 },
  { quarter: 'Q2', north: 58, south: 44 },
  { quarter: 'Q3', north: 39, south: 52 },
  { quarter: 'Q4', north: 71, south: 60 },
];

export function GroupedBarExample(): JSX.Element {
  return (
    <div>
      <h2>Grouped Bar Chart</h2>
      <p>Two regions side by side, read from a shared dataset.</p>
      <MaidrMuiCharts id="mui-grouped" title="Units Sold by Region">
        <BarChart
          width={600}
          height={360}
          dataset={dataset}
          xAxis={[{ scaleType: 'band', dataKey: 'quarter', label: 'Quarter' }]}
          yAxis={[{ label: 'Units' }]}
          series={[
            { dataKey: 'north', label: 'North' },
            { dataKey: 'south', label: 'South' },
          ]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
