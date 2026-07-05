// Ported from DevTools core/platform/ArrayUtilities.ts
// Original: Copyright 2016 The Chromium Authors. BSD-style license.

export const DEFAULT_COMPARATOR = (a: number, b: number): -1 | 0 | 1 => {
  return a < b ? -1 : (a > b ? 1 : 0);
};

export function lowerBound<T>(
    array: readonly T[], needle: T, comparator: (needle: T, b: T) => number, left?: number,
    right?: number): number {
  let l = left || 0;
  let r = right !== undefined ? right : array.length;
  while (l < r) {
    const m = (l + r) >> 1;
    if (comparator(needle, array[m]) > 0) {
      l = m + 1;
    } else {
      r = m;
    }
  }
  return r;
}
