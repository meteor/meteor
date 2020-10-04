import { extractModuleSizesTree } from "./stats.js";

Plugin.registerMinifier({
  extensions: ['js'],
  archMatching: 'web'
}, function () {
  var minifier = new MeteorBabelMinifier();
  return minifier;
});

function MeteorBabelMinifier () {};

MeteorBabelMinifier.prototype.processFilesForBundle = function(files, options) {
  var mode = options.minifyMode;

  // don't minify anything for development
  if (mode === 'development') {
    files.forEach(function (file) {
      file.addJavaScript({
        data: file.getContentsAsBuffer(),
        sourceMap: file.getSourceMap(),
        path: file.getPathInBundle(),
      });
    });
    return;
  }

  function maybeThrowMinifyErrorBySourceFile(error, file) {
    var minifierErrorRegex = /^(.*?)\s?\((\d+):(\d+)\)$/;
    var parseError = minifierErrorRegex.exec(error.message);

    if (!parseError) {
      // If we were unable to parse it, just let the usual error handling work.
      return;
    }

    var lineErrorMessage = parseError[1];
    var lineErrorLineNumber = parseError[2];

    var parseErrorContentIndex = lineErrorLineNumber - 1;

    // Unlikely, since we have a multi-line fixed header in this file.
    if (parseErrorContentIndex < 0) {
      return;
    }

    /*

    What we're parsing looks like this:

    /////////////////////////////////////////
    //                                     //
    // path/to/file.js                     //
    //                                     //
    /////////////////////////////////////////
                                           // 1
       var illegalECMAScript = true;       // 2
                                           // 3
    /////////////////////////////////////////

    Btw, the above code is intentionally not newer ECMAScript so
    we don't break ourselves.

    */

    var contents = file.getContentsAsString().split(/\n/);
    var lineContent = contents[parseErrorContentIndex];

    // Try to grab the line number, which sometimes doesn't exist on
    // line, abnormally-long lines in a larger block.
    var lineSrcLineParts = /^(.*?)(?:\s*\/\/ (\d+))?$/.exec(lineContent);

    // The line didn't match at all?  Let's just not try.
    if (!lineSrcLineParts) {
      return;
    }

    var lineSrcLineContent = lineSrcLineParts[1];
    var lineSrcLineNumber = lineSrcLineParts[2];

    // Count backward from the failed line to find the filename.
    for (var c = parseErrorContentIndex - 1; c >= 0; c--) {
      var sourceLine = contents[c];

      // If the line is a boatload of slashes, we're in the right place.
      if (/^\/\/\/{6,}$/.test(sourceLine)) {

        // If 4 lines back is the same exact line, we've found the framing.
        if (contents[c - 4] === sourceLine) {

          // So in that case, 2 lines back is the file path.
          var parseErrorPath = contents[c - 2]
            .substring(3)
            .replace(/\s+\/\//, "");

          var minError = new Error(
            "Babili minification error " +
            "within " + file.getPathInBundle() + ":\n" +
            parseErrorPath +
            (lineSrcLineNumber ? ", line " + lineSrcLineNumber : "") + "\n" +
            "\n" +
            lineErrorMessage + ":\n" +
            "\n" +
            lineSrcLineContent + "\n"
          );

          throw minError;
        }
      }
    }
  }

  const toBeAdded = {
    data: "",
    stats: Object.create(null)
  };

  files.forEach(file => {
    // Don't reminify *.min.js.
    if (/\.min\.js$/.test(file.getPathInBundle())) {
      toBeAdded.data += file.getContentsAsString();
    } else {
      var minified;

      try {
        minified = meteorJsMinify(file.getContentsAsString());

        if (!(minified && typeof minified.code === "string")) {
          throw new Error();
        }

      } catch (err) {
        var filePath = file.getPathInBundle();

        maybeThrowMinifyErrorBySourceFile(err, file);

        err.message += " while minifying " + filePath;
        throw err;
      }

      const tree = extractModuleSizesTree(minified.code);
      if (tree) {
        toBeAdded.stats[file.getPathInBundle()] =
          [Buffer.byteLength(minified.code), tree];
      } else {
        toBeAdded.stats[file.getPathInBundle()] =
          Buffer.byteLength(minified.code);
      }

      toBeAdded.data += minified.code;
    }

    toBeAdded.data += '\n\n';

    Plugin.nudge();
  });

  if (files.length) {
    files[0].addJavaScript(toBeAdded);
  }
};
