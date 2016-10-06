var sourcemap = Npm.require("source-map");
var createHash = Npm.require("crypto").createHash;
var LRU = Npm.require("lru-cache");

Plugin.registerMinifier({
  extensions: ["css"],
  archMatching: "web"
}, function () {
  var minifier = new CssToolsMinifier();
  return minifier;
});

function CssToolsMinifier () {};

CssToolsMinifier.prototype.processFilesForBundle = function (files, options) {
  var mode = options.minifyMode;

  if (! files.length) return;

  var merged = mergeCss(files);

  if (mode === 'development') {
    files[0].addStylesheet({
      data: merged.code,
      sourceMap: merged.sourceMap,
      path: 'merged-stylesheets.css'
    });
    return;
  }

  var minifiedFiles = CssTools.minifyCss(merged.code);

  if (files.length) {
    minifiedFiles.forEach(function (minified) {
      files[0].addStylesheet({
        data: minified
      });
    });
  }
};

var mergeCache = new LRU({
  max: 100
});

var hashFiles = Profile("hashFiles", function (files) {
  var hash = createHash("sha1");
  var hashes = files.forEach(f => {
    hash.update(f.getSourceHash()).update("\0");
  });
  return hash.digest("hex");
});

// Lints CSS files and merges them into one file, fixing up source maps and
// pulling any @import directives up to the top since the CSS spec does not
// allow them to appear in the middle of a file.
var mergeCss = Profile("mergeCss", function (css) {
  var hashOfFiles = hashFiles(css);
  var merged = mergeCache.get(hashOfFiles);
  if (merged) {
    return merged;
  }

  // Filenames passed to AST manipulator mapped to their original files
  var originals = {};

  var cssAsts = css.map(function (file) {
    var filename = file.getPathInBundle();
    originals[filename] = file;
    try {
      var parseOptions = { source: filename, position: true };
      var ast = CssTools.parseCss(file.getContentsAsString(), parseOptions);
      ast.filename = filename;
    } catch (e) {
      if (e.reason) {
        file.error({
          message: e.reason,
          line: e.line,
          column: e.column
        });
      } else {
        // Just in case it's not the normal error the library makes.
        file.error({message: e.message});
      }

      return { type: "stylesheet", stylesheet: { rules: [] },
        filename: filename };
    }

    return ast;
  });

  var warnCb = function (filename, msg) {
    // XXX make this a buildmessage.warning call rather than a random log.
    //     this API would be like buildmessage.error, but wouldn't cause
    //     the build to fail.
    console.log(filename + ': warn: ' + msg);
  };

  var mergedCssAst = CssTools.mergeCssAsts(cssAsts, warnCb);

  // Overwrite the CSS files list with the new concatenated file
  var stringifiedCss = CssTools.stringifyCss(mergedCssAst, {
    sourcemap: true,
    // don't try to read the referenced sourcemaps from the input
    inputSourcemaps: false
  });

  if (! stringifiedCss.code) {
    mergeCache.set(hashOfFiles, merged = { code: '' });
    return merged;
  }

  // Add the contents of the input files to the source map of the new file
  stringifiedCss.map.sourcesContent =
    stringifiedCss.map.sources.map(function (filename) {
      return originals[filename].getContentsAsString();
    });

  var newMap;

  // Compose the concatenated file's source map with source maps from the
  // previous build step if necessary.
  Profile.time("composing source maps", function () {
    var concatConsumer;

    newMap = new sourcemap.SourceMapGenerator();
    concatConsumer = new sourcemap.SourceMapConsumer(stringifiedCss.map);

    // Create a dictionary of source map consumers for fast access
    var consumers = Object.keys(originals).reduce(function (consumers, name) {
      var file = originals[name];
      var sourceMap = file.getSourceMap();

      if (sourceMap) {
        try {
          consumers[name] = new sourcemap.SourceMapConsumer(sourceMap);
        } catch (err) {
          // If we can't apply the source map, silently drop it.
          //
          // XXX This is here because there are some less files that
          // produce source maps that throw when consumed. We should
          // figure out exactly why and fix it, but this will do for now.
        }
      }

      return consumers;
    }, Object.create(null));

    // Find mappings from the concatenated file back to the original files
    concatConsumer.eachMapping(function (mapping) {
      var consumer = consumers[mapping.source];
      var source;

      // If there is a source map for the original file, e.g., if it has been
      // compiled from Less to CSS, find the source location in the original's
      // original file. Otherwise, use the mapping of the concatenated file's
      // source map.
      var original = {
        line: mapping.originalLine,
        column: mapping.originalColumn
      };

      if (consumer) {
        original = consumer.originalPositionFor(original);
        source = original.source;
      } else {
        source = mapping.source;
      }

      // Add a new mapping to the final source map
      newMap.addMapping({
        generated: {
          line: mapping.generatedLine,
          column: mapping.generatedColumn
        },
        original: {
          line: original.line,
          column: original.column
        },
        source: source
      });

      // Set the correct content for the mapping's source
      newMap.setSourceContent(
        source,
        (consumer || concatConsumer).sourceContentFor(source)
      );
    });
  });

  mergeCache.set(hashOfFiles, merged = {
    code: stringifiedCss.code,
    sourceMap: newMap.toString()
  });

  return merged;
});
