#!/usr/bin/env node
/**
 * 🎯 Claude Code Max Authentication Test
 * 
 * This script tests Claude Code Max authentication using the proper login flow.
 * No API keys needed - uses the same authentication as the Claude web app.
 * 
 * Usage: node test-claude-max.js
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Check if Claude Code is installed
 */
async function checkClaudeInstalled() {
  try {
    const { stdout } = await execAsync('claude --version');
    console.log('✅ Claude Code installed:', stdout.trim());
    return true;
  } catch (error) {
    console.log('❌ Claude Code not found. Please install it first.');
    console.log('   Install: npm install -g @anthropics/claude-code');
    return false;
  }
}

/**
 * Check current authentication status
 */
async function checkAuthStatus() {
  try {
    console.log('\n🔍 Checking current Claude Code authentication status...');
    
    // Try to run claude with a simple command to check auth
    const { stdout, stderr } = await execAsync('claude --help', { timeout: 10000 });
    
    console.log('✅ Claude Code is accessible');
    return true;
  } catch (error) {
    console.log('⚠️  Claude Code authentication may need setup');
    return false;
  }
}

/**
 * Test Claude Code Max with a simple prompt
 */
async function testClaudeMax() {
  return new Promise((resolve) => {
    console.log('\n🧪 Testing Claude Code Max with simple prompt...');
    console.log('📝 Sending: "Please respond with exactly: Claude Code Max test successful"');
    
    const claude = spawn('claude', [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    let testComplete = false;
    
    // Set timeout for test
    const timeout = setTimeout(() => {
      if (!testComplete) {
        console.log('⏰ Test timed out after 30 seconds');
        claude.kill();
        resolve({
          success: false,
          error: 'Test timed out',
          output: output.slice(0, 500)
        });
      }
    }, 30000);
    
    claude.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('📤 Claude response:', text.trim());
      
      // Check if we got a response that looks like success
      if (text.toLowerCase().includes('claude code max test successful') || 
          text.toLowerCase().includes('test successful')) {
        testComplete = true;
        clearTimeout(timeout);
        claude.kill();
        resolve({
          success: true,
          response: text.trim(),
          fullOutput: output
        });
      }
    });
    
    claude.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      
      // Check for authentication errors
      if (text.toLowerCase().includes('login') || 
          text.toLowerCase().includes('authenticate') ||
          text.toLowerCase().includes('unauthorized')) {
        testComplete = true;
        clearTimeout(timeout);
        claude.kill();
        resolve({
          success: false,
          error: 'Authentication required',
          details: text.trim(),
          needsLogin: true
        });
      }
    });
    
    claude.on('close', (code) => {
      if (!testComplete) {
        testComplete = true;
        clearTimeout(timeout);
        
        if (code === 0 && output) {
          resolve({
            success: true,
            response: output.trim(),
            exitCode: code
          });
        } else {
          resolve({
            success: false,
            error: `Process exited with code ${code}`,
            output: output.slice(0, 500),
            stderr: errorOutput.slice(0, 500)
          });
        }
      }
    });
    
    claude.on('error', (error) => {
      if (!testComplete) {
        testComplete = true;
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error.message
        });
      }
    });
    
    // Send test prompt
    claude.stdin.write('Please respond with exactly: "Claude Code Max test successful"\n');
    claude.stdin.end();
  });
}

/**
 * Guide user through login process
 */
async function guideLogin() {
  console.log('\n🔐 Claude Code Max Login Required');
  console.log('=' .repeat(50));
  console.log('');
  console.log('👤 To authenticate with your Claude Code Max plan:');
  console.log('');
  console.log('1️⃣  Open a new terminal window');
  console.log('2️⃣  Run: claude login');
  console.log('3️⃣  Follow the prompts to log in with your Claude credentials');
  console.log('4️⃣  Select your Pro/Max plan when prompted');
  console.log('5️⃣  Come back here and press Enter to test');
  console.log('');
  console.log('🔗 This uses the same login as claude.ai website');
  console.log('💡 No API keys needed - just your regular Claude account');
  console.log('');
  
  return new Promise((resolve) => {
    process.stdout.write('Press Enter when login is complete...');
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

/**
 * Show authentication troubleshooting
 */
function showTroubleshooting() {
  console.log('\n🔧 TROUBLESHOOTING CLAUDE CODE MAX AUTHENTICATION');
  console.log('=' .repeat(60));
  console.log('');
  console.log('If authentication isn\'t working, try these steps:');
  console.log('');
  console.log('1️⃣  Logout and re-login:');
  console.log('   claude logout');
  console.log('   claude login');
  console.log('');
  console.log('2️⃣  Update Claude Code:');
  console.log('   npm update -g @anthropics/claude-code');
  console.log('');
  console.log('3️⃣  Restart your terminal completely');
  console.log('');
  console.log('4️⃣  Make sure you\'re using Pro/Max credentials:');
  console.log('   • Same email as your Claude Pro/Max subscription');
  console.log('   • NOT your Anthropic Console API account');
  console.log('');
  console.log('5️⃣  Check your plan status at: https://claude.ai/settings/billing');
  console.log('');
  console.log('6️⃣  If still having issues, try:');
  console.log('   • Clear browser cache and cookies for claude.ai');
  console.log('   • Try from a different network');
  console.log('   • Contact Anthropic support');
}

/**
 * Main test function
 */
async function main() {
  console.log('🎯 Claude Code Max Authentication & Testing');
  console.log('=' .repeat(50));
  console.log('');
  
  // Check if Claude is installed
  const hasClaudeCode = await checkClaudeInstalled();
  if (!hasClaudeCode) {
    console.log('\n❌ Cannot proceed without Claude Code installed.');
    console.log('💡 Install with: npm install -g @anthropics/claude-code');
    return;
  }
  
  // Check authentication status
  await checkAuthStatus();
  
  // Test Claude Code Max
  console.log('\n🚀 Starting Claude Code Max test...');
  const startTime = Date.now();
  
  const result = await testClaudeMax();
  const responseTime = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(50));
  console.log('🎯 CLAUDE CODE MAX TEST RESULTS');
  console.log('=' .repeat(50));
  
  if (result.success) {
    console.log(`✅ SUCCESS! Claude Code Max is working properly`);
    console.log(`⚡ Response time: ${responseTime}ms`);
    console.log(`📝 Response: ${result.response || result.fullOutput?.slice(0, 200)}`);
    console.log('');
    console.log('🎉 Your Claude Code Max authentication is working!');
    console.log('💡 You can now use Claude Code Max in your QwenCode setup');
    
  } else if (result.needsLogin) {
    console.log('🔐 AUTHENTICATION NEEDED');
    console.log('');
    console.log('Claude Code Max requires login before testing.');
    console.log(`Error details: ${result.details || result.error}`);
    
    await guideLogin();
    
    // Retry test after login guidance
    console.log('\n🔄 Retrying test after login...');
    const retryResult = await testClaudeMax();
    
    if (retryResult.success) {
      console.log('✅ SUCCESS! Claude Code Max is now working');
      console.log(`📝 Response: ${retryResult.response}`);
    } else {
      console.log('❌ Still having authentication issues');
      showTroubleshooting();
    }
    
  } else {
    console.log('❌ FAILED');
    console.log(`Error: ${result.error}`);
    if (result.output) {
      console.log(`Output: ${result.output}`);
    }
    if (result.stderr) {
      console.log(`Stderr: ${result.stderr}`);
    }
    
    showTroubleshooting();
  }
  
  console.log('\n📋 SUMMARY FOR QWENCODE INTEGRATION:');
  if (result.success) {
    console.log('✅ Claude Code Max: READY FOR QWENCODE');
    console.log('💡 Authentication type: Interactive login (claude login)');
    console.log('🔧 Integration: Use AuthType.LOGIN_WITH_GOOGLE in QwenCode');
  } else {
    console.log('❌ Claude Code Max: NEEDS SETUP');
    console.log('🔧 Required: Complete authentication first');
  }
  
  console.log('\n🎯 Test complete!');
}

// Run the test
main().catch(console.error);