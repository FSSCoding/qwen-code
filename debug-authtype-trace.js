#!/usr/bin/env node

/**
 * AuthType Resolution Debug Trace
 * 
 * This script traces the complete flow of authType resolution when switching to Claude
 */

import { spawn } from 'child_process';

async function debugAuthTypeFlow() {
  console.log('🔍 DEBUGGING AUTHTYPE RESOLUTION FLOW');
  console.log('=' .repeat(80));

  const child = spawn('node', ['packages/cli/dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  let output = '';
  let errors = '';

  child.stdout.on('data', (data) => {
    output += data.toString();
  });

  child.stderr.on('data', (data) => {
    errors += data.toString();
  });

  // Send the model switch command
  child.stdin.write('model_manager switch claude\n');
  child.stdin.end();

  // Wait for completion
  await new Promise((resolve) => {
    child.on('close', resolve);
    setTimeout(() => {
      child.kill();
      resolve();
    }, 15000);
  });

  console.log('\n📊 COMPLETE OUTPUT ANALYSIS:');
  console.log('=' .repeat(80));
  
  // Extract all debug lines related to authType
  const authTypeLines = (output + errors).split('\n').filter(line => 
    line.includes('authType') || 
    line.includes('AuthType') || 
    line.includes('ModelManager') ||
    line.includes('ProviderAuth') ||
    line.includes('createContentGenerator')
  );

  authTypeLines.forEach((line, index) => {
    console.log(`${(index + 1).toString().padStart(3)}: ${line}`);
  });

  console.log('\n🎯 KEY FINDINGS:');
  console.log('=' .repeat(80));
  
  // Look for specific patterns
  const providerResolved = authTypeLines.filter(line => line.includes('Final resolved authType'));
  const configInput = authTypeLines.filter(line => line.includes('Input authType (provider-resolved)'));
  const effectiveSelected = authTypeLines.filter(line => line.includes('Effective authType selected'));
  
  console.log('\n🔄 Provider Resolution:', providerResolved);
  console.log('📥 Config Input:', configInput);  
  console.log('✅ Effective Selection:', effectiveSelected);

  // Identify the discrepancy
  if (providerResolved.length > 0 && configInput.length > 0) {
    const providerAuth = providerResolved[0].split(':').pop()?.trim();
    const inputAuth = configInput[0].match(/Input authType \(provider-resolved\): (\w+-?\w*)/)?.[1];
    
    console.log('\n🚨 DISCREPANCY ANALYSIS:');
    console.log(`   Provider System Resolves: ${providerAuth}`);
    console.log(`   Config Function Receives: ${inputAuth}`);
    
    if (providerAuth !== inputAuth) {
      console.log('   ❌ MISMATCH DETECTED! This is the root cause.');
      console.log('   🔍 The issue is between provider resolution and config creation.');
    } else {
      console.log('   ✅ No mismatch - issue may be elsewhere.');
    }
  }
}

debugAuthTypeFlow().catch(console.error);