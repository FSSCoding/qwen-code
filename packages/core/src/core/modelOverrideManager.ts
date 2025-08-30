/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { getProviderAuthManager, ProviderAuthManager, ProviderConfig, AuthCredentials } from './providerAuthManager.js';
import { debugLog } from '../utils/debugLog.js';

/**
 * Singleton manager that preserves runtime model overrides across Config recreation cycles.
 * This solves the smoking gun issue where validateNonInteractiveAuth() destroys model changes.
 * Enhanced with multi-provider support for robust authentication handling.
 */
export class ModelOverrideManager {
  private static instance: ModelOverrideManager | null = null;
  private runtimeModelOverride: string | null = null;
  private runtimeProviderOverride: string | null = null;  // NEW
  private configInstances: WeakSet<Config> = new WeakSet();
  private providerManager: ProviderAuthManager;  // NEW

  private constructor() {
    this.providerManager = getProviderAuthManager();
  }

  public static getInstance(): ModelOverrideManager {
    if (!ModelOverrideManager.instance) {
      ModelOverrideManager.instance = new ModelOverrideManager();
    }
    return ModelOverrideManager.instance;
  }

  /**
   * Sets a runtime model override that persists across Config recreations
   */
  public setRuntimeModel(model: string): void {
    debugLog(`ModelOverrideManager - Setting runtime model: ${model}`);
    this.runtimeModelOverride = model;
  }

  /**
   * Gets the current runtime model override
   */
  public getRuntimeModel(): string | null {
    return this.runtimeModelOverride;
  }

  /**
   * Clears the runtime model override
   */
  public clearRuntimeModel(): void {
    debugLog('ModelOverrideManager - Clearing runtime model override');
    this.runtimeModelOverride = null;
  }

  /**
   * Registers a Config instance to receive runtime model overrides
   */
  public registerConfig(config: Config): void {
    this.configInstances.add(config);
    
    debugLog(`ModelOverrideManager - Registering config, current runtime override: ${this.runtimeModelOverride}`);
    
    // Apply current override if one exists
    if (this.runtimeModelOverride) {
      debugLog(`ModelOverrideManager - Applying runtime model ${this.runtimeModelOverride} to new Config instance`);
      config.setRuntimeModel(this.runtimeModelOverride);
    } else {
      debugLog('ModelOverrideManager - No runtime override to apply to new Config instance');
    }
  }

  /**
   * Gets the effective model (runtime override or base model)
   * Enhanced with provider-aware model resolution
   */
  public getEffectiveModel(config: Config, providerOverride?: ProviderConfig): string {
    // Check for runtime model override first
    const runtimeModel = this.runtimeModelOverride || config.getRuntimeModel();
    if (runtimeModel) {
      debugLog(`ModelOverrideManager - Using runtime model: ${runtimeModel}`);
      return this.resolveModelWithProvider(runtimeModel, providerOverride);
    }
    
    // Fall back to base model
    const baseModel = config.getModel();
    debugLog(`ModelOverrideManager - Using base model: ${baseModel}`);
    return this.resolveModelWithProvider(baseModel, providerOverride);
  }

  /**
   * Resolve model name with provider context
   */
  private resolveModelWithProvider(modelName: string, providerOverride?: ProviderConfig): string {
    const provider = providerOverride || this.providerManager.getActiveProvider();
    if (!provider || !provider.models) {
      return modelName;
    }

    // If the model name is a nickname in the provider's model map, resolve it
    const resolvedModel = provider.models[modelName];
    if (resolvedModel) {
      debugLog(`ModelOverrideManager - Resolved ${modelName} to ${resolvedModel} via provider ${provider.name}`);
      return resolvedModel;
    }

    return modelName;
  }

  /**
   * NEW: Get provider manager instance
   */
  public getProviderManager(): ProviderAuthManager {
    return this.providerManager;
  }

  /**
   * NEW: Set runtime provider override
   */
  public setRuntimeProvider(provider: string): void {
    debugLog(`ModelOverrideManager - Setting runtime provider override: ${provider}`);
    this.runtimeProviderOverride = provider;
    this.providerManager.setActiveProvider(provider);
  }

  /**
   * NEW: Get runtime provider override
   */
  public getRuntimeProvider(): string | null {
    return this.runtimeProviderOverride;
  }

  /**
   * NEW: Clear runtime provider override
   */
  public clearRuntimeProvider(): void {
    debugLog('ModelOverrideManager - Clearing runtime provider override');
    this.runtimeProviderOverride = null;
  }

  /**
   * NEW: Create test session for provider testing
   */
  public async createTestSession(
    provider: string, 
    credentials: AuthCredentials, 
    duration?: number
  ): Promise<string> {
    return await this.providerManager.createTestSession(provider, credentials, duration);
  }

  /**
   * NEW: Activate test session
   */
  public activateTestSession(sessionToken: string): boolean {
    const result = this.providerManager.activateTestSession(sessionToken);
    if (result) {
      debugLog(`ModelOverrideManager - Test session activated`);
    }
    return result;
  }

  /**
   * NEW: Get effective auth type considering provider
   */
  public getEffectiveAuthType(fallback?: any): any {
    return this.providerManager.getEffectiveAuthType(fallback);
  }

  /**
   * Enhanced preserve method that saves both model and provider
   */
  public preserveBeforeRefresh(config: Config): void {
    // CRITICAL FIX: Preserve ModelOverrideManager's own runtime model first
    if (this.runtimeModelOverride) {
      debugLog(`ModelOverrideManager - Already has runtime model override: ${this.runtimeModelOverride}`);
    } else {
      // Fall back to config's runtime model if ModelOverrideManager doesn't have one
      const currentRuntimeModel = config.getRuntimeModel();
      if (currentRuntimeModel) {
        debugLog(`ModelOverrideManager - Preserving runtime model before refreshAuth: ${currentRuntimeModel}`);
        this.runtimeModelOverride = currentRuntimeModel;
      }
    }

    const currentProvider = this.providerManager.getActiveProvider();
    if (currentProvider) {
      debugLog(`ModelOverrideManager - Preserving runtime provider before refreshAuth: ${currentProvider.name}`);
      this.runtimeProviderOverride = currentProvider.name;
    }
  }

  /**
   * Enhanced restore method that restores both model and provider
   */
  public restoreAfterRefresh(config: Config): void {
    if (this.runtimeModelOverride) {
      debugLog(`ModelOverrideManager - Restoring runtime model after refreshAuth: ${this.runtimeModelOverride}`);
      config.setRuntimeModel(this.runtimeModelOverride);
    }

    if (this.runtimeProviderOverride) {
      debugLog(`ModelOverrideManager - Restoring runtime provider after refreshAuth: ${this.runtimeProviderOverride}`);
      this.providerManager.setActiveProvider(this.runtimeProviderOverride);
    }
  }

  /**
   * Debug information about current state
   */
  public getDebugInfo(): {
    hasRuntimeOverride: boolean;
    runtimeModel: string | null;
    runtimeProvider: string | null;
    configInstanceCount: number;
    providerDebug: any;
  } {
    return {
      hasRuntimeOverride: this.runtimeModelOverride !== null,
      runtimeModel: this.runtimeModelOverride,
      runtimeProvider: this.runtimeProviderOverride,
      configInstanceCount: 0, // WeakSet doesn't have size property
      providerDebug: this.providerManager.getDebugInfo(),
    };
  }
}

/**
 * Convenience function to get the singleton instance
 */
export function getModelOverrideManager(): ModelOverrideManager {
  return ModelOverrideManager.getInstance();
}