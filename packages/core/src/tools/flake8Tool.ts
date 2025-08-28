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

const flake8ToolSchemaData: FunctionDeclaration = {
  name: 'flake8_lint',
  description:
    'Run flake8 linting on Python files to check for style and syntax issues. Can lint specific files or directories with configurable options.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'File or directory path to lint (defaults to current directory)',
      },
      max_line_length: {
        type: 'number',
        description: 'Maximum line length (default: 88 to match black)',
        default: 88,
      },
      ignore: {
        type: 'array',
        description: 'List of error codes to ignore (e.g., ["E203", "W503"])',
        items: { type: 'string' },
      },
      select: {
        type: 'array',
        description: 'List of error codes to select (only check these)',
        items: { type: 'string' },
      },
      exclude: {
        type: 'array',
        description: 'List of file/directory patterns to exclude',
        items: { type: 'string' },
      },
      auto_fix_suggestions: {
        type: 'boolean',
        description: 'Provide auto-fix suggestions for common issues',
        default: true,
      },
    },
    required: [],
  },
};

const flake8ToolDescription = `
Python code linting tool using flake8 for style and syntax checking.

Features:
- Automatic syntax and style checking
- Configurable line length, ignore lists, and exclusions  
- Auto-fix suggestions for common issues
- Integration with black formatter standards
- Support for project-specific .flake8 configuration files

The tool automatically detects Python files and provides detailed feedback on:
- Syntax errors and warnings
- PEP 8 style violations  
- Import organization issues
- Unused variables and imports
- Complexity warnings

Default configuration is optimized for black formatter compatibility (88 char lines).
`;

interface Flake8ToolParams {
  target?: string;
  max_line_length?: number;
  ignore?: string[];
  select?: string[];
  exclude?: string[];
  auto_fix_suggestions?: boolean;
}

interface Flake8Issue {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

class Flake8ToolInvocation extends BaseToolInvocation<
  Flake8ToolParams,
  ToolResult
> {
  constructor(params: Flake8ToolParams) {
    super(params);
  }

  getDescription(): string {
    const target = this.params.target || '.';
    return `Run flake8 linting on ${target}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const {
      target = '.',
      max_line_length = 88,
      ignore = [],
      select = [],
      exclude = [],
      auto_fix_suggestions = true,
    } = this.params;

    try {
      // Build flake8 command arguments
      const args: string[] = [];

      // Add max line length
      args.push(`--max-line-length=${max_line_length}`);

      // Add ignore list
      if (ignore.length > 0) {
        args.push(`--ignore=${ignore.join(',')}`);
      }

      // Add select list  
      if (select.length > 0) {
        args.push(`--select=${select.join(',')}`);
      }

      // Add exclude list
      if (exclude.length > 0) {
        args.push(`--exclude=${exclude.join(',')}`);
      }

      // Add target path
      args.push(target);

      console.log(`[DEBUG] Running flake8 with args: ${args.join(' ')}`);

      // Execute flake8
      const { stdout, code } = await this.runCommand('python3', ['-m', 'flake8', ...args]);

      // Parse results
      const issues = this.parseFlake8Output(stdout);
      const summary = this.generateSummary(issues);
      const suggestions = auto_fix_suggestions ? this.generateAutoFixSuggestions(issues) : '';

      let display = `🐍 **Flake8 Linting Results for ${target}**\n\n`;

      if (issues.length === 0) {
        display += '✅ **No linting issues found!** Your Python code follows PEP 8 standards.\n';
      } else {
        display += summary + '\n\n';
        display += this.formatIssues(issues);
        
        if (suggestions) {
          display += '\n\n💡 **Auto-Fix Suggestions:**\n' + suggestions;
        }
      }

      // Add configuration info
      display += this.getConfigurationInfo(max_line_length, ignore, select, exclude);

      return {
        llmContent: JSON.stringify({
          success: true,
          issues_count: issues.length,
          issues,
          exit_code: code,
          target,
          configuration: { max_line_length, ignore, select, exclude },
        }),
        returnDisplay: display,
      };
    } catch (error) {
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Flake8 error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }),
        returnDisplay: `❌ Flake8 linting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  private parseFlake8Output(output: string): Flake8Issue[] {
    if (!output.trim()) return [];

    const issues: Flake8Issue[] = [];
    
    // Try to parse as JSON first (if --format=json was supported)
    try {
      const jsonData = JSON.parse(output);
      return jsonData;
    } catch {
      // Fall back to standard format parsing
    }

    // Parse standard flake8 output format: file:line:col: code message
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(.+):(\d+):(\d+):\s+(\w+)\s+(.+)$/);
      if (match) {
        const [, file, lineNum, col, code, message] = match;
        issues.push({
          file: file.trim(),
          line: parseInt(lineNum),
          column: parseInt(col),
          code: code.trim(),
          message: message.trim(),
          severity: code.startsWith('E') ? 'error' : 'warning',
        });
      }
    }

    return issues;
  }

  private generateSummary(issues: Flake8Issue[]): string {
    if (issues.length === 0) return '';

    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const files = new Set(issues.map(i => i.file)).size;

    let summary = `📊 **Summary:** ${issues.length} issues found across ${files} file(s)\n`;
    if (errors > 0) summary += `   🔴 ${errors} errors\n`;
    if (warnings > 0) summary += `   🟡 ${warnings} warnings\n`;

    // Top issue types
    const codeFreq = issues.reduce((acc, issue) => {
      acc[issue.code] = (acc[issue.code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topCodes = Object.entries(codeFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([code, count]) => `${code} (${count})`);

    if (topCodes.length > 0) {
      summary += `   📈 Most common: ${topCodes.join(', ')}\n`;
    }

    return summary;
  }

  private formatIssues(issues: Flake8Issue[]): string {
    // Group by file
    const fileGroups = issues.reduce((acc, issue) => {
      if (!acc[issue.file]) acc[issue.file] = [];
      acc[issue.file].push(issue);
      return acc;
    }, {} as Record<string, Flake8Issue[]>);

    let output = '📝 **Issues by File:**\n\n';

    for (const [file, fileIssues] of Object.entries(fileGroups)) {
      output += `**${file}:**\n`;
      
      for (const issue of fileIssues) {
        const icon = issue.severity === 'error' ? '🔴' : '🟡';
        output += `  ${icon} Line ${issue.line}:${issue.column} - **${issue.code}**: ${issue.message}\n`;
      }
      output += '\n';
    }

    return output.trim();
  }

  private generateAutoFixSuggestions(issues: Flake8Issue[]): string {
    const suggestions: string[] = [];
    const codeCount = issues.reduce((acc, issue) => {
      acc[issue.code] = (acc[issue.code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Common auto-fix suggestions
    const fixMap: Record<string, string> = {
      'E302': 'Add 2 blank lines before class/function definitions',
      'E303': 'Remove extra blank lines',
      'E501': 'Break long lines (consider using black formatter)',
      'F401': 'Remove unused imports or add # noqa comment if intentional',
      'E231': 'Add whitespace after commas',
      'E225': 'Add whitespace around operators',
      'W291': 'Remove trailing whitespace',
      'W292': 'Add newline at end of file',
      'E111': 'Fix indentation to multiple of 4 spaces',
      'E112': 'Fix indentation expected',
    };

    for (const [code, count] of Object.entries(codeCount)) {
      if (fixMap[code]) {
        suggestions.push(`• **${code}** (${count} occurrences): ${fixMap[code]}`);
      }
    }

    // General suggestions
    if (issues.some(i => i.code.startsWith('E5'))) {
      suggestions.push('• Consider running `black` formatter to fix line length issues automatically');
    }

    if (issues.some(i => i.code.startsWith('F'))) {
      suggestions.push('• Use `autopep8` or IDE auto-imports to fix import issues');
    }

    return suggestions.join('\n');
  }

  private getConfigurationInfo(
    maxLineLength: number,
    ignore: string[],
    select: string[],
    exclude: string[]
  ): string {
    let config = '\n\n⚙️ **Configuration:**\n';
    config += `• Max line length: ${maxLineLength}\n`;
    
    if (ignore.length > 0) {
      config += `• Ignoring: ${ignore.join(', ')}\n`;
    }
    
    if (select.length > 0) {
      config += `• Only checking: ${select.join(', ')}\n`;
    }
    
    if (exclude.length > 0) {
      config += `• Excluding: ${exclude.join(', ')}\n`;
    }

    config += `• Configuration: Compatible with black formatter standards\n`;
    
    return config;
  }
}

export class Flake8Tool extends BaseDeclarativeTool<Flake8ToolParams, ToolResult> {
  static readonly Name: string = flake8ToolSchemaData.name!;

  constructor() {
    super(
      Flake8Tool.Name,
      'Python Linting',
      flake8ToolDescription,
      Kind.Read, // Reads files for linting
      flake8ToolSchemaData.parametersJsonSchema as Record<string, unknown>,
    );
  }

  getDeclaration(): FunctionDeclaration {
    return flake8ToolSchemaData;
  }

  createInvocation(params: Flake8ToolParams) {
    return new Flake8ToolInvocation(params);
  }
}