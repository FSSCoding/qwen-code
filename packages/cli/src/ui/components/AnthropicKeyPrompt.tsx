/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

interface AnthropicKeyPromptProps {
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
}

export function AnthropicKeyPrompt({
  onSubmit,
  onCancel,
}: AnthropicKeyPromptProps): React.JSX.Element {
  const [apiKey, setApiKey] = useState('');

  useInput((input, key) => {
    // Filter paste-related control sequences
    let cleanInput = (input || '')
      // Filter ESC-started control sequences (like \u001b[200~, \u001b[201~, etc.)
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex
      // Filter paste start marker [200~
      .replace(/\[200~/g, '')
      // Filter paste end marker [201~
      .replace(/\[201~/g, '')
      // Filter standalone [ and ~ characters (might be paste marker remnants)
      .replace(/^\[|~$/g, '');

    // Filter all invisible characters (ASCII < 32, except carriage return and line feed)
    cleanInput = cleanInput
      .split('')
      .filter((ch) => ch.charCodeAt(0) >= 32)
      .join('');

    if (cleanInput.length > 0) {
      setApiKey((prev) => prev + cleanInput);
    }

    if (key.return) {
      if (apiKey.trim()) {
        onSubmit(apiKey.trim());
      }
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.backspace || key.delete) {
      setApiKey((prev) => prev.slice(0, -1));
      return;
    }
  });

  return (
    <Box 
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={Colors.AccentBlue}>
        Anthropic Configuration Required
      </Text>
      <Box marginTop={1}>
        <Text>
          Please enter your Anthropic API key. You can get an API key from{' '}
          <Text underline>https://console.anthropic.com/</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>API Key: </Text>
        <Text color={Colors.AccentYellow}>
          {apiKey.length > 0 
            ? '*'.repeat(Math.min(apiKey.length, 20)) + (apiKey.length > 20 ? '...' : '')
            : '(Enter your sk-ant-... key)'}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>Press Enter to continue, Esc to cancel</Text>
      </Box>
    </Box>
  );
}