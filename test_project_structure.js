#!/usr/bin/env node

import { ProjectStructureTool } from './packages/core/dist/src/tools/projectStructureTool.js';

async function testProjectStructureTool() {
  console.log('🧪 Testing Project Structure Tool...\n');
  
  const structureTool = new ProjectStructureTool();
  
  // Test different analysis types
  const analysisTypes = ['overview', 'tree', 'architecture', 'metrics'];
  
  for (const analysisType of analysisTypes) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 Testing ${analysisType.toUpperCase()} analysis:`);
    console.log('='.repeat(80));
    
    const invocation = structureTool.createInvocation({
      target: '.',
      analysis_type: analysisType,
      max_depth: 3,
      exclude_patterns: ['node_modules', '.git', 'dist', '__pycache__', '*.log']
    });
    
    try {
      const result = await invocation.execute(new AbortController().signal);
      console.log('✅ Analysis completed successfully\n');
      console.log(result.returnDisplay);
    } catch (error) {
      console.error(`❌ ${analysisType} analysis failed:`, error.message);
    }
  }
  
  console.log('\n🎉 Project Structure Tool testing complete!');
}

testProjectStructureTool().catch(console.error);