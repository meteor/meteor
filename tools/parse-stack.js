var _ = require('underscore');

// Given an Error (eg, 'new Error'), return the stack associated with
// that error as an array. More recently called functions appear first
// and each element is an object with keys:
// - file: filename as it appears in the stack
// - line: 1-indexed line number in file, as a Number
// - column: 1-indexed column in line, as a Number
// - func: name of the function in the frame (maybe null)
//
// Accomplishes this by parsing the text representation of the stack
// with regular expressions. Unlikely to work anywhere but v8.
//
// If a function on the stack has been marked with mark(), don't
// return anything past that function. We call this the "user portion"
// of the stack.
exports.parse = function (err) {
  var frames = err.stack.split('\n');

  frames.shift(); // at least the first line is the exception

  // "    - - - - -"
  // This is something added when you throw an Error through a Future. The
  // stack above the dashes is the stack of the 'wait' call; the stack below
  // is the stack inside the fiber where the Error is originally
  // constructed.
  // XXX This code assumes that the stack trace can only be split once. It's not
  // clear whether this can happen multiple times.
  var indexOfFiberSplit = frames.indexOf("    - - - - -");

  if (indexOfFiberSplit === -1) {
    // This is a normal stack trace, not a split fiber stack trace
    return parseStackFrames(frames);
  }

  // If this is a split stack trace from a future, parse the frames above and
  // below the split separately.
  var outsideFiber = parseStackFrames(frames);
  var insideFiber = parseStackFrames(frames.slice(indexOfFiberSplit + 1));

  // Put the frames below the split at the top of the printed stack trace, since
  // they are more likely to contain the code that actually threw the error.
  return insideFiber.concat(outsideFiber);
};

// Decorator. Mark the point at which a stack trace returned by
// parse() should stop: no frames earlier than this point will be
// included in the parsed stack. Confusingly, in the argot of the
// times, you'd say that frames "higher up" than this or "above" this
// will not be returned, but you'd also say that those frames are "at
// the bottom of the stack". Frames below the bottom are the outer
// context of the framework running the user's code.
exports.markBottom = function (f) {
  return function __bottom_mark__ () {
    return f.apply(this, arguments);
  };
};

// Decorator. Mark the point at which a stack trace returned by
// parse() should begin: no frames later than this point will be
// included in the parsed stack. The opposite of markBottom().
// Frames above the top are helper functions defined by the
// framework and executed by user code whose internal behavior
// should not be exposed.
exports.markTop = function (f) {
  return function __top_mark__ () {
    return f.apply(this, arguments);
  };
};

function parseStackFrames(frames) {
  var stop = false;
  var ret = [];
  _.each(frames, function (frame) {
    if (stop)
      return;
    var m;
    if (m =
        frame.match(/^\s*at\s*((new )?.+?)\s*(\[as\s*([^\]]*)\]\s*)?\((.*?)(:(\d+))?(:(\d+))?\)\s*$/)) {
      // https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
      // "    at My.Function (/path/to/myfile.js:532:39)"
      // "    at Array.forEach (native)"
      // "    at new My.Class (file.js:1:2)"
      // "    at [object Object].main.registerCommand.name [as func] (meteor/tools/commands.js:1225:19)"
      // "    at __top_mark__ [as matchErr] (meteor/tools/parse-stack.js:82:14)"
      //
      // In that last example, it is not at all clear to me what the
      // 'as' stanza refers to, but it is in m[3] if you find a use for it.
      if (m[1].match(/(?:^|\.)__top_mark__$/)) {
        // m[1] could be Object.__top_mark__ or something like that
        // depending on where exactly you put the function returned by
        // markTop
        ret = [];
        return;
      }
      if (m[1].match(/(?:^|\.)__bottom_mark__$/)) {
        stop = true;
        return;
      }
      ret.push({
        func: m[1],
        file: m[5],
        line: m[7] ? +m[7] : undefined,
        column: m[9] ? +m[9] : undefined
      });
    } else if (m = frame.match(/^\s*at\s+(.+?)(:(\d+))?(:(\d+))?\s*$/)) {
      // "    at /path/to/myfile.js:532:39"
      ret.push({
        file: m[1],
        line: m[3] ? +m[3] : undefined,
        column: m[5] ? +m[5] : undefined
      });
    } else if (m = frame.match(/^\s*-\s*-\s*-\s*-\s*-\s*$/)) {
      // Stop parsing if we reach a stack split from a Future
      stop = true;
    } else if (_.isEmpty(ret)) {
      // We haven't found any stack frames, so probably we have newlines in the
      // error message. Just skip this line.
    } else {
      throw new Error("Couldn't parse stack frame: '" + frame + "'");
    }
  });

  return ret;
}
