// Ported from DevTools entrypoints/formatter_worker/FormatterWorker.ts
// Original: Copyright 2011 The Chromium Authors. BSD-style license.

import {findLineEndingIndexes} from '../platform/StringUtilities.js';
import {createRequire} from 'node:module';
import {CSSFormatter} from './CSSFormatter.js';
import {FormattedContentBuilder} from './FormattedContentBuilder.js';
import {FormattableMediaTypes, type FormatResult} from './FormatterActions.js';
import {HTMLFormatter} from './HTMLFormatter.js';
import {JavaScriptFormatter} from './JavaScriptFormatter.js';
import {JSONFormatter} from './JSONFormatter.js';

// Side-effect imports for the CodeMirror mode packages — must run before any
// formatting call. The codemirror editor-core IIFE installs itself as
// `globalThis.CodeMirror` the first time one of the mode wrappers executes
// its `require("../../lib/codemirror")` branch. We install a thin DOM shim and
// then load the mode packages (css first, because htmlmixed depends on it).
import '../codemirror/register-codemirror.js';
// The mode packages are CommonJS/UMD; we pull them in via Node's createRequire
// so their UMD wrappers execute with `module`/`exports` in scope. Order
// matters: `htmlmixed` depends on the css/xml/javascript modes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requireShim = createRequire(import.meta.url);
// Because in a CommonJS-evaluated module `module.exports` exists, the
// codemirror IIFE assigns `module.exports = factory()` and *does not* write
// to a global. We capture the package exports ourselves; the mode packages
// will register their modes on the same object.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const CodeMirror: any = requireShim('codemirror');
// Side-effect imports of the mode packages register themselves on the same
// `CodeMirror` object via their UMD wrappers' `mod(require("../../lib/codemirror"))`
// calls.
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
requireShim('codemirror/mode/css/css');
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
requireShim('codemirror/mode/xml/xml');
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
requireShim('codemirror/mode/javascript/javascript');
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
requireShim('codemirror/mode/htmlmixed/htmlmixed');

// Sanity: ensure the modes actually attached.
if (!CodeMirror.getMode || !CodeMirror.StringStream) {
  throw new Error(
      'formatter-cli: failed to initialize CodeMirror tokenizer. ' +
      'This usually means a missing or mismatched `codemirror` package install.');
}

export interface Chunk {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chunk: any[];
  isLastChunk: boolean;
}

export type ChunkCallback = (arg0: Chunk) => void;

export function createTokenizer(mimeType: string): (
    text: string,
    callback: (arg0: string, arg1: string | null, arg2: number, arg3: number) => Object | undefined | void,
    ) => void {
  const mode = CodeMirror.getMode({indentUnit: 2}, mimeType);
  const state = CodeMirror.startState(mode);

  if (!mode || mode.name === 'null') {
    throw new Error(`Could not find CodeMirror mode for MimeType: ${mimeType}`);
  }
  if (!mode.token) {
    throw new Error(`Could not find CodeMirror mode with token method: ${mimeType}`);
  }

  return (
      line: string,
      callback: (arg0: string, arg1: string | null, arg2: number, arg3: number) => void | Object | undefined,
  ): void => {
    const stream = new CodeMirror.StringStream(line, 2, {
      lookAhead(_n: number): string | undefined {
        return undefined;
      },
      baseToken(): unknown {
        return null;
      },
    });
    while (!stream.eol()) {
      const style = mode.token(stream, state);
      const value = stream.current();
      if (callback(value, style, stream.start, stream.start + value.length) === AbortTokenization) {
        return;
      }
      stream.start = stream.pos;
    }
  };
}

export const AbortTokenization = {};

export function format(mimeType: string, text: string, indentString?: string): FormatResult {
  // Default to a 4-space indent.
  indentString = indentString || '    ';

  let result: FormatResult;
  const builder = new FormattedContentBuilder(indentString);
  const lineEndings = findLineEndingIndexes(text);
  try {
    switch (mimeType) {
      case FormattableMediaTypes.TEXT_HTML: {
        const formatter = new HTMLFormatter(builder);
        formatter.format(text, lineEndings);
        break;
      }
      case FormattableMediaTypes.TEXT_CSS: {
        const formatter = new CSSFormatter(builder);
        formatter.format(text, lineEndings, 0, text.length);
        break;
      }
      case FormattableMediaTypes.APPLICATION_JAVASCRIPT:
      case FormattableMediaTypes.TEXT_JAVASCRIPT: {
        const formatter = new JavaScriptFormatter(builder);
        formatter.format(text, lineEndings, 0, text.length);
        break;
      }
      case FormattableMediaTypes.APPLICATION_JSON: {
        const formatter = new JSONFormatter(builder);
        formatter.format(text, lineEndings, 0, text.length);
        break;
      }
    }
    result = {
      mapping: builder.mapping,
      content: builder.content(),
    };
  } catch (e) {
    if (process.env.DEBUG) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    result = {
      mapping: {original: [0], formatted: [0]},
      content: text,
    };
  }
  return result;
}
