import type { JSX } from 'react';
import { FunnelChart, Funnel, LabelList, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { stage: 'Visited', users: 10000 },
  { stage: 'Signed up', users: 2400 },
  { stage: 'Activated', users: 2300 },
  { stage: 'Invited a teammate', users: 780 },
  { stage: 'Paid', users: 100 },
];

export function FunnelChartExample(): JSX.Element {
  return (
    <div>
      <h2>Funnel Chart</h2>
      <p>
        Signup funnel. MAIDR sonifies the <strong>retention</strong> — what
        fraction of the previous stage survived — rather than the raw count,
        because the worst stage is rarely the biggest fall: 2,300 to 100 keeps
        4% while 10,000 to 2,400 keeps 24%.
      </p>
      <MaidrRecharts
        id="funnel-example"
        title="Signup Funnel"
        subtitle="Last 30 days"
        data={data}
        chartType="funnel"
        xKey="stage"
        yKeys={['users']}
        xLabel="Stage"
        yLabel="Users"
      >
        <FunnelChart width={600} height={350}>
          <Tooltip />
          <Funnel dataKey="users" nameKey="stage" data={data} fill="#8884d8" isAnimationActive={false}>
            <LabelList position="right" fill="#333" dataKey="stage" />
          </Funnel>
        </FunnelChart>
      </MaidrRecharts>
    </div>
  );
}
