import { pathSep } from '../fs/files';

// We have two things "tests" and "app-tests".
export const TEST_FILENAME_REGEXPS: RegExp[] = [
  // "*.test[s].*" or "*.spec[s].*"
  /\.test\./,
  /\.tests\./,
  /\.spec\./,
  /\.specs\./,
];

export const APP_TEST_FILENAME_REGEXPS: RegExp[] = [
  // "*.app-test[s].*" or "*.app-spec[s].*"
  /\.app-test\./,
  /\.app-tests\./,
  /\.app-spec\./,
  /\.app-specs\./,
];

// Given a path to a file in an app (relative to the app root
// directory), is this file a test file?
export function isTestFilePath(path: string) {
  // We can remove the || '', but pop function declares a string | undefined
  // return that is not compatible with regex.test function
  const fileName = path.split(pathSep).pop() || '';

  // Does the filename match one of the test filename forms?
  return [...TEST_FILENAME_REGEXPS, ...APP_TEST_FILENAME_REGEXPS].some((regexp) => {
    return regexp.test(fileName);
  });
}
