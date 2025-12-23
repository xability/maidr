import React, { useEffect, useRef, useId } from 'react';
import { useTheme2 } from '@grafana/ui';
import { initMaidr, type Maidr, type BarPoint, TraceTypeEnum } from 'maidr';

interface MaidrBarChartProps {
  data: BarPoint[];
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  width: number;
  height: number;
}

/**
 * MaidrBarChart renders an accessible bar chart using the MAIDR library.
 * It creates an SVG bar chart and initializes MAIDR for keyboard navigation,
 * sonification, and screen reader support.
 */
export const MaidrBarChart: React.FC<MaidrBarChartProps> = ({
  data,
  title,
  xAxisLabel,
  yAxisLabel,
  width,
  height,
}) => {
  const theme = useTheme2();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const initializedRef = useRef(false);
  const uniqueId = useId().replace(/:/g, '-');
  const chartId = `maidr-bar-${uniqueId}`;

  // Theme-aware colors
  const textColor = theme.colors.text.primary;
  const axisColor = theme.colors.text.secondary;
  const backgroundColor = theme.colors.background.primary;
  const barFill = theme.colors.primary.main;
  const barStroke = theme.colors.primary.border;

  // Reserve space for MAIDR text display (about 40px at the bottom)
  const maidrTextHeight = 40;
  const svgHeight = height - maidrTextHeight;

  // Chart margins
  const margin = { top: 40, right: 20, bottom: 60, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = svgHeight - margin.top - margin.bottom;

  // Calculate scales
  const maxY = Math.max(...data.map((d) => (typeof d.y === 'number' ? d.y : parseFloat(String(d.y)))));
  const barWidth = chartWidth / data.length - 4;

  const getBarHeight = (value: number | string): number => {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
    return (numValue / maxY) * chartHeight;
  };

  const getBarX = (index: number): number => {
    return margin.left + index * (chartWidth / data.length) + 2;
  };

  const getBarY = (value: number | string): number => {
    const barHeight = getBarHeight(value);
    return margin.top + chartHeight - barHeight;
  };

  // Generate bar selectors for MAIDR
  const barSelectors = data.map((_, index) => `#${chartId}-bar-${index}`);

  // Create MAIDR configuration
  const maidrConfig: Maidr = {
    id: chartId,
    title: title,
    subplots: [
      [
        {
          layers: [
            {
              id: `${chartId}-layer`,
              type: TraceTypeEnum.BAR,
              title: title,
              selectors: barSelectors,
              axes: {
                x: xAxisLabel,
                y: yAxisLabel,
              },
              data: data,
            },
          ],
        },
      ],
    ],
  };

  useEffect(() => {
    if (svgRef.current && !initializedRef.current && data.length > 0) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        if (svgRef.current) {
          initMaidr(maidrConfig, svgRef.current);
          initializedRef.current = true;

          // Add custom styles for MAIDR text container in Grafana context
          const styleId = `maidr-grafana-styles-${chartId}`;
          if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
              #maidr-figure-${chartId} {
                position: relative;
                height: ${height}px;
              }
              #maidr-react-container-${chartId} {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                padding: 8px;
                color: ${textColor};
                font-size: 14px;
                background: ${backgroundColor};
                z-index: 10;
              }
              #maidr-text-container p {
                margin: 0;
                padding: 4px 0;
              }
            `;
            document.head.appendChild(style);
          }
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [data, maidrConfig, chartId, textColor, height, backgroundColor]);

  if (data.length === 0) {
    return <div>No data available</div>;
  }

  return (
    <div ref={containerRef} style={{ width, minHeight: height, backgroundColor, overflow: 'visible' }}>
      <svg
        ref={svgRef}
        id={chartId}
        width={width}
        height={svgHeight}
        tabIndex={0}
        role="img"
        aria-label={`${title}. Bar chart with ${data.length} bars. Press Enter to interact.`}
        style={{ backgroundColor }}
      >
        {/* Background */}
        <rect x={0} y={0} width={width} height={svgHeight} fill={backgroundColor} />

        {/* Title */}
        <text
          x={width / 2}
          y={20}
          textAnchor="middle"
          fill={textColor}
          style={{ fontSize: '16px', fontWeight: 'bold' }}
        >
          {title}
        </text>

        {/* Y-axis */}
        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={margin.top + chartHeight}
          stroke={axisColor}
          strokeWidth={1}
        />

        {/* X-axis */}
        <line
          x1={margin.left}
          y1={margin.top + chartHeight}
          x2={margin.left + chartWidth}
          y2={margin.top + chartHeight}
          stroke={axisColor}
          strokeWidth={1}
        />

        {/* Y-axis label */}
        <text
          x={15}
          y={margin.top + chartHeight / 2}
          textAnchor="middle"
          fill={textColor}
          transform={`rotate(-90, 15, ${margin.top + chartHeight / 2})`}
          style={{ fontSize: '12px' }}
        >
          {yAxisLabel}
        </text>

        {/* X-axis label */}
        <text
          x={margin.left + chartWidth / 2}
          y={svgHeight - 10}
          textAnchor="middle"
          fill={textColor}
          style={{ fontSize: '12px' }}
        >
          {xAxisLabel}
        </text>

        {/* Bars */}
        {data.map((point, index) => (
          <rect
            key={index}
            id={`${chartId}-bar-${index}`}
            x={getBarX(index)}
            y={getBarY(point.y)}
            width={barWidth}
            height={getBarHeight(point.y)}
            fill={barFill}
            stroke={barStroke}
            strokeWidth={1}
          >
            <title>{`${point.x}: ${point.y}`}</title>
          </rect>
        ))}

        {/* X-axis tick labels */}
        {data.map((point, index) => (
          <text
            key={`label-${index}`}
            x={getBarX(index) + barWidth / 2}
            y={margin.top + chartHeight + 20}
            textAnchor="middle"
            fill={textColor}
            style={{ fontSize: '10px' }}
          >
            {String(point.x)}
          </text>
        ))}

        {/* Y-axis tick labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <text
            key={`y-tick-${ratio}`}
            x={margin.left - 10}
            y={margin.top + chartHeight - ratio * chartHeight + 4}
            textAnchor="end"
            fill={textColor}
            style={{ fontSize: '10px' }}
          >
            {Math.round(maxY * ratio)}
          </text>
        ))}
      </svg>
    </div>
  );
};

export default MaidrBarChart;
