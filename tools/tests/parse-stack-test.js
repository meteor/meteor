import selftest from '../tool-testing/selftest.js';
import { parse, markBottom } from '../utils/parse-stack';
import _ from 'underscore';
import files from '../fs/files';

selftest.define("parse-stack - parse stack traces", () => {
  const err = new Error();
  const parsedStack = parse(err);

  const firstFilePath = files.convertToStandardPath(parsedStack[0].file);
  selftest.expectEqual(_.last(firstFilePath.split("/")), "parse-stack-test.js");

  const lastFilePath = files.convertToStandardPath(_.last(parsedStack).file);
  selftest.expectEqual(_.last(lastFilePath.split("/")), "selftest.js");

  markBottom(() => {
    const markedErr = new Error();
    const frames = parse(markedErr);

    // The stack trace should only contain this one function since we marked the
    // bottom
    selftest.expectEqual(frames.length, 1);

    const firstPath = files.convertToStandardPath(frames[0].file);
    selftest.expectEqual(_.last(firstPath.split("/")), "parse-stack-test.js");
  })();
});
