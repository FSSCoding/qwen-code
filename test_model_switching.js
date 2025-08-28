#!/usr/bin/env node

// Quick test of the model switching functionality
import { ModelSwitcherTool } from './packages/core/dist/src/tools/modelSwitcherTool.js';

async function testModelSwitching() {
  const tool = new ModelSwitcherTool();
  
  console.log('🚀 Testing Model Switching Tool...\n');
  
  // Test adding a model
  console.log('1. Adding test model...');
  try {
    const addResult = await tool.executeImpl({
      action: 'add',
      nickname: '4bdev', 
      model: 'qwen/qwen3-4b-2507',
      displayName: 'Local 4B Development',
      baseUrl: 'http://localhost:11434',
      description: '120+ t/s, 190k context',
      performance: {
        tokensPerSecond: 120,
        contextWindow: 190,
        notes: 'fast development'
      }
    });
    console.log('✅ Add result:', addResult.content || addResult);
  } catch (error) {
    console.log('❌ Add failed:', error.message);
  }

  // Test listing models
  console.log('\n2. Listing models...');
  try {
    const listResult = await tool.executeImpl({ action: 'list' });
    console.log('📋 Models:', listResult.content || listResult);
  } catch (error) {
    console.log('❌ List failed:', error.message);
  }

  // Test switching to model
  console.log('\n3. Switching to model...');
  try {
    const switchResult = await tool.executeImpl({ 
      action: 'switch', 
      nickname: '4bdev' 
    });
    console.log('🔄 Switch result:', switchResult.content || switchResult);
  } catch (error) {
    console.log('❌ Switch failed:', error.message);
  }

  // Test current model
  console.log('\n4. Checking current model...');
  try {
    const currentResult = await tool.executeImpl({ action: 'current' });
    console.log('📍 Current:', currentResult.content || currentResult);
  } catch (error) {
    console.log('❌ Current failed:', error.message);
  }
}

testModelSwitching().catch(console.error);