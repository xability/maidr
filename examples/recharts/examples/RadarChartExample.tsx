import type { JSX } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { attribute: 'Speed', alice: 90, bob: 70 },
  { attribute: 'Power', alice: 60, bob: 85 },
  { attribute: 'Stamina', alice: 75, bob: 80 },
  { attribute: 'Accuracy', alice: 85, bob: 55 },
  { attribute: 'Defence', alice: 50, bob: 90 },
  { attribute: 'Vision', alice: 80, bob: 65 },
];

export function RadarChartExample(): JSX.Element {
  return (
    <div>
      <h2>Radar Chart</h2>
      <p>Radar chart comparing two players across six attributes.</p>
      <MaidrRecharts
        id="radar-example"
        title="Player Attributes"
        subtitle="Alice vs Bob"
        data={data}
        chartType="radar"
        xKey="attribute"
        yKeys={['alice', 'bob']}
        xLabel="Attribute"
        yLabel="Rating"
      >
        <RadarChart width={500} height={400} data={data}>
          <PolarGrid />
          {/* `xKey` is this axis' dataKey — the spoke each value sits on. */}
          <PolarAngleAxis dataKey="attribute" />
          <PolarRadiusAxis angle={30} domain={[0, 100]} />
          <Tooltip />
          <Legend />
          <Radar dataKey="alice" stroke="#8884d8" fill="#8884d8" fillOpacity={0.4} name="Alice" dot />
          <Radar dataKey="bob" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.4} name="Bob" dot />
        </RadarChart>
      </MaidrRecharts>
    </div>
  );
}
