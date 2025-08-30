#!/usr/bin/env node

/**
 * Direct Claude Subprocess Generator Test
 * 
 * Tests the ClaudeSubprocessGenerator directly without QwenCode CLI integration
 */

import { ClaudeSubprocessGenerator } from './packages/core/dist/src/anthropic/claudeSubprocessGenerator.js';
import { AuthType } from './packages/core/dist/src/core/contentGenerator.js';

async function testClaudeSubprocessGenerator() {
  console.log('🚀 Testing Claude Subprocess Generator directly...');
  
  try {
    // Test 1: Check CLI availability
    console.log('📋 Checking Claude CLI availability...');
    const cliInfo = await ClaudeSubprocessGenerator.getCliInfo();
    console.log('✅ CLI Info:', cliInfo);
    
    if (!cliInfo.available) {
      throw new Error('Claude CLI not available');
    }
    
    // Test 2: Create generator instance
    console.log('🏗️ Creating ClaudeSubprocessGenerator instance...');
    const config = {
      model: 'claude-sonnet-4-20250514',
      authType: AuthType.ANTHROPIC_OAUTH,
      timeout: 30000
    };
    
    const mockGcConfig = {
      getCliVersion: () => '0.0.9',
      getContentGeneratorTimeout: () => 30000,
      getContentGeneratorMaxRetries: () => 3,
      getContentGeneratorSamplingParams: () => ({ temperature: 0.7 })
    };
    
    const generator = new ClaudeSubprocessGenerator(config, mockGcConfig, {
      model: 'sonnet',
      timeout: 30000
    });
    
    console.log('✅ Generator created successfully');
    
    // Test 3: Simple generation test
    console.log('🤖 Testing simple content generation...');
    const request = {
      contents: [{
        role: 'user',
        parts: [{ text: 'What is 2+2? Answer with just the number.' }]
      }]
    };
    
    const response = await generator.generateContent(request, 'test-prompt-1');
    console.log('✅ Generation response:', response);
    
    // Test 4: Identity test
    console.log('🔍 Testing Claude identity...');
    const identityRequest = {
      contents: [{
        role: 'user',
        parts: [{ text: 'Who are you? Answer in one sentence.' }]
      }]
    };
    
    const identityResponse = await generator.generateContent(identityRequest, 'test-prompt-2');
    console.log('✅ Identity response:', identityResponse);
    
    console.log('🎉 All Claude Subprocess tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('📊 Error details:', error);
    process.exit(1);
  }
}

// Run the test
testClaudeSubprocessGenerator().catch((error) => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});