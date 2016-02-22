import _ from 'underscore';
import { pathSep } from '../fs/files';

export const TEST_FILENAME_REGEXPS = [
  // "*.test.*" or "*.tests.*"
  /\.tests?./,
  // "test.*" or "tests.*"
  /^tests?./
];

export const TEST_DIRNAME_REGEXPS = [
  // a directory exactly named "tests"
  /^tests\/$/
];

// Given a path to a file in an app (relative to the app root
// directory), is this file a test file?
export function isTestFilePath(path) {
  const splitPath = path.split(pathSep);

  // Does any path of the path other than the filename match one of
  // the test dirname forms?
  const inTestsDir = _.any(
    _.initial(splitPath),
    dirname => _.any(
      TEST_DIRNAME_REGEXPS,
      regexp => regexp.test(dirname)));

  // Does the filename match one of the test filename forms?
  const isTestFilename = _.any(
    TEST_FILENAME_REGEXPS,
    regexp => regexp.test(_.last(splitPath)));

  return inTestsDir || isTestFilename;
}
