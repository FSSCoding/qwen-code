# Anthropic Native Implementation - Detailed Technical Plan

## Project Overview

**Goal**: Replace inheritance-based `AnthropicContentGenerator` with native Anthropic API implementation that speaks Anthropic's protocol directly.

**Status**: Ready for implementation - authentication infrastructure complete, root cause identified

---

## Current vs Proposed Architecture

### ❌ Current (Broken) Architecture:
```
AnthropicContentGenerator extends OpenAIContentGenerator
├── Inherits OpenAI request formatting
├── Inherits OpenAI response parsing  
├── Inherits OpenAI SDK client
└── Tries to redirect to Anthropic endpoints
    └── Result: Protocol mismatch → API failures → local model fallback
```

### ✅ Proposed (Native) Architecture:
```
AnthropicContentGenerator implements ContentGenerator
├── AnthropicHttpClient (native Anthropic protocol)
├── GeminiAnthropicConverter (format translation)  
├── AnthropicStreamHandler (server-sent events)
└── IAnthropicOAuth2Client (existing auth - reuse)
    └── Result: Native Anthropic API → Claude responses
```

---

## Implementation Phases

### Phase 1: Core HTTP Client Infrastructure

#### 1.1 AnthropicHttpClient Implementation
**File**: `packages/core/src/anthropic/anthropicHttpClient.ts`

```typescript
export interface AnthropicApiOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  userAgent?: string;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{type: 'text', text: string}>;
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  stream?: boolean;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{type: 'text', text: string}>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicHttpClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(options: AnthropicApiOptions) {
    this.baseUrl = options.baseUrl || 'https://api.anthropic.com/v1';
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 60000;
  }

  private getHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'user-agent': 'QwenCode-Claude-Integration/1.0'
    };
  }

  async createMessage(
    request: AnthropicRequest
  ): Promise<AnthropicResponse> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new AnthropicApiError(
        response.status,
        response.statusText,
        await response.text()
      );
    }

    return response.json();
  }

  async createMessageStream(
    request: AnthropicRequest
  ): Promise<ReadableStream<AnthropicStreamChunk>> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({...request, stream: true}),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new AnthropicApiError(
        response.status, 
        response.statusText,
        await response.text()
      );
    }

    return response.body!.pipeThrough(
      new AnthropicStreamTransformer()
    );
  }
}

export class AnthropicApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string
  ) {
    super(`Anthropic API error ${status}: ${statusText}`);
    this.name = 'AnthropicApiError';
  }
}
```

#### 1.2 Server-Sent Events Handler
**File**: `packages/core/src/anthropic/anthropicStreamHandler.ts`

```typescript
export interface AnthropicStreamChunk {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  message?: Partial<AnthropicResponse>;
  content_block?: {
    type: 'text';
    text: string;
  };
  delta?: {
    type: 'text_delta';
    text: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicStreamTransformer extends TransformStream {
  constructor() {
    super({
      transform(chunk, controller) {
        const decoder = new TextDecoder();
        const text = decoder.decode(chunk);
        
        // Parse server-sent events format
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              controller.terminate();
              return;
            }
            
            try {
              const parsed = JSON.parse(data) as AnthropicStreamChunk;
              controller.enqueue(parsed);
            } catch (error) {
              console.warn('Failed to parse Anthropic stream chunk:', error);
            }
          }
        }
      }
    });
  }
}
```

### Phase 2: Format Conversion Layer

#### 2.1 Gemini ↔ Anthropic Format Converter
**File**: `packages/core/src/anthropic/anthropicFormatConverter.ts`

```typescript
import {
  GenerateContentParameters,
  GenerateContentResponse,
  Content,
  Part,
  FinishReason
} from '@google/genai';

export class GeminiAnthropicConverter {
  
  /**
   * Convert Gemini GenerateContentParameters to Anthropic request format
   */
  static geminiToAnthropic(
    request: GenerateContentParameters
  ): AnthropicRequest {
    const messages: AnthropicMessage[] = [];
    let systemPrompt: string | undefined;

    // Process contents and extract system messages
    for (const content of request.contents || []) {
      if (content.role === 'system') {
        // Extract system content to top-level system field
        systemPrompt = this.extractTextFromParts(content.parts);
      } else if (content.role === 'user' || content.role === 'model') {
        messages.push({
          role: content.role === 'model' ? 'assistant' : 'user',
          content: this.extractTextFromParts(content.parts)
        });
      }
    }

    return {
      model: request.model,
      max_tokens: this.calculateMaxTokens(request),
      messages,
      system: systemPrompt,
      temperature: request.config?.temperature,
      stream: false // Handled separately for streaming
    };
  }

  /**
   * Convert Anthropic response to Gemini GenerateContentResponse
   */
  static anthropicToGemini(
    response: AnthropicResponse,
    streaming: boolean = false
  ): GenerateContentResponse {
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      candidates: [{
        content: {
          parts: [{ text }],
          role: 'model'
        },
        finishReason: this.mapFinishReason(response.stop_reason),
        index: 0,
        safetyRatings: [] // Anthropic doesn't provide safety ratings
      }],
      usageMetadata: {
        promptTokenCount: response.usage.input_tokens,
        candidatesTokenCount: response.usage.output_tokens,
        totalTokenCount: response.usage.input_tokens + response.usage.output_tokens
      }
    };
  }

  /**
   * Convert Anthropic stream chunks to Gemini streaming responses
   */
  static anthropicStreamToGemini(
    chunk: AnthropicStreamChunk
  ): GenerateContentResponse | null {
    switch (chunk.type) {
      case 'content_block_delta':
        if (chunk.delta?.type === 'text_delta') {
          return {
            candidates: [{
              content: {
                parts: [{ text: chunk.delta.text }],
                role: 'model'
              },
              finishReason: FinishReason.UNSPECIFIED,
              index: 0,
              safetyRatings: []
            }]
          };
        }
        break;
        
      case 'message_stop':
        return {
          candidates: [{
            content: {
              parts: [{ text: '' }],
              role: 'model'
            },
            finishReason: FinishReason.STOP,
            index: 0,
            safetyRatings: []
          }]
        };
    }
    
    return null; // Skip other chunk types
  }

  private static extractTextFromParts(parts: Part[]): string {
    return parts
      .filter(part => 'text' in part)
      .map(part => (part as { text: string }).text)
      .join('\n');
  }

  private static calculateMaxTokens(request: GenerateContentParameters): number {
    // Use explicit max_tokens from config, or default to 4000
    return request.config?.maxOutputTokens || 4000;
  }

  private static mapFinishReason(stopReason: string): FinishReason {
    switch (stopReason) {
      case 'end_turn':
        return FinishReason.STOP;
      case 'max_tokens':
        return FinishReason.MAX_TOKENS;
      case 'stop_sequence':
        return FinishReason.STOP;
      default:
        return FinishReason.OTHER;
    }
  }
}
```

### Phase 3: Native AnthropicContentGenerator

#### 3.1 Main Implementation
**File**: `packages/core/src/anthropic/anthropicContentGenerator.ts` (replace existing)

```typescript
import {
  ContentGenerator,
  ContentGeneratorConfig
} from '../core/contentGenerator.js';
import {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse
} from '@google/genai';
import { Config } from '../config/config.js';
import { IAnthropicOAuth2Client } from './anthropicOAuth2.js';
import { AnthropicHttpClient } from './anthropicHttpClient.js';
import { GeminiAnthropicConverter } from './anthropicFormatConverter.js';

export class AnthropicContentGenerator implements ContentGenerator {
  private httpClient: AnthropicHttpClient;
  private tokenManager: IAnthropicOAuth2Client;
  private config: Config;

  constructor(
    tokenManager: IAnthropicOAuth2Client,
    contentGeneratorConfig: ContentGeneratorConfig,
    config: Config
  ) {
    this.tokenManager = tokenManager;
    this.config = config;
    
    // Initialize with empty client - will be configured dynamically
    this.httpClient = new AnthropicHttpClient({
      apiKey: '', // Set dynamically
      baseUrl: 'https://api.anthropic.com/v1',
      timeout: config.getTimeout() || 60000
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string
  ): Promise<GenerateContentResponse> {
    return this.executeWithCredentialManagement(async () => {
      // Convert Gemini format to Anthropic format
      const anthropicRequest = GeminiAnthropicConverter.geminiToAnthropic(request);
      
      // Make native Anthropic API call
      const anthropicResponse = await this.httpClient.createMessage(anthropicRequest);
      
      // Convert Anthropic response back to Gemini format
      return GeminiAnthropicConverter.anthropicToGemini(anthropicResponse, false);
    });
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.executeWithCredentialManagement(async () => {
      // Convert Gemini format to Anthropic format  
      const anthropicRequest = GeminiAnthropicConverter.geminiToAnthropic(request);
      
      // Make native Anthropic streaming API call
      const streamResponse = await this.httpClient.createMessageStream(anthropicRequest);
      
      // Convert Anthropic stream to Gemini stream
      return this.convertAnthropicStream(streamResponse);
    });
  }

  private async *convertAnthropicStream(
    stream: ReadableStream<AnthropicStreamChunk>
  ): AsyncGenerator<GenerateContentResponse> {
    const reader = stream.getReader();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const geminiChunk = GeminiAnthropicConverter.anthropicStreamToGemini(value);
        if (geminiChunk) {
          yield geminiChunk;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async executeWithCredentialManagement<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    // Get fresh token
    const tokenResult = await this.tokenManager.getAccessToken();
    if (!tokenResult.token) {
      throw new Error('No access token available');
    }

    // Update HTTP client with fresh token
    this.httpClient = new AnthropicHttpClient({
      apiKey: tokenResult.token,
      baseUrl: 'https://api.anthropic.com/v1',
      timeout: this.config.getTimeout() || 60000
    });

    try {
      return await operation();
    } catch (error) {
      if (this.isAuthError(error)) {
        // Retry once with fresh token
        const freshTokenResult = await this.tokenManager.getAccessToken();
        if (!freshTokenResult.token) {
          throw new Error('Failed to refresh access token');
        }
        
        this.httpClient = new AnthropicHttpClient({
          apiKey: freshTokenResult.token,
          baseUrl: 'https://api.anthropic.com/v1',
          timeout: this.config.getTimeout() || 60000
        });
        
        return await operation();
      }
      throw error;
    }
  }

  private isAuthError(error: unknown): boolean {
    return error instanceof AnthropicApiError && 
           (error.status === 401 || error.status === 403);
  }

  // Stub implementations for unsupported operations
  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Anthropic doesn't provide token counting API
    // Estimate based on text length (rough approximation: 1 token ≈ 4 characters)
    const text = request.contents?.map(c => 
      c.parts?.map(p => 'text' in p ? p.text : '').join('')
    ).join('') || '';
    
    const estimatedTokens = Math.ceil(text.length / 4);
    return {
      totalTokens: estimatedTokens
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Embedding not supported by Anthropic API');
  }
}
```

### Phase 4: Integration and Testing

#### 4.1 Update ContentGenerator Factory
**File**: `packages/core/src/core/contentGenerator.ts` (modify existing)

```typescript
// In createContentGenerator function, update ANTHROPIC_OAUTH case:

case AuthType.ANTHROPIC_OAUTH:
  console.log('🎯 ContentGenerator: ANTHROPIC_OAUTH route detected - creating AnthropicContentGenerator');
  
  try {
    const anthropicCredentials = loadClaudeCredentials();
    if (!anthropicCredentials) {
      throw new Error('Claude Code Max authentication required. Please run: claude login');
    }

    console.log('✅ Using credentials from official Claude CLI');
    
    const anthropicClient = createAnthropicOAuth2Client(anthropicCredentials);
    
    // Import the new native implementation
    const { AnthropicContentGenerator } = await import('../anthropic/anthropicContentGenerator.js');
    const contentGenerator = new AnthropicContentGenerator(
      anthropicClient,
      contentGeneratorConfig,
      config
    );
    
    console.log('✅ ContentGenerator: Successfully created native AnthropicContentGenerator');
    return contentGenerator;
  } catch (error) {
    console.error('❌ ContentGenerator: Failed to create AnthropicContentGenerator:', error);
    throw error;
  }
```

#### 4.2 Comprehensive Test Suite
**File**: `packages/core/src/anthropic/__tests__/anthropicContentGenerator.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnthropicContentGenerator } from '../anthropicContentGenerator.js';
import { GeminiAnthropicConverter } from '../anthropicFormatConverter.js';

describe('AnthropicContentGenerator', () => {
  let generator: AnthropicContentGenerator;
  let mockTokenManager: any;
  let mockConfig: any;

  beforeEach(() => {
    mockTokenManager = {
      getAccessToken: vi.fn().mockResolvedValue({
        token: 'mock-access-token',
        expiresAt: Date.now() + 3600000
      })
    };
    
    mockConfig = {
      getTimeout: vi.fn().mockReturnValue(60000)
    };
    
    generator = new AnthropicContentGenerator(
      mockTokenManager,
      { model: 'claude-sonnet-4-20250514', authType: 'anthropic-oauth' },
      mockConfig
    );
  });

  describe('generateContent', () => {
    it('should convert Gemini request to Anthropic format', async () => {
      // Test format conversion
      const geminiRequest = {
        model: 'claude-sonnet-4-20250514',
        contents: [{
          role: 'user' as const,
          parts: [{ text: 'Hello world' }]
        }]
      };

      const anthropicRequest = GeminiAnthropicConverter.geminiToAnthropic(geminiRequest);
      
      expect(anthropicRequest).toEqual({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: 'Hello world'
        }],
        system: undefined,
        temperature: undefined,
        stream: false
      });
    });

    it('should handle system messages correctly', async () => {
      const geminiRequest = {
        model: 'claude-sonnet-4-20250514',
        contents: [
          {
            role: 'system' as const,
            parts: [{ text: 'You are a helpful assistant' }]
          },
          {
            role: 'user' as const, 
            parts: [{ text: 'Hello' }]
          }
        ]
      };

      const anthropicRequest = GeminiAnthropicConverter.geminiToAnthropic(geminiRequest);
      
      expect(anthropicRequest.system).toBe('You are a helpful assistant');
      expect(anthropicRequest.messages).toEqual([{
        role: 'user',
        content: 'Hello'
      }]);
    });
  });

  describe('authentication', () => {
    it('should use token from token manager', async () => {
      // Mock HTTP client
      const mockHttpClient = {
        createMessage: vi.fn().mockResolvedValue({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 2 }
        })
      };
      
      // Test token usage
      expect(mockTokenManager.getAccessToken).toHaveBeenCalled();
    });

    it('should retry on auth error', async () => {
      mockTokenManager.getAccessToken
        .mockResolvedValueOnce({ token: 'expired-token' })
        .mockResolvedValueOnce({ token: 'fresh-token' });
        
      // Test retry logic
    });
  });
});
```

---

## Migration Strategy

### Step 1: Parallel Implementation (Safe)
1. Create new native implementation alongside existing broken one
2. Add feature flag to switch between implementations
3. Test thoroughly with feature flag enabled

### Step 2: Gradual Rollout
1. Enable native implementation for testing users
2. Monitor error rates and response quality
3. Collect feedback and fix issues

### Step 3: Full Migration  
1. Remove old inheritance-based implementation
2. Clean up unused OpenAI compatibility code
3. Update documentation and examples

---

## Testing Strategy

### Unit Tests:
- [ ] Format conversion accuracy (Gemini ↔ Anthropic)
- [ ] HTTP client request/response handling
- [ ] Authentication token management
- [ ] Stream parsing and conversion
- [ ] Error handling and retry logic

### Integration Tests:
- [ ] End-to-end API calls with real Anthropic API
- [ ] Token refresh scenarios
- [ ] Network error handling
- [ ] Large request/response handling

### Performance Tests:
- [ ] Response time benchmarks vs current implementation
- [ ] Memory usage during streaming
- [ ] Concurrent request handling
- [ ] Token refresh performance impact

---

## Success Criteria

### Technical Success:
- [ ] Native Anthropic API calls return 200 OK
- [ ] Requests formatted correctly for Anthropic API
- [ ] Responses parsed correctly to Gemini format
- [ ] Streaming works without data loss
- [ ] Authentication and token refresh functional
- [ ] Error handling provides meaningful messages

### User Success:
- [ ] User types message → receives Claude response
- [ ] Response identifies as "I'm Claude, created by Anthropic"
- [ ] No fallback to local Qwen model
- [ ] Response quality matches official Claude
- [ ] Performance equivalent or better than current system

### Business Success:
- [ ] Claude Code Max subscription value realized
- [ ] QwenCode fork differentiated from upstream
- [ ] Foundation for additional Anthropic model support
- [ ] Maintainable codebase for future API changes

---

**Implementation Priority**: HIGH - This directly addresses the core user issue and unlocks Claude Code Max value.

**Estimated Timeline**: 2 weeks for full implementation and testing.

**Dependencies**: None - existing authentication infrastructure is sufficient.

**Next Action**: Begin Phase 1 implementation with AnthropicHttpClient.