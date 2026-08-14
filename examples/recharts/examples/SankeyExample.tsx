import type { JSX } from 'react';
import { Sankey, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// Each node appears once, and the ribbons carry one budget from left to
// right — that is what makes this a sankey rather than an alluvial, where the
// same node set repeats at every stage.
const nodes = [
  { name: 'Crude oil' },
  { name: 'Natural gas' },
  { name: 'Refining' },
  { name: 'Power' },
  { name: 'Transport' },
  { name: 'Losses' },
];

const links = [
  { source: 0, target: 2, value: 520 },
  { source: 1, target: 3, value: 310 },
  { source: 2, target: 4, value: 410 },
  { source: 2, target: 5, value: 110 },
  { source: 3, target: 4, value: 90 },
  { source: 3, target: 5, value: 220 },
];

export function SankeyExample(): JSX.Element {
  return (
    <div>
      <h2>Sankey Diagram</h2>
      <p>
        Where a quantity goes, drawn as ribbons whose width is the magnitude.
        MAIDR navigates the graph rather than a grid: following a ribbon is the
        primary move, and arrow keys step between a node and the flows that
        arrive at or leave it. The ribbons are announced in the order the{' '}
        <code>links</code> array declares them, which is the order they are
        highlighted in too.
      </p>
      <MaidrRecharts
        id="sankey-example"
        title="Primary Energy Flow"
        subtitle="Petajoules"
        data={links}
        chartType="sankey"
        xKey="source"
        yKeys={['value']}
        flowConfig={{ targetKey: 'target', nodes }}
        xLabel="Stage"
        yLabel="Energy (PJ)"
      >
        <Sankey
          width={600}
          height={350}
          data={{ nodes, links }}
          nodePadding={30}
          margin={{ top: 10, right: 120, bottom: 10, left: 10 }}
          link={{ stroke: '#82ca9d' }}
        >
          <Tooltip />
        </Sankey>
      </MaidrRecharts>
    </div>
  );
}
