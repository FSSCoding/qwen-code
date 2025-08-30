#!/usr/bin/env node
/**
 * Debug Model Switching
 * Shows the log file location and can tail the logs in real-time
 */

import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';

const LOG_FILE = join(homedir(), '.qwen', 'debug-logs', 'model-switching.log');

console.log('🔍 Model Switching Debug Log Location:');
console.log(LOG_FILE);
console.log('');
console.log('📋 To monitor model switching in real-time, run:');
console.log(`   tail -f "${LOG_FILE}"`);
console.log('');
console.log('🧹 To clear the log:');
console.log(`   rm "${LOG_FILE}"`);
console.log('');

if (process.argv.includes('--tail') || process.argv.includes('-f')) {
  console.log('🔄 Starting real-time log monitoring...');
  console.log('Press Ctrl+C to stop');
  console.log('');
  
  const tail = spawn('tail', ['-f', LOG_FILE], {
    stdio: 'inherit'
  });
  
  process.on('SIGINT', () => {
    tail.kill();
    console.log('\n📋 Log monitoring stopped');
    process.exit(0);
  });
}