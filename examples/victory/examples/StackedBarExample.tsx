import type { JSX } from 'react';
import { VictoryAxis, VictoryBar, VictoryChart, VictoryStack } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

const productA = [
  { x: 'Q1', y: 2400 },
  { x: 'Q2', y: 3100 },
  { x: 'Q3', y: 2200 },
  { x: 'Q4', y: 3800 },
];

const productB = [
  { x: 'Q1', y: 1800 },
  { x: 'Q2', y: 2700 },
  { x: 'Q3', y: 1700 },
  { x: 'Q4', y: 3300 },
];

export function StackedBarExample(): JSX.Element {
  return (
    <div>
      <h2>Stacked Bar</h2>
      <p>Stacked bar chart comparing two product lines per quarter.</p>
      <MaidrVictory
        id="victory-stacked"
        title="Revenue by Product"
        subtitle="2024 Fiscal Year"
      >
        <VictoryChart domainPadding={24}>
          <VictoryAxis label="Quarter" />
          <VictoryAxis dependentAxis label="Revenue ($)" />
          <VictoryStack>
            <VictoryBar name="Product A" data={productA} />
            <VictoryBar name="Product B" data={productB} />
          </VictoryStack>
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
