// Ported from DevTools core/platform/StringUtilities.ts
// Original: Copyright 2016 The Chromium Authors. BSD-style license.

const findIndexesOfSubString = (inputString: string, searchString: string): number[] => {
  const matches = [];
  let i = inputString.indexOf(searchString);
  while (i !== -1) {
    matches.push(i);
    i = inputString.indexOf(searchString, i + searchString.length);
  }
  return matches;
};

export const findLineEndingIndexes = (inputString: string): number[] => {
  const endings = findIndexesOfSubString(inputString, '\n');
  endings.push(inputString.length);
  return endings;
};

export const isWhitespace = (inputString: string): boolean => {
  return /^\s*$/.test(inputString);
};
