#!/usr/bin/env node

import { Flake8Tool } from './packages/core/dist/src/tools/flake8Tool.js';
import { BlackTool } from './packages/core/dist/src/tools/blackTool.js';

async function testTools() {
  console.log('🧪 Testing Python development tools...\n');
  
  // Test Flake8 Tool
  console.log('🔍 Testing Flake8 linting tool:');
  const flake8Tool = new Flake8Tool();
  const flake8Invocation = flake8Tool.createInvocation({
    target: 'test_python_sample.py',
    max_line_length: 88,
    auto_fix_suggestions: true
  });
  
  try {
    const flake8Result = await flake8Invocation.execute(new AbortController().signal);
    console.log('✅ Flake8 tool executed successfully');
    console.log(flake8Result.returnDisplay);
  } catch (error) {
    console.error('❌ Flake8 tool failed:', error.message);
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Test Black Tool (preview mode)
  console.log('🖤 Testing Black formatting tool (preview):');
  const blackTool = new BlackTool();
  const blackInvocation = blackTool.createInvocation({
    target: 'test_python_sample.py',
    preview: true,
    line_length: 88
  });
  
  try {
    const blackResult = await blackInvocation.execute(new AbortController().signal);
    console.log('✅ Black tool executed successfully');
    console.log(blackResult.returnDisplay);
  } catch (error) {
    console.error('❌ Black tool failed:', error.message);
  }
  
  console.log('\n🎉 Tool testing complete!');
}

testTools().catch(console.error);