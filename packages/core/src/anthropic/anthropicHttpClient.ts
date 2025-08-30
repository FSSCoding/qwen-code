/**
 * @license
 * Copyright 2025 FSS Coding
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native Anthropic HTTP Client
 * 
 * Implements direct communication with Anthropic's Messages API using native HTTP requests.
 * This replaces the OpenAI SDK dependency to avoid protocol incompatibility issues.
 */

export interface AnthropicApiOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  userAgent?: string;
  version?: string;
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
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  stop_sequences?: string[];
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{type: 'text', text: string}>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicStreamChunk {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop' | 'ping';
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
    input_tokens?: number;
    output_tokens?: number;
  };
  index?: number;
}

export class AnthropicApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string,
    public type?: string
  ) {
    super(`Anthropic API error ${status}: ${statusText}`);
    this.name = 'AnthropicApiError';
  }

  static async fromResponse(response: Response): Promise<AnthropicApiError> {
    const body = await response.text();
    let errorType: string | undefined;
    
    try {
      const errorData = JSON.parse(body);
      errorType = errorData.error?.type;
    } catch {
      // Body is not JSON, use as-is
    }
    
    return new AnthropicApiError(
      response.status,
      response.statusText,
      body,
      errorType
    );
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403 || 
           this.type === 'authentication_error' || 
           this.type === 'permission_error';
  }

  get isRateLimited(): boolean {
    return this.status === 429 || this.type === 'rate_limit_error';
  }
}

export class AnthropicHttpClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private userAgent: string;
  private version: string;

  constructor(options: AnthropicApiOptions) {
    this.baseUrl = options.baseUrl || 'https://api.anthropic.com/v1';
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 60000;
    this.userAgent = options.userAgent || 'QwenCode-Claude-Integration/1.0';
    this.version = options.version || '2023-06-01';
  }

  /**
   * Get headers for Anthropic API
   * 
   * Handles both API key authentication (x-api-key) and OAuth authentication (Authorization: Bearer)
   * Claude Code Max uses OAuth Bearer tokens, while standard API uses x-api-key
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'anthropic-version': this.version,
      'content-type': 'application/json',
      'user-agent': this.userAgent
    };

    // Check if this is an OAuth token (starts with 'eyJ' - JWT format) or API key (starts with 'sk-')
    if (this.apiKey.startsWith('eyJ') || this.apiKey.startsWith('Bearer ')) {
      // OAuth token for Claude Code Max - use Authorization header
      const token = this.apiKey.startsWith('Bearer ') ? this.apiKey.substring(7) : this.apiKey;
      headers['authorization'] = `Bearer ${token}`;
      console.log('🔑 Using OAuth Bearer token for Claude Code Max');
    } else {
      // Standard API key - use x-api-key header
      headers['x-api-key'] = this.apiKey;
      console.log('🔑 Using standard API key for Anthropic API');
    }

    return headers;
  }

  /**
   * Make a non-streaming message request to Anthropic API
   */
  async createMessage(request: AnthropicRequest): Promise<AnthropicResponse> {
    const url = `${this.baseUrl}/messages`;
    const body = JSON.stringify({
      ...request,
      stream: false
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw await AnthropicApiError.fromResponse(response);
      }

      const result = await response.json();
      return result as AnthropicResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof AnthropicApiError) {
        throw error;
      }
      
      if ((error as any).name === 'AbortError') {
        throw new AnthropicApiError(
          408,
          'Request Timeout',
          `Request timed out after ${this.timeout}ms`
        );
      }
      
      throw new AnthropicApiError(
        500,
        'Network Error',
        error instanceof Error ? error.message : 'Unknown network error'
      );
    }
  }

  /**
   * Make a streaming message request to Anthropic API
   */
  async createMessageStream(request: AnthropicRequest): Promise<AsyncGenerator<AnthropicStreamChunk>> {
    const url = `${this.baseUrl}/messages`;
    const body = JSON.stringify({
      ...request,
      stream: true
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw await AnthropicApiError.fromResponse(response);
      }

      if (!response.body) {
        throw new AnthropicApiError(
          500,
          'No Response Body',
          'Streaming response has no readable body'
        );
      }

      return this.parseServerSentEventStream(response.body);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof AnthropicApiError) {
        throw error;
      }
      
      if ((error as any).name === 'AbortError') {
        throw new AnthropicApiError(
          408,
          'Request Timeout',
          `Streaming request timed out after ${this.timeout}ms`
        );
      }
      
      throw new AnthropicApiError(
        500,
        'Network Error',
        error instanceof Error ? error.message : 'Unknown network error'
      );
    }
  }

  /**
   * Parse Anthropic's Server-Sent Events stream format
   */
  private async *parseServerSentEventStream(
    body: ReadableStream<Uint8Array>
  ): AsyncGenerator<AnthropicStreamChunk> {
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            // End of stream marker
            if (data === '[DONE]') {
              return;
            }
            
            // Skip empty data lines
            if (!data) {
              continue;
            }
            
            try {
              const parsed = JSON.parse(data) as AnthropicStreamChunk;
              yield parsed;
            } catch (parseError) {
              console.warn('Failed to parse Anthropic stream chunk:', {
                data,
                error: parseError
              });
              // Continue processing other chunks
            }
          }
          // Ignore other SSE fields like 'event:', 'id:', etc.
        }
      }
    } catch (error) {
      throw new AnthropicApiError(
        500,
        'Stream Parse Error',
        error instanceof Error ? error.message : 'Failed to parse stream'
      );
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Update API key (useful for token refresh)
   */
  updateApiKey(newApiKey: string): void {
    this.apiKey = newApiKey;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<AnthropicApiOptions> {
    return {
      apiKey: '***', // Masked for security
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      userAgent: this.userAgent,
      version: this.version
    };
  }
}