import React, { useMemo } from 'react';
import { PanelProps, FieldType, Field } from '@grafana/data';
import { MaidrPanelOptions } from 'types';
import { PanelDataErrorView } from '@grafana/runtime';
import { MaidrBarChart } from './MaidrBarChart';
import type { BarPoint } from 'maidr';

interface Props extends PanelProps<MaidrPanelOptions> {}

/**
 * SimplePanel is a Grafana panel that renders an accessible bar chart
 * using the MAIDR library for keyboard navigation and sonification.
 */
export const SimplePanel: React.FC<Props> = ({ options, data, width, height, fieldConfig, id }) => {
  // Transform Grafana data to MAIDR BarPoint format
  const barData: BarPoint[] = useMemo(() => {
    if (data.series.length === 0) {
      return [];
    }

    const series = data.series[0];

    // Find x-axis field: prioritize string fields over time fields
    let xField: Field | undefined = series.fields.find((f) => f.type === FieldType.string);
    if (!xField) {
      xField = series.fields.find((f) => f.type === FieldType.time);
    }

    // Find y-axis field: use the first number field
    const yField = series.fields.find((f) => f.type === FieldType.number);

    // Debug logging
    console.log('Grafana data series:', series);
    console.log('Fields:', series.fields.map(f => ({ name: f.name, type: f.type })));
    console.log('Selected xField:', xField?.name, xField?.type);
    console.log('Selected yField:', yField?.name, yField?.type);

    if (!xField || !yField) {
      console.log('Missing fields - xField:', !!xField, 'yField:', !!yField);
      return [];
    }

    const points: BarPoint[] = [];
    const length = Math.min(xField.values.length, yField.values.length);

    for (let i = 0; i < length; i++) {
      let xValue = xField.values[i];

      // Format time values
      if (xField.type === FieldType.time) {
        const date = new Date(xValue);
        xValue = date.toLocaleDateString();
      }

      points.push({
        x: String(xValue),
        y: yField.values[i] as number,
      });
    }

    console.log('Generated bar data:', points);
    return points;
  }, [data.series]);

  if (data.series.length === 0 || barData.length === 0) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  return (
    <MaidrBarChart
      data={barData}
      title={options.title || 'Bar Chart'}
      xAxisLabel={options.xAxisLabel || 'X Axis'}
      yAxisLabel={options.yAxisLabel || 'Y Axis'}
      width={width}
      height={height}
    />
  );
};
