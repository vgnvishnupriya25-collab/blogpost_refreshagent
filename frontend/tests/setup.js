import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock clipboard API with configurable property
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
  },
  writable: true,
  configurable: true,
});

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock HTMLAnchorElement click
HTMLAnchorElement.prototype.click = vi.fn();

// Cleanup and reset mocks after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
