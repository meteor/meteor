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

function disableSourceMappingURLs(css) {
  return css.replace(/# sourceMappingURL=/g,
                     "# sourceMappingURL_DISABLED=");
}

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
      var css = disableSourceMappingURLs(file.getContentsAsString());
      var ast = CssTools.parseCss(css, parseOptions);
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
      const file = originals[filename] || null;
      return file && file.getContentsAsString();
    });

  // Compose the concatenated file's source map with source maps from the
  // previous build step if necessary.
  var newMap = Profile.time("composing source maps", function () {
    var newMap = new sourcemap.SourceMapGenerator();
    var concatConsumer = new sourcemap.SourceMapConsumer(stringifiedCss.map);

    // Create a dictionary of source map consumers for fast access
    var consumers = Object.create(null);

    Object.keys(originals).forEach(function (name) {
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
    });

    // Maps each original source file name to the SourceMapConsumer that
    // can provide its content.
    var sourceToConsumerMap = Object.create(null);

    // Find mappings from the concatenated file back to the original files
    concatConsumer.eachMapping(function (mapping) {
      var source = mapping.source;
      var consumer = consumers[source];

      var original = {
        line: mapping.originalLine,
        column: mapping.originalColumn
      };

      // If there is a source map for the original file, e.g., if it has been
      // compiled from Less to CSS, find the source location in the original's
      // original file. Otherwise, use the mapping of the concatenated file's
      // source map.
      if (consumer) {
        var newOriginal = consumer.originalPositionFor(original);

        // Finding the original position should always be possible (otherwise,
        // one of the source maps would have incorrect mappings). However, in
        // case there is something wrong, use the intermediate mapping.
        if (newOriginal.source !== null) {
          original = newOriginal;
          source = original.source;

          if (source) {
            // Since the new consumer provided a different
            // original.source, we should ask it for the original source
            // content instead of asking the concatConsumer.
            sourceToConsumerMap[source] = consumer;
          }
        }
      }

      if (source && ! sourceToConsumerMap[source]) {
        // If we didn't set sourceToConsumerMap[source] = consumer above,
        // use the concatConsumer to determine the original content.
        sourceToConsumerMap[source] = concatConsumer;
      }

      // Add a new mapping to the final source map
      newMap.addMapping({
        generated: {
          line: mapping.generatedLine,
          column: mapping.generatedColumn
        },
        original: original,
        source: source
      });
    });

    // The consumer.sourceContentFor and newMap.setSourceContent methods
    // are relatively fast, but not entirely trivial, so it's better to
    // call them only once per source, rather than calling them every time
    // we call newMap.addMapping in the loop above.
    Object.keys(sourceToConsumerMap).forEach(function (source) {
      var consumer = sourceToConsumerMap[source];
      var content = consumer.sourceContentFor(source);
      newMap.setSourceContent(source, content);
    });

    return newMap;
  });

  mergeCache.set(hashOfFiles, merged = {
    code: stringifiedCss.code,
    sourceMap: newMap.toString()
  });

  return merged;
});
