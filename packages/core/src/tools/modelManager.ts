/**
 * Professional Model Management System
 * 
 * Provides robust, minimal model switching with proper provider integration.
 * Designed to be upstream-compatible and easily maintainable.
 */

import { BaseDeclarativeTool, Kind, BaseToolInvocation, ToolResult } from './tools.js';
import { FunctionDeclaration } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Config } from '../config/config.js';
import { AuthType, createContentGeneratorConfig } from '../core/contentGenerator.js';
import { getModelOverrideManager } from '../core/modelOverrideManager.js';
import { getProviderAuthManager } from '../core/providerAuthManager.js';
import { debugLog } from '../utils/debugLog.js';

interface ModelProfile {
  nickname: string;
  displayName: string;
  model: string;
  provider: string;
  authType: AuthType;
  baseUrl?: string;
  description?: string;
  lastUsed: Date;
}

interface ModelSettings {
  models: ModelProfile[];
  current?: string;
  recentModels: string[]; // Array of nicknames in usage order (most recent first)
  usageStats: Record<string, { count: number; totalTimeMs: number; lastUsed: Date }>;
}

interface ModelManagerParams {
  action?: string;
  nickname?: string;
  model?: string;
  provider?: string;
  displayName?: string;
  description?: string;
}

const SETTINGS_FILE = join(homedir(), '.qwen', 'model-profiles.json');

// Global lock to prevent concurrent operations
let operationLock: Promise<any> | null = null;

// Provider-to-AuthType mapping
const PROVIDER_AUTH_MAP: Record<string, AuthType> = {
  'openai': AuthType.USE_OPENAI,
  'claude-code-max': AuthType.ANTHROPIC_OAUTH, // Uses Claude Code Max OAuth
  'openrouter': AuthType.USE_OPENAI, // OpenAI-compatible
  'gemini': AuthType.USE_GEMINI,
  'qwen-direct': AuthType.USE_OPENAI, // OpenAI-compatible
  'ollama': AuthType.USE_OPENAI, // OpenAI-compatible, no auth needed
  'lmstudio': AuthType.USE_OPENAI, // OpenAI-compatible, local
};

/**
 * Validate provider configuration and network connectivity with robust error handling
 */
async function validateProviderConfig(provider: string, baseUrl?: string, timeout = 5000): Promise<{ valid: boolean; error?: string; networkTested: boolean }> {
  try {
    
    switch (provider) {
      case 'ollama':
        if (!baseUrl) {
          return { valid: false, error: 'Ollama requires baseUrl', networkTested: false };
        }
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const response = await fetch(`${baseUrl}/api/tags`, { 
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            return { valid: true, networkTested: true };
          } else {
            return { 
              valid: false, 
              error: `Ollama server returned ${response.status}: ${response.statusText}`,
              networkTested: true
            };
          }
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            return { valid: false, error: `Connection timeout (>${timeout}ms)`, networkTested: true };
          }
          return { 
            valid: false, 
            error: `Network error: ${fetchError.message || 'Unknown'}`,
            networkTested: true
          };
        }
        
      case 'lmstudio':
        if (!baseUrl) {
          return { valid: false, error: 'LMStudio requires baseUrl', networkTested: false };
        }
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const response = await fetch(`${baseUrl}/v1/models`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            return { valid: true, networkTested: true };
          } else {
            return { 
              valid: false, 
              error: `LMStudio server returned ${response.status}: ${response.statusText}`,
              networkTested: true
            };
          }
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            return { valid: false, error: `Connection timeout (>${timeout}ms)`, networkTested: true };
          }
          return { 
            valid: false, 
            error: `Network error: ${fetchError.message || 'Unknown'}`,
            networkTested: true
          };
        }
        
      case 'openrouter':
        if (baseUrl && baseUrl.includes('openrouter.ai')) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            // Test OpenRouter connectivity with their API endpoint
            const response = await fetch(`${baseUrl}/api/v1/models`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            return { valid: response.ok || response.status === 401, networkTested: true }; // 401 means server is reachable
          } catch (fetchError: any) {
            if (fetchError.name === 'AbortError') {
              return { valid: false, error: `Connection timeout (>${timeout}ms)`, networkTested: true };
            }
            return { 
              valid: false, 
              error: `Network error: ${fetchError.message || 'Unknown'}`,
              networkTested: true
            };
          }
        }
        return { valid: true, networkTested: false }; // Skip validation if no specific URL
        
      case 'openai':
        // OpenAI validation - test connectivity to their API endpoint
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          return { valid: response.ok || response.status === 401, networkTested: true }; // 401 means server is reachable
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            return { valid: false, error: `OpenAI connection timeout (>${timeout}ms)`, networkTested: true };
          }
          return { 
            valid: false, 
            error: `OpenAI network error: ${fetchError.message || 'Unknown'}`,
            networkTested: true
          };
        }
        
      case 'anthropic':
      case 'claude-code-max':
      case 'claude-built-in':
        // Claude validation - test connectivity to Anthropic API
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [] }), // Invalid request, but tests connectivity
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          return { valid: response.status === 400 || response.status === 401, networkTested: true }; // 400/401 means server is reachable
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            return { valid: false, error: `Anthropic connection timeout (>${timeout}ms)`, networkTested: true };
          }
          return { 
            valid: false, 
            error: `Anthropic network error: ${fetchError.message || 'Unknown'}`,
            networkTested: true
          };
        }
        
      case 'gemini':
        // Gemini validation - test connectivity to Google AI API
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
            method: 'GET',
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          return { valid: response.ok || response.status === 401 || response.status === 403, networkTested: true }; // Auth errors mean server is reachable
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            return { valid: false, error: `Gemini connection timeout (>${timeout}ms)`, networkTested: true };
          }
          return { 
            valid: false, 
            error: `Gemini network error: ${fetchError.message || 'Unknown'}`,
            networkTested: true
          };
        }
        
      default:
        // For unknown providers, attempt basic connectivity test if baseUrl is provided
        if (baseUrl) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch(baseUrl, {
              method: 'HEAD',
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            return { valid: response.ok || response.status < 500, networkTested: true }; // Accept non-5xx errors
          } catch (fetchError: any) {
            if (fetchError.name === 'AbortError') {
              return { valid: false, error: `Connection timeout (>${timeout}ms)`, networkTested: true };
            }
            return { 
              valid: false, 
              error: `Network error: ${fetchError.message || 'Unknown'}`,
              networkTested: true
            };
          }
        }
        return { valid: true, networkTested: false }; // Allow custom providers without validation
    }
  } catch (error) {
    return { 
      valid: false, 
      error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      networkTested: false
    };
  }
}

/**
 * Auto-detect provider based on model name and configuration
 */
function detectProvider(model: string, baseUrl?: string): { provider: string; authType: AuthType } {
  // Claude models - use existing Claude Code authentication
  if (model.includes('claude') || model.includes('anthropic')) {
    return { provider: 'claude-built-in', authType: AuthType.USE_OPENAI };
  }
  
  // Gemini models
  if (model.includes('gemini')) {
    return { provider: 'gemini', authType: AuthType.USE_GEMINI };
  }
  
  // Local endpoints
  if (baseUrl?.includes('localhost') || baseUrl?.includes('127.0.0.1')) {
    if (baseUrl.includes('11434')) {
      return { provider: 'ollama', authType: AuthType.USE_OPENAI };
    }
    if (baseUrl.includes('1234')) {
      return { provider: 'lmstudio', authType: AuthType.USE_OPENAI };
    }
    return { provider: 'lmstudio', authType: AuthType.USE_OPENAI };
  }
  
  // OpenRouter
  if (baseUrl?.includes('openrouter.ai')) {
    return { provider: 'openrouter', authType: AuthType.USE_OPENAI };
  }
  
  // Qwen models
  if (model.includes('qwen')) {
    if (baseUrl?.includes('qwen.ai')) {
      return { provider: 'qwen-direct', authType: AuthType.USE_OPENAI };
    }
    return { provider: 'lmstudio', authType: AuthType.USE_OPENAI }; // Local Qwen
  }
  
  // Default to OpenAI-compatible
  return { provider: 'openai', authType: AuthType.USE_OPENAI };
}

// Global config reference
let globalConfigReference: Config | null = null;

export function setGlobalConfigReference(config: Config): void {
  globalConfigReference = config;
}

const modelManagerSchema: FunctionDeclaration = {
  name: 'model_manager',
  description: 'Professional model switching with automatic provider detection',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      action: { 
        type: 'string', 
        enum: ['list', 'add', 'switch', 'current', 'init', 'remove', 'recent'],
        description: 'Action to perform'
      },
      nickname: { 
        type: 'string',
        description: '1-5 character nickname for the model'
      },
      model: { 
        type: 'string',
        description: 'Full model identifier'
      },
      provider: { 
        type: 'string',
        description: 'Override provider detection'
      },
      displayName: { 
        type: 'string',
        description: 'Human-readable display name'
      },
      description: { 
        type: 'string',
        description: 'Model description'
      }
    }
  }
};

class ModelManagerInvocation extends BaseToolInvocation<ModelManagerParams, ToolResult> {
  
  getDescription(): string {
    const { action, nickname } = this.params;
    
    if (action === 'switch' || (nickname && !action)) {
      return `Switch to model "${nickname}"`;
    }
    if (action === 'add') {
      return `Add model profile "${nickname}"`;
    }
    if (action === 'current') {
      return 'Show current model';
    }
    
    return 'Manage model profiles';
  }

  /**
   * Load settings with corruption recovery and validation
   */
  private async loadSettings(): Promise<ModelSettings> {
    try {
      const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Ensure required fields exist for backward compatibility
      const settings = {
        models: Array.isArray(parsed.models) ? parsed.models : [],
        current: parsed.current,
        recentModels: Array.isArray(parsed.recentModels) ? parsed.recentModels : [],
        usageStats: typeof parsed.usageStats === 'object' ? parsed.usageStats : {}
      };
      
      // Validate and clean up settings
      this.validateAndCleanSettings(settings);
      
      return settings;
    } catch (error) {
      console.warn('Failed to load settings, attempting recovery:', error);
      return await this.recoverSettings();
    }
  }

  /**
   * Attempt to recover settings from backup or corrupted data
   */
  private async recoverSettings(): Promise<ModelSettings> {
    // Try to load from backup
    try {
      const backupFile = `${SETTINGS_FILE}.backup`;
      const data = await fs.readFile(backupFile, 'utf-8');
      const parsed = JSON.parse(data);
      console.log('✅ Recovered settings from backup');
      
      const settings = {
        models: Array.isArray(parsed.models) ? parsed.models : [],
        current: parsed.current,
        recentModels: Array.isArray(parsed.recentModels) ? parsed.recentModels : [],
        usageStats: typeof parsed.usageStats === 'object' ? parsed.usageStats : {}
      };
      
      this.validateAndCleanSettings(settings);
      return settings;
    } catch {
      console.warn('No backup available, starting with empty settings');
    }
    
    // Return empty settings as last resort
    return { models: [], recentModels: [], usageStats: {} };
  }

  /**
   * Validate and clean settings with automatic repair
   */
  private validateAndCleanSettings(settings: ModelSettings): void {
    // Ensure arrays are valid
    if (!Array.isArray(settings.models)) {
      settings.models = [];
    }
    if (!Array.isArray(settings.recentModels)) {
      settings.recentModels = [];
    }
    if (typeof settings.usageStats !== 'object' || settings.usageStats === null) {
      settings.usageStats = {};
    }
    
    // Validate and clean model profiles
    settings.models = settings.models.filter(model => {
      if (!model.nickname || typeof model.nickname !== 'string') {
        console.warn('Removing invalid model profile: missing nickname');
        return false;
      }
      if (!model.model || typeof model.model !== 'string') {
        console.warn(`Removing invalid model profile ${model.nickname}: missing model`);
        return false;
      }
      
      // Auto-repair missing fields
      if (!model.provider) {
        const detected = detectProvider(model.model, model.baseUrl);
        model.provider = detected.provider;
        console.warn(`Auto-repaired provider for ${model.nickname}: ${detected.provider}`);
      }
      if (!model.authType) {
        const detected = detectProvider(model.model, model.baseUrl);
        model.authType = detected.authType;
        console.warn(`Auto-repaired authType for ${model.nickname}: ${detected.authType}`);
      }
      if (!model.displayName) {
        model.displayName = this.generateDisplayName(model.model);
        console.warn(`Auto-repaired displayName for ${model.nickname}`);
      }
      if (!model.lastUsed) {
        model.lastUsed = new Date();
        console.warn(`Auto-repaired lastUsed for ${model.nickname}`);
      }
      
      return true;
    });
    
    // Clean up recent models - remove invalid references
    const validNicknames = new Set(settings.models.map(m => m.nickname));
    settings.recentModels = settings.recentModels.filter(nick => {
      if (!validNicknames.has(nick)) {
        console.warn(`Cleaning up invalid recent model: ${nick}`);
        return false;
      }
      return true;
    });
    
    // Clean up usage stats - remove orphaned entries
    for (const nick of Object.keys(settings.usageStats)) {
      if (!validNicknames.has(nick)) {
        console.warn(`Cleaning up orphaned usage stats: ${nick}`);
        delete settings.usageStats[nick];
      }
    }
  }

  private async saveSettings(settings: ModelSettings): Promise<void> {
    try {
      // Ensure directory exists with proper error handling
      await fs.mkdir(join(homedir(), '.qwen'), { recursive: true });
      
      // Validate settings before saving
      this.validateSettings(settings);
      
      // Create backup if file exists
      try {
        await fs.access(SETTINGS_FILE);
        const backup = `${SETTINGS_FILE}.backup`;
        await fs.copyFile(SETTINGS_FILE, backup);
      } catch {
        // File doesn't exist yet, no backup needed
      }
      
      // Write settings atomically
      const tmpFile = `${SETTINGS_FILE}.tmp`;
      await fs.writeFile(tmpFile, JSON.stringify(settings, null, 2));
      await fs.rename(tmpFile, SETTINGS_FILE);
      
    } catch (error) {
      throw new Error(`Failed to save model settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate settings structure for data integrity
   */
  private validateSettings(settings: ModelSettings): void {
    if (!settings.models || !Array.isArray(settings.models)) {
      throw new Error('Invalid settings: models must be an array');
    }
    
    if (!settings.recentModels || !Array.isArray(settings.recentModels)) {
      throw new Error('Invalid settings: recentModels must be an array');
    }
    
    if (!settings.usageStats || typeof settings.usageStats !== 'object') {
      throw new Error('Invalid settings: usageStats must be an object');
    }
    
    // Validate each model profile
    for (const model of settings.models) {
      if (!model.nickname || typeof model.nickname !== 'string') {
        throw new Error('Invalid model: nickname is required');
      }
      if (!model.model || typeof model.model !== 'string') {
        throw new Error('Invalid model: model is required');
      }
      if (!model.provider || typeof model.provider !== 'string') {
        throw new Error('Invalid model: provider is required');
      }
      if (!model.authType || typeof model.authType !== 'string') {
        throw new Error('Invalid model: authType is required');
      }
    }
    
    // Validate recent models reference existing models
    const validNicknames = new Set(settings.models.map(m => m.nickname));
    for (const recentNick of settings.recentModels) {
      if (!validNicknames.has(recentNick)) {
        console.warn(`Cleaning up invalid recent model reference: ${recentNick}`);
        // Remove invalid reference
        settings.recentModels = settings.recentModels.filter(n => n !== recentNick);
      }
    }
    
    // Clean up orphaned usage stats
    for (const statNick of Object.keys(settings.usageStats)) {
      if (!validNicknames.has(statNick)) {
        console.warn(`Cleaning up orphaned usage stats: ${statNick}`);
        delete settings.usageStats[statNick];
      }
    }
  }

  private detectCurrentEnvironment(): ModelProfile | null {
    const envModel = process.env.OPENAI_MODEL;
    const envBaseUrl = process.env.OPENAI_BASE_URL;
    
    if (!envModel) return null;
    
    const { provider, authType } = detectProvider(envModel, envBaseUrl);
    
    return {
      nickname: this.generateNickname(envModel),
      displayName: `Current: ${envModel}`,
      model: envModel,
      provider,
      authType,
      baseUrl: envBaseUrl,
      description: 'Auto-detected from environment',
      lastUsed: new Date()
    };
  }

  private generateNickname(model: string): string {
    if (model.includes('claude')) return 'claude';
    if (model.includes('qwen3-4b')) return '4bdev';
    if (model.includes('qwen3-30b')) return '30big';
    if (model.includes('gpt-4')) return 'gpt4';
    if (model.includes('gemini')) return 'gemini';
    
    return model.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5) || 'model';
  }

  /**
   * Add model to recent usage and update usage statistics
   */
  private updateModelUsage(settings: ModelSettings, nickname: string): void {
    const now = new Date();
    
    // Update usage statistics
    if (!settings.usageStats[nickname]) {
      settings.usageStats[nickname] = { count: 0, totalTimeMs: 0, lastUsed: now };
    }
    settings.usageStats[nickname].count += 1;
    settings.usageStats[nickname].lastUsed = now;
    
    // Update recent models list (keep last 5 unique models)
    const recentModels = settings.recentModels.filter(n => n !== nickname);
    recentModels.unshift(nickname);
    settings.recentModels = recentModels.slice(0, 5);
  }

  /**
   * Get smart model suggestions based on usage patterns
   */
  private getModelRecommendations(settings: ModelSettings): string[] {
    // Sort models by usage frequency and recency
    const scoredModels = settings.models.map(model => {
      const stats = settings.usageStats[model.nickname];
      const usage = stats ? stats.count : 0;
      const recency = stats ? (Date.now() - new Date(stats.lastUsed).getTime()) / (1000 * 60 * 60) : 9999; // Hours ago
      
      // Score formula: usage frequency - recency penalty
      const score = usage - (recency * 0.1);
      
      return { nickname: model.nickname, score, usage, recency };
    });
    
    return scoredModels
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(m => m.nickname);
  }

  /**
   * Generate automatic shortcuts based on usage patterns
   */
  private generateAutoShortcuts(settings: ModelSettings): string[] {
    const shortcuts: string[] = [];
    
    // Recent models (last 3)
    shortcuts.push(...settings.recentModels.slice(0, 3));
    
    // Most used models not already in recent
    const recommendations = this.getModelRecommendations(settings);
    for (const rec of recommendations) {
      if (!shortcuts.includes(rec) && shortcuts.length < 5) {
        shortcuts.push(rec);
      }
    }
    
    return shortcuts;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    // Prevent concurrent operations to avoid data corruption
    if (operationLock) {
      await operationLock;
    }
    
    const operation = this.executeInternal(signal);
    operationLock = operation;
    
    try {
      return await operation;
    } finally {
      operationLock = null;
    }
  }

  private async executeInternal(signal: AbortSignal): Promise<ToolResult> {
    const { action, nickname, model, provider, displayName, description } = this.params;
    
    // Determine effective action
    let effectiveAction = action;
    if (nickname && !action) {
      effectiveAction = 'switch';
    } else if (!action) {
      effectiveAction = 'list';
    }

    const settings = await this.loadSettings();

    try {
      let resultText = '';

      switch (effectiveAction) {
        case 'init': {
          const currentEnv = this.detectCurrentEnvironment();
          if (!currentEnv) {
            resultText = '❌ No model configuration detected in environment.\nSet OPENAI_MODEL and optionally OPENAI_BASE_URL first.';
          } else {
            settings.models.push(currentEnv);
            settings.current = currentEnv.nickname;
            await this.saveSettings(settings);
            resultText = `✅ Auto-detected model "${currentEnv.nickname}"\n` +
                        `   Model: ${currentEnv.model}\n` +
                        `   Provider: ${currentEnv.provider}\n` +
                        (currentEnv.baseUrl ? `   Endpoint: ${currentEnv.baseUrl}\n` : '');
          }
          break;
        }

        case 'current': {
          const currentModel = process.env.OPENAI_MODEL;
          const currentProfile = settings.models.find(m => m.model === currentModel);
          
          if (currentProfile) {
            resultText = `Current: ${currentProfile.displayName}\n` +
                        `   Model: ${currentProfile.model}\n` +
                        `   Provider: ${currentProfile.provider}\n` +
                        (currentProfile.baseUrl ? `   Endpoint: ${currentProfile.baseUrl}` : '');
          } else {
            resultText = `Current model: ${currentModel || 'none'}\n(No profile configured - use /model init)`;
          }
          break;
        }

        case 'list': {
          if (settings.models.length === 0) {
            resultText = 'No model profiles configured.\n\n' +
                        'Use `/model init` to auto-detect current environment.';
          } else {
            const currentModel = process.env.OPENAI_MODEL;
            const autoShortcuts = this.generateAutoShortcuts(settings);
            
            resultText = 'Model Profiles:\n' + '='.repeat(60) + '\n';
            
            // Show recent/recommended models first
            if (autoShortcuts.length > 0) {
              resultText += '🚀 QUICK ACCESS (Recent & Recommended):\n';
              autoShortcuts.forEach((nickname, index) => {
                const profile = settings.models.find(m => m.nickname === nickname);
                if (profile) {
                  const isCurrent = profile.model === currentModel;
                  const indicator = isCurrent ? '→ ' : '  ';
                  const stats = settings.usageStats[nickname];
                  const usageInfo = stats ? ` (${stats.count}×)` : '';
                  
                  resultText += `${indicator}${(index + 1)}. ${nickname.padEnd(8)} ${profile.displayName.padEnd(20)}${usageInfo}\n`;
                }
              });
              
              resultText += '\n📋 ALL MODELS:\n';
            }
            
            // Show all models
            settings.models.forEach(profile => {
              const isCurrent = profile.model === currentModel;
              const indicator = isCurrent ? '→ ' : '  ';
              const stats = settings.usageStats[profile.nickname];
              const usageInfo = stats ? ` (${stats.count}× used)` : '';
              
              resultText += `${indicator}${profile.nickname.padEnd(8)} ${profile.displayName.padEnd(25)} (${profile.provider})${usageInfo}\n`;
            });
            
            if (settings.recentModels.length > 0) {
              resultText += `\n💫 Recent: ${settings.recentModels.slice(0, 3).join(', ')}`;
            }
            
            resultText += '\nUse `/model <nickname>` or `/model recent` to switch.';
          }
          break;
        }

        case 'add': {
          if (!nickname || !model) {
            resultText = '❌ Usage: /model add <nickname> <model> [provider]';
          } else if (!/^[a-zA-Z0-9]{1,6}$/.test(nickname)) {
            resultText = '❌ Nickname must be 1-6 alphanumeric characters.';
          } else if (settings.models.some(m => m.nickname === nickname)) {
            resultText = `❌ Nickname "${nickname}" already exists.`;
          } else {
            const detectedProvider = detectProvider(model, process.env.OPENAI_BASE_URL);
            const finalProvider = provider || detectedProvider.provider;
            
            // Validate provider configuration before adding
            const validation = await validateProviderConfig(finalProvider, process.env.OPENAI_BASE_URL);
            
            const newProfile: ModelProfile = {
              nickname,
              displayName: displayName || this.generateDisplayName(model),
              model,
              provider: finalProvider,
              authType: PROVIDER_AUTH_MAP[finalProvider] || AuthType.USE_OPENAI,
              baseUrl: process.env.OPENAI_BASE_URL,
              description: description || `${finalProvider} model`,
              lastUsed: new Date()
            };

            settings.models.push(newProfile);
            await this.saveSettings(settings);
            
            let validationInfo = '';
            if (validation.networkTested) {
              if (validation.valid) {
                validationInfo = '\n   ✅ Network connectivity verified';
              } else {
                validationInfo = `\n   ⚠️  Network validation failed: ${validation.error}`;
              }
            }
            
            resultText = `✅ Added "${nickname}": ${newProfile.displayName}\n` +
                        `   Provider: ${finalProvider}${validationInfo}`;
          }
          break;
        }

        case 'recent': {
          if (settings.recentModels.length === 0) {
            resultText = '❌ No recent models. Use `/model list` to see available models.';
          } else {
            const recentList = settings.recentModels.slice(0, 5).map((nick, index) => {
              const profile = settings.models.find(m => m.nickname === nick);
              const stats = settings.usageStats[nick];
              const usageInfo = stats ? ` (${stats.count}× used)` : '';
              return `  ${index + 1}. ${nick} - ${profile?.displayName || 'Unknown'}${usageInfo}`;
            }).join('\n');
            
            resultText = `💫 Recent Models:\n${recentList}\n\nUse \`/model <nickname>\` to switch.`;
          }
          break;
        }

        case 'switch': {
          const targetNickname = nickname || this.params.action;
          console.log(`🎯 ModelManager - Switching to: ${targetNickname}`);
          
          if (!targetNickname) {
            resultText = '❌ No model specified. Use /model list to see available models.';
            break;
          }
          
          // Handle special shortcuts like "recent" as numbers
          let actualNickname = targetNickname;
          if (targetNickname && /^[1-5]$/.test(targetNickname) && settings.recentModels.length > 0) {
            const index = parseInt(targetNickname) - 1;
            if (index < settings.recentModels.length) {
              actualNickname = settings.recentModels[index];
            }
          }
          
          const found = settings.models.find(m => m.nickname === actualNickname);
          
          if (!found) {
            resultText = `❌ Model "${actualNickname}" not found. Use /model list to see available models.`;
          } else {
            console.log(`✅ ModelManager - Found model: ${found.displayName}, Provider: ${found.provider}, AuthType: ${found.authType}`);
            
            // Pre-flight validation for critical providers
            if (['ollama', 'lmstudio'].includes(found.provider) && found.baseUrl) {
              console.log(`🔍 ModelManager - Pre-flight validation for ${found.provider}`);
              const validation = await validateProviderConfig(found.provider, found.baseUrl, 3000); // Quick 3s timeout
              
              if (validation.networkTested && !validation.valid) {
                resultText = `❌ Cannot switch to ${found.displayName}: ${validation.error}\n` +
                            `   Check if ${found.provider} is running at ${found.baseUrl}`;
                break;
              }
            }
            
            // Update environment variables with safe fallbacks
            const previousModel = process.env.OPENAI_MODEL;
            const previousBaseUrl = process.env.OPENAI_BASE_URL;
            
            try {
              process.env.OPENAI_MODEL = found.model;
              if (found.baseUrl) {
                process.env.OPENAI_BASE_URL = found.baseUrl;
              } else {
                // Clear base URL for providers that don't use custom endpoints
                delete process.env.OPENAI_BASE_URL;
              }
              
              // Use ModelOverrideManager and provider system with error handling
              const modelOverrideManager = getModelOverrideManager();
              const providerManager = getProviderAuthManager();
              
              // Set active provider with validation
              console.log(`🔄 ModelManager - Setting active provider: ${found.provider}`);
              const providerSet = providerManager.setActiveProvider(found.provider);
              console.log(`🔄 ModelManager - Provider set result: ${providerSet}`);
              
              if (!providerSet) {
                throw new Error(`Failed to set provider: ${found.provider}`);
              }
              
              // Set runtime model
              console.log(`🔄 ModelManager - Setting runtime model: ${found.model}`);
              modelOverrideManager.setRuntimeModel(found.model);
              
              
              if (globalConfigReference) {
                try {
                  // Update config with validation
                  globalConfigReference.setModel(found.model);
                  globalConfigReference.setRuntimeModel(found.model);
                  
                  // Get the resolved AuthType from the provider system
                  const resolvedAuthType = providerManager.getEffectiveAuthType();


                  
                  // Create new ContentGeneratorConfig with provider-resolved auth
                  const newContentGeneratorConfig = createContentGeneratorConfig(
                    globalConfigReference, 
                    resolvedAuthType || found.authType  // Use resolved AuthType, fallback to profile authType
                  );
                  
                  // Force GeminiClient complete reset to clear any streaming state
                  const geminiClient = globalConfigReference.getGeminiClient();
                  if (geminiClient) {
                    // First, clear any existing state
                    await geminiClient.initialize(newContentGeneratorConfig);
                    
                    // Force a complete client reset by triggering refreshAuth
                    // This ensures streaming state is completely cleared
                    debugLog('Forcing complete client reset to clear streaming state');
                    await globalConfigReference.refreshAuth(resolvedAuthType || found.authType);
                  }
                  
                  // Update config reference
                  (globalConfigReference as any).contentGeneratorConfig = newContentGeneratorConfig;
                } catch (configError) {
                  debugLog('Error updating config:', configError);
                  throw new Error(`Configuration update failed: ${configError instanceof Error ? configError.message : 'Unknown'}`);
                }
              }
              
              // Update settings and usage tracking
              settings.current = actualNickname;
              found.lastUsed = new Date();
              if (actualNickname) {
                this.updateModelUsage(settings, actualNickname);
              }
              await this.saveSettings(settings);
              
              resultText = `✅ Switched to: ${found.displayName}\n` +
                          `   Provider: ${found.provider}\n` +
                          `   Model: ${found.model}`;
                          
            } catch (switchError) {
              // Rollback environment variables on failure
              if (previousModel) {
                process.env.OPENAI_MODEL = previousModel;
              }
              if (previousBaseUrl) {
                process.env.OPENAI_BASE_URL = previousBaseUrl;
              } else {
                delete process.env.OPENAI_BASE_URL;
              }
              
              const errorMessage = switchError instanceof Error ? switchError.message : 'Unknown error';
              resultText = `❌ Failed to switch to ${found.displayName}: ${errorMessage}\n` +
                          `   Environment restored to previous state`;
              debugLog('Model switch failed, environment rolled back:', switchError);
            }
          }
          break;
        }

        case 'remove': {
          if (!nickname) {
            resultText = '❌ Usage: /model remove <nickname>';
          } else {
            const index = settings.models.findIndex(m => m.nickname === nickname);
            if (index === -1) {
              resultText = `❌ Model "${nickname}" not found.`;
            } else {
              const removed = settings.models.splice(index, 1)[0];
              await this.saveSettings(settings);
              resultText = `✅ Removed model "${nickname}": ${removed.displayName}`;
            }
          }
          break;
        }

        default: {
          resultText = this.getUsageHelp();
          break;
        }
      }

      return {
        llmContent: JSON.stringify({
          success: true,
          action: effectiveAction,
          result: resultText
        }),
        returnDisplay: resultText,
      };

    } catch (error) {
      const errorMessage = `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return {
        llmContent: JSON.stringify({
          success: false,
          error: errorMessage,
          action: effectiveAction
        }),
        returnDisplay: errorMessage,
      };
    }
  }

  private generateDisplayName(model: string): string {
    if (model.includes('claude')) return 'Anthropic Claude';
    if (model.includes('qwen3-4b')) return 'Local 4B Development';
    if (model.includes('qwen3-30b')) return 'Local 30B Complex';
    if (model.includes('gpt-4')) return 'GPT-4 OpenAI';
    if (model.includes('gemini')) return 'Google Gemini';
    
    return model.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private getUsageHelp(): string {
    return `Model Manager Usage:

/model                     - List configured models with smart shortcuts
/model <nickname>          - Switch to model by nickname  
/model 1-5                 - Quick switch to recent model by number
/model init                - Auto-detect current environment
/model recent              - Show recent models with numbered shortcuts
/model add <nickname> <model> [provider] - Add new model
/model remove <nickname>   - Remove model
/model current             - Show current model

Examples:
  /model init                    # Auto-detect setup
  /model add claude claude-sonnet-4 anthropic  # Add Claude
  /model add 4bdev qwen3-4b http://localhost:11434  # Add local model
  /model claude                  # Switch to Claude
  /model 1                       # Switch to most recent model
  /model recent                  # Show recent with shortcuts`;
  }
}

export class ModelManagerTool extends BaseDeclarativeTool<ModelManagerParams, ToolResult> {
  static readonly Name: string = modelManagerSchema.name!;

  constructor() {
    super(
      ModelManagerTool.Name,
      'Model Manager',
      'Professional model switching with automatic provider detection',
      Kind.Edit,
      modelManagerSchema.parametersJsonSchema as Record<string, unknown>,
    );
  }

  override validateToolParams(params: ModelManagerParams): string | null {
    const errors = SchemaValidator.validate(
      this.schema.parametersJsonSchema,
      params,
    );
    if (errors) {
      return errors;
    }

    if (params.action === 'add' && (!params.nickname || !params.model)) {
      return 'Action "add" requires both nickname and model parameters';
    }
    
    if (params.nickname && !/^[a-zA-Z0-9]{1,6}$/.test(params.nickname)) {
      return 'Nickname must be 1-6 alphanumeric characters';
    }

    return null;
  }

  protected createInvocation(params: ModelManagerParams) {
    return new ModelManagerInvocation(params);
  }
}