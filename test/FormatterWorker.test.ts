// Migrated from DevTools entrypoints/formatter_worker/FormatterWorker.test.ts
// Original: Copyright 2022 The Chromium Authors. BSD-style license.
// chai/mocha replaced with node:test + node:assert/strict.

import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';

import {format} from '../src/formatter-worker/FormatterWorker.js';

describe('FormatterWorker', () => {
  describe('format', () => {
    it('correctly formats Web app manifests', () => {
      const inputText = '{"name":"My Web App","start_url":"."}';
      const formattedText = `{
    "name": "My Web App",
    "start_url": "."
}`;
      assert.strictEqual(format('application/manifest+json', inputText).content, formattedText);
    });
  });
});
