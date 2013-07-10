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

// options include name, imports, forceExport, useGlobalNamespace,
// combinedServePath, importStubServePath, and noExports, all of which have the
// same meaning as they do when passed to import().
var Module = function (options) {
  var self = this;

  // module name or null
  self.name = options.name || null;

  // files in the module. array of File
  self.files = [];

  // options
  self.forceExport = options.forceExport || [];
  self.useGlobalNamespace = options.useGlobalNamespace;
  self.combinedServePath = options.combinedServePath;
  self.importStubServePath = options.importStubServePath;
  self.noExports = !!options.noExports;
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
  //
  // XXX We used to subtract 'import roots' out of this (defined as
  // the first part of each imported symbol) but two-phase link
  // complicates this. We should really go back to doing it, though,
  // because otherwise the output looks ugly and it's harder to skim
  // and see what your globals are. Probably this means we need to
  // move the emission of the Package-scope Variables section (but not
  // the actual static analysis) to the final phase.
  computeModuleScopeVars: function () {
    var self = this;

    if (!self.jsAnalyze) {
      // We don't have access to static analysis, probably because we *are* the
      // js-analyze package.  Let's do a stupid heuristic: any exports that have
      // no dots are module scope vars. (This works for
      // js-analyze.JSAnalyze...)
      return _.filter(self.getExports(), function (e) {
        return e.indexOf('.') === -1;
      });
    }

    // Find all global references in any files
    var globalReferences = [];
    _.each(self.files, function (file) {
      globalReferences = globalReferences.concat(file.computeGlobalReferences());
    });
    globalReferences = _.uniq(globalReferences);

    return _.isEmpty(globalReferences) ? undefined : globalReferences;
  },

  // Output is a list of objects with keys 'source', 'servePath',
  // 'sourceMap', 'sources' (map from relative path in source map to
  // 'package', 'sourcePath', 'source')
  getPrelinkedFiles: function () {
    var self = this;

    if (! self.files.length)
      return [];

    var moduleExports = self.getExports();

    // If we don't want to create a separate scope for this module,
    // then our job is much simpler. And we can get away with
    // preserving the line numbers.
    if (self.useGlobalNamespace) {
      return _.map(self.files, function (file) {
        var node = file.getPrelinkedOutput({ preserveLineNumbers: true,
                                             exports: moduleExports });
        var results = node.toStringWithSourceMap({
          file: file.servePath
        }); // results has 'code' and 'map' attributes

        var sources = {};
        file.addToSourcesSet(sources);

        return {
          source: results.code,
          servePath: file.servePath,
          sourceMap: results.map.toString(),
          sources: sources
        };
      });
    }

    // Otherwise..

    // Find the maximum line length.
    var sourceWidth = _.max([68, self.maxLineLength(120 - 2)]);

    // Prologue
    var chunks = [];

    // Emit each file
    var sources = {};
    _.each(self.files, function (file) {
      if (!_.isEmpty(chunks))
        chunks.push("\n\n\n\n\n\n");
      chunks.push(file.getPrelinkedOutput({ sourceWidth: sourceWidth,
                                            exports: moduleExports }));
      file.addToSourcesSet(sources);
    });

    var node = new sourcemap.SourceNode(null, null, null, chunks);

    var results = node.toStringWithSourceMap({
      file: self.combinedServePath
    }); // results has 'code' and 'map' attributes
    return [{
      source: results.code,
      servePath: self.combinedServePath,
      sourceMap: results.map.toString(),
      sources: sources
    }];
  },

  // Return our exports as a list of string
  getExports: function () {
    var self = this;

    if (self.noExports)
      return [];

    var exports = {};
    _.each(self.files, function (file) {
      _.extend(exports, file.exports);
    });

    return _.union(_.keys(exports), self.forceExport);
  }
});

// Given 'symbolMap' like {Foo: 's1', 'Bar.Baz': 's2', 'Bar.Quux.A': 's3', 'Bar.Quux.B': 's4'}
// return something like
// {Foo: 's1', Bar: {Baz: 's2', Quux: {A: 's3', B: 's4'}}}
var buildSymbolTree = function (symbolMap, f) {
  // XXX XXX detect and report conflicts, like one file exporting
  // Foo and another file exporting Foo.Bar
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
  // package or app.) Used for source maps, error messages..
  self.sourcePath = inputFile.sourcePath;

  // should line and column be included in errors?
  self.includePositionInErrors = inputFile.includePositionInErrors;

  // A function which transforms the source code once all exports are
  // known. (eg, for CoffeeScript.)
  self.linkerFileTransform =
    inputFile.linkerFileTransform || function (source, exports, sourceMap) {
      return {source: source, sourceMap: sourceMap};
    };

  // If true, don't wrap this individual file in a closure.
  self.bare = !!inputFile.bare;

  // A source map (generated by something like CoffeeScript) for the input file.
  self.sourceMap = inputFile.sourceMap;
  // Information about the source files in a source map. May have come with the
  // source map, or we may be building it from scratch.
  self.sourcesFromSourceMap = inputFile.sourceMap && inputFile.sources;

  // The Module containing this file.
  self.module = module;

  // symbols mentioned in @export, @require, @provide, or @weak
  // directives. each is a map from the symbol (given as a string) to
  // true. (only @export is actually implemented)
  self.exports = {};
  self.requires = {};
  self.provides = {};
  self.weaks = {};

  self._scanForComments();
};

_.extend(File.prototype, {
  // Return the globals in this file as an array of symbol names.  For
  // example: if the code references 'Foo.bar.baz' and 'Quux', and
  // neither are declared in a scope enclosing the point where they're
  // referenced, then globalReferences would include ["Foo", "Quux"].
  computeGlobalReferences: function () {
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
      buildmessage.error(e.description, {
        file: self.sourcePath,
        line: self.includePositionInErrors ? e.lineNumber : null,
        column: self.includePositionInErrors ? e.column : null,
        downcase: true
      });

      // Recover by pretending that this file is empty (which
      // includes replacing its source code with '' in the output)
      self.source = "";
      return [];
    }
  },


  // Relative path to use in source maps to indicate this file. No
  // leading slash.
  _pathForSourceMap: function () {
    var self = this;

    if (self.module.name)
      return "packages/" + self.module.name + "/" + self.sourcePath;
    else
      return "app/" + self.sourcePath;
  },

  // Add to a 'sources' set (a map from source map relative paths to
  // info about each source file)
  addToSourcesSet: function (sources) {
    var self = this;
    if (self.sourcesFromSourceMap) {
      _.extend(sources, self.sourcesFromSourceMap);
    } else {
      sources[self._pathForSourceMap()] = {
        package: self.module.name,
        sourcePath: self.sourcePath,
        source: new Buffer(self.source, 'utf8') // XXX encoding
      };
    }
  },

  // Options:
  // - preserveLineNumbers: if true, decorate minimally so that line
  //   numbers don't change between input and output. In this case,
  //   sourceWidth is ignored.
  // - sourceWidth: width in columns to use for the source code
  // - exports: the module's exports
  //
  // Returns a SourceNode.
  getPrelinkedOutput: function (options) {
    var self = this;

    // The newline after the source closes a '//' comment.
    if (options.preserveLineNumbers) {
      // Ugly version
      // XXX XXX need to propagate source maps through linkerFileTransform!
      var bodyWithMap = self.linkerFileTransform(self.source, options.exports,
                                                 self.sourceMap);
      self.source = bodyWithMap.source;
      var mapNode;
      if (bodyWithMap.sourceMap) {
        mapNode = sourcemap.SourceNode.fromStringWithSourceMap(
          self.source, new sourcemap.SourceMapConsumer(bodyWithMap.sourceMap));
      } else {
        mapNode = new sourcemap.SourceNode(1, 0, self._pathForSourceMap(),
                                           self.source);
      }

      return new sourcemap.SourceNode(null, null, null, [
        self.bare ? "" : "(function(){",
        mapNode,
        (self.source.length
          && bodyWithMap.source[self.source.length - 1] !== '\n'
         ? "\n" : ""),
        self.bare ? "" : "\n})();\n"
      ]);
    }

    // Pretty version
    var chunks = [];
    var header = "";

    // Prologue
    if (! self.bare)
      header += "(function () {\n\n";

    // Banner
    var width = options.sourceWidth || 70;
    var bannerWidth = width + 3;
    var divider = new Array(bannerWidth + 1).join('/') + "\n";
    var spacer = "// " + new Array(bannerWidth - 6 + 1).join(' ') + " //\n";
    var padding = new Array(bannerWidth + 1).join(' ');
    var blankLine = new Array(width + 1).join(' ') + " //\n";
    header += divider + spacer;
    header += "// " +
      (self.servePath.slice(1) + padding).slice(0, bannerWidth - 6) + " //\n";
    if (self.bare) {
      var bareText = "This file is in bare mode and is not in its own closure.";
      header += "// " +
        (bareText + padding).slice(0, bannerWidth - 6) + " //\n";
    }
    header += spacer + divider + blankLine;
    chunks.push(header);

    var transformedSourceWithMap = self.linkerFileTransform(
      self.source, options.exports, self.sourceMap);
    self.source = transformedSourceWithMap.source;

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

        if (line.length <= width) {
          suffix = padding.slice(line.length, width) + " // " + num + "\n";
        }
        f(line, suffix, num);
        num++;
      });
    };

    var lines = self.source.split('\n');

    if (transformedSourceWithMap.sourceMap) {
      var buf = "";
      numberifyLines(function (line, suffix) {
        buf += line;
        buf += suffix;
      });
      // The existing source map is valid because all we're doing is adding
      // things to the end of lines, which doesn't affect the source map.
      chunks.push(sourcemap.SourceNode.fromStringWithSourceMap(
        self.source,
        new sourcemap.SourceMapConsumer(transformedSourceWithMap.sourceMap)));
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
      chunks.push(divider + "\n}).call(this);\n");

    var node = new sourcemap.SourceNode(null, null, null, chunks);

    return node;
  },

  // If "line" contains nothing but a comment (of either syntax), return the
  // body of the comment with leading and trailing spaces trimmed (possibly the
  // empty string). Otherwise return null. (We need to support both comment
  // syntaxes because the CoffeeScript compiler only emits /**/ comments.)
  _getSingleLineCommentBody: function (line) {
    var self = this;
    var match = /^\s*\/\/(.+)$/.exec(line);
    if (match) {
      return match[1].trim();
    }
    match = /^\s*\/\*(.+)\*\/\s*$/.exec(line);
    // Make sure we don't get tricked by lines like
    //     /* Comment */  var myRegexp = /x*/
    if (match && match[1].indexOf('*/') === -1)
      return match[1].trim();
    return null;
  },

  // Scan for @export, etc.
  _scanForComments: function () {
    var self = this;
    var lines = self.source.split("\n");

    _.each(lines, function (line) {
      var commentBody = self._getSingleLineCommentBody(line);
      if (!commentBody)
        return;

      // XXX overly permissive. should detect errors
      var match = /^@(export|require|provide|weak)(\s+.*)$/.exec(commentBody);
      if (match) {
        var what = match[1];
        var symbols = _.map(match[2].split(/,/), function (s) {
          return s.trim();
        });

        var badSymbols = _.reject(symbols, function (s) {
          // XXX should be unicode-friendlier
          return s.match(/^([_$a-zA-Z][_$a-zA-Z0-9]*)(\.[_$a-zA-Z][_$a-zA-Z0-9]*)*$/);
        });
        if (!_.isEmpty(badSymbols)) {
          buildmessage.error("bad symbols for @" + what + ": " +
                             JSON.stringify(badSymbols),
                             { file: self.sourcePath });
          // recover by ignoring
        } else if (self.module.noExports && what === "export") {
          buildmessage.error("@export not allowed in this slice",
                             { file: self.sourcePath });
          // recover by ignoring
        } else {
          _.each(symbols, function (s) {
            if (s.length)
              self[what + "s"][s] = true;
          });
        }
      }
    });
  }
});

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
//  - includePositionInErrors: true to include line and column
//    information in errors. set to false if, eg, this is the output
//    of coffeescript. (XXX replace with real sourcemaps)
//  - linkerFileTransform: if given, this function will be called
//    when the module is being linked with the source of the file
//    and an array of the exports of the module; the file's source will
//    be replaced by what the function returns.
//
// forceExport: an array of symbols (as dotted strings) to force the
// module to export, even if it wouldn't otherwise
//
// useGlobalNamespace: make the top level namespace be the same as the
// global namespace, so that symbols are accessible from the
// console. typically used when linking apps (as opposed to packages.)
//
// combinedServePath: if we end up combining all of the files into
// one, use this as the servePath.
//
// importStubServePath: if useGlobalNamespace is true, then to
// preserve line numbers, we may want to emit an additional file
// containing import setup code for the global environment. this is
// the servePath to use for it.
//
// noExports: if true, the module does not export anything (even an empty
// Package.foo object). eg, for test slices.
//
// jsAnalyze: if possible, the JSAnalyze object from the js-analyze
// package. (This is not possible if we are currently linking the main slice of
// the js-analyze package!)
//
// Output is an object with keys:
// - files: is an array of output files in the same format as inputFiles
//   - EXCEPT THAT, for now, sourcePath is omitted and is replaced with
//     sourceMap (a string) and sources (map to keys 'package',
//     'sourcePath', 'path') similar to self.resources in a Slice (XXX)
// - exports: the exports, as a list of string ('Foo', 'Thing.Stuff', etc)
var prelink = function (options) {
  if (options.noExports && options.forceExport &&
      ! _.isEmpty(options.forceExport)) {
    throw new Error("Can't force exports if there are no exports!");
  };

  var module = new Module({
    name: options.name,
    forceExport: options.forceExport,
    useGlobalNamespace: options.useGlobalNamespace,
    importStubServePath: options.importStubServePath,
    combinedServePath: options.combinedServePath,
    noExports: !!options.noExports,
    jsAnalyze: options.jsAnalyze
  });

  _.each(options.inputFiles, function (inputFile) {
    module.addFile(inputFile);
  });

  var files = module.getPrelinkedFiles();
  var exports = module.getExports();
  var packageScopeVariables = module.computeModuleScopeVars();

  return {
    files: files,
    exports: exports,
    packageScopeVariables: packageScopeVariables
  };
};


// Finish the linking.
//
// options include:
//
// imports: symbols to import. map from symbol name (something like
// 'Foo', "Foo.bar", etc) to the module from which it should be
// imported (which must load before us at runtime)
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
    packageScopeVariables: options.packageScopeVariables});
  var footer = getFooter({
    exports: options.exports,
    name: options.name
  });

  var ret = [];
  _.each(options.prelinkFiles, function (file) {
    if (file.sourceMap) {
      var node = new sourcemap.SourceNode(null, null, null, [
        header,
        sourcemap.SourceNode.fromStringWithSourceMap(
          file.source, new sourcemap.SourceMapConsumer(file.sourceMap)),
        footer
      ]);
      var results = node.toStringWithSourceMap({
        file: file.servePath
      });
      ret.push({
        source: results.code,
        servePath: file.servePath,
        sourceMap: results.map.toString(),
        sources: file.sources
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
  chunks.push(getImportCode(options.imports, "/* Imports */\n"));
  if (options.packageScopeVariables
      && !_.isEmpty(options.packageScopeVariables)) {
    chunks.push("/* Package-scope variables */\n");
    chunks.push("var " + options.packageScopeVariables.join(', ') + ";\n\n");
  }
  return chunks.join('');
};

var getImportCode = function (imports, header, omitvar) {
  var self = this;

  if (_.isEmpty(imports))
    return "";

  var scratch = {};
  _.each(imports, function (name, symbol) {
    scratch[symbol] = packageDot(name) + "." + symbol;
  });
  var tree = buildSymbolTree(scratch);

  var buf = header;
  _.each(tree, function (node, key) {
    buf += (omitvar ? "" : "var " ) +
      key + " = " + writeSymbolTree(node) + ";\n";
  });

  // XXX need to remove newlines, whitespace, in line number preserving mode
  buf += "\n";
  return buf;
};

var getFooter = function (options) {
  var chunks = [];

  if (options.name && options.exports && !_.isEmpty(options.exports)) {
    chunks.push("/* Exports */\n");
    chunks.push("if (typeof Package === 'undefined') Package = {};\n");
    chunks.push(packageDot(options.name), " = ");

    // Even if there are no exports, we need to define Package.foo, because the
    // existence of Package.foo is how another package (eg, one that weakly
    // depends on foo) can tell if foo is loaded.
    if (_.isEmpty(options.exports)) {
      chunks.push("{};\n");
    } else {
      // Given exports like Foo, Bar.Baz, Bar.Quux.A, and Bar.Quux.B,
      // construct an expression like
      // {Foo: Foo, Bar: {Baz: Bar.Baz, Quux: {A: Bar.Quux.A, B: Bar.Quux.B}}}
      var scratch = {};
      _.each(options.exports, function (symbol) {
        scratch[symbol] = symbol;
      });
      var exportTree = buildSymbolTree(scratch);
      chunks.push(writeSymbolTree(exportTree, 0));
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
