// Jest setup for global configuration

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: () => {},
  warn: () => {},
  error: () => {},
};