import type { JSX } from 'react';
import { VictoryAxis, VictoryChart, VictoryHistogram } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

// Raw observations; the adapter derives equal-width bins from these values.
const data = [
  { x: 1 },
  { x: 2 },
  { x: 2 },
  { x: 3 },
  { x: 3 },
  { x: 3 },
  { x: 4 },
  { x: 4 },
  { x: 5 },
  { x: 6 },
  { x: 6 },
  { x: 7 },
  { x: 8 },
  { x: 9 },
  { x: 9 },
  { x: 10 },
];

export function HistogramExample(): JSX.Element {
  return (
    <div>
      <h2>Histogram</h2>
      <p>
        Histogram of observed values.
        {' '}
        <em>Note: the adapter recomputes bins independently of Victory's render.</em>
      </p>
      <MaidrVictory
        id="victory-histogram"
        title="Value Distribution"
      >
        <VictoryChart domainPadding={12}>
          <VictoryAxis label="Value" />
          <VictoryAxis dependentAxis label="Frequency" />
          <VictoryHistogram data={data} bins={5} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
