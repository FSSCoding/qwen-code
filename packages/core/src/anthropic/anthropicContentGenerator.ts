/**
 * @license
 * Copyright 2025 Anthropic
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAIContentGenerator } from '../core/openaiContentGenerator.js';
import { IAnthropicOAuth2Client, AnthropicCredentials } from './anthropicOAuth2.js';
import { Config } from '../config/config.js';
import {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
} from '@google/genai';
import { ContentGeneratorConfig } from '../core/contentGenerator.js';

// Default Claude Code Max API base URL - uses Claude Code Max endpoint
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

/**
 * Anthropic Content Generator that uses Anthropic OAuth tokens with automatic refresh
 * Follows the same pattern as QwenContentGenerator
 */
export class AnthropicContentGenerator extends OpenAIContentGenerator {
  private anthropicClient: IAnthropicOAuth2Client;

  constructor(
    anthropicClient: IAnthropicOAuth2Client,
    contentGeneratorConfig: ContentGeneratorConfig,
    config: Config,
  ) {
    // Initialize with empty API key, we'll override it dynamically
    super(contentGeneratorConfig, config);
    this.anthropicClient = anthropicClient;

    // Set Anthropic base URL
    this.client.baseURL = ANTHROPIC_BASE_URL;
  }

  /**
   * Override error logging behavior to suppress auth errors during token refresh
   */
  protected override shouldSuppressErrorLogging(
    error: unknown,
    _request: GenerateContentParameters,
  ): boolean {
    // Suppress logging for authentication errors that we handle with token refresh
    return this.isAuthError(error);
  }

  /**
   * Get valid token from the Anthropic OAuth client
   */
  private async getValidToken(): Promise<string> {
    try {
      const tokenResult = await this.anthropicClient.getAccessToken();
      
      if (!tokenResult.token) {
        throw new Error('No access token available');
      }

      return tokenResult.token;
    } catch (error) {
      console.warn('Failed to get token from Anthropic client:', error);
      throw new Error(
        'Failed to obtain valid Anthropic access token. Please re-authenticate.',
      );
    }
  }

  /**
   * Execute an operation with automatic credential management and retry logic.
   * This method handles:
   * - Dynamic token retrieval
   * - Temporary client configuration updates
   * - Automatic restoration of original configuration
   * - Retry logic on authentication errors with token refresh
   *
   * @param operation - The operation to execute with updated client configuration
   * @param restoreOnCompletion - Whether to restore original config after operation completes
   * @returns The result of the operation
   */
  private async executeWithCredentialManagement<T>(
    operation: () => Promise<T>,
    restoreOnCompletion: boolean = true,
  ): Promise<T> {
    // Attempt the operation with credential management and retry logic
    const attemptOperation = async (): Promise<T> => {
      const token = await this.getValidToken();

      // Store original configuration
      const originalApiKey = this.client.apiKey;
      const originalBaseURL = this.client.baseURL;

      // Apply dynamic configuration
      this.client.apiKey = token;
      this.client.baseURL = ANTHROPIC_BASE_URL;

      try {
        const result = await operation();

        // For streaming operations, we may need to keep the configuration active
        if (restoreOnCompletion) {
          this.client.apiKey = originalApiKey;
          this.client.baseURL = originalBaseURL;
        }

        return result;
      } catch (error) {
        // Always restore on error
        this.client.apiKey = originalApiKey;
        this.client.baseURL = originalBaseURL;
        throw error;
      }
    };

    // Execute with retry logic for auth errors
    try {
      return await attemptOperation();
    } catch (error) {
      if (this.isAuthError(error)) {
        try {
          // Force a fresh token and retry the operation once
          await this.getValidToken();
          // Retry the operation once with fresh credentials
          return await attemptOperation();
        } catch (_refreshError) {
          throw new Error(
            'Failed to obtain valid Anthropic access token. Please re-authenticate.',
          );
        }
      }
      throw error;
    }
  }

  /**
   * Override to use dynamic token with automatic retry
   */
  override async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    return this.executeWithCredentialManagement(() =>
      super.generateContent(request, userPromptId),
    );
  }

  /**
   * Override to use dynamic token with automatic retry.
   * Note: For streaming, the client configuration is not restored immediately
   * since the generator may continue to be used after this method returns.
   */
  override async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.executeWithCredentialManagement(
      () => super.generateContentStream(request, userPromptId),
      false, // Don't restore immediately for streaming
    );
  }

  /**
   * Override to use dynamic token with automatic retry
   */
  override async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return this.executeWithCredentialManagement(() =>
      super.countTokens(request),
    );
  }

  /**
   * Override to use dynamic token with automatic retry
   */
  override async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.executeWithCredentialManagement(() =>
      super.embedContent(request),
    );
  }

  /**
   * Check if an error is related to authentication/authorization
   */
  private isAuthError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();

    // Define a type for errors that might have status or code properties
    const errorWithCode = error as {
      status?: number | string;
      code?: number | string;
    };
    const errorCode = errorWithCode?.status || errorWithCode?.code;

    return (
      errorCode === 401 ||
      errorCode === 403 ||
      errorCode === '401' ||
      errorCode === '403' ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('invalid api key') ||
      errorMessage.includes('invalid access token') ||
      errorMessage.includes('token expired') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('access denied') ||
      (errorMessage.includes('token') && errorMessage.includes('expired'))
    );
  }

  /**
   * Get the current cached token (may be expired)
   */
  getCurrentToken(): string | null {
    const credentials = this.anthropicClient.getCredentials();
    return credentials?.access_token || null;
  }

  /**
   * Clear the cached token
   */
  clearToken(): void {
    // Reset the client credentials
    const emptyCredentials: AnthropicCredentials = {
      access_token: '',
      token_type: 'Bearer',
    };
    this.anthropicClient.setCredentials(emptyCredentials);
  }
}