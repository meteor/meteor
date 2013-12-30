var fs = require('fs');
var _ = require('underscore');
var sourcemap = require('source-map');
var buildmessage = require('./buildmessage');

var packageDot = function (name) {
  if (/^[a-zA-Z0-9]*$/.exec(name))
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

    // If there are no files *and* we are a no-exports-at-all slice (eg a test
    // slice), then generate no prelink output.
    //
    // If there are no files, but we are a use slice (and thus
    // self.declaredExports is an actual, albeit potentially empty, list), we
    // DON'T want to take this path: we want to return an empty prelink file, so
    // that at link time we end up at least setting `Package.foo = {}`.
    if (_.isEmpty(self.files) && !self.declaredExports)
      return [];

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
      chunks.push(file.getPrelinkedOutput({ sourceWidth: sourceWidth }));
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

    try {
      return _.keys(jsAnalyze.findAssignedGlobals(self.source));
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


  // Relative path to use in source maps to indicate this file. No
  // leading slash.
  _pathForSourceMap: function () {
    var self = this;

    if (self.module.name)
      return self.module.name + "/" + self.sourcePath;
    else
      return require('path').basename(self.sourcePath);
  },

  // Options:
  // - preserveLineNumbers: if true, decorate minimally so that line
  //   numbers don't change between input and output. In this case,
  //   sourceWidth is ignored.
  // - sourceWidth: width in columns to use for the source code
  //
  // Returns a SourceNode.
  getPrelinkedOutput: function (options) {
    var self = this;

    // The newline after the source closes a '//' comment.
    if (options.preserveLineNumbers) {
      // Ugly version
      var mapNode;
      if (self.sourceMap) {
        mapNode = sourcemap.SourceNode.fromStringWithSourceMap(
          self.source, new sourcemap.SourceMapConsumer(self.sourceMap));
      } else {
        // This is an app file that was always JS. The output file here is going
        // to be the same name as the input file (because _pathForSourceMap in
        // apps is the basename of the source file), and having a JS file
        // pointing to a source map pointing to a JS file of the same name will
        // (a) be confusing (b) be unnecessary since we aren't renumbering
        // anything and (c) confuse at least Chrome.
        mapNode = self.source;
      }

      return new sourcemap.SourceNode(null, null, null, [
        self.bare ? "" : "(function(){",
        mapNode,
        (self.source.length && self.source[self.source.length - 1] !== '\n'
         ? "\n" : ""),
        self.bare ? "" : "\n})();\n"
      ]);
    }

    // Pretty version
    var chunks = [];

    // Prologue
    if (! self.bare)
      chunks.push("(function () {\n\n");

    // Banner
    var bannerLines = [self.servePath.slice(1)];
    if (self.bare) {
      bannerLines.push(
        "This file is in bare mode and is not in its own closure.");
    }
    var width = options.sourceWidth || 70;
    var bannerWidth = width + 3;
    var padding = bannerPadding(bannerWidth);
    chunks.push(banner(bannerLines, bannerWidth));
    var blankLine = new Array(width + 1).join(' ') + " //\n";
    chunks.push(blankLine);

    // Code, with line numbers
    // You might prefer your line numbers at the beginning of the
    // line, with /* .. */. Well, that requires parsing the source for
    // comments, because you have to do something different if you're
    // already inside a comment.

    var numberifyLines = function (f) {
      var num = 1;
      var lines = self.source.split('\n');
      _.each(lines, function (line) {
        var suffix = "\n";

        if (line.length <= width && line[line.length - 1] !== "\\") {
          suffix = padding.slice(line.length, width) + " // " + num + "\n";
        }
        f(line, suffix, num);
        num++;
      });
    };

    var lines = self.source.split('\n');

    if (self.sourceMap) {
      var buf = "";
      numberifyLines(function (line, suffix) {
        buf += line;
        buf += suffix;
      });
      // The existing source map is valid because all we're doing is adding
      // things to the end of lines, which doesn't affect the source map.  (If
      // we wanted to be picky, we could add some explicitly non-mapped regions
      // to the source map to cover the suffixes, which would make this
      // equivalent to the "no source map coming in" case, but this doesn't seem
      // that important.)
      chunks.push(sourcemap.SourceNode.fromStringWithSourceMap(
        self.source,
        new sourcemap.SourceMapConsumer(self.sourceMap)));
    } else {
      // There are probably ways to make a more compact source map. For example,
      // the only change we make is to append a comment, so we can probably emit
      // one mapping for the whole file. For the moment, we'll do it by the book
      // just to see how it goes.
      numberifyLines(function (line, suffix, num) {
        chunks.push(new sourcemap.SourceNode(num, 0, self._pathForSourceMap(),
                                             line));
        chunks.push(suffix);
      });
    }

    // Footer
    if (! self.bare)
      chunks.push(dividerLine(bannerWidth) + "\n}).call(this);\n");

    var node = new sourcemap.SourceNode(null, null, null, chunks);

    // If we're working directly from the original source here (and not from the
    // output of a transformation that had a source map), include the original
    // source in the source map. (If we are working on generated code, the
    // source map we received should have already contained the original
    // source.)
    if (!self.sourceMap)
      node.setSourceContent(self._pathForSourceMap(), self.source);

    return node;
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
// declaredExports: an array of symbols that the module exports.  null if our
// slice isn't allowed to have exports. Symbols are {name,testOnly} pairs.
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
// package. (This is not possible if we are currently linking the main slice of
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
    jsAnalyze: options.jsAnalyze
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
// noExports: if true, don't generate an exports section (don't even create
// `Package.name`).
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

  var exported;
  if (!options.noExports) {
    exported = _.pluck(_.filter(options.packageVariables, function (v) {
      return v.export;
    }), 'name');
  }

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
