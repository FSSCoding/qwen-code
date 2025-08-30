/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolResult,
} from './tools.js';
import { FunctionDeclaration } from '@google/genai';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { debugLog } from '../utils/debugLog.js';

const blackToolSchemaData: FunctionDeclaration = {
  name: 'black_format',
  description:
    'Format Python code using Black - the uncompromising Python code formatter. Ensures consistent, PEP 8 compliant code style.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'File or directory path to format (required)',
      },
      line_length: {
        type: 'number',
        description: 'Maximum line length (default: 88)',
        default: 88,
      },
      preview: {
        type: 'boolean',
        description: 'Show what would be changed without making changes',
        default: false,
      },
      skip_string_normalization: {
        type: 'boolean',
        description: 'Skip string normalization (keep original quote style)',
        default: false,
      },
      target_version: {
        type: 'string',
        description: 'Python version to target (py38, py39, py310, py311, py312)',
        enum: ['py38', 'py39', 'py310', 'py311', 'py312'],
      },
      exclude: {
        type: 'string',
        description: 'Regex pattern for files/directories to exclude',
      },
      include: {
        type: 'string',
        description: 'Regex pattern for files to include',
      },
      safe: {
        type: 'boolean',
        description: 'Safe mode - only format if no syntax errors detected',
        default: true,
      },
    },
    required: ['target'],
  },
};

const blackToolDescription = `
Professional Python code formatting using Black - "The Uncompromising Code Formatter".

Features:
- Automatic PEP 8 compliant formatting
- Consistent code style across projects
- Preview mode to see changes before applying
- Configurable line length and Python version targeting
- Safe mode to prevent formatting broken code
- Integration with flake8 linting standards

Black eliminates bikeshedding around code style by making opinionated formatting decisions:
- Uses double quotes for strings
- Puts commas after the last element in multiline constructs  
- Formats long expressions and statements consistently
- Maintains readable diffs by preserving logical structure

This tool is perfect for:
- Formatting newly written code
- Standardizing existing codebases
- Pre-commit formatting workflows
- Team collaboration with consistent style
`;

interface BlackToolParams {
  target: string;
  line_length?: number;
  preview?: boolean;
  skip_string_normalization?: boolean;
  target_version?: string;
  exclude?: string;
  include?: string;
  safe?: boolean;
}

interface BlackResult {
  formatted_files: string[];
  unchanged_files: string[];
  error_files: string[];
  total_files: number;
  changes_made: boolean;
}

class BlackToolInvocation extends BaseToolInvocation<BlackToolParams, ToolResult> {
  constructor(params: BlackToolParams) {
    super(params);
  }

  getDescription(): string {
    const { target, preview } = this.params;
    return `${preview ? 'Preview' : 'Format'} Python code with Black: ${target}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const {
      target,
      line_length = 88,
      preview = false,
      skip_string_normalization = false,
      target_version,
      exclude,
      include,
      safe = true,
    } = this.params;

    try {
      // Validate target exists
      try {
        await fs.access(target);
      } catch {
        return {
          llmContent: JSON.stringify({
            success: false,
            error: `Target path does not exist: ${target}`,
          }),
          returnDisplay: `❌ Target path does not exist: ${target}`,
        };
      }

      // Build black command arguments
      const args: string[] = [];

      // Add line length
      args.push('--line-length', line_length.toString());

      // Add preview mode
      if (preview) {
        args.push('--diff', '--color');
      }

      // Add string normalization setting
      if (skip_string_normalization) {
        args.push('--skip-string-normalization');
      }

      // Add target version
      if (target_version) {
        args.push('--target-version', target_version);
      }

      // Add exclude pattern
      if (exclude) {
        args.push('--exclude', exclude);
      }

      // Add include pattern
      if (include) {
        args.push('--include', include);
      }

      // Add safe mode
      if (safe) {
        args.push('--safe');
      }

      // Add verbose output
      args.push('--verbose');

      // Add target path
      args.push(target);

      debugLog(`Running black with args: ${args.join(' ')}`);

      // Execute black
      const { stdout, stderr, code } = await this.runCommand('python3', ['-m', 'black', ...args]);

      // Parse results
      const result = this.parseBlackOutput(stdout, stderr, code);
      const display = this.generateDisplay(result, preview, target);

      return {
        llmContent: JSON.stringify({
          success: code === 0 || code === 1, // 1 = files were reformatted
          result,
          exit_code: code,
          preview_mode: preview,
          target,
          configuration: {
            line_length,
            skip_string_normalization,
            target_version,
            exclude,
            include,
            safe,
          },
        }),
        returnDisplay: display,
      };
    } catch (error) {
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Black formatting error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }),
        returnDisplay: `❌ Black formatting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async runCommand(command: string, args: string[]): Promise<{
    stdout: string;
    stderr: string;
    code: number;
  }> {
    return new Promise((resolve) => {
      const process = spawn(command, args, { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({ stdout, stderr, code: code || 0 });
      });

      process.on('error', (error) => {
        resolve({
          stdout: '',
          stderr: error.message,
          code: 1,
        });
      });
    });
  }

  private parseBlackOutput(stdout: string, stderr: string, code: number): BlackResult {
    const result: BlackResult = {
      formatted_files: [],
      unchanged_files: [],
      error_files: [],
      total_files: 0,
      changes_made: false,
    };

    // Combine stdout and stderr for parsing
    const output = stdout + '\n' + stderr;
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('reformatted') && !line.includes('would reformat')) {
        result.formatted_files.push(this.extractFileName(line));
        result.changes_made = true;
      } else if (line.includes('would reformat')) {
        result.formatted_files.push(this.extractFileName(line));
      } else if (line.includes('left unchanged')) {
        result.unchanged_files.push(this.extractFileName(line));
      } else if (line.includes('error') && line.includes('.py')) {
        result.error_files.push(this.extractFileName(line));
      }
    }

    result.total_files = result.formatted_files.length + result.unchanged_files.length + result.error_files.length;

    // Handle case where black didn't provide detailed file info
    if (result.total_files === 0 && code === 0) {
      result.unchanged_files.push(this.params.target);
      result.total_files = 1;
    } else if (result.total_files === 0 && code === 1) {
      result.formatted_files.push(this.params.target);
      result.total_files = 1;
      result.changes_made = true;
    }

    return result;
  }

  private extractFileName(line: string): string {
    // Try to extract filename from black output
    const match = line.match(/(?:would\s+)?(?:reformat|left\s+unchanged|error.*?)\s+(.+?\.py)/);
    return match ? match[1] : line.trim();
  }

  private generateDisplay(result: BlackResult, preview: boolean, target: string): string {
    let display = `🖤 **Black Formatting ${preview ? 'Preview' : 'Results'} for ${target}**\n\n`;

    if (result.total_files === 0) {
      display += '📝 No Python files found to format.\n';
      return display;
    }

    // Summary
    display += `📊 **Summary:** Processed ${result.total_files} file(s)\n`;
    
    if (preview) {
      if (result.formatted_files.length > 0) {
        display += `   🔄 Would format ${result.formatted_files.length} file(s)\n`;
      }
      if (result.unchanged_files.length > 0) {
        display += `   ✅ ${result.unchanged_files.length} file(s) already formatted\n`;
      }
    } else {
      if (result.formatted_files.length > 0) {
        display += `   ✅ Formatted ${result.formatted_files.length} file(s)\n`;
      }
      if (result.unchanged_files.length > 0) {
        display += `   📝 ${result.unchanged_files.length} file(s) unchanged\n`;
      }
    }

    if (result.error_files.length > 0) {
      display += `   ❌ ${result.error_files.length} file(s) had errors\n`;
    }

    display += '\n';

    // Formatted files
    if (result.formatted_files.length > 0) {
      const action = preview ? 'Would format' : 'Formatted';
      display += `🔄 **${action}:**\n`;
      for (const file of result.formatted_files) {
        display += `   • ${file}\n`;
      }
      display += '\n';
    }

    // Unchanged files (only show if few files)
    if (result.unchanged_files.length > 0 && result.unchanged_files.length <= 5) {
      display += `✅ **Already formatted:**\n`;
      for (const file of result.unchanged_files) {
        display += `   • ${file}\n`;
      }
      display += '\n';
    }

    // Error files
    if (result.error_files.length > 0) {
      display += `❌ **Errors:**\n`;
      for (const file of result.error_files) {
        display += `   • ${file}\n`;
      }
      display += '\n';
    }

    // Success message
    if (!preview && result.changes_made) {
      display += '🎉 **Formatting complete!** Your Python code now follows Black\'s opinionated style.\n';
    } else if (!preview && !result.changes_made) {
      display += '✨ **All good!** Your Python code already follows Black\'s style guidelines.\n';
    } else if (preview && result.formatted_files.length > 0) {
      display += '💡 **Ready to format!** Run without preview mode to apply these changes.\n';
    } else if (preview && result.formatted_files.length === 0) {
      display += '✨ **All good!** Your Python code already follows Black\'s style guidelines.\n';
    }

    // Configuration info
    display += this.getConfigurationInfo();

    return display;
  }

  private getConfigurationInfo(): string {
    const {
      line_length = 88,
      skip_string_normalization = false,
      target_version,
      exclude,
      include,
      safe = true,
    } = this.params;

    let config = '\n⚙️ **Configuration:**\n';
    config += `• Line length: ${line_length}\n`;
    config += `• String normalization: ${skip_string_normalization ? 'Skip' : 'Enable'}\n`;
    
    if (target_version) {
      config += `• Target Python version: ${target_version}\n`;
    }
    
    if (exclude) {
      config += `• Exclude pattern: ${exclude}\n`;
    }
    
    if (include) {
      config += `• Include pattern: ${include}\n`;
    }

    config += `• Safe mode: ${safe ? 'Enabled' : 'Disabled'}\n`;
    config += `• Compatible with flake8 linting standards\n`;
    
    return config;
  }
}

export class BlackTool extends BaseDeclarativeTool<BlackToolParams, ToolResult> {
  static readonly Name: string = blackToolSchemaData.name!;

  constructor() {
    super(
      BlackTool.Name,
      'Python Formatting',
      blackToolDescription,
      Kind.Edit, // Modifies files
      blackToolSchemaData.parametersJsonSchema as Record<string, unknown>,
    );
  }

  getDeclaration(): FunctionDeclaration {
    return blackToolSchemaData;
  }

  createInvocation(params: BlackToolParams) {
    return new BlackToolInvocation(params);
  }
}