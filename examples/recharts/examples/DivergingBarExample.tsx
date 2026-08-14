import type { JSX } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Orientation } from '../../../src/type/grammar';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// The left-hand side carries NEGATIVE values, which is what
// `stackOffset="sign"` draws back to back — and what MAIDR reads as the side
// rather than as the magnitude.
const data = [
  { band: '0-9', men: -2_140_000, women: 2_040_000 },
  { band: '10-19', men: -2_020_000, women: 1_930_000 },
  { band: '20-29', men: -1_880_000, women: 1_910_000 },
  { band: '30-39', men: -1_760_000, women: 1_820_000 },
  { band: '40-49', men: -1_540_000, women: 1_610_000 },
  { band: '50-59', men: -1_290_000, women: 1_400_000 },
];

export function DivergingBarExample(): JSX.Element {
  return (
    <div>
      <h2>Diverging Bar Chart</h2>
      <p>
        A population pyramid. The sign is a <strong>direction</strong>, not a
        magnitude: MAIDR pitches the size of the bar and announces which side
        it points to, so the largest cohort on the left is not heard as the
        smallest note on the chart. Each band also announces the{' '}
        <strong>balance</strong> — what one side has over the other — which is
        the subtraction the two sides are drawn back to back to support.
      </p>
      <MaidrRecharts
        id="diverging-example"
        title="Population by Age Band"
        subtitle="Men and women"
        data={data}
        chartType="diverging_bar"
        xKey="band"
        yKeys={['men', 'women']}
        fillKeys={['Men', 'Women']}
        orientation={Orientation.HORIZONTAL}
        xLabel="Age band"
        yLabel="People"
      >
        <BarChart width={600} height={400} layout="vertical" stackOffset="sign" data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="band" />
          <Tooltip />
          <Legend />
          <Bar dataKey="men" name="Men" stackId="sides" fill="#8884d8" isAnimationActive={false} />
          <Bar dataKey="women" name="Women" stackId="sides" fill="#82ca9d" isAnimationActive={false} />
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
