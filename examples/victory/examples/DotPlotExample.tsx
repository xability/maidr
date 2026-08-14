import type { JSX } from 'react';
import { VictoryAxis, VictoryChart, VictoryScatter } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

// A Cleveland dot plot is a `VictoryScatter` whose x values name categories
// rather than measure a position. One magnitude per named category is what a
// bar chart is, drawn as a point, and MAIDR reads it as one.
const data = [
  { x: 'Finland', y: 7.8 },
  { x: 'Denmark', y: 7.6 },
  { x: 'Iceland', y: 7.5 },
  { x: 'Sweden', y: 7.3 },
  { x: 'Netherlands', y: 7.4 },
  { x: 'Norway', y: 7.3 },
];

export function DotPlotExample(): JSX.Element {
  return (
    <div>
      <h2>Dot Plot</h2>
      <p>
        Life satisfaction by country, one dot per country. The categories are
        announced by name rather than by position.
      </p>
      <MaidrVictory
        id="victory-dot"
        title="Life Satisfaction"
        subtitle="Score out of 10"
      >
        <VictoryChart domainPadding={24}>
          <VictoryAxis label="Country" style={{ tickLabels: { fontSize: 8 } }} />
          <VictoryAxis dependentAxis label="Score" />
          <VictoryScatter data={data} size={5} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
