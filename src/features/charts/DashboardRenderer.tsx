/**
 * Dashboard Renderer
 *
 * Renders dashboards defined in _ui_dashboards tables.
 */

import { useState, useEffect } from 'preact/hooks';
import { getDbClient } from '../../db/client';
import type { GcuiDashboard, VegaLiteConfig } from '../../gcui/v1/types';
import { VegaLiteChart } from './VegaLiteChart';

export interface DashboardRendererProps {
  dashboards: GcuiDashboard[];
}

export function DashboardRenderer({ dashboards }: DashboardRendererProps) {
  if (dashboards.length === 0) {
    return (
      <div className="dashboard-empty">
        <p>No dashboards defined</p>
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      {dashboards.map((dashboard) => (
        <DashboardPanel key={dashboard.name} dashboard={dashboard} />
      ))}
    </div>
  );
}

interface DashboardPanelProps {
  dashboard: GcuiDashboard;
}

function DashboardPanel({ dashboard }: DashboardPanelProps) {
  const [data, setData] = useState<Record<string, any>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [dashboard.query]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const dbClient = getDbClient();
      const results = await dbClient.query(dashboard.query);
      setData(results);
    } catch (err) {
      setError(String(err));
      console.error(`[Dashboard] Failed to load ${dashboard.name}:`, err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-panel loading">
        <div className="spinner"></div>
        <p>Loading {dashboard.name}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-panel error">
        <h4>{dashboard.name}</h4>
        <p className="error-message">Error: {error}</p>
        <details>
          <summary>Query</summary>
          <pre>{dashboard.query}</pre>
        </details>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="dashboard-panel empty">
        <h4>{dashboard.name}</h4>
        <p>No data</p>
      </div>
    );
  }

  // Parse Vega-Lite config if provided
  let vegaConfig: VegaLiteConfig | null = null;
  if (dashboard.config) {
    try {
      vegaConfig = JSON.parse(dashboard.config);
    } catch (err) {
      console.error(`[Dashboard] Invalid config for ${dashboard.name}:`, err);
    }
  }

  // If no valid Vega-Lite config, show as table
  if (!vegaConfig || dashboard.grammar !== 'vegalite-lite-v1') {
    return (
      <div className="dashboard-panel table">
        <h4>{dashboard.name}</h4>
        <DataTable data={data} />
      </div>
    );
  }

  return (
    <div className="dashboard-panel chart">
      <VegaLiteChart
        data={data}
        config={vegaConfig}
        width={600}
        height={400}
      />
    </div>
  );
}

/**
 * Simple data table for dashboards without charts
 */
function DataTable({ data }: { data: Record<string, any>[] }) {
  const columns = Object.keys(data[0] || {});

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="dashboard-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  borderBottom: '2px solid #ddd',
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: 600,
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
              {columns.map((col) => (
                <td key={col} style={{ padding: '10px' }}>
                  {String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
