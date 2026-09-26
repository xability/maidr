import type { JSX } from 'react';
import { PieChart } from '@mui/x-charts/PieChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function DoughnutChartExample(): JSX.Element {
  return (
    <div>
      <h2>Doughnut Chart</h2>
      <p>A pie with an inner radius, starting at 3 o'clock.</p>
      <MaidrMuiCharts id="mui-doughnut" title="Time Spent per Day">
        <PieChart
          width={500}
          height={320}
          series={[{
            innerRadius: 60,
            startAngle: 90,
            endAngle: 450,
            data: [
              { id: 'sleep', value: 8, label: 'Sleep' },
              { id: 'work', value: 9, label: 'Work' },
              { id: 'leisure', value: 4, label: 'Leisure' },
              { id: 'other', value: 3, label: 'Other' },
            ],
          }]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
