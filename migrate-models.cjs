#!/usr/bin/env node

/**
 * Migration utility to convert old model configurations to new ModelManager format
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const OLD_SETTINGS_FILE = path.join(os.homedir(), '.qwen', 'models.json');
const NEW_SETTINGS_FILE = path.join(os.homedir(), '.qwen', 'model-profiles.json');

// Provider detection logic (matching modelManager.ts)
function detectProvider(model, baseUrl) {
  // Claude models
  if (model.includes('claude') || model.includes('anthropic')) {
    return { provider: 'anthropic', authType: 'oauth-personal' };
  }
  
  // Gemini models
  if (model.includes('gemini')) {
    return { provider: 'gemini', authType: 'gemini-api-key' };
  }
  
  // Local endpoints
  if (baseUrl?.includes('localhost') || baseUrl?.includes('127.0.0.1')) {
    if (baseUrl.includes('11434')) {
      return { provider: 'ollama', authType: 'openai' };
    }
    if (baseUrl.includes('1234')) {
      return { provider: 'lmstudio', authType: 'openai' };
    }
    return { provider: 'lmstudio', authType: 'openai' };
  }
  
  // OpenRouter
  if (baseUrl?.includes('openrouter.ai')) {
    return { provider: 'openrouter', authType: 'openai' };
  }
  
  // Qwen models
  if (model.includes('qwen')) {
    if (baseUrl?.includes('qwen.ai')) {
      return { provider: 'qwen-direct', authType: 'openai' };
    }
    return { provider: 'lmstudio', authType: 'openai' }; // Local Qwen
  }
  
  // Default to OpenAI-compatible
  return { provider: 'openai', authType: 'openai' };
}

async function migrateModelSettings() {
  try {
    // Check if old settings exist
    const oldData = await fs.readFile(OLD_SETTINGS_FILE, 'utf-8').catch(() => null);
    if (!oldData) {
      console.log('No existing model settings found.');
      return;
    }

    const oldSettings = JSON.parse(oldData);
    console.log(`Found ${oldSettings.models?.length || 0} existing models to migrate.`);

    // Convert to new format
    const newSettings = {
      models: [],
      current: oldSettings.current
    };

    if (oldSettings.models) {
      for (const oldModel of oldSettings.models) {
        const { provider, authType } = detectProvider(oldModel.model, oldModel.baseUrl);
        
        const newModel = {
          nickname: oldModel.nickname,
          displayName: oldModel.displayName,
          model: oldModel.model,
          provider,
          authType,
          baseUrl: oldModel.baseUrl,
          description: oldModel.description,
          lastUsed: new Date(oldModel.lastUsed)
        };

        newSettings.models.push(newModel);
        console.log(`Migrated "${oldModel.nickname}" → Provider: ${provider}`);
      }
    }

    // Save new settings
    await fs.writeFile(NEW_SETTINGS_FILE, JSON.stringify(newSettings, null, 2));
    console.log(`✅ Migration complete! Saved ${newSettings.models.length} models to model-profiles.json`);

    // Backup old settings
    const backupFile = OLD_SETTINGS_FILE + '.backup';
    await fs.copyFile(OLD_SETTINGS_FILE, backupFile);
    console.log(`📁 Old settings backed up to: ${backupFile}`);

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrateModelSettings();