import type { JSX } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// Ranks, not points: 1 is top of the table. MAIDR inverts the pitch so first
// place is the highest note and announces the places gained or lost.
const data = [
  { matchday: 1, arsenal: 3, chelsea: 1, everton: 2 },
  { matchday: 2, arsenal: 1, chelsea: 2, everton: 3 },
  { matchday: 3, arsenal: 1, chelsea: 3, everton: 2 },
  { matchday: 4, arsenal: 2, chelsea: 3, everton: 1 },
  { matchday: 5, arsenal: 1, chelsea: 2, everton: 3 },
  { matchday: 6, arsenal: 2, chelsea: 1, everton: 3 },
];

export function BumpChartExample(): JSX.Element {
  return (
    <div>
      <h2>Bump Chart</h2>
      <p>Bump chart showing how three clubs move up and down the table.</p>
      <MaidrRecharts
        id="bump-example"
        title="League Position by Matchday"
        subtitle="Rank 1 is top of the table"
        data={data}
        chartType="bump"
        xKey="matchday"
        yKeys={['arsenal', 'chelsea', 'everton']}
        xLabel="Matchday"
        yLabel="Position"
      >
        <LineChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="matchday" />
          {/* `reversed` puts rank 1 at the top, where a table reader expects it. */}
          <YAxis reversed allowDecimals={false} domain={[1, 3]} />
          <Tooltip />
          <Legend />
          <Line type="linear" dataKey="arsenal" stroke="#8884d8" name="Arsenal" dot />
          <Line type="linear" dataKey="chelsea" stroke="#82ca9d" name="Chelsea" dot />
          <Line type="linear" dataKey="everton" stroke="#ffc658" name="Everton" dot />
        </LineChart>
      </MaidrRecharts>
    </div>
  );
}
