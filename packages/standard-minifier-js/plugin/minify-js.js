import { extractModuleSizesTree } from "./stats.js";

Plugin.registerMinifier({
  extensions: ['js'],
  archMatching: 'web'
}, 
() => new MeteorBabelMinifier()
);

class MeteorBabelMinifier {

  processFilesForBundle (files, options) {
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

    // nested function 
    // this function tries its best to locate the original source file
    // that the error being reported was located inside of
    function maybeThrowMinifyErrorBySourceFile(error, file) {
      const minifierErrorRegex = /^(.*?)\s?\((\d+):(\d+)\)$/;
      const parseError = minifierErrorRegex.exec(error.message);

      if (!parseError) {
        // If we were unable to parse it, just let the usual error handling work.
        return;
      }

      const lineErrorMessage = parseError[1];
      const lineErrorLineNumber = parseError[2];

      const parseErrorContentIndex = lineErrorLineNumber - 1;

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

      const contents = file.getContentsAsString().split(/\n/);
      const lineContent = contents[parseErrorContentIndex];

      // Try to grab the line number, which sometimes doesn't exist on
      // line, abnormally-long lines in a larger block.
      const lineSrcLineParts = /^(.*?)(?:\s*\/\/ (\d+))?$/.exec(lineContent);

      // The line didn't match at all?  Let's just not try.
      if (!lineSrcLineParts) {
        return;
      }

      const lineSrcLineContent = lineSrcLineParts[1];
      const lineSrcLineNumber = lineSrcLineParts[2];

      // Count backward from the failed line to find the filename.
      for (let c = parseErrorContentIndex - 1; c >= 0; c--) {
        let sourceLine = contents[c];

        // If the line is a boatload of slashes, we're in the right place.
        if (/^\/\/\/{6,}$/.test(sourceLine)) {

          // If 4 lines back is the same exact line, we've found the framing.
          if (contents[c - 4] === sourceLine) {

            // So in that case, 2 lines back is the file path.
            let parseErrorPath = contents[c - 2]
              .substring(3)
              .replace(/\s+\/\//, "");

            let minError = new Error(
              "babel-minify minification error " +
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

    // this object will collect all the minified code in the 
    // data field and then post-minfiication file sizes in
    // stats field
    const toBeAdded = {
      data: "",
      stats: Object.create(null)
    };

    files.forEach(file => {
      // Don't reminify *.min.js.
      if (/\.min\.js$/.test(file.getPathInBundle())) {
        toBeAdded.data += file.getContentsAsString();
      }
      else {
        let minified;
        try {
          minified = meteorJsMinify(file.getContentsAsString());

          if (!(minified && typeof minified.code === "string")) {
            // this error gets raised when babel-minify doesn't
            // raise an exception when it executes but fails to
            // return any useful result in the code field
            throw new Error("Unknown babel-minify error");
          }
        }
        catch (err) {
          
          const filePath = file.getPathInBundle();

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
        // append the minified code to the "running sum"
        // of code being minified
        toBeAdded.data += minified.code;
      }

      toBeAdded.data += '\n\n';

      Plugin.nudge();
    });

    // this is where the minified code gets added to one 
    // JS file that is delivered to the client
    if (files.length) {
      files[0].addJavaScript(toBeAdded);
    }
  }
}