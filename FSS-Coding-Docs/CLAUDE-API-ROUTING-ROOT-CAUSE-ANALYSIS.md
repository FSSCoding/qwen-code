# Claude API Routing - Root Cause Analysis & Solution Plan

## Executive Summary

**PROBLEM IDENTIFIED**: AnthropicContentGenerator successfully authenticates but fails to make API calls because it inherits OpenAI's request/response handling while trying to communicate with Anthropic's incompatible API.

**ROOT CAUSE**: OpenAI and Anthropic APIs are fundamentally incompatible at the protocol level - different endpoints, request formats, response structures, and authentication methods.

**STATUS**: ✅ **DIAGNOSIS COMPLETE** - Ready for implementation

---

## Complete API Call Flow Analysis

### ✅ Working Authentication Flow
1. **CLI Startup**: Loads Claude profile → sets `OPENAI_MODEL=claude-sonnet-4-20250514`
2. **Config Loading**: AuthType resolves to `anthropic-oauth`
3. **ContentGenerator Creation**: `createContentGenerator()` creates `AnthropicContentGenerator`  
4. **Credential Loading**: Claude CLI tokens loaded from `~/.claude/.credentials.json`
5. **Token Validation**: Tokens validated and not expired

### ✅ Working Message Routing Flow  
1. **User Input**: `client.sendMessageStream()` called
2. **Chat Creation**: Creates `GeminiChat` with `this.getContentGenerator()` (returns `AnthropicContentGenerator`)
3. **Message Processing**: `turn.run()` → `geminiChat.sendMessageStream()`
4. **API Call**: `this.contentGenerator.generateContentStream()` → `AnthropicContentGenerator.generateContentStream()`

### ❌ BROKEN API Execution Flow
1. **AnthropicContentGenerator.generateContentStream()**: Calls `executeWithCredentialManagement()`
2. **Token Setup**: ✅ Sets valid token: `this.client.apiKey = token`
3. **Endpoint Setup**: ✅ Sets URL: `this.client.baseURL = 'https://api.anthropic.com/v1'`
4. **API Call**: ❌ Calls `super.generateContentStream()` → `OpenAIContentGenerator.generateContentStream()`
5. **Request Execution**: ❌ `this.client.chat.completions.create()` with OpenAI format to Anthropic endpoint
6. **API Failure**: ❌ 404/400 errors → fallback to local model

---

## Technical Root Cause: API Incompatibility

### The Fundamental Problem
AnthropicContentGenerator **extends OpenAIContentGenerator** and inherits all OpenAI request/response logic, then tries to redirect to Anthropic endpoints. This is like trying to speak English with French grammar rules.

### Specific Incompatibilities

#### 1. Endpoint Incompatibility
- **OpenAI SDK tries**: `POST https://api.anthropic.com/v1/chat/completions`
- **Anthropic expects**: `POST https://api.anthropic.com/v1/messages`
- **Result**: 404 Not Found

#### 2. Authentication Incompatibility
- **OpenAI SDK sends**:
  ```javascript
  headers: {
    "Authorization": "Bearer sk-ant-...",
    "Content-Type": "application/json"
  }
  ```
- **Anthropic expects**:
  ```javascript
  headers: {
    "x-api-key": "sk-ant-...",
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  }
  ```
- **Result**: 401 Unauthorized

#### 3. Request Format Incompatibility
- **OpenAI format**:
  ```javascript
  {
    "model": "claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true,
    "temperature": 0.7
  }
  ```
- **Anthropic format**:
  ```javascript
  {
    "model": "claude-sonnet-4-20250514", 
    "max_tokens": 1024,  // REQUIRED field
    "messages": [{"role": "user", "content": "Hello"}],
    "temperature": 0.7
    // No "stream" parameter - handled differently
  }
  ```
- **Result**: 400 Bad Request (missing max_tokens)

#### 4. System Message Incompatibility
- **OpenAI format**:
  ```javascript
  {
    "messages": [
      {"role": "system", "content": "You are a helpful assistant"},
      {"role": "user", "content": "Hello"}
    ]
  }
  ```
- **Anthropic format**:
  ```javascript
  {
    "system": "You are a helpful assistant",  // Top-level field
    "messages": [
      {"role": "user", "content": "Hello"}  // No system role in messages
    ]
  }
  ```
- **Result**: 400 Bad Request (invalid role)

#### 5. Response Format Incompatibility
- **OpenAI Response**:
  ```javascript
  {
    "choices": [{
      "message": {"role": "assistant", "content": "Response text"},
      "finish_reason": "stop"
    }],
    "usage": {"prompt_tokens": 10, "completion_tokens": 20}
  }
  ```
- **Anthropic Response**:
  ```javascript
  {
    "content": [{"text": "Response text", "type": "text"}],
    "role": "assistant", 
    "stop_reason": "end_turn",
    "usage": {"input_tokens": 10, "output_tokens": 20}
  }
  ```
- **Result**: Response parsing errors → fallback to local model

---

## Solution Architecture

### Option 1: Native Anthropic Implementation (RECOMMENDED)
**Replace inheritance with composition pattern**

#### Advantages:
- ✅ Full Anthropic API compatibility
- ✅ Proper request/response handling
- ✅ Native authentication support
- ✅ Better error handling
- ✅ Future-proof for API changes

#### Implementation:
1. Create standalone `AnthropicContentGenerator` that implements `ContentGenerator` interface directly
2. Use Anthropic's official SDK or implement native HTTP client
3. Handle Gemini ↔ Anthropic format conversion
4. Implement proper streaming support

### Option 2: OpenAI Compatibility Layer (NOT RECOMMENDED)
**Create translation layer between OpenAI and Anthropic formats**

#### Disadvantages:
- ❌ Complex format translation logic
- ❌ Potential data loss in conversions
- ❌ Maintenance burden
- ❌ Performance overhead
- ❌ Brittle to API changes

---

## Implementation Plan: Native Anthropic Implementation

### Phase 1: Core API Client (Week 1)
```typescript
// New implementation structure
export class AnthropicContentGenerator implements ContentGenerator {
  private anthropicClient: AnthropicHttpClient;
  private tokenManager: IAnthropicOAuth2Client;

  // Direct API implementation
  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // Convert Gemini format → Anthropic format
    const anthropicRequest = this.convertGeminiToAnthropic(request);
    
    // Make native Anthropic API call
    const response = await this.anthropicClient.post('/messages', {
      ...anthropicRequest,
      stream: true
    });
    
    // Convert Anthropic response → Gemini format
    return this.streamAnthropicToGemini(response);
  }
}
```

### Phase 2: Format Conversion (Week 1)
1. **Request Conversion**: Gemini `GenerateContentParameters` → Anthropic Messages format
2. **Response Conversion**: Anthropic Messages response → Gemini `GenerateContentResponse`
3. **System Message Handling**: Extract system messages to top-level `system` field
4. **Tool Support**: Convert function calls/responses between formats

### Phase 3: Authentication Integration (Week 1)
1. **HTTP Client**: Implement Anthropic-compatible HTTP client with proper headers
2. **Token Management**: Integrate existing `IAnthropicOAuth2Client`
3. **Error Handling**: Anthropic-specific error codes and messages

### Phase 4: Streaming Support (Week 1)  
1. **Server-Sent Events**: Handle Anthropic's streaming format
2. **Chunk Processing**: Parse and convert streaming chunks
3. **Error Recovery**: Handle stream interruptions

### Phase 5: Testing & Validation (Week 2)
1. **Unit Tests**: Comprehensive test coverage
2. **Integration Tests**: End-to-end API flow testing  
3. **Format Validation**: Request/response format correctness
4. **Performance Testing**: Streaming performance verification

---

## File Structure for Implementation

### New Files to Create:
```
packages/core/src/anthropic/
├── anthropicHttpClient.ts          # Native Anthropic HTTP client
├── anthropicFormatConverter.ts     # Gemini ↔ Anthropic format conversion
├── anthropicContentGenerator.ts    # New native implementation (replace existing)
├── anthropicStreamHandler.ts      # Server-sent events handling
└── __tests__/
    ├── anthropicContentGenerator.test.ts
    ├── anthropicFormatConverter.test.ts
    └── integration.test.ts
```

### Files to Modify:
- `packages/core/src/core/contentGenerator.ts` - Update factory method
- Update imports and references throughout codebase

---

## Risk Assessment & Mitigation

### High Risk Areas:
1. **Format Conversion Complexity**: Gemini and Anthropic have different data structures
   - *Mitigation*: Comprehensive test suite with real API examples
   
2. **Streaming Implementation**: Server-sent events vs WebSocket-like streaming  
   - *Mitigation*: Reference Anthropic's official SDK implementation
   
3. **Tool/Function Call Support**: Different function calling formats
   - *Mitigation*: Phase implementation - basic first, tools later
   
4. **System Message Handling**: Different approaches to system prompts
   - *Mitigation*: Test with various system prompt configurations

### Medium Risk Areas:
1. **Token Refresh Logic**: Ensure compatibility with existing OAuth flow
2. **Error Handling**: Map Anthropic errors to expected Gemini error format  
3. **Performance**: Ensure no regression in response times

---

## Success Metrics

### Immediate Goals (Week 1):
- [ ] Native Anthropic API calls succeed (200 responses)
- [ ] Basic text generation works end-to-end
- [ ] Authentication integration functional
- [ ] Format conversion accurate

### Integration Goals (Week 2):
- [ ] Streaming responses work correctly
- [ ] System messages handled properly  
- [ ] Error handling comprehensive
- [ ] Performance benchmarks met

### Final Success Criteria:
- [ ] User types message → receives Claude response (not Qwen)
- [ ] Response shows: "I'm Claude, created by Anthropic..."
- [ ] No fallback to local model
- [ ] Maintains existing QwenCode functionality
- [ ] Performance equivalent or better than current implementation

---

## Next Action Items

1. **Create native AnthropicHttpClient** with proper Anthropic headers and endpoint handling
2. **Implement format converters** for Gemini ↔ Anthropic data transformation
3. **Replace current AnthropicContentGenerator** with native implementation  
4. **Add comprehensive testing** for all conversion logic
5. **Verify end-to-end flow** produces Claude responses

---

**Status**: Ready for immediate implementation. Authentication infrastructure is solid, problem is clearly identified, solution is architected.

The path forward is clear: replace the inheritance-based approach with a native Anthropic implementation that speaks Anthropic's protocol directly.