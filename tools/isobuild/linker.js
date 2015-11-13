var _ = require('underscore');
var sourcemap = require('source-map');
var buildmessage = require('../utils/buildmessage.js');
var watch = require('../fs/watch.js');
var Profile = require('../tool-env/profile.js').Profile;
import LRU from 'lru-cache';
import {sourceMapLength} from '../utils/utils.js';
import {findAssignedGlobals} from './js-analyze.js';

// A rather small cache size, assuming only one module is being linked
// most of the time.
const CACHE_SIZE = process.env.METEOR_APP_PRELINK_CACHE_SIZE || 1024*1024*20;

// Cache individual files prelinked
const APP_PRELINK_CACHE = new LRU({
  max: CACHE_SIZE,
  length: function (prelinked) {
    return prelinked.source.length + sourceMapLength(prelinked.sourceMap);
  }
});

var packageDot = function (name) {
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.exec(name)) {
    return "Package." + name;
  } else {
    return "Package['" + name + "']";
  }
};

///////////////////////////////////////////////////////////////////////////////
// Module
///////////////////////////////////////////////////////////////////////////////

// options include name, imports, exports, useGlobalNamespace,
// combinedServePath, all of which have the same meaning as they do when passed
// to import().
var Module = function (options) {
  var self = this;

  // module name or null
  self.name = options.name || null;

  // files in the module. array of File
  self.files = [];

  // options
  self.useGlobalNamespace = options.useGlobalNamespace;
  self.combinedServePath = options.combinedServePath;
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
        if (line.length <= ignoreOver && line.length > m) {
          m = line.length;
        }
      });
      maxInFile.push(m);
    });

    return _.max(maxInFile);
  },

  // Figure out which vars need to be specifically put in the module
  // scope.
  computeAssignedVariables: Profile("linker Module#computeAssignedVariables", function () {
    var self = this;

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

    return assignedVariables;
  }),

  // Output is a list of objects with keys 'source', 'servePath', 'sourceMap',
  // 'sourcePath'
  getPrelinkedFiles: Profile("linker Module#getPrelinkedFiles", function () {
    var self = this;

    // If we don't want to create a separate scope for this module,
    // then our job is much simpler. And we can get away with
    // preserving the line numbers.
    if (self.useGlobalNamespace) {
      return _.map(self.files, function (file) {
        const cacheKey = JSON.stringify([
          file.sourceHash, file.bare, file.servePath]);

        if (APP_PRELINK_CACHE.has(cacheKey)) {
          return APP_PRELINK_CACHE.get(cacheKey);
        }

        const node = file.getPrelinkedOutput({ preserveLineNumbers: true });
        const results = Profile.time(
          "getPrelinkedFiles toStringWithSourceMap (app)", () => {
            return node.toStringWithSourceMap({
              file: file.servePath
            }); // results has 'code' and 'map' attributes
          }
        );
        const sourceMap = results.map.toJSON();

        const prelinked = {
          source: results.code,
          servePath: file.servePath,
          sourceMap: sourceMap
        };

        APP_PRELINK_CACHE.set(cacheKey, prelinked);
        return prelinked;
      });
    }

    // Otherwise..

    // Find the maximum line length.
    var sourceWidth = _.max([68, self.maxLineLength(120 - 2)]);

    // Prologue
    var chunks = [];

    // Emit each file
    _.each(self.files, function (file) {
      if (!_.isEmpty(chunks)) {
        chunks.push("\n\n\n\n\n\n");
      }
      chunks.push(file.getPrelinkedOutput({
        sourceWidth: sourceWidth,
        noLineNumbers: self.noLineNumbers
      }));
    });

    var node = new sourcemap.SourceNode(null, null, null, chunks);

    var results = Profile.time(
      'getPrelinkedFiles toStringWithSourceMap (packages)',
      function () {
        return node.toStringWithSourceMap({
          file: self.combinedServePath
        }); // results has 'code' and 'map' attributes
      }
    );
    return [{
      source: results.code,
      servePath: self.combinedServePath,
      sourceMap: results.map.toJSON()
    }];
  })
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
      if (! (part in walk)) {
        walk[part] = {};
      }
      walk = walk[part];
    });

    if (value) {
      walk[lastPart] = value;
    }
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
  self.source = inputFile.data.toString('utf8');

  // hash of source (precalculated for *.js files, calculated here for files
  // produced by plugins)
  self.sourceHash = inputFile.hash || watch.sha1(self.source);

  // the path where this file would prefer to be served if possible
  self.servePath = inputFile.servePath;

  // If true, don't wrap this individual file in a closure.
  self.bare = !!inputFile.bare;

  // A source map (generated by something like CoffeeScript) for the input file.
  // Is an Object, not a string.
  self.sourceMap = inputFile.sourceMap;

  // The Module containing this file.
  self.module = module;
};

// findAssignedGlobals is somewhat slow, and we often compute assigned variables
// on the same file multiple times in one process (notably, a single file is
// often processed for two or three different unibuilds, and is processed again
// when rebuilding a package when another file has changed). We cache the
// calculated variables under the source file's hash (calculating the source
// file's hash is faster than running findAssignedGlobals, and in the case of
// *.js files we have the hash already anyway).
var ASSIGNED_GLOBALS_CACHE = {};

_.extend(File.prototype, {
  // Return the globals in this file as an array of symbol names.  For
  // example: if the code references 'Foo.bar.baz' and 'Quux', and
  // neither are declared in a scope enclosing the point where they're
  // referenced, then globalReferences would include ["Foo", "Quux"].
  computeAssignedVariables: Profile("linker File#computeAssignedVariables", function () {
    var self = this;

    if (_.has(ASSIGNED_GLOBALS_CACHE, self.sourceHash)) {
      return ASSIGNED_GLOBALS_CACHE[self.sourceHash];
    }

    try {
      return (ASSIGNED_GLOBALS_CACHE[self.sourceHash] =
              _.keys(findAssignedGlobals(self.source)));
    } catch (e) {
      if (!e.$ParseError) {
        throw e;
      }

      var errorOptions = {
        file: self.servePath,
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

      buildmessage.error(e.message, errorOptions);

      // Recover by pretending that this file is empty (which
      // includes replacing its source code with '' in the output)
      self.source = "";
      self.sourceHash = watch.sha1(self.source);
      self.sourceMap = null;
      return [];
    }
  }),

  // Options:
  // - preserveLineNumbers: if true, decorate minimally so that line
  //   numbers don't change between input and output. In this case,
  //   sourceWidth is ignored.
  // - noLineNumbers: We still include the banners and such, but
  //   no line number suffix.
  // - sourceWidth: width in columns to use for the source code
  //
  // Returns a SourceNode.
  getPrelinkedOutput: Profile("linker File#getPrelinkedOutput", function (options) {
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
      var closureHeader = "(function(){";
      chunks.push(
        closureHeader,
        preserveLineNumbers ? "" : "\n\n"
      );

      if (! smc) {
        // No sourcemap? Generate a new one that takes into account the fact
        // that we added a closure
        var map = new sourcemap.SourceMapGenerator({ file: self.servePath });
        _.each(result.code.split('\n'), function (line, i) {
          map.addMapping({
            source: self.servePath,
            original: { line: i + 1, column: 0 },
            generated: { line: i + 1, column: i === 0 ? closureHeader.length + 1 : 0 }
          });
        });
        map.setSourceContent(self.servePath, result.code);
        smc = new sourcemap.SourceMapConsumer(map.toJSON());
      }
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
  })
});

// Given a list of lines (not newline-terminated), returns a string placing them
// in a pretty banner of width bannerWidth. All lines must have length at most
// (bannerWidth - 6); if bannerWidth is not provided, the smallest width that
// fits is used.
var banner = function (lines, bannerWidth) {
  if (!bannerWidth) {
    bannerWidth = 6 + _.max(lines, function (x) { return x.length; }).length;
  }

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
// Top-level entry points
///////////////////////////////////////////////////////////////////////////////

// Prior to the "batch-plugins" project, linker.prelink was the first phase of
// linking. It got performed at package compile time, to be followed up with a
// function that used to exist called linker.link at app bundle time. We now do
// far less processing at package compile time and simply run linker.fullLink at
// app bundle time, which is effectively the old prelink+link combined. However,
// we keep linker.prelink around now in order to allow new published packages
// that don't use the new build plugin APIs to be used by older Isobuilds.
// It only gets called on packages, not on apps.
//
// This does about half of the of the linking process. It does not require
// knowledge of your imports. It returns the module's exports, plus a set of
// partially linked files which you must pass to link() along with your import
// list to get your final linked files.
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
//  - sourceMap: an optional source map (as string) for the input file
//
// combinedServePath: if we end up combining all of the files into
// one, use this as the servePath.
//
// Output is an object with keys:
// - files: is an array of output files in the same format as inputFiles
//   - EXCEPT THAT, for now, sourcePath is omitted and is replaced with
//     sourceMap (a string) (XXX)
// - assignedPackageVariables: an array of variables assigned to without
//   being declared
var prelink = Profile("linker.prelink", function (options) {
  var module = new Module({
    name: options.name,
    combinedServePath: options.combinedServePath,
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
});

var SOURCE_MAP_INSTRUCTIONS_COMMENT = banner([
  "This is a generated file. You can view the original",
  "source in your browser if your browser supports source maps.",
  "Source maps are supported by all recent versions of Chrome, Safari, ",
  "and Firefox, and by Internet Explorer 11."
]);

var getHeader = function (options) {
  var chunks = [];
  chunks.push("(function () {\n\n" );
  chunks.push(getImportCode(options.imports, "/* Imports */\n", false));
  if (!_.isEmpty(options.packageVariables)) {
    chunks.push("/* Package-scope variables */\n");
    chunks.push("var " + options.packageVariables.join(', ') +
                ";\n\n");
  }
  return chunks.join('');
};

var getImportCode = function (imports, header, omitvar) {
  var self = this;

  if (_.isEmpty(imports)) {
    return "";
  }

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

// This is the real entry point that's still used to produce Meteor apps.  It
// takes in information about the files in the package including imports and
// exports, and returns an array of linked source files.
//
// inputFiles: an array of objects representing input files.
//  - source: the source code
//  - hash: the hash of the source code (optional, will be calculated
//    if not given)
//  - servePath: the path where it would prefer to be served if
//    possible. still allowed on non-browser targets, where it
//    represent as hint as to what the file should be named on disk in
//    the bundle (this will only be seen by someone looking at the
//    bundle, not in error messages, but it's still nice to make it
//    look good)
//  - bare: if true, don't wrap this file in a closure
//  - sourceMap: an optional source map (as object) for the input file
//
// useGlobalNamespace: make the top level namespace be the same as the global
// namespace, so that symbols are accessible from the console, and don't
// actually combine files into a single file. used when linking apps (as opposed
// to packages).
//
// combinedServePath: if we end up combining all of the files into
// one, use this as the servePath.
//
// name: the name of this module (for stashing exports to be later
// read by the imports of other modules); null if the module has no
// name (in that case exports will not work properly)
//
// declaredExports: an array of symbols that the module exports. Symbols are
// {name,testOnly} pairs.
//
// imports: a map from imported symbol to the name of the package that it is
// imported from
//
// importStubServePath: if useGlobalNamespace is set, this is the name of the
// file to create with imports into the global namespace
//
// includeSourceMapInstructions: true if JS files with source maps should
// have a comment explaining how to use them in a browser.
//
// Output is an array of output files: objects with keys source, servePath,
// sourceMap.
var fullLink = Profile("linker.fullLink", function (inputFiles, {
    useGlobalNamespace, combinedServePath, name, declaredExports, imports,
    importStubServePath, includeSourceMapInstructions
  }) {
  buildmessage.assertInJob();

  var module = new Module({
    name, useGlobalNamespace, combinedServePath,
    noLineNumbers: false
  });

  _.each(inputFiles, function (inputFile) {
    module.addFile(inputFile);
  });

  var prelinkedFiles = module.getPrelinkedFiles();

  // If we're in the app, then we just add the import code as its own file in
  // the front.
  if (useGlobalNamespace) {
    if (!_.isEmpty(imports)) {
      prelinkedFiles.unshift({
        source: getImportCode(imports,
                              "/* Imports for global scope */\n\n", true),
        servePath: importStubServePath
      });
    }
    return prelinkedFiles;
  }

  // Do static analysis to compute module-scoped variables. Error recovery from
  // the static analysis mutates the sources, so this has to be done before
  // concatenation.
  let assignedVariables;
  const failed = buildmessage.enterJob('computing assigned variables', () => {
    assignedVariables = module.computeAssignedVariables();
    return buildmessage.jobHasMessages();
  });
  if (failed) {
    // recover by pretending there are no files
    return [];
  }

  // Otherwise we're making a package and we have to actually combine the files
  // into a single scope.
  var header = getHeader({
    imports,
    packageVariables: _.union(assignedVariables, declaredExports)
  });

  var footer = getFooter({
    exported: declaredExports,
    name
  });

  return _.map(prelinkedFiles, function (file) {
    if (file.sourceMap) {
      if (includeSourceMapInstructions) {
        header = SOURCE_MAP_INSTRUCTIONS_COMMENT + "\n\n" + header;
      }

      // Bias the source map by the length of the header without
      // (fully) parsing and re-serializing it. (We used to do this
      // with the source-map library, but it was incredibly slow,
      // accounting for over half of bundling time.) It would be nice
      // if we could use "index maps" for this (the 'sections' key),
      // as that would let us avoid even JSON-parsing the source map,
      // but that doesn't seem to be supported by Firefox yet.
      if (header.charAt(header.length - 1) !== "\n") {
        // make sure it's a whole number of lines
        header += "\n";
      }
      var headerLines = header.split('\n').length - 1;
      var sourceMap = file.sourceMap;
      sourceMap.mappings = (new Array(headerLines + 1).join(';')) +
        sourceMap.mappings;
      return {
        source: header + file.source + footer,
        servePath: file.servePath,
        sourceMap: sourceMap
      };
    } else {
      return {
        source: header + file.source + footer,
        servePath: file.servePath
      };
    }
  });
});

var linker = module.exports = {
  prelink: prelink,
  fullLink: fullLink
};
