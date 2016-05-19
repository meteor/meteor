import _ from 'underscore';
import { pathSep } from '../fs/files';

// We have two things "tests" and "app-tests".
export const TEST_FILENAME_REGEXPS = [
  // "*.test[s].*" or "*.spec[s].*"
  /\.tests?./,
  /\.specs?./,
];

export const APP_TEST_FILENAME_REGEXPS = [
  // "*.app-tests.*" or "*.app-specs.*"
  /\.app-tests?./,
  /\.app-specs?./,
];

// Given a path to a file in an app (relative to the app root
// directory), is this file a test file?
export function isTestFilePath(path) {
  const splitPath = path.split(pathSep);

  // Does the filename match one of the test filename forms?
  return _.any(
    [...TEST_FILENAME_REGEXPS, ...APP_TEST_FILENAME_REGEXPS],
    regexp => regexp.test(_.last(splitPath)));
}
