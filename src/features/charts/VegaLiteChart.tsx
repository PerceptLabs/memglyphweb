/**
 * Vega-Lite-Lite Chart Renderer
 *
 * Renders charts based on GCUI Vega-Lite-Lite v1 spec.
 * Currently uses simple HTML/CSS rendering, can be upgraded to full charting library later.
 */

import type { VegaLiteConfig } from '../../gcui/v1/types';

export interface VegaLiteChartProps {
  data: Record<string, any>[];
  config: VegaLiteConfig;
  width?: number;
  height?: number;
}

export function VegaLiteChart({ data, config, width = 600, height = 400 }: VegaLiteChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="chart-empty" style={{ width, height }}>
        <p>No data to display</p>
      </div>
    );
  }

  // Route to appropriate renderer based on mark type
  switch (config.mark) {
    case 'bar':
      return <BarChart data={data} config={config} width={width} height={height} />;
    case 'line':
      return <LineChart data={data} config={config} width={width} height={height} />;
    case 'point':
      return <ScatterChart data={data} config={config} width={width} height={height} />;
    case 'area':
      return <AreaChart data={data} config={config} width={width} height={height} />;
    default:
      return (
        <div className="chart-unsupported" style={{ width, height }}>
          <p>Unsupported chart type: {config.mark}</p>
          <p>Showing data as table:</p>
          <DataTable data={data} />
        </div>
      );
  }
}

/**
 * Simple Bar Chart
 */
function BarChart({ data, config, width, height }: VegaLiteChartProps) {
  const { encoding } = config;
  const xField = encoding.x?.field || Object.keys(data[0])[0];
  const yField = encoding.y?.field || Object.keys(data[0])[1];

  // Find max value for scaling
  const maxValue = Math.max(...data.map((d) => Number(d[yField]) || 0));
  const barWidth = Math.max(20, (width - 100) / data.length - 10);

  return (
    <div className="chart chart-bar" style={{ width, height }}>
      {config.title && <h4 className="chart-title">{config.title}</h4>}
      <div className="chart-container" style={{ height: height - 60 }}>
        <div className="chart-bars" style={{ display: 'flex', alignItems: 'flex-end', height: '100%', gap: '8px' }}>
          {data.map((row, i) => {
            const value = Number(row[yField]) || 0;
            const barHeight = (value / maxValue) * (height - 100);
            return (
              <div key={i} className="chart-bar-item" style={{ textAlign: 'center' }}>
                <div
                  className="bar"
                  style={{
                    width: barWidth,
                    height: barHeight,
                    backgroundColor: '#6366f1',
                    borderRadius: '4px 4px 0 0',
                  }}
                  title={`${row[xField]}: ${value}`}
                />
                <div className="bar-label" style={{ fontSize: '12px', marginTop: '4px', maxWidth: barWidth, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {String(row[xField]).slice(0, 10)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="chart-legend" style={{ fontSize: '12px', marginTop: '8px', textAlign: 'center' }}>
        <strong>{yField}</strong> by <strong>{xField}</strong>
      </div>
    </div>
  );
}

/**
 * Simple Line Chart
 */
function LineChart({ data, config, width, height }: VegaLiteChartProps) {
  const { encoding } = config;
  const xField = encoding.x?.field || Object.keys(data[0])[0];
  const yField = encoding.y?.field || Object.keys(data[0])[1];

  // Find min/max for scaling
  const values = data.map((d) => Number(d[yField]) || 0);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  // Generate SVG path
  const chartWidth = width - 80;
  const chartHeight = height - 100;
  const stepX = chartWidth / (data.length - 1 || 1);

  const points = data.map((row, i) => {
    const x = 40 + i * stepX;
    const value = Number(row[yField]) || 0;
    const y = chartHeight - ((value - minValue) / range) * chartHeight + 20;
    return { x, y, value, label: row[xField] };
  });

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="chart chart-line" style={{ width, height }}>
      {config.title && <h4 className="chart-title">{config.title}</h4>}
      <svg width={width} height={height - 40} style={{ overflow: 'visible' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = chartHeight - fraction * chartHeight + 20;
          const value = minValue + fraction * range;
          return (
            <g key={fraction}>
              <line x1={40} y1={y} x2={width - 40} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={10} y={y + 4} fontSize={10} fill="#666">
                {value.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Line */}
        <path d={pathData} fill="none" stroke="#6366f1" strokeWidth={2} />

        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill="#6366f1">
            <title>{`${p.label}: ${p.value}`}</title>
          </circle>
        ))}

        {/* X-axis labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={chartHeight + 40}
            fontSize={10}
            fill="#666"
            textAnchor="middle"
          >
            {String(p.label).slice(0, 8)}
          </text>
        ))}
      </svg>
      <div className="chart-legend" style={{ fontSize: '12px', textAlign: 'center' }}>
        <strong>{yField}</strong> over <strong>{xField}</strong>
      </div>
    </div>
  );
}

/**
 * Simple Scatter Chart
 */
function ScatterChart({ data, config, width, height }: VegaLiteChartProps) {
  const { encoding } = config;
  const xField = encoding.x?.field || Object.keys(data[0])[0];
  const yField = encoding.y?.field || Object.keys(data[0])[1];

  const xValues = data.map((d) => Number(d[xField]) || 0);
  const yValues = data.map((d) => Number(d[yField]) || 0);

  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const chartWidth = width - 80;
  const chartHeight = height - 100;

  return (
    <div className="chart chart-scatter" style={{ width, height }}>
      {config.title && <h4 className="chart-title">{config.title}</h4>}
      <svg width={width} height={height - 40}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = chartHeight - fraction * chartHeight + 20;
          return (
            <line key={fraction} x1={40} y1={y} x2={width - 40} y2={y} stroke="#e5e7eb" strokeWidth={1} />
          );
        })}

        {/* Points */}
        {data.map((row, i) => {
          const xVal = Number(row[xField]) || 0;
          const yVal = Number(row[yField]) || 0;
          const x = 40 + ((xVal - xMin) / xRange) * chartWidth;
          const y = chartHeight - ((yVal - yMin) / yRange) * chartHeight + 20;

          return (
            <circle key={i} cx={x} cy={y} r={5} fill="#6366f1" opacity={0.7}>
              <title>{`${xField}: ${xVal}, ${yField}: ${yVal}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="chart-legend" style={{ fontSize: '12px', textAlign: 'center' }}>
        <strong>{yField}</strong> vs <strong>{xField}</strong>
      </div>
    </div>
  );
}

/**
 * Simple Area Chart (similar to line but filled)
 */
function AreaChart({ data, config, width, height }: VegaLiteChartProps) {
  const { encoding } = config;
  const xField = encoding.x?.field || Object.keys(data[0])[0];
  const yField = encoding.y?.field || Object.keys(data[0])[1];

  const values = data.map((d) => Number(d[yField]) || 0);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  const chartWidth = width - 80;
  const chartHeight = height - 100;
  const stepX = chartWidth / (data.length - 1 || 1);

  const points = data.map((row, i) => {
    const x = 40 + i * stepX;
    const value = Number(row[yField]) || 0;
    const y = chartHeight - ((value - minValue) / range) * chartHeight + 20;
    return { x, y };
  });

  const lineData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaData = `${lineData} L ${width - 40} ${chartHeight + 20} L 40 ${chartHeight + 20} Z`;

  return (
    <div className="chart chart-area" style={{ width, height }}>
      {config.title && <h4 className="chart-title">{config.title}</h4>}
      <svg width={width} height={height - 40}>
        {/* Area fill */}
        <path d={areaData} fill="#6366f1" opacity={0.3} />

        {/* Line */}
        <path d={lineData} fill="none" stroke="#6366f1" strokeWidth={2} />
      </svg>
      <div className="chart-legend" style={{ fontSize: '12px', textAlign: 'center' }}>
        <strong>{yField}</strong> over <strong>{xField}</strong>
      </div>
    </div>
  );
}

/**
 * Fallback: Data Table
 */
function DataTable({ data }: { data: Record<string, any>[] }) {
  if (data.length === 0) return null;

  const columns = Object.keys(data[0]);

  return (
    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col} style={{ borderBottom: '2px solid #ddd', padding: '8px', textAlign: 'left' }}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.slice(0, 10).map((row, i) => (
          <tr key={i}>
            {columns.map((col) => (
              <td key={col} style={{ borderBottom: '1px solid #eee', padding: '6px' }}>
                {String(row[col])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
