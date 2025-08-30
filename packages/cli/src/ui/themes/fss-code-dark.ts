/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const fssCodeColors: ColorsTheme = {
  type: 'dark',
  Background: 'black',
  Foreground: 'white',
  LightBlue: 'bluebright',
  AccentBlue: 'blue',
  AccentPurple: 'magenta',
  AccentCyan: 'cyan',
  AccentGreen: 'green',
  AccentYellow: 'yellow',
  AccentRed: 'red',
  DiffAdded: '#003300',
  DiffRemoved: '#4D0000',
  Comment: 'gray',
  Gray: 'gray',
  GradientColors: ['#0033CC', '#0066DD', '#4080C0'],  // Rich dark blue → Slightly muted blue → Medium blue
};

export const FSSCodeDark: Theme = new Theme(
  'FSS-Code Dark',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: 'black',
      color: 'white',
    },
    'hljs-keyword': {
      color: 'blue',
    },
    'hljs-literal': {
      color: 'blue',
    },
    'hljs-symbol': {
      color: 'blue',
    },
    'hljs-name': {
      color: 'blue',
    },
    'hljs-link': {
      color: 'blue',
    },
    'hljs-built_in': {
      color: 'cyan',
    },
    'hljs-type': {
      color: 'cyan',
    },
    'hljs-number': {
      color: 'green',
    },
    'hljs-class': {
      color: 'green',
    },
    'hljs-string': {
      color: 'yellow',
    },
    'hljs-meta-string': {
      color: 'yellow',
    },
    'hljs-regexp': {
      color: 'red',
    },
    'hljs-template-tag': {
      color: 'red',
    },
    'hljs-subst': {
      color: 'white',
    },
    'hljs-function': {
      color: 'white',
    },
    'hljs-title': {
      color: 'white',
    },
    'hljs-params': {
      color: 'white',
    },
    'hljs-formula': {
      color: 'white',
    },
    'hljs-comment': {
      color: 'green',
    },
    'hljs-quote': {
      color: 'green',
    },
    'hljs-doctag': {
      color: 'green',
    },
    'hljs-meta': {
      color: 'gray',
    },
    'hljs-meta-keyword': {
      color: 'gray',
    },
    'hljs-tag': {
      color: 'gray',
    },
    'hljs-variable': {
      color: 'magenta',
    },
    'hljs-template-variable': {
      color: 'magenta',
    },
    'hljs-attr': {
      color: 'bluebright',
    },
    'hljs-attribute': {
      color: 'bluebright',
    },
    'hljs-builtin-name': {
      color: 'bluebright',
    },
    'hljs-section': {
      color: 'yellow',
    },
    'hljs-emphasis': {
      // fontStyle is ignored by Theme class
    },
    'hljs-strong': {
      // fontWeight is ignored by Theme class
    },
    'hljs-bullet': {
      color: 'yellow',
    },
    'hljs-selector-tag': {
      color: 'yellow',
    },
    'hljs-selector-id': {
      color: 'yellow',
    },
    'hljs-selector-class': {
      color: 'yellow',
    },
    'hljs-selector-attr': {
      color: 'yellow',
    },
    'hljs-selector-pseudo': {
      color: 'yellow',
    },
  },
  fssCodeColors,
  darkSemanticColors,
);