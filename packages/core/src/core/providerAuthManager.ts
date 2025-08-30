/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from './contentGenerator.js';
import { debugLog } from '../utils/debugLog.js';

/**
 * Provider configuration interface
 */
export interface ProviderConfig {
  type: 'universal-gateway' | 'direct-api' | 'plan-based' | 'local';
  name: string;
  displayName: string;
  baseUrl?: string;
  authType: 'api-key' | 'oauth-personal' | 'none' | 'optional-key';
  apiKeyEnvVar?: string;
  models: Record<string, string>;  // nickname -> full model path
  features?: string[];
  rateLimits?: {
    weekly?: number;
    rolling?: number;
    windowHours?: number;
  };
  healthCheck?: string;
  autoDetect?: boolean;
}

/**
 * Session-based temporary authentication
 */
export interface SessionAuth {
  provider: string;
  credentials: AuthCredentials;
  expiry: number;
  isTemporary: boolean;
  sessionToken: string;
}

/**
 * Authentication credentials
 */
export interface AuthCredentials {
  apiKey?: string;
  baseUrl?: string;
  additionalHeaders?: Record<string, string>;
  oauthToken?: string;
}

/**
 * Provider status information
 */
export interface ProviderStatus {
  name: string;
  status: 'active' | 'available' | 'error' | 'rate-limited' | 'testing';
  rateLimits?: {
    remaining: number;
    resetTime: Date;
  };
  lastUsed?: Date;
  costToday?: number;
  modelsAvailable: number;
  isTemporarySession?: boolean;
}

/**
 * Multi-provider authentication manager
 * Handles complex authentication patterns across all AI providers
 */
export class ProviderAuthManager {
  private providers: Map<string, ProviderConfig> = new Map();
  private sessionCredentials: Map<string, SessionAuth> = new Map();
  private activeProvider: string | null = null;
  private activeSession: string | null = null;

  constructor() {
    this.initializeDefaultProviders();
  }

  /**
   * Initialize default provider configurations
   */
  private initializeDefaultProviders(): void {
    // OpenRouter - Universal gateway
    this.providers.set('openrouter', {
      type: 'universal-gateway',
      name: 'openrouter',
      displayName: 'OpenRouter (400+ Models)',
      baseUrl: 'https://openrouter.ai/api/v1',
      authType: 'api-key',
      apiKeyEnvVar: 'OPENROUTER_API_KEY',
      models: {
        'claude-sonnet-4': 'anthropic/claude-sonnet-4',
        'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
        'gpt-4': 'openai/gpt-4',
        'gpt-4-turbo': 'openai/gpt-4-turbo',
        'gemini-2.5-pro': 'google/gemini-2.5-pro-preview',
        'qwen3-32b': 'qwen/qwen3-32b:free',
        'qwen3-coder': 'qwen/qwen3-coder'
      },
      features: ['fallback-routing', 'usage-analytics', 'credit-limits']
    });

    // OpenAI Direct
    this.providers.set('openai', {
      type: 'direct-api',
      name: 'openai',
      displayName: 'OpenAI API Direct',
      baseUrl: 'https://api.openai.com/v1',
      authType: 'api-key',
      apiKeyEnvVar: 'OPENAI_API_KEY',
      models: {
        'gpt-4': 'gpt-4',
        'gpt-4-turbo': 'gpt-4-turbo',
        'gpt-3.5-turbo': 'gpt-3.5-turbo'
      }
    });

    // Anthropic Claude Code Max  
    this.providers.set('claude-code-max', {
      type: 'plan-based',
      name: 'claude-code-max',
      displayName: 'Claude Code Max Plan',
      authType: 'oauth-personal',  // Uses browser OAuth to Anthropic Console
      models: {
        'claude-sonnet-4': 'claude-sonnet-4',
        'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
        'claude-3.5-sonnet': 'claude-3.5-sonnet'
      },
      rateLimits: {
        weekly: 80,
        rolling: 225,
        windowHours: 5
      },
      features: ['plan-based', 'premium-models', 'browser-oauth']
    });

    // Gemini API
    this.providers.set('gemini', {
      type: 'direct-api',
      name: 'gemini',
      displayName: 'Google Gemini API',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      authType: 'api-key',
      apiKeyEnvVar: 'GEMINI_API_KEY',
      models: {
        'gemini-1.5-pro': 'gemini-1.5-pro',
        'gemini-2.0-flash': 'gemini-2.0-flash'
      }
    });

    // Qwen Direct
    this.providers.set('qwen-direct', {
      type: 'direct-api',
      name: 'qwen-direct',
      displayName: 'Qwen API Direct',
      baseUrl: 'https://qwen.ai/api/v1',
      authType: 'api-key',
      apiKeyEnvVar: 'QWEN_API_KEY',
      models: {
        'qwen3-32b': 'qwen3-32b-instruct',
        'qwen3-coder': 'qwen3-coder'
      },
      features: ['multilingual', 'coding-focused']
    });

    // Ollama Local
    this.providers.set('ollama', {
      type: 'local',
      name: 'ollama',
      displayName: 'Ollama Local Models',
      baseUrl: 'http://localhost:11434',
      authType: 'none',
      models: {
        'llama3.1': 'llama3.1',
        'qwen3-coder': 'qwen3-coder',
        'codellama': 'codellama'
      },
      autoDetect: true as boolean,
      healthCheck: '/api/tags'
    });

    // LM Studio Local
    this.providers.set('lmstudio', {
      type: 'local',
      name: 'lmstudio',
      displayName: 'LM Studio Local Models',
      baseUrl: 'http://localhost:1234/v1',
      authType: 'optional-key',
      models: {
        'local-model': 'local-model'
      },
      autoDetect: true as boolean,
      healthCheck: '/models'
    });

    // Claude Code Max (Anthropic OAuth)
    this.providers.set('claude-code-max', {
      type: 'plan-based',
      name: 'claude-code-max',
      displayName: 'Claude Code Max',
      baseUrl: 'https://api.anthropic.com/v1',
      authType: 'oauth-personal',
      models: {
        'claude-sonnet-4': 'claude-sonnet-4-20250514',
        'claude-opus': 'claude-3-opus-20240229',
        'claude-haiku': 'claude-3-haiku-20240307'
      },
      features: ['multimodal', 'coding-focused', 'large-context'],
      rateLimits: {
        weekly: 1000,
        rolling: 100,
        windowHours: 24
      }
    });

    debugLog('ProviderAuthManager - Initialized default providers:', Array.from(this.providers.keys()));
  }

  /**
   * Create temporary session for testing provider
   */
  async createTestSession(
    provider: string,
    credentials: AuthCredentials,
    duration: number = 1800  // 30 minutes default
  ): Promise<string> {
    if (!this.providers.has(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const sessionToken = this.generateSessionToken();
    const expiry = Date.now() + (duration * 1000);

    const sessionAuth: SessionAuth = {
      provider,
      credentials,
      expiry,
      isTemporary: true,
      sessionToken
    };

    this.sessionCredentials.set(sessionToken, sessionAuth);
    
    debugLog(`ProviderAuthManager - Created test session for ${provider}, expires in ${duration}s`);
    
    return sessionToken;
  }

  /**
   * Activate a test session
   */
  activateTestSession(sessionToken: string): boolean {
    const session = this.sessionCredentials.get(sessionToken);
    if (!session || Date.now() > session.expiry) {
      this.cleanupSession(sessionToken);
      return false;
    }

    this.activeSession = sessionToken;
    this.activeProvider = session.provider;
    
    debugLog(`ProviderAuthManager - Activated test session for ${session.provider}`);
    return true;
  }

  /**
   * Get active provider configuration
   */
  getActiveProvider(): ProviderConfig | null {
    if (this.activeSession) {
      const session = this.sessionCredentials.get(this.activeSession);
      if (session && Date.now() <= session.expiry) {
        return this.providers.get(session.provider) || null;
      } else {
        this.cleanupSession(this.activeSession);
      }
    }

    if (this.activeProvider) {
      return this.providers.get(this.activeProvider) || null;
    }

    return null;
  }

  /**
   * Get active provider credentials
   */
  getActiveCredentials(): AuthCredentials | null {
    if (this.activeSession) {
      const session = this.sessionCredentials.get(this.activeSession);
      if (session && Date.now() <= session.expiry) {
        return session.credentials;
      } else {
        this.cleanupSession(this.activeSession);
      }
    }

    // Fall back to environment variables for non-session auth
    const provider = this.getActiveProvider();
    if (provider && provider.apiKeyEnvVar) {
      const apiKey = process.env[provider.apiKeyEnvVar];
      if (apiKey) {
        return {
          apiKey,
          baseUrl: provider.baseUrl
        };
      }
    }

    return null;
  }

  /**
   * Set persistent active provider (non-session)
   */
  setActiveProvider(providerName: string): boolean {
    if (!this.providers.has(providerName)) {
      console.error(`Unknown provider: ${providerName}`);
      return false;
    }

    this.activeProvider = providerName;
    this.activeSession = null;  // Clear any test session
    
    debugLog(`ProviderAuthManager - Set active provider: ${providerName}`);
    return true;
  }

  /**
   * Get all available providers
   */
  getAllProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider status
   */
  getProviderStatus(providerName: string): ProviderStatus | null {
    const provider = this.providers.get(providerName);
    if (!provider) return null;

    const isActive = this.activeProvider === providerName;
    const isTestSession = this.activeSession && 
                          this.sessionCredentials.get(this.activeSession)?.provider === providerName;

    return {
      name: providerName,
      status: isActive ? 'active' : (isTestSession ? 'testing' : 'available'),
      modelsAvailable: Object.keys(provider.models).length,
      isTemporarySession: Boolean(isTestSession)
    };
  }

  /**
   * Clear test session
   */
  clearSession(sessionToken?: string): void {
    if (sessionToken) {
      this.cleanupSession(sessionToken);
    } else if (this.activeSession) {
      this.cleanupSession(this.activeSession);
    }
  }

  /**
   * Clear all expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [token, session] of this.sessionCredentials.entries()) {
      if (now > session.expiry) {
        this.cleanupSession(token);
      }
    }
  }

  /**
   * Get effective auth type for current provider
   */
  getEffectiveAuthType(fallback?: AuthType): AuthType | undefined {
    const provider = this.getActiveProvider();
    if (!provider) {
      console.log('🚨 ProviderAuthManager.getEffectiveAuthType: No active provider');
      return fallback;
    }

    // Get the provider ID from activeSession or activeProvider
    const providerId = this.activeSession ? 
      this.sessionCredentials.get(this.activeSession)?.provider : 
      this.activeProvider;

    console.log(`🔍 ProviderAuthManager.getEffectiveAuthType: Provider=${providerId}, AuthType=${provider.authType}`);

    switch (provider.authType) {
      case 'oauth-personal': 
        // Check if this is Claude/Anthropic - they use their own OAuth flow
        if (providerId === 'claude-code-max' || providerId === 'anthropic') {
          console.log(`✅ ProviderAuthManager.getEffectiveAuthType: Returning ANTHROPIC_OAUTH for ${providerId}`);
          return AuthType.ANTHROPIC_OAUTH;
        }
        // Other providers use Google OAuth
        console.log(`➡️  ProviderAuthManager.getEffectiveAuthType: Returning LOGIN_WITH_GOOGLE for ${providerId}`);
        return AuthType.LOGIN_WITH_GOOGLE;
      case 'api-key': 
        // Note: claude-code-max only uses OAuth, not API keys
        return AuthType.USE_OPENAI;  // Most providers use OpenAI-compatible format
      case 'none': return AuthType.USE_OPENAI;     // Local providers still use OpenAI format
      default: return fallback;
    }
  }

  /**
   * Generate session token
   */
  private generateSessionToken(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Cleanup session
   */
  private cleanupSession(sessionToken: string): void {
    if (this.activeSession === sessionToken) {
      this.activeSession = null;
    }
    this.sessionCredentials.delete(sessionToken);
    debugLog(`ProviderAuthManager - Cleaned up session: ${sessionToken}`);
  }

  /**
   * Debug info
   */
  getDebugInfo(): {
    activeProvider: string | null;
    activeSession: string | null;
    totalProviders: number;
    activeSessions: number;
  } {
    return {
      activeProvider: this.activeProvider,
      activeSession: this.activeSession,
      totalProviders: this.providers.size,
      activeSessions: this.sessionCredentials.size
    };
  }
}

/**
 * Convenience function to get provider auth manager instance
 */
let providerAuthManagerInstance: ProviderAuthManager | null = null;

export function getProviderAuthManager(): ProviderAuthManager {
  if (!providerAuthManagerInstance) {
    providerAuthManagerInstance = new ProviderAuthManager();
  }
  return providerAuthManagerInstance;
}