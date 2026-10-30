import type { JSX } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// `cumulativeMb` is what the chart PLOTS: the chromosomes laid end to end, in
// megabases, so they sit side by side. It is also `xKey`. MAIDR walks the
// points left to right by `x`, pairs each with its mark in that order and pans
// it by it, so the position within a chromosome (`bp`), which starts again at
// every chromosome, would send the reader back and forth across the genome.
// The chromosome travels as `groupKey`.
const data = [
  { snp: 'rs1042522', chr: '1', bp: 154_300, cumulativeMb: 0.15, negLog10P: 9.2 },
  { snp: 'rs2234693', chr: '1', bp: 890_450, cumulativeMb: 0.89, negLog10P: 2.4 },
  { snp: 'rs1801133', chr: '2', bp: 88_120, cumulativeMb: 249.39, negLog10P: 3.1 },
  { snp: 'rs4988235', chr: '2', bp: 610_775, cumulativeMb: 249.91, negLog10P: 11.6 },
  { snp: 'rs6265', chr: '3', bp: 271_390, cumulativeMb: 492.67, negLog10P: 1.8 },
  { snp: 'rs17822931', chr: '3', bp: 733_004, cumulativeMb: 493.13, negLog10P: 7.9 },
];

export function ManhattanPlotExample(): JSX.Element {
  return (
    <div>
      <h2>Manhattan Plot</h2>
      <p>
        A genome-wide association scan. MAIDR announces the SNP and its
        chromosome alongside the coordinates, and sorts every point against the
        genome-wide significance line at 7.3.
      </p>
      <MaidrRecharts
        id="manhattan-example"
        title="Genome-Wide Association"
        subtitle="-log10(p) by position"
        data={data}
        chartType="manhattan"
        xKey="cumulativeMb"
        yKeys={['negLog10P']}
        volcanoConfig={{ labelKey: 'snp', groupKey: 'chr', significance: 7.3 }}
        xLabel="Genomic position (Mb)"
        yLabel="-log10(p)"
      >
        <ScatterChart width={600} height={350}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="cumulativeMb" type="number" name="Genomic position (Mb)" tick={false} />
          <YAxis dataKey="negLog10P" type="number" name="-log10(p)" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <ReferenceLine y={7.3} stroke="#999" strokeDasharray="4 4" />
          <Scatter data={data} fill="#8884d8" />
        </ScatterChart>
      </MaidrRecharts>
    </div>
  );
}
