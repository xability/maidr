/**
 * React Example: Bar Plot with MaidrChart
 *
 * This example demonstrates how to use the MaidrChart component
 * to make a bar chart accessible with MAIDR features like
 * keyboard navigation, audio feedback, and screen reader support.
 *
 * Usage:
 *   import BarPlotExample from './BarPlotExample';
 *   // Then use <BarPlotExample /> in your React app
 */

import type { Maidr } from '../../src/type/grammar';
import { TraceType } from '../../src/type/grammar';
import { MaidrChart } from '../../src/ui/MaidrChart';
import React from 'react';

// The MAIDR data structure describing the chart
const barData: Maidr = {
  id: 'bar',
  title: 'The Number of Tips by Day',
  subplots: [[{
    layers: [{
      id: '0',
      type: TraceType.BAR,
      selectors: 'path[clip-path="url(#p0f12ed050e)"]',
      axes: { x: 'Day', y: 'Count' },
      data: [
        { x: 'Sat', y: 87 },
        { x: 'Sun', y: 76 },
        { x: 'Thur', y: 62 },
        { x: 'Fri', y: 19 },
      ],
    }],
  }]],
};

// The SVG content (extracted from the original barplot.html)
// In a real app, this could come from a charting library like D3, Chart.js, etc.
const BarPlotSvg: React.FC = () => (
  <svg
    id="bar"
    width="720pt"
    height="432pt"
    viewBox="0 0 720 432"
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    tabIndex={0}
  >
    <defs>
      <style type="text/css">
        {`* { stroke-linejoin: round; stroke-linecap: butt; }`}
      </style>
    </defs>
    <g id="figure_1">
      <g id="patch_1">
        <path
          d="M 0 432 L 720 432 L 720 0 L 0 0 z"
          style={{ fill: '#ffffff' }}
        />
      </g>
      <g id="axes_1">
        <g id="patch_2">
          <path
            d="M 90 384.48 L 648 384.48 L 648 51.84 L 90 51.84 z"
            style={{ fill: '#ffffff' }}
          />
        </g>

        {/* Bar: Sat (87) */}
        <g id="patch_3">
          <path
            d="M 115.363636 384.48 L 222.157895 384.48 L 222.157895 67.68 L 115.363636 67.68 z"
            clipPath="url(#p0f12ed050e)"
            style={{ fill: '#87ceeb' }}
          />
        </g>

        {/* Bar: Sun (76) */}
        <g id="patch_4">
          <path
            d="M 248.856459 384.48 L 355.650718 384.48 L 355.650718 107.735172 L 248.856459 107.735172 z"
            clipPath="url(#p0f12ed050e)"
            style={{ fill: '#87ceeb' }}
          />
        </g>

        {/* Bar: Thur (62) */}
        <g id="patch_5">
          <path
            d="M 382.349282 384.48 L 489.143541 384.48 L 489.143541 158.714483 L 382.349282 158.714483 z"
            clipPath="url(#p0f12ed050e)"
            style={{ fill: '#87ceeb' }}
          />
        </g>

        {/* Bar: Fri (19) */}
        <g id="patch_6">
          <path
            d="M 515.842105 384.48 L 622.636364 384.48 L 622.636364 315.293793 L 515.842105 315.293793 z"
            clipPath="url(#p0f12ed050e)"
            style={{ fill: '#87ceeb' }}
          />
        </g>

        {/* X-axis labels */}
        <g id="matplotlib.axis_1">
          <text x="168.76" y="399" style={{ fontSize: '10px', textAnchor: 'middle' }}>Sat</text>
          <text x="302.25" y="399" style={{ fontSize: '10px', textAnchor: 'middle' }}>Sun</text>
          <text x="435.75" y="399" style={{ fontSize: '10px', textAnchor: 'middle' }}>Thur</text>
          <text x="569.24" y="399" style={{ fontSize: '10px', textAnchor: 'middle' }}>Fri</text>
          {/* X-axis label: Day */}
          <text x="369" y="420" style={{ fontSize: '10px', textAnchor: 'middle' }}>Day</text>
        </g>

        {/* Y-axis labels */}
        <g id="matplotlib.axis_2">
          <text x="85" y="388" style={{ fontSize: '10px', textAnchor: 'end' }}>0</text>
          <text x="85" y="315" style={{ fontSize: '10px', textAnchor: 'end' }}>20</text>
          <text x="85" y="242" style={{ fontSize: '10px', textAnchor: 'end' }}>40</text>
          <text x="85" y="169" style={{ fontSize: '10px', textAnchor: 'end' }}>60</text>
          <text x="85" y="96" style={{ fontSize: '10px', textAnchor: 'end' }}>80</text>
          {/* Y-axis label: Count */}
          <text
            x="50"
            y="218"
            style={{ fontSize: '10px', textAnchor: 'middle' }}
            transform="rotate(-90, 50, 218)"
          >
            Count
          </text>
        </g>

        {/* Axes borders */}
        <g id="patch_7">
          <path
            d="M 90 384.48 L 90 51.84"
            style={{ fill: 'none', stroke: '#000000', strokeWidth: 0.8 }}
          />
        </g>
        <g id="patch_8">
          <path
            d="M 648 384.48 L 648 51.84"
            style={{ fill: 'none', stroke: '#000000', strokeWidth: 0.8 }}
          />
        </g>
        <g id="patch_9">
          <path
            d="M 90 384.48 L 648 384.48"
            style={{ fill: 'none', stroke: '#000000', strokeWidth: 0.8 }}
          />
        </g>
        <g id="patch_10">
          <path
            d="M 90 51.84 L 648 51.84"
            style={{ fill: 'none', stroke: '#000000', strokeWidth: 0.8 }}
          />
        </g>

        {/* Title */}
        <text x="369" y="35" style={{ fontSize: '14px', textAnchor: 'middle', fontWeight: 'bold' }}>
          The Number of Tips by Day
        </text>
      </g>
    </g>
    <defs>
      <clipPath id="p0f12ed050e">
        <rect x="90" y="51.84" width="558" height="332.64" />
      </clipPath>
    </defs>
  </svg>
);

/**
 * BarPlotExample Component
 *
 * Wraps the bar chart SVG with MaidrChart to enable accessibility features.
 * When focused, users can:
 * - Use arrow keys to navigate between bars
 * - Hear audio tones representing values
 * - Get screen reader announcements
 * - Access braille output
 * - Open settings, help, and chat dialogs
 */
const BarPlotExample: React.FC = () => {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Bar Plot Example with MaidrChart</h1>
      <p>
        Click on the chart or tab to it, then use arrow keys to navigate.
        Press H for help.
      </p>

      <MaidrChart maidrData={barData}>
        <BarPlotSvg />
      </MaidrChart>
    </div>
  );
};

export default BarPlotExample;
