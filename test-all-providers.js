#!/usr/bin/env node
/**
 * 🧪 Multi-Provider API Key Testing Script
 * 
 * This script tests all your AI provider API keys, collects structured response data,
 * and provides comprehensive analytics. Perfect for validating your multi-provider setup!
 * 
 * Usage:
 * 1. Add your API keys to the PROVIDER_CONFIGS below
 * 2. Run: node test-all-providers.js
 * 3. Review results and retry failed tests individually
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

// 🔑 ADD YOUR API KEYS HERE
const PROVIDER_CONFIGS = {
  openrouter: {
    name: 'OpenRouter Universal Gateway',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: 'sk-or-YOUR_OPENROUTER_KEY_HERE', // ⬅️ ADD YOUR KEY
    headers: {
      'Authorization': 'Bearer {API_KEY}',
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/your-project',
      'X-Title': 'QwenCode Multi-Provider Test'
    },
    testModel: 'qwen/qwen-2.5-coder-32b-instruct', // Free model for testing
    enabled: true
  },
  
  openai: {
    name: 'OpenAI API Direct',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: 'sk-YOUR_OPENAI_KEY_HERE', // ⬅️ ADD YOUR KEY
    headers: {
      'Authorization': 'Bearer {API_KEY}',
      'Content-Type': 'application/json'
    },
    testModel: 'gpt-3.5-turbo', // Cheaper model for testing
    enabled: true
  },
  
  gemini: {
    name: 'Google Gemini API',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent',
    apiKey: 'YOUR_GEMINI_KEY_HERE', // ⬅️ ADD YOUR KEY (no sk- prefix)
    headers: {
      'Content-Type': 'application/json'
    },
    testModel: 'gemini-1.5-flash', // Free tier model
    enabled: true,
    customFormat: 'gemini' // Special handling for Gemini API format
  },
  
  qwen_direct: {
    name: 'Qwen API Direct',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    apiKey: 'sk-YOUR_QWEN_KEY_HERE', // ⬅️ ADD YOUR KEY
    headers: {
      'Authorization': 'Bearer {API_KEY}',
      'Content-Type': 'application/json'
    },
    testModel: 'qwen-turbo',
    enabled: true,
    customFormat: 'qwen' // Special handling for Qwen API format
  },
  
  anthropic: {
    name: 'Anthropic Claude API',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    apiKey: 'sk-ant-YOUR_CLAUDE_KEY_HERE', // ⬅️ ADD YOUR KEY
    headers: {
      'Authorization': 'Bearer {API_KEY}',
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    testModel: 'claude-3-haiku-20240307', // Fastest/cheapest Claude model
    enabled: true,
    customFormat: 'anthropic' // Special handling for Anthropic API format
  },
  
  ollama: {
    name: 'Ollama Local',
    baseUrl: 'http://localhost:11434/api/chat',
    apiKey: '', // No key needed for local
    headers: {
      'Content-Type': 'application/json'
    },
    testModel: 'llama3.2:latest',
    enabled: true,
    customFormat: 'ollama' // Special handling for Ollama API format
  },
  
  lmstudio: {
    name: 'LM Studio Local',
    baseUrl: 'http://localhost:1234/v1/chat/completions',
    apiKey: 'lm-studio', // Usually not required but some setups need it
    headers: {
      'Authorization': 'Bearer {API_KEY}',
      'Content-Type': 'application/json'
    },
    testModel: 'local-model', // Generic local model name
    enabled: true
  }
};

// 🧪 Test configuration
const TEST_CONFIG = {
  testPrompt: 'Hello! Please respond with exactly: "QwenCode multi-provider test successful" and nothing else.',
  expectedResponse: 'QwenCode multi-provider test successful',
  timeoutMs: 30000, // 30 seconds
  retryAttempts: 2,
  outputDir: './test-results',
  timestampFormat: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
};

// 📊 Results tracking
const testResults = {
  timestamp: new Date().toISOString(),
  summary: {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0
  },
  providers: {},
  metadata: {
    script_version: '1.0.0',
    node_version: process.version,
    platform: process.platform
  }
};

/**
 * 🎯 Format request for different providers
 */
function formatRequest(provider, config) {
  const basePayload = {
    messages: [
      {
        role: 'user',
        content: TEST_CONFIG.testPrompt
      }
    ],
    max_tokens: 50,
    temperature: 0.1
  };

  switch (config.customFormat) {
    case 'gemini':
      return {
        contents: [
          {
            parts: [
              {
                text: TEST_CONFIG.testPrompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.1
        }
      };
      
    case 'anthropic':
      return {
        model: config.testModel,
        max_tokens: 50,
        messages: basePayload.messages
      };
      
    case 'qwen':
      return {
        model: config.testModel,
        input: {
          messages: basePayload.messages
        },
        parameters: {
          max_tokens: 50,
          temperature: 0.1
        }
      };
      
    case 'ollama':
      return {
        model: config.testModel,
        messages: basePayload.messages,
        stream: false,
        options: {
          num_predict: 50,
          temperature: 0.1
        }
      };
      
    default:
      // OpenAI format (most providers)
      return {
        model: config.testModel,
        ...basePayload
      };
  }
}

/**
 * 🔍 Extract response text from different provider formats
 */
function extractResponseText(provider, responseData, config) {
  try {
    switch (config.customFormat) {
      case 'gemini':
        return responseData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response text found';
        
      case 'anthropic':
        return responseData.content?.[0]?.text || 'No response text found';
        
      case 'qwen':
        return responseData.output?.text || 'No response text found';
        
      case 'ollama':
        return responseData.message?.content || 'No response text found';
        
      default:
        // OpenAI format
        return responseData.choices?.[0]?.message?.content || 'No response text found';
    }
  } catch (error) {
    return `Error extracting response: ${error.message}`;
  }
}

/**
 * 📡 Test a single provider
 */
async function testProvider(providerKey, config) {
  const startTime = Date.now();
  console.log(`\n🧪 Testing ${config.name}...`);
  
  const result = {
    provider: providerKey,
    name: config.name,
    model: config.testModel,
    status: 'unknown',
    success: false,
    response_time_ms: 0,
    response_text: null,
    raw_response: null,
    error: null,
    metadata: {
      timestamp: new Date().toISOString(),
      api_endpoint: config.baseUrl,
      test_prompt: TEST_CONFIG.testPrompt,
      expected_response: TEST_CONFIG.expectedResponse
    }
  };

  try {
    // Skip if not enabled
    if (!config.enabled) {
      result.status = 'skipped';
      result.error = 'Provider disabled in configuration';
      console.log(`   ⏭️  Skipped (disabled)`);
      return result;
    }

    // Skip if no API key (except for local providers)
    if (!config.apiKey && !['ollama', 'lmstudio'].includes(providerKey)) {
      result.status = 'skipped';
      result.error = 'No API key provided';
      console.log(`   ⏭️  Skipped (no API key)`);
      return result;
    }

    // Format request
    const requestPayload = formatRequest(providerKey, config);
    
    // Prepare headers
    const headers = { ...config.headers };
    if (config.apiKey && headers.Authorization) {
      headers.Authorization = headers.Authorization.replace('{API_KEY}', config.apiKey);
    }

    // Prepare URL
    let url = config.baseUrl;
    if (config.customFormat === 'gemini') {
      url = url.replace('{MODEL}', config.testModel) + `?key=${config.apiKey}`;
      delete headers.Authorization; // Gemini uses query param for auth
    }

    console.log(`   📡 Sending request to ${url.replace(/key=[^&]*/, 'key=***')}...`);

    // Make request
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload),
      timeout: TEST_CONFIG.timeoutMs
    });

    const responseTime = Date.now() - startTime;
    result.response_time_ms = responseTime;

    if (!response.ok) {
      const errorText = await response.text();
      result.status = 'failed';
      result.error = `HTTP ${response.status}: ${errorText}`;
      result.raw_response = { status: response.status, error: errorText };
      console.log(`   ❌ Failed (${response.status}): ${errorText.slice(0, 100)}...`);
      return result;
    }

    const responseData = await response.json();
    result.raw_response = responseData;
    
    // Extract response text
    const responseText = extractResponseText(providerKey, responseData, config);
    result.response_text = responseText;

    // Check if response contains expected text
    const isValidResponse = responseText.toLowerCase().includes(TEST_CONFIG.expectedResponse.toLowerCase());
    
    if (isValidResponse) {
      result.status = 'success';
      result.success = true;
      console.log(`   ✅ Success (${responseTime}ms): ${responseText.slice(0, 50)}...`);
    } else {
      result.status = 'unexpected_response';
      result.error = `Response did not contain expected text: "${TEST_CONFIG.expectedResponse}"`;
      console.log(`   ⚠️  Unexpected response (${responseTime}ms): ${responseText.slice(0, 50)}...`);
    }

  } catch (error) {
    result.response_time_ms = Date.now() - startTime;
    result.status = 'error';
    result.error = error.message;
    console.log(`   💥 Error: ${error.message}`);
  }

  return result;
}

/**
 * 🔄 Retry failed tests
 */
async function retryFailedTests(failedProviders) {
  if (failedProviders.length === 0) return;
  
  console.log(`\n🔄 Retrying ${failedProviders.length} failed providers...`);
  
  for (const providerKey of failedProviders) {
    const config = PROVIDER_CONFIGS[providerKey];
    console.log(`\n🔄 Retry: ${config.name}`);
    
    const result = await testProvider(providerKey, config);
    testResults.providers[providerKey] = result;
    
    if (result.success) {
      testResults.summary.successful++;
      testResults.summary.failed--;
    }
  }
}

/**
 * 📊 Generate test report
 */
async function generateReport() {
  // Create output directory
  await fs.mkdir(TEST_CONFIG.outputDir, { recursive: true });
  
  // Calculate summary
  for (const [providerKey, result] of Object.entries(testResults.providers)) {
    testResults.summary.total++;
    
    if (result.status === 'success') {
      testResults.summary.successful++;
    } else if (result.status === 'skipped') {
      testResults.summary.skipped++;
    } else {
      testResults.summary.failed++;
    }
  }
  
  // Save detailed results
  const detailedResultsFile = path.join(TEST_CONFIG.outputDir, `test-results-${TEST_CONFIG.timestampFormat}.json`);
  await fs.writeFile(detailedResultsFile, JSON.stringify(testResults, null, 2));
  
  // Generate summary report
  const summaryFile = path.join(TEST_CONFIG.outputDir, `test-summary-${TEST_CONFIG.timestampFormat}.md`);
  const summaryReport = generateSummaryReport();
  await fs.writeFile(summaryFile, summaryReport);
  
  return { detailedResultsFile, summaryFile };
}

/**
 * 📝 Generate markdown summary report
 */
function generateSummaryReport() {
  const { summary, providers } = testResults;
  const successRate = summary.total > 0 ? ((summary.successful / summary.total) * 100).toFixed(1) : 0;
  
  let report = `# 🧪 Multi-Provider API Test Results\n\n`;
  report += `**Test Date**: ${new Date(testResults.timestamp).toLocaleString()}\n`;
  report += `**Success Rate**: ${successRate}% (${summary.successful}/${summary.total})\n\n`;
  
  report += `## 📊 Summary\n\n`;
  report += `- ✅ **Successful**: ${summary.successful}\n`;
  report += `- ❌ **Failed**: ${summary.failed}\n`;
  report += `- ⏭️ **Skipped**: ${summary.skipped}\n`;
  report += `- 📊 **Total**: ${summary.total}\n\n`;
  
  // Successful providers
  const successful = Object.entries(providers).filter(([_, result]) => result.success);
  if (successful.length > 0) {
    report += `## ✅ Successful Providers\n\n`;
    for (const [providerKey, result] of successful) {
      report += `### ${result.name}\n`;
      report += `- **Model**: ${result.model}\n`;
      report += `- **Response Time**: ${result.response_time_ms}ms\n`;
      report += `- **Response**: "${result.response_text.slice(0, 100)}${result.response_text.length > 100 ? '...' : ''}"\n\n`;
    }
  }
  
  // Failed providers
  const failed = Object.entries(providers).filter(([_, result]) => !result.success && result.status !== 'skipped');
  if (failed.length > 0) {
    report += `## ❌ Failed Providers\n\n`;
    for (const [providerKey, result] of failed) {
      report += `### ${result.name}\n`;
      report += `- **Status**: ${result.status}\n`;
      report += `- **Error**: ${result.error}\n`;
      report += `- **Response Time**: ${result.response_time_ms}ms\n\n`;
    }
  }
  
  // Skipped providers
  const skipped = Object.entries(providers).filter(([_, result]) => result.status === 'skipped');
  if (skipped.length > 0) {
    report += `## ⏭️ Skipped Providers\n\n`;
    for (const [providerKey, result] of skipped) {
      report += `### ${result.name}\n`;
      report += `- **Reason**: ${result.error}\n\n`;
    }
  }
  
  report += `## 🔧 Next Steps\n\n`;
  if (failed.length > 0) {
    report += `### Failed Providers\n`;
    for (const [providerKey, result] of failed) {
      report += `- **${result.name}**: Check API key and endpoint configuration\n`;
    }
    report += `\n### Retry Individual Tests\n`;
    report += `Run with specific provider: \`node test-all-providers.js --provider=${failed.map(([key]) => key).join(',')}\`\n\n`;
  }
  
  if (skipped.length > 0) {
    report += `### Skipped Providers\n`;
    for (const [providerKey, result] of skipped) {
      report += `- **${result.name}**: ${result.error === 'Provider disabled in configuration' ? 'Enable in PROVIDER_CONFIGS' : 'Add API key to PROVIDER_CONFIGS'}\n`;
    }
  }
  
  return report;
}

/**
 * 🚀 Main execution
 */
async function main() {
  console.log(`🚀 QwenCode Multi-Provider API Key Testing Script`);
  console.log(`📅 Started: ${new Date().toLocaleString()}`);
  console.log(`🔧 Node.js: ${process.version}`);
  console.log(`🖥️  Platform: ${process.platform}\n`);
  
  // Parse command line arguments for specific providers
  const args = process.argv.slice(2);
  const providerFilter = args.find(arg => arg.startsWith('--provider='))?.split('=')[1]?.split(',');
  
  const providersToTest = providerFilter || Object.keys(PROVIDER_CONFIGS);
  console.log(`🎯 Testing ${providersToTest.length} providers: ${providersToTest.join(', ')}\n`);
  
  // Test each provider
  for (const providerKey of providersToTest) {
    if (!PROVIDER_CONFIGS[providerKey]) {
      console.log(`⚠️  Unknown provider: ${providerKey}`);
      continue;
    }
    
    const config = PROVIDER_CONFIGS[providerKey];
    const result = await testProvider(providerKey, config);
    testResults.providers[providerKey] = result;
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Retry failed tests if any
  const failedProviders = Object.entries(testResults.providers)
    .filter(([_, result]) => result.status === 'error' || result.status === 'failed')
    .map(([providerKey, _]) => providerKey);
  
  if (failedProviders.length > 0) {
    await retryFailedTests(failedProviders);
  }
  
  // Generate reports
  console.log(`\n📊 Generating reports...`);
  const { detailedResultsFile, summaryFile } = await generateReport();
  
  // Final summary
  const { summary } = testResults;
  const successRate = summary.total > 0 ? ((summary.successful / summary.total) * 100).toFixed(1) : 0;
  
  console.log(`\n🎯 TEST RESULTS SUMMARY:`);
  console.log(`   ✅ Successful: ${summary.successful}/${summary.total} (${successRate}%)`);
  console.log(`   ❌ Failed: ${summary.failed}`);
  console.log(`   ⏭️  Skipped: ${summary.skipped}`);
  console.log(`\n📄 Reports saved:`);
  console.log(`   📊 Detailed: ${detailedResultsFile}`);
  console.log(`   📝 Summary: ${summaryFile}`);
  
  if (summary.failed > 0) {
    const failedNames = Object.entries(testResults.providers)
      .filter(([_, result]) => !result.success && result.status !== 'skipped')
      .map(([_, result]) => result.name);
    
    console.log(`\n🔄 To retry failed providers:`);
    console.log(`   node test-all-providers.js --provider=${Object.keys(testResults.providers).filter(key => !testResults.providers[key].success && testResults.providers[key].status !== 'skipped').join(',')}`);
  }
  
  console.log(`\n🎉 Testing complete!`);
  process.exit(summary.failed > 0 ? 1 : 0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}