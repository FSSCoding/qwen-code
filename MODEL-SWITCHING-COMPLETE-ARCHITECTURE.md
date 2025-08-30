# QWENCODE MODEL SWITCHING - COMPLETE ARCHITECTURE DOCUMENTATION

## 🚨 CRITICAL PROBLEM ANALYSIS

### The User's Core Requirement
**"Model switching must work MID-SESSION without restart"**
- UI shows switched model ✅ 
- **HTTP API calls to LM Studio must use NEW model** ❌ (STILL FAILING)

### Root Cause Analysis - Multiple Caching Layers

QwenCode has **MULTIPLE LEVELS** of model caching that ALL must be updated:

```
USER COMMAND: /model gpt20
     ↓
1. ModelSwitcherTool (our code) ✅ Working
     ↓ 
2. Config.contentGeneratorConfig ✅ Working 
     ↓
3. Config.contentGenerator ✅ Working (we recreate this)
     ↓
4. Config.geminiClient ❌ NOT UPDATED (SMOKING GUN LEVEL 2)
     ↓
5. GeminiClient.contentGenerator ❌ CACHED OLD MODEL (REAL ISSUE)
     ↓
6. OpenAIContentGenerator.model ❌ CACHED OLD MODEL (FINAL ISSUE)
     ↓
7. OpenAI HTTP Client ❌ USES OLD MODEL IN API CALLS
```

## 🔥 THE SMOKING GUNS DISCOVERED

### Smoking Gun Level 1: OpenAIContentGenerator Caching
**File**: `/packages/core/src/core/openaiContentGenerator.ts:111`
```typescript
constructor(contentGeneratorConfig: ContentGeneratorConfig, gcConfig: Config) {
  this.model = contentGeneratorConfig.model;  // ❌ CACHED AT CONSTRUCTION
  this.client = new OpenAI({
    baseURL: contentGeneratorConfig.baseUrl   // ❌ CACHED AT CONSTRUCTION  
  });
}
```
**Problem**: Once created, never updates even when config changes

### Smoking Gun Level 2: GeminiClient ContentGenerator Caching  
**File**: `/packages/core/src/core/client.ts:650+`
```typescript
export class GeminiClient {
  private contentGenerator?: ContentGenerator;  // ❌ CACHED INSTANCE
  
  async initialize(contentGeneratorConfig: ContentGeneratorConfig) {
    this.contentGenerator = await createContentGenerator(  // ❌ SET ONCE
      contentGeneratorConfig,
      this.config,
    );
  }
}
```
**Problem**: GeminiClient.contentGenerator is set once and never updated

### Smoking Gun Level 3: Config GeminiClient Caching
**File**: `/packages/core/src/config/config.ts:890+`
```typescript
export class Config {
  private geminiClient!: GeminiClient;  // ❌ CACHED INSTANCE
  
  async initializeContentGeneratorConfig(authType: AuthType) {
    const newGeminiClient = new GeminiClient(this);
    await newGeminiClient.initialize(newContentGeneratorConfig);
    this.geminiClient = newGeminiClient;  // ❌ SET ONCE
  }
}
```

## 🎯 COMPLETE SOLUTION ARCHITECTURE

### Files Modified

#### 1. ModelOverrideManager (Singleton Pattern)
**File**: `/packages/core/src/core/modelOverrideManager.ts`
```typescript
export class ModelOverrideManager {
  private static instance: ModelOverrideManager | null = null;
  private runtimeModelOverride: string | null = null;
  
  public setRuntimeModel(model: string): void {
    this.runtimeModelOverride = model;
  }
  
  public getEffectiveModel(config: Config): string {
    return this.runtimeModelOverride || config.getModel();
  }
}
```
**Purpose**: Singleton to maintain model override across all Config instances

#### 2. Enhanced ContentGenerator Factory  
**File**: `/packages/core/src/core/contentGenerator.ts:78+`
```typescript
export function createContentGeneratorConfig(config: Config, authType: AuthType) {
  // SMOKING GUN FIX: Use ModelOverrideManager to get effective model
  const modelOverrideManager = getModelOverrideManager();
  const effectiveModel = modelOverrideManager.getEffectiveModel(config);
  
  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,  // ✅ Uses runtime override if available
    authType,
    baseUrl: config.getOpenaiBaseUrl() || process.env.OPENAI_BASE_URL,
    // ... other config
  };
}
```

#### 3. Smoking Gun Fix Integration
**File**: `/packages/cli/src/validateNonInterActiveAuth.ts:45+`  
```typescript
export async function validateNonInteractiveAuth(config: Config) {
  // SMOKING GUN FIX: Preserve runtime model override before refreshAuth destroys it
  const modelOverrideManager = getModelOverrideManager();
  modelOverrideManager.preserveBeforeRefresh(config);
  
  await nonInteractiveConfig.refreshAuth(effectiveAuthType);
  
  // SMOKING GUN FIX: Restore runtime model override after refreshAuth  
  modelOverrideManager.restoreAfterRefresh(nonInteractiveConfig);
}
```
**Purpose**: Prevents refreshAuth from destroying model overrides on every prompt

#### 4. Model Switcher Tool - ULTIMATE FIX
**File**: `/packages/core/src/tools/modelSwitcherWorking.ts:380+`
```typescript
case 'switch': {
  // 1. Update environment variables
  process.env.OPENAI_MODEL = found.model;
  process.env.OPENAI_BASE_URL = found.baseUrl;
  
  // 2. Set ModelOverrideManager runtime override  
  const modelOverrideManager = getModelOverrideManager();
  modelOverrideManager.setRuntimeModel(found.model);
  
  // 3. Update Config base model
  globalConfigReference.setModel(found.model);
  globalConfigReference.setRuntimeModel(found.model);
  
  // 4. Create new ContentGeneratorConfig (uses ModelOverrideManager.getEffectiveModel)
  const newContentGeneratorConfig = createContentGeneratorConfig(globalConfigReference, authType);
  
  // 5. ULTIMATE CRUX: Force GeminiClient re-initialization 
  const geminiClient = globalConfigReference.getGeminiClient();
  await geminiClient.initialize(newContentGeneratorConfig);  // ❌ CRITICAL: This recreates contentGenerator
  
  // 6. Update config references as backup
  (globalConfigReference as any).contentGeneratorConfig = newContentGeneratorConfig;
}
```

### Global Config Reference Setup
**File**: `/packages/core/src/config/config.ts:210+`
```typescript
// Set global reference for model switching
import { setGlobalConfigReference } from '../tools/modelSwitcherWorking.js';

export class Config {
  constructor() {
    // ... initialization
    setGlobalConfigReference(this);  // ✅ Make config available to model switcher
  }
}
```

## 🔍 DEBUG LOGGING ARCHITECTURE

### Debug Log File
**Location**: `~/.qwen/debug-logs/model-switching.log`

### Debug Script  
**File**: `/MASTERFOLDER/QwenCode/debug-model-switching.js`
```bash
# Monitor real-time
tail -f ~/.qwen/debug-logs/model-switching.log

# View complete log  
cat ~/.qwen/debug-logs/model-switching.log
```

### Key Debug Points
```typescript
// contentGenerator.ts
console.log('DEBUG: createContentGeneratorConfig - effectiveModel selected:', effectiveModel);

// modelSwitcherWorking.ts  
console.log('CRUX FIX: Re-initializing GeminiClient with new model');
console.log('CRUX FIX: GeminiClient re-initialized successfully');
```

## 🚀 EXECUTION SEQUENCE

### Successful Model Switch Flow:
1. User runs `/model gpt20`
2. ModelSwitcherTool.execute() called
3. Environment vars updated: `OPENAI_MODEL=openai/gpt-oss-20b`
4. ModelOverrideManager.setRuntimeModel("openai/gpt-oss-20b")  
5. Config.setModel() and Config.setRuntimeModel() 
6. createContentGeneratorConfig() → uses ModelOverrideManager.getEffectiveModel()
7. **GeminiClient.initialize(newConfig)** ← CRITICAL STEP
8. New OpenAIContentGenerator created with new model
9. HTTP calls to LM Studio use NEW model

### Expected Debug Log Output:
```
[timestamp] createContentGeneratorConfig - effectiveModel selected: openai/gpt-oss-20b
[timestamp] CRUX FIX: Re-initializing GeminiClient with new model  
[timestamp] CRUX FIX: GeminiClient re-initialized successfully
```

## ⚠️ FAILURE SCENARIOS

### If Model Switch Still Fails:
1. **Check debug log** for missing "CRUX FIX" messages
2. **Multiple GeminiClient instances** - more than one cached somewhere
3. **HTTP requests bypassing GeminiClient** - direct OpenAI client usage
4. **Missing globalConfigReference** - model switcher can't access Config
5. **Async timing issues** - initialize() not completed before next request

## 🔧 REBUILD INSTRUCTIONS

### From Scratch Setup:
1. Create ModelOverrideManager singleton
2. Add ModelOverrideManager to validateNonInteractiveAuth
3. Enhance createContentGeneratorConfig to use ModelOverrideManager  
4. Add setGlobalConfigReference to Config constructor
5. Create ModelSwitcherTool with ULTIMATE CRUX fix
6. Register ModelSwitcherTool in Config
7. Add /model command routing

### Critical Integration Points:
- **validateNonInteractiveAuth**: Preserve overrides across refreshAuth
- **createContentGeneratorConfig**: Use effective model from ModelOverrideManager  
- **GeminiClient.initialize**: Must be called on model switch
- **Environment variables**: Must be updated for external integrations

## 🎯 SUCCESS CRITERIA

### User Test:
1. Start QwenCode
2. Run `/model list` - see available models
3. Run `/model <nickname>` - see "NO RESTART NEEDED!"  
4. Send test message - HTTP call to LM Studio uses NEW model
5. UI shows NEW model in context display
6. Debug log shows successful re-initialization

**CRITICAL**: Step 4 is the final test - the actual HTTP request body to LM Studio must contain the new model name, not the old one.