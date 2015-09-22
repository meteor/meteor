import selftest from '../tool-testing/selftest.js';
import { parse, markBottom } from '../utils/parse-stack.js';
import _ from 'underscore';
import Fiber from 'fibers';
import Future from 'fibers/future';
import files from '../fs/files.js';

selftest.define("parse-stack - parse stack traces without fibers", () => {
  const err = new Error();
  const parsedStack = parse(err).outsideFiber;

  const firstFilePath = files.convertToStandardPath(parsedStack[0].file);
  selftest.expectEqual(_.last(firstFilePath.split("/")), "parse-stack-test.js");

  const lastFilePath = files.convertToStandardPath(_.last(parsedStack).file);
  selftest.expectEqual(_.last(lastFilePath.split("/")), "main.js");

  markBottom(() => {
    const markedErr = new Error();

    const {
      outsideFiber,
      insideFiber
    } = parse(markedErr);

    // Don't return an empty array
    selftest.expectEqual(insideFiber, undefined);

    // The stack trace should only contain this one function since we marked the
    // bottom
    selftest.expectEqual(outsideFiber.length, 1);

    const firstOutsideFiberPath =
      files.convertToStandardPath(outsideFiber[0].file);
    selftest.expectEqual(_.last(firstOutsideFiberPath.split("/")),
      "parse-stack-test.js");
  })();
});

selftest.define("parse-stack - parse stack traces with fibers", () => {
  const parsedStack = parse({ stack: exampleStackTrace });

  selftest.expectEqual(parsedStack.insideFiber[0].file, "template-compiler.js");
  selftest.expectEqual(_.last(parsedStack.outsideFiber).file, "template-compiler.js");
});

// XXX I don't know how to actually create one of the crazy fiber stack traces
// inside this test environment, so I have a copy-pasted one below that I
// actually encountered.
const exampleStackTrace = `TypeError: object is not a function
    at Object.Future.wait (/Users/sashko/git/meteor/dev_bundle/lib/node_modules/fibers/future.js:395:16)
    at TemplateCompiler.processFilesForTarget (caching-compiler.js:312:12)
    at TemplateCompiler.processFilesForTarget (template-compiler.js:28:32)
    at __bottom_mark__ (/Users/sashko/git/meteor/tools/parse-stack.js:92:14)
    at /Users/sashko/git/meteor/tools/isobuild/compiler-plugin.js:141:13
    at /Users/sashko/git/meteor/tools/buildmessage.js:356:18
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:349:34
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:347:23
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at Object.enterJob (/Users/sashko/git/meteor/tools/buildmessage.js:321:26)
    at /Users/sashko/git/meteor/tools/isobuild/compiler-plugin.js:130:22
    at Function.time (/Users/sashko/git/meteor/tools/profile.js:232:28)
    at /Users/sashko/git/meteor/tools/isobuild/compiler-plugin.js:129:15
    at Function._.each._.forEach (/Users/sashko/git/meteor/dev_bundle/lib/node_modules/underscore/underscore.js:87:22)
    at [object Object]._.extend.runCompilerPlugins (/Users/sashko/git/meteor/tools/isobuild/compiler-plugin.js:118:7)
    at [object Object]._.extend._runCompilerPlugins (/Users/sashko/git/meteor/tools/isobuild/bundler.js:702:22)
    at /Users/sashko/git/meteor/tools/isobuild/bundler.js:504:34
    at /Users/sashko/git/meteor/tools/buildmessage.js:356:18
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:349:34
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:347:23
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at Object.enterJob (/Users/sashko/git/meteor/tools/buildmessage.js:321:26)
    at [object Object]._.extend.make (/Users/sashko/git/meteor/tools/isobuild/bundler.js:498:18)
    at /Users/sashko/git/meteor/tools/isobuild/bundler.js:2044:14
    at /Users/sashko/git/meteor/tools/isobuild/bundler.js:2126:20
    at Array.forEach (native)
    at Function._.each._.forEach (/Users/sashko/git/meteor/dev_bundle/lib/node_modules/underscore/underscore.js:79:11)
    at /Users/sashko/git/meteor/tools/isobuild/bundler.js:2125:7
    at /Users/sashko/git/meteor/tools/buildmessage.js:268:13
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:261:29
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:259:18
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:250:23
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at Object.capture (/Users/sashko/git/meteor/tools/buildmessage.js:249:19)
    at Object.exports.bundle (/Users/sashko/git/meteor/tools/isobuild/bundler.js:2029:31)
    at /Users/sashko/git/meteor/tools/run-app.js:557:36
    at time (/Users/sashko/git/meteor/tools/profile.js:232:28)
    at Function.run (/Users/sashko/git/meteor/tools/profile.js:377:12)
    at bundleApp (/Users/sashko/git/meteor/tools/run-app.js:547:34)
    at [object Object]._.extend._runOnce (/Users/sashko/git/meteor/tools/run-app.js:600:35)
    at [object Object]._.extend._fiber (/Users/sashko/git/meteor/tools/run-app.js:848:28)
    at /Users/sashko/git/meteor/tools/run-app.js:402:12
    - - - - -
    at TemplateCompiler.compileOneFile (template-compiler.js:43:23)
    at caching-compiler.js:292:32
    at /Users/sashko/git/meteor/packages/caching-compiler/.npm/package/node_modules/async/lib/async.js:182:20
    at replenish (/Users/sashko/git/meteor/packages/caching-compiler/.npm/package/node_modules/async/lib/async.js:317:21)
    at /Users/sashko/git/meteor/packages/caching-compiler/.npm/package/node_modules/async/lib/async.js:328:15
    at Object.async.forEachLimit.async.eachLimit (/Users/sashko/git/meteor/packages/caching-compiler/.npm/package/node_modules/async/lib/async.js:221:35)
    at TemplateCompiler.processFilesForTarget (caching-compiler.js:277:11)
    at TemplateCompiler.processFilesForTarget (template-compiler.js:28:32)
    at __bottom_mark__ (/Users/sashko/git/meteor/tools/parse-stack.js:92:14)
    at /Users/sashko/git/meteor/tools/isobuild/compiler-plugin.js:141:13
    at /Users/sashko/git/meteor/tools/buildmessage.js:356:18
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:349:34
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:347:23
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at Object.enterJob (/Users/sashko/git/meteor/tools/buildmessage.js:321:26)
    at /Users/sashko/git/meteor/tools/isobuild/compiler-plugin.js:130:22
    at Function.time (/Users/sashko/git/meteor/tools/profile.js:232:28)
    at /Users/sashko/git/meteor/tools/isobuild/compiler-plugin.js:129:15
    at Function._.each._.forEach (/Users/sashko/git/meteor/dev_bundle/lib/node_modules/underscore/underscore.js:87:22)
    at [object Object]._.extend.runCompilerPlugins (/Users/sashko/git/meteor/tools/isobuild/compiler-plugin.js:118:7)
    at [object Object]._.extend._runCompilerPlugins (/Users/sashko/git/meteor/tools/isobuild/bundler.js:702:22)
    at /Users/sashko/git/meteor/tools/isobuild/bundler.js:504:34
    at /Users/sashko/git/meteor/tools/buildmessage.js:356:18
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:349:34
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:347:23
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at Object.enterJob (/Users/sashko/git/meteor/tools/buildmessage.js:321:26)
    at [object Object]._.extend.make (/Users/sashko/git/meteor/tools/isobuild/bundler.js:498:18)
    at /Users/sashko/git/meteor/tools/isobuild/bundler.js:2044:14
    at /Users/sashko/git/meteor/tools/isobuild/bundler.js:2126:20
    at Array.forEach (native)
    at Function._.each._.forEach (/Users/sashko/git/meteor/dev_bundle/lib/node_modules/underscore/underscore.js:79:11)
    at /Users/sashko/git/meteor/tools/isobuild/bundler.js:2125:7
    at /Users/sashko/git/meteor/tools/buildmessage.js:268:13
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:261:29
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:259:18
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at /Users/sashko/git/meteor/tools/buildmessage.js:250:23
    at [object Object]._.extend.withValue (/Users/sashko/git/meteor/tools/fiber-helpers.js:114:14)
    at Object.capture (/Users/sashko/git/meteor/tools/buildmessage.js:249:19)
    at Object.exports.bundle (/Users/sashko/git/meteor/tools/isobuild/bundler.js:2029:31)
    at /Users/sashko/git/meteor/tools/run-app.js:557:36
    at time (/Users/sashko/git/meteor/tools/profile.js:232:28)
    at Function.run (/Users/sashko/git/meteor/tools/profile.js:377:12)
    at bundleApp (/Users/sashko/git/meteor/tools/run-app.js:547:34)
    at [object Object]._.extend._runOnce (/Users/sashko/git/meteor/tools/run-app.js:600:35)
    at [object Object]._.extend._fiber (/Users/sashko/git/meteor/tools/run-app.js:848:28)
    at /Users/sashko/git/meteor/tools/run-app.js:402:12`;
