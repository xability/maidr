import type { JSX } from 'react';
import { VictoryAxis, VictoryBar, VictoryChart } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

// A waterfall is a `VictoryBar` whose bars float on a per-datum `y0`, each one
// starting where the last one ended. The opening and closing bars rest on the
// baseline, which is what marks them as totals rather than contributions.
const data = [
  { x: 'Opening', y0: 0, y: 1200 },
  { x: 'New sales', y0: 1200, y: 1750 },
  { x: 'Renewals', y0: 1750, y: 2010 },
  { x: 'Churn', y0: 2010, y: 1680 },
  { x: 'Refunds', y0: 1680, y: 1595 },
  { x: 'Closing', y0: 0, y: 1595 },
];

export function WaterfallExample(): JSX.Element {
  return (
    <div>
      <h2>Waterfall</h2>
      <p>
        Revenue bridge from opening to closing balance. Each step announces its
        contribution and the running total it produced.
      </p>
      <MaidrVictory
        id="victory-waterfall"
        title="Revenue Bridge"
        subtitle="FY2024, thousands of dollars"
      >
        <VictoryChart domainPadding={24}>
          <VictoryAxis label="Step" style={{ tickLabels: { fontSize: 9 } }} />
          <VictoryAxis dependentAxis label="Revenue ($000)" />
          <VictoryBar data={data} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
