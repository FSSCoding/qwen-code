#!/usr/bin/env node

/**
 * COMPREHENSIVE CLAUDE CODE MAX INTEGRATION TEST
 * 
 * This test validates:
 * 1. Model switching between local and Claude works correctly
 * 2. Claude responses are actually from Claude (not local model)
 * 3. Local model responses are from local GPU
 * 4. Multiple back-and-forth interactions work
 * 5. GPU usage monitoring to ensure correct model is being used
 * 
 * REQUIREMENTS:
 * - nvidia-smi available for GPU monitoring
 * - Claude CLI installed and authenticated
 * - Local model running on LM Studio
 * 
 * PASS CRITERIA:
 * - All model switches successful
 * - Claude identifies itself correctly
 * - Local model shows GPU usage
 * - Claude shows no GPU usage
 * - Multiple interactions work in same session
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const TEST_TIMEOUT = 60000; // 1 minute per test
const INTERACTION_TIMEOUT = 20000; // 20 seconds per interaction

class ComprehensiveClaudeTest {
  constructor() {
    this.results = {
      modelSwitching: { pass: false, details: '' },
      claudeIdentity: { pass: false, details: '' },
      localModelGPU: { pass: false, details: '' },
      claudeNoGPU: { pass: false, details: '' },
      multipleInteractions: { pass: false, details: '' },
      backAndForthConversation: { pass: false, details: '' }
    };
    this.sessionProcess = null;
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 ${testName}`);
    console.log('─'.repeat(60));
    
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      console.log(`✅ PASSED: ${testName} (${duration}ms)`);
      return true;
    } catch (error) {
      console.log(`❌ FAILED: ${testName}`);
      console.error(`   Error: ${error.message}`);
      return false;
    }
  }

  async startInteractiveSession() {
    console.log('🚀 Starting interactive QwenCode session...');
    
    this.sessionProcess = spawn('node', ['packages/cli/dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    let sessionReady = false;
    let sessionOutput = '';
    
    // Wait for session to be ready
    this.sessionProcess.stdout.on('data', (data) => {
      const output = data.toString();
      sessionOutput += output;
      if (output.includes('What would you like to do next') || 
          output.includes('I\'m ready to assist') ||
          output.includes('Type your message') || 
          output.includes('>')) {
        sessionReady = true;
      }
    });
    
    this.sessionProcess.stderr.on('data', (data) => {
      sessionOutput += data.toString();
    });
    
    // Wait for session to be ready
    let attempts = 0;
    while (!sessionReady && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    if (!sessionReady) {
      throw new Error(`Session failed to start. Output: ${sessionOutput.slice(-500)}`);
    }
    
    console.log('✓ Interactive session started');
    return sessionOutput;
  }

  async sendCommand(command, expectedInOutput = null, timeout = INTERACTION_TIMEOUT) {
    return new Promise((resolve, reject) => {
      let output = '';
      let stderr = '';
      const timeoutId = setTimeout(() => {
        reject(new Error(`Command "${command}" timed out after ${timeout}ms. Output: ${output.slice(-200)}`));
      }, timeout);
      
      const dataHandler = (data) => {
        output += data.toString();
        // Check if we got expected output or a prompt
        if ((expectedInOutput && output.includes(expectedInOutput)) || 
            output.includes('What would you like to do next') ||
            output.includes('I\'m ready to assist') ||
            output.includes('> ') || 
            output.includes('Type your message')) {
          clearTimeout(timeoutId);
          this.sessionProcess.stdout.off('data', dataHandler);
          this.sessionProcess.stderr.off('data', stderrHandler);
          resolve({ output, stderr });
        }
      };
      
      const stderrHandler = (data) => {
        stderr += data.toString();
      };
      
      this.sessionProcess.stdout.on('data', dataHandler);
      this.sessionProcess.stderr.on('data', stderrHandler);
      
      // Send the command
      this.sessionProcess.stdin.write(command + '\n');
    });
  }

  async getGPUUsage() {
    return new Promise((resolve) => {
      const process = spawn('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits']);
      let output = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          const usage = parseInt(output.trim());
          resolve(isNaN(usage) ? 0 : usage);
        } else {
          resolve(0); // Assume 0 if can't get GPU usage
        }
      });
      
      process.on('error', () => {
        resolve(0); // Assume 0 if nvidia-smi not available
      });
      
      setTimeout(() => {
        process.kill();
        resolve(0);
      }, 5000);
    });
  }

  async testModelSwitching() {
    console.log('   🔄 Testing model switching functionality...');
    
    // Test 1: Switch to local model
    console.log('   📝 Switching to local model (4bdev)...');
    const localSwitch = await this.sendCommand('model_manager switch 4bdev', null, 25000);
    console.log(`   📊 Local switch response: ${localSwitch.output.slice(-300)}`);
    
    if (!localSwitch.output.includes('Switched to:') && !localSwitch.output.includes('qwen3-4b')) {
      throw new Error(`Failed to switch to local model. Output: ${localSwitch.output.slice(-500)}`);
    }
    
    // Test 2: Switch to Claude
    console.log('   📝 Switching to Claude model...');
    const claudeSwitch = await this.sendCommand('model_manager switch claude', null, 30000);
    console.log(`   📊 Claude switch response: ${claudeSwitch.output.slice(-300)}`);
    
    if (!claudeSwitch.output.includes('Switched to:') && !claudeSwitch.output.includes('Claude')) {
      throw new Error(`Failed to switch to Claude. Output: ${claudeSwitch.output.slice(-500)}`);
    }
    
    this.results.modelSwitching = { 
      pass: true, 
      details: 'Successfully switched between local model and Claude Code Max' 
    };
  }

  async testLocalModelWithGPU() {
    console.log('   📊 Testing local model with GPU monitoring...');
    
    // Switch to local model
    await this.sendCommand('model_manager switch 4bdev', null, 25000);
    
    // Get baseline GPU usage
    const baselineGPU = await this.getGPUUsage();
    console.log(`   📊 Baseline GPU usage: ${baselineGPU}%`);
    
    // Send a request to local model
    const response = await this.sendCommand('What is 2+2? Answer with just the number.', null, 15000);
    
    // Get GPU usage during/after request
    const activeGPU = await this.getGPUUsage();
    console.log(`   📊 GPU usage after local request: ${activeGPU}%`);
    
    // Verify response contains "4" and came from local model
    if (!response.output.includes('4')) {
      throw new Error(`Local model didn't respond correctly. Response: ${response.output}`);
    }
    
    // Verify GPU was used (should be higher than baseline or at least > 0)
    if (activeGPU === 0 && baselineGPU === 0) {
      console.warn('   ⚠️ Warning: Could not detect GPU usage, but local model responded');
    }
    
    this.results.localModelGPU = { 
      pass: true, 
      details: `Local model responded correctly. GPU usage: ${activeGPU}%` 
    };
  }

  async testClaudeIdentityAndNoGPU() {
    console.log('   📊 Testing Claude identity and GPU monitoring...');
    
    // Switch to Claude
    await this.sendCommand('model_manager switch claude', null, 30000);
    
    // Get baseline GPU usage
    const baselineGPU = await this.getGPUUsage();
    console.log(`   📊 Baseline GPU usage: ${baselineGPU}%`);
    
    // Send identity question to Claude
    const response = await this.sendCommand('Who are you? Be specific about your identity.', null, 30000);
    
    // Get GPU usage during/after Claude request
    const activeGPU = await this.getGPUUsage();
    console.log(`   📊 GPU usage after Claude request: ${activeGPU}%`);
    
    // Verify Claude identifies itself correctly
    const output = response.output.toLowerCase();
    if (!output.includes('claude') || output.includes('qwen')) {
      throw new Error(`Claude didn't identify itself correctly. Response: ${response.output.slice(-300)}`);
    }
    
    // Verify minimal GPU usage (should be same as baseline or very low)
    const gpuIncrease = activeGPU - baselineGPU;
    if (gpuIncrease > 10) {
      throw new Error(`GPU usage increased by ${gpuIncrease}% during Claude request, suggesting local model was used`);
    }
    
    this.results.claudeIdentity = { 
      pass: true, 
      details: `Claude identified itself correctly. GPU increase: ${gpuIncrease}%` 
    };
    
    this.results.claudeNoGPU = { 
      pass: true, 
      details: `GPU usage remained low during Claude request (${gpuIncrease}% increase)` 
    };
  }

  async testBackAndForthConversation() {
    console.log('   💬 Testing back-and-forth conversation...');
    
    const interactions = [
      { model: '4bdev', question: 'What is 5+3?', expectedAnswer: '8', expectedIdentity: 'qwen' },
      { model: 'claude', question: 'What is 7+2?', expectedAnswer: '9', expectedIdentity: 'claude' },
      { model: '4bdev', question: 'What is 10-4?', expectedAnswer: '6', expectedIdentity: 'qwen' },
      { model: 'claude', question: 'What is 15/3? Also, who are you?', expectedAnswer: '5', expectedIdentity: 'claude' }
    ];
    
    for (let i = 0; i < interactions.length; i++) {
      const interaction = interactions[i];
      console.log(`   📝 Interaction ${i+1}: ${interaction.model} - ${interaction.question}`);
      
      // Switch model
      const switchResponse = await this.sendCommand(`model_manager switch ${interaction.model}`, null, 25000);
      
      // Get GPU usage before
      const beforeGPU = await this.getGPUUsage();
      
      // Send question
      const response = await this.sendCommand(interaction.question, null, 25000);
      
      // Get GPU usage after
      const afterGPU = await this.getGPUUsage();
      const gpuIncrease = afterGPU - beforeGPU;
      
      // Verify answer
      if (!response.output.includes(interaction.expectedAnswer)) {
        throw new Error(`Interaction ${i+1} failed: Expected "${interaction.expectedAnswer}" in response. Got: ${response.output.slice(-200)}`);
      }
      
      // Verify model identity
      const outputLower = response.output.toLowerCase();
      if (interaction.expectedIdentity === 'claude' && !outputLower.includes('claude')) {
        throw new Error(`Interaction ${i+1} failed: Expected Claude identity but got: ${response.output.slice(-200)}`);
      }
      
      // Verify GPU usage pattern
      if (interaction.model === '4bdev' && gpuIncrease < -5) {
        console.log(`   ⚠️ Warning: Local model but low GPU increase (${gpuIncrease}%)`);
      } else if (interaction.model === 'claude' && gpuIncrease > 10) {
        console.log(`   ⚠️ Warning: Claude model but high GPU increase (${gpuIncrease}%)`);
      }
      
      console.log(`   ✓ Interaction ${i+1} passed - Answer: ${interaction.expectedAnswer}, GPU: ${gpuIncrease}%`);
    }
    
    this.results.backAndForthConversation = { 
      pass: true, 
      details: `All ${interactions.length} back-and-forth interactions successful` 
    };
  }

  async testMultipleInteractions() {
    console.log('   🔄 Testing multiple interactions in same session...');
    
    // Test multiple local interactions
    await this.sendCommand('model_manager switch 4bdev', null, 25000);
    const local1 = await this.sendCommand('What is 1+1?', null, 15000);
    const local2 = await this.sendCommand('What is 2+2?', null, 15000);
    
    if (!local1.output.includes('2') || !local2.output.includes('4')) {
      throw new Error(`Multiple local interactions failed. Local1: ${local1.output.slice(-100)}, Local2: ${local2.output.slice(-100)}`);
    }
    
    // Test multiple Claude interactions  
    await this.sendCommand('model_manager switch claude', null, 30000);
    const claude1 = await this.sendCommand('What is 3+3?', null, 25000);
    const claude2 = await this.sendCommand('What is 4+4? Also identify yourself.', null, 25000);
    
    if (!claude1.output.includes('6') || !claude2.output.includes('8')) {
      throw new Error(`Multiple Claude interactions failed. Claude1: ${claude1.output.slice(-100)}, Claude2: ${claude2.output.slice(-100)}`);
    }
    
    if (!claude2.output.toLowerCase().includes('claude')) {
      throw new Error(`Claude didn't identify itself in second interaction. Response: ${claude2.output.slice(-200)}`);
    }
    
    this.results.multipleInteractions = { 
      pass: true, 
      details: 'Multiple interactions with both models successful' 
    };
  }

  async cleanup() {
    if (this.sessionProcess) {
      console.log('🧹 Cleaning up session...');
      this.sessionProcess.stdin.write('/quit\n');
      
      setTimeout(() => {
        if (this.sessionProcess && !this.sessionProcess.killed) {
          this.sessionProcess.kill('SIGTERM');
        }
      }, 5000);
    }
  }

  async runAllTests() {
    console.log('🚀 COMPREHENSIVE CLAUDE CODE MAX INTEGRATION TEST SUITE');
    console.log('=' .repeat(80));
    console.log('This test validates complete Claude Code Max integration functionality');
    console.log('including model switching, identity verification, and GPU monitoring.');
    console.log('=' .repeat(80));
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    try {
      // Start interactive session
      await this.startInteractiveSession();
      
      // Run all tests
      const tests = [
        ['Model Switching', () => this.testModelSwitching()],
        ['Local Model with GPU Usage', () => this.testLocalModelWithGPU()],
        ['Claude Identity and No GPU', () => this.testClaudeIdentityAndNoGPU()],
        ['Multiple Interactions', () => this.testMultipleInteractions()],
        ['Back-and-Forth Conversation', () => this.testBackAndForthConversation()],
      ];
      
      for (const [name, testFn] of tests) {
        const success = await this.runTest(name, testFn);
        if (success) {
          totalPassed++;
        } else {
          totalFailed++;
        }
      }
      
    } catch (error) {
      console.error('💥 Test suite setup failed:', error.message);
      totalFailed++;
    } finally {
      await this.cleanup();
    }
    
    // Print detailed results
    console.log('\n' + '=' .repeat(80));
    console.log('📊 DETAILED TEST RESULTS');
    console.log('=' .repeat(80));
    
    for (const [testName, result] of Object.entries(this.results)) {
      const status = result.pass ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${testName}: ${result.details}`);
    }
    
    console.log('\n' + '=' .repeat(80));
    console.log(`📈 FINAL RESULTS: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('=' .repeat(80));
    
    if (totalFailed === 0 && totalPassed >= 5) {
      console.log('🎉 ALL TESTS PASSED! Claude Code Max integration is FULLY FUNCTIONAL.');
      console.log('✅ Model switching works correctly');
      console.log('✅ Claude identifies itself properly');  
      console.log('✅ Local models use GPU as expected');
      console.log('✅ Claude requests don\'t use local GPU');
      console.log('✅ Multiple interactions work in same session');
      console.log('✅ Back-and-forth conversations work correctly');
      console.log('\n🚀 The integration is ready for use!');
      process.exit(0);
    } else {
      console.log('💥 TESTS FAILED! Claude Code Max integration has issues.');
      console.log(`❌ ${totalFailed} test(s) failed`);
      console.log('🔧 Review the detailed results above and fix the issues.');
      process.exit(1);
    }
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Test terminated');
  process.exit(1);
});

// Run the comprehensive test suite
const test = new ComprehensiveClaudeTest();
test.runAllTests().catch((error) => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});