import _ from 'underscore';
import { pathSep } from '../fs/files';

// We have two things "tests" and "app-tests".
export const TEST_FILENAME_REGEXPS = [
  // "*.test[s].*" or "*.spec[s].*"
  /\.test\./,
  /\.tests\./,
  /\.spec\./,
  /\.specs\./,
];

export const APP_TEST_FILENAME_REGEXPS = [
  // "*.app-test[s].*" or "*.app-spec[s].*"
  /\.app-test\./,
  /\.app-tests\./,
  /\.app-spec\./,
  /\.app-specs\./,
];

// Given a path to a file in an app (relative to the app root
// directory), is this file a test file?
export function isTestFilePath(path, testMatch) {
  const splitPath = path.split(pathSep);

  // Use testMatch if it was provided, otherwise use the defaults
  let patterns = [...TEST_FILENAME_REGEXPS, ...APP_TEST_FILENAME_REGEXPS];
  if (testMatch) {
    patterns = [new RegExp(testMatch)];
  }

  // Does the filename match one of the patterns?
  return _.any(patterns, regexp => regexp.test(_.last(splitPath)));
}
