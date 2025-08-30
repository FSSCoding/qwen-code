# Claude Code Max API Routing - Diagnostic Plan

## Current Status & Objective

### ✅ Authentication Infrastructure: COMPLETE
- Model profile loading: Working
- AuthType resolution: Working (`anthropic-oauth`)
- AnthropicContentGenerator creation: Working
- Claude CLI credential loading: Working
- Token validation: Working

### 🎯 Target Issue: API Routing
**Problem**: Despite successful authentication, responses still come from local Qwen model
**Evidence**: Response shows "I'm Qwen Code, an interactive CLI agent..." instead of Claude

**Goal**: Get actual Claude Code Max responses: "I'm Claude, created by Anthropic..."

## Phase 1: Current State Analysis

### 1.1 Trace the API Call Path
**Purpose**: Understand exactly how API calls flow from user input to response

**Research Tasks**:
```bash
# A. Find where user messages get processed
grep -r "sendMessageStream\|generateContent" packages/core/src/ --include="*.ts" | head -10

# B. Trace AnthropicContentGenerator usage
grep -r "AnthropicContentGenerator\|executeWithCredentialManagement" packages/core/src/ --include="*.ts"

# C. Find the actual API request code
grep -r "fetch\|axios\|request" packages/core/src/anthropic/ --include="*.ts"
```

**Expected Findings**:
- Entry point for user messages
- How AnthropicContentGenerator methods are called
- Where HTTP requests are made to Anthropic API

### 1.2 Analyze Response Source
**Purpose**: Determine if responses are coming from Claude API or local fallback

**Diagnostic Commands**:
```bash
# Test with network monitoring
echo "Hello, what is your name and who created you?" | timeout 10s strace -e trace=network -o /tmp/network.log node bundle/gemini.js 2>&1

# Check for Anthropic API calls
grep "anthropic.com" /tmp/network.log

# Monitor HTTP traffic (if available)
echo "test" | timeout 10s node bundle/gemini.js 2>&1 | grep -E "(HTTP|fetch|request|response)"
```

**Expected Outcomes**:
- Network calls to `api.anthropic.com` (if working)
- Local connections only (if falling back)
- Error patterns in network requests

### 1.3 Debug AnthropicContentGenerator Execution
**Purpose**: Verify if AnthropicContentGenerator methods are being called

**Code Instrumentation Needed**:
```typescript
// In AnthropicContentGenerator.generateContent()
console.log('🔍 AnthropicContentGenerator.generateContent called with:', request);

// In executeWithCredentialManagement()
console.log('🔍 executeWithCredentialManagement called, baseURL:', this.client.baseURL);

// In getValidToken()
console.log('🔍 getValidToken called, token exists:', !!tokenResult.token);
```

## Phase 2: API Compatibility Analysis

### 2.1 OpenAI vs Anthropic API Comparison
**Purpose**: Understand if AnthropicContentGenerator (extends OpenAIContentGenerator) can work with Anthropic API

**Research Areas**:

**A. Request Format Differences**:
```javascript
// OpenAI Format
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}

// Anthropic Format (typical)
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [{"role": "user", "content": "Hello"}]
}
```

**B. Endpoint Differences**:
```
OpenAI:     POST https://api.openai.com/v1/chat/completions
Anthropic:  POST https://api.anthropic.com/v1/messages
```

**C. Authentication Differences**:
```
OpenAI:     Authorization: Bearer sk-...
Anthropic:  x-api-key: sk-ant-...
           anthropic-version: 2023-06-01
```

### 2.2 Claude Code Max Specific Research
**Purpose**: Determine if Claude Code Max uses different endpoints than standard Anthropic API

**Investigation Steps**:
```bash
# A. Check official Claude CLI behavior
claude --help | grep -i api
claude config show 2>/dev/null || echo "No config command"

# B. Research Claude Code Max documentation
# (Manual research needed)

# C. Check existing credentials for hints
cat ~/.claude/.credentials.json | jq -r 'keys[]'
```

**Key Questions**:
- Does Claude Code Max use standard Anthropic API endpoints?
- Are there special headers or authentication methods?
- What's the correct model identifier format?

## Phase 3: OpenAIContentGenerator Investigation

### 3.1 Analyze Base Class Implementation
**Purpose**: Understand how AnthropicContentGenerator inherits OpenAI behavior

**Files to Examine**:
```bash
# Core OpenAI implementation
cat packages/core/src/core/openaiContentGenerator.ts | head -50

# Check HTTP client setup
grep -A 20 -B 5 "baseURL\|fetch\|axios" packages/core/src/core/openaiContentGenerator.ts
```

**Focus Areas**:
- How HTTP client is configured
- Request/response processing
- Error handling and fallbacks

### 3.2 Identify Fallback Mechanisms
**Purpose**: Find why system falls back to local model

**Potential Fallback Triggers**:
- Network errors (timeout, connection refused)
- Authentication errors (401, 403)
- API format errors (400, invalid request)
- Missing or misconfigured endpoints

**Debug Strategy**:
```typescript
// Add to AnthropicContentGenerator
override async generateContent(request, userPromptId) {
  console.log('🚀 AnthropicContentGenerator.generateContent starting');
  console.log('🔗 Client baseURL:', this.client.baseURL);
  console.log('🔑 Has API key:', !!this.client.apiKey);
  
  try {
    const result = await this.executeWithCredentialManagement(() =>
      super.generateContent(request, userPromptId)
    );
    console.log('✅ AnthropicContentGenerator success');
    return result;
  } catch (error) {
    console.error('❌ AnthropicContentGenerator error:', error);
    throw error;
  }
}
```

## Phase 4: API Request Debugging Framework

### 4.1 Request/Response Logging
**Purpose**: Capture actual HTTP requests and responses

**Implementation Plan**:
```typescript
// Create API debug interceptor
class APIDebugInterceptor {
  static wrapClient(client: any, name: string) {
    const originalFetch = client.fetch || global.fetch;
    client.fetch = async (url: string, options: any) => {
      console.log(`📡 [${name}] Request:`, {
        url,
        method: options?.method,
        headers: options?.headers,
        bodySize: options?.body?.length || 0
      });
      
      try {
        const response = await originalFetch(url, options);
        console.log(`📨 [${name}] Response:`, {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
        });
        return response;
      } catch (error) {
        console.error(`💥 [${name}] Request failed:`, error);
        throw error;
      }
    };
  }
}
```

### 4.2 End-to-End Flow Tracing
**Purpose**: Track message flow from input to output

**Trace Points**:
1. User message input
2. ContentGenerator selection
3. API request preparation
4. HTTP request execution
5. Response processing
6. Final output generation

**Implementation**:
```typescript
// Global debug flag
const CLAUDE_DEBUG = process.env.CLAUDE_DEBUG === 'true';

// Trace function
function traceClaudeAPI(step: string, data?: any) {
  if (CLAUDE_DEBUG) {
    console.log(`🔍 [CLAUDE-TRACE] ${step}:`, data);
  }
}
```

## Phase 5: Controlled Testing Strategy

### 5.1 Isolated API Tests
**Purpose**: Test Anthropic API calls outside of QwenCode system

**Test Scripts**:
```typescript
// test-anthropic-direct.ts
import { AnthropicContentGenerator } from './packages/core/src/anthropic/anthropicContentGenerator.ts';

async function testAnthropicDirect() {
  // Load Claude credentials
  const credentials = JSON.parse(fs.readFileSync('~/.claude/.credentials.json'));
  
  // Create minimal test
  const testRequest = {
    contents: [{ parts: [{ text: "Hello, what is your name?" }] }],
  };
  
  // Test with AnthropicContentGenerator
  console.log('Testing AnthropicContentGenerator...');
  // Implementation needed
}
```

### 5.2 Comparative Testing
**Purpose**: Compare behavior between working local model and Claude

**Test Cases**:
```bash
# A. Local model (working baseline)
echo "Hello, what model are you?" | FORCE_LOCAL=true node bundle/gemini.js

# B. Claude model (testing)
echo "Hello, what model are you?" | FORCE_CLAUDE=true node bundle/gemini.js

# C. Network debugging
echo "Hello" | CLAUDE_DEBUG=true node bundle/gemini.js 2>&1 | tee /tmp/claude-debug.log
```

## Phase 6: Hypothesis Testing

### 6.1 Primary Hypotheses
**Hypothesis 1**: AnthropicContentGenerator is not being called
- **Test**: Add debug logging to all AnthropicContentGenerator methods
- **Expected**: No debug output if hypothesis is correct

**Hypothesis 2**: API requests are failing silently
- **Test**: Add error logging and network monitoring
- **Expected**: Failed requests with specific error patterns

**Hypothesis 3**: OpenAI/Anthropic API incompatibility
- **Test**: Compare request formats and endpoints
- **Expected**: Format mismatches causing 400/404 errors

**Hypothesis 4**: Fallback mechanism is too aggressive
- **Test**: Trace error handling and fallback logic
- **Expected**: Fallback triggers before Claude API is attempted

### 6.2 Hypothesis Validation Framework
```typescript
interface TestHypothesis {
  name: string;
  test: () => Promise<TestResult>;
  expectedOutcome: string;
}

const hypotheses: TestHypothesis[] = [
  {
    name: "AnthropicContentGenerator not called",
    test: async () => testAnthropicGeneratorCalls(),
    expectedOutcome: "Debug logs from AnthropicContentGenerator methods"
  },
  // Additional hypotheses...
];
```

## Implementation Timeline

### Week 1: Analysis Phase
- [ ] Trace API call paths (Phase 1.1)
- [ ] Analyze response sources (Phase 1.2)
- [ ] Add AnthropicContentGenerator debugging (Phase 1.3)

### Week 2: Research Phase
- [ ] OpenAI vs Anthropic API comparison (Phase 2.1)
- [ ] Claude Code Max specific research (Phase 2.2)
- [ ] OpenAIContentGenerator analysis (Phase 3.1)

### Week 3: Implementation Phase
- [ ] Create debugging framework (Phase 4)
- [ ] Implement controlled tests (Phase 5)
- [ ] Execute hypothesis testing (Phase 6)

### Week 4: Resolution Phase
- [ ] Fix identified issues
- [ ] Verify end-to-end Claude responses
- [ ] Create final documentation

## Success Metrics

### Immediate Goals:
- [ ] Confirm AnthropicContentGenerator methods are called
- [ ] Capture actual HTTP requests to Anthropic API
- [ ] Identify specific failure points in API chain

### Final Success:
- [ ] Claude responses: "I'm Claude, created by Anthropic..."
- [ ] No fallback to local model
- [ ] Consistent Claude API routing

## Risk Mitigation

### Potential Blockers:
1. **Claude Code Max API differences**: May need special endpoints or auth
2. **OpenAI compatibility layer**: May need significant modifications
3. **Network/proxy issues**: May need connection debugging

### Contingency Plans:
1. **Direct Anthropic API implementation**: Bypass OpenAI compatibility if needed
2. **Official Claude CLI integration**: Use CLI as proxy if API is incompatible
3. **Hybrid approach**: Claude for some requests, local for others

---

**Next Action**: Execute Phase 1.1 - Trace the API call path to understand current request flow.