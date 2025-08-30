/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_QWEN_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';

import { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { getModelOverrideManager } from './modelOverrideManager.js';
import { debugLog } from '../utils/debugLog.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  USE_OPENAI = 'openai',
  USE_ANTHROPIC = 'anthropic-api-key',
  ANTHROPIC_OAUTH = 'anthropic-oauth',
  QWEN_OAUTH = 'qwen-oauth',
  LOCAL_LMSTUDIO = 'local-lmstudio',
  LOCAL_OLLAMA = 'local-ollama',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  enableOpenAILogging?: boolean;
  // Timeout configuration in milliseconds
  timeout?: number;
  // Maximum retries for failed requests
  maxRetries?: number;
  samplingParams?: {
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    temperature?: number;
    max_tokens?: number;
  };
  proxy?: string | undefined;
  userAgent?: string;
};

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): ContentGeneratorConfig {
  debugLog('createContentGeneratorConfig called - authType:', authType, 'config.getModel():', config.getModel());
  
  // SMOKING GUN FIX: Use Config's authType if it's more specific than the passed authType
  const configAuthType = (config as any).authType;
  const effectiveAuthType = configAuthType || authType;
  debugLog('createContentGeneratorConfig - using effectiveAuthType:', effectiveAuthType, 'from config:', configAuthType, 'passed:', authType);
  
  // Log to model switch file for debugging
  import('../utils/modelSwitchLogger.js').then(({ logModelSwitch }) => {
    logModelSwitch(`createContentGeneratorConfig called - authType: ${authType}, effectiveAuthType: ${effectiveAuthType}, config.getModel(): ${config.getModel()}`);
  }).catch(() => {
    // Ignore import errors
  });
  // google auth
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const googleApiKey = process.env.GOOGLE_API_KEY || undefined;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || undefined;

  // openai auth
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const openaiBaseUrl = process.env.OPENAI_BASE_URL || undefined;

  // SMOKING GUN FIX: Use ModelOverrideManager to get effective model with runtime overrides and provider context
  const modelOverrideManager = getModelOverrideManager();
  const providerManager = modelOverrideManager.getProviderManager();
  const activeProvider = providerManager.getActiveProvider();
  
  const effectiveModel = modelOverrideManager.getEffectiveModel(config, activeProvider || undefined) || DEFAULT_GEMINI_MODEL;
  debugLog('effectiveModel selected:', effectiveModel, 'from ModelOverrideManager with provider:', activeProvider?.name || 'none');
  
  // Log to model switch file for debugging
  import('../utils/modelSwitchLogger.js').then(({ logModelSwitch }) => {
    logModelSwitch(`createContentGeneratorConfig - effectiveModel selected: ${effectiveModel}`);
  }).catch(() => {
    // Ignore import errors
  });

  // Apply provider-specific configuration if available
  const providerCredentials = providerManager.getActiveCredentials();
  
  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType: effectiveAuthType,
    proxy: config?.getProxy(),
    enableOpenAILogging: config.getEnableOpenAILogging(),
    timeout: config.getContentGeneratorTimeout(),
    maxRetries: config.getContentGeneratorMaxRetries(),
    samplingParams: config.getContentGeneratorSamplingParams(),
    // NEW: Apply provider credentials if available
    apiKey: providerCredentials?.apiKey || undefined,
    baseUrl: providerCredentials?.baseUrl || undefined,
  };

  debugLog('contentGeneratorConfig created with provider credentials:', {
    hasProviderCredentials: !!providerCredentials,
    baseUrl: contentGeneratorConfig.baseUrl,
    hasApiKey: !!contentGeneratorConfig.apiKey,
    provider: activeProvider?.name
  });

  // If we are using Google auth, Anthropic OAuth, Cloud Shell, or local models, there is nothing else to validate for now
  if (
    effectiveAuthType === AuthType.LOGIN_WITH_GOOGLE ||
    effectiveAuthType === AuthType.ANTHROPIC_OAUTH ||
    effectiveAuthType === AuthType.CLOUD_SHELL ||
    effectiveAuthType === AuthType.LOCAL_LMSTUDIO ||
    effectiveAuthType === AuthType.LOCAL_OLLAMA
  ) {
    return contentGeneratorConfig;
  }

  if (effectiveAuthType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (
    effectiveAuthType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  // Enhanced OpenAI auth with provider credential fallback
  if (effectiveAuthType === AuthType.USE_OPENAI && (openaiApiKey || providerCredentials?.apiKey)) {
    contentGeneratorConfig.apiKey = providerCredentials?.apiKey || openaiApiKey;
    contentGeneratorConfig.baseUrl = providerCredentials?.baseUrl || openaiBaseUrl;
    contentGeneratorConfig.model = effectiveModel; // Use effective model from provider resolution

    debugLog('Using OpenAI auth with credentials from:', providerCredentials ? 'provider' : 'environment');
    return contentGeneratorConfig;
  }

  if (effectiveAuthType === AuthType.QWEN_OAUTH) {
    // For Qwen OAuth, we'll handle the API key dynamically in createContentGenerator
    // Set a special marker to indicate this is Qwen OAuth
    contentGeneratorConfig.apiKey = 'QWEN_OAUTH_DYNAMIC_TOKEN';

    // Prefer to use qwen3-coder-plus as the default Qwen model if QWEN_MODEL is not set.
    contentGeneratorConfig.model = process.env.QWEN_MODEL || DEFAULT_QWEN_MODEL;

    return contentGeneratorConfig;
  }


  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  console.log(`🚀 ContentGenerator.createContentGenerator: authType=${config.authType}, model=${config.model}`);
  console.log(`🔍 CONFIG DEBUG: gcConfig.authType=${(gcConfig as any).authType}, gcConfig.getModel()=${gcConfig.getModel()}`);
  console.log(`🔍 AUTH DEBUG: Checking what auth path to take for authType: ${config.authType}`);
  console.log(`🔍 AUTH DEBUG: Available auth types:`, Object.keys(AuthType));
  console.log(`🔍 AUTH DEBUG: ANTHROPIC_OAUTH value:`, AuthType.ANTHROPIC_OAUTH);
  console.log(`🔍 AUTH DEBUG: Does authType match ANTHROPIC_OAUTH?`, config.authType === AuthType.ANTHROPIC_OAUTH);
  
  const version = gcConfig.getCliVersion() || 'unknown';
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    return new LoggingContentGenerator(
      await createCodeAssistContentGenerator(
        httpOptions,
        config.authType,
        gcConfig,
        sessionId,
      ),
      gcConfig,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });
    return new LoggingContentGenerator(googleGenAI.models, gcConfig);
  }

  if (config.authType === AuthType.USE_OPENAI) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    // Import OpenAIContentGenerator dynamically to avoid circular dependencies
    const { OpenAIContentGenerator } = await import(
      './openaiContentGenerator.js'
    );

    // Always use OpenAIContentGenerator, logging is controlled by enableOpenAILogging flag
    return new OpenAIContentGenerator(config, gcConfig);
  }


  if (config.authType === AuthType.ANTHROPIC_OAUTH) {
    console.log('🎯 ContentGenerator: ANTHROPIC_OAUTH route detected - creating AnthropicContentGenerator');
    // Import required classes dynamically
    const { getAnthropicOAuthClient } = await import(
      '../anthropic/anthropicOAuth2.js'
    );
    const { AnthropicContentGenerator } = await import(
      '../anthropic/anthropicContentGenerator.js'
    );

    try {
      console.log('🔑 ContentGenerator: Calling getAnthropicOAuthClient...');
      // Get the Anthropic OAuth client with token management
      const anthropicTokenManager = await getAnthropicOAuthClient(gcConfig);
      
      // Get the access token from the OAuth client
      const tokenResult = await anthropicTokenManager.getAccessToken();
      if (!tokenResult.token) {
        throw new Error('No valid Claude access token available');
      }
      
      // Update the config with the Claude access token
      const anthropicConfig = {
        ...config,
        apiKey: tokenResult.token,
        baseUrl: 'https://api.anthropic.com/v1'
      };
      
      console.log('✅ ContentGenerator: Successfully created AnthropicContentGenerator');

      // Create the content generator with the token-enabled config
      return new AnthropicContentGenerator(anthropicTokenManager, anthropicConfig, gcConfig);
    } catch (error) {
      console.error('❌ ContentGenerator: Failed to create Anthropic OAuth client:', error);
      throw new Error(
        `Failed to initialize Anthropic OAuth: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (config.authType === AuthType.QWEN_OAUTH) {
    if (config.apiKey !== 'QWEN_OAUTH_DYNAMIC_TOKEN') {
      throw new Error('Invalid Qwen OAuth configuration');
    }

    // Import required classes dynamically
    const { getQwenOAuthClient: getQwenOauthClient } = await import(
      '../qwen/qwenOAuth2.js'
    );
    const { QwenContentGenerator } = await import(
      '../qwen/qwenContentGenerator.js'
    );

    try {
      // Get the Qwen OAuth client (now includes integrated token management)
      const qwenClient = await getQwenOauthClient(gcConfig);

      // Create the content generator with dynamic token management
      return new QwenContentGenerator(qwenClient, config, gcConfig);
    } catch (error) {
      throw new Error(
        `Failed to initialize Qwen: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (config.authType === AuthType.LOCAL_LMSTUDIO) {
    console.log('🏠 ContentGenerator: LOCAL_LMSTUDIO route detected - using OpenAI-compatible generator');
    // Use OpenAI-compatible generator with default LM Studio endpoint
    const { OpenAIContentGenerator } = await import('./openaiContentGenerator.js');
    
    // Set default LM Studio configuration
    const localConfig = {
      ...config,
      baseUrl: config.baseUrl || 'http://localhost:1234/v1',
      apiKey: config.apiKey || 'lm-studio', // LM Studio doesn't require a real API key
    };
    
    return new OpenAIContentGenerator(localConfig, gcConfig);
  }

  if (config.authType === AuthType.LOCAL_OLLAMA) {
    console.log('🏠 ContentGenerator: LOCAL_OLLAMA route detected - using OpenAI-compatible generator');
    // Use OpenAI-compatible generator with default Ollama endpoint
    const { OpenAIContentGenerator } = await import('./openaiContentGenerator.js');
    
    // Set default Ollama configuration
    const localConfig = {
      ...config,
      baseUrl: config.baseUrl || 'http://localhost:11434/v1',
      apiKey: config.apiKey || 'ollama', // Ollama doesn't require a real API key
    };
    
    return new OpenAIContentGenerator(localConfig, gcConfig);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
