# QwenCode Documentation

This directory contains technical documentation for QwenCode's enhanced model switching and multi-provider capabilities.

## Claude Code Max Integration

**Status**: Successfully integrated Claude Code Max authentication and model switching

See implementation details: **[Claude Authentication - Complete Solution](CLAUDE-AUTHENTICATION-COMPLETE-SOLUTION.md)**

## Documentation

### Authentication & Implementation
- **[Claude Authentication - Complete Solution](CLAUDE-AUTHENTICATION-COMPLETE-SOLUTION.md)** - Complete authentication infrastructure implementation
- **[Anthropic Native Implementation Plan](ANTHROPIC-NATIVE-IMPLEMENTATION-PLAN.md)** - Technical implementation plan for native Anthropic API
- **[Claude Authentication Implementation Summary](CLAUDE-AUTHENTICATION-IMPLEMENTATION-SUMMARY.md)** - Implementation summary and architecture

### Analysis & Architecture
- **[Model Switching Deep Analysis](./Model-Switching-Deep-Analysis.md)** - Multi-model architecture design and analysis
- **[Multi-Provider Implementation Complete](./MULTI-PROVIDER-IMPLEMENTATION-COMPLETE.md)** - Multi-provider support implementation
- **[Model Switching Solution Complete](./MODEL-SWITCHING-SOLUTION-COMPLETE.md)** - Complete model switching solution
- **[Provider Testing Guide](./PROVIDER-TESTING-GUIDE.md)** - Testing guide for different providers
- **[RAG System Quality Report](./RAG-System-Quality-Report.md)** - RAG system analysis and recommendations

## Features

This QwenCode fork provides enhanced model switching capabilities including:

- **Multiple Models**: Seamless switching between local and cloud models
- **Multiple Providers**: Claude Code Max, OpenRouter, local endpoints, custom providers
- **Hot Swapping**: Change models without session restart
- **Authentication**: Secure OAuth and API key management
- **Model Profiles**: Easy model configuration and management

## Getting Started

Use the model manager to switch between different AI models:

```bash
# List available models
/model list

# Switch to Claude
/model claude  

# Switch to local models
/model qwen4b

# Add new model profiles
/model add <nickname> <model-name> [provider]
```

## Architecture

The system uses a provider-based architecture with:
- **ModelManager**: Handles model profile management and switching
- **ProviderAuthManager**: Manages authentication for different providers  
- **ContentGenerator**: Provider-specific content generation
- **ModelOverrideManager**: Runtime model switching and configuration preservation