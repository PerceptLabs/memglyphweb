/**
 * Search Feature Module
 *
 * Exports search-related hooks and components.
 */

export { useSearch } from './useSearch';
export type { SearchMode, UseSearchOptions } from './useSearch';

export {
  SearchPanel,
  SearchBar,
  SearchResults,
  SearchModeToggle,
} from './SearchPanel';
export type {
  SearchPanelProps,
  SearchBarProps,
  SearchResultsProps,
  SearchModeToggleProps,
} from './SearchPanel';
