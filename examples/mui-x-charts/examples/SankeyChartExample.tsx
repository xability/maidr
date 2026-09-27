import type { JSX } from 'react';
import { SankeyChart } from '@mui/x-charts-pro/SankeyChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function SankeyChartExample(): JSX.Element {
  return (
    <div>
      <h2>Sankey Chart (Pro)</h2>
      <p>Energy from its sources to its uses.</p>
      <MaidrMuiCharts id="mui-sankey" title="Energy Flow">
        <SankeyChart
          width={600}
          height={360}
          series={{
            data: {
              nodes: [
                { id: 'coal', label: 'Coal' },
                { id: 'gas', label: 'Gas' },
                { id: 'power', label: 'Power' },
                { id: 'heat', label: 'Heat' },
              ],
              links: [
                { source: 'coal', target: 'power', value: 50 },
                { source: 'gas', target: 'power', value: 30 },
                { source: 'gas', target: 'heat', value: 20 },
              ],
            },
          }}
        />
      </MaidrMuiCharts>
    </div>
  );
}
