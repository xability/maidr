import type { JSX } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function StackedBarExample(): JSX.Element {
  return (
    <div>
      <h2>Stacked Bar Chart</h2>
      <p>Energy sources stacked into a yearly total.</p>
      <MaidrMuiCharts id="mui-stacked" title="Electricity Generation by Source">
        <BarChart
          width={600}
          height={360}
          xAxis={[{ scaleType: 'band', data: ['2021', '2022', '2023'], label: 'Year' }]}
          yAxis={[{ label: 'TWh' }]}
          series={[
            { data: [120, 135, 150], label: 'Solar', stack: 'total' },
            { data: [200, 210, 230], label: 'Wind', stack: 'total' },
            { data: [90, 85, 80], label: 'Hydro', stack: 'total' },
          ]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
