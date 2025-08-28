# FSS Enhanced Qwen Code Fork 🚀

<div align="center">

[![FSS Enhanced](https://img.shields.io/badge/FSS-Enhanced-blue.svg)](https://github.com/FSSCoding/qwen-code)
[![Python Tools](https://img.shields.io/badge/Python-Tools-green.svg)](https://github.com/FSSCoding/qwen-code)
[![RAG Integration](https://img.shields.io/badge/RAG-Integrated-purple.svg)](https://github.com/FSSCoding/qwen-code)
[![Voice Feedback](https://img.shields.io/badge/Voice-Enabled-orange.svg)](https://github.com/FSSCoding/qwen-code)

</div>

## 🎯 Enhanced Features & Tools

This fork extends the standard Qwen Code with professional development tools and intelligent workflow automation:

### 🐍 **Python Development Suite**
Modern Python development requires consistent code quality and formatting. These tools eliminate the friction of maintaining professional Python codebases by automating quality checks and formatting decisions.

- **Flake8 Integration**: Catches style violations and potential bugs early in development, preventing code review delays and maintaining team coding standards
- **Black Formatter**: Removes formatting debates entirely by applying consistent, opinionated formatting that every Python developer recognizes
- **Intelligent Linting**: Automatically runs quality checks after edits, catching issues before they reach version control

### 🏗️ **Project Intelligence Tools**  
Understanding large codebases quickly is essential for effective development. This analyzer provides multiple perspectives on project structure to help developers navigate and comprehend complex systems.

- **Project Structure Analyzer**: Provides instant architectural understanding of unfamiliar codebases through multiple analysis modes:
  - `tree`: Navigate directory hierarchies visually
  - `overview`: Get high-level project understanding in seconds  
  - `architecture`: Identify design patterns and architectural decisions
  - `metrics`: Assess code health and complexity
  - `dependencies`: Understand project relationships and potential refactoring opportunities

### 🧠 **RAG-Enhanced Code Analysis**
Traditional search finds text matches; semantic search understands intent and relationships. This enables developers to ask conceptual questions about code and get meaningful answers.

- **Deep Semantic Search**: Find code by describing what it does, not just what it's called - essential for working with unfamiliar codebases
- **Cross-Reference Analysis**: Discover how different parts of the system interact without manually tracing through imports
- **Context-Aware Suggestions**: Get recommendations based on the entire project context, not just the current file

### 🎵 **Voice Feedback System**
Long-running operations leave developers wondering about progress. Audio feedback enables multitasking and provides reassurance during complex automated tasks.

- **TTS Integration**: Stay informed about progress without constantly watching the screen - work on other tasks while operations complete
- **Multi-Voice Support**: Assign different voices to different types of work for instant context recognition
- **Bluetooth Audio**: Use wireless speakers for clear audio feedback without being tethered to the workstation

### 📋 **Enhanced Task Management**
Complex development work involves many interdependent steps. Proper task tracking prevents forgotten requirements and provides visibility into progress.

- **Persistent Task Lists**: Never lose track of what needs to be done across long development sessions
- **Visual Progress Indicators**: Instantly see what's complete, in-progress, or pending without scanning text
- **Intelligent Task Breakdown**: Automatically decompose complex features into actionable steps

### 🔍 **Advanced Search & Navigation**
Modern development requires information from multiple sources. Integrated research tools eliminate context switching between the development environment and external resources.

- **Web Research Tools**: Gather documentation and examples without leaving the development workflow
- **Memory System**: Maintain project-specific knowledge across sessions, reducing ramp-up time
- **Enhanced File Operations**: Intelligent pattern recognition for bulk operations and project maintenance

### 🛠️ **Developer Experience Enhancements**
Development efficiency comes from removing friction and automating routine tasks. These enhancements bring IDE-quality features to the command line environment.

- **IDE-Level Capabilities**: Access sophisticated analysis tools without switching to heavy IDE environments
- **Workflow Automation**: Reduce repetitive tasks that interrupt creative problem-solving
- **Error Prevention**: Catch common mistakes before they become bugs or deployment issues

## 🖥️ **Local Model Recommendations**

Running Qwen Code locally provides complete privacy and control over your development workflow. Based on extensive testing, these model configurations deliver excellent performance:

### ⚡ **High-Speed Development** - `qwen/qwen3-4b-2507`
- **Performance**: 120+ tokens/second on dual RTX 3090 setup
- **Context Window**: 190k tokens with KV quantization + Flash Attention enabled
- **Best for**: Code completion, simple refactoring, documentation, basic analysis
- **Experience**: Comparable to Gemini Flash in Gemini CLI - fast, responsive, and highly effective for routine development tasks
- **Why it works**: The enhanced system prompts and instructions make this lightweight model punch well above its weight class

### 🧠 **Complex Problem Solving** - `qwen/qwen3-30b-a3b-2507`  
- **Performance**: Slower but significantly more capable reasoning
- **Context Window**: 131k tokens with KV quantization + Flash Attention enabled
- **Best for**: Architecture decisions, complex refactoring, debugging challenging issues, system design
- **When to use**: Multi-step problems requiring deep analysis and planning
- **Note**: While thinking modes can help, the raw capability often delivers results faster than waiting for step-by-Step reasoning

### ⚙️ **Configuration Notes**
- **KV Quantization**: Enables massive context windows but may cause tool repetition loops - disable if you encounter this issue
- **Without KV Quant**: Context window reduces to ~96k tokens but eliminates repetition issues and reduces VRAM consumption
- **Flash Attention**: Essential for handling large context windows efficiently

### 💡 **Usage Strategy**
Start with the 4B model for immediate feedback and rapid iteration. Switch to the 30B model when you encounter problems that require deeper reasoning or when the 4B model's suggestions need more sophistication. The speed difference makes this workflow practical - use fast local inference for the majority of tasks, reserving the larger model for complex challenges.

This local setup eliminates API costs and latency while maintaining professional-grade AI assistance throughout your development workflow.

---

# Qwen Code

<div align="center">

![Qwen Code Screenshot](./docs/assets/qwen-screenshot.png)

[![npm version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)
[![License](https://img.shields.io/github/license/QwenLM/qwen-code.svg)](./LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Downloads](https://img.shields.io/npm/dm/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

**AI-powered command-line workflow tool for developers**

[Installation](#installation) • [Quick Start](#quick-start) • [Features](#key-features) • [Documentation](./docs/) • [Contributing](./CONTRIBUTING.md)

</div>

<div align="center">
  
  <!-- Keep these links. Translations will automatically update with the README. -->
  <a href="https://readme-i18n.com/de/QwenLM/qwen-code">Deutsch</a> | 
  <a href="https://readme-i18n.com/es/QwenLM/qwen-code">Español</a> | 
  <a href="https://readme-i18n.com/fr/QwenLM/qwen-code">français</a> | 
  <a href="https://readme-i18n.com/ja/QwenLM/qwen-code">日本語</a> | 
  <a href="https://readme-i18n.com/ko/QwenLM/qwen-code">한국어</a> | 
  <a href="https://readme-i18n.com/pt/QwenLM/qwen-code">Português</a> | 
  <a href="https://readme-i18n.com/ru/QwenLM/qwen-code">Русский</a> | 
  <a href="https://readme-i18n.com/zh/QwenLM/qwen-code">中文</a>
  
</div>

Qwen Code is a powerful command-line AI workflow tool adapted from [**Gemini CLI**](https://github.com/google-gemini/gemini-cli) ([details](./README.gemini.md)), specifically optimized for [Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder) models. It enhances your development workflow with advanced code understanding, automated tasks, and intelligent assistance.

## 💡 Free Options Available

Get started with Qwen Code at no cost using any of these free options:

### 🔥 Qwen OAuth (Recommended)

- **2,000 requests per day** with no token limits
- **60 requests per minute** rate limit
- Simply run `qwen` and authenticate with your qwen.ai account
- Automatic credential management and refresh
- Use `/auth` command to switch to Qwen OAuth if you have initialized with OpenAI compatible mode

### 🌏 Regional Free Tiers

- **Mainland China**: ModelScope offers **2,000 free API calls per day**
- **International**: OpenRouter provides **up to 1,000 free API calls per day** worldwide

For detailed setup instructions, see [Authorization](#authorization).

> [!WARNING]
> **Token Usage Notice**: Qwen Code may issue multiple API calls per cycle, resulting in higher token usage (similar to Claude Code). We're actively optimizing API efficiency.

## Key Features

- **Code Understanding & Editing** - Query and edit large codebases beyond traditional context window limits
- **Workflow Automation** - Automate operational tasks like handling pull requests and complex rebases
- **Enhanced Parser** - Adapted parser specifically optimized for Qwen-Coder models

## Installation

### Prerequisites

Ensure you have [Node.js version 20](https://nodejs.org/en/download) or higher installed.

```bash
curl -qL https://www.npmjs.com/install.sh | sh
```

### Install from npm

```bash
npm install -g @qwen-code/qwen-code@latest
qwen --version
```

### Install from source

```bash
git clone https://github.com/QwenLM/qwen-code.git
cd qwen-code
npm install
npm install -g .
```

## Quick Start

```bash
# Start Qwen Code
qwen

# Example commands
> Explain this codebase structure
> Help me refactor this function
> Generate unit tests for this module
```

### Session Management

Control your token usage with configurable session limits to optimize costs and performance.

#### Configure Session Token Limit

Create or edit `.qwen/settings.json` in your home directory:

```json
{
  "sessionTokenLimit": 32000
}
```

#### Session Commands

- **`/compress`** - Compress conversation history to continue within token limits
- **`/clear`** - Clear all conversation history and start fresh
- **`/stats`** - Check current token usage and limits

> 📝 **Note**: Session token limit applies to a single conversation, not cumulative API calls.

### Authorization

Choose your preferred authentication method based on your needs:

#### 1. Qwen OAuth (🚀 Recommended - Start in 30 seconds)

The easiest way to get started - completely free with generous quotas:

```bash
# Just run this command and follow the browser authentication
qwen
```

**What happens:**

1. **Instant Setup**: CLI opens your browser automatically
2. **One-Click Login**: Authenticate with your qwen.ai account
3. **Automatic Management**: Credentials cached locally for future use
4. **No Configuration**: Zero setup required - just start coding!

**Free Tier Benefits:**

- ✅ **2,000 requests/day** (no token counting needed)
- ✅ **60 requests/minute** rate limit
- ✅ **Automatic credential refresh**
- ✅ **Zero cost** for individual users
- ℹ️ **Note**: Model fallback may occur to maintain service quality

#### 2. OpenAI-Compatible API

Use API keys for OpenAI or other compatible providers:

**Configuration Methods:**

1. **Environment Variables**

   ```bash
   export OPENAI_API_KEY="your_api_key_here"
   export OPENAI_BASE_URL="your_api_endpoint"
   export OPENAI_MODEL="your_model_choice"
   ```

2. **Project `.env` File**
   Create a `.env` file in your project root:
   ```env
   OPENAI_API_KEY=your_api_key_here
   OPENAI_BASE_URL=your_api_endpoint
   OPENAI_MODEL=your_model_choice
   ```

**API Provider Options**

> ⚠️ **Regional Notice:**
>
> - **Mainland China**: Use Alibaba Cloud Bailian or ModelScope
> - **International**: Use Alibaba Cloud ModelStudio or OpenRouter

<details>
<summary><b>🇨🇳 For Users in Mainland China</b></summary>

**Option 1: Alibaba Cloud Bailian** ([Apply for API Key](https://bailian.console.aliyun.com/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

**Option 2: ModelScope (Free Tier)** ([Apply for API Key](https://modelscope.cn/docs/model-service/API-Inference/intro))

- ✅ **2,000 free API calls per day**
- ⚠️ Connect your Aliyun account to avoid authentication errors

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
export OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
```

</details>

<details>
<summary><b>🌍 For International Users</b></summary>

**Option 1: Alibaba Cloud ModelStudio** ([Apply for API Key](https://modelstudio.console.alibabacloud.com/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

**Option 2: OpenRouter (Free Tier Available)** ([Apply for API Key](https://openrouter.ai/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export OPENAI_MODEL="qwen/qwen3-coder:free"
```

</details>

## Usage Examples

### 🔍 Explore Codebases

```bash
cd your-project/
qwen

# Architecture analysis
> Describe the main pieces of this system's architecture
> What are the key dependencies and how do they interact?
> Find all API endpoints and their authentication methods
```

### 💻 Code Development

```bash
# Refactoring
> Refactor this function to improve readability and performance
> Convert this class to use dependency injection
> Split this large module into smaller, focused components

# Code generation
> Create a REST API endpoint for user management
> Generate unit tests for the authentication module
> Add error handling to all database operations
```

### 🔄 Automate Workflows

```bash
# Git automation
> Analyze git commits from the last 7 days, grouped by feature
> Create a changelog from recent commits
> Find all TODO comments and create GitHub issues

# File operations
> Convert all images in this directory to PNG format
> Rename all test files to follow the *.test.ts pattern
> Find and remove all console.log statements
```

### 🐛 Debugging & Analysis

```bash
# Performance analysis
> Identify performance bottlenecks in this React component
> Find all N+1 query problems in the codebase

# Security audit
> Check for potential SQL injection vulnerabilities
> Find all hardcoded credentials or API keys
```

## Popular Tasks

### 📚 Understand New Codebases

```text
> What are the core business logic components?
> What security mechanisms are in place?
> How does the data flow through the system?
> What are the main design patterns used?
> Generate a dependency graph for this module
```

### 🔨 Code Refactoring & Optimization

```text
> What parts of this module can be optimized?
> Help me refactor this class to follow SOLID principles
> Add proper error handling and logging
> Convert callbacks to async/await pattern
> Implement caching for expensive operations
```

### 📝 Documentation & Testing

```text
> Generate comprehensive JSDoc comments for all public APIs
> Write unit tests with edge cases for this component
> Create API documentation in OpenAPI format
> Add inline comments explaining complex algorithms
> Generate a README for this module
```

### 🚀 Development Acceleration

```text
> Set up a new Express server with authentication
> Create a React component with TypeScript and tests
> Implement a rate limiter middleware
> Add database migrations for new schema
> Configure CI/CD pipeline for this project
```

## Commands & Shortcuts

### Session Commands

- `/help` - Display available commands
- `/clear` - Clear conversation history
- `/compress` - Compress history to save tokens
- `/stats` - Show current session information
- `/exit` or `/quit` - Exit Qwen Code

### Keyboard Shortcuts

- `Ctrl+C` - Cancel current operation
- `Ctrl+D` - Exit (on empty line)
- `Up/Down` - Navigate command history

## Benchmark Results

### Terminal-Bench Performance

| Agent     | Model              | Accuracy |
| --------- | ------------------ | -------- |
| Qwen Code | Qwen3-Coder-480A35 | 37.5%    |
| Qwen Code | Qwen3-Coder-30BA3B | 31.3%    |

## Development & Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to learn how to contribute to the project.

For detailed authentication setup, see the [authentication guide](./docs/cli/authentication.md).

## Troubleshooting

If you encounter issues, check the [troubleshooting guide](docs/troubleshooting.md).

## Acknowledgments

This project is based on [Google Gemini CLI](https://github.com/google-gemini/gemini-cli). We acknowledge and appreciate the excellent work of the Gemini CLI team. Our main contribution focuses on parser-level adaptations to better support Qwen-Coder models.

## License

[LICENSE](./LICENSE)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=QwenLM/qwen-code&type=Date)](https://www.star-history.com/#QwenLM/qwen-code&Date)
