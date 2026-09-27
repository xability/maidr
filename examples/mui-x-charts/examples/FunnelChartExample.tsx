import type { JSX } from 'react';
import { FunnelChart } from '@mui/x-charts-pro/FunnelChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function FunnelChartExample(): JSX.Element {
  return (
    <div>
      <h2>Funnel Chart (Pro)</h2>
      <p>Visitors at each step of checkout.</p>
      <MaidrMuiCharts id="mui-funnel" title="Checkout Funnel">
        <FunnelChart
          width={500}
          height={340}
          series={[{
            data: [
              { value: 2000, label: 'Visit' },
              { value: 800, label: 'Cart' },
              { value: 300, label: 'Purchase' },
            ],
          }]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
