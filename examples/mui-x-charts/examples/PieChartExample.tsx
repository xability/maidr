import type { JSX } from 'react';
import { PieChart } from '@mui/x-charts/PieChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function PieChartExample(): JSX.Element {
  return (
    <div>
      <h2>Pie Chart</h2>
      <p>Market share of four browsers.</p>
      <MaidrMuiCharts id="mui-pie" title="Browser Market Share">
        <PieChart
          width={500}
          height={320}
          series={[{
            data: [
              { id: 0, value: 64, label: 'Chrome' },
              { id: 1, value: 19, label: 'Safari' },
              { id: 2, value: 5, label: 'Edge' },
              { id: 3, value: 12, label: 'Other' },
            ],
          }]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
