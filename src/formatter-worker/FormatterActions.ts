// Ported from DevTools entrypoints/formatter_worker/FormatterActions.ts
// Original: Copyright 2020 The Chromium Authors. BSD-style license.

export const enum FormattableMediaTypes {
  APPLICATION_JAVASCRIPT = 'application/javascript',
  APPLICATION_JSON = 'application/json',
  APPLICATION_MANIFEST_JSON = 'application/manifest+json',
  TEXT_CSS = 'text/css',
  TEXT_HTML = 'text/html',
  TEXT_JAVASCRIPT = 'text/javascript',
}

export interface FormatMapping {
  original: number[];
  formatted: number[];
}

export interface FormatResult {
  content: string;
  mapping: FormatMapping;
}
