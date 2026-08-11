import type { JSX } from 'react';
import { VictoryAxis, VictoryBar, VictoryChart, VictoryLine } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

const northData = [
  { x: 'Q1', y: 4200 },
  { x: 'Q2', y: 5800 },
  { x: 'Q3', y: 3900 },
  { x: 'Q4', y: 7100 },
];

const southData = [
  { x: 'Q1', y: 3100 },
  { x: 'Q2', y: 4400 },
  { x: 'Q3', y: 5200 },
  { x: 'Q4', y: 4800 },
];

const trendData = [
  { x: 'Q1', y: 7300 },
  { x: 'Q2', y: 10200 },
  { x: 'Q3', y: 9100 },
  { x: 'Q4', y: 11900 },
];

export function MultiPanelExample(): JSX.Element {
  return (
    <div>
      <h2>Multi-Panel Figure</h2>
      <p>
        Three VictoryChart panels inside one MaidrVictory figure. Use arrow
        keys to move between panels, press Enter to drill into a panel, and
        Escape to return to panel navigation. Each chart&apos;s
        {' '}
        <code>title</code>
        {' '}
        prop names its panel.
      </p>
      <MaidrVictory
        id="victory-multi-panel"
        title="Quarterly Sales by Region"
        subtitle="2024 Fiscal Year"
      >
        <VictoryChart title="North Region" domainPadding={24} height={220}>
          <VictoryAxis label="Quarter" />
          <VictoryAxis dependentAxis label="Revenue ($)" />
          <VictoryBar data={northData} />
        </VictoryChart>
        <VictoryChart title="South Region" domainPadding={24} height={220}>
          <VictoryAxis label="Quarter" />
          <VictoryAxis dependentAxis label="Revenue ($)" />
          <VictoryBar data={southData} />
        </VictoryChart>
        <VictoryChart title="Combined Trend" domainPadding={24} height={220}>
          <VictoryAxis label="Quarter" />
          <VictoryAxis dependentAxis label="Total Revenue ($)" />
          <VictoryLine data={trendData} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
