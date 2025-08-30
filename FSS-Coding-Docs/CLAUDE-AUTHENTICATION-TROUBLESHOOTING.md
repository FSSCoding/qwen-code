# Claude Code Max Authentication - Troubleshooting Guide

## Quick Status Check

### ✅ Working Components (Verified):
- Model profile loading: `/home/bob/.qwen/model-profiles.json`
- AuthType resolution: `anthropic-oauth` correctly identified
- Claude CLI credential detection: `~/.claude/.credentials.json`
- AnthropicContentGenerator creation
- Token validation and expiration checking

### ⚠️ Known Issue:
- **API Routing**: Responses may still come from local Qwen model instead of Claude Code Max
- **Root Cause**: Final API call routing needs adjustment in AnthropicContentGenerator

## Diagnostic Commands

### 1. Check Current Model Profile:
```bash
cat /home/bob/.qwen/model-profiles.json | jq '.current, .models[] | select(.nickname == "claude")'
```

**Expected Output:**
```json
"claude"
{
  "nickname": "claude",
  "displayName": "Claude Code Max", 
  "model": "claude-sonnet-4-20250514",
  "provider": "claude-code-max",
  "authType": "anthropic-oauth",
  "description": "Claude with Anthropic OAuth authentication"
}
```

### 2. Verify Claude CLI Credentials:
```bash
ls -la ~/.claude/.credentials.json && echo "File exists ✅"
```

### 3. Test Authentication Flow:
```bash
echo "test auth" | node bundle/gemini.js 2>&1 | grep -E "(Loading model|authType|ContentGenerator|CLAUDE DEBUG)"
```

**Expected Output:**
```
[DEBUG] Loading model from profile "claude": claude-sonnet-4-20250514 (claude-code-max, anthropic-oauth)
[DEBUG] Final resolved authType: anthropic-oauth
🚀 ContentGenerator.createContentGenerator: authType=anthropic-oauth, model=claude-sonnet-4-20250514
🎯 ContentGenerator: ANTHROPIC_OAUTH route detected - creating AnthropicContentGenerator
✅ Using credentials from official Claude CLI
✅ ContentGenerator: Successfully created AnthropicContentGenerator
```

### 4. Check Token Validity:
```bash
echo "token test" | timeout 5s node bundle/gemini.js 2>&1 | grep -E "(Token expired|expires at|current time)"
```

**Expected Output:**
```
🔍 CLAUDE DEBUG: Token expired? false
🔍 CLAUDE DEBUG: Token expires at: [future timestamp]
🔍 CLAUDE DEBUG: Current time: [current timestamp]
```

## Common Issues & Solutions

### Issue 1: Wrong AuthType in Profile
**Symptoms:**
- Debug shows `authType=local-lmstudio` instead of `anthropic-oauth`
- System routes to local model despite switching

**Solution:**
```bash
# Check current authType
cat /home/bob/.qwen/model-profiles.json | jq '.models[] | select(.nickname == "claude") | .authType'

# If it shows "oauth-personal", fix it:
cp /home/bob/.qwen/model-profiles.json /home/bob/.qwen/model-profiles.json.backup
sed -i 's/"authType": "oauth-personal"/"authType": "anthropic-oauth"/g' /home/bob/.qwen/model-profiles.json
```

### Issue 2: Missing Claude CLI Credentials  
**Symptoms:**
- Error: "Claude Code Max authentication required"
- Missing `~/.claude/.credentials.json`

**Solution:**
```bash
# Install Claude CLI if needed
npm install -g @anthropics/claude

# Authenticate with Claude Code Max
claude login

# Verify credentials created
ls -la ~/.claude/.credentials.json
```

### Issue 3: Expired Token
**Symptoms:**
- Debug shows "Token expired? true"
- API calls fail with auth errors

**Solution:**
```bash
# Re-authenticate with Claude CLI
claude login

# Test again
echo "test" | node bundle/gemini.js 2>&1 | grep "Token expired"
```

### Issue 4: Profile Not Loading
**Symptoms:**
- Debug shows default model instead of claude-sonnet-4-20250514
- Missing profile loading logs

**Solution:**
```bash
# Verify profile file exists and has correct format
cat /home/bob/.qwen/model-profiles.json | jq '.'

# Check current model is set
cat /home/bob/.qwen/model-profiles.json | jq '.current'

# If current is not "claude", fix it:
jq '.current = "claude"' /home/bob/.qwen/model-profiles.json > /tmp/profiles.json && mv /tmp/profiles.json /home/bob/.qwen/model-profiles.json
```

## Error Patterns & Meanings

### ✅ Success Indicators:
```
[DEBUG] Loading model from profile "claude"
[DEBUG] Final resolved authType: anthropic-oauth  
🎯 ContentGenerator: ANTHROPIC_OAUTH route detected
✅ Using credentials from official Claude CLI
✅ Successfully created AnthropicContentGenerator
```

### ❌ Failure Indicators:
```
🏠 ContentGenerator: LOCAL_LMSTUDIO route detected    # Wrong authType
❌ CLAUDE DEBUG: No official Claude CLI credentials   # Missing credentials  
❌ CLAUDE DEBUG: Token is expired                     # Need to re-auth
❌ No model profiles found                            # Missing profile file
```

## API Routing Issue (Current)

### Symptoms:
- All authentication steps work correctly
- Model switching UI shows success
- But responses still come from local Qwen model: *"I'm Qwen Code, an interactive CLI agent..."*

### Technical Details:
- Authentication: ✅ Working
- Token Loading: ✅ Working  
- AnthropicContentGenerator: ✅ Created
- API Calls: ⚠️ May be falling back to local model

### Debugging API Routing:
```bash
# Check if API calls are hitting Anthropic
echo "What model are you?" | node bundle/gemini.js 2>&1 | grep -E "(OpenAI API|Anthropic|404|401|403)"

# Look for network errors
echo "test" | node bundle/gemini.js 2>&1 | grep -E "(Error|Failed|status code)"
```

### Next Steps for API Routing:
1. Verify Anthropic API endpoint configuration
2. Check OpenAI/Anthropic compatibility layer
3. Ensure request format matches Anthropic API spec
4. Add request/response debugging in AnthropicContentGenerator

## Manual Override Test

If you need to force Claude authentication for testing:
```bash
# Set explicit environment variables
export OPENAI_MODEL="claude-sonnet-4-20250514" 
unset OPENAI_BASE_URL

# Test with explicit profile
echo '{"current": "claude", "models": [{"nickname": "claude", "model": "claude-sonnet-4-20250514", "provider": "claude-code-max", "authType": "anthropic-oauth", "displayName": "Claude Code Max"}]}' > /tmp/test-profile.json

# Copy to profile location
cp /tmp/test-profile.json /home/bob/.qwen/model-profiles.json

# Test authentication
echo "test" | node bundle/gemini.js
```

## Success Verification

### Complete Success Checklist:
- [ ] Model profile loads: `claude-sonnet-4-20250514`
- [ ] AuthType resolves: `anthropic-oauth`  
- [ ] Claude credentials found and valid
- [ ] AnthropicContentGenerator created
- [ ] Token not expired
- [ ] **API responses come from Claude** (in progress)

### When Fully Working, You Should See:
```
> /model claude
✅ Switched to: Claude Code Max

> Hello, what model are you?
✦ I'm Claude, an AI assistant created by Anthropic. I'm Claude 3.5 Sonnet, specifically the claude-sonnet-4-20250514 model. How can I help you today?
```

**Current Status**: Authentication infrastructure complete, API routing needs final adjustment.