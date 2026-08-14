import type { JSX } from 'react';
import { BarChart, Bar, ErrorBar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// `sd` is what the <ErrorBar dataKey> points at, so it is an OFFSET from the
// mean. MAIDR fixes the interval as absolute positions on the value axis and
// the adapter converts, which is why `errorConfig.errorKey` names the same
// field the chart does rather than a pair of bounds.
const data = [
  { treatment: 'Control', mean: 4.2, sd: 0.6 },
  { treatment: 'Nitrogen', mean: 5.5, sd: 0.5 },
  { treatment: 'Phosphate', mean: 5.0, sd: 0.7 },
  { treatment: 'Both', mean: 6.4, sd: 0.4 },
];

export function ErrorBarExample(): JSX.Element {
  return (
    <div>
      <h2>Error Bars</h2>
      <p>
        Mean yield with one standard deviation. Up and down move between the
        lower bound, the estimate and the upper bound; left and right move
        between treatments.
      </p>
      <MaidrRecharts
        id="error-bar-example"
        title="Yield by Treatment"
        subtitle="Mean ± 1 SD"
        data={data}
        chartType="error_bar"
        xKey="treatment"
        yKeys={['mean']}
        errorConfig={{ errorKey: 'sd' }}
        xLabel="Treatment"
        yLabel="Yield (t/ha)"
      >
        <BarChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="treatment" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="mean" fill="#8884d8" isAnimationActive={false}>
            <ErrorBar dataKey="sd" direction="y" width={6} stroke="#333" />
          </Bar>
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
