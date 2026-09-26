import type { JSX } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function HorizontalBarExample(): JSX.Element {
  return (
    <div>
      <h2>Horizontal Bar Chart</h2>
      <p>Bars laid along the y axis with the chart's layout prop.</p>
      <MaidrMuiCharts id="mui-horizontal" title="Favorite Fruit">
        <BarChart
          width={600}
          height={360}
          layout="horizontal"
          yAxis={[{ scaleType: 'band', data: ['Apple', 'Banana', 'Cherry', 'Grape'], label: 'Fruit', width: 80 }]}
          xAxis={[{ label: 'Votes' }]}
          series={[{ data: [34, 21, 45, 18], label: 'Votes' }]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
