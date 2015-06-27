var _ = require('underscore');
var sourcemap = require('source-map');
var buildmessage = require('./buildmessage');
var watch = require('./watch.js');

var packageDot = function (name) {
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.exec(name))
    return "Package." + name;
  else
    return "Package['" + name + "']";
};

///////////////////////////////////////////////////////////////////////////////
// Module
///////////////////////////////////////////////////////////////////////////////

// options include name, imports, exports, useGlobalNamespace,
// combinedServePath, and importStubServePath, all of which have the
// same meaning as they do when passed to import().
var Module = function (options) {
  var self = this;

  // module name or null
  self.name = options.name || null;

  // files in the module. array of File
  self.files = [];

  // options
  self.declaredExports = options.declaredExports;
  self.useGlobalNamespace = options.useGlobalNamespace;
  self.combinedServePath = options.combinedServePath;
  self.importStubServePath = options.importStubServePath;
  self.jsAnalyze = options.jsAnalyze;
  self.noLineNumbers = options.noLineNumbers;
};

_.extend(Module.prototype, {
  // source: the source code
  // servePath: the path where it would prefer to be served if possible
  addFile: function (inputFile) {
    var self = this;
    self.files.push(new File(inputFile, self));
  },


  maxLineLength: function (ignoreOver) {
    var self = this;

    var maxInFile = [];
    _.each(self.files, function (file) {
      var m = 0;
      _.each(file.source.split('\n'), function (line) {
        if (line.length <= ignoreOver && line.length > m)
          m = line.length;
      });
      maxInFile.push(m);
    });

    return _.max(maxInFile);
  },

  // Figure out which vars need to be specifically put in the module
  // scope.
  computeAssignedVariables: function () {
    var self = this;

    if (!self.jsAnalyze) {
      // We don't have access to static analysis, probably because we *are* the
      // js-analyze package.  Let's do a stupid heuristic: the exports are
      // the only module scope vars. (This works for js-analyze.JSAnalyze...)
      return self.declaredExports;
    }

    // The assigned variables in the app aren't actually used for anything:
    // we're using the global namespace, so there's no header where we declare
    // all of the assigned variables as vars.  So there's no use wasting time
    // running static analysis on app code.
    if (self.useGlobalNamespace) {
      return [];
    }

    // Find all global references in any files
    var assignedVariables = [];
    _.each(self.files, function (file) {
      assignedVariables = assignedVariables.concat(
        file.computeAssignedVariables());
    });
    assignedVariables = _.uniq(assignedVariables);

    return _.isEmpty(assignedVariables) ? undefined : assignedVariables;
  },

  // Output is a list of objects with keys 'source', 'servePath', 'sourceMap',
  // 'sourcePath'
  getPrelinkedFiles: function () {
    var self = this;

    // If we don't want to create a separate scope for this module,
    // then our job is much simpler. And we can get away with
    // preserving the line numbers.
    if (self.useGlobalNamespace) {
      return _.map(self.files, function (file) {
        var node = file.getPrelinkedOutput({ preserveLineNumbers: true });
        var results = node.toStringWithSourceMap({
          file: file.servePath
        }); // results has 'code' and 'map' attributes

        var sourceMap = results.map.toJSON();
        // No use generating empty source maps.
        if (_.isEmpty(sourceMap.sources))
          sourceMap = null;
        else
          sourceMap = JSON.stringify(sourceMap);

        return {
          source: results.code,
          servePath: file.servePath,
          sourceMap: sourceMap
        };
      });
    }

    // Otherwise..

    // Find the maximum line length.
    var sourceWidth = _.max([68, self.maxLineLength(120 - 2)]);

    // Prologue
    var chunks = [];

    // Emit each file
    _.each(self.files, function (file) {
      if (!_.isEmpty(chunks))
        chunks.push("\n\n\n\n\n\n");
      chunks.push(file.getPrelinkedOutput({
        sourceWidth: sourceWidth,
        noLineNumbers: self.noLineNumbers
      }));
    });

    var node = new sourcemap.SourceNode(null, null, null, chunks);

    var results = node.toStringWithSourceMap({
      file: self.combinedServePath
    }); // results has 'code' and 'map' attributes
    return [{
      source: results.code,
      servePath: self.combinedServePath,
      sourceMap: results.map.toString()
    }];
  }
});

// Given 'symbolMap' like {Foo: 's1', 'Bar.Baz': 's2', 'Bar.Quux.A': 's3', 'Bar.Quux.B': 's4'}
// return something like
// {Foo: 's1', Bar: {Baz: 's2', Quux: {A: 's3', B: 's4'}}}
//
// If the value of a symbol in symbolMap is set null, then we just
// ensure that its parents exist. For example, {'A.B.C': null} means
// to make sure that symbol tree contains at least {A: {B: {}}}.
var buildSymbolTree = function (symbolMap) {
  var ret = {};

  _.each(symbolMap, function (value, symbol) {
    var parts = symbol.split('.');
    var lastPart = parts.pop();

    var walk = ret;
    _.each(parts, function (part) {
      if (! (part in walk))
        walk[part] = {};
      walk = walk[part];
    });

    if (value)
      walk[lastPart] = value;
  });

  return ret;
};

// Given something like {Foo: 's1', Bar: {Baz: 's2', Quux: {A: 's3', B: 's4'}}}
// construct a string like {Foo: s1, Bar: {Baz: s2, Quux: {A: s3, B: s4}}}
// except with pretty indentation.
var writeSymbolTree = function (symbolTree, indent) {
  var put = function (node, indent) {
    if (typeof node === "string") {
      return node;
    }
    if (_.keys(node).length === 0) {
      return '{}';
    }
    var spacing = new Array(indent + 1).join(' ');
    // XXX prettyprint!
    return "{\n" +
      _.map(node, function (value, key) {
        return spacing + "  " + key + ": " + put(value, indent + 2);
      }).join(',\n') + "\n" + spacing + "}";
  };

  return put(symbolTree, indent || 0);
};


///////////////////////////////////////////////////////////////////////////////
// File
///////////////////////////////////////////////////////////////////////////////

var File = function (inputFile, module) {
  var self = this;

  // source code for this file (a string)
  self.source = inputFile.source;

  // hash of source (precalculated for *.js files, calculated here for files
  // produced by plugins)
  self.sourceHash = inputFile.sourceHash || watch.sha1(self.source);

  // the path where this file would prefer to be served if possible
  self.servePath = inputFile.servePath;

  // The relative path of this input file in its source tree (eg,
  // package or app). Used for source maps, error messages..
  self.sourcePath = inputFile.sourcePath;

  // If true, don't wrap this individual file in a closure.
  self.bare = !!inputFile.bare;

  // A source map (generated by something like CoffeeScript) for the input file.
  self.sourceMap = inputFile.sourceMap;

  // The Module containing this file.
  self.module = module;
};

// The JsAnalyze code is somewhat slow, and we often compute assigned variables
// on the same file multiple times in one process (notably, a single file is
// often processed for two or three different unibuilds, and is processed again
// when rebuilding a package when another file has changed). We cache the
// calculated variables under the source file's hash (calculating the source
// file's hash is faster than running jsAnalyze, and in the case of *.js files
// we have the hash already anyway).
var ASSIGNED_GLOBALS_CACHE = {};

_.extend(File.prototype, {
  // Return the globals in this file as an array of symbol names.  For
  // example: if the code references 'Foo.bar.baz' and 'Quux', and
  // neither are declared in a scope enclosing the point where they're
  // referenced, then globalReferences would include ["Foo", "Quux"].
  computeAssignedVariables: function () {
    var self = this;

    var jsAnalyze = self.module.jsAnalyze;
    // If we don't have a JSAnalyze object, we probably are the js-analyze
    // package itself. Assume we have no global references. At the module level,
    // we'll assume that exports are global references.
    if (!jsAnalyze)
      return [];

    if (_.has(ASSIGNED_GLOBALS_CACHE, self.sourceHash)) {
      return ASSIGNED_GLOBALS_CACHE[self.sourceHash];
    }

    try {
      return (ASSIGNED_GLOBALS_CACHE[self.sourceHash] =
              _.keys(jsAnalyze.findAssignedGlobals(self.source)));
    } catch (e) {
      if (!e.$ParseError)
        throw e;

      var errorOptions = {
        file: self.sourcePath,
        line: e.lineNumber,
        column: e.column
      };
      if (self.sourceMap) {
        var parsed = new sourcemap.SourceMapConsumer(self.sourceMap);
        var original = parsed.originalPositionFor(
          {line: e.lineNumber, column: e.column - 1});
        if (original.source) {
          errorOptions.file = original.source;
          errorOptions.line = original.line;
          errorOptions.column = original.column + 1;
        }
      }

      buildmessage.error(e.description, errorOptions);

      // Recover by pretending that this file is empty (which
      // includes replacing its source code with '' in the output)
      self.source = "";
      self.sourceMap = null;
      return [];
    }
  },

  // Options:
  // - preserveLineNumbers: if true, decorate minimally so that line
  //   numbers don't change between input and output. In this case,
  //   sourceWidth is ignored.
  // - noLineNumbers: We still include the banners and such, but
  //   no line number suffix.
  // - sourceWidth: width in columns to use for the source code
  //
  // Returns a SourceNode.
  getPrelinkedOutput: function (options) {
    var self = this;
    var width = options.sourceWidth || 70;
    var bannerWidth = width + 3;
    var result;
    var lines;

    var noLineNumbers = options.noLineNumbers;
    var preserveLineNumbers = options.preserveLineNumbers;

    if (self.sourceMap) {
      // If we have a source map, it is also important to annotate line
      // numbers using that source map, since not all browsers support
      // source maps.
      noLineNumbers = false;

      // Honoring options.preserveLineNumbers is likely impossible if we
      // have a source map, since self.source has probably already been
      // transformed in a way that does not preserve line numbers. That's
      // ok, though, because we have a source map, and we also annotate
      // line numbers using comments (see above), just in case source maps
      // are not supported.
      preserveLineNumbers = false;
    } else if (preserveLineNumbers) {
      // If we don't have a source map, and we're supposed to be preserving line
      // numbers (ie, we are not linking multiple files into one file, because
      // we're the app), then we can get away without annotating line numbers
      // (or making a source map), because they won't add any helpful
      // information.
      noLineNumbers = true;
    }

    if (self.sourceMap) {
      result = {
        code: self.source,
        map: self.sourceMap
      };

    } else if (noLineNumbers && preserveLineNumbers) {
      // No need to generate a source map if we don't want line numbers.
      result = {
        code: self.source,
        map: null
      };

    } else {
      // If we're planning to annotate the source with line number
      // comments (e.g. because we're combining this file with others in a
      // package), and we don't already have a source map, then we need to
      // generate one, so that we don't have to write two different
      // versions of the code for annotating line numbers, and also so
      // that browsers that support source maps can display a prettier
      // version of this file without the line number comments.
      var smg = new sourcemap.SourceMapGenerator({
        file: self.servePath
      });

      lines = self.source.split("\n");

      _.each(lines, function (line, i) {
        var start = { line: i + 1, column: 0 };
        smg.addMapping({
          original: start,
          generated: start,
          source: self.servePath
        });
      });

      smg.setSourceContent(self.servePath, self.source);

      result = {
        code: self.source,
        map: smg.toJSON()
      };
    }

    var smc = result.map &&
      new sourcemap.SourceMapConsumer(result.map);

    if (smc && ! noLineNumbers) {
      var padding = bannerPadding(bannerWidth);

      // We might have already done this split above.
      lines = lines || result.code.split("\n");

      // Use the SourceMapConsumer object to compute the original line
      // number for each line of result.code.
      _.each(lines, function (line, i) {
        var len = line.length;
        if (len < width &&
            line[len - 1] !== "\\") {
          var pos = smc.originalPositionFor({
            line: i + 1,
            column: 0
          });

          if (pos) {
            lines[i] += padding.slice(len, width) + " //";
            // Not all source maps define a mapping for every line in the
            // output. This is perfectly normal.
            if (typeof pos.line === "number") {
              lines[i] += " " + pos.line;
            }
          }
        }
      });

      result.code = lines.join("\n");
    }

    var chunks = [];
    var pathNoSlash = self.servePath.replace(/^\//, "");

    if (! self.bare) {
      chunks.push(
        "(function(){",
        preserveLineNumbers ? "" : "\n\n"
      );
    }

    if (! preserveLineNumbers) {
      // Banner
      var bannerLines = [pathNoSlash];

      if (self.bare) {
        bannerLines.push(
          "This file is in bare mode and is not in its own closure.");
      }

      chunks.push(banner(bannerLines, bannerWidth));

      var blankLine = new Array(width + 1).join(' ') + " //\n";
      chunks.push(blankLine);
    }

    if (result.code) {
      chunks.push(
        // If we have a source map for result.code, push a SourceNode onto
        // the chunks array that encapsulates that source map. If we don't
        // have a source map, just push result.code.
        smc ? sourcemap.SourceNode.fromStringWithSourceMap(result.code, smc)
            : result.code
      );

      // It's important for the code to end with a newline, so that a
      // trailing // comment can't snarf code appended after it.
      if (result.code[result.code - 1] !== "\n") {
        chunks.push("\n");
      }
    }

    // Footer
    if (! self.bare) {
      if (preserveLineNumbers) {
        chunks.push("}).call(this);\n");
      } else {
        chunks.push(
          dividerLine(bannerWidth),
          "\n}).call(this);\n"
        );
      }
    }

    return new sourcemap.SourceNode(null, null, null, chunks);
  }
});

// Given a list of lines (not newline-terminated), returns a string placing them
// in a pretty banner of width bannerWidth. All lines must have length at most
// (bannerWidth - 6); if bannerWidth is not provided, the smallest width that
// fits is used.
var banner = function (lines, bannerWidth) {
  if (!bannerWidth)
    bannerWidth = 6 + _.max(lines, function (x) { return x.length; }).length;

  var divider = dividerLine(bannerWidth);
  var spacer = "// " + new Array(bannerWidth - 6 + 1).join(' ') + " //\n";
  var padding = bannerPadding(bannerWidth);

  var buf = divider + spacer;
  _.each(lines, function (line) {
    buf += "// " + (line + padding).slice(0, bannerWidth - 6) + " //\n";
  });
  buf += spacer + divider;
  return buf;
};
var dividerLine = function (bannerWidth) {
  return new Array(bannerWidth + 1).join('/') + "\n";
};
var bannerPadding = function (bannerWidth) {
  return new Array(bannerWidth + 1).join(' ');
};

///////////////////////////////////////////////////////////////////////////////
// Top-level entry point
///////////////////////////////////////////////////////////////////////////////

// This does the first phase of linking. It does not require knowledge
// of your imports. It returns the module's exports, plus a set of
// partially linked files which you must pass to link() along with
// your import list to get your final linked files.
//
// options include:
//
// name: the name of this module (for stashing exports to be later
// read by the imports of other modules); null if the module has no
// name (in that case exports will not work properly)
//
// inputFiles: an array of objects representing input files.
//  - source: the source code
//  - servePath: the path where it would prefer to be served if
//    possible. still allowed on non-browser targets, where it
//    represent as hint as to what the file should be named on disk in
//    the bundle (this will only be seen by someone looking at the
//    bundle, not in error messages, but it's still nice to make it
//    look good)
//  - sourcePath: path to use in error messages
//  - sourceMap: an optional source map (as string) for the input file
//
// declaredExports: an array of symbols that the module exports. Symbols are
// {name,testOnly} pairs.
//
// useGlobalNamespace: make the top level namespace be the same as the
// global namespace, so that symbols are accessible from the
// console. typically used when linking apps (as opposed to packages).
//
// combinedServePath: if we end up combining all of the files into
// one, use this as the servePath.
//
// importStubServePath: if useGlobalNamespace is true, then to
// preserve line numbers, we may want to emit an additional file
// containing import setup code for the global environment. this is
// the servePath to use for it.
//
// jsAnalyze: if possible, the JSAnalyze object from the js-analyze
// package. (This is not possible if we are currently linking the main unibuild of
// the js-analyze package!)
//
// Output is an object with keys:
// - files: is an array of output files in the same format as inputFiles
//   - EXCEPT THAT, for now, sourcePath is omitted and is replaced with
//     sourceMap (a string) (XXX)
// - assignedPackageVariables: an array of variables assigned to without
//   being declared
var prelink = function (options) {
  var module = new Module({
    name: options.name,
    declaredExports: options.declaredExports,
    useGlobalNamespace: options.useGlobalNamespace,
    importStubServePath: options.importStubServePath,
    combinedServePath: options.combinedServePath,
    jsAnalyze: options.jsAnalyze,
    noLineNumbers: options.noLineNumbers
  });

  _.each(options.inputFiles, function (inputFile) {
    module.addFile(inputFile);
  });

  // Do static analysis to compute module-scoped variables. Error recovery from
  // the static analysis mutates the sources, so this has to be done before
  // concatenation.
  var assignedVariables = module.computeAssignedVariables();
  var files = module.getPrelinkedFiles();

  return {
    files: files,
    assignedVariables: assignedVariables
  };
};

var SOURCE_MAP_INSTRUCTIONS_COMMENT = banner([
  "This is a generated file. You can view the original",
  "source in your browser if your browser supports source maps.",
  "",
  "If you are using Chrome, open the Developer Tools and click the gear",
  "icon in its lower right corner. In the General Settings panel, turn",
  "on 'Enable source maps'.",
  "",
  "If you are using Firefox 23, go to `about:config` and set the",
  "`devtools.debugger.source-maps-enabled` preference to true.",
  "(The preference should be on by default in Firefox 24; versions",
  "older than 23 do not support source maps.)"
]);

// Finish the linking.
//
// options include:
//
// imports: symbols to import. map from symbol name (something like
// 'Foo', "Foo.bar", etc) to the module from which it should be
// imported (which must load before us at runtime)
//
// packageVariables: package-scope variables, some of which may be exports.
//   a list of {name, export} objects; any non-falsy value for "export" means
//   to export it.
//
// useGlobalNamespace: must be the same value that was passed to link()
//
// prelinkFiles: the 'files' output from prelink()
//
// Output is an array of final output files in the same format as the
// 'inputFiles' argument to prelink().
var link = function (options) {
  if (options.useGlobalNamespace) {
    var ret = [];
    if (!_.isEmpty(options.imports)) {
      ret.push({
        source: getImportCode(options.imports,
                              "/* Imports for global scope */\n\n", true),
        servePath: options.importStubServePath
      });
    }
    return ret.concat(options.prelinkFiles);
  }

  var header = getHeader({
    imports: options.imports,
    packageVariables: options.packageVariables
  });

  var exported = _.pluck(_.filter(options.packageVariables, function (v) {
    return v.export;
  }), 'name');

  var footer = getFooter({
    exported: exported,
    name: options.name
  });

  var ret = [];
  _.each(options.prelinkFiles, function (file) {
    if (file.sourceMap) {
      if (options.includeSourceMapInstructions)
        header = SOURCE_MAP_INSTRUCTIONS_COMMENT + "\n\n" + header;

      // Bias the source map by the length of the header without
      // (fully) parsing and re-serializing it. (We used to do this
      // with the source-map library, but it was incredibly slow,
      // accounting for over half of bundling time.) It would be nice
      // if we could use "index maps" for this (the 'sections' key),
      // as that would let us avoid even JSON-parsing the source map,
      // but that doesn't seem to be supported by Firefox yet.
      if (header.charAt(header.length - 1) !== "\n")
        header += "\n"; // make sure it's a whole number of lines
      var headerLines = header.split('\n').length - 1;
      var sourceMapJson = JSON.parse(file.sourceMap);
      sourceMapJson.mappings = (new Array(headerLines + 1).join(';')) +
        sourceMapJson.mappings;
      ret.push({
        source: header + file.source + footer,
        servePath: file.servePath,
        sourceMap: JSON.stringify(sourceMapJson)
      });
    } else {
      ret.push({
        source: header + file.source + footer,
        servePath: file.servePath
      });
    }
  });

  return ret;
};

var getHeader = function (options) {
  var chunks = [];
  chunks.push("(function () {\n\n" );
  chunks.push(getImportCode(options.imports, "/* Imports */\n", false));
  if (!_.isEmpty(options.packageVariables)) {
    chunks.push("/* Package-scope variables */\n");
    chunks.push("var " + _.pluck(options.packageVariables, 'name').join(', ') +
                ";\n\n");
  }
  return chunks.join('');
};

var getImportCode = function (imports, header, omitvar) {
  var self = this;

  if (_.isEmpty(imports))
    return "";

  // Imports
  var scratch = {};
  _.each(imports, function (name, symbol) {
    scratch[symbol] = packageDot(name) + "." + symbol;
  });
  var tree = buildSymbolTree(scratch);

  // Generate output
  var buf = header;
  _.each(tree, function (node, key) {
    buf += (omitvar ? "" : "var " ) +
      key + " = " + writeSymbolTree(node) + ";\n";
  });
  buf += "\n";

  return buf;
};

var getFooter = function (options) {
  var chunks = [];

  if (options.name && options.exported) {
    chunks.push("\n\n/* Exports */\n");
    chunks.push("if (typeof Package === 'undefined') Package = {};\n");
    chunks.push(packageDot(options.name), " = ");

    // Even if there are no exports, we need to define Package.foo, because the
    // existence of Package.foo is how another package (eg, one that weakly
    // depends on foo) can tell if foo is loaded.
    if (_.isEmpty(options.exported)) {
      chunks.push("{};\n");
    } else {
      // A slightly overkill way to print out a properly indented version of
      // {Foo: Foo, Bar: Bar, Quux: Quux}. (This was less overkill back when
      // you could export dotted symbols.)
      var scratch = {};
      _.each(options.exported, function (symbol) {
        scratch[symbol] = symbol;
      });
      var exportTree = buildSymbolTree(scratch);
      chunks.push(writeSymbolTree(exportTree));
      chunks.push(";\n");
    }
  }

  chunks.push("\n})();\n");
  return chunks.join('');
};

var linker = module.exports = {
  prelink: prelink,
  link: link
};
