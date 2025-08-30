#!/usr/bin/env node

/**
 * Simple Claude Integration Test
 * 
 * Tests basic model switching and Claude response without complex session management
 */

import { spawn } from 'child_process';

async function testSimpleModelSwitching() {
  console.log('🧪 Testing simple model switching...');
  
  try {
    // Test 1: List models
    console.log('📋 Listing available models...');
    const listResult = await runCommand('model_manager list', 15000);
    console.log('✅ Model list response:', listResult.substring(0, 200));
    
    // Test 2: Switch to local model
    console.log('🔄 Switching to local model...');
    const localResult = await runCommand('model_manager switch 4bdev', 15000);
    console.log('✅ Local switch response (full):', localResult);
    
    // Test 3: Simple local model test
    console.log('🤖 Testing local model...');
    const localTest = await runCommand('What is 2+2? Answer with just the number.', 15000);
    console.log('✅ Local test response:', localTest.substring(0, 200));
    
    // Test 4: Switch to Claude
    console.log('🔄 Switching to Claude model...');
    const claudeResult = await runCommand('model_manager switch claude', 30000);
    console.log('✅ Claude switch response:', claudeResult.substring(0, 200));
    
    // Test 5: Simple Claude test
    console.log('🤖 Testing Claude model...');
    const claudeTest = await runCommand('What is 3+3? Answer with just the number.', 30000);
    console.log('✅ Claude test response:', claudeTest.substring(0, 200));
    
    console.log('🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

async function runCommand(command, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn('node', ['packages/cli/dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    let output = '';
    let error = '';
    
    const timeoutId = setTimeout(() => {
      childProcess.kill();
      reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
    }, timeout);
    
    childProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    childProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    childProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}. Command: ${command}. Error: ${error}. Output: ${output}`));
      } else {
        resolve(output);
      }
    });
    
    // Send the command
    childProcess.stdin.write(command + '\n');
    childProcess.stdin.end();
  });
}

// Run the test
testSimpleModelSwitching().catch((error) => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});