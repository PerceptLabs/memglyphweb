/**
 * Entity Panel Component
 *
 * Provides UI for browsing and filtering entities.
 */

import type { EntityFacet } from '../../db/types';

export interface EntityFiltersProps {
  types: string[];
  selectedType: string | null;
  totalCount: number;
  onSelectType: (type: string | null) => void;
  getTypeCount: (type: string) => number;
}

export function EntityFilters({
  types,
  selectedType,
  totalCount,
  onSelectType,
  getTypeCount,
}: EntityFiltersProps) {
  return (
    <div className="entity-filters">
      <button
        className={`entity-filter ${selectedType === null ? 'active' : ''}`}
        onClick={() => onSelectType(null)}
      >
        All ({totalCount})
      </button>
      {types.map((type) => {
        const count = getTypeCount(type);
        return (
          <button
            key={type}
            className={`entity-filter ${selectedType === type ? 'active' : ''}`}
            onClick={() => onSelectType(type)}
          >
            {type} ({count})
          </button>
        );
      })}
    </div>
  );
}

export interface EntityListProps {
  entities: EntityFacet[];
  maxDisplay?: number;
}

export function EntityList({ entities, maxDisplay = 20 }: EntityListProps) {
  const displayEntities = entities.slice(0, maxDisplay);

  return (
    <div className="entity-list">
      {displayEntities.map((entity) => (
        <div
          key={`${entity.entityType}-${entity.normalizedValue}`}
          className="entity-item"
        >
          <span className="entity-type">{entity.entityType}</span>
          <span className="entity-value">{entity.normalizedValue}</span>
          <span className="entity-count">{entity.count}</span>
        </div>
      ))}
      {entities.length > maxDisplay && (
        <div className="entity-item entity-more">
          <span className="entity-value">
            ... and {entities.length - maxDisplay} more
          </span>
        </div>
      )}
    </div>
  );
}

export interface EntityPanelProps {
  entities: EntityFacet[];
  types: string[];
  selectedType: string | null;
  totalCount: number;
  onSelectType: (type: string | null) => void;
  getTypeCount: (type: string) => number;
  show?: boolean;
  maxDisplay?: number;
}

export function EntityPanel({
  entities,
  types,
  selectedType,
  totalCount,
  onSelectType,
  getTypeCount,
  show = true,
  maxDisplay = 20,
}: EntityPanelProps) {
  if (!show || entities.length === 0) {
    return null;
  }

  const filteredEntities = selectedType
    ? entities.filter((e) => e.entityType === selectedType)
    : entities;

  return (
    <div className="entity-panel">
      <h4>Filter by Entity Type</h4>
      <EntityFilters
        types={types}
        selectedType={selectedType}
        totalCount={totalCount}
        onSelectType={onSelectType}
        getTypeCount={getTypeCount}
      />
      <EntityList entities={filteredEntities} maxDisplay={maxDisplay} />
    </div>
  );
}

export interface EntityToggleButtonProps {
  show: boolean;
  entityCount: number;
  onToggle: () => void;
}

export function EntityToggleButton({ show, entityCount, onToggle }: EntityToggleButtonProps) {
  return (
    <button className="btn-secondary btn-entities" onClick={onToggle}>
      {show ? 'Hide' : 'Show'} Entities ({entityCount})
    </button>
  );
}
