/**
 * @license
 * Copyright 2025 FSS Coding
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gemini ↔ Anthropic Format Converter
 * 
 * Handles the translation between Gemini's GenerateContentParameters format
 * and Anthropic's Messages API format. This is crucial because the two APIs
 * have fundamentally different data structures.
 */

import {
  GenerateContentParameters,
  GenerateContentResponse,
  Part,
  FinishReason
} from '@google/genai';
import {
  AnthropicRequest,
  AnthropicResponse,
  AnthropicMessage,
  AnthropicStreamChunk
} from './anthropicHttpClient.js';

export interface ConversionOptions {
  defaultMaxTokens?: number;
  preserveSystemMessages?: boolean;
  enableToolSupport?: boolean;
}

export class GeminiAnthropicConverter {
  private static readonly DEFAULT_MAX_TOKENS = 4000;
  private static readonly DEFAULT_OPTIONS: ConversionOptions = {
    defaultMaxTokens: 4000,
    preserveSystemMessages: true,
    enableToolSupport: false // Tools not yet implemented
  };

  /**
   * Convert Gemini GenerateContentParameters to Anthropic request format
   */
  static geminiToAnthropic(
    request: GenerateContentParameters,
    options: ConversionOptions = {}
  ): AnthropicRequest {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const messages: AnthropicMessage[] = [];
    let systemPrompt: string | undefined;

    // Handle ContentListUnion - it can be Content[] or string
    const contents = Array.isArray(request.contents) ? request.contents : [];
    
    // Process contents and extract system messages
    for (const content of contents) {
      // Type guard to ensure content is a proper Content object
      if (typeof content === 'string') continue;
      if (!('role' in content) || !('parts' in content)) continue;
      
      if (content.role === 'system') {
        if (opts.preserveSystemMessages) {
          // Anthropic uses top-level system field, not in messages array
          const systemText = this.extractTextFromParts(content.parts || []);
          systemPrompt = systemPrompt ? `${systemPrompt}\n\n${systemText}` : systemText;
        }
      } else if (content.role === 'user' || content.role === 'model') {
        // Convert role names and extract content
        const anthropicRole = content.role === 'model' ? 'assistant' : 'user';
        const messageContent = this.convertContentParts(content.parts || [], opts);
        
        if (messageContent) {
          messages.push({
            role: anthropicRole,
            content: messageContent
          });
        }
      }
      // Skip other roles like 'function' for now
    }

    // Build the request
    const anthropicRequest: AnthropicRequest = {
      model: request.model,
      max_tokens: this.extractMaxTokens(request, opts),
      messages,
      temperature: request.config?.temperature,
      top_p: request.config?.topP,
      top_k: request.config?.topK
    };

    // Add system prompt if present
    if (systemPrompt) {
      anthropicRequest.system = systemPrompt;
    }

    // Add stop sequences if configured
    const stopSequences = this.extractStopSequences(request);
    if (stopSequences.length > 0) {
      anthropicRequest.stop_sequences = stopSequences;
    }

    return anthropicRequest;
  }

  /**
   * Convert Anthropic response to Gemini GenerateContentResponse
   */
  static anthropicToGemini(
    response: AnthropicResponse,
    streaming: boolean = false
  ): GenerateContentResponse {
    // Extract text from Anthropic's content blocks
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Create response using same pattern as test
    const geminiResponse = {
      candidates: [{
        content: {
          parts: [{ text }],
          role: 'model'
        },
        finishReason: this.mapFinishReason(response.stop_reason),
        index: 0,
        safetyRatings: []
      }]
    } as unknown as GenerateContentResponse;

    // Add usage metadata if available
    if (response.usage) {
      geminiResponse.usageMetadata = {
        promptTokenCount: response.usage.input_tokens,
        candidatesTokenCount: response.usage.output_tokens,
        totalTokenCount: response.usage.input_tokens + response.usage.output_tokens
      };
    }

    return geminiResponse;
  }

  /**
   * Convert Anthropic stream chunks to Gemini streaming responses
   */
  static anthropicStreamToGemini(
    chunk: AnthropicStreamChunk
  ): GenerateContentResponse | null {
    switch (chunk.type) {
      case 'message_start':
        // Initial chunk - return empty response to start stream
        return {
          candidates: [{
            content: {
              parts: [{ text: '' }],
              role: 'model'
            },
            finishReason: FinishReason.OTHER,
            index: 0,
            safetyRatings: []
          }]
        } as unknown as GenerateContentResponse;

      case 'content_block_delta':
        // Text content chunk
        if (chunk.delta?.type === 'text_delta' && chunk.delta.text) {
          return {
            candidates: [{
              content: {
                parts: [{ text: chunk.delta.text }],
                role: 'model'
              },
              finishReason: FinishReason.OTHER,
              index: 0,
              safetyRatings: []
            }]
          } as unknown as GenerateContentResponse;
        }
        break;

      case 'message_stop':
        // End of stream
        const stopResponse = {
          candidates: [{
            content: {
              parts: [{ text: '' }],
              role: 'model'
            },
            finishReason: FinishReason.STOP,
            index: 0,
            safetyRatings: []
          }]
        } as unknown as GenerateContentResponse;

        // Add usage data if available
        if (chunk.usage) {
          stopResponse.usageMetadata = {
            promptTokenCount: chunk.usage.input_tokens || 0,
            candidatesTokenCount: chunk.usage.output_tokens || 0,
            totalTokenCount: (chunk.usage.input_tokens || 0) + (chunk.usage.output_tokens || 0)
          };
        }

        return stopResponse;

      case 'message_delta':
        // Message metadata updates - mostly for stop_reason
        if (chunk.delta && 'stop_reason' in chunk.delta) {
          return {
            candidates: [{
              content: {
                parts: [{ text: '' }],
                role: 'model'
              },
              finishReason: this.mapFinishReason((chunk.delta as any).stop_reason),
              index: 0,
              safetyRatings: []
            }]
          } as unknown as GenerateContentResponse;
        }
        break;

      case 'ping':
      case 'content_block_start':
      case 'content_block_stop':
        // Skip these chunk types
        break;

      default:
        console.warn('Unknown Anthropic stream chunk type:', chunk.type);
    }

    return null; // Skip chunk types we don't handle
  }

  /**
   * Convert content parts to Anthropic message content
   */
  private static convertContentParts(
    parts: Part[], 
    options: ConversionOptions
  ): string | Array<{type: 'text', text: string}> {
    const textParts: string[] = [];
    // const hasNonText = false; // Future: detect images, etc.

    for (const part of parts) {
      if ('text' in part) {
        textParts.push(part.text || '');
      } else if ('functionCall' in part) {
        // Future: Handle function calls
        if (options.enableToolSupport) {
          console.warn('Function calls not yet supported in Anthropic converter');
        }
      } else if ('functionResponse' in part) {
        // Future: Handle function responses
        if (options.enableToolSupport) {
          console.warn('Function responses not yet supported in Anthropic converter');
        }
      }
      // Future: Handle other part types (images, etc.)
    }

    const combinedText = textParts.join('\n');
    
    // For now, always return string format
    // Future: Return array format when we have non-text content
    return combinedText;
  }

  /**
   * Extract text content from parts array
   */
  private static extractTextFromParts(parts: Part[]): string {
    return parts
      .filter(part => 'text' in part)
      .map(part => (part as { text: string }).text)
      .join('\n');
  }

  /**
   * Extract max_tokens from Gemini request
   */
  private static extractMaxTokens(
    request: GenerateContentParameters,
    options: ConversionOptions
  ): number {
    // Check various possible sources for token limit
    const configMaxTokens = request.config?.maxOutputTokens;
    const candidateCount = request.config?.candidateCount || 1;
    
    if (configMaxTokens) {
      // Adjust for multiple candidates if needed
      return Math.floor(configMaxTokens / candidateCount);
    }
    
    return options.defaultMaxTokens || this.DEFAULT_MAX_TOKENS;
  }

  /**
   * Extract stop sequences from Gemini request
   */
  private static extractStopSequences(request: GenerateContentParameters): string[] {
    const stopSequences: string[] = [];
    
    // Check if there are custom stop sequences in the config
    const config = request.config as any;
    if (config?.stopSequences && Array.isArray(config.stopSequences)) {
      stopSequences.push(...config.stopSequences);
    }
    
    return stopSequences;
  }

  /**
   * Map Anthropic finish reasons to Gemini finish reasons
   */
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

  /**
   * Validate Anthropic request before sending
   */
  static validateAnthropicRequest(request: AnthropicRequest): void {
    if (!request.model) {
      throw new Error('Model is required for Anthropic request');
    }
    
    if (!request.max_tokens || request.max_tokens <= 0) {
      throw new Error('max_tokens must be a positive number for Anthropic request');
    }
    
    if (!request.messages || request.messages.length === 0) {
      throw new Error('At least one message is required for Anthropic request');
    }
    
    // Validate message format
    for (const message of request.messages) {
      if (!['user', 'assistant'].includes(message.role)) {
        throw new Error(`Invalid message role: ${message.role}. Must be 'user' or 'assistant'`);
      }
      
      if (!message.content) {
        throw new Error('Message content cannot be empty');
      }
    }
    
    // Validate parameter ranges
    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 1) {
        throw new Error('Temperature must be between 0 and 1');
      }
    }
    
    if (request.top_p !== undefined) {
      if (request.top_p < 0 || request.top_p > 1) {
        throw new Error('top_p must be between 0 and 1');
      }
    }
    
    if (request.top_k !== undefined) {
      if (request.top_k <= 0 || !Number.isInteger(request.top_k)) {
        throw new Error('top_k must be a positive integer');
      }
    }
  }

  /**
   * Get conversion statistics for debugging
   */
  static getConversionStats(
    originalRequest: GenerateContentParameters,
    convertedRequest: AnthropicRequest
  ): {
    originalMessageCount: number;
    convertedMessageCount: number;
    hasSystemMessage: boolean;
    extractedMaxTokens: number;
    preservedParameters: string[];
  } {
    // Handle ContentListUnion for counting
    let originalCount = 0;
    if (typeof originalRequest.contents === 'string') {
      originalCount = 1;
    } else if (Array.isArray(originalRequest.contents)) {
      originalCount = originalRequest.contents.length;
    }
    
    return {
      originalMessageCount: originalCount,
      convertedMessageCount: convertedRequest.messages.length,
      hasSystemMessage: !!convertedRequest.system,
      extractedMaxTokens: convertedRequest.max_tokens,
      preservedParameters: [
        convertedRequest.temperature !== undefined ? 'temperature' : '',
        convertedRequest.top_p !== undefined ? 'top_p' : '',
        convertedRequest.top_k !== undefined ? 'top_k' : '',
        convertedRequest.stop_sequences?.length ? 'stop_sequences' : ''
      ].filter(Boolean)
    };
  }
}