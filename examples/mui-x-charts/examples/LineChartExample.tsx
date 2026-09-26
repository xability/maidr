import type { JSX } from 'react';
import { LineChart } from '@mui/x-charts/LineChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function LineChartExample(): JSX.Element {
  return (
    <div>
      <h2>Line Chart</h2>
      <p>Two cities' average monthly temperature.</p>
      <MaidrMuiCharts id="mui-line" title="Average Temperature">
        <LineChart
          width={600}
          height={360}
          xAxis={[{ scaleType: 'point', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], label: 'Month' }]}
          yAxis={[{ label: 'Temperature (°C)' }]}
          series={[
            { data: [5, 7, 10, 13, 17, 20], label: 'Seattle' },
            { data: [12, 14, 17, 21, 25, 29], label: 'Austin' },
          ]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
