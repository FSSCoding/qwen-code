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
        enum: ['list', 'add', 'switch', 'current', 'init', 'remove'],
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

  private async loadSettings(): Promise<ModelSettings> {
    try {
      const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return { models: [] };
    }
  }

  private async saveSettings(settings: ModelSettings): Promise<void> {
    await fs.mkdir(join(homedir(), '.qwen'), { recursive: true });
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
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

  async execute(signal: AbortSignal): Promise<ToolResult> {
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
            resultText = 'Model Profiles:\n' + '='.repeat(50) + '\n';
            
            settings.models.forEach(profile => {
              const isCurrent = profile.model === currentModel;
              const indicator = isCurrent ? '→ ' : '  ';
              resultText += `${indicator}${profile.nickname.padEnd(8)} ${profile.displayName.padEnd(25)} (${profile.provider})\n`;
            });
            
            resultText += '\nUse `/model <nickname>` to switch.';
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
            
            resultText = `✅ Added "${nickname}": ${newProfile.displayName}\n` +
                        `   Provider: ${finalProvider}`;
          }
          break;
        }

        case 'switch': {
          const targetNickname = nickname || this.params.action;
          console.log(`🎯 ModelManager - Switching to: ${targetNickname}`);
          const found = settings.models.find(m => m.nickname === targetNickname);
          
          if (!found) {
            resultText = `❌ Model "${targetNickname}" not found. Use /model list to see available models.`;
          } else {
            console.log(`✅ ModelManager - Found model: ${found.displayName}, Provider: ${found.provider}, AuthType: ${found.authType}`);
            // Update environment variables
            process.env.OPENAI_MODEL = found.model;
            if (found.baseUrl) {
              process.env.OPENAI_BASE_URL = found.baseUrl;
            } else {
              // Clear base URL for providers that don't use custom endpoints
              delete process.env.OPENAI_BASE_URL;
            }
            
            // Use ModelOverrideManager and provider system
            const modelOverrideManager = getModelOverrideManager();
            const providerManager = getProviderAuthManager();
            
            // Set active provider
            console.log(`🔄 ModelManager - Setting active provider: ${found.provider}`);
            const providerSet = providerManager.setActiveProvider(found.provider);
            console.log(`🔄 ModelManager - Provider set result: ${providerSet}`);
            
            // Set runtime model
            console.log(`🔄 ModelManager - Setting runtime model: ${found.model}`);
            modelOverrideManager.setRuntimeModel(found.model);
            
            
            if (globalConfigReference) {
              try {
                // Update config
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
              } catch (error) {
                debugLog('Error updating config:', error);
              }
            }
            
            // Update settings
            settings.current = targetNickname;
            found.lastUsed = new Date();
            await this.saveSettings(settings);
            
            resultText = `✅ Switched to: ${found.displayName}\n` +
                        `   Provider: ${found.provider}\n` +
                        `   Model: ${found.model}`;
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

/model                     - List configured models
/model <nickname>          - Switch to model by nickname  
/model init               - Auto-detect current environment
/model add <nickname> <model> [provider] - Add new model
/model remove <nickname>  - Remove model
/model current            - Show current model

Examples:
  /model init
  /model add claude claude-sonnet-4 anthropic
  /model claude
  /model list`;
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