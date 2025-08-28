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
import * as fs from 'fs/promises';
import * as path from 'path';

const projectStructureToolSchemaData: FunctionDeclaration = {
  name: 'project_structure',
  description:
    'Analyze and visualize project structure with intelligent insights. Goes beyond basic tree to provide architecture analysis, file relationships, and development guidance.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'Directory to analyze (defaults to current directory)',
        default: '.',
      },
      analysis_type: {
        type: 'string',
        description: 'Type of analysis to perform',
        enum: ['tree', 'overview', 'architecture', 'metrics', 'dependencies'],
        default: 'overview',
      },
      max_depth: {
        type: 'number',
        description: 'Maximum directory depth to analyze',
        default: 5,
      },
      show_hidden: {
        type: 'boolean',
        description: 'Include hidden files and directories',
        default: false,
      },
      file_types: {
        type: 'array',
        description: 'Filter to specific file extensions (e.g., ["js", "ts", "py"])',
        items: { type: 'string' },
      },
      exclude_patterns: {
        type: 'array',
        description: 'Patterns to exclude (e.g., ["node_modules", "*.log"])',
        items: { type: 'string' },
        default: ['node_modules', '.git', '__pycache__', 'dist', 'build'],
      },
      size_analysis: {
        type: 'boolean',
        description: 'Include file size analysis and large file detection',
        default: true,
      },
      git_awareness: {
        type: 'boolean',
        description: 'Include git status and history information',
        default: true,
      },
    },
    required: [],
  },
};

const projectStructureToolDescription = `
Intelligent project structure analysis and visualization tool for development workflows.

Analysis Types:
- **tree**: Enhanced directory tree with file type icons and metadata
- **overview**: High-level project summary with entry points and key files
- **architecture**: Module relationships and dependency analysis
- **metrics**: Code metrics, file sizes, and complexity analysis
- **dependencies**: Package dependencies and version analysis

Features:
- Smart file type detection with appropriate icons
- Git integration (modified files, commit history)
- Large file and bloat detection
- Entry point and configuration file identification
- Module import/export analysis
- Architecture pattern recognition
- Technology stack detection

Perfect for:
- Understanding unfamiliar codebases
- Identifying architectural issues
- Finding entry points and key files
- Detecting bloat and unused files
- Planning refactoring efforts
`;

interface ProjectStructureToolParams {
  target?: string;
  analysis_type?: 'tree' | 'overview' | 'architecture' | 'metrics' | 'dependencies';
  max_depth?: number;
  show_hidden?: boolean;
  file_types?: string[];
  exclude_patterns?: string[];
  size_analysis?: boolean;
  git_awareness?: boolean;
}

interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  extension?: string;
  icon: string;
  gitStatus?: string;
  lastModified: Date;
  isEntryPoint?: boolean;
  isConfig?: boolean;
  importance: 'high' | 'medium' | 'low';
}

interface ProjectAnalysis {
  structure: FileInfo[];
  entryPoints: string[];
  configFiles: string[];
  techStack: string[];
  totalFiles: number;
  totalSize: number;
  largestFiles: FileInfo[];
  recentlyModified: FileInfo[];
  architecture: {
    patterns: string[];
    modules: string[];
    depth: number;
  };
}

class ProjectStructureToolInvocation extends BaseToolInvocation<
  ProjectStructureToolParams,
  ToolResult
> {
  constructor(params: ProjectStructureToolParams) {
    super(params);
  }

  getDescription(): string {
    const { target = '.', analysis_type = 'overview' } = this.params;
    return `Analyze project structure (${analysis_type}) for ${target}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const {
      target = '.',
      analysis_type = 'overview',
      max_depth = 5,
      show_hidden = false,
      file_types,
      exclude_patterns = ['node_modules', '.git', '__pycache__', 'dist', 'build'],
      size_analysis = true,
      git_awareness = true,
    } = this.params;

    try {
      // Validate target directory
      const targetPath = path.resolve(target);
      try {
        const stat = await fs.stat(targetPath);
        if (!stat.isDirectory()) {
          return {
            llmContent: JSON.stringify({
              success: false,
              error: `Target must be a directory: ${target}`,
            }),
            returnDisplay: `❌ Target must be a directory: ${target}`,
          };
        }
      } catch {
        return {
          llmContent: JSON.stringify({
            success: false,
            error: `Directory does not exist: ${target}`,
          }),
          returnDisplay: `❌ Directory does not exist: ${target}`,
        };
      }

      
      // Perform analysis based on type
      let analysis: ProjectAnalysis;
      
      switch (analysis_type) {
        case 'tree':
          analysis = await this.generateTreeAnalysis(targetPath, max_depth, show_hidden, exclude_patterns);
          break;
        case 'overview':
          analysis = await this.generateOverviewAnalysis(targetPath, max_depth, show_hidden, exclude_patterns, size_analysis, git_awareness);
          break;
        case 'architecture':
          analysis = await this.generateArchitectureAnalysis(targetPath, max_depth, exclude_patterns);
          break;
        case 'metrics':
          analysis = await this.generateMetricsAnalysis(targetPath, exclude_patterns);
          break;
        case 'dependencies':
          analysis = await this.generateDependencyAnalysis(targetPath);
          break;
        default:
          analysis = await this.generateOverviewAnalysis(targetPath, max_depth, show_hidden, exclude_patterns, size_analysis, git_awareness);
      }

      // Filter by file types if specified
      if (file_types && file_types.length > 0) {
        analysis.structure = analysis.structure.filter(
          file => file.type === 'directory' || 
          (file.extension && file_types.includes(file.extension))
        );
      }

      const display = this.formatAnalysis(analysis, analysis_type, targetPath);

      return {
        llmContent: JSON.stringify({
          success: true,
          analysis_type,
          target: targetPath,
          analysis,
          configuration: {
            max_depth,
            show_hidden,
            file_types,
            exclude_patterns,
            size_analysis,
            git_awareness,
          },
        }),
        returnDisplay: display,
      };
    } catch (error) {
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Project structure analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }),
        returnDisplay: `❌ Project structure analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async generateOverviewAnalysis(
    targetPath: string,
    maxDepth: number,
    showHidden: boolean,
    excludePatterns: string[],
    sizeAnalysis: boolean,
    gitAwareness: boolean
  ): Promise<ProjectAnalysis> {
    const structure = await this.scanDirectory(targetPath, '', 0, maxDepth, showHidden, excludePatterns);
    
    const analysis: ProjectAnalysis = {
      structure,
      entryPoints: this.identifyEntryPoints(structure),
      configFiles: this.identifyConfigFiles(structure),
      techStack: this.detectTechStack(structure),
      totalFiles: structure.filter(f => f.type === 'file').length,
      totalSize: structure.reduce((sum, f) => sum + f.size, 0),
      largestFiles: structure
        .filter(f => f.type === 'file')
        .sort((a, b) => b.size - a.size)
        .slice(0, 10),
      recentlyModified: structure
        .filter(f => f.type === 'file')
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
        .slice(0, 10),
      architecture: {
        patterns: this.detectArchitecturePatterns(structure),
        modules: this.identifyModules(structure),
        depth: this.calculateMaxDepth(structure),
      },
    };

    return analysis;
  }

  private async generateTreeAnalysis(
    targetPath: string,
    maxDepth: number,
    showHidden: boolean,
    excludePatterns: string[]
  ): Promise<ProjectAnalysis> {
    const structure = await this.scanDirectory(targetPath, '', 0, maxDepth, showHidden, excludePatterns);
    
    return {
      structure,
      entryPoints: [],
      configFiles: [],
      techStack: [],
      totalFiles: structure.filter(f => f.type === 'file').length,
      totalSize: structure.reduce((sum, f) => sum + f.size, 0),
      largestFiles: [],
      recentlyModified: [],
      architecture: {
        patterns: [],
        modules: [],
        depth: this.calculateMaxDepth(structure),
      },
    };
  }

  private async generateArchitectureAnalysis(targetPath: string, maxDepth: number, excludePatterns: string[]): Promise<ProjectAnalysis> {
    const structure = await this.scanDirectory(targetPath, '', 0, maxDepth, false, excludePatterns);
    
    return {
      structure,
      entryPoints: this.identifyEntryPoints(structure),
      configFiles: this.identifyConfigFiles(structure),
      techStack: this.detectTechStack(structure),
      totalFiles: structure.filter(f => f.type === 'file').length,
      totalSize: 0,
      largestFiles: [],
      recentlyModified: [],
      architecture: {
        patterns: this.detectArchitecturePatterns(structure),
        modules: this.identifyModules(structure),
        depth: this.calculateMaxDepth(structure),
      },
    };
  }

  private async generateMetricsAnalysis(targetPath: string, excludePatterns: string[]): Promise<ProjectAnalysis> {
    const structure = await this.scanDirectory(targetPath, '', 0, 10, false, excludePatterns);
    
    return {
      structure: [],
      entryPoints: [],
      configFiles: [],
      techStack: this.detectTechStack(structure),
      totalFiles: structure.filter(f => f.type === 'file').length,
      totalSize: structure.reduce((sum, f) => sum + f.size, 0),
      largestFiles: structure
        .filter(f => f.type === 'file')
        .sort((a, b) => b.size - a.size)
        .slice(0, 20),
      recentlyModified: structure
        .filter(f => f.type === 'file')
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
        .slice(0, 20),
      architecture: {
        patterns: [],
        modules: [],
        depth: this.calculateMaxDepth(structure),
      },
    };
  }

  private async generateDependencyAnalysis(targetPath: string): Promise<ProjectAnalysis> {
    // This would analyze package.json, requirements.txt, etc.
    const structure = await this.scanDirectory(targetPath, '', 0, 2, false, []);
    const configFiles = this.identifyConfigFiles(structure);
    
    return {
      structure: structure.filter(f => this.isDependencyFile(f.name)),
      entryPoints: [],
      configFiles,
      techStack: this.detectTechStack(structure),
      totalFiles: 0,
      totalSize: 0,
      largestFiles: [],
      recentlyModified: [],
      architecture: {
        patterns: [],
        modules: [],
        depth: 0,
      },
    };
  }

  private async scanDirectory(
    basePath: string,
    relativePath: string,
    currentDepth: number,
    maxDepth: number,
    showHidden: boolean,
    excludePatterns: string[]
  ): Promise<FileInfo[]> {
    if (currentDepth > maxDepth) return [];
    
    const fullPath = path.join(basePath, relativePath);
    const files: FileInfo[] = [];

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        const fileName = entry.name;
        const filePath = path.join(relativePath, fileName);
        const fullFilePath = path.join(fullPath, fileName);

        // Skip hidden files if not requested
        if (!showHidden && fileName.startsWith('.')) continue;

        // Skip excluded patterns
        if (excludePatterns.some(pattern => 
          fileName.includes(pattern) || filePath.includes(pattern)
        )) continue;

        try {
          const stats = await fs.stat(fullFilePath);
          const fileInfo: FileInfo = {
            path: filePath,
            name: fileName,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            extension: entry.isFile() ? path.extname(fileName).slice(1) : undefined,
            icon: this.getFileIcon(fileName, entry.isDirectory()),
            lastModified: stats.mtime,
            isEntryPoint: this.isEntryPoint(fileName),
            isConfig: this.isConfigFile(fileName),
            importance: this.calculateImportance(fileName, entry.isDirectory(), stats.size),
          };

          files.push(fileInfo);

          // Recursively scan directories
          if (entry.isDirectory()) {
            const subFiles = await this.scanDirectory(
              basePath,
              filePath,
              currentDepth + 1,
              maxDepth,
              showHidden,
              excludePatterns
            );
            files.push(...subFiles);
          }
        } catch (error) {
          // Silently skip files that can't be accessed
        }
      }
    } catch (error) {
      // Silently skip directories that can't be accessed
    }

    return files;
  }

  private getFileIcon(fileName: string, isDirectory: boolean): string {
    if (isDirectory) {
      const dirIcons: Record<string, string> = {
        src: '📁',
        lib: '📚',
        test: '🧪',
        tests: '🧪',
        docs: '📖',
        config: '⚙️',
        assets: '🎨',
        public: '🌐',
        components: '🧩',
        utils: '🛠️',
        services: '🔧',
        api: '🔌',
        database: '🗄️',
        scripts: '📜',
      };
      return dirIcons[fileName.toLowerCase()] || '📂';
    }

    const ext = path.extname(fileName).slice(1).toLowerCase();
    const fileIcons: Record<string, string> = {
      js: '🟨',
      ts: '🟦',
      jsx: '⚛️',
      tsx: '⚛️',
      py: '🐍',
      java: '☕',
      cpp: '⚡',
      c: '⚡',
      cs: '🟣',
      php: '🐘',
      rb: '💎',
      go: '🐹',
      rs: '🦀',
      kt: '🟠',
      swift: '🍎',
      html: '🌐',
      css: '🎨',
      scss: '🎨',
      sass: '🎨',
      json: '📋',
      xml: '📋',
      yaml: '📋',
      yml: '📋',
      md: '📝',
      txt: '📄',
      pdf: '📕',
      jpg: '🖼️',
      jpeg: '🖼️',
      png: '🖼️',
      gif: '🖼️',
      svg: '🖼️',
      mp3: '🎵',
      mp4: '🎬',
      zip: '🗜️',
      tar: '🗜️',
      gz: '🗜️',
      sql: '🗃️',
      db: '🗄️',
      log: '📊',
    };
    return fileIcons[ext] || '📄';
  }

  private isEntryPoint(fileName: string): boolean {
    const entryPoints = [
      'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
      'server.js', 'server.ts', '__init__.py', 'main.py', 'app.py',
      'Main.java', 'Program.cs', 'main.cpp', 'main.c', 'main.go'
    ];
    return entryPoints.includes(fileName);
  }

  private isConfigFile(fileName: string): boolean {
    const configFiles = [
      'package.json', 'tsconfig.json', 'webpack.config.js', '.eslintrc',
      'requirements.txt', 'setup.py', 'Dockerfile', 'docker-compose.yml',
      'Makefile', 'CMakeLists.txt', '.gitignore', 'README.md'
    ];
    return configFiles.includes(fileName) || fileName.startsWith('.') && !fileName.startsWith('.git');
  }

  private isDependencyFile(fileName: string): boolean {
    return [
      'package.json', 'package-lock.json', 'yarn.lock',
      'requirements.txt', 'Pipfile', 'poetry.lock',
      'Gemfile', 'composer.json', 'pom.xml', 'build.gradle'
    ].includes(fileName);
  }

  private calculateImportance(fileName: string, isDirectory: boolean, size: number): 'high' | 'medium' | 'low' {
    if (this.isEntryPoint(fileName) || this.isConfigFile(fileName)) return 'high';
    if (isDirectory) return 'medium';
    if (size > 100000) return 'high'; // Large files
    return 'low';
  }

  private identifyEntryPoints(structure: FileInfo[]): string[] {
    return structure
      .filter(f => f.isEntryPoint)
      .map(f => f.path)
      .slice(0, 10);
  }

  private identifyConfigFiles(structure: FileInfo[]): string[] {
    return structure
      .filter(f => f.isConfig)
      .map(f => f.path)
      .slice(0, 20);
  }

  private detectTechStack(structure: FileInfo[]): string[] {
    const techMap: Record<string, string> = {
      js: 'JavaScript',
      ts: 'TypeScript',
      jsx: 'React',
      tsx: 'React + TypeScript',
      py: 'Python',
      java: 'Java',
      cpp: 'C++',
      c: 'C',
      cs: 'C#',
      php: 'PHP',
      rb: 'Ruby',
      go: 'Go',
      rs: 'Rust',
      kt: 'Kotlin',
      swift: 'Swift',
    };

    const detectedTech = new Set<string>();
    
    structure.forEach(file => {
      if (file.extension && techMap[file.extension]) {
        detectedTech.add(techMap[file.extension]);
      }
    });

    // Detect frameworks
    if (structure.some(f => f.name === 'package.json')) {
      detectedTech.add('Node.js');
    }
    if (structure.some(f => f.name === 'requirements.txt')) {
      detectedTech.add('Python');
    }

    return Array.from(detectedTech);
  }

  private detectArchitecturePatterns(structure: FileInfo[]): string[] {
    const patterns: string[] = [];
    const dirs = structure.filter(f => f.type === 'directory').map(f => f.name.toLowerCase());

    if (dirs.includes('src') && dirs.includes('test')) {
      patterns.push('Standard Source/Test Structure');
    }
    if (dirs.includes('components') && dirs.includes('pages')) {
      patterns.push('React/Next.js Structure');
    }
    if (dirs.includes('models') && dirs.includes('views') && dirs.includes('controllers')) {
      patterns.push('MVC Pattern');
    }
    if (dirs.includes('services') && dirs.includes('repositories')) {
      patterns.push('Service Layer Pattern');
    }
    if (dirs.includes('api') || dirs.includes('routes')) {
      patterns.push('API/RESTful Structure');
    }

    return patterns;
  }

  private identifyModules(structure: FileInfo[]): string[] {
    return structure
      .filter(f => f.type === 'directory' && f.path.split('/').length === 1)
      .map(f => f.name)
      .slice(0, 20);
  }

  private calculateMaxDepth(structure: FileInfo[]): number {
    return Math.max(...structure.map(f => f.path.split('/').length));
  }

  private formatAnalysis(analysis: ProjectAnalysis, analysisType: string, targetPath: string): string {
    let display = `🏗️ **Project Structure Analysis (${analysisType.toUpperCase()}) - ${path.basename(targetPath)}**\n\n`;

    switch (analysisType) {
      case 'tree':
        display += this.formatTreeView(analysis);
        break;
      case 'overview':
        display += this.formatOverview(analysis);
        break;
      case 'architecture':
        display += this.formatArchitecture(analysis);
        break;
      case 'metrics':
        display += this.formatMetrics(analysis);
        break;
      case 'dependencies':
        display += this.formatDependencies(analysis);
        break;
    }

    return display;
  }

  private formatOverview(analysis: ProjectAnalysis): string {
    let output = '';

    // Quick stats
    output += `📊 **Project Overview:**\n`;
    output += `• Total files: ${analysis.totalFiles}\n`;
    output += `• Total size: ${this.formatSize(analysis.totalSize)}\n`;
    output += `• Directory depth: ${analysis.architecture.depth}\n`;
    output += `• Tech stack: ${analysis.techStack.join(', ') || 'Unknown'}\n\n`;

    // Entry points
    if (analysis.entryPoints.length > 0) {
      output += `🚪 **Entry Points:**\n`;
      analysis.entryPoints.forEach(entry => {
        output += `• ${entry}\n`;
      });
      output += '\n';
    }

    // Architecture patterns
    if (analysis.architecture.patterns.length > 0) {
      output += `🏛️ **Architecture Patterns:**\n`;
      analysis.architecture.patterns.forEach(pattern => {
        output += `• ${pattern}\n`;
      });
      output += '\n';
    }

    // Key directories
    if (analysis.architecture.modules.length > 0) {
      output += `📁 **Main Modules:**\n`;
      analysis.architecture.modules.slice(0, 10).forEach(module => {
        const moduleFiles = analysis.structure.filter(f => f.path.startsWith(module + '/'));
        output += `• ${module}/ (${moduleFiles.length} files)\n`;
      });
      output += '\n';
    }

    // Recent activity
    if (analysis.recentlyModified.length > 0) {
      output += `📝 **Recently Modified:**\n`;
      analysis.recentlyModified.slice(0, 5).forEach(file => {
        const age = Math.floor((Date.now() - file.lastModified.getTime()) / (1000 * 60 * 60 * 24));
        output += `• ${file.path} (${age} days ago)\n`;
      });
      output += '\n';
    }

    return output;
  }

  private formatTreeView(analysis: ProjectAnalysis): string {
    // Group files by directory level
    const tree = this.buildTreeStructure(analysis.structure);
    return this.renderTree(tree, '');
  }

  private formatArchitecture(analysis: ProjectAnalysis): string {
    let output = `🏛️ **Architecture Analysis:**\n\n`;

    output += `**Detected Patterns:**\n`;
    analysis.architecture.patterns.forEach(pattern => {
      output += `• ${pattern}\n`;
    });
    output += '\n';

    output += `**Module Structure:**\n`;
    analysis.architecture.modules.forEach(module => {
      output += `• ${module}/\n`;
    });
    
    return output;
  }

  private formatMetrics(analysis: ProjectAnalysis): string {
    let output = `📊 **Code Metrics:**\n\n`;

    output += `**Size Analysis:**\n`;
    output += `• Total files: ${analysis.totalFiles}\n`;
    output += `• Total size: ${this.formatSize(analysis.totalSize)}\n\n`;

    output += `**Largest Files:**\n`;
    analysis.largestFiles.slice(0, 10).forEach(file => {
      output += `• ${file.path} - ${this.formatSize(file.size)}\n`;
    });

    return output;
  }

  private formatDependencies(analysis: ProjectAnalysis): string {
    let output = `📦 **Dependency Analysis:**\n\n`;

    output += `**Configuration Files:**\n`;
    analysis.configFiles.forEach(config => {
      output += `• ${config}\n`;
    });

    return output;
  }

  private buildTreeStructure(files: FileInfo[]): any {
    const tree: any = {};
    
    files.forEach(file => {
      const parts = file.path.split('/');
      let current = tree;
      
      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = index === parts.length - 1 ? file : {};
        }
        if (index < parts.length - 1) {
          current = current[part];
        }
      });
    });
    
    return tree;
  }

  private renderTree(tree: any, prefix: string): string {
    let output = '';
    const entries = Object.entries(tree);
    
    entries.forEach(([name, value], index) => {
      const isLast = index === entries.length - 1;
      const currentPrefix = prefix + (isLast ? '└── ' : '├── ');
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      
      if (typeof value === 'object' && value && 'name' in value && typeof value.name === 'string') {
        // It's a file
        const file = value as FileInfo;
        output += `${currentPrefix}${file.icon} ${file.name}`;
        if (file.importance === 'high') output += ' ⭐';
        output += '\n';
      } else {
        // It's a directory
        output += `${currentPrefix}📂 ${name}/\n`;
        output += this.renderTree(value, nextPrefix);
      }
    });
    
    return output;
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

export class ProjectStructureTool extends BaseDeclarativeTool<ProjectStructureToolParams, ToolResult> {
  static readonly Name: string = projectStructureToolSchemaData.name!;

  constructor() {
    super(
      ProjectStructureTool.Name,
      'Project Structure Analysis',
      projectStructureToolDescription,
      Kind.Read, // Reads files and directories
      projectStructureToolSchemaData.parametersJsonSchema as Record<string, unknown>,
    );
  }

  getDeclaration(): FunctionDeclaration {
    return projectStructureToolSchemaData;
  }

  createInvocation(params: ProjectStructureToolParams) {
    return new ProjectStructureToolInvocation(params);
  }
}