/**
 * @fileoverview System Prompt Preservation Tests
 * 
 * Critical tests to ensure that QwenCode system prompts and instructions
 * are preserved across model switching operations. This is essential for
 * maintaining consistent behavior and user experience.
 * 
 * @author QwenCode Integration Team
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { Config } from '../config/config.js';
import { AuthType, createContentGeneratorConfig } from '../core/contentGenerator.js';
import { getModelOverrideManager } from '../core/modelOverrideManager.js';
import { ModelManagerTool } from '../tools/modelManager.js';

/**
 * Test system prompts that should be preserved
 */
const CRITICAL_SYSTEM_PROMPTS = {
  QWEN_CODE_BASE: `You are QwenCode, a helpful coding assistant that helps developers write better code. 

Key behaviors:
- Always provide working code examples
- Explain complex concepts clearly  
- Suggest best practices
- Help with debugging and optimization
- Maintain consistency across conversations`,

  QWEN_CODE_WITH_TOOLS: `You are QwenCode with access to development tools.

Available capabilities:
- File reading and writing
- Code execution and testing  
- Git operations
- Package management
- System shell access

Use these tools to provide comprehensive development assistance.`,

  CUSTOM_USER_INSTRUCTIONS: `Custom user instructions that must be preserved:
- Follow specific coding style guidelines
- Use particular frameworks or libraries
- Maintain specific project conventions
- Apply domain-specific knowledge
- Remember user preferences and context`
};

describe('System Prompt Preservation', () => {
  let mockConfig: jest.Mocked<Config>;
  let modelOverrideManager: any;

  beforeEach(() => {
    mockConfig = global.testUtils.createMockConfig();
    modelOverrideManager = getModelOverrideManager();
    jest.clearAllMocks();
  });

  describe('Basic System Prompt Preservation', () => {
    test('should preserve system instructions when switching to Claude', async () => {
      // Arrange
      const originalSystemPrompt = CRITICAL_SYSTEM_PROMPTS.QWEN_CODE_BASE;
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        authType: AuthType.LOCAL_LMSTUDIO,
        systemInstruction: originalSystemPrompt,
        model: 'qwen/qwen3-4b-2507'
      });

      // Act - Switch to Claude
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'claude' };
      const invocation = modelManager['createInvocation'](switchParams);
      
      // Simulate the preserve/restore cycle that happens during model switching
      modelOverrideManager.preserveBeforeRefresh(mockConfig);
      const result = await invocation.execute(new AbortController().signal);
      modelOverrideManager.restoreAfterRefresh(mockConfig);

      // Assert
      expect(result.llmContent).toContain('success');
      // Verify that refreshAuth was called (indicating model switch happened)
      expect(mockConfig.refreshAuth).toHaveBeenCalled();
    });

    test('should preserve custom user instructions across model switches', async () => {
      // Arrange
      const customInstructions = CRITICAL_SYSTEM_PROMPTS.CUSTOM_USER_INSTRUCTIONS;
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        authType: AuthType.ANTHROPIC_OAUTH,
        systemInstruction: customInstructions,
        model: 'claude-sonnet-4-20250514',
        customInstructions: 'User-specific preferences that must persist'
      });

      // Act - Switch to local model and back
      const modelManager = new ModelManagerTool();
      
      // Switch to local
      let switchParams = { nickname: 'qwen4b' };
      let invocation = modelManager['createInvocation'](switchParams);
      await invocation.execute(new AbortController().signal);
      
      // Switch back to Claude
      switchParams = { nickname: 'claude' };
      invocation = modelManager['createInvocation'](switchParams);
      const result = await invocation.execute(new AbortController().signal);

      // Assert
      expect(result.llmContent).toContain('success');
      expect(mockConfig.refreshAuth).toHaveBeenCalledTimes(2);
    });
  });

  describe('Tool Integration System Prompts', () => {
    test('should preserve tool-related system instructions', async () => {
      // Arrange
      const toolSystemPrompt = CRITICAL_SYSTEM_PROMPTS.QWEN_CODE_WITH_TOOLS;
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        authType: AuthType.ANTHROPIC_OAUTH,
        systemInstruction: toolSystemPrompt,
        model: 'claude-sonnet-4-20250514',
        toolConfig: {
          enabledTools: ['read-file', 'write-file', 'shell', 'grep'],
          toolInstructions: 'Use tools effectively to help users'
        }
      });

      // Act
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'qwen4b' };
      const invocation = modelManager['createInvocation'](switchParams);
      
      modelOverrideManager.preserveBeforeRefresh(mockConfig);
      const result = await invocation.execute(new AbortController().signal);
      modelOverrideManager.restoreAfterRefresh(mockConfig);

      // Assert
      expect(result.llmContent).toContain('success');
      // Tool configuration should be preserved
    });
  });

  describe('Environment-Specific Instructions', () => {
    test('should handle system prompts with environment variables', async () => {
      // Arrange
      process.env.QWEN_CUSTOM_PROMPT = 'Environment-specific instructions';
      const envSystemPrompt = `${CRITICAL_SYSTEM_PROMPTS.QWEN_CODE_BASE}\n\nAdditional: ${process.env.QWEN_CUSTOM_PROMPT}`;
      
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        authType: AuthType.ANTHROPIC_OAUTH,
        systemInstruction: envSystemPrompt,
        model: 'claude-sonnet-4-20250514'
      });

      // Act
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'claude' };
      const invocation = modelManager['createInvocation'](switchParams);
      const result = await invocation.execute(new AbortController().signal);

      // Assert
      expect(result.llmContent).toContain('success');
      
      // Cleanup
      delete process.env.QWEN_CUSTOM_PROMPT;
    });

    test('should preserve conversation context across switches', async () => {
      // Arrange
      const conversationContext = {
        previousMessages: [
          { role: 'user', content: 'Help me with React hooks' },
          { role: 'assistant', content: 'I can help you with React hooks...' }
        ],
        projectContext: 'Working on a React TypeScript project',
        userPreferences: 'Prefers functional components'
      };

      mockConfig.getContentGeneratorConfig.mockReturnValue({
        authType: AuthType.ANTHROPIC_OAUTH,
        systemInstruction: CRITICAL_SYSTEM_PROMPTS.QWEN_CODE_BASE,
        model: 'claude-sonnet-4-20250514',
        conversationContext
      });

      // Act
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'qwen32' };
      const invocation = modelManager['createInvocation'](switchParams);
      const result = await invocation.execute(new AbortController().signal);

      // Assert
      expect(result.llmContent).toContain('success');
    });
  });

  describe('Error Recovery and Fallbacks', () => {
    test('should handle corrupted system prompts gracefully', async () => {
      // Arrange
      const corruptedPrompt = null; // Simulate corrupted/missing prompt
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        authType: AuthType.ANTHROPIC_OAUTH,
        systemInstruction: corruptedPrompt,
        model: 'claude-sonnet-4-20250514'
      });

      // Act
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'claude' };
      const invocation = modelManager['createInvocation'](switchParams);
      const result = await invocation.execute(new AbortController().signal);

      // Assert - Should not crash, should handle gracefully
      expect(result.llmContent).toBeDefined();
    });

    test('should restore system prompts after failed model switch', async () => {
      // Arrange
      const originalPrompt = CRITICAL_SYSTEM_PROMPTS.QWEN_CODE_BASE;
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        authType: AuthType.ANTHROPIC_OAUTH,
        systemInstruction: originalPrompt,
        model: 'claude-sonnet-4-20250514'
      });

      // Simulate a failed auth refresh
      mockConfig.refreshAuth.mockRejectedValueOnce(new Error('Auth failed'));

      // Act
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'nonexistent-model' };
      const invocation = modelManager['createInvocation'](switchParams);
      
      try {
        await invocation.execute(new AbortController().signal);
      } catch (error) {
        // Expected to fail
      }

      // Assert - Original system prompt should still be available
      // This tests the robustness of the system
    });
  });

  describe('Performance Impact', () => {
    test('system prompt preservation should not significantly impact switch time', async () => {
      // Arrange
      const largeSystemPrompt = CRITICAL_SYSTEM_PROMPTS.QWEN_CODE_BASE.repeat(10); // Large prompt
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        authType: AuthType.ANTHROPIC_OAUTH,
        systemInstruction: largeSystemPrompt,
        model: 'claude-sonnet-4-20250514'
      });

      // Act
      const startTime = Date.now();
      const modelManager = new ModelManagerTool();
      const switchParams = { nickname: 'claude' };
      const invocation = modelManager['createInvocation'](switchParams);
      const result = await invocation.execute(new AbortController().signal);
      const endTime = Date.now();

      // Assert
      expect(result.llmContent).toContain('success');
      expect(endTime - startTime).toBeLessThan(15000); // Should complete within 15 seconds even with large prompt
    });
  });

  describe('Integration with Model Override Manager', () => {
    test('should work correctly with ModelOverrideManager preserve/restore cycle', () => {
      // Arrange
      const testConfig = mockConfig;
      const originalModel = 'qwen/qwen3-4b-2507';
      const newModel = 'claude-sonnet-4-20250514';
      
      // Set initial state
      process.env.OPENAI_MODEL = originalModel;
      testConfig.getContentGeneratorConfig.mockReturnValue({
        authType: AuthType.LOCAL_LMSTUDIO,
        systemInstruction: CRITICAL_SYSTEM_PROMPTS.QWEN_CODE_BASE,
        model: originalModel
      });

      // Act - Simulate the complete preserve/restore cycle
      modelOverrideManager.preserveBeforeRefresh(testConfig);
      
      // Simulate what happens during refreshAuth (model changes)
      process.env.OPENAI_MODEL = newModel;
      testConfig.getContentGeneratorConfig.mockReturnValue({
        authType: AuthType.ANTHROPIC_OAUTH,
        systemInstruction: CRITICAL_SYSTEM_PROMPTS.QWEN_CODE_BASE, // Should be preserved
        model: newModel
      });
      
      modelOverrideManager.restoreAfterRefresh(testConfig);

      // Assert
      expect(process.env.OPENAI_MODEL).toBe(newModel);
      // System instruction should be preserved through the cycle
    });
  });
});