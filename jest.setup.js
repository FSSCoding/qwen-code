/**
 * Jest setup file for QwenCode Claude Integration Tests
 * 
 * This file configures the testing environment with:
 * - Global mocks
 * - Environment variables
 * - Test utilities
 * - Cleanup procedures
 */

import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';

// Global test timeout
jest.setTimeout(30000);

// Mock external dependencies that shouldn't be called during tests
jest.mock('child_process');

// Environment setup
process.env.NODE_ENV = 'test';
process.env.QWEN_TEST_MODE = 'true';

// Global test utilities
global.testUtils = {
  /**
   * Create a temporary model profiles file for testing
   */
  async createTestProfiles(profiles) {
    const profilesPath = path.join(homedir(), '.qwen', 'model-profiles.json');
    await fs.mkdir(path.dirname(profilesPath), { recursive: true });
    await fs.writeFile(profilesPath, JSON.stringify(profiles, null, 2));
    return profilesPath;
  },
  
  /**
   * Clean up test files
   */
  async cleanup(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch {
        // File doesn't exist, ignore
      }
    }
  },
  
  /**
   * Wait for a specified amount of time
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * Create mock config object
   */
  createMockConfig() {
    return {
      getContentGeneratorConfig: jest.fn(() => ({
        authType: 'anthropic-oauth',
        systemInstruction: 'You are QwenCode, a helpful coding assistant.',
        model: 'claude-sonnet-4-20250514'
      })),
      setModel: jest.fn(),
      setRuntimeModel: jest.fn(),
      refreshAuth: jest.fn(),
      getGeminiClient: jest.fn(() => ({
        initialize: jest.fn()
      }))
    };
  }
};

// Console suppression for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Suppress console output during tests unless DEBUG is set
  if (!process.env.DEBUG_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  }
});

afterEach(() => {
  // Restore console functions
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  
  // Clear all mocks
  jest.clearAllMocks();
});

// Global error handler for unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  throw reason;
});

// Increase memory limit for tests
if (global.gc) {
  global.gc();
}

console.log('🧪 Jest setup completed - Claude Integration tests ready');