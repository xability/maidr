import type { JSX } from 'react';
import { Sankey, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// The same node set repeats at each stage, which is what makes this an
// alluvial rather than a sankey: the diagram tracks one cohort moving between
// the same states over time.
const nodes = [
  { name: 'Free (Q1)' },
  { name: 'Paid (Q1)' },
  { name: 'Free (Q2)' },
  { name: 'Paid (Q2)' },
  { name: 'Churned (Q2)' },
];

const links = [
  { source: 0, target: 2, value: 420 },
  { source: 0, target: 3, value: 130 },
  { source: 0, target: 4, value: 90 },
  { source: 1, target: 3, value: 260 },
  { source: 1, target: 4, value: 40 },
];

export function AlluvialExample(): JSX.Element {
  return (
    <div>
      <h2>Alluvial Diagram</h2>
      <p>
        Cohort movement between plans, quarter over quarter. Following a ribbon
        is the primary move: MAIDR navigates the graph rather than a grid, so
        arrow keys step between a node and the flows that leave it.
      </p>
      <MaidrRecharts
        id="alluvial-example"
        title="Cohort Movement"
        subtitle="Q1 to Q2"
        data={links}
        chartType="alluvial"
        xKey="source"
        yKeys={['value']}
        flowConfig={{ targetKey: 'target', nodes }}
        xLabel="Stage"
        yLabel="Accounts"
      >
        <Sankey
          width={600}
          height={350}
          data={{ nodes, links }}
          nodePadding={40}
          margin={{ top: 10, right: 120, bottom: 10, left: 10 }}
          link={{ stroke: '#8884d8' }}
        >
          <Tooltip />
        </Sankey>
      </MaidrRecharts>
    </div>
  );
}
