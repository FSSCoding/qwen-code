/**
 * @license
 * Copyright 2025 FSS Coding
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native Anthropic Content Generator
 * 
 * This implementation replaces the previous inheritance-based approach with
 * a native Anthropic API client that speaks Anthropic's protocol directly.
 * 
 * Key differences from the old implementation:
 * - Uses native Anthropic HTTP client instead of OpenAI SDK
 * - Handles format conversion between Gemini and Anthropic formats  
 * - Implements proper Anthropic authentication headers
 * - Uses correct Anthropic endpoints and response parsing
 */

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
import { 
  AnthropicHttpClient, 
  AnthropicApiError
} from './anthropicHttpClient.js';
import { GeminiAnthropicConverter } from './anthropicFormatConverter.js';

export class AnthropicContentGenerator implements ContentGenerator {
  private httpClient: AnthropicHttpClient;
  private tokenManager: IAnthropicOAuth2Client;
  // Note: config parameter kept for future use
  private readonly baseUrl: string;

  constructor(
    tokenManager: IAnthropicOAuth2Client,
    contentGeneratorConfig: ContentGeneratorConfig,
    config: Config
  ) {
    this.tokenManager = tokenManager;
    this.baseUrl = 'https://api.anthropic.com/v1';
    
    // Initialize HTTP client with placeholder token
    // Real token will be set dynamically in executeWithCredentialManagement
    this.httpClient = new AnthropicHttpClient({
      apiKey: 'placeholder', // Will be replaced with real token
      baseUrl: this.baseUrl,
      timeout: 60000, // Default timeout
      userAgent: 'QwenCode-Claude-Integration/1.0'
    });

    console.log('🚀 Native AnthropicContentGenerator initialized');
  }

  /**
   * Generate content using native Anthropic API
   */
  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string
  ): Promise<GenerateContentResponse> {
    
    console.log('🔗 Target baseURL:', this.baseUrl);
    
    return this.executeWithCredentialManagement(async () => {
      // Convert Gemini format to Anthropic format
      const anthropicRequest = GeminiAnthropicConverter.geminiToAnthropic(request);
      
      // Validate the converted request
      GeminiAnthropicConverter.validateAnthropicRequest(anthropicRequest);
      
      console.log('📡 Making native Anthropic API call');
      console.log('📋 Anthropic request:', {
        model: anthropicRequest.model,
        max_tokens: anthropicRequest.max_tokens,
        message_count: anthropicRequest.messages.length,
        has_system: !!anthropicRequest.system
      });
      
      // Make native Anthropic API call
      const anthropicResponse = await this.httpClient.createMessage(anthropicRequest);
      
      console.log('✅ Native Anthropic API response received');
      console.log('📄 Response details:', {
        id: anthropicResponse.id,
        model: anthropicResponse.model,
        stop_reason: anthropicResponse.stop_reason,
        usage: anthropicResponse.usage
      });
      
      // Convert Anthropic response back to Gemini format
      const geminiResponse = GeminiAnthropicConverter.anthropicToGemini(anthropicResponse, false);
      
      return geminiResponse;
    });
  }

  /**
   * Generate streaming content using native Anthropic API
   */
  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    
    console.log('🔗 Target baseURL:', this.baseUrl);
    
    return this.executeWithCredentialManagement(async () => {
      // Convert Gemini format to Anthropic format
      const anthropicRequest = GeminiAnthropicConverter.geminiToAnthropic(request);
      
      // Validate the converted request
      GeminiAnthropicConverter.validateAnthropicRequest(anthropicRequest);
      
      console.log('📡 Making native Anthropic streaming API call');
      console.log('📋 Anthropic streaming request:', {
        model: anthropicRequest.model,
        max_tokens: anthropicRequest.max_tokens,
        message_count: anthropicRequest.messages.length,
        has_system: !!anthropicRequest.system
      });
      
      // Make native Anthropic streaming API call
      const anthropicStream = await this.httpClient.createMessageStream(anthropicRequest);
      
      console.log('✅ Native Anthropic streaming response started');
      
      // Convert Anthropic stream to Gemini stream
      return this.convertAnthropicStreamToGemini(anthropicStream);
    });
  }

  /**
   * Convert Anthropic stream to async generator of Gemini responses
   */
  private async *convertAnthropicStreamToGemini(
    anthropicStream: AsyncGenerator<any>
  ): AsyncGenerator<GenerateContentResponse> {
    try {
      for await (const chunk of anthropicStream) {
        const geminiChunk = GeminiAnthropicConverter.anthropicStreamToGemini(chunk);
        if (geminiChunk) {
          yield geminiChunk;
        }
      }
    } catch (error) {
      console.error('❌ Error in Anthropic stream conversion:', error);
      throw error;
    }
  }

  /**
   * Execute operation with automatic credential management and retry logic
   */
  private async executeWithCredentialManagement<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const attemptOperation = async (): Promise<T> => {
      // Get fresh token from token manager
      console.log('🔑 Getting fresh token from token manager');
      const tokenResult = await this.tokenManager.getAccessToken();
      
      if (!tokenResult.token) {
        throw new Error('No access token available from token manager');
      }
      
      console.log('✅ Got valid token, updating HTTP client');
      
      // Update HTTP client with fresh token
      this.httpClient.updateApiKey(tokenResult.token);
      
      try {
        console.log('🔄 Executing operation with token...');
        const result = await operation();
        console.log('✅ Operation completed successfully');
        return result;
      } catch (error) {
        console.error('❌ Operation failed:', error);
        if (error instanceof Error) {
          console.error('❌ Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n')
          });
        }
        throw error;
      }
    };

    try {
      return await attemptOperation();
    } catch (error) {
      // Retry once on authentication errors
      if (this.isAuthError(error)) {
        console.warn('🔄 Authentication error detected, retrying with fresh token');
        console.warn('🔄 Original error:', error);
        try {
          // Force token refresh and retry
          console.log('🔄 Attempting to get fresh token...');
          const refreshResult = await this.tokenManager.getAccessToken(); 
          console.log('🔄 Refresh result:', { hasToken: !!refreshResult.token });
          return await attemptOperation();
        } catch (retryError) {
          console.error('❌ Retry attempt failed:', retryError);
          throw new Error(
            'Failed to obtain valid Anthropic access token after retry. Please re-authenticate with: claude login'
          );
        }
      }
      throw error;
    }
  }

  /**
   * Check if error is authentication-related
   */
  private isAuthError(error: unknown): boolean {
    if (error instanceof AnthropicApiError) {
      return error.isAuthError;
    }
    
    // Fallback check for other error types
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return errorMessage.includes('unauthorized') || 
           errorMessage.includes('forbidden') ||
           errorMessage.includes('authentication') ||
           errorMessage.includes('invalid api key') ||
           errorMessage.includes('access token');
  }

  /**
   * Count tokens (approximation since Anthropic doesn't provide this API)
   */
  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Anthropic doesn't provide a token counting API
    // Provide rough approximation based on text length
    
    // Handle ContentListUnion which can be Content[] or string
    let text = '';
    if (typeof request.contents === 'string') {
      text = request.contents;
    } else if (Array.isArray(request.contents)) {
      text = request.contents.map((content: any) => 
        content.parts?.map((part: any) => 'text' in part ? part.text : '').join('')
      ).join('') || '';
    }
    
    // Rough approximation: 1 token ≈ 4 characters for English text
    // This is not accurate but gives a ballpark estimate
    const estimatedTokens = Math.ceil(text.length / 4);
    
    console.log(`📊 Token count estimation: ${estimatedTokens} tokens for ${text.length} characters`);
    
    return {
      totalTokens: estimatedTokens
    };
  }

  /**
   * Embed content (not supported by Anthropic API)
   */
  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error(
      'Embedding is not supported by Anthropic API. ' +
      'Use a different provider for embedding functionality.'
    );
  }

  /**
   * Get current token (for debugging)
   */
  getCurrentToken(): string | null {
    const credentials = this.tokenManager.getCredentials();
    return credentials?.access_token || null;
  }

  /**
   * Clear cached credentials
   */
  clearCredentials(): void {
    // Let token manager handle credential clearing
    const emptyCredentials = {
      access_token: '',
      token_type: 'Bearer'
    };
    this.tokenManager.setCredentials(emptyCredentials);
    console.log('🧹 Cleared cached credentials');
  }

  /**
   * Get client configuration for debugging
   */
  getClientConfig(): any {
    return {
      baseUrl: this.baseUrl,
      httpClientConfig: this.httpClient.getConfig(),
      hasToken: !!this.getCurrentToken()
    };
  }
}