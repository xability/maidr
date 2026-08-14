import type { JSX } from 'react';
import { SunburstChart } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const nodes = [
  {
    name: 'Direct',
    children: [
      { name: 'Bookmarks', sessions: 1840 },
      { name: 'Typed', sessions: 920 },
    ],
  },
  {
    name: 'Search',
    children: [
      { name: 'Organic', sessions: 3400 },
      { name: 'Paid', sessions: 1100 },
    ],
  },
  {
    name: 'Referral',
    children: [
      { name: 'Newsletters', sessions: 640 },
      { name: 'Partners', sessions: 380 },
    ],
  },
];

export function SunburstExample(): JSX.Element {
  return (
    <div>
      <h2>Sunburst</h2>
      <p>
        The same hierarchy a treemap draws, laid out as rings. Recharts&apos;{' '}
        <code>&lt;SunburstChart&gt;</code> takes a single root object and draws
        that root&apos;s <strong>children</strong>, so those children are what
        the adapter is given — the declared nodes are then exactly the drawn
        ones, and highlighting lines up ring by ring.
      </p>
      <MaidrRecharts
        id="sunburst-example"
        title="Sessions by Channel"
        data={nodes}
        chartType="sunburst"
        xKey="name"
        yKeys={['sessions']}
      >
        <SunburstChart
          width={420}
          height={420}
          data={{ name: 'All traffic', children: nodes }}
          dataKey="sessions"
        />
      </MaidrRecharts>
    </div>
  );
}
