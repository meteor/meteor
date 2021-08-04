import { extractModuleSizesTree } from "./stats.js";

Plugin.registerMinifier({
    extensions: ['js'],
    archMatching: 'web',
  },
  () => new MeteorMinifier()
);

class MeteorMinifier {

  processFilesForBundle (files, options) {
    const mode = options.minifyMode;

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

    // this function tries its best to locate the original source file
    // that the error being reported was located inside of
    function maybeThrowMinifyErrorBySourceFile(error, file) {

      const lines = file.getContentsAsString().split(/\n/);
      const lineContent = lines[error.line - 1];

      let originalSourceFileLineNumber = 0;

      // Count backward from the failed line to find the oringal filename
      for (let i = (error.line - 1); i >= 0; i--) {
          let currentLine = lines[i];

          // If the line is a boatload of slashes (8 or more), we're in the right place.
          if (/^\/\/\/{6,}$/.test(currentLine)) {

              // If 4 lines back is the same exact line, we've found the framing.
              if (lines[i - 4] === currentLine) {

                  // So in that case, 2 lines back is the file path.
                  let originalFilePath = lines[i - 2].substring(3).replace(/\s+\/\//, "");

                  throw new Error(
                      `terser minification error (${error.name}:${error.message})\n` +
                      `Source file: ${originalFilePath}  (${originalSourceFileLineNumber}:${error.col})\n` +
                      `Line content: ${lineContent}\n`);
              }
          }
          originalSourceFileLineNumber++;
      }
    }

    // this object will collect all the minified code in the
    // data field and post-minfiication file sizes in the stats field
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
        }
        catch (err) {
          maybeThrowMinifyErrorBySourceFile(err, file);

          throw new Error(`terser minification error (${err.name}:${err.message})\n` +
                          `Bundled file: ${file.getPathInBundle()}  (${err.line}:${err.col})\n`);
        }

        const ast = extractModuleSizesTree(minified.code);

        if (ast) {
          toBeAdded.stats[file.getPathInBundle()] = [Buffer.byteLength(minified.code), ast];
        } else {
          toBeAdded.stats[file.getPathInBundle()] = Buffer.byteLength(minified.code);
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
