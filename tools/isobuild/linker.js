var _ = require('underscore');
var sourcemap = require('source-map');
var buildmessage = require('../utils/buildmessage.js');
var watch = require('../fs/watch.js');
var Profile = require('../tool-env/profile.js').Profile;
import assert from 'assert';
import LRU from 'lru-cache';
import {sourceMapLength} from '../utils/utils.js';
import files from '../fs/files.js';
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
  self.meteorInstallOptions = options.meteorInstallOptions;
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
    if (self.useGlobalNamespace &&
        ! self.meteorInstallOptions) {
      // Ignore lazy files unless we have a module system.
      const eagerFiles = _.filter(self.files, file => ! file.lazy);

      return _.map(eagerFiles, function (file) {
        const cacheKey = JSON.stringify([
          file.sourceHash, file.bare, file.servePath]);

        if (APP_PRELINK_CACHE.has(cacheKey)) {
          return APP_PRELINK_CACHE.get(cacheKey);
        }

        const node = file.getPrelinkedOutput({ preserveLineNumbers: true });
        const results = Profile.time(
          "toStringWithSourceMap (app)", () => {
            return node.toStringWithSourceMap({
              file: file.servePath
            }); // results has 'code' and 'map' attributes
          }
        );

        let sourceMap = results.map.toJSON();
        if (! sourceMap.mappings) {
          sourceMap = null;
        }

        const prelinked = {
          source: results.code,
          sourcePath: file.sourcePath,
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

    const result = {
      // This object will be populated with .source, .servePath,
      // .sourceMap, and (optionally) .exportsName properties before being
      // returned from this method in a singleton array.
      servePath: self.combinedServePath,
    };

    // An array of strings and SourceNode objects.
    let chunks = [];
    let fileCount = 0;

    // Emit each file
    if (self.meteorInstallOptions) {
      const tree = self._buildModuleTree();
      fileCount = self._chunkifyModuleTree(tree, chunks, sourceWidth);
      result.exportsName =
        self._chunkifyEagerRequires(chunks, fileCount, sourceWidth);

    } else {
      _.each(self.files, function (file) {
        if (file.lazy) {
          // Ignore lazy files unless we have a module system.
          return;
        }

        if (!_.isEmpty(chunks)) {
          chunks.push("\n\n\n\n\n\n");
        }

        chunks.push(file.getPrelinkedOutput({
          sourceWidth: sourceWidth,
          noLineNumbers: self.noLineNumbers
        }));

        ++fileCount;
      });
    }

    var node = new sourcemap.SourceNode(null, null, null, chunks);

    Profile.time(
      'getPrelinkedFiles toStringWithSourceMap',
      function () {
        if (fileCount > 0) {
          var swsm = node.toStringWithSourceMap({
            file: self.combinedServePath
          });
          result.source = swsm.code;
          result.sourceMap = swsm.map.toJSON();
          if (! result.sourceMap.mappings) {
            result.sourceMap = null;
          }
        } else {
          // If there were no files in this bundle, we do not need to
          // generate a source map.
          result.source = node.toString();
          result.sourceMap = null;
        }
      }
    );

    return [result];
  }),

  // Builds a tree of nested objects where the properties are names of
  // files or directories, and the values are either nested objects
  // (representing directories) or File objects (representing modules).
  // Bare files and lazy files that are never imported are ignored.
  _buildModuleTree() {
    assert.ok(this.meteorInstallOptions);

    const tree = {};

    _.each(this.files, function (file) {
      if (file.bare) {
        // Bare files will be added in between the synchronous require
        // calls in _chunkifyEagerRequires.
        return;
      }

      if (file.lazy && ! file.imported) {
        // If the file is not eagerly evaluated, and no other files
        // import or require it, then it need not be included in the
        // bundle.
        return;
      }

      const parts = file.installPath.split("/");
      let t = tree;
      _.each(parts, function (part, i) {
        const isLastPart = i === parts.length - 1;
        t = _.has(t, part)
          ? t[part]
          : t[part] = isLastPart ? file : {};
      });
    });

    return tree;
  },

  // Takes the tree generated by _buildModuleTree and populates the chunks
  // array with strings and SourceNode objects that can be combined into a
  // single SourceNode object. Returns the count of modules in the tree.
  _chunkifyModuleTree(tree, chunks, sourceWidth) {
    const self = this;

    assert.ok(self.meteorInstallOptions);
    assert.ok(_.isArray(chunks));
    assert.ok(_.isNumber(sourceWidth));

    let moduleCount = 0;

    function walk(t) {
      if (t instanceof File) {
        ++moduleCount;
        chunks.push(t.getPrelinkedOutput({
          sourceWidth,
          noLineNumbers: self.noLineNumbers
        }));
      } else if (_.isObject(t)) {
        chunks.push("{");
        const keys = _.keys(t);
        _.each(keys, (key, i) => {
          chunks.push(JSON.stringify(key), ":");
          walk(t[key]);
          if (i < keys.length - 1) {
            chunks.push(",");
          }
        });
        chunks.push("}");
      }
    }

    const chunksLengthBeforeWalk = chunks.length;

    // The tree of nested directories and module functions built above
    // allows us to call meteorInstall just once to install everything.
    chunks.push("var require = meteorInstall(");
    walk(tree);
    chunks.push(",", JSON.stringify(self.meteorInstallOptions), ");");

    if (moduleCount === 0) {
      // If no files were actually added to the chunks array, roll back
      // to before the `var require = meteorInstall(` chunk.
      chunks.length = chunksLengthBeforeWalk;
    }

    return moduleCount;
  },

  // Adds require calls to the chunks array for all modules that should be
  // eagerly evaluated, and also includes bare files in the appropriate
  // order with respect to the require calls. Returns the name of the
  // variable that holds the main exports object, if api.mainModule was
  // used to define a main module.
  _chunkifyEagerRequires(chunks, moduleCount, sourceWidth) {
    assert.ok(_.isArray(chunks));
    assert.ok(_.isNumber(moduleCount));
    assert.ok(_.isNumber(sourceWidth));

    let exportsName;

    // Now that we have installed everything in this package or
    // application, immediately require the non-lazy modules and
    // evaluate the bare files.
    _.each(this.files, file => {
      if (file.bare) {
        chunks.push("\n", file.getPrelinkedOutput({
          sourceWidth,
          noLineNumbers: this.noLineNumbers
        }));
      } else if (moduleCount > 0 && ! file.lazy) {
        if (file.mainModule) {
          exportsName = "exports";
        }

        chunks.push(
          file.mainModule ? "\nvar " + exportsName + " = " : "\n",
          "require(",
          JSON.stringify("./" + file.installPath),
          ");"
        );
      }
    });

    return exportsName;
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

  // The path of the source file, relative to the root directory of the
  // package or application.
  self.sourcePath = inputFile.sourcePath;

  // Absolute module identifier to use when installing this file via
  // meteorInstall. If the inputFile has no .installPath, then this file
  // cannot be installed as a module.
  self.installPath = inputFile.installPath || null;

  // the path where this file would prefer to be served if possible
  self.servePath = inputFile.servePath;

  // Module identifiers imported or required by this module, if any.
  if (Array.isArray(inputFile.deps)) {
    self.deps = inputFile.deps;
  } else if (inputFile.deps && typeof inputFile.deps === "object") {
    self.deps = Object.keys(inputFile.deps);
  } else {
    self.deps = [];
  }

  // True if the input file should not be evaluated eagerly.
  self.lazy = inputFile.lazy; // could be `true`, `false` or `undefined` <sigh>

  // True if the file is an eagerly evaluated entry point, or if some
  // other file imports or requires it.
  self.imported = !!inputFile.imported;

  // Boolean indicating whether this file is the main entry point module
  // for its package.
  self.mainModule = !!inputFile.mainModule;

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
      return ASSIGNED_GLOBALS_CACHE[self.sourceHash] =
        _.keys(findAssignedGlobals(self.source, self.sourceHash));
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

  _useMeteorInstall() {
    return this.module.meteorInstallOptions;
  },

  _getClosureHeader() {
    if (this._useMeteorInstall()) {
      var header = "";

      if (this.deps.length > 0) {
        header += "[";
        _.each(this.deps, dep => {
          header += JSON.stringify(dep) + ",";
        });
      }

      const headerParts = [
        header,
        "function("
      ];

      if (this.source.match(/\b__dirname\b/)) {
        headerParts.push("require,exports,module,__filename,__dirname");
      } else if (this.source.match(/\b__filename\b/)) {
        headerParts.push("require,exports,module,__filename");
      } else if (this.source.match(/\bmodule\b/)) {
        headerParts.push("require,exports,module");
      } else if (this.source.match(/\bexports\b/)) {
        headerParts.push("require,exports");
      } else if (this.source.match(/\brequire\b/)) {
        headerParts.push("require");
      }

      headerParts.push("){");

      return headerParts.join("");
    }

    return "(function(){";
  },

  _getClosureFooter() {
    if (this._useMeteorInstall()) {
      var footer = "}";
      if (this.deps.length > 0) {
        footer += "]";
      }
      return footer;
    }
    return "}).call(this);\n";
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
  getPrelinkedOutput: Profile("linker File#getPrelinkedOutput", function (options) {
    var self = this;
    var width = options.sourceWidth || 70;
    var bannerWidth = width + 3;
    var noLineNumbers = options.noLineNumbers;
    var preserveLineNumbers = options.preserveLineNumbers;
    var result;

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

    let consumer;
    let lines;

    if (self.sourceMap) {
      result = {
        code: self.source,
        map: self.sourceMap
      };

      consumer = new sourcemap.SourceMapConsumer(result.map);

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
      // generate one, but it doesn't have to be very detailed, since we
      // we can use a dumb implementation of originalPositionFor.
      const smg = new sourcemap.SourceMapGenerator({
        file: self.servePath
      });

      lines = self.source.split(/\r?\n/);

      function addIdentityMapping(pos) {
        smg.addMapping({
          original: pos,
          generated: pos,
          source: self.servePath,
        });
      }

      for (var line = 1; line <= lines.length; ++line) {
        addIdentityMapping({ line, column: 0 });
      }

      smg.setSourceContent(self.servePath, self.source);

      result = {
        code: self.source,
        map: smg.toJSON(),
      };

      // Generating line number comments for really big files is not
      // really worth it when there's no meaningful self.sourceMap.
      if (self.source.length < 500000) {
        consumer = {
          originalPositionFor(pos) {
            return pos;
          }
        };
      }
    }

    if (consumer && ! noLineNumbers) {
      var padding = bannerPadding(bannerWidth);

      // We might have already done this split above.
      lines = lines || result.code.split(/\r?\n/);

      // Use the SourceMapConsumer object to compute the original line
      // number for each line of result.code.
      for (var i = 0, lineCount = lines.length; i < lineCount; ++i) {
        var line = lines[i];
        var len = line.length;
        if (len < width &&
            line[len - 1] !== "\\") {
          var pos = consumer.originalPositionFor({
            line: i + 1,
            column: 0
          });

          if (pos) {
            line += padding.slice(len, width) + " //";
            // Not all source maps define a mapping for every line in the
            // output. This is perfectly normal.
            if (typeof pos.line === "number") {
              line += " " + pos.line;
            }
            lines[i] = line;
          }
        }
      }

      result.code = lines.join("\n");
    }

    var chunks = [];
    var pathNoSlash = self.servePath.replace(/^\//, "");

    if (! self.bare) {
      var closureHeader = self._getClosureHeader();
      chunks.push(
        closureHeader,
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
      // If we have a source map for result.code, push a SourceNode onto
      // the chunks array that encapsulates that source map. If we don't
      // have a source map, just push result.code.

      let chunk = result.code;

      if (consumer instanceof sourcemap.SourceMapConsumer) {
        chunk = sourcemap.SourceNode.fromStringWithSourceMap(
          result.code, consumer);

      } else if (consumer && result.map) {
        chunk = sourcemap.SourceNode.fromStringWithSourceMap(
          result.code,
          new sourcemap.SourceMapConsumer(result.map),
        );
      }

      chunks.push(chunk);

      // It's important for the code to end with a newline, so that a
      // trailing // comment can't snarf code appended after it.
      if (result.code[result.code - 1] !== "\n") {
        chunks.push("\n");
      }
    }

    // Footer
    if (self.bare) {
      if (! preserveLineNumbers) {
        chunks.push(dividerLine(bannerWidth), "\n");
      }
    } else {
      const closureFooter = self._getClosureFooter();
      if (preserveLineNumbers) {
        chunks.push(closureFooter);
      } else {
        chunks.push(
          dividerLine(bannerWidth),
          "\n",
          closureFooter
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
export var prelink = Profile("linker.prelink", function (options) {
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

  chunks.push(
    "(function () {\n\n",
    getImportCode(options.imports, "/* Imports */\n", false),
  );

  const packageVariables = _.filter(
    options.packageVariables,
    name => ! _.has(options.imports, name),
  );

  if (!_.isEmpty(packageVariables)) {
    chunks.push(
      "/* Package-scope variables */\n",
      "var ",
      packageVariables.join(', '),
      ";\n\n",
    );
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

var getFooter = function ({
  name,
  exported,
  exportsName,
}) {
  var chunks = [];

  if (name && exported) {
    chunks.push("\n\n/* Exports */\n");
    chunks.push("if (typeof Package === 'undefined') Package = {};\n");
    const pkgInit = packageDot(name) + " = " + (exportsName || "{}");
    if (_.isEmpty(exported)) {
      // Even if there are no exports, we need to define Package.foo,
      // because the existence of Package.foo is how another package
      // (e.g., one that weakly depends on foo) can tell if foo is loaded.
      chunks.push(pkgInit, ";\n");
    } else {
      const scratch = {};
      _.each(exported, symbol => scratch[symbol] = symbol);
      const symbolTree = writeSymbolTree(buildSymbolTree(scratch));
      chunks.push("(function (pkg, symbols) {\n",
                  "  for (var s in symbols)\n",
                  "    (s in pkg) || (pkg[s] = symbols[s]);\n",
                  "})(", pkgInit, ", ", symbolTree, ");\n");
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
// Output is an array of output files: objects with keys source, servePath,
// sourceMap.
export var fullLink = Profile("linker.fullLink", function (inputFiles, {
  // If true, make the top level namespace be the same as the global
  // namespace, so that symbols are accessible from the console, and don't
  // actually combine files into a single file. used when linking apps (as
  // opposed to packages).
  useGlobalNamespace,
  // Options to pass as the second argument to meteorInstall. Falsy if
  // meteorInstall is disabled.
  meteorInstallOptions,
  // If we end up combining all of the files into one, use this as the
  // servePath.
  combinedServePath,
  // The name of this module (for stashing exports to be later read by the
  // imports of other modules); null if the module has no name (in that
  // case exports will not work properly)
  name,
  // An array of symbols that the module exports. Symbols are
  // {name,testOnly} pairs.
  declaredExports,
  // a map from imported symbol to the name of the package that it is
  // imported from
  imports,
  // If useGlobalNamespace is set, this is the name of the file to create
  // with imports into the global namespace.
  importStubServePath,
  // True if JS files with source maps should have a comment explaining
  // how to use them in a browser.
  includeSourceMapInstructions,
  noLineNumbers,
}) {
  buildmessage.assertInJob();

  var module = new Module({
    name,
    meteorInstallOptions,
    useGlobalNamespace,
    combinedServePath,
    noLineNumbers
  });

  _.each(inputFiles, file => module.addFile(file));

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

  let exportsName;
  _.each(prelinkedFiles, file => {
    if (file.exportsName) {
      exportsName = file.exportsName;
    }
  });

  var footer = getFooter({
    exported: declaredExports,
    exportsName,
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
        sourcePath: file.sourcePath,
        servePath: file.servePath,
        sourceMap: sourceMap
      };
    } else {
      return {
        source: header + file.source + footer,
        sourcePath: file.sourcePath,
        servePath: file.servePath
      };
    }
  });
});
