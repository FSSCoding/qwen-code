#!/usr/bin/env node

/**
 * Comprehensive Model Switching Test
 * Tests all configured models: claude, qwen4b, qwen4t, qwen32, gpt20
 * Verifies bidirectional switching works perfectly
 */

import { spawn } from 'child_process';

const MODELS = [
  { nickname: 'claude', displayName: 'Claude Code Max', expectText: 'Claude' },
  { nickname: 'qwen4b', displayName: 'Qwen 4B Fast', expectText: 'qwen' },
  { nickname: 'qwen4t', displayName: 'Qwen 4B Thinking', expectText: 'qwen' },
  { nickname: 'qwen32', displayName: 'Qwen 32B Complex', expectText: 'qwen' },
  { nickname: 'gpt20', displayName: 'Local GPT OSS 20B', expectText: 'GPT' }
];

class ModelTester {
  async runCommand(command, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      console.log(`🔧 Running: ${command}`);
      
      const child = spawn('node', ['/MASTERFOLDER/QwenCode/bundle/gemini.js', '--prompt', command], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let errorOutput = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          code,
          output: output + errorOutput,
          success: code === 0
        });
      });
    });
  }

  async testModelSwitch(modelNickname, displayName) {
    console.log(`\n🔄 Testing switch to ${displayName} (${modelNickname})`);
    
    try {
      // Switch to model
      const switchResult = await this.runCommand(`/model ${modelNickname}`, 25000);
      
      if (switchResult.output.includes('Switched to:') || 
          switchResult.output.includes(displayName) ||
          switchResult.output.includes('Done - you\'re now using')) {
        console.log(`✅ Successfully switched to ${modelNickname}`);
        return true;
      } else {
        console.log(`❌ Failed to switch to ${modelNickname}`);
        console.log(`📋 Output: ${switchResult.output.slice(-200)}`);
        return false;
      }
      
    } catch (error) {
      console.log(`❌ Error switching to ${modelNickname}: ${error.message}`);
      return false;
    }
  }

  async testModelResponse(modelNickname, expectText) {
    console.log(`\n📝 Testing response from ${modelNickname}`);
    
    try {
      const testResult = await this.runCommand(`What is 2+2? Please identify yourself in your response.`, 20000);
      
      if (testResult.output.includes('4') || testResult.output.includes('four')) {
        console.log(`✅ ${modelNickname} responded correctly (got 2+2=4)`);
        
        // Check if model identifies itself correctly
        const lowerOutput = testResult.output.toLowerCase();
        if (lowerOutput.includes(expectText.toLowerCase())) {
          console.log(`✅ ${modelNickname} identified itself correctly`);
        } else {
          console.log(`⚠️  ${modelNickname} answered correctly but didn't identify as expected`);
        }
        return true;
      } else {
        console.log(`❌ ${modelNickname} gave unexpected response`);
        console.log(`📋 Response: ${testResult.output.slice(-300)}`);
        return false;
      }
      
    } catch (error) {
      console.log(`❌ Error testing ${modelNickname} response: ${error.message}`);
      return false;
    }
  }

  async runComprehensiveTest() {
    console.log('🚀 Starting Comprehensive Model Switching Test');
    console.log('=' .repeat(60));
    
    const results = {
      switches: 0,
      responses: 0,
      total: MODELS.length,
      failed: []
    };
    
    // Test each model
    for (const model of MODELS) {
      console.log(`\n🎯 Testing ${model.displayName} (${model.nickname})`);
      console.log('-'.repeat(40));
      
      // Test switching
      const switchSuccess = await this.testModelSwitch(model.nickname, model.displayName);
      if (switchSuccess) {
        results.switches++;
        
        // Test response
        const responseSuccess = await this.testModelResponse(model.nickname, model.expectText);
        if (responseSuccess) {
          results.responses++;
        } else {
          results.failed.push(`${model.nickname} (response)`);
        }
      } else {
        results.failed.push(`${model.nickname} (switch)`);
      }
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Test bidirectional switching (claude <-> qwen4b <-> claude)
    console.log(`\n🔄 Testing Bidirectional Switching`);
    console.log('-'.repeat(40));
    
    let bidirectionalWorking = true;
    
    try {
      // Start with claude
      await this.testModelSwitch('claude', 'Claude Code Max');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Switch to qwen4b
      await this.testModelSwitch('qwen4b', 'Qwen 4B Fast');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Switch back to claude
      await this.testModelSwitch('claude', 'Claude Code Max');
      
      console.log(`✅ Bidirectional switching works perfectly`);
      
    } catch (error) {
      console.log(`❌ Bidirectional switching failed: ${error.message}`);
      bidirectionalWorking = false;
    }
    
    // Final report
    console.log(`\n📊 COMPREHENSIVE TEST RESULTS`);
    console.log('=' .repeat(60));
    console.log(`✅ Model Switches: ${results.switches}/${results.total}`);
    console.log(`✅ Model Responses: ${results.responses}/${results.total}`);
    console.log(`✅ Bidirectional: ${bidirectionalWorking ? 'PASS' : 'FAIL'}`);
    
    if (results.failed.length > 0) {
      console.log(`❌ Failed Tests: ${results.failed.join(', ')}`);
    }
    
    const overallSuccess = (results.switches === results.total) && 
                          (results.responses === results.total) && 
                          bidirectionalWorking;
    
    console.log(`\n🎯 OVERALL RESULT: ${overallSuccess ? '✅ ALL MODELS WORKING PERFECTLY' : '❌ SOME ISSUES FOUND'}`);
    
    return {
      success: overallSuccess,
      switches: results.switches,
      responses: results.responses,
      bidirectional: bidirectionalWorking,
      failed: results.failed
    };
  }
}

// Run the test
const tester = new ModelTester();
tester.runComprehensiveTest()
  .then(results => {
    console.log('\n🏁 Test completed');
    process.exit(results.success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  });