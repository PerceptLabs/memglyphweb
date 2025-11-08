/**
 * Vitest Test Setup
 */

// Add custom matchers if needed
import { expect } from 'vitest';

// Setup global test utilities
global.console = {
  ...console,
  // Suppress console logs in tests unless needed
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: console.error, // Keep errors visible
};
