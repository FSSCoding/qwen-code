/**
 * Jest configuration for QwenCode Claude Integration Tests
 * 
 * This configuration enables comprehensive testing with:
 * - TypeScript support
 * - ES Module compatibility
 * - Coverage reporting
 * - VS Code Test Explorer integration
 * - Mock support for external dependencies
 */

export default {
  // Test environment
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  
  // Module resolution
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  // Transform configuration
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true
      }
    }
  },
  
  // Test file patterns
  testMatch: [
    '**/src/**/*.test.ts',
    '**/src/**/*.spec.ts',
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'packages/core/src/**/*.ts',
    'packages/cli/src/**/*.ts',
    '!**/*.d.ts',
    '!**/*.test.ts',
    '!**/*.spec.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/bundle/**'
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'html',
    'json-summary',
    'lcov'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Specific thresholds for Claude integration
    'packages/core/src/anthropic/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    'packages/core/src/core/providerAuthManager.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    'packages/core/src/tools/modelManager.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Test environment setup
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Test timeout (increased for integration tests)
  testTimeout: 30000,
  
  // Mock configuration
  clearMocks: true,
  restoreMocks: true,
  
  // Verbose output for CI/debugging
  verbose: true,
  
  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(@qwen-code|uuid|chalk)/)'
  ],
  
  // Error handling
  errorOnDeprecated: true,
  
  // Test results processor
  testResultsProcessor: './tests/utils/testResultsProcessor.js'
};