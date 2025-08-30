# 🔍 SMOKING GUN REPORT: Model Reversion Root Cause

**Investigation Date**: 2025-08-28  
**Status**: ✅ **ROOT CAUSE IDENTIFIED**  
**Severity**: 🔴 **CRITICAL ARCHITECTURE FLAW**

## 🎯 Executive Summary

The QwenCode model switching reversion bug has been **definitively traced** to a single function call that occurs **on every user prompt**. The smoking gun is `refreshAuth()` being called from `validateNonInteractiveAuth()` which completely recreates the ContentGeneratorConfig, wiping out any runtime model changes.

## 🔥 The Smoking Gun Call Stack

```
Every User Prompt/Command
├── main() [gemini.tsx:~530-540]
├── validateNonInteractiveAuth() [validateNonInterActiveAuth.ts:27]
├── refreshAuth(effectiveAuthType) [validateNonInterActiveAuth.ts:49]  ⚡ SMOKING GUN
└── ContentGeneratorConfig recreation [config.ts:281]
    └── 💥 Runtime model overrides DESTROYED
```

## 📋 Detailed Evidence

### 1. The Trigger Point
**File**: `/MASTERFOLDER/QwenCode/packages/cli/src/gemini.tsx`  
**Location**: ~Line 530-540 (in runNonInteractive function)

```typescript
const nonInteractiveConfig = await validateNonInteractiveAuth(
  settings.merged.selectedAuthType,
  settings.merged.useExternalAuth, 
  config,
);
```

**Frequency**: Called on **EVERY SINGLE USER PROMPT**

### 2. The Smoking Gun Function  
**File**: `/MASTERFOLDER/QwenCode/packages/cli/src/validateNonInterActiveAuth.ts`  
**Line**: 49

```typescript
await nonInteractiveConfig.refreshAuth(effectiveAuthType);
```

**Purpose**: Validate authentication before processing each prompt  
**Side Effect**: 💥 **DESTROYS ALL RUNTIME MODEL CHANGES**

### 3. The Destruction Point
**File**: `/MASTERFOLDER/QwenCode/packages/core/src/config/config.ts`  
**Method**: `refreshAuth()` at line 281  
**Action**: Creates fresh ContentGeneratorConfig, wiping runtime overrides

```typescript
// From our debug logs - this is what kills model changes:
DEBUG: refreshAuth call stack: Error
    at Config.refreshAuth (file:///MASTERFOLDER/QwenCode/packages/core/dist/src/config/config.js:281:55)
    at validateNonInteractiveAuth (file:///MASTERFOLDER/QwenCode/packages/cli/dist/src/validateNonInterActiveAuth.js:37:32)  
    at main (file:///MASTERFOLDER/QwenCode/packages/cli/dist/src/gemini.js:234:40)
```

## 🔬 Technical Analysis

### Why This Happens
1. **Design Intent**: `validateNonInteractiveAuth` was designed to ensure valid authentication before each prompt
2. **Unintended Consequence**: The auth validation completely recreates the content generator configuration
3. **Architecture Flaw**: No separation between auth validation and configuration persistence
4. **Timing**: This happens **after** model switching but **before** prompt processing

### The Exact Flow
```
User types: "hello world"
├── QwenCode processes command
├── Loads config (may include previous /model changes)  ✅ Model override present
├── validateNonInteractiveAuth() called
├── refreshAuth() called  
├── NEW ContentGeneratorConfig created  ❌ Model override GONE  
├── Prompt processed with DEFAULT model
└── User sees wrong model response
```

## 💡 Why Previous Attempts Failed

All our previous attempts failed because we were trying to:
- ✗ Fix symptoms (environment variables, single config updates)
- ✗ Add persistence without addressing the recreation cycle
- ✗ Override individual components instead of the root cause

The real issue was that **every user interaction triggers a complete configuration recreation**.

## 🎯 The Solution Architecture

### Immediate Fix Required
The `validateNonInteractiveAuth` function must be modified to:
1. **Preserve existing runtime model overrides** before calling refreshAuth
2. **Restore runtime model overrides** after auth validation  
3. **Separate auth validation from configuration recreation**

### Implementation Strategy
```typescript
// In validateNonInteractiveAuth.ts
export async function validateNonInteractiveAuth(
  configuredAuthType: AuthType | undefined,
  useExternalAuth: boolean | undefined,
  nonInteractiveConfig: Config,
) {
  // PRESERVE runtime model before auth validation
  const runtimeModel = nonInteractiveConfig.getRuntimeModel();
  
  // Existing auth validation logic...
  await nonInteractiveConfig.refreshAuth(effectiveAuthType);
  
  // RESTORE runtime model after auth validation  
  if (runtimeModel) {
    nonInteractiveConfig.setRuntimeModel(runtimeModel);
  }
  
  return nonInteractiveConfig;
}
```

## 📊 Impact Assessment

### Current State
- 🔴 Model switching works until next prompt
- 🔴 User must restart session for model changes to persist  
- 🔴 Poor user experience with model switching
- 🔴 Architecture doesn't support hot-swapping

### Post-Fix State  
- 🟢 Model switching persists across all prompts
- 🟢 No session restart required
- 🟢 Proper hot-swapping capability
- 🟢 Foundation for advanced multi-model architecture

## 🚨 Critical Priority

This is a **Severity 1 architectural flaw** that affects core functionality. The smoking gun has been identified and the fix is straightforward - we need to modify the `validateNonInteractiveAuth` function to preserve runtime model overrides across auth validation cycles.

## 📝 Next Steps

1. ✅ **SMOKING GUN IDENTIFIED** - Complete ✅
2. 🎯 **Implement preservation logic** in validateNonInteractiveAuth  
3. 🧪 **Test model switching persistence** 
4. 🏗️ **Build advanced ModelOverrideManager** architecture
5. 🔒 **Implement secure credential storage**

---

**The hunt is over. We found the smoking gun. Now we fix it.** 🎯