# 🧪 Multi-Provider API Key Testing Guide

**Created**: August 28, 2025  
**Status**: ✅ **Ready for Testing**  
**Purpose**: Test all your AI provider API keys safely and systematically  

## 🎯 Overview

We've created comprehensive testing scripts to validate all your API keys across multiple providers. No more manual testing or getting bogged down in monotony - just add your keys and run the script!

## 🚀 Quick Start (5 Minutes)

### 1. Setup Configuration File
```bash
# Copy the template
cp test-config-template.json test-config.json

# Edit with your API keys
nano test-config.json  # or use your favorite editor
```

### 2. Add Your API Keys
Edit `test-config.json` and add your keys:
```json
{
  "providers": {
    "openrouter": {
      "enabled": true,
      "apiKey": "sk-or-your-actual-key-here"
    },
    "openai": {
      "enabled": true, 
      "apiKey": "sk-your-actual-openai-key"
    },
    "gemini": {
      "enabled": true,
      "apiKey": "your-actual-gemini-key"
    }
    // ... add all your keys
  }
}
```

### 3. Run the Test
```bash
npm run test:providers
```

**That's it!** The script will test all enabled providers and give you a comprehensive report.

## 📋 Available Testing Scripts

### Simple Testing (Recommended)
```bash
npm run test:providers           # Quick test with JSON config
```

### Advanced Testing  
```bash
npm run test:providers:advanced  # Full featured with metadata
npm run test:providers:retry     # Retry specific failed providers
```

## 🌐 Supported Providers

### 🔑 Providers You Mentioned Having Keys For:

#### **OpenRouter** (Universal Gateway) 
- **Key Format**: `sk-or-...`
- **What it gives you**: Access to 400+ models including Claude, GPT, Gemini
- **Test Model**: `qwen/qwen-2.5-coder-32b-instruct` (free)
- **Why test this first**: Single key gives you access to most models

#### **OpenAI API**
- **Key Format**: `sk-...` 
- **What it gives you**: Direct GPT access
- **Test Model**: `gpt-3.5-turbo` (cheapest)
- **Perfect for**: Direct OpenAI integration

#### **Google Gemini API**
- **Key Format**: No prefix, just the key
- **What it gives you**: Direct Google AI access
- **Test Model**: `gemini-1.5-flash` (free tier)
- **Great for**: Google ecosystem integration

#### **Claude Code Max**
- **Setup**: Uses your existing subscription
- **What it gives you**: Premium Claude access
- **Test Model**: `claude-3-haiku-20240307` (fastest)
- **Perfect for**: Production Claude usage

#### **Qwen Subscription** (You mentioned signing up)
- **Key Format**: `sk-...`
- **What it gives you**: Direct Qwen API access
- **Test Model**: `qwen-turbo`
- **Excellent for**: Coding tasks, multilingual support

### 🖥️ Local Models (No Keys Needed)

#### **Ollama**
- **Setup**: Install from https://ollama.ai/
- **Test Model**: `llama3.2:latest`
- **Perfect for**: Privacy, no API costs

#### **LM Studio**  
- **Setup**: Download from https://lmstudio.ai/
- **Test Model**: `local-model`
- **Great for**: GUI model management

## 📊 What The Script Tests

### Test Process for Each Provider:
1. **Authentication Check**: Validates API key format and access
2. **Model Request**: Sends standardized test prompt
3. **Response Validation**: Checks for expected response content
4. **Performance Measurement**: Records response time
5. **Error Handling**: Captures any failures with detailed info

### Test Prompt:
```
"Hello! Please respond with exactly: 'QwenCode multi-provider test successful' and nothing else."
```

### Success Criteria:
- ✅ **HTTP 200 response**
- ✅ **Contains expected text**: "QwenCode multi-provider test successful"  
- ✅ **Response time < 30 seconds**
- ✅ **Valid JSON response format**

## 📈 Understanding Results

### ✅ Success Output:
```
🧪 Testing OpenRouter Universal Gateway...
   📡 Sending request...
   ✅ Success (1247ms): QwenCode multi-provider test successful

✅ SUCCESSFUL PROVIDERS:
   • OpenRouter Universal Gateway (1247ms)
   • OpenAI API Direct (892ms)
```

### ❌ Failure Output:
```
🧪 Testing Gemini API...
   📡 Sending request...
   ❌ Failed (401): Invalid API key provided

❌ FAILED PROVIDERS:
   • Google Gemini API: HTTP 401: Invalid API key provided
```

### ⏭️ Skipped Output:
```
🧪 Testing Anthropic Claude API...
   ⏭️ Skipped (no API key)

⏭️ SKIPPED PROVIDERS:
   • Anthropic Claude API: No API key
```

## 🔧 Advanced Usage

### Test Specific Providers Only
```bash
# Test only OpenRouter and OpenAI
node test-providers-simple.js --providers openrouter,openai
```

### Custom Configuration
Edit `test-config.json`:
```json
{
  "test_settings": {
    "timeout_seconds": 60,        // Longer timeout
    "retry_attempts": 3,          // More retries
    "test_prompt": "Custom test prompt",
    "expected_response": "Custom expected response"
  }
}
```

### Retry Failed Tests
After initial run, if some providers failed:
```bash
npm run test:providers:retry openrouter,gemini
```

## 📁 Results and Analysis

### Automatic Report Generation
The script creates detailed reports in `./test-results/`:

#### **JSON Results** (Structured Data)
```json
{
  "timestamp": "2025-08-28T15:30:00.000Z",
  "successful": [
    {
      "provider": "openrouter",
      "name": "OpenRouter Universal Gateway", 
      "status": "success",
      "responseTime": 1247,
      "responseText": "QwenCode multi-provider test successful",
      "model": "qwen/qwen-2.5-coder-32b-instruct",
      "rawResponse": { /* Full API response */ }
    }
  ],
  "failed": [
    {
      "provider": "gemini",
      "error": "HTTP 401: Invalid API key provided",
      "responseTime": 456
    }
  ],
  "summary": {
    "total": 7,
    "success": 5, 
    "failed": 1,
    "skipped": 1,
    "successRate": "71.4%"
  }
}
```

#### **Markdown Summary** (Human Readable)
```markdown
# 🧪 Multi-Provider API Test Results

**Success Rate**: 71.4% (5/7)

## ✅ Successful Providers
- OpenRouter Universal Gateway (1247ms)
- OpenAI API Direct (892ms)
- Ollama Local (234ms)

## ❌ Failed Providers  
- Google Gemini API: Invalid API key

## 📋 Next Steps
- Check Gemini API key format
- Enable Claude Code Max in config
```

## 🔒 Security Features

### Built-in Security:
- ✅ **Never commits API keys** - `test-config.json` in `.gitignore`
- ✅ **Key masking in logs** - API keys shown as `***` in output
- ✅ **Session-based testing** - Keys only used during test
- ✅ **Local processing** - No keys sent to external analytics

### Best Practices:
1. **Keep `test-config.json` local only**
2. **Use separate test keys if available**
3. **Monitor API usage after testing**
4. **Rotate keys periodically**

## 🎯 Your Testing Workflow

### Phase 1: Initial Testing
1. **Add all your API keys** to `test-config.json`
2. **Run full test**: `npm run test:providers`
3. **Review results** and fix any key issues
4. **Document which providers work** for your setup

### Phase 2: Provider Selection
1. **Analyze successful providers** by performance and cost
2. **Choose primary provider** (probably OpenRouter for versatility)
3. **Select backup providers** for fallback chains
4. **Document preferred models** for different task types

### Phase 3: Integration
1. **Update QwenCode configuration** with successful providers
2. **Test model switching** with working providers
3. **Set up fallback chains** for reliability
4. **Monitor usage and costs**

## 💡 Pro Tips

### For Cost Optimization:
- **Start with free tiers**: Gemini Flash, OpenRouter free models
- **Use cheaper models for testing**: GPT-3.5-turbo vs GPT-4
- **Monitor usage dashboards** after testing

### For Reliability:
- **Test multiple providers** - don't rely on just one
- **Note response times** - faster providers for interactive use
- **Test local models** - zero cost backup option

### For Development:
- **Use structured JSON output** for automated analysis
- **Set up monitoring** for ongoing provider health
- **Create custom test prompts** for your specific use cases

## 🎉 Expected Results

With your mentioned API keys, you should see:

- ✅ **OpenRouter**: Success (gateway to everything)
- ✅ **OpenAI**: Success (direct GPT access)  
- ✅ **Gemini**: Success (Google AI)
- ✅ **Claude Code Max**: Success (premium Claude)
- ✅ **Local Models**: Success (if installed)
- ⏳ **Qwen**: Success (once you get subscription)

**Total Expected**: 5-6 successful providers = **Excellent multi-provider coverage!**

---

**You're about to have one of the most robust AI provider setups available - let's test those keys!** 🚀