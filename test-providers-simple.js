#!/usr/bin/env node
/**
 * 🧪 Simplified Multi-Provider API Key Testing Script
 * 
 * This is a streamlined version that uses the JSON config file approach.
 * Perfect for quick testing of your API keys!
 * 
 * Usage:
 * 1. Copy test-config-template.json to test-config.json
 * 2. Add your API keys and set enabled: true
 * 3. Run: npm run test:providers
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE = './test-config.json';
const TEMPLATE_FILE = './test-config-template.json';

/**
 * 📋 Load test configuration
 */
async function loadConfig() {
  try {
    // Check if config file exists
    try {
      await fs.access(CONFIG_FILE);
    } catch {
      console.log('❗ test-config.json not found!');
      console.log('📋 Please copy test-config-template.json to test-config.json and add your API keys.');
      console.log('💡 Command: cp test-config-template.json test-config.json');
      process.exit(1);
    }

    const configData = await fs.readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(configData);
    
    // Validate config structure
    if (!config.providers || !config.test_settings) {
      throw new Error('Invalid config file structure');
    }
    
    return config;
  } catch (error) {
    console.error('💥 Error loading config:', error.message);
    console.log('📋 Please check your test-config.json file format.');
    process.exit(1);
  }
}

/**
 * 🔧 Provider configurations with API formats
 */
const PROVIDER_ENDPOINTS = {
  openrouter: {
    name: 'OpenRouter Universal Gateway',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/qwen-code',
      'X-Title': 'QwenCode Multi-Provider Test'
    }),
    model: 'qwen/qwen-2.5-coder-32b-instruct',
    format: 'openai'
  },
  
  openai: {
    name: 'OpenAI API Direct',
    url: 'https://api.openai.com/v1/chat/completions',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }),
    model: 'gpt-3.5-turbo',
    format: 'openai'
  },
  
  gemini: {
    name: 'Google Gemini API',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    headers: () => ({ 'Content-Type': 'application/json' }),
    model: 'gemini-1.5-flash',
    format: 'gemini',
    urlWithKey: (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
  },
  
  anthropic: {
    name: 'Anthropic Claude API',
    url: 'https://api.anthropic.com/v1/messages',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    }),
    model: 'claude-3-haiku-20240307',
    format: 'anthropic'
  },
  
  qwen_direct: {
    name: 'Qwen API Direct',
    url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }),
    model: 'qwen-turbo',
    format: 'qwen'
  },
  
  ollama: {
    name: 'Ollama Local',
    url: 'http://localhost:11434/api/chat',
    headers: () => ({ 'Content-Type': 'application/json' }),
    model: 'llama3.2:latest',
    format: 'ollama'
  },
  
  lmstudio: {
    name: 'LM Studio Local',
    url: 'http://localhost:1234/v1/chat/completions',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }),
    model: 'local-model',
    format: 'openai'
  }
};

/**
 * 📝 Format request payload for different providers
 */
function createRequestPayload(format, model, prompt) {
  switch (format) {
    case 'gemini':
      return {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.1
        }
      };
      
    case 'anthropic':
      return {
        model,
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }]
      };
      
    case 'qwen':
      return {
        model,
        input: { messages: [{ role: 'user', content: prompt }] },
        parameters: { max_tokens: 50, temperature: 0.1 }
      };
      
    case 'ollama':
      return {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { num_predict: 50, temperature: 0.1 }
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

/**
 * 📤 Extract response text from different provider formats
 */
function extractResponse(format, data) {
  try {
    switch (format) {
      case 'gemini':
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response found';
      case 'anthropic':
        return data.content?.[0]?.text || 'No response found';
      case 'qwen':
        return data.output?.text || 'No response found';
      case 'ollama':
        return data.message?.content || 'No response found';
      default: // openai format
        return data.choices?.[0]?.message?.content || 'No response found';
    }
  } catch (error) {
    return `Error extracting response: ${error.message}`;
  }
}

/**
 * 🧪 Test a single provider
 */
async function testProvider(providerKey, providerConfig, endpoint, testPrompt, expectedResponse, timeout) {
  const startTime = Date.now();
  
  console.log(`\n🧪 Testing ${endpoint.name}...`);
  
  if (!providerConfig.enabled) {
    console.log(`   ⏭️  Skipped (disabled)`);
    return { status: 'skipped', reason: 'disabled' };
  }
  
  if (!providerConfig.apiKey && !['ollama', 'lmstudio'].includes(providerKey)) {
    console.log(`   ⏭️  Skipped (no API key)`);
    return { status: 'skipped', reason: 'no_api_key' };
  }
  
  try {
    const payload = createRequestPayload(endpoint.format, endpoint.model, testPrompt);
    const url = endpoint.urlWithKey ? endpoint.urlWithKey(providerConfig.apiKey) : endpoint.url;
    const headers = endpoint.headers(providerConfig.apiKey);
    
    console.log(`   📡 Sending request...`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeout: timeout * 1000
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ Failed (${response.status}): ${errorText.slice(0, 100)}...`);
      return {
        status: 'failed',
        error: `HTTP ${response.status}: ${errorText}`,
        responseTime
      };
    }
    
    const data = await response.json();
    const responseText = extractResponse(endpoint.format, data);
    
    const isValid = responseText.toLowerCase().includes(expectedResponse.toLowerCase());
    
    if (isValid) {
      console.log(`   ✅ Success (${responseTime}ms): ${responseText.slice(0, 50)}...`);
      return {
        status: 'success',
        responseTime,
        responseText,
        rawResponse: data
      };
    } else {
      console.log(`   ⚠️  Unexpected response (${responseTime}ms): ${responseText.slice(0, 50)}...`);
      return {
        status: 'unexpected',
        responseTime,
        responseText,
        error: 'Response did not contain expected text'
      };
    }
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`   💥 Error: ${error.message}`);
    return {
      status: 'error',
      error: error.message,
      responseTime
    };
  }
}

/**
 * 🚀 Main function
 */
async function main() {
  console.log('🚀 QwenCode Multi-Provider API Key Testing');
  console.log('=' .repeat(50));
  
  // Load configuration
  const config = await loadConfig();
  const { providers, test_settings } = config;
  
  console.log(`📅 Started: ${new Date().toLocaleString()}`);
  console.log(`🔧 Node.js: ${process.version}`);
  
  // Test results
  const results = {
    timestamp: new Date().toISOString(),
    successful: [],
    failed: [],
    skipped: [],
    summary: { total: 0, success: 0, failed: 0, skipped: 0 }
  };
  
  // Test each enabled provider
  for (const [providerKey, providerConfig] of Object.entries(providers)) {
    const endpoint = PROVIDER_ENDPOINTS[providerKey];
    
    if (!endpoint) {
      console.log(`\n⚠️  Unknown provider: ${providerKey}`);
      continue;
    }
    
    results.summary.total++;
    
    const result = await testProvider(
      providerKey,
      providerConfig,
      endpoint,
      test_settings.test_prompt,
      test_settings.expected_response,
      test_settings.timeout_seconds
    );
    
    result.provider = providerKey;
    result.name = endpoint.name;
    result.model = endpoint.model;
    
    if (result.status === 'success') {
      results.successful.push(result);
      results.summary.success++;
    } else if (result.status === 'skipped') {
      results.skipped.push(result);
      results.summary.skipped++;
    } else {
      results.failed.push(result);
      results.summary.failed++;
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('🎯 TEST RESULTS SUMMARY:');
  console.log(`   ✅ Successful: ${results.summary.success}/${results.summary.total}`);
  console.log(`   ❌ Failed: ${results.summary.failed}`);
  console.log(`   ⏭️  Skipped: ${results.summary.skipped}`);
  
  const successRate = results.summary.total > 0 ? 
    ((results.summary.success / results.summary.total) * 100).toFixed(1) : 0;
  console.log(`   📊 Success Rate: ${successRate}%`);
  
  // Show successful providers
  if (results.successful.length > 0) {
    console.log('\n✅ SUCCESSFUL PROVIDERS:');
    for (const result of results.successful) {
      console.log(`   • ${result.name} (${result.responseTime}ms)`);
    }
  }
  
  // Show failed providers
  if (results.failed.length > 0) {
    console.log('\n❌ FAILED PROVIDERS:');
    for (const result of results.failed) {
      console.log(`   • ${result.name}: ${result.error}`);
    }
  }
  
  // Show skipped providers
  if (results.skipped.length > 0) {
    console.log('\n⏭️  SKIPPED PROVIDERS:');
    for (const result of results.skipped) {
      console.log(`   • ${result.name}: ${result.reason === 'disabled' ? 'Disabled in config' : 'No API key'}`);
    }
  }
  
  // Save detailed results
  try {
    await fs.mkdir('./test-results', { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const resultsFile = `./test-results/test-results-${timestamp}.json`;
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n📄 Detailed results saved to: ${resultsFile}`);
  } catch (error) {
    console.log('\n⚠️  Could not save detailed results:', error.message);
  }
  
  console.log('\n🎉 Testing complete!');
  console.log('\n💡 Next steps:');
  console.log('   • Check failed providers and verify API keys');
  console.log('   • Enable more providers in test-config.json');
  console.log('   • Use successful providers in your QwenCode setup');
  
  process.exit(results.summary.failed > 0 ? 1 : 0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}