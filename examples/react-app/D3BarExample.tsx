import { useCallback, useRef } from 'react';
import * as d3 from 'd3';
import { MaidrD3 } from 'maidr/react';

/**
 * Accessible D3.js bar chart rendered inside React.
 *
 * Demonstrates how to pair a D3-rendered SVG with MAIDR via the `<MaidrD3>`
 * wrapper from `maidr/react`. The key timing concern:
 *
 *   `MaidrD3` is the *parent* of the `<svg>`, so its binder (inside a
 *   `useEffect` in `useD3Adapter`) would fire *after* any `useEffect` in the
 *   component that owns the ref — at which point the SVG is empty and the
 *   binder throws "No elements found for selector …".
 *
 * Fix: draw D3 inside a **ref callback**. Ref callbacks fire during React's
 * commit phase, *before* any effect, so the SVG is already populated by the
 * time the binder's effect runs. The callback also re-fires when the SVG
 * remounts — which `<MaidrD3>` triggers once it swaps from bare children to
 * the `<Maidr>`-wrapped tree — so the visual chart survives that transition.
 */
const data = [
  { day: 'Mon', count: 45 },
  { day: 'Tue', count: 72 },
  { day: 'Wed', count: 89 },
  { day: 'Thu', count: 64 },
  { day: 'Fri', count: 53 },
  { day: 'Sat', count: 95 },
  { day: 'Sun', count: 38 },
];

const margin = { top: 40, right: 20, bottom: 50, left: 60 };
const width = 600 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

export function D3BarExample() {
  // `svgRef` is handed to <MaidrD3> so its binder can read the SVG. We update
  // `.current` manually inside our ref callback below.
  const svgRef = useRef<SVGSVGElement | null>(null);

  const attachSvg = useCallback((node: SVGSVGElement | null) => {
    svgRef.current = node;
    if (!node) return;

    // D3 draw — runs synchronously in the commit phase before any useEffect,
    // so <MaidrD3>'s binder sees a populated SVG.
    const svg = d3.select(node);
    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand<string>()
      .domain(data.map(d => d.day))
      .range([0, width])
      .padding(0.2);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, d => d.count) ?? 0])
      .nice()
      .range([height, 0]);

    g.selectAll('rect.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.day) ?? 0)
      .attr('y', d => y(d.count))
      .attr('width', x.bandwidth())
      .attr('height', d => height - y(d.count))
      .attr('fill', '#4682b4');

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x));

    g.append('g').call(d3.axisLeft(y));

    g.append('text')
      .attr('x', width / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Daily Activity Count');

    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + 40)
      .attr('text-anchor', 'middle')
      .text('Day of Week');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .text('Count');
  }, []);

  return (
    <MaidrD3
      svgRef={svgRef}
      chartType="bar"
      config={{
        selector: 'rect.bar',
        title: 'Daily Activity Count',
        axes: { x: 'Day of Week', y: 'Count' },
        x: 'day',
        y: 'count',
      }}
    >
      <svg
        ref={attachSvg}
        width={width + margin.left + margin.right}
        height={height + margin.top + margin.bottom}
      />
    </MaidrD3>
  );
}
