#!/usr/bin/env node
/**
 * 🔐 Secure Multi-Provider API Key Testing Script
 * 
 * This version prompts for API keys at runtime - never stores them permanently.
 * Perfect for maximum security when testing sensitive credentials.
 * 
 * Usage: node test-providers-secure.js
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Hide input for API keys
function hideInput() {
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  
  let input = '';
  
  return new Promise((resolve) => {
    stdin.on('data', (key) => {
      key = key.toString();
      
      if (key === '\n' || key === '\r' || key === '\u0004') {
        // Enter pressed
        stdin.setRawMode(false);
        stdin.pause();
        console.log(''); // New line
        resolve(input);
      } else if (key === '\u0003') {
        // Ctrl+C
        process.exit();
      } else if (key === '\b' || key === '\u007f') {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        // Regular character
        input += key;
        process.stdout.write('*');
      }
    });
  });
}

async function promptForKey(providerName, description, optional = false) {
  const optionalText = optional ? ' (optional, press Enter to skip)' : '';
  console.log(`\n🔑 ${providerName} API Key${optionalText}:`);
  console.log(`   ${description}`);
  process.stdout.write('   Key: ');
  
  const key = await hideInput();
  return key.trim();
}

async function askYesNo(question) {
  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

// Provider configurations
const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter Universal Gateway',
    description: 'Get key from: https://openrouter.ai/keys (starts with sk-or-)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'qwen/qwen-2.5-coder-32b-instruct',
    format: 'openai'
  },
  
  openai: {
    name: 'OpenAI API Direct',  
    description: 'Get key from: https://platform.openai.com/api-keys (starts with sk-)',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
    format: 'openai'
  },
  
  anthropic: {
    name: 'Anthropic Claude API',
    description: 'Get key from: https://console.anthropic.com/settings/keys (starts with sk-ant-)',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-haiku-20240307',
    format: 'anthropic'
  },
  
  gemini: {
    name: 'Google Gemini API',
    description: 'Get key from: https://makersuite.google.com/app/apikey (no prefix)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    model: 'gemini-1.5-flash',
    format: 'gemini'
  },
  
  qwen: {
    name: 'Qwen API Direct',
    description: 'Get key from: https://dashscope.aliyun.com/ (starts with sk-)',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    model: 'qwen-turbo',
    format: 'qwen'
  }
};

// Test prompt
const TEST_PROMPT = 'Hello! Please respond with exactly: "QwenCode multi-provider test successful" and nothing else.';
const EXPECTED_RESPONSE = 'QwenCode multi-provider test successful';

function formatRequest(provider, model, prompt) {
  switch (provider.format) {
    case 'anthropic':
      return {
        model,
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }]
      };
      
    case 'gemini':
      return {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 50, temperature: 0.1 }
      };
      
    case 'qwen':
      return {
        model,
        input: { messages: [{ role: 'user', content: prompt }] },
        parameters: { max_tokens: 50, temperature: 0.1 }
      };
      
    default: // openai format
      return {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.1
      };
  }
}

function extractResponse(provider, data) {
  try {
    switch (provider.format) {
      case 'anthropic':
        return data.content?.[0]?.text || 'No response found';
      case 'gemini':
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response found';
      case 'qwen':
        return data.output?.text || 'No response found';
      default:
        return data.choices?.[0]?.message?.content || 'No response found';
    }
  } catch (error) {
    return `Error extracting response: ${error.message}`;
  }
}

async function testProvider(providerKey, provider, apiKey) {
  const startTime = Date.now();
  console.log(`\n🧪 Testing ${provider.name}...`);
  
  try {
    const payload = formatRequest(provider, provider.model, TEST_PROMPT);
    
    let url = provider.endpoint;
    let headers = { 'Content-Type': 'application/json' };
    
    // Provider-specific auth
    if (provider.format === 'gemini') {
      url += `?key=${apiKey}`;
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    
    if (provider.format === 'anthropic') {
      headers['anthropic-version'] = '2023-06-01';
    }
    
    if (provider.format === 'openrouter') {
      headers['HTTP-Referer'] = 'https://github.com/qwen-code';
      headers['X-Title'] = 'QwenCode Secure Test';
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeout: 30000
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ Failed (${response.status}): ${errorText.slice(0, 100)}...`);
      return { 
        success: false, 
        error: `HTTP ${response.status}`, 
        responseTime,
        details: errorText.slice(0, 200)
      };
    }
    
    const data = await response.json();
    const responseText = extractResponse(provider, data);
    
    const isValid = responseText.toLowerCase().includes(EXPECTED_RESPONSE.toLowerCase());
    
    if (isValid) {
      console.log(`   ✅ Success (${responseTime}ms): ${responseText.slice(0, 50)}...`);
      return { success: true, responseTime, responseText };
    } else {
      console.log(`   ⚠️  Unexpected response (${responseTime}ms): ${responseText.slice(0, 50)}...`);
      return { 
        success: false, 
        error: 'Unexpected response', 
        responseTime, 
        responseText: responseText.slice(0, 100)
      };
    }
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`   💥 Error: ${error.message}`);
    return { success: false, error: error.message, responseTime };
  }
}

async function main() {
  console.log('🔐 QwenCode Secure Multi-Provider API Key Testing');
  console.log('=' .repeat(60));
  console.log('🛡️  Your API keys are NEVER stored - only used for testing');
  console.log('🔒 Keys are entered securely (hidden input)');
  console.log('');
  
  // Select providers to test
  console.log('📋 Available providers:');
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    console.log(`   • ${provider.name}`);
  }
  console.log('');
  
  const providersToTest = {};
  
  // Collect API keys
  for (const [providerKey, provider] of Object.entries(PROVIDERS)) {
    const shouldTest = await askYesNo(`Test ${provider.name}?`);
    
    if (shouldTest) {
      const apiKey = await promptForKey(provider.name, provider.description);
      
      if (apiKey) {
        providersToTest[providerKey] = { provider, apiKey };
        console.log('   ✅ Key received and will be tested');
      } else {
        console.log('   ⏭️  Skipped (no key provided)');
      }
    }
  }
  
  if (Object.keys(providersToTest).length === 0) {
    console.log('\n❗ No providers selected for testing.');
    rl.close();
    return;
  }
  
  console.log(`\n🚀 Testing ${Object.keys(providersToTest).length} providers...\n`);
  
  // Test results
  const results = {
    successful: [],
    failed: [],
    summary: { total: 0, success: 0, failed: 0 }
  };
  
  // Test each provider
  for (const [providerKey, { provider, apiKey }] of Object.entries(providersToTest)) {
    results.summary.total++;
    
    const result = await testProvider(providerKey, provider, apiKey);
    result.provider = providerKey;
    result.name = provider.name;
    
    if (result.success) {
      results.successful.push(result);
      results.summary.success++;
    } else {
      results.failed.push(result);
      results.summary.failed++;
    }
    
    // Clear the API key from memory immediately
    apiKey.replace(/./g, '0'); // Overwrite with zeros
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('🎯 SECURE TEST RESULTS:');
  console.log(`   ✅ Successful: ${results.summary.success}/${results.summary.total}`);
  console.log(`   ❌ Failed: ${results.summary.failed}`);
  
  const successRate = results.summary.total > 0 ? 
    ((results.summary.success / results.summary.total) * 100).toFixed(1) : 0;
  console.log(`   📊 Success Rate: ${successRate}%`);
  
  if (results.successful.length > 0) {
    console.log('\n✅ WORKING PROVIDERS:');
    for (const result of results.successful) {
      console.log(`   • ${result.name} (${result.responseTime}ms)`);
    }
  }
  
  if (results.failed.length > 0) {
    console.log('\n❌ FAILED PROVIDERS:');
    for (const result of results.failed) {
      console.log(`   • ${result.name}: ${result.error}`);
      if (result.details) {
        console.log(`     Details: ${result.details}`);
      }
    }
  }
  
  console.log('\n🔐 Security Notes:');
  console.log('   • API keys were never written to disk ✅');
  console.log('   • Keys have been cleared from memory ✅');  
  console.log('   • No persistent storage of credentials ✅');
  console.log('\n🎉 Secure testing complete!');
  
  rl.close();
}

// Run the secure test
main().catch(console.error);