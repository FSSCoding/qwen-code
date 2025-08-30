/**
 * Model Switch Debug Logger
 * Dedicated file logger for model switching debugging
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOGS_DIR = join(homedir(), '.qwen', 'debug-logs');
const MODEL_SWITCH_LOG = join(LOGS_DIR, 'model-switching.log');

class ModelSwitchLogger {
  private static instance: ModelSwitchLogger;

  static getInstance(): ModelSwitchLogger {
    if (!ModelSwitchLogger.instance) {
      ModelSwitchLogger.instance = new ModelSwitchLogger();
    }
    return ModelSwitchLogger.instance;
  }

  async ensureLogDir(): Promise<void> {
    try {
      await fs.mkdir(LOGS_DIR, { recursive: true });
    } catch (error) {
      // Ignore if already exists
    }
  }

  async log(message: string): Promise<void> {
    try {
      await this.ensureLogDir();
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n`;
      await fs.appendFile(MODEL_SWITCH_LOG, logEntry);
    } catch (error) {
      // Fallback to console if file logging fails
      console.log(`ModelSwitch: ${message}`);
    }
  }

  async clearLog(): Promise<void> {
    try {
      await fs.writeFile(MODEL_SWITCH_LOG, '');
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  async getLogPath(): Promise<string> {
    return MODEL_SWITCH_LOG;
  }
}

export const modelSwitchLogger = ModelSwitchLogger.getInstance();

// Helper function for easy logging
export function logModelSwitch(message: string): void {
  modelSwitchLogger.log(message).catch(() => {
    // Fallback silently
  });
}