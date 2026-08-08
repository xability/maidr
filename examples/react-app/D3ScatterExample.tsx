import { useCallback, useRef } from 'react';
import * as d3 from 'd3';
import { MaidrD3 } from 'maidr/react';

/**
 * Accessible D3.js scatter plot rendered inside React.
 *
 * Uses `<MaidrD3 chartType="scatter">`. See the sibling `D3BarExample` for
 * the rationale behind drawing D3 inside a ref callback instead of
 * `useEffect` — the short version is that React fires effects child-to-parent,
 * so `<MaidrD3>`'s binder effect would otherwise run *before* a parent
 * drawing effect and see an empty SVG.
 *
 * Providing explicit `axes.x.tickStep` / `axes.y.tickStep` is recommended for
 * scatter so the binder can build a grid that gives predictable cursor
 * movement across the plot area.
 */
const data = [
  { height: 160, weight: 55 },
  { height: 165, weight: 62 },
  { height: 170, weight: 68 },
  { height: 172, weight: 70 },
  { height: 175, weight: 75 },
  { height: 178, weight: 72 },
  { height: 180, weight: 80 },
  { height: 182, weight: 78 },
  { height: 185, weight: 85 },
  { height: 168, weight: 60 },
  { height: 173, weight: 65 },
  { height: 177, weight: 77 },
  { height: 163, weight: 58 },
  { height: 188, weight: 90 },
  { height: 171, weight: 67 },
];

const margin = { top: 40, right: 20, bottom: 50, left: 60 };
const width = 600 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

export function D3ScatterExample() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const attachSvg = useCallback((node: SVGSVGElement | null) => {
    svgRef.current = node;
    if (!node) return;

    const svg = d3.select(node);
    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([155, 195]).range([0, width]);
    const y = d3.scaleLinear().domain([50, 95]).range([height, 0]);

    g.selectAll('circle.dot')
      .data(data)
      .join('circle')
      .attr('class', 'dot')
      .attr('cx', d => x(d.height))
      .attr('cy', d => y(d.weight))
      .attr('r', 5)
      .attr('fill', '#e74c3c')
      .attr('opacity', 0.7);

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x));

    g.append('g').call(d3.axisLeft(y));

    g.append('text')
      .attr('x', width / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .text('Height vs Weight');

    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + 40)
      .attr('text-anchor', 'middle')
      .text('Height (cm)');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .text('Weight (kg)');
  }, []);

  return (
    <MaidrD3
      svgRef={svgRef}
      chartType="scatter"
      config={{
        selector: 'circle.dot',
        title: 'Height vs Weight',
        axes: {
          x: { label: 'Height (cm)', min: 155, max: 195, tickStep: 5 },
          y: { label: 'Weight (kg)', min: 50, max: 95, tickStep: 5 },
        },
        x: 'height',
        y: 'weight',
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
