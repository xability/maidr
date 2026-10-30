import type { JSX } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// One row per interval, GROUPED BY LANE: Recharts draws one rectangle per row
// in row order while the payload is walked lane by lane, and the adapter turns
// highlighting off rather than mis-aligning it when the two disagree.
const data = [
  { task: 'Discovery', from: 0, to: 6, phase: 'Interviews' },
  { task: 'Design', from: 4, to: 11, phase: 'Wireframes' },
  { task: 'Design', from: 13, to: 16, phase: 'Visual' },
  { task: 'Build', from: 10, to: 24, phase: 'Alpha' },
  { task: 'Build', from: 26, to: 32, phase: 'Beta' },
];

const lanes = ['Discovery', 'Design', 'Build', 'Launch'];

/** The interval a floating `<Bar>` draws. */
function span(row: unknown): [number, number] {
  const interval = row as { from: number; to: number };
  return [interval.from, interval.to];
}

/**
 * The lane a row is drawn on, numbered from the top.
 *
 * Recharts places a bar on a category axis by the row's position rather than
 * its value, so on one every interval took a row of its own and Launch, which
 * no row names, was not drawn at all. On a number axis a bar sits at its
 * value: each interval on its lane's row, and a row with nothing on it for
 * Launch.
 */
function laneOf(row: unknown): number {
  return lanes.indexOf((row as { task: string }).task);
}

/** A lane's name, for its tick and the tooltip. */
function laneName(lane: unknown): string {
  return lanes[Number(lane)] ?? '';
}

export function GanttExample(): JSX.Element {
  return (
    <div>
      <h2>Gantt Chart</h2>
      <p>
        An interval is not a bar: it has two numbers and no baseline, so its
        length is a difference a reader has to be told. MAIDR puts the length
        on pitch and the start on stereo position, which makes two lanes whose
        work overlaps <em>sound</em> like they overlap. <strong>Launch</strong>{' '}
        is declared but holds nothing — an empty lane is a real statement about
        a schedule, and it is navigable for that reason.
      </p>
      <MaidrRecharts
        id="gantt-example"
        title="Release Plan"
        subtitle="Working days from kickoff"
        data={data}
        chartType="gantt"
        xKey="task"
        yKeys={['from', 'to']}
        ganttConfig={{
          lanes,
          labelKey: 'phase',
          unit: 'days',
        }}
        xLabel="Task"
        yLabel="Day"
      >
        <BarChart width={600} height={350} layout="vertical" data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 36]} />
          {/* The lanes' ticks, named; the domain leaves half a lane above the
              first and below the last. */}
          <YAxis
            type="number"
            dataKey={laneOf}
            domain={[-0.5, lanes.length - 0.5]}
            ticks={lanes.map((_, lane) => lane)}
            tickFormatter={laneName}
            interval={0}
            width={90}
          />
          <Tooltip labelFormatter={laneName} />
          {/* A bar on a number axis is sized by the gaps between the rows'
              values, which a lane holding two intervals makes none, so the
              size is given. */}
          <Bar dataKey={span} barSize={40} fill="#8884d8" isAnimationActive={false} />
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
