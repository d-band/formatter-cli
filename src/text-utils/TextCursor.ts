// Ported from DevTools models/text_utils/TextCursor.ts
// Original: Copyright 2020 The Chromium Authors. BSD-style license.

import {lowerBound, DEFAULT_COMPARATOR} from '../platform/ArrayUtilities.js';

export class TextCursor {
  readonly #lineEndings: number[];

  #offset = 0;
  #lineNumber = 0;
  #columnNumber = 0;

  constructor(lineEndings: number[]) {
    this.#lineEndings = lineEndings;
  }

  advance(offset: number): void {
    this.#offset = offset;
    while (this.#lineNumber < this.#lineEndings.length && this.#lineEndings[this.#lineNumber] < this.#offset) {
      ++this.#lineNumber;
    }
    this.#columnNumber =
        this.#lineNumber ? this.#offset - this.#lineEndings[this.#lineNumber - 1] - 1 : this.#offset;
  }

  offset(): number {
    return this.#offset;
  }

  resetTo(offset: number): void {
    this.#offset = offset;
    this.#lineNumber = lowerBound(this.#lineEndings, offset, DEFAULT_COMPARATOR);
    this.#columnNumber =
        this.#lineNumber ? this.#offset - this.#lineEndings[this.#lineNumber - 1] - 1 : this.#offset;
  }

  lineNumber(): number {
    return this.#lineNumber;
  }

  columnNumber(): number {
    return this.#columnNumber;
  }
}
