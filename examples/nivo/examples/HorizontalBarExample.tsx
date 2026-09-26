import type { JSX } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { MaidrNivo } from '../../../src/adapters/nivo/MaidrNivo';

const grouped = [
  { quarter: 'Q1', web: 120, mobile: 80 },
  { quarter: 'Q2', web: 150, mobile: 110 },
  { quarter: 'Q3', web: 170, mobile: 140 },
];

const data = [
  { language: 'JavaScript', developers: 62 },
  { language: 'Python', developers: 51 },
  { language: 'TypeScript', developers: 38 },
  { language: 'Java', developers: 30 },
  { language: 'C#', developers: 27 },
];

export function HorizontalBarExample(): JSX.Element {
  return (
    <div>
      <h2>Horizontal Bar</h2>
      <p>
        Horizontal bar chart of language usage. Nivo draws the first category
        at the bottom.
      </p>
      <MaidrNivo
        id="nivo-horizontal"
        title="Most Used Languages"
        subtitle="Share of respondents"
        type="bar"
      >
        <div style={{ width: 700, height: 400 }}>
          <ResponsiveBar
            data={data}
            keys={['developers']}
            indexBy="language"
            layout="horizontal"
            margin={{ top: 20, right: 30, bottom: 50, left: 100 }}
            padding={0.3}
            axisBottom={{ legend: 'Respondents (%)', legendPosition: 'middle', legendOffset: 36 }}
            axisLeft={{ legend: 'Language', legendPosition: 'middle', legendOffset: -90 }}
          />
        </div>
      </MaidrNivo>

      <h3>Grouped</h3>
      <p>
        Grouped horizontal bars. Nivo draws the first key at the top of each
        band, so Up moves from Mobile to Web.
      </p>
      <MaidrNivo
        id="nivo-horizontal-grouped"
        title="Sign-ups by Platform"
        type="bar"
      >
        <div style={{ width: 700, height: 400 }}>
          <ResponsiveBar
            data={grouped}
            keys={['web', 'mobile']}
            indexBy="quarter"
            layout="horizontal"
            groupMode="grouped"
            margin={{ top: 20, right: 30, bottom: 50, left: 100 }}
            padding={0.3}
            axisBottom={{ legend: 'Sign-ups', legendPosition: 'middle', legendOffset: 36 }}
            axisLeft={{ legend: 'Quarter', legendPosition: 'middle', legendOffset: -90 }}
          />
        </div>
      </MaidrNivo>
    </div>
  );
}
