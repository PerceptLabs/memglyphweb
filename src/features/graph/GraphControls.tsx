/**
 * Graph Controls Component
 *
 * Controls for graph navigation and filtering.
 */

export interface GraphControlsProps {
  predicates: string[];
  selectedPredicate?: string;
  onPredicateChange: (predicate?: string) => void;
  onReset?: () => void;
}

export function GraphControls({
  predicates,
  selectedPredicate,
  onPredicateChange,
  onReset,
}: GraphControlsProps) {
  return (
    <div className="graph-controls">
      <div className="graph-controls-section">
        <label className="graph-controls-label">Filter by Relationship:</label>
        <select
          className="graph-controls-select"
          value={selectedPredicate || ''}
          onChange={(e) => {
            const value = (e.target as HTMLSelectElement).value;
            onPredicateChange(value || undefined);
          }}
        >
          <option value="">All Relationships</option>
          {predicates.map((pred) => (
            <option key={pred} value={pred}>
              {pred}
            </option>
          ))}
        </select>
      </div>

      {onReset && (
        <button className="btn-secondary btn-sm" onClick={onReset}>
          Reset View
        </button>
      )}
    </div>
  );
}

export interface GraphStatsProps {
  nodeCount: number;
  edgeCount: number;
  predicateCount: number;
  seedNode?: string;
}

export function GraphStats({ nodeCount, edgeCount, predicateCount, seedNode }: GraphStatsProps) {
  return (
    <div className="graph-stats">
      <div className="graph-stat">
        <span className="graph-stat-label">Nodes:</span>
        <span className="graph-stat-value">{nodeCount}</span>
      </div>
      <div className="graph-stat">
        <span className="graph-stat-label">Edges:</span>
        <span className="graph-stat-value">{edgeCount}</span>
      </div>
      <div className="graph-stat">
        <span className="graph-stat-label">Relationships:</span>
        <span className="graph-stat-value">{predicateCount}</span>
      </div>
      {seedNode && (
        <div className="graph-stat">
          <span className="graph-stat-label">Seed:</span>
          <span className="graph-stat-value">{seedNode}</span>
        </div>
      )}
    </div>
  );
}
