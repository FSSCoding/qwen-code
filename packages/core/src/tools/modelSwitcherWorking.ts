/**
 * @license
 * Copyright 2025 FSS Enhanced
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, Kind, BaseToolInvocation, ToolResult } from './tools.js';
import { FunctionDeclaration } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface ModelConfig {
  nickname: string;
  displayName: string;
  model: string;
  baseUrl?: string;
  description?: string;
  lastUsed: Date;
}

interface ModelSettings {
  models: ModelConfig[];
  current?: string;
}

interface ModelSwitcherParams {
  action?: string;
  nickname?: string;
  model?: string;
  displayName?: string;
  baseUrl?: string;
  description?: string;
}

const SETTINGS_FILE = join(homedir(), '.qwen', 'models.json');

const modelSwitcherSchemaData: FunctionDeclaration = {
  name: 'model_switcher_ecosystem',
  description: 'Lightning-fast model switching integrated with QwenCode',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      action: { 
        type: 'string', 
        enum: ['list', 'add', 'switch', 'current', 'init'],
        description: 'Action to perform: list models, add new model, switch to model, show current, or init from environment'
      },
      nickname: { 
        type: 'string',
        description: '1-6 character nickname for the model (e.g., claude, 4bdev, 30big)'
      },
      model: { 
        type: 'string',
        description: 'Full model identifier (e.g., qwen/qwen3-4b-2507)'
      },
      displayName: { 
        type: 'string',
        description: 'Human-readable display name for the model'
      },
      baseUrl: { 
        type: 'string',
        description: 'API endpoint URL for the model'
      },
      description: { 
        type: 'string',
        description: 'Brief description of model capabilities'
      }
    }
  }
};

const modelSwitcherDescription = `
Lightning-fast model switching integrated with QwenCode.

This tool allows you to:
- Switch between models using 6-character nicknames (e.g., claude, 4bdev, 30big)
- Auto-detect current environment settings
- Store model configurations with endpoints
- Maintain recently used model history
- Support both local and remote model endpoints

Commands:
- /model - Show current model and list available models
- /model init - Auto-detect and save current environment
- /model add <nickname> <model> [baseUrl] - Add new model configuration
- /model <nickname> - Switch to model by nickname
- /model list - Show all configured models
- /model current - Show currently active model

Examples:
- /model init (auto-detects OPENAI_MODEL from environment)
- /model add 4bdev qwen/qwen3-4b-2507 http://localhost:11434
- /model add claude claude-3-5-sonnet-20241022 https://api.anthropic.com
- /model 4bdev (switches to 4B development model)
- /model 30big (switches to 30B complex reasoning model)
- /model claude (switches to Claude - the master of it all!)
`;

class ModelSwitcherInvocation extends BaseToolInvocation<ModelSwitcherParams, ToolResult> {
  
  getDescription(): string {
    const { action, nickname, model } = this.params;
    
    if (action === 'init') {
      return 'Auto-detect current model environment';
    }
    if (action === 'add' && nickname && model) {
      return `Add model profile "${nickname}" for ${model}`;
    }
    if (action === 'switch' && nickname) {
      return `Switch to model profile "${nickname}"`;
    }
    if (nickname && (!action || action === nickname)) {
      return `Switch to model profile "${nickname}"`;
    }
    if (action === 'current') {
      return 'Show current active model';
    }
    
    return 'List available model profiles';
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

  private detectCurrentEnvironment(): ModelConfig | null {
    const envModel = process.env.OPENAI_MODEL;
    const envBaseUrl = process.env.OPENAI_BASE_URL;
    
    if (!envModel) return null;
    
    // Generate nickname from model name
    const nickname = this.generateNickname(envModel);
    
    return {
      nickname,
      displayName: `Current: ${envModel}`,
      model: envModel,
      baseUrl: envBaseUrl,
      description: 'Auto-detected from environment',
      lastUsed: new Date()
    };
  }

  private generateNickname(model: string): string {
    if (model.includes('qwen3-4b')) return '4bdev';
    if (model.includes('qwen3-30b')) return '30big';
    if (model.includes('gpt-4')) return 'gpt4o';
    if (model.includes('claude')) return 'claude';
    
    return model.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5) || 'model';
  }

  private generateDisplayName(model: string): string {
    if (model.includes('qwen3-4b')) return 'Local 4B Development';
    if (model.includes('qwen3-30b')) return 'Local 30B Complex';
    if (model.includes('gpt-4')) return 'GPT-4 OpenAI';
    if (model.includes('claude')) return 'Anthropic Claude';
    
    return model.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private generateDescription(model: string, baseUrl?: string): string {
    if (model.includes('qwen3-4b')) return '120+ t/s, 190k context';
    if (model.includes('qwen3-30b')) return '131k context, complex reasoning';
    if (baseUrl?.includes('localhost')) return 'Local endpoint';
    if (baseUrl?.includes('openai.com')) return 'OpenAI API';
    return 'Cloud API';
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const { action, nickname, model, displayName, baseUrl, description } = this.params;
    
    // Determine the actual action
    let effectiveAction: string;
    if (nickname && (!action || action === nickname)) {
      // If nickname is provided without action, or action matches nickname, it's a switch
      effectiveAction = 'switch';
    } else if (action) {
      effectiveAction = action;
    } else {
      effectiveAction = 'list';
    }
    const settings = await this.loadSettings();

    try {
      let resultText = '';

      switch (effectiveAction) {
        case 'init': {
          const currentEnv = this.detectCurrentEnvironment();
          if (!currentEnv) {
            resultText = '❌ No model configuration detected in environment variables.\n' +
                        'Set OPENAI_MODEL and optionally OPENAI_BASE_URL first.';
          } else {
            settings.models.push(currentEnv);
            settings.current = currentEnv.nickname;
            await this.saveSettings(settings);
            resultText = `✅ Auto-detected and saved current environment as "${currentEnv.nickname}":\n` +
                        `   Model: ${currentEnv.model}\n` +
                        (currentEnv.baseUrl ? `   Endpoint: ${currentEnv.baseUrl}\n` : '') +
                        `\nUse /model add to configure additional models.`;
          }
          break;
        }

        case 'current': {
          const currentModel = process.env.OPENAI_MODEL;
          const currentProfile = settings.models.find(m => m.model === currentModel);
          
          resultText = currentProfile 
            ? `Current: ${currentProfile.displayName} (${currentProfile.nickname})\n` +
              `Model: ${currentProfile.model}\n` +
              (currentProfile.baseUrl ? `Endpoint: ${currentProfile.baseUrl}\n` : '')
            : `Current model: ${currentModel}\n(No profile configured - use /model init to auto-detect)`;
          break;
        }

        case 'list': {
          if (settings.models.length === 0) {
            resultText = 'No model profiles configured.\n\n' +
                        'Use `/model init` to auto-detect current environment, or\n' +
                        'Use `/model add <nickname> <model> [baseUrl]` to add manually.\n\n' +
                        'Examples: /model add 4bdev qwen/qwen3-4b-2507 http://localhost:11434\n' +
                        '         /model add claude claude-3-5-sonnet https://api.anthropic.com';
          } else {
            const currentModel = process.env.OPENAI_MODEL;
            resultText = 'Model Profiles:\n' + '='.repeat(50) + '\n';
            
            settings.models.forEach(profile => {
              const isCurrent = profile.model === currentModel;
              const indicator = isCurrent ? '→ ' : '  ';
              resultText += `${indicator}${profile.nickname.padEnd(6)} ${profile.displayName.padEnd(25)} ${profile.description || ''}\n`;
            });
            
            resultText += '\nUse `/model <nickname>` to switch directly.';
          }
          break;
        }

        case 'add': {
          if (!nickname || !model) {
            resultText = '❌ Usage: /model add <nickname> <model> [displayName] [baseUrl]';
          } else if (!/^[a-zA-Z0-9]{1,6}$/.test(nickname)) {
            resultText = '❌ Nickname must be 1-6 alphanumeric characters only.';
          } else if (settings.models.some(m => m.nickname === nickname)) {
            resultText = `❌ Nickname "${nickname}" already exists. Choose a different nickname.`;
          } else {
            const newProfile: ModelConfig = {
              nickname,
              displayName: displayName || this.generateDisplayName(model),
              model,
              baseUrl,
              description: description || this.generateDescription(model, baseUrl),
              lastUsed: new Date()
            };

            settings.models.push(newProfile);
            await this.saveSettings(settings);
            
            resultText = `✅ Added model profile: ${newProfile.displayName} (${nickname})\n` +
                        `   Model: ${model}\n` +
                        (baseUrl ? `   Endpoint: ${baseUrl}\n` : '') +
                        `Use "/model ${nickname}" to switch to this model.`;
          }
          break;
        }

        case 'switch': {
          const targetNickname = nickname || action;
          if (!targetNickname) {
            resultText = '❌ No nickname specified for switch. Use /model list to see available profiles.';
            break;
          }

          const found = settings.models.find(m => m.nickname === targetNickname);
          if (!found) {
            resultText = `❌ Model profile "${targetNickname}" not found. Use /model list to see available profiles.`;
          } else {
            // Update environment variables to switch models
            process.env.OPENAI_MODEL = found.model;
            if (found.baseUrl) {
              process.env.OPENAI_BASE_URL = found.baseUrl;
            }
            
            // Update current in settings
            settings.current = targetNickname;
            found.lastUsed = new Date();
            await this.saveSettings(settings);
            
            resultText = `✅ Switched to: ${found.displayName} (${targetNickname})\n` +
                        `   Model: ${found.model}\n` +
                        (found.baseUrl ? `   Endpoint: ${found.baseUrl}\n` : '') +
                        `   Environment updated automatically\n\n` +
                        `Note: Restart QwenCode session to fully apply model change.`;
          }
          break;
        }

        case 'list':
        default: {
          // Default to list 
          if (settings.models.length === 0) {
            resultText = 'No model profiles configured.\n\n' +
                        'Use `/model init` to auto-detect current environment, or\n' +
                        'Use `/model add <nickname> <model> [baseUrl]` to add manually.\n\n' +
                        'Examples: /model add 4bdev qwen/qwen3-4b-2507 http://localhost:11434\n' +
                        '         /model add claude claude-3-5-sonnet https://api.anthropic.com';
          } else {
            const currentModel = process.env.OPENAI_MODEL;
            resultText = 'Model Profiles:\n' + '='.repeat(50) + '\n';
            
            settings.models.forEach(profile => {
              const isCurrent = profile.model === currentModel;
              const indicator = isCurrent ? '→ ' : '  ';
              resultText += `${indicator}${profile.nickname.padEnd(6)} ${profile.displayName.padEnd(25)} ${profile.description || ''}\n`;
            });
            
            resultText += '\nUse `/model <nickname>` to switch directly.';
          }
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
      const errorMessage = `❌ Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
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
}

export class ModelSwitcherTool extends BaseDeclarativeTool<ModelSwitcherParams, ToolResult> {
  static readonly Name: string = modelSwitcherSchemaData.name!;

  constructor() {
    super(
      ModelSwitcherTool.Name,
      'Model Switcher',
      modelSwitcherDescription,
      Kind.Edit,
      modelSwitcherSchemaData.parametersJsonSchema as Record<string, unknown>,
    );
  }

  override validateToolParams(params: ModelSwitcherParams): string | null {
    const errors = SchemaValidator.validate(
      this.schema.parametersJsonSchema,
      params,
    );
    if (errors) {
      return errors;
    }

    // Additional validation logic
    if (params.action === 'add') {
      if (!params.nickname || !params.model) {
        return 'Action "add" requires both nickname and model parameters';
      }
      if (!/^[a-zA-Z0-9]{1,6}$/.test(params.nickname)) {
        return 'Nickname must be 1-6 alphanumeric characters only';
      }
    }
    
    if (params.action === 'switch' && !params.nickname) {
      return 'Action "switch" requires nickname parameter';
    }

    return null;
  }

  protected createInvocation(params: ModelSwitcherParams) {
    return new ModelSwitcherInvocation(params);
  }
}