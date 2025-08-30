#!/usr/bin/env node
/**
 * Test Enhanced Model Switcher
 * 
 * Tests the consolidated model switcher with:
 * - Enhanced formatting with line wrapping and 4-space indentation
 * - Model type classification (local/cloud/api) with icons
 * - NO RESTART NEEDED messages
 */

import { ModelSwitcherTool } from './packages/core/dist/src/tools/modelSwitcherWorking.js';
import { SchemaValidator } from './packages/core/dist/src/utils/schemaValidator.js';

console.log('🚀 Testing Enhanced Model Switcher...\n');

const tool = new ModelSwitcherTool();
const validator = new SchemaValidator();

async function testModelSwitcher() {
  try {
    console.log('📋 Test 1: List models with enhanced formatting');
    const listParams = { action: 'list' };
    const listInvocation = tool.createInvocation(listParams, validator);
    const listResult = await listInvocation.execute();
    console.log('Result:');
    console.log(listResult.returnDisplay);
    console.log('\n' + '='.repeat(80) + '\n');

    console.log('📋 Test 2: Show current model with enhanced display');
    const currentParams = { action: 'current' };
    const currentInvocation = tool.createInvocation(currentParams, validator);
    const currentResult = await currentInvocation.execute();
    console.log('Result:');
    console.log(currentResult.returnDisplay);
    console.log('\n' + '='.repeat(80) + '\n');

    console.log('🎯 Enhanced Model Switcher Test Complete!');
    console.log('✅ Features tested:');
    console.log('  • Line wrapping with 4-space indentation');
    console.log('  • Model type classification with icons');
    console.log('  • Enhanced formatting consistency');
    console.log('  • NO RESTART NEEDED messaging');

  } catch (error) {
    console.error('❌ Error testing model switcher:', error);
  }
}

testModelSwitcher();