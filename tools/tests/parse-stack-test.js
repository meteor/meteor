import selftest from '../selftest';
import { parse, markBottom } from '../parse-stack';
import _ from 'underscore';
import Fiber from 'fibers';
import Future from 'fibers/future';

selftest.define("parse-stack - parse stack traces without fibers", () => {
  const err = new Error();
  const parsedStack = parse(err);

  selftest.expectEqual(_.last(parsedStack[0].file.split("/")),
    "parse-stack-test.js");

  markBottom(() => {
    const markedErr = new Error();
    const parsedStack = parse(markedErr);

    // The stack trace should only contain this one function since we marked the
    // bottom
    selftest.expectEqual(parsedStack.length, 1);
    selftest.expectEqual(_.last(parsedStack[0].file.split("/")),
      "parse-stack-test.js");
  })();
});

// XXX I really want to add a test here for the crazy double-stack-trace Fiber
// situation, but I don't know how to create it inside a test.
