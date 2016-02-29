import _ from 'underscore';
import { pathSep } from '../fs/files';

// We have two things "tests" and "app-tests".
export const TEST_FILENAME_REGEXPS = [
  // "*.unit.test.*" or "*.tests.*"
  /\.tests?./,
];

export const APP_TEST_FILENAME_REGEXPS = [
  // "*.integration.test.*" or "*.app-tests.*"
  /\.app-tests?./,
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
