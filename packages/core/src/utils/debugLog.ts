/**
 * Debug logging utility that only logs when debug mode is enabled
 */

let debugMode = false;
let config: any = null;

export function setDebugContext(configInstance: any) {
  config = configInstance;
  debugMode = configInstance?.getDebugMode() ?? false;
}

export function debugLog(...args: any[]) {
  // Check current debug mode from config if available
  if (config) {
    debugMode = config.getDebugMode() ?? false;
  }
  
  // Only log if debug mode is enabled
  if (debugMode) {
    console.log(...args);
  }
}

export function isDebugEnabled(): boolean {
  if (config) {
    debugMode = config.getDebugMode() ?? false;
  }
  return debugMode;
}