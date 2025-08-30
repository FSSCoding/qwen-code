# Upstream Merge Compatibility Guide

## Overview

This guide provides detailed instructions for maintaining the Claude Code Max integration when merging updates from the upstream QwenCode repository. The integration is designed to be merge-safe, but careful attention is required for certain files.

## Quick Reference

### ✅ Safe Files (Low Merge Risk)
These files are new additions and should merge cleanly:

- `packages/core/src/anthropic/` (entire directory)
- `packages/core/src/tests/` (entire directory) 
- `CLAUDE_INTEGRATION_DOCUMENTATION.md`
- `UPSTREAM_MERGE_GUIDE.md`
- `jest.config.js`
- `jest.setup.js`
- `scripts/run-integration-tests.sh`

### ⚠️ Protected Files (Require Careful Review)
These files contain critical integration logic:

- `packages/core/src/core/providerAuthManager.ts` (NEW FILE)
- `packages/core/src/tools/modelManager.ts` (MODIFIED)
- `packages/cli/src/gemini.tsx` (CRITICAL AUTH FIX)
- `packages/cli/src/validateNonInterActiveAuth.ts` (SMOKING GUN FIX)
- `packages/core/src/core/contentGenerator.ts` (FACTORY ADDITIONS)
- `packages/core/src/index.ts` (EXPORTS ADDED)

### 🔴 High-Risk Files (Manual Merge Required)
These files may have significant conflicts:

- `package.json` (test scripts added)
- `.vscode/settings.json` (test configuration added)

## Pre-Merge Checklist

1. **Backup Current Integration**:
   ```bash
   git checkout -b backup-claude-integration
   git push origin backup-claude-integration
   ```

2. **Run Full Test Suite**:
   ```bash
   npm run test:coverage
   npm run test:integration
   ```

3. **Document Current State**:
   ```bash
   git log --oneline --grep="claude" > claude-commits.txt
   git diff upstream/main --name-only > modified-files.txt
   ```

## Merge Strategy

### Step 1: Prepare Merge Environment

```bash
# Create merge branch
git checkout main
git pull origin main
git checkout -b merge-upstream-$(date +%Y%m%d)

# Add upstream remote if not exists
git remote add upstream https://github.com/QwenLM/qwen-code.git
git fetch upstream

# Check what's incoming
git log --oneline HEAD..upstream/main
```

### Step 2: Perform Merge

```bash
# Start merge
git merge upstream/main

# If conflicts occur, continue to Step 3
# If no conflicts, skip to Step 4
```

### Step 3: Resolve Conflicts (If Any)

#### For Protected Files:

1. **Review each conflict carefully**
2. **Preserve Claude integration logic**
3. **Test after each resolution**

#### Common Conflict Patterns:

**In `packages/core/src/core/contentGenerator.ts`:**
```typescript
// KEEP: Claude factory addition
case AuthType.ANTHROPIC_OAUTH:
  return new ClaudeSubprocessGenerator(/* ... */);

// MERGE: Any new upstream factories
case AuthType.NEW_UPSTREAM_TYPE:
  return new NewUpstreamGenerator(/* ... */);
```

**In `packages/cli/src/gemini.tsx`:**
```typescript
// CRITICAL: Keep the auth resolution fix
const { getProviderAuthManager } = await import('@qwen-code/qwen-code-core');
const providerManager = getProviderAuthManager();
const providerResolvedAuthType = providerManager.getEffectiveAuthType(settings.merged.selectedAuthType);

const nonInteractiveConfig = await validateNonInteractiveAuth(
  providerResolvedAuthType || settings.merged.selectedAuthType, // KEEP THIS LINE
  settings.merged.useExternalAuth,
  config,
);
```

**In `packages/cli/src/validateNonInterActiveAuth.ts`:**
```typescript
// CRITICAL: Keep the smoking gun fix
export async function validateNonInteractiveAuth(
  configuredAuthType: AuthType | undefined,
  useExternalAuth: boolean | undefined,
  nonInteractiveConfig: Config,
) {
  const effectiveAuthType = configuredAuthType || getAuthTypeFromEnv();

  // ... validation logic ...

  // CRITICAL: Keep these lines
  const modelOverrideManager = getModelOverrideManager();
  modelOverrideManager.preserveBeforeRefresh(nonInteractiveConfig);

  await nonInteractiveConfig.refreshAuth(effectiveAuthType);
  
  modelOverrideManager.restoreAfterRefresh(nonInteractiveConfig);
  
  return nonInteractiveConfig;
}
```

### Step 4: Post-Merge Validation

```bash
# Build project
npm run build
npm run bundle

# Run Claude-specific tests
npm run test:claude

# Run full integration tests
npm run test:integration

# Verify model switching works
node bundle/gemini.js --prompt "/model list"
node bundle/gemini.js --prompt "/model claude" &
sleep 10
kill %1  # Kill background process
```

### Step 5: Regression Testing

```bash
# Test all model switching scenarios
echo "Testing Claude integration..."
./scripts/run-integration-tests.sh

# Test system prompt preservation
node -e "
const { ModelManagerTool } = require('./packages/core/dist/tools/modelManager.js');
console.log('ModelManager exports:', Object.keys(ModelManagerTool));
"

# Verify no OAuth interference
node -e "
const { getProviderAuthManager } = require('./packages/core/dist/index.js');
const manager = getProviderAuthManager();
const providers = manager.getAllProviders();
console.log('Available providers:', providers.map(p => p.name));
"
```

## Conflict Resolution Patterns

### Pattern 1: Export Additions

**Upstream adds new exports:**
```typescript
// MERGE: Keep both upstream exports and Claude exports
export * from './core/contentGenerator.js';
export * from './core/geminiChat.js';
export * from './core/providerAuthManager.js'; // Claude addition - KEEP
export * from './core/newUpstreamModule.js';   // Upstream addition - KEEP
```

### Pattern 2: Enum Extensions

**Upstream adds new AuthType:**
```typescript
export enum AuthType {
  // ... existing types
  ANTHROPIC_OAUTH = 'anthropic-oauth', // Claude addition - KEEP
  NEW_UPSTREAM_TYPE = 'new-type',      // Upstream addition - KEEP
}
```

### Pattern 3: Factory Pattern Extensions

**Upstream adds new generator:**
```typescript
export function createContentGeneratorConfig(config: Config, authType: AuthType) {
  switch (authType) {
    // ... existing cases
    case AuthType.ANTHROPIC_OAUTH:        // Claude addition - KEEP
      return new ClaudeSubprocessGenerator(/* ... */);
    case AuthType.NEW_UPSTREAM_TYPE:      // Upstream addition - KEEP
      return new NewUpstreamGenerator(/* ... */);
  }
}
```

## Testing After Merge

### Critical Test Scenarios

1. **Model Switching**:
   ```bash
   # Test all model switches
   for model in claude qwen4b qwen4t qwen32 gpt20; do
     echo "Testing switch to $model..."
     timeout 30 node bundle/gemini.js --prompt "/model $model" || echo "Failed: $model"
   done
   ```

2. **AuthType Resolution**:
   ```bash
   # Test auth resolution
   node -e "
   const { getProviderAuthManager } = require('./packages/core/dist/index.js');
   const manager = getProviderAuthManager();
   manager.setActiveProvider('claude-code-max');
   const authType = manager.getEffectiveAuthType();
   console.log('Claude AuthType:', authType);
   console.assert(authType === 'anthropic-oauth', 'AuthType resolution broken');
   console.log('✅ AuthType resolution working');
   "
   ```

3. **System Prompt Preservation**:
   ```bash
   # Test preserve/restore cycle
   npm run test -- --testNamePattern="system prompt preservation"
   ```

## Rollback Procedure

If the merge breaks Claude integration:

```bash
# Quick rollback
git reset --hard backup-claude-integration

# Or selective rollback
git checkout backup-claude-integration -- packages/cli/src/gemini.tsx
git checkout backup-claude-integration -- packages/cli/src/validateNonInterActiveAuth.ts
git checkout backup-claude-integration -- packages/core/src/core/contentGenerator.ts
```

## Integration Health Check

Create a simple health check script:

```bash
#!/bin/bash
# claude-health-check.sh

echo "🔍 Claude Integration Health Check"

# Check exports
if node -e "const { getProviderAuthManager } = require('./packages/core/dist/index.js')" 2>/dev/null; then
  echo "✅ Provider manager exports working"
else
  echo "❌ Provider manager exports broken"
  exit 1
fi

# Check model manager
if node -e "const { ModelManagerTool } = require('./packages/core/dist/tools/modelManager.js')" 2>/dev/null; then
  echo "✅ Model manager working"
else
  echo "❌ Model manager broken"
  exit 1
fi

# Check Claude CLI detection
if [ -f "packages/core/dist/anthropic/claudeSubprocessGenerator.js" ]; then
  echo "✅ Claude subprocess generator present"
else
  echo "❌ Claude subprocess generator missing"
  exit 1
fi

echo "🎉 Claude integration healthy"
```

## Version Compatibility Matrix

| Upstream Version | Integration Version | Status | Notes |
|------------------|-------------------|---------|--------|
| v0.0.9 | v1.0.0 | ✅ Tested | Current baseline |
| v0.1.0 | v1.0.0 | 🧪 Testing | Future compatibility |

## Communication Plan

### Before Major Merges

1. **Announce in team channels**
2. **Schedule maintenance window**
3. **Prepare rollback plan**

### During Merge

1. **Document all conflicts**
2. **Test each resolution**
3. **Keep team updated**

### After Merge

1. **Run full test suite**
2. **Deploy to staging first**
3. **Monitor for regressions**

## Feature Flag Strategy

Implement feature flags for easy disable during problematic merges:

```typescript
// Environment-based feature flag
const CLAUDE_INTEGRATION_ENABLED = process.env.ENABLE_CLAUDE_INTEGRATION !== 'false';

if (!CLAUDE_INTEGRATION_ENABLED) {
  // Fall back to standard behavior
  return standardContentGenerator(config, authType);
}
```

## Maintenance Schedule

- **Weekly**: Check for upstream updates
- **Monthly**: Test merge compatibility
- **Before Major Releases**: Full integration review

## Support Contacts

- **Integration Issues**: Check this guide first
- **Merge Conflicts**: Review conflict resolution patterns
- **Test Failures**: Run health check script

---

This guide ensures the Claude Code Max integration remains stable and functional across upstream updates while maintaining the investment in this significant feature enhancement.