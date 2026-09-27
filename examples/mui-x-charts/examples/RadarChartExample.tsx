import type { JSX } from 'react';
import { RadarChart } from '@mui/x-charts/RadarChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function RadarChartExample(): JSX.Element {
  return (
    <div>
      <h2>Radar Chart</h2>
      <p>Two players' skills on four spokes.</p>
      <MaidrMuiCharts id="mui-radar" title="Player Skills">
        <RadarChart
          width={500}
          height={380}
          series={[
            { data: [80, 65, 90, 70], label: 'Alex' },
            { data: [60, 85, 70, 90], label: 'Sam' },
          ]}
          radar={{ max: 100, metrics: ['Speed', 'Power', 'Accuracy', 'Stamina'] }}
        />
      </MaidrMuiCharts>
    </div>
  );
}
