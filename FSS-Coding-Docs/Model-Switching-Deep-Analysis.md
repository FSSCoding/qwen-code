# QwenCode Model Switching Deep Analysis & Implementation Plan

## Executive Summary

We're building a comprehensive model switching system that transcends QwenCode's current limitations. This document analyzes the current architecture, identifies the core issues, and provides a roadmap for building a superior multi-model, multi-auth system.

## Current Investigation Status

### 🔍 **Problem Identified: ContentGenerator Caching Issue**

**The Core Issue**: QwenCode creates fresh `ContentGeneratorConfig` instances during session lifecycle, bypassing our runtime model changes.

**Evidence from Debug Output**:
```
DEBUG: refreshAuth called with authMethod: openai current model: qwen/qwen3-4b-thinking-2507 ✅
DEBUG: getModel() called - contentGeneratorConfig.model: qwen/qwen3-4b-2507 ❌ OLD MODEL APPEARS
```

**Key Finding**: Even though our settings update works and `config.getModel()` returns the correct model, somewhere in the initialization chain, a stale `contentGeneratorConfig` with the old model gets created and cached.

---

## 1. Authentication Flow Analysis

### Current QwenCode Auth Architecture

```typescript
// From settings.json
"selectedAuthType": "openai" | "qwen_oauth" | "gemini" | "login_with_google"
```

### Auth Type Flow Mapping

#### **OpenAI Auth Path** (Current User)
```
config.ts:554 → model: argv.model || settings.model || DEFAULT_GEMINI_MODEL
    ↓
createContentGeneratorConfig(config, AuthType.USE_OPENAI)
    ↓
contentGeneratorConfig.model = config.getModel() || DEFAULT_GEMINI_MODEL
    ↓
createContentGenerator(config, gcConfig) → new OpenAIContentGenerator(config, gcConfig)
    ↓
this.model = contentGeneratorConfig.model (Line 111 in openaiContentGenerator.ts)
```

#### **Critical Bottleneck Points**
1. **Line 446 in config.ts**: `newGeminiClient.initialize(newContentGeneratorConfig)` - Creates fresh client
2. **Line 93 in contentGenerator.ts**: `config.getModel() || DEFAULT_GEMINI_MODEL` - Model resolution
3. **Line 111 in openaiContentGenerator.ts**: `this.model = contentGeneratorConfig.model` - Final assignment

### Auth Configuration Storage Locations

| Auth Type | Config Location | Security Level |
|-----------|----------------|----------------|
| OpenAI | Environment vars (`OPENAI_API_KEY`, `OPENAI_BASE_URL`) | ⚠️ Primitive |
| Qwen OAuth | Dynamic token management | ✅ Secure |
| Gemini | Environment vars (`GEMINI_API_KEY`) | ⚠️ Primitive |
| Google OAuth | Token-based authentication | ✅ Secure |

---

## 2. ContentGenerator Lifecycle Deep Trace

### Initialization Sequence

```mermaid
graph TD
    A[QwenCode Startup] --> B[Load Settings]
    B --> C[Create Config Instance]
    C --> D[config.initialize()]
    D --> E[createToolRegistry()]
    E --> F[validateNonInteractiveAuth()]
    F --> G[config.refreshAuth()]
    G --> H[createContentGeneratorConfig()]
    H --> I[new GeminiClient()]
    I --> J[geminiClient.initialize()]
    J --> K[createContentGenerator()]
    K --> L[new OpenAIContentGenerator()]
```

### **Problem Points in Lifecycle**

1. **Multiple Config Creation**: New `Config` instances wipe runtime overrides
2. **RefreshAuth Triggers**: Called during startup, auth changes, and error recovery
3. **ContentGenerator Caching**: No persistence mechanism for runtime model changes

### Current State Persistence Analysis

| Component | State Persistence | Issue |
|-----------|------------------|-------|
| `settings.json` | ✅ Persistent | Only baseline model, no profiles |
| `Config.runtimeModel` | ❌ Instance-only | Lost on new Config creation |
| `ContentGeneratorConfig` | ❌ Temporary | Recreated on every refreshAuth |
| Environment Variables | ✅ Session-wide | Primitive, single-value only |

---

## 3. Current Model Switching Implementation Analysis

### What Works ✅
- Settings file updates persist across sessions
- Environment variable updates work within single Config instance
- Runtime model override works temporarily
- Tool integration with global config reference

### What Fails ❌
- **Config Recreation**: New instances bypass runtime overrides
- **RefreshAuth Interference**: Wipes out runtime changes
- **No Profile System**: Only single model persistence
- **Auth Type Limitations**: Different auth types have different model loading paths

### Debug Evidence of Failure Pattern
```
[Startup] base model: qwen3-coder-plus (default)
[Settings Load] base model: qwen/qwen3-4b-thinking-2507 ✅ (from settings)
[RefreshAuth] contentGeneratorConfig.model: qwen/qwen3-4b-2507 ❌ (stale cache?)
[Tool Switch] runtimeModel: qwen/qwen3-4b-thinking-2507 ✅ (our override)
[Next Command] runtimeModel: null ❌ (new Config instance)
```

---

## 4. Superior Multi-Model Architecture Design

### **Core Principles**
1. **Profile-Based System**: Store multiple model configurations, not just one
2. **Secure Credential Storage**: Encrypted local storage, not environment variables
3. **Per-Profile Authentication**: Each model profile has its own auth configuration
4. **Hot-Swapping**: Change models without session restart
5. **Persistence Layer**: Survive Config recreation and refreshAuth cycles

### **Proposed Architecture**

#### **Enhanced Model Profile Structure**
```typescript
interface ModelProfile {
  nickname: string;           // 6-char identifier (claude, 4bdev, 30big)
  displayName: string;        // User-friendly name
  model: string;              // Model identifier
  authType: AuthType;         // Authentication method
  
  // Endpoint Configuration
  baseUrl?: string;           // API endpoint
  apiKey?: string;            // Encrypted storage
  
  // Metadata
  description?: string;       // Performance notes
  performance?: {
    tokensPerSecond?: number;
    contextWindow?: number;
    notes?: string;
  };
  
  // Usage Tracking
  lastUsed: Date;
  usageCount: number;
}

interface ModelProfileStorage {
  profiles: Record<string, ModelProfile>;
  activeProfile: string;
  encryptionKey: string;      // For credential encryption
}
```

#### **Secure Storage Architecture**
```typescript
class SecureModelStorage {
  private storageFile = join(homedir(), '.qwen', 'secure-models.json');
  
  async saveProfile(profile: ModelProfile): Promise<void> {
    // Encrypt sensitive data before storage
    const encrypted = this.encryptCredentials(profile);
    await this.writeSecureFile(encrypted);
  }
  
  async getActiveProfile(): Promise<ModelProfile | null> {
    const storage = await this.loadSecureFile();
    const profileData = storage.profiles[storage.activeProfile];
    return this.decryptCredentials(profileData);
  }
  
  private encryptCredentials(profile: ModelProfile): ModelProfile {
    // Use system keychain or encrypted storage
    return {
      ...profile,
      apiKey: profile.apiKey ? this.encrypt(profile.apiKey) : undefined
    };
  }
}
```

#### **Persistent Model Override System**
```typescript
class ModelOverrideManager {
  private static instance: ModelOverrideManager;
  private activeProfile: ModelProfile | null = null;
  
  // Hooks into Config lifecycle
  onConfigCreation(config: Config): void {
    if (this.activeProfile) {
      config.setModel(this.activeProfile.model);
      this.updateEnvironmentForProfile(this.activeProfile);
    }
  }
  
  onRefreshAuth(config: Config, authMethod: AuthType): void {
    // Ensure active profile survives refreshAuth
    if (this.activeProfile) {
      this.reapplyModelOverride(config);
    }
  }
  
  async switchProfile(nickname: string): Promise<void> {
    const profile = await this.storage.getProfile(nickname);
    this.activeProfile = profile;
    
    // Apply to all existing Config instances
    this.applyToAllConfigs(profile);
    
    // Update persistent storage
    await this.storage.setActiveProfile(nickname);
  }
}
```

---

## 5. Multi-Endpoint Support Architecture

### **Endpoint Categories**

#### **1. Claude Code Max Integration**
```typescript
interface ClaudeCodeMaxProfile extends ModelProfile {
  authType: 'claude_code_max';
  subscriptionTier: 'pro' | 'team' | 'enterprise';
  browserAuth: boolean;       // OAuth through browser
  sessionToken?: string;      // Encrypted storage
}
```

#### **2. OpenRouter Integration**  
```typescript
interface OpenRouterProfile extends ModelProfile {
  authType: 'openrouter';
  apiKey: string;             // Encrypted
  baseUrl: 'https://openrouter.ai/api/v1';
  modelOptions: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
}
```

#### **3. Local Endpoint Support**
```typescript
interface LocalEndpointProfile extends ModelProfile {
  authType: 'local';
  baseUrl: string;            // http://192.168.1.5:1234/v1
  authentication: 'none' | 'bearer' | 'basic';
  credentials?: {
    username?: string;        // Encrypted
    password?: string;        // Encrypted  
    bearerToken?: string;     // Encrypted
  };
}
```

#### **4. Custom Provider Support**
```typescript
interface CustomProviderProfile extends ModelProfile {
  authType: 'custom';
  provider: string;           // anthropic, openai, cohere, etc.
  customHeaders?: Record<string, string>;
  rateLimiting?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}
```

---

## 6. Security Architecture

### **Credential Storage Security**

#### **Encryption Strategy**
```typescript
class CredentialEncryption {
  // Use system-specific secure storage
  private getSystemKeychain(): SecureStorage {
    switch (process.platform) {
      case 'darwin': return new MacOSKeychain();
      case 'win32': return new WindowsCredentialManager();
      case 'linux': return new LinuxSecretService();
      default: return new EncryptedFileStorage();
    }
  }
  
  async storeCredential(profileId: string, key: string, value: string): Promise<void> {
    const keychain = this.getSystemKeychain();
    await keychain.setPassword(`qwencode-${profileId}`, key, value);
  }
}
```

#### **Access Control**
```typescript
interface SecurityPolicy {
  requireConfirmation: boolean;     // Confirm before switching to external APIs
  allowedDomains: string[];         // Whitelist for endpoints
  blockExternalAccess: boolean;     // Block non-local endpoints
  maxCredentialAge: number;         // Rotate credentials
  auditLogging: boolean;            // Log all model switches
}
```

### **Safe Defaults**
- **Local-First**: Default to local endpoints when available
- **Confirmation Required**: Prompt before switching to external paid APIs
- **Credential Expiration**: Auto-expire stored credentials
- **Usage Tracking**: Monitor API usage and costs per profile

---

## 7. Implementation Roadmap

### **Phase 1: Core Architecture** ⏱️ Week 1-2
1. **Secure Storage Layer**: Implement encrypted profile storage
2. **Override Manager**: Build persistent model override system  
3. **Config Integration**: Hook into Config lifecycle events
4. **Basic UI**: Enhance model switcher with profile management

### **Phase 2: Multi-Auth Support** ⏱️ Week 2-3
1. **Auth Type Expansion**: Support all major providers
2. **Credential Management**: Secure storage for each auth type
3. **Browser OAuth**: Claude Code Max integration
4. **Local Discovery**: Auto-detect local model servers

### **Phase 3: Advanced Features** ⏱️ Week 3-4
1. **Profile Templates**: Quick setup for common configurations
2. **Usage Analytics**: Track performance and costs per model
3. **Smart Switching**: Automatic model selection based on task type
4. **Backup/Sync**: Profile backup and cross-device sync

### **Phase 4: Enterprise Features** ⏱️ Week 4+
1. **Team Profiles**: Shared model configurations
2. **Policy Enforcement**: Security policies and restrictions
3. **Audit Logging**: Comprehensive usage tracking
4. **API Cost Management**: Budget controls and alerts

---

## 8. Immediate Next Steps

### **Fix Current Issue First**
1. **Identify RefreshAuth Trigger**: Find what's calling refreshAuth during normal operation
2. **ContentGenerator Persistence**: Make runtime model changes survive Config recreation
3. **Testing Framework**: Comprehensive test suite for model switching

### **Begin Architecture Implementation**
1. **Create SecureModelStorage class**
2. **Implement ModelOverrideManager singleton**
3. **Hook into Config lifecycle events**
4. **Build enhanced profile management UI**

---

## 9. RAG System Quality Assessment

### **Critical Failures Encountered**
1. **Code Content Indexing**: RAG searches for core functions returned generic config files instead of source code
2. **Collection Gaps**: QwenCode collection contained docs/config rather than implementation files
3. **Semantic Limitations**: Searches returned irrelevant results from different projects
4. **Keyword Matching**: Complete failure to find exact function names that exist in codebase

### **Required Improvements**
- **Source Code Priority**: Index .ts/.js files with higher priority than docs
- **Function-Level Chunking**: Maintain context across related functions
- **Collection Isolation**: Strict boundaries to prevent cross-contamination
- **Technical Term Weighting**: Exact matches for function names and technical terms

---

## Conclusion

This isn't just about fixing QwenCode's model switching - we're building a superior architecture that makes multi-model, multi-provider AI development actually practical. With secure credential storage, hot-swapping capabilities, and comprehensive auth support, this becomes the killer feature that makes our fork indispensable.

**The Vision**: `/model claude` → `/model 30big` → `/model gpt4` → seamlessly working with any model, any provider, any endpoint, with enterprise-grade security and local-first defaults.

---

## Technical Appendix

### Debug Evidence Log
```
[2025-08-28 14:18] Model switch initiated to 'think4'
[2025-08-28 14:18] Settings updated successfully: "model": "qwen/qwen3-4b-thinking-2507"
[2025-08-28 14:18] Runtime model override applied: qwen/qwen3-4b-thinking-2507
[2025-08-28 14:18] RefreshAuth triggered during startup
[2025-08-28 14:18] ISSUE: ContentGeneratorConfig created with stale model: qwen/qwen3-4b-2507
[2025-08-28 14:18] RESULT: User prompt processed with wrong model
```

### File Locations
- **Main Config**: `/MASTERFOLDER/QwenCode/packages/core/src/config/config.ts:446`
- **ContentGenerator**: `/MASTERFOLDER/QwenCode/packages/core/src/core/contentGenerator.ts:93`
- **OpenAI Generator**: `/MASTERFOLDER/QwenCode/packages/core/src/core/openaiContentGenerator.ts:111`
- **Model Switcher**: `/MASTERFOLDER/QwenCode/packages/core/src/tools/modelSwitcherWorking.ts`

---

**Status**: Investigation Complete | Implementation Ready | Architecture Designed
**Priority**: Critical - Core functionality blocker
**Impact**: Enables superior multi-model development workflow