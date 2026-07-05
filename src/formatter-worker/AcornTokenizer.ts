// Ported from DevTools entrypoints/formatter_worker/AcornTokenizer.ts
// Original: Copyright 2014 The Chromium Authors. BSD-style license.

import * as Acorn from 'acorn';
import {findLineEndingIndexes} from '../platform/StringUtilities.js';
import {TextCursor} from '../text-utils/TextCursor.js';

// TokenOrComment mirrors `Acorn.Token | Acorn.Comment` but lineComment /
// blockComment compare `token.type === "Line" | "Block"` at runtime, so we
// widen with an optional `type` string member first and then pick it up via
// duck-typing inside the compare functions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TokenOrComment = any;

export class AcornTokenizer {
  #textCursor: TextCursor;
  #tokenLineStart: number;
  #tokenLineEnd: number;
  #tokens: Array<Acorn.Comment | Acorn.Token>;
  #idx = 0;

  constructor(content: string, tokens: Array<Acorn.Comment | Acorn.Token>) {
    this.#tokens = tokens;
    const contentLineEndings = findLineEndingIndexes(content);
    this.#textCursor = new TextCursor(contentLineEndings);
    this.#tokenLineStart = 0;
    this.#tokenLineEnd = 0;
  }

  static punctuator(token: Acorn.Token, values?: string): boolean {
    return token.type !== Acorn.tokTypes.num && token.type !== Acorn.tokTypes.regexp &&
        token.type !== Acorn.tokTypes.string && token.type !== Acorn.tokTypes.name &&
        !token.type.keyword && (!values || (token.type.label.length === 1 && values.indexOf(token.type.label) !== -1));
  }

  static keyword(token: Acorn.Token, keyword?: string): boolean {
    return Boolean(token.type.keyword) && token.type !== Acorn.tokTypes._true &&
        token.type !== Acorn.tokTypes._false && token.type !== Acorn.tokTypes._null &&
        (!keyword || token.type.keyword === keyword);
  }

  static identifier(token: TokenOrComment, identifier?: string): boolean {
    return token.type === Acorn.tokTypes.name && (!identifier || (token as {value: string}).value === identifier);
  }

  static arrowIdentifier(token: TokenOrComment, identifier?: string): boolean {
    return token.type === Acorn.tokTypes.arrow &&
        (!identifier || token.type.label === identifier);
  }

  static lineComment(token: TokenOrComment): boolean {
    return (token as {type: string}).type === 'Line';
  }

  static blockComment(token: TokenOrComment): boolean {
    return (token as {type: string}).type === 'Block';
  }

  nextToken(): TokenOrComment | null {
    const token = this.#tokens[this.#idx++];
    if (!token || token.type === Acorn.tokTypes.eof) {
      return null;
    }

    this.#textCursor.advance(token.start);
    this.#tokenLineStart = this.#textCursor.lineNumber();

    this.#textCursor.advance(token.end);
    this.#tokenLineEnd = this.#textCursor.lineNumber();
    return token;
  }

  peekToken(): TokenOrComment | null {
    const token = this.#tokens[this.#idx];
    if (!token || token.type === Acorn.tokTypes.eof) {
      return null;
    }
    return token;
  }

  tokenLineStart(): number {
    return this.#tokenLineStart;
  }

  tokenLineEnd(): number {
    return this.#tokenLineEnd;
  }
}

export const ECMA_VERSION = 2022;
