/**
 * @license
 * Copyright 2025 FSS Enhanced
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, CommandContext, MessageActionReturn, ToolActionReturn } from './types.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  altNames: ['m'],
  description: 'Lightning-fast model switching with 6-character nicknames (claude, 4bdev, 30big)',
  kind: CommandKind.BUILT_IN,
  
  action: async (context: CommandContext, args: string): Promise<MessageActionReturn | ToolActionReturn> => {
    const trimmedArgs = args.trim();
    
    // Parse arguments
    const [action, ...params] = trimmedArgs.split(/\s+/);
    
    try {
      // Handle different command patterns
      if (!trimmedArgs) {
        // Just "/model" - show interactive selection
        return {
          type: 'tool',
          toolName: 'model_manager',
          toolArgs: { action: 'list' }
        };
      }
      
      // Check if it's a management command
      switch (action) {
        case 'add': {
          if (params.length < 2) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Usage: /model add <nickname> <model> [baseUrl] [apiKey]\n\n' +
                      'Examples:\n' +
                      '  /model add 4bdev qwen/qwen3-4b-2507 http://localhost:11434\n' +
                      '  /model add claude claude-3-5-sonnet https://api.anthropic.com\n' +
                      '  /model add gpt4o gpt-4-turbo-preview https://api.openai.com/v1'
            };
          }
          
          const [nickname, model, baseUrl] = params;
          return {
            type: 'tool',
            toolName: 'model_manager',
            toolArgs: { 
              action: 'add', 
              nickname, 
              model, 
              baseUrl,
              displayName: generateDisplayName(model),
              description: generateDescription(model, baseUrl),
              performance: generatePerformanceHints(model)
            }
          };
        }
        
        case 'remove':
        case 'rm': {
          if (params.length === 0) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Usage: /model remove <nickname>\n\n' +
                      'Example: /model remove 4bdev'
            };
          }
          
          return {
            type: 'tool',
            toolName: 'model_manager',
            toolArgs: { action: 'remove', nickname: params[0] }
          };
        }
        
        case 'list':
        case 'ls': {
          return {
            type: 'tool',
            toolName: 'model_manager',
            toolArgs: { action: 'list' }
          };
        }
        
        case 'current': {
          return {
            type: 'tool',
            toolName: 'model_manager',
            toolArgs: { action: 'current' }
          };
        }

        case 'recent': {
          return {
            type: 'tool',
            toolName: 'model_manager',
            toolArgs: { action: 'recent' }
          };
        }

        case 'init': {
          return {
            type: 'tool',
            toolName: 'model_manager',
            toolArgs: { action: 'init' }
          };
        }
        
        default: {
          // Handle numeric shortcuts for recent models (1-5)
          if (/^[1-5]$/.test(action)) {
            return {
              type: 'tool',
              toolName: 'model_manager',
              toolArgs: { action: 'switch', nickname: action }
            };
          }
          
          // Assume it's a nickname for direct switching
          if (action.length <= 6 && /^[a-zA-Z0-9]+$/.test(action)) {
            return {
              type: 'tool',
              toolName: 'model_manager',
              toolArgs: { nickname: action }
            };
          }
          
          return {
            type: 'message',
            messageType: 'error',
            content: `Unknown command or invalid nickname: "${action}"\n\n` +
                    'Usage:\n' +
                    '  /model                    - List configured models\n' +
                    '  /model <nickname>         - Switch to model by nickname\n' +
                    '  /model 1-5                - Switch to recent model by number\n' +
                    '  /model init               - Auto-detect current environment\n' +
                    '  /model recent             - Show recent models with shortcuts\n' +
                    '  /model add <nickname> <model> [baseUrl]\n' +
                    '  /model remove <nickname>  - Remove saved model\n' +
                    '  /model list               - List all saved models\n' +
                    '  /model current            - Show current model\n\n' +
                    'Start with `/model init` to auto-detect your current setup!\n' +
                    'Nicknames must be 1-6 alphanumeric characters.\n' +
                    'Use numbers 1-5 for quick access to recent models!'
          };
        }
      }
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Model command error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },

  completion: async (context: CommandContext, partialArg: string): Promise<string[]> => {
    // TODO: Implement auto-completion for nicknames and commands
    // For now, provide basic command completion
    const commands = ['add', 'remove', 'list', 'current'];
    
    if (!partialArg) {
      return commands;
    }
    
    const lowerPartial = partialArg.toLowerCase();
    return commands.filter(cmd => cmd.startsWith(lowerPartial));
  }
};

// Helper functions to generate intelligent defaults
function generateDisplayName(model: string): string {
  // Extract meaningful parts for display name
  if (model.includes('qwen3-4b')) return 'Local 4B Development';
  if (model.includes('qwen3-30b')) return 'Local 30B Complex';
  if (model.includes('gpt-4')) return 'GPT-4 OpenAI';
  if (model.includes('claude')) return 'Anthropic Claude';
  if (model.includes('gemini')) return 'Google Gemini';
  
  // Capitalize and clean up generic model names
  return model
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function generateDescription(model: string, baseUrl?: string): string {
  // Generate performance descriptions based on known models
  if (model.includes('qwen3-4b')) {
    return '120+ t/s, 190k context';
  }
  if (model.includes('qwen3-30b')) {
    return '131k context, complex reasoning';
  }
  if (baseUrl?.includes('localhost')) {
    return 'Local endpoint';
  }
  if (baseUrl?.includes('openai.com')) {
    return 'OpenAI API';
  }
  if (baseUrl?.includes('anthropic.com')) {
    return 'Anthropic API';
  }
  
  return 'Cloud API';
}

function generatePerformanceHints(model: string): any {
  // Generate performance hints for known models
  if (model.includes('qwen3-4b')) {
    return {
      tokensPerSecond: 120,
      contextWindow: 190,
      notes: 'fast development'
    };
  }
  if (model.includes('qwen3-30b')) {
    return {
      contextWindow: 131,
      notes: 'complex reasoning'
    };
  }
  
  return undefined;
}