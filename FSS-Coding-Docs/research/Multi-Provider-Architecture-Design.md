# 🏗️ Multi-Provider Architecture Design

**Design Date**: August 28, 2025  
**Status**: 🎯 **COMPREHENSIVE DESIGN**  
**Integration**: Built on ModelOverrideManager foundation  

## 🎯 Executive Summary

This design extends our **ModelOverrideManager** smoking gun solution to support **robust multi-provider authentication** across all major AI providers. The architecture handles complex authorization patterns, session-based testing, and provides seamless provider switching with fallback support.

## 🏛️ Core Architecture

### Enhanced ModelOverrideManager Integration
```typescript
// Extended from our existing smoking gun solution
export class ModelOverrideManager {
  private static instance: ModelOverrideManager | null = null;
  private runtimeModelOverride: string | null = null;
  private runtimeProviderOverride: ProviderConfig | null = null;  // NEW
  private configInstances: WeakSet<Config> = new WeakSet();
  private providerManager: ProviderAuthManager;  // NEW
}
```

### New Provider Authentication Manager
```typescript
export class ProviderAuthManager {
  private providers: Map<string, ProviderConfig> = new Map();
  private sessionCredentials: Map<string, SessionAuth> = new Map();
  private activeProvider: string | null = null;
}
```

## 🔐 Provider Configuration System

### Provider Types & Authentication Patterns

#### 1. Universal Gateway Provider (OpenRouter)
```typescript
interface OpenRouterConfig extends ProviderConfig {
  type: 'universal-gateway';
  name: 'openrouter';
  displayName: 'OpenRouter (400+ Models)';
  baseUrl: 'https://openrouter.ai/api/v1';
  authType: 'api-key';
  apiKeyEnvVar: 'OPENROUTER_API_KEY';
  models: {
    'claude-sonnet-4': 'anthropic/claude-sonnet-4',
    'gpt-4': 'openai/gpt-4',
    'gemini-2.5-pro': 'google/gemini-2.5-pro-preview',
    'qwen3-32b': 'qwen/qwen3-32b:free'
  };
  features: ['fallback-routing', 'usage-analytics', 'credit-limits'];
}
```

#### 2. Direct API Provider (OpenAI, Gemini, etc.)
```typescript
interface DirectAPIConfig extends ProviderConfig {
  type: 'direct-api';
  name: 'openai' | 'gemini' | 'qwen-direct';
  authType: 'api-key';
  baseUrl: string;
  apiKeyEnvVar: string;
  models: Record<string, string>;
}
```

#### 3. Plan-Based Provider (Claude Code Max)
```typescript
interface PlanBasedConfig extends ProviderConfig {
  type: 'plan-based';
  name: 'claude-code-max';
  authType: 'oauth-personal';
  loginCommand: 'claude login';
  rateLimits: {
    weekly: number;
    rolling: number;
    windowHours: number;
  };
}
```

#### 4. Local Provider (Ollama, LM Studio)
```typescript
interface LocalConfig extends ProviderConfig {
  type: 'local';
  name: 'ollama' | 'lmstudio';
  baseUrl: string;
  authType: 'none' | 'optional-key';
  autoDetect: boolean;
  healthCheck: string;
}
```

## 🔄 Session-Based Testing Framework

### Temporary Authentication System
```typescript
export class SessionAuthManager {
  private sessionCredentials: Map<string, TemporaryAuth> = new Map();
  
  /**
   * Create temporary session for testing provider
   */
  async createTestSession(
    provider: string,
    credentials: AuthCredentials,
    duration: number = 3600  // 1 hour default
  ): Promise<SessionToken> {
    const sessionToken = this.generateSessionToken();
    const expiry = Date.now() + (duration * 1000);
    
    this.sessionCredentials.set(sessionToken, {
      provider,
      credentials,
      expiry,
      isTemporary: true
    });
    
    return sessionToken;
  }
  
  /**
   * Use session credentials for requests
   */
  async useSessionAuth(sessionToken: string): Promise<AuthCredentials | null> {
    const session = this.sessionCredentials.get(sessionToken);
    if (!session || Date.now() > session.expiry) {
      this.cleanupSession(sessionToken);
      return null;
    }
    return session.credentials;
  }
}
```

### Testing Flow Design
```typescript
// User testing flow
const testSession = await sessionAuth.createTestSession('openrouter', {
  apiKey: 'sk-or-temp-key-for-testing',
  baseUrl: 'https://openrouter.ai/api/v1'
}, 1800);  // 30 minutes

// Switch to test session temporarily
modelManager.setTestSession(testSession);

// Test with different models
await testProviderModel('claude-sonnet-4', 'Hello world test');
await testProviderModel('gpt-4', 'Another test');

// Session expires automatically or can be cleared
sessionAuth.clearSession(testSession);
```

## 🔧 Provider Integration Architecture

### Enhanced ContentGeneratorConfig Creation
```typescript
export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
  providerOverride?: ProviderConfig  // NEW
): ContentGeneratorConfig {
  const modelOverrideManager = getModelOverrideManager();
  const providerManager = modelOverrideManager.getProviderManager();
  
  // 1. Determine effective provider
  const effectiveProvider = providerOverride || 
                           providerManager.getActiveProvider() ||
                           providerManager.getDefaultProvider();
  
  // 2. Get effective model with provider context
  const effectiveModel = modelOverrideManager.getEffectiveModel(config, effectiveProvider);
  
  // 3. Apply provider-specific configuration
  return providerManager.createProviderConfig(effectiveProvider, effectiveModel, config);
}
```

### Provider Factory Pattern
```typescript
export class ProviderConfigFactory {
  private static factories: Map<string, ProviderFactory> = new Map();
  
  static registerProvider(name: string, factory: ProviderFactory): void {
    this.factories.set(name, factory);
  }
  
  static createConfig(provider: ProviderConfig, model: string, config: Config): ContentGeneratorConfig {
    const factory = this.factories.get(provider.name);
    if (!factory) {
      throw new Error(`Unsupported provider: ${provider.name}`);
    }
    return factory.createConfig(provider, model, config);
  }
}
```

## 🛡️ Enhanced Smoking Gun Protection

### Provider-Aware Preservation
```typescript
// Enhanced validateNonInteractiveAuth with provider support
export async function validateNonInteractiveAuth(
  configuredAuthType: AuthType | undefined,
  useExternalAuth: boolean | undefined,
  nonInteractiveConfig: Config,
) {
  const modelOverrideManager = getModelOverrideManager();
  
  // SMOKING GUN FIX: Preserve BOTH model AND provider overrides
  console.log('DEBUG: Preserving model AND provider overrides before refreshAuth');
  modelOverrideManager.preserveBeforeRefresh(nonInteractiveConfig);
  
  // Get effective auth type considering provider override
  const effectiveAuthType = modelOverrideManager.getEffectiveAuthType(configuredAuthType);
  
  await nonInteractiveConfig.refreshAuth(effectiveAuthType);
  
  // SMOKING GUN FIX: Restore BOTH model AND provider overrides
  console.log('DEBUG: Restoring model AND provider overrides after refreshAuth');
  modelOverrideManager.restoreAfterRefresh(nonInteractiveConfig);
  
  return nonInteractiveConfig;
}
```

## 📊 Provider Management Interface

### Enhanced Model Switcher Tool
```typescript
// Extended /model command with provider support
interface ModelSwitcherParams {
  action?: 'list' | 'add' | 'switch' | 'test' | 'providers';
  provider?: string;  // NEW: Specify provider
  model?: string;
  nickname?: string;
  sessionDuration?: number;  // NEW: For testing sessions
  temporary?: boolean;  // NEW: Session-only vs persistent
}

// Examples:
// /model providers                          - List all providers
// /model test openrouter gpt-4 30          - Test OpenRouter GPT-4 for 30 minutes
// /model add claude-max claude-sonnet-4    - Add Claude Max provider model
// /model switch openrouter:claude-sonnet-4 - Switch to OpenRouter Claude
```

### Provider Status Dashboard
```typescript
interface ProviderStatus {
  name: string;
  status: 'active' | 'available' | 'error' | 'rate-limited';
  rateLimits?: {
    remaining: number;
    resetTime: Date;
  };
  lastUsed?: Date;
  costToday?: number;
  modelsAvailable: number;
}
```

## 🔄 Fallback Chain Management

### Intelligent Provider Fallbacks
```typescript
export class FallbackChainManager {
  private chains: Map<string, ProviderChain> = new Map();
  
  /**
   * Define fallback chain for model categories
   */
  setFallbackChain(category: string, chain: ProviderFallback[]): void {
    this.chains.set(category, {
      primary: chain[0],
      fallbacks: chain.slice(1)
    });
  }
  
  /**
   * Execute request with automatic fallbacks
   */
  async executeWithFallback(
    category: string, 
    request: any
  ): Promise<any> {
    const chain = this.chains.get(category);
    if (!chain) throw new Error(`No fallback chain for ${category}`);
    
    for (const provider of [chain.primary, ...chain.fallbacks]) {
      try {
        return await this.executeRequest(provider, request);
      } catch (error) {
        console.log(`Provider ${provider.name} failed, trying next...`);
        continue;
      }
    }
    
    throw new Error('All providers in fallback chain failed');
  }
}
```

### Example Fallback Chains
```typescript
// Coding assistance chain
fallbackManager.setFallbackChain('coding', [
  { provider: 'claude-code-max', model: 'claude-sonnet-4' },
  { provider: 'openrouter', model: 'anthropic/claude-sonnet-4' },
  { provider: 'openai', model: 'gpt-4' },
  { provider: 'ollama', model: 'qwen3-coder' }
]);

// General chat chain  
fallbackManager.setFallbackChain('chat', [
  { provider: 'openrouter', model: 'qwen/qwen3-32b:free' },
  { provider: 'ollama', model: 'llama3.1' },
  { provider: 'lmstudio', model: 'local-model' }
]);
```

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Current)
- ✅ **ModelOverrideManager** (smoking gun solution)
- 🎯 **ProviderAuthManager** (new component)
- 🎯 **Session-based testing** (temporary auth)

### Phase 2: Provider Integration
- 🎯 **OpenRouter integration** (universal gateway)
- 🎯 **Local model support** (Ollama, LM Studio)
- 🎯 **Enhanced model switcher tool**

### Phase 3: Advanced Features  
- 🎯 **Claude Code Max integration**
- 🎯 **Fallback chain management**
- 🎯 **Usage analytics and monitoring**

### Phase 4: Enterprise Features
- 🎯 **Encrypted credential storage**
- 🎯 **Team configuration sharing**
- 🎯 **Advanced cost management**

## 🎯 Success Criteria

### For User Testing
- ✅ **Session-based testing**: "I can test OpenRouter for 30 minutes with temp key"
- ✅ **Multiple providers**: "I can test Claude, OpenAI, Gemini, Qwen, local models"
- ✅ **Hot-swapping**: "Model switching works across all providers"  
- ✅ **Persistent settings**: "My preferred provider survives restarts"

### For Robustness
- ✅ **No smoking guns**: Provider switching survives all Config recreations
- ✅ **Graceful fallbacks**: Automatic fallback when primary provider fails
- ✅ **Error handling**: Clear error messages for auth failures
- ✅ **Rate limit handling**: Automatic switching when limits hit

---

**This architecture delivers on the user's vision: "fucking robust" multi-provider support with easy testing, hot-swapping, and extensibility for future providers.** 🚀