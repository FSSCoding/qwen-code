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
import { logApiResponse } from '../telemetry/loggers.js';
import { ApiResponseEvent } from '../telemetry/types.js';

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
  private readonly contentGeneratorConfig: ContentGeneratorConfig;
  private readonly config: Config;
  
  constructor(
    contentGeneratorConfig: ContentGeneratorConfig,
    config: Config,
    options: ClaudeSubprocessOptions = {}
  ) {
    this.cliPath = options.cliPath || 'claude';
    this.timeout = options.timeout || 120000; // 2 minutes
    this.defaultModel = options.model || 'sonnet';
    this.maxRetries = options.maxRetries || 2;
    this.contentGeneratorConfig = contentGeneratorConfig;
    this.config = config;
    
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
      const response = this.convertToGeminiResponse(cliResponse);
      
      // Log API response for telemetry (token counting)
      if (response.usageMetadata && !cliResponse.is_error) {
        const responseEvent = new ApiResponseEvent(
          response.responseId || cliResponse.session_id || `claude-${Date.now()}`,
          this.defaultModel, // Use the model we actually used
          cliResponse.duration_ms,
          userPromptId,
          this.contentGeneratorConfig.authType,
          response.usageMetadata,
        );
        logApiResponse(this.config, responseEvent);
      }
      
      return response;
      
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
      
      return this.executeClaudeStreamingCommand(prompt, { model, userPromptId });
      
    } catch (error) {
      console.error('❌ ClaudeSubprocessGenerator.generateContentStream failed:', error);
      
      // Return an async generator that yields an error response
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorStreamGenerator(`Claude Code Max streaming failed: ${errorMessage}`);
    }
  }

  /**
   * Create system prompt explaining Claude's role in the QwenCode system
   */
  private createSystemPrompt(): string {
    return `IMPORTANT: You are Claude Code Max operating within the QwenCode system. Here's how you should behave:

🔧 TOOL SYSTEM ARCHITECTURE:
- You are the "reasoning brain" - you analyze, plan, and provide instructions
- You CANNOT execute tools directly - all tool execution happens through QwenCode's local system
- When you want to use tools, simply describe your intentions naturally in your response
- Examples of good tool requests:
  • "I'll read the file config.ts to understand the configuration"
  • "Let me run \`npm run build\` to check for errors"
  • "I need to search for 'function authenticate' in the codebase"
  • "I'll write the following code to utils.js"

🎯 YOUR ROLE:
- Analyze problems and provide solutions
- Request tools by describing what you want to do
- Review tool results and continue reasoning
- Provide clear explanations of your thought process
- Focus on the "why" and "what" rather than the "how" of execution

⚠️ WHAT NOT TO DO:
- Don't try to execute commands yourself
- Don't assume tools have already been run
- Don't use tool-specific syntax (you're not in a tool environment)
- Don't mention that you "can't execute tools" - just describe what you want to do

The QwenCode system will automatically detect your tool intentions and execute them safely through the local Qwen agent system. Simply focus on being helpful and describing your intended actions clearly.

---

`;
  }

  /**
   * Extract text prompt from Gemini request format
   */
  private extractPromptFromRequest(request: GenerateContentParameters): string {
    const parts: string[] = [];
    
    // Always start with our system prompt explaining Claude's role
    parts.push(this.createSystemPrompt());
    
    // Handle ContentListUnion format
    if (typeof request.contents === 'string') {
      parts.push(`[User]: ${request.contents}`);
      return parts.join('\n\n');
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
      
      // CRITICAL FIX: If non-Claude model is requested, use default Claude model instead
      if (request.model.includes('gemini') || request.model.includes('gpt') || request.model.includes('qwen')) {
        // Non-Claude model requested, using default Claude model
        return this.defaultModel;
      }
      
      const mappedModel = modelMappings[request.model] || request.model;
      // Model mapping applied
      return mappedModel;
    }
    
    // Using default model
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
        
        // CRITICAL: Disable all tools in Claude CLI - we handle tools through QwenCode's system
        args.push('--disallowed-tools', '*');
        
        // Additional safety measures
        args.push('--permission-mode', 'plan'); // Request plans instead of direct execution
        args.push('--dangerously-skip-permissions'); // Skip permission prompts since we handle them
        
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
    options: { model?: string; userPromptId?: string } = {}
  ): AsyncGenerator<GenerateContentResponse> {
    const args = ['-p', '--output-format=stream-json', '--verbose'];
    
    if (options.model) {
      args.push('--model', options.model);
    }
    
    // CRITICAL: Disable all tools in Claude CLI - we handle tools through QwenCode's system
    args.push('--disallowed-tools', '*');
    
    // Additional safety measures for streaming
    args.push('--permission-mode', 'plan'); // Request plans instead of direct execution
    args.push('--dangerously-skip-permissions'); // Skip permission prompts since we handle them
    
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
              
              // Debug: Log message types (temporary)
              if (streamChunk.type !== 'assistant') {
                console.log(`📨 Claude message type: ${streamChunk.type}`, {
                  hasResult: !!streamChunk.result,
                  hasUsage: !!streamChunk.usage,
                  hasUuid: !!streamChunk.uuid
                });
              }
              
              // Handle different Claude CLI message types
              if (streamChunk.type === 'assistant' && streamChunk.message?.content?.[0]?.text) {
                yield this.createStreamingResponse(streamChunk.message.content[0].text);
              } else if (streamChunk.type === 'result') {
                // Final response with complete result - this contains token counts
                if (streamChunk.result) {
                  yield this.createFinalResponseWithText(streamChunk.result, streamChunk, options.userPromptId);
                }
                return; // Always return after result type
              } else if (streamChunk.type === 'system' && streamChunk.subtype === 'init') {
                // Initialization message - continue
                // Claude CLI initialized
              } else if (streamChunk.type === 'message_stop' || streamChunk.type === 'content_block_stop') {
                // Claude API completion markers - handle gracefully
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
      
      // Process any remaining data in buffer before finishing
      if (buffer.trim()) {
        try {
          const streamChunk = JSON.parse(buffer) as any;
          
          if (streamChunk.type === 'result') {
            // Final response with complete result - this contains token counts
            if (streamChunk.result) {
              yield this.createFinalResponseWithText(streamChunk.result, streamChunk, options.userPromptId);
            }
            return; // Always return after result type
          }
        } catch (parseError) {
          console.warn('⚠️ Failed to parse final buffer content:', {
            buffer: buffer.substring(0, 200) + (buffer.length > 200 ? '...' : ''),
            error: parseError instanceof Error ? parseError.message : String(parseError)
          });
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
    
    // Parse the response for tool calls
    const responseParts = this.parseToolCallsFromText(cliResponse.result);
    
    const response = {
      responseId: cliResponse.session_id || `claude-${Date.now()}`,
      candidates: [{
        content: {
          parts: responseParts,
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
      responseId: `claude-stream-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      candidates: [{
        content: {
          parts: [{ text: content }],
          role: 'model'
        },
        finishReason: FinishReason.FINISH_REASON_UNSPECIFIED, // Still streaming
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
      responseId: `claude-error-${Date.now()}`,
      candidates: [{
        content: {
          parts: [{ text: `Error: ${errorMessage}\n\nPlease check your Claude CLI installation and authentication.` }],
          role: 'model'
        },
        finishReason: FinishReason.STOP,
        index: 0,
        safetyRatings: []
      }]
    } as unknown as GenerateContentResponse;
  }

  /**
   * Create final streaming response with text and metadata
   */
  private createFinalResponseWithText(text: string, chunk: any, userPromptId?: string): GenerateContentResponse {
    // Parse the final text for tool calls
    const responseParts = this.parseToolCallsFromText(text);
    
    const response = {
      responseId: chunk.uuid || chunk.session_id || `claude-${Date.now()}`,
      candidates: [{
        content: {
          parts: responseParts,
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
    
    // Log API response for telemetry (token counting) in streaming mode
    if (response.usageMetadata && userPromptId) {
      const responseEvent = new ApiResponseEvent(
        response.responseId || chunk.session_id || `claude-stream-${Date.now()}`,
        this.defaultModel, // Use the model we actually used
        chunk.duration_ms || 0,
        userPromptId,
        this.contentGeneratorConfig.authType,
        response.usageMetadata,
      );
      logApiResponse(this.config, responseEvent);
    }
    
    return response;
  }

  /**
   * Parse text response for tool call patterns and convert to function call parts
   * This detects when Claude wants to use tools but was prevented by --disallowed-tools
   */
  private parseToolCallsFromText(text: string): Part[] {
    const parts: Part[] = [];
    
    // Comprehensive tool call patterns Claude uses when it wants to execute tools
    const toolPatterns = [
      // READ TOOL - File reading operations
      {
        pattern: /I(?:'ll| will|'d like to| need to) (?:read|check|examine|look at|view|see|open) (?:the )?(?:file|contents of|code in) ["`']?([^"`'\s]+(?:\.[a-zA-Z0-9]+)?)["`']?/gi,
        tool: 'Read',
        extractArgs: (match: RegExpMatchArray) => ({ file_path: this.cleanPath(match[1]) })
      },
      {
        pattern: /Let me (?:read|check|examine|look at|view|see|open) (?:the )?(?:file|contents of|code in) ["`']?([^"`'\s]+(?:\.[a-zA-Z0-9]+)?)["`']?/gi,
        tool: 'Read',
        extractArgs: (match: RegExpMatchArray) => ({ file_path: this.cleanPath(match[1]) })
      },
      {
        pattern: /(?:First|Next|Now),? (?:I'll|let me|I need to) read ["`']?([^"`'\s]+(?:\.[a-zA-Z0-9]+)?)["`']?/gi,
        tool: 'Read',
        extractArgs: (match: RegExpMatchArray) => ({ file_path: this.cleanPath(match[1]) })
      },

      // WRITE TOOL - File writing operations  
      {
        pattern: /I(?:'ll| will|'d like to| need to) (?:write|create|save|update) (?:the )?(?:following|this|content) (?:to|into|in) (?:the )?(?:file )?["`']?([^"`'\s]+(?:\.[a-zA-Z0-9]+)?)["`']?/gi,
        tool: 'Write',
        extractArgs: (match: RegExpMatchArray) => ({ file_path: this.cleanPath(match[1]), content: "" })
      },
      {
        pattern: /Let me (?:write|create|save|update) (?:the )?(?:following|this|content) (?:to|into|in) (?:the )?(?:file )?["`']?([^"`'\s]+(?:\.[a-zA-Z0-9]+)?)["`']?/gi,
        tool: 'Write',
        extractArgs: (match: RegExpMatchArray) => ({ file_path: this.cleanPath(match[1]), content: "" })
      },
      {
        pattern: /I(?:'ll| will) create (?:a )?(?:new )?file ["`']?([^"`'\s]+(?:\.[a-zA-Z0-9]+)?)["`']?/gi,
        tool: 'Write',
        extractArgs: (match: RegExpMatchArray) => ({ file_path: this.cleanPath(match[1]), content: "" })
      },

      // EDIT TOOL - File editing operations
      {
        pattern: /I(?:'ll| will|'d like to| need to) (?:edit|modify|change|update) (?:the )?(?:file )?["`']?([^"`'\s]+(?:\.[a-zA-Z0-9]+)?)["`']?/gi,
        tool: 'Edit',
        extractArgs: (match: RegExpMatchArray) => ({ file_path: this.cleanPath(match[1]), old_string: "", new_string: "" })
      },
      {
        pattern: /Let me (?:edit|modify|change|update) (?:the )?(?:file )?["`']?([^"`'\s]+(?:\.[a-zA-Z0-9]+)?)["`']?/gi,
        tool: 'Edit',
        extractArgs: (match: RegExpMatchArray) => ({ file_path: this.cleanPath(match[1]), old_string: "", new_string: "" })
      },

      // BASH TOOL - Command execution
      {
        pattern: /I(?:'ll| will|'d like to| need to) (?:run|execute|use) (?:the )?(?:command )?["`']([^"`']+)["`']/gi,
        tool: 'Bash',
        extractArgs: (match: RegExpMatchArray) => ({ command: match[1].trim() })
      },
      {
        pattern: /Let me (?:run|execute|use) (?:the )?(?:command )?["`']([^"`']+)["`']/gi,
        tool: 'Bash',
        extractArgs: (match: RegExpMatchArray) => ({ command: match[1].trim() })
      },
      {
        pattern: /I(?:'ll| will|'d like to| need to) (?:run|execute|use) (?:the )?(?:command )?`([^`]+)`/gi,
        tool: 'Bash',
        extractArgs: (match: RegExpMatchArray) => ({ command: match[1].trim() })
      },
      {
        pattern: /(?:First|Next|Now),? (?:I'll|let me|I need to) run `([^`]+)`/gi,
        tool: 'Bash',
        extractArgs: (match: RegExpMatchArray) => ({ command: match[1].trim() })
      },

      // GREP TOOL - Search operations
      {
        pattern: /I(?:'ll| will|'d like to| need to) (?:search|grep|find|look) for ["`']([^"`']+)["`'] in (?:the )?(?:file )?["`']?([^"`'\s]+(?:\.[a-zA-Z0-9]+)?)["`']?/gi,
        tool: 'Grep',
        extractArgs: (match: RegExpMatchArray) => ({ pattern: match[1].trim(), path: this.cleanPath(match[2]) })
      },
      {
        pattern: /Let me (?:search|grep|find|look) for ["`']([^"`']+)["`'] in (?:the )?(?:file )?["`']?([^"`'\s]+(?:\.[a-zA-Z0-9]+)?)["`']?/gi,
        tool: 'Grep',
        extractArgs: (match: RegExpMatchArray) => ({ pattern: match[1].trim(), path: this.cleanPath(match[2]) })
      },
      {
        pattern: /I(?:'ll| will|'d like to| need to) (?:search|grep|find|look) for ([a-zA-Z0-9_]+) in (?:the )?(?:codebase|project|files)/gi,
        tool: 'Grep',
        extractArgs: (match: RegExpMatchArray) => ({ pattern: match[1].trim(), output_mode: "files_with_matches" })
      },

      // GLOB TOOL - File pattern matching
      {
        pattern: /I(?:'ll| will|'d like to| need to) (?:find|locate|list) (?:all )?(?:files )?(?:matching |with pattern )?["`']([^"`']+)["`']/gi,
        tool: 'Glob',
        extractArgs: (match: RegExpMatchArray) => ({ pattern: match[1].trim() })
      },
      {
        pattern: /Let me (?:find|locate|list) (?:all )?(?:files )?(?:matching |with pattern )?["`']([^"`']+)["`']/gi,
        tool: 'Glob',
        extractArgs: (match: RegExpMatchArray) => ({ pattern: match[1].trim() })
      },

      // LS TOOL - Directory listing
      {
        pattern: /I(?:'ll| will|'d like to| need to) (?:list|see|check) (?:the )?(?:contents of |files in )?(?:the )?(?:directory )?["`']?([^"`'\s]+)["`']?/gi,
        tool: 'LS',
        extractArgs: (match: RegExpMatchArray) => ({ path: this.cleanPath(match[1]) })
      },
      {
        pattern: /Let me (?:list|see|check) (?:the )?(?:contents of |files in )?(?:the )?(?:directory )?["`']?([^"`'\s]+)["`']?/gi,
        tool: 'LS',
        extractArgs: (match: RegExpMatchArray) => ({ path: this.cleanPath(match[1]) })
      },

      // Generic tool intentions
      {
        pattern: /I(?:'ll| will|'d like to| need to) use (?:the )?([A-Z][a-zA-Z]+) tool/gi,
        tool: (match: RegExpMatchArray) => match[1],
        extractArgs: () => ({})
      }
    ];
    
    try {
      // Split text into meaningful chunks for better pattern matching
      const textChunks = this.splitTextForParsing(text);
      
      for (const chunk of textChunks) {
        for (const toolPattern of toolPatterns) {
          const matches = [...chunk.matchAll(toolPattern.pattern)];
          
          for (const match of matches) {
            try {
              const toolName = typeof toolPattern.tool === 'function' 
                ? toolPattern.tool(match) 
                : toolPattern.tool;
              
              const args = toolPattern.extractArgs(match);
              
              // Validate tool name and args
              if (this.isValidToolCall(toolName, args)) {
                const functionCall = {
                  functionCall: {
                    name: toolName,
                    args: args,
                    id: `claude-tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                  }
                };
                
                parts.push(functionCall);
                
                console.log('🔧 Detected Claude tool request:', {
                  tool: toolName,
                  args: args,
                  originalText: match[0].substring(0, 100) + (match[0].length > 100 ? '...' : ''),
                  confidence: this.calculateToolConfidence(match[0], toolName)
                });
              }
              
            } catch (error) {
              console.warn('⚠️ Failed to parse tool call:', {
                pattern: toolPattern.pattern,
                match: match[0].substring(0, 50),
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Critical error in tool parsing:', error);
      // Continue with just text if parsing fails
    }
    
    // Always include the original text as the first part  
    parts.unshift({ text });
    
    return parts;
  }

  /**
   * Clean and normalize file paths from Claude responses
   */
  private cleanPath(path: string): string {
    return path
      .replace(/["`']/g, '') // Remove quotes
      .replace(/\s*\.\s*$/, '') // Remove trailing periods
      .replace(/\s*,\s*$/, '') // Remove trailing commas
      .replace(/^[^\w\/\.]/, '') // Remove leading non-path characters
      .trim();
  }

  /**
   * Split text into meaningful chunks for better tool pattern detection
   */
  private splitTextForParsing(text: string): string[] {
    // Split by sentences but keep some context
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    
    // Create overlapping chunks to catch patterns that span sentence boundaries
    for (let i = 0; i < sentences.length; i++) {
      // Single sentence
      chunks.push(sentences[i]);
      
      // Two-sentence chunks for context
      if (i < sentences.length - 1) {
        chunks.push(sentences[i] + ' ' + sentences[i + 1]);
      }
    }
    
    // Also include the full text for global patterns
    chunks.push(text);
    
    return chunks;
  }

  /**
   * Validate if a tool call is reasonable and should be executed
   */
  private isValidToolCall(toolName: string, args: Record<string, any>): boolean {
    const validTools = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'LS', 'MultiEdit', 'NotebookEdit'];
    
    if (!validTools.includes(toolName)) {
      console.warn(`⚠️ Unknown tool name: ${toolName}`);
      return false;
    }
    
    // Basic argument validation
    switch (toolName) {
      case 'Read':
      case 'LS':
        return args.file_path || args.path;
      case 'Write':
      case 'Edit':
        return args.file_path && typeof args.file_path === 'string';
      case 'Bash':
        return args.command && args.command.length > 0 && !args.command.includes('rm -rf');
      case 'Grep':
        return args.pattern && args.pattern.length > 0;
      case 'Glob':
        return args.pattern && args.pattern.length > 0;
      default:
        return true;
    }
  }

  /**
   * Calculate confidence score for tool detection (for debugging/monitoring)
   */
  private calculateToolConfidence(text: string, toolName: string): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence for explicit tool mentions
    if (text.toLowerCase().includes(toolName.toLowerCase())) {
      confidence += 0.3;
    }
    
    // Increase confidence for clear intent words
    const intentWords = ['will', "I'll", 'let me', 'need to', 'going to'];
    if (intentWords.some(word => text.toLowerCase().includes(word))) {
      confidence += 0.2;
    }
    
    // Increase confidence for file paths or commands in quotes
    if (/["`'][^"`']+["`']/.test(text)) {
      confidence += 0.2;
    }
    
    return Math.min(confidence, 1.0);
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