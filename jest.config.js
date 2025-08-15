export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', 'bin/**/*.js', '!src/index.js', '!**/*.config.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Fix circular reference issues with Jest workers
  maxWorkers: 1,
  forceExit: true,
  detectOpenHandles: true
};
