/**
 * @license
 * Copyright 2025 Anthropic
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as os from 'os';
import { Config } from '../config/config.js';

// OAuth Configuration - Hybrid approach using official Claude CLI tokens
const CLAUDE_DIR = '.claude';
const OFFICIAL_CLAUDE_CREDENTIALS_FILE = '.credentials.json';

// Token Configuration
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000; // 30 seconds

/**
 * Anthropic OAuth2 credentials interface
 */
export interface AnthropicCredentials {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_at?: number;
  scope?: string;
}

/**
 * Interface for Anthropic OAuth2 client
 */
export interface IAnthropicOAuth2Client {
  getAccessToken(): Promise<{ token?: string }>;
  setCredentials(credentials: AnthropicCredentials): void;
  getCredentials(): AnthropicCredentials;
}

/**
 * Load credentials from official Claude CLI
 */
async function loadOfficialClaudeCredentials(): Promise<AnthropicCredentials | null> {
  try {
    const filePath = path.join(os.homedir(), CLAUDE_DIR, OFFICIAL_CLAUDE_CREDENTIALS_FILE);
    console.log('🔍 CLAUDE DEBUG: Looking for credentials at:', filePath);
    
    const content = await fs.readFile(filePath, 'utf-8');
    console.log('🔍 CLAUDE DEBUG: Credentials file size:', content.length, 'bytes');
    
    const data = JSON.parse(content);
    console.log('🔍 CLAUDE DEBUG: Parsed credentials keys:', Object.keys(data));
    console.log('🔍 CLAUDE DEBUG: Has claudeAiOauth?', !!data.claudeAiOauth);
    console.log('🔍 CLAUDE DEBUG: Has accessToken?', !!data.claudeAiOauth?.accessToken);
    
    // Transform official Claude CLI credentials format to our format
    // Official format: { "claudeAiOauth": { "accessToken": "...", "refreshToken": "...", "expiresAt": 123456789 } }
    if (data.claudeAiOauth && data.claudeAiOauth.accessToken) {
      const claudeCreds = data.claudeAiOauth;
      const credentials = {
        access_token: claudeCreds.accessToken,
        refresh_token: claudeCreds.refreshToken,
        token_type: 'Bearer', // Claude uses Bearer tokens
        expires_at: claudeCreds.expiresAt,
        scope: claudeCreds.scopes ? claudeCreds.scopes.join(' ') : 'user:inference user:profile',
      };
      console.log('🔍 CLAUDE DEBUG: Transformed Claude CLI credentials:', {
        has_access_token: !!credentials.access_token,
        has_refresh_token: !!credentials.refresh_token,
        token_type: credentials.token_type,
        expires_at: credentials.expires_at,
        scope: credentials.scope,
        subscription_type: claudeCreds.subscriptionType
      });
      return credentials;
    }
    console.log('❌ CLAUDE DEBUG: No claudeAiOauth.accessToken found in credentials file');
    return null;
  } catch (error) {
    console.log('❌ CLAUDE DEBUG: Error loading credentials:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Check if token is expired
 */
function isTokenExpired(credentials: AnthropicCredentials): boolean {
  if (!credentials.expires_at) {
    return false; // No expiry info, assume valid
  }
  return Date.now() > credentials.expires_at - TOKEN_REFRESH_BUFFER_MS;
}

/**
 * Anthropic OAuth2 Client implementation
 * Uses hybrid approach: prefers official Claude CLI tokens
 */
export class AnthropicOAuth2Client implements IAnthropicOAuth2Client {
  private credentials: AnthropicCredentials = {
    access_token: '',
    token_type: 'Bearer',
  };

  constructor() {}

  /**
   * Set OAuth credentials
   */
  setCredentials(credentials: AnthropicCredentials): void {
    this.credentials = { ...credentials };
  }

  /**
   * Get current OAuth credentials
   */
  getCredentials(): AnthropicCredentials {
    return { ...this.credentials };
  }

  /**
   * Get current access token
   */
  async getAccessToken(): Promise<{ token?: string }> {
    if (!this.credentials.access_token) {
      return { token: undefined };
    }

    // Check if token is expired
    if (this.credentials.expires_at && Date.now() > this.credentials.expires_at - TOKEN_REFRESH_BUFFER_MS) {
      console.warn('⚠️  Claude token may be expired. Please run "claude login" to refresh.');
      // For now, still return the token - let the API call fail if needed
      // In the future, we could implement refresh logic
    }

    return { token: this.credentials.access_token };
  }
}

/**
 * Main entry point for Anthropic OAuth authentication
 * Returns an IAnthropicOAuth2Client that can be used for token management
 */
export async function getAnthropicOAuthClient(config: Config): Promise<IAnthropicOAuth2Client> {
  const client = new AnthropicOAuth2Client();

  // Check for existing credentials from official Claude CLI
  console.log('🔍 CLAUDE DEBUG: Checking for official Claude CLI credentials...');
  const officialCreds = await loadOfficialClaudeCredentials();
  console.log('🔍 CLAUDE DEBUG: Official creds loaded:', !!officialCreds);
  
  if (officialCreds) {
    const expired = isTokenExpired(officialCreds);
    console.log('🔍 CLAUDE DEBUG: Token expired?', expired);
    console.log('🔍 CLAUDE DEBUG: Token expires at:', officialCreds.expires_at);
    console.log('🔍 CLAUDE DEBUG: Current time:', Date.now());
    
    if (!expired) {
      console.log('✅ Using credentials from official Claude CLI');
      client.setCredentials(officialCreds);
      return client;
    } else {
      console.log('⚠️  CLAUDE DEBUG: Token is expired, will request new authentication');
    }
  } else {
    console.log('⚠️  CLAUDE DEBUG: No official Claude CLI credentials found');
  }

  // No valid credentials found - guide user to use official Claude CLI
  console.log('\n🔐 Claude Code Max Authentication Required');
  console.log('==========================================');
  console.log('');
  console.log('To use Claude Code Max with QwenCode, please authenticate using the official Claude CLI:');
  console.log('');
  console.log('📋 Steps:');
  console.log('1. Install Claude CLI: npm install -g @anthropics/claude');
  console.log('2. Authenticate: claude login');
  console.log('3. Select your Claude Code Max subscription when prompted');
  console.log('4. Return here and run your command again');
  console.log('');
  console.log('💡 This uses the same login as claude.ai website');
  console.log('🔒 No API keys needed - just your regular Claude account');
  console.log('');
  
  throw new Error('Claude Code Max authentication required. Please run "claude login" first.');
}