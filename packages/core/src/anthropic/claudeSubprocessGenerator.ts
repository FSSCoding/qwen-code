/**
 * @license
 * Copyright 2025 FSS Coding
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Claude Subprocess Generator
 * 
 * Integrates with Claude Code Max by using the official Claude CLI as a subprocess.
 * This is the standard approach used by RooCode, Cursor, and other tools.
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
  EmbedContentResponse,
  FinishReason,
  Part
} from '@google/genai';
import { Config } from '../config/config.js';
import { spawn } from 'child_process';
import { Readable } from 'stream';

// Claude CLI response format
interface ClaudeCliResponse {
  type: 'result' | 'error';
  subtype?: 'success' | 'failure';
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
    server_tool_use: {
      web_search_requests: number;
    };
    service_tier: string;
    cache_creation?: {
      ephemeral_1h_input_tokens: number;
      ephemeral_5m_input_tokens: number;
    };
  };
  permission_denials: any[];
  uuid: string;
  error_message?: string;
}

export interface ClaudeSubprocessOptions {
  cliPath?: string;
  timeout?: number;
  model?: string;
  maxRetries?: number;
}

export class ClaudeSubprocessGenerator implements ContentGenerator {
  private readonly cliPath: string;
  private readonly timeout: number;
  private readonly defaultModel: string;
  private readonly maxRetries: number;
  
  constructor(
    contentGeneratorConfig: ContentGeneratorConfig,
    config: Config,
    options: ClaudeSubprocessOptions = {}
  ) {
    this.cliPath = options.cliPath || 'claude';
    this.timeout = options.timeout || 120000; // 2 minutes
    this.defaultModel = options.model || 'sonnet';
    this.maxRetries = options.maxRetries || 2;
    
    console.log('🔧 ClaudeSubprocessGenerator initialized:', {
      cliPath: this.cliPath,
      timeout: this.timeout,
      defaultModel: this.defaultModel
    });
  }

  /**
   * Generate content using Claude CLI subprocess
   */
  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string
  ): Promise<GenerateContentResponse> {
    console.log('🔍 ClaudeSubprocessGenerator.generateContent called');
    
    try {
      // Pre-flight check: ensure Claude CLI is still working
      const cliInfo = await ClaudeSubprocessGenerator.getCliInfo(this.cliPath);
      if (!cliInfo.available) {
        throw new Error('Claude CLI is no longer available. Please check your installation.');
      }
      
      // Convert Gemini request to prompt
      const prompt = this.extractPromptFromRequest(request);
      const model = this.extractModelFromRequest(request);
      
      console.log('📝 Extracted prompt length:', prompt.length);
      console.log('🤖 Using model:', model);
      
      // Execute Claude CLI with retry mechanism
      const cliResponse = await this.executeClaudeCommand(prompt, {
        model,
        outputFormat: 'json'
      });
      
      console.log('✅ Claude CLI response received:', {
        success: !cliResponse.is_error,
        cost: cliResponse.total_cost_usd,
        tokens: cliResponse.usage?.output_tokens
      });
      
      // Convert to Gemini format
      return this.convertToGeminiResponse(cliResponse);
      
    } catch (error) {
      console.error('❌ ClaudeSubprocessGenerator.generateContent failed:', error);
      
      // Re-throw with context
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Claude Code Max integration failed: ${errorMessage}`);
    }
  }

  /**
   * Generate streaming content using Claude CLI subprocess
   */
  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    console.log('🔍 ClaudeSubprocessGenerator.generateContentStream called');
    
    try {
      // Pre-flight check: ensure Claude CLI is still working
      const cliInfo = await ClaudeSubprocessGenerator.getCliInfo(this.cliPath);
      if (!cliInfo.available) {
        throw new Error('Claude CLI is no longer available. Please check your installation.');
      }
      
      const prompt = this.extractPromptFromRequest(request);
      const model = this.extractModelFromRequest(request);
      
      console.log('📝 Streaming prompt length:', prompt.length);
      console.log('🤖 Using model for streaming:', model);
      
      return this.executeClaudeStreamingCommand(prompt, { model });
      
    } catch (error) {
      console.error('❌ ClaudeSubprocessGenerator.generateContentStream failed:', error);
      
      // Return an async generator that yields an error response
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorStreamGenerator(`Claude Code Max streaming failed: ${errorMessage}`);
    }
  }

  /**
   * Extract text prompt from Gemini request format
   */
  private extractPromptFromRequest(request: GenerateContentParameters): string {
    const parts: string[] = [];
    
    // Handle ContentListUnion format
    if (typeof request.contents === 'string') {
      return request.contents;
    }
    
    if (!Array.isArray(request.contents)) {
      return '';
    }
    
    for (const content of request.contents) {
      if (typeof content === 'string') {
        parts.push(content);
        continue;
      }
      
      if (!('role' in content) || !('parts' in content)) {
        continue;
      }
      
      // Add role context for multi-turn conversations
      if (content.role === 'system') {
        const systemText = this.extractTextFromParts(content.parts || []);
        if (systemText) {
          parts.push(`[System]: ${systemText}`);
        }
      } else if (content.role === 'user') {
        const userText = this.extractTextFromParts(content.parts || []);
        if (userText) {
          parts.push(`[User]: ${userText}`);
        }
      } else if (content.role === 'model' || content.role === 'assistant') {
        const assistantText = this.extractTextFromParts(content.parts || []);
        if (assistantText) {
          parts.push(`[Assistant]: ${assistantText}`);
        }
      }
    }
    
    return parts.join('\n\n');
  }

  /**
   * Extract model from request, with fallback to default
   */
  private extractModelFromRequest(request: GenerateContentParameters): string {
    if (request.model) {
      // Map full model names to Claude CLI aliases
      const modelMappings: Record<string, string> = {
        'claude-sonnet-4-20250514': 'sonnet',
        'claude-opus-4-1-20250805': 'opus',
        'claude-3-5-sonnet-20241022': 'sonnet',
        'claude-3-opus-20240229': 'opus'
      };
      
      return modelMappings[request.model] || request.model;
    }
    
    return this.defaultModel;
  }

  /**
   * Extract text from parts array
   */
  private extractTextFromParts(parts: Part[]): string {
    return parts
      .filter(part => 'text' in part)
      .map(part => (part as { text: string }).text)
      .join(' ');
  }

  /**
   * Execute Claude CLI command with retry logic (based on RooCode approach)
   */
  private async executeClaudeCommand(
    prompt: string,
    options: {
      model?: string;
      outputFormat?: string;
    } = {}
  ): Promise<ClaudeCliResponse> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Use RooCode approach: pipe mode with streaming input
        const args = ['-p'];
        
        if (options.outputFormat) {
          args.push(`--output-format=${options.outputFormat}`);
        }
        
        if (options.model) {
          args.push('--model', options.model);
        }
        
        console.log(`🔧 Executing Claude CLI (attempt ${attempt}/${this.maxRetries}):`, {
          command: this.cliPath,
          args: args,
          promptLength: prompt.length
        });
        
        const response = await new Promise<ClaudeCliResponse>((resolve, reject) => {
          const process = spawn(this.cliPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: this.timeout
          });
          
          let stdout = '';
          let stderr = '';
          
          process.stdout?.on('data', (data) => {
            stdout += data.toString();
          });
          
          process.stderr?.on('data', (data) => {
            stderr += data.toString();
          });
          
          process.on('close', (code) => {
            if (code === 0) {
              try {
                const response = JSON.parse(stdout) as ClaudeCliResponse;
                resolve(response);
              } catch (parseError) {
                reject(new Error(`Failed to parse Claude CLI response: ${parseError}`));
              }
            } else {
              reject(new Error(`Claude CLI failed with code ${code}. stderr: ${stderr}`));
            }
          });
          
          process.on('error', (error) => {
            if (error.message.includes('ENOENT')) {
              reject(new Error('Claude CLI not found. Install with: npm install -g @anthropics/claude'));
            } else {
              reject(error);
            }
          });
          
          // Write prompt to stdin (RooCode approach)
          if (process.stdin) {
            process.stdin.write(prompt + '\n');
            process.stdin.end();
          }
          
          // Handle timeout
          setTimeout(() => {
            if (!process.killed) {
              process.kill('SIGTERM');
              reject(new Error(`Claude CLI timed out after ${this.timeout}ms`));
            }
          }, this.timeout);
        });
        
        // If we get here, the command succeeded
        return response;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this.maxRetries) {
          console.error(`❌ Claude CLI failed after ${this.maxRetries} attempts:`, lastError.message);
          break;
        }
        
        // Don't retry on certain permanent errors
        if (lastError.message.includes('ENOENT') || 
            lastError.message.includes('Claude CLI not found')) {
          console.error('❌ Claude CLI not available, skipping retries');
          break;
        }
        
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(`⚠️ Claude CLI attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Execute Claude CLI with streaming output (based on RooCode pattern)
   */
  private async *executeClaudeStreamingCommand(
    prompt: string,
    options: { model?: string } = {}
  ): AsyncGenerator<GenerateContentResponse> {
    const args = ['-p', '--output-format=stream-json', '--verbose'];
    
    if (options.model) {
      args.push('--model', options.model);
    }
    
    console.log('🔧 Executing Claude CLI streaming:', {
      command: this.cliPath,
      args: args,
      promptLength: prompt.length
    });
    
    const process = spawn(this.cliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Write prompt to stdin (RooCode approach)
    if (process.stdin) {
      process.stdin.write(prompt + '\n');
      process.stdin.end();
    }
    
    const stream = process.stdout as Readable;
    let buffer = '';
    
    try {
      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const streamChunk = JSON.parse(line) as any;
              
              // Handle assistant message chunks
              if (streamChunk.type === 'assistant' && streamChunk.message?.content?.[0]?.text) {
                yield this.createStreamingResponse(streamChunk.message.content[0].text);
              } else if (streamChunk.type === 'result' && streamChunk.result) {
                // Final response with complete result
                yield this.createFinalResponseWithText(streamChunk.result, streamChunk);
                return;
              } else if (streamChunk.type === 'system' && streamChunk.subtype === 'init') {
                // Initialization message - continue
                console.log('📡 Claude CLI initialized, session_id:', streamChunk.session_id);
              }
            } catch (parseError) {
              console.warn('⚠️ Failed to parse streaming chunk, continuing...', {
                line: line.substring(0, 100) + (line.length > 100 ? '...' : ''),
                error: parseError instanceof Error ? parseError.message : String(parseError)
              });
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Claude CLI streaming failed: ${error}`);
    }
  }

  /**
   * Convert Claude CLI response to Gemini format
   */
  private convertToGeminiResponse(cliResponse: ClaudeCliResponse): GenerateContentResponse {
    if (cliResponse.is_error) {
      throw new Error(cliResponse.error_message || 'Claude CLI returned an error');
    }
    
    const response = {
      candidates: [{
        content: {
          parts: [{ text: cliResponse.result }],
          role: 'model'
        },
        finishReason: FinishReason.STOP,
        index: 0,
        safetyRatings: []
      }]
    } as unknown as GenerateContentResponse;
    
    // Add usage metadata
    if (cliResponse.usage) {
      response.usageMetadata = {
        promptTokenCount: cliResponse.usage.input_tokens,
        candidatesTokenCount: cliResponse.usage.output_tokens,
        totalTokenCount: cliResponse.usage.input_tokens + cliResponse.usage.output_tokens
      };
    }
    
    // Add cost information as custom metadata
    (response as any).claudeMetadata = {
      cost_usd: cliResponse.total_cost_usd,
      duration_ms: cliResponse.duration_ms,
      session_id: cliResponse.session_id
    };
    
    return response;
  }

  /**
   * Create streaming response chunk
   */
  private createStreamingResponse(content: string): GenerateContentResponse {
    return {
      candidates: [{
        content: {
          parts: [{ text: content }],
          role: 'model'
        },
        finishReason: FinishReason.OTHER, // Still streaming
        index: 0,
        safetyRatings: []
      }]
    } as unknown as GenerateContentResponse;
  }

  /**
   * Create error stream generator for failed operations
   */
  private async *createErrorStreamGenerator(errorMessage: string): AsyncGenerator<GenerateContentResponse> {
    yield {
      candidates: [{
        content: {
          parts: [{ text: `Error: ${errorMessage}\n\nPlease check your Claude CLI installation and authentication.` }],
          role: 'model'
        },
        finishReason: FinishReason.OTHER,
        index: 0,
        safetyRatings: []
      }]
    } as unknown as GenerateContentResponse;
  }

  /**
   * Create final streaming response with text and metadata
   */
  private createFinalResponseWithText(text: string, chunk: any): GenerateContentResponse {
    const response = {
      candidates: [{
        content: {
          parts: [{ text }],
          role: 'model'
        },
        finishReason: FinishReason.STOP,
        index: 0,
        safetyRatings: []
      }]
    } as unknown as GenerateContentResponse;
    
    // Add metadata if available
    if (chunk.total_cost_usd !== undefined) {
      (response as any).claudeMetadata = {
        cost_usd: chunk.total_cost_usd,
        session_id: chunk.session_id,
        duration_ms: chunk.duration_ms
      };
    }

    // Add usage metadata if available
    if (chunk.usage) {
      response.usageMetadata = {
        promptTokenCount: chunk.usage.input_tokens || 0,
        candidatesTokenCount: chunk.usage.output_tokens || 0,
        totalTokenCount: (chunk.usage.input_tokens || 0) + (chunk.usage.output_tokens || 0)
      };
    }
    
    return response;
  }

  /**
   * Count tokens (approximation)
   */
  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Claude CLI doesn't have a direct token counting endpoint
    // Provide rough approximation based on text length
    const text = Array.isArray(request.contents) 
      ? request.contents.map(c => 
          typeof c === 'string' ? c : 
          ('parts' in c ? this.extractTextFromParts(c.parts || []) : '')
        ).join(' ')
      : (typeof request.contents === 'string' ? request.contents : '');
    
    // Claude tokenization is roughly 4 characters per token for English
    const estimatedTokens = Math.ceil(text.length / 4);
    
    return {
      totalTokens: estimatedTokens
    };
  }

  /**
   * Embed content (not supported by Claude)
   */
  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error(
      'Embedding is not supported by Claude. Use a different provider for embedding functionality.'
    );
  }

  /**
   * Check if Claude CLI is available
   */
  static async validateCliAvailability(cliPath: string = 'claude'): Promise<boolean> {
    try {
      const result = await new Promise<boolean>((resolve) => {
        const process = spawn(cliPath, ['--version'], {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        process.on('close', (code) => {
          resolve(code === 0);
        });
        
        process.on('error', () => {
          resolve(false);
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (!process.killed) {
            process.kill();
            resolve(false);
          }
        }, 5000);
      });
      
      return result;
    } catch {
      return false;
    }
  }

  /**
   * Get Claude CLI version and status
   */
  static async getCliInfo(cliPath: string = 'claude'): Promise<{
    available: boolean;
    version?: string;
    authenticated?: boolean;
  }> {
    try {
      const available = await this.validateCliAvailability(cliPath);
      if (!available) {
        return { available: false };
      }
      
      // Get version
      const versionResult = await new Promise<string>((resolve, reject) => {
        const process = spawn(cliPath, ['--version'], {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let output = '';
        process.stdout?.on('data', (data) => {
          output += data.toString();
        });
        
        process.on('close', (code) => {
          if (code === 0) {
            resolve(output.trim());
          } else {
            reject(new Error(`Version check failed with code ${code}`));
          }
        });
        
        process.on('error', reject);
      });
      
      return {
        available: true,
        version: versionResult,
        authenticated: true // If CLI works, authentication is handled
      };
    } catch {
      return {
        available: false
      };
    }
  }
}