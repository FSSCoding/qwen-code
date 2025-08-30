/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, Config, debugLog } from '@qwen-code/qwen-code-core';
import { USER_SETTINGS_PATH } from './config/settings.js';
import { validateAuthMethod } from './config/auth.js';
import { getModelOverrideManager } from '@qwen-code/qwen-code-core';

function getAuthTypeFromEnv(): AuthType | undefined {
  if (process.env.GOOGLE_GENAI_USE_GCA === 'true') {
    return AuthType.LOGIN_WITH_GOOGLE;
  }
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true') {
    return AuthType.USE_VERTEX_AI;
  }
  if (process.env.GEMINI_API_KEY) {
    return AuthType.USE_GEMINI;
  }
  if (process.env.OPENAI_API_KEY) {
    return AuthType.USE_OPENAI;
  }
  return undefined;
}

export async function validateNonInteractiveAuth(
  configuredAuthType: AuthType | undefined,
  useExternalAuth: boolean | undefined,
  nonInteractiveConfig: Config,
) {
  // CRITICAL FIX: Use provider-resolved authType when available, prevent stale config override
  // When ModelManager resolves authType (e.g., ANTHROPIC_OAUTH), use it instead of stale settings
  const effectiveAuthType = configuredAuthType || getAuthTypeFromEnv();

  if (!effectiveAuthType) {
    console.error(
      `Please set an Auth method in your ${USER_SETTINGS_PATH} or specify one of the following environment variables before running: GEMINI_API_KEY, OPENAI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA`,
    );
    process.exit(1);
  }

  if (!useExternalAuth) {
    const err = validateAuthMethod(effectiveAuthType);
    if (err != null) {
      console.error(err);
      process.exit(1);
    }
  }

  // SMOKING GUN FIX: Preserve runtime model override before refreshAuth destroys it
  const modelOverrideManager = getModelOverrideManager();
  debugLog('validateNonInteractiveAuth - Preserving model override before refreshAuth');
  modelOverrideManager.preserveBeforeRefresh(nonInteractiveConfig);

  await nonInteractiveConfig.refreshAuth(effectiveAuthType);
  
  // SMOKING GUN FIX: Restore runtime model override after refreshAuth
  debugLog('validateNonInteractiveAuth - Restoring model override after refreshAuth');
  modelOverrideManager.restoreAfterRefresh(nonInteractiveConfig);
  
  return nonInteractiveConfig;
}
