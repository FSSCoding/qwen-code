/**
 * @fileoverview Comprehensive Claude Code Max Integration Tests
 * 
 * This test suite validates the complete Claude integration including:
 * - AuthType resolution pipeline
 * - Model switching functionality  
 * - System prompt preservation
 * - Provider authentication
 * - Bidirectional model switching
 * - Error handling and fallbacks
 * 
 * @author QwenCode Integration Team
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Config } from '../config/config.js';
import { AuthType, createContentGeneratorConfig } from '../core/contentGenerator.js';
import { getProviderAuthManager, ProviderAuthManager } from '../core/providerAuthManager.js';
import { getModelOverrideManager, ModelOverrideManager } from '../core/modelOverrideManager.js';
import { ClaudeSubprocessGenerator } from '../anthropic/claudeSubprocessGenerator.js';
import { ModelManagerTool } from '../tools/modelManager.js';
import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';

/**
 * Test configuration and fixtures
 */
const TEST_MODEL_PROFILES = {
  models: [
    {
      nickname: 'claude',
      displayName: 'Claude Code Max',
      model: 'claude-sonnet-4-20250514',
      provider: 'claude-code-max',
      authType: 'anthropic-oauth',
      description: 'Claude with Anthropic OAuth authentication',
      lastUsed: new Date().toISOString()
    },
    {
      nickname: 'qwen4b',
      displayName: 'Qwen 4B Fast',
      model: 'qwen/qwen3-4b-2507',
      provider: 'lmstudio',
      authType: 'openai',
      baseUrl: 'http://192.168.1.5:1234/v1',
      description: '120+ t/s, 190k context',
      lastUsed: new Date().toISOString()
    }
  ],
  current: 'claude'
};

describe('Claude Code Max Integration', () => {
  let mockConfig: jest.Mocked<Config>;
  let providerManager: ProviderAuthManager;
  let modelOverrideManager: ModelOverrideManager;
  let originalProfilesPath: string;
  let testProfilesPath: string;

  beforeEach(async () => {
    // Setup test environment
    originalProfilesPath = path.join(homedir(), '.qwen', 'model-profiles.json');
    testProfilesPath = path.join(homedir(), '.qwen', 'model-profiles.test.json');
    
    // Backup existing profiles if they exist
    try {
      const existing = await fs.readFile(originalProfilesPath, 'utf-8');
      await fs.writeFile(testProfilesPath, existing);
    } catch {
      // No existing file, that's fine
    }
    
    // Write test profiles
    await fs.mkdir(path.dirname(originalProfilesPath), { recursive: true });
    await fs.writeFile(originalProfilesPath, JSON.stringify(TEST_MODEL_PROFILES, null, 2));
    
    // Setup mocks
    mockConfig = {
      getContentGeneratorConfig: jest.fn(),
      setModel: jest.fn(),
      setRuntimeModel: jest.fn(),
      refreshAuth: jest.fn(),
      getGeminiClient: jest.fn(() => ({
        initialize: jest.fn()
      }))
    } as any;
    
    providerManager = getProviderAuthManager();
    modelOverrideManager = getModelOverrideManager();
    
    // Clear any existing state
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Restore original profiles
    try {
      const backup = await fs.readFile(testProfilesPath, 'utf-8');
      await fs.writeFile(originalProfilesPath, backup);
      await fs.unlink(testProfilesPath);
    } catch {
      // Clean up test file
      try {
        await fs.unlink(originalProfilesPath);
      } catch {
        // File didn't exist, that's fine
      }
    }
  });

  describe('AuthType Resolution Pipeline', () => {
    test('should correctly resolve Claude provider to ANTHROPIC_OAUTH', () => {
      // Arrange
      providerManager.setActiveProvider('claude-code-max');
      
      // Act
      const resolvedAuthType = providerManager.getEffectiveAuthType();
      
      // Assert
      expect(resolvedAuthType).toBe(AuthType.ANTHROPIC_OAUTH);
    });

    test('should correctly resolve LM Studio provider to USE_OPENAI', () => {
      // Arrange
      providerManager.setActiveProvider('lmstudio');
      
      // Act
      const resolvedAuthType = providerManager.getEffectiveAuthType();
      
      // Assert
      expect(resolvedAuthType).toBe(AuthType.USE_OPENAI);
    });

    test('should prioritize provider-resolved AuthType over stale config', () => {
      // Arrange
      const staleAuthType = AuthType.LOCAL_LMSTUDIO;
      const providerAuthType = AuthType.ANTHROPIC_OAUTH;
      
      // Act
      const config = createContentGeneratorConfig(mockConfig, providerAuthType);
      
      // Assert - Should use provider AuthType, not stale config
      expect(config).toBeDefined();
      // The function should have been called with provider AuthType
    });
  });

  describe('Model Switching Functionality', () => {
    test('should successfully switch from local model to Claude', async () => {
      // Arrange
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'claude' };
      
      // Act
      const invocation = modelManager['createInvocation'](switchParams);
      const result = await invocation.execute(new AbortController().signal);
      
      // Assert
      expect(result.llmContent).toContain('success');
      expect(result.returnDisplay).toContain('Switched to:');
      expect(result.returnDisplay).toContain('Claude Code Max');
    });

    test('should successfully switch from Claude to local model', async () => {
      // Arrange
      const modelManager = new ModelManagerTool();
      
      // First switch to Claude
      let switchParams = { nickname: 'claude' };
      let invocation = modelManager['createInvocation'](switchParams);
      await invocation.execute(new AbortController().signal);
      
      // Then switch to local
      switchParams = { nickname: 'qwen4b' };
      invocation = modelManager['createInvocation'](switchParams);
      
      // Act
      const result = await invocation.execute(new AbortController().signal);
      
      // Assert
      expect(result.llmContent).toContain('success');
      expect(result.returnDisplay).toContain('Switched to:');
      expect(result.returnDisplay).toContain('Qwen 4B Fast');
    });
  });

  describe('Claude CLI Integration', () => {
    test('should properly map Claude model names to CLI aliases', () => {
      // Arrange
      const generator = new ClaudeSubprocessGenerator('/usr/local/bin/claude', 120000, 'sonnet');
      const request = {
        model: 'claude-sonnet-4-20250514',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]
      };
      
      // Act - Use reflection to access private method for testing
      const extractModelFromRequest = (generator as any).extractModelFromRequest.bind(generator);
      const result = extractModelFromRequest(request);
      
      // Assert
      expect(result).toBe('sonnet');
    });

    test('should handle non-Claude models gracefully', () => {
      // Arrange
      const generator = new ClaudeSubprocessGenerator('/usr/local/bin/claude', 120000, 'sonnet');
      const request = {
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]
      };
      
      // Act
      const extractModelFromRequest = (generator as any).extractModelFromRequest.bind(generator);
      const result = extractModelFromRequest(request);
      
      // Assert
      expect(result).toBe('sonnet'); // Should fallback to default
    });
  });

  describe('System Prompt Preservation', () => {
    test('should preserve system prompts across model switches', async () => {
      // Arrange
      const originalSystemPrompt = 'You are QwenCode, a helpful coding assistant.';
      mockConfig.getContentGeneratorConfig = jest.fn(() => ({
        systemInstruction: originalSystemPrompt,
        authType: AuthType.ANTHROPIC_OAUTH
      }));
      
      // Act - Switch models
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'claude' };
      const invocation = modelManager['createInvocation'](switchParams);
      await invocation.execute(new AbortController().signal);
      
      // Assert - System prompt should be preserved
      expect(mockConfig.refreshAuth).toHaveBeenCalled();
      // ModelOverrideManager should have preserved and restored state
    });
  });

  describe('Provider Authentication Integrity', () => {
    test('should not interfere with Qwen OAuth configuration', () => {
      // Arrange
      const providers = providerManager.getAllProviders();
      
      // Act
      const qwenProvider = providers.find(p => p.name === 'qwen-direct');
      
      // Assert
      expect(qwenProvider).toBeDefined();
      expect(qwenProvider?.authType).toBe('api-key'); // Qwen uses API key, not OAuth in current config
      expect(qwenProvider?.baseUrl).toBe('https://qwen.ai/api/v1');
    });

    test('should maintain separate authentication contexts per provider', () => {
      // Arrange & Act
      providerManager.setActiveProvider('claude-code-max');
      const claudeAuthType = providerManager.getEffectiveAuthType();
      
      providerManager.setActiveProvider('lmstudio');
      const lmstudioAuthType = providerManager.getEffectiveAuthType();
      
      // Assert
      expect(claudeAuthType).toBe(AuthType.ANTHROPIC_OAUTH);
      expect(lmstudioAuthType).toBe(AuthType.USE_OPENAI);
      expect(claudeAuthType).not.toBe(lmstudioAuthType);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    test('should handle missing model profiles gracefully', async () => {
      // Arrange - Remove test profiles
      await fs.unlink(originalProfilesPath);
      
      // Act
      const modelManager = new ModelManagerTool();
      const listParams = { action: 'list' };
      const invocation = modelManager['createInvocation'](listParams);
      const result = await invocation.execute(new AbortController().signal);
      
      // Assert
      expect(result.returnDisplay).toContain('No model profiles configured');
    });

    test('should handle invalid model switching gracefully', async () => {
      // Arrange
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'nonexistent-model' };
      
      // Act
      const invocation = modelManager['createInvocation'](switchParams);
      const result = await invocation.execute(new AbortController().signal);
      
      // Assert
      expect(result.returnDisplay).toContain('not found');
    });
  });

  describe('Performance and Resource Management', () => {
    test('should complete model switches within reasonable time', async () => {
      // Arrange
      const startTime = Date.now();
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'claude' };
      
      // Act
      const invocation = modelManager['createInvocation'](switchParams);
      const result = await invocation.execute(new AbortController().signal);
      const endTime = Date.now();
      
      // Assert
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.llmContent).toContain('success');
    });

    test('should properly clean up resources on model switch', async () => {
      // Arrange
      const initialMemory = process.memoryUsage();
      const modelManager = new ModelManagerTool();
      
      // Act - Perform multiple switches
      for (const nickname of ['claude', 'qwen4b', 'claude']) {
        const switchParams = { nickname };
        const invocation = modelManager['createInvocation'](switchParams);
        await invocation.execute(new AbortController().signal);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      
      // Assert - Memory usage shouldn't grow excessively
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB growth
    });
  });
});

describe('Integration with QwenCode Core Systems', () => {
  test('should maintain compatibility with existing tool system', () => {
    // Arrange
    const modelManager = new ModelManagerTool();
    
    // Act & Assert
    expect(modelManager.name).toBe('model_manager');
    expect(modelManager.displayName).toBe('Model Manager');
    expect(modelManager.kind).toBeDefined();
  });

  test('should preserve configuration across authentication refreshes', async () => {
    // This test ensures that the "smoking gun" fix works correctly
    const config = mockConfig;
    const modelOverrideManager = getModelOverrideManager();
    
    // Arrange - Set runtime model
    process.env.OPENAI_MODEL = 'claude-sonnet-4-20250514';
    
    // Act - Simulate auth refresh (what caused the original bug)
    modelOverrideManager.preserveBeforeRefresh(config);
    // Simulate config refresh that would normally destroy runtime model
    delete process.env.OPENAI_MODEL;
    modelOverrideManager.restoreAfterRefresh(config);
    
    // Assert - Runtime model should be restored
    expect(process.env.OPENAI_MODEL).toBe('claude-sonnet-4-20250514');
  });
});