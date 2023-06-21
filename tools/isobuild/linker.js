import {debug} from "util";

var _ = require('underscore');
var sourcemap = require('source-map');
var buildmessage = require('../utils/buildmessage.js');
var watch = require('../fs/watch');
var Profile = require('../tool-env/profile').Profile;
import assert from 'assert';
import LRU from 'lru-cache';
import { sourceMapLength } from '../utils/utils.js';
import files from '../fs/files';
import { findAssignedGlobals } from './js-analyze.js';
import { convert as convertColons } from '../utils/colon-converter.js';
import * as oldLinker from './old-linker';
import SourceMap from '@parcel/source-map';

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
// Caches code with source map for dynamic files
const DYNAMIC_PRELINKED_OUTPUT_CACHE = new LRU({
  max: Math.pow(2, 11)
});

var packageDot = function (name) {
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.exec(name)) {
    return "Package." + name;
  } else {
    return "Package['" + name + "']";
  }
};

const enableClientTLA = process.env.METEOR_ENABLE_CLIENT_TOP_LEVEL_AWAIT === 'true';
const USE_OLD_LINKER = process.env.METEOR_LINKER !== 'new';

const MIN_BANNER_WIDTH = 80;

///////////////////////////////////////////////////////////////////////////////
// Module
///////////////////////////////////////////////////////////////////////////////

// TODO: this comment is out of date - we no longer have import()
// useGlobalNamespace has the same meaning as when passed
// to import().
var Module = function (files, useGlobalNamespace) {
  // files in the module. array of File
  this.files = files;

  this.useGlobalNamespace = useGlobalNamespace;
};

Object.assign(Module.prototype, {
  // Builds a tree of nested objects where the properties are names of
  // files or directories, and the values are either nested objects
  // (representing directories) or File objects (representing modules).
  // Bare files and lazy files that are never imported are ignored.
  _buildModuleTrees(dynamicFiles) {
    // Map from meteorInstallOptions objects to trees of File objects for
    // all non-dynamic modules.
    const trees = new Map();

    function getTree({ meteorInstallOptions }) {
      if (! trees.has(meteorInstallOptions)) {
        trees.set(meteorInstallOptions, {});
      }
      return trees.get(meteorInstallOptions);
    }

    for (const file of this.files) {
      if (file.bare) {
        // Bare files will be added after the module tree
        continue;
      }

      if (file.lazy && ! file.imported) {
        // If the file is not eagerly evaluated, and no other files
        // import or require it, then it need not be included in the
        // bundle.
  
        // We can easily allow unused files by filtering them out
        // but we will also want to make sure to exclude them when
        // computing assigned variables
        assert(false, 'unexpected unused file in linker');
        continue;
      }

      const tree = getTree(file);

      if (file.aliasId) {
        addToTree(file.aliasId, file.absModuleId, tree);
        continue;
      }

      if (file.isDynamic()) {
        const servePath = files.pathJoin("dynamic", file.absModuleId);
        const { source, sourceMap } =
            getOutputWithSourceMapCached(file, servePath);

        dynamicFiles.push({
          source,
          servePath,
          sourceMap,
          dynamic: true,
        });

        const stubArray = file.getNonDynamicDeps();

        if (file.absModuleId.endsWith("/package.json") &&
            file.jsonData) {
          const stub = {};

          function tryMain(name) {
            const value = file.jsonData[name];
            if (_.isString(value) ||
                _.isObject(value)) {
              stub[name] = value;
            }
          }

          tryMain("browser");
          tryMain("module");
          tryMain("main");

          stubArray.push(stub);
        }

        addToTree(stubArray, file.absModuleId, tree);

      } else {
        // If the file is not dynamic, then it should be included in the
        // initial bundle, so we add it to the static tree.
        addToTree(file, file.absModuleId, tree);
      }
    }

    return trees;
  },

  // Take the tree generated in getPrelinkedFiles and populate the chunks
  // array with strings and SourceNode objects that can be combined into a
  // single SourceNode object. Return the count of modules in the tree.
  _chunkifyModuleTrees(trees, combinedFile) {
    const self = this;

    assert.ok(combinedFile instanceof CombinedFile);

    let moduleCount = 0;

    function walk(t) {
      if (Array.isArray(t)) {
        ++moduleCount;
        combinedFile.addGeneratedCode(JSON.stringify(t, null, 2));
      } else if (typeof t === "string") {
        // This case can happen if a package.json file has an
        // object-valued "browser" field that aliases this module to a
        // different module identifier string. Note that the runtime
        // module system resolves string aliases relative to the original
        // module identifier, so it's probably a good idea to make sure
        // these identifiers are absolute (start with a '/') to avoid
        // ambiguity, since identifiers in package.json "browser" fields
        // are meant to be resolved relative to the package.json file.
        ++moduleCount;
        combinedFile.addGeneratedCode(JSON.stringify(t));
      } else if (t === false) {
        // This case can happen if a package.json file has an
        // object-valued "browser" field that maps this module to `false`,
        // indicating it should be replaced by an empty stub.
        ++moduleCount;
        combinedFile.addGeneratedCode("function(){}");
      } else if (t instanceof File) {
        ++moduleCount;

        const { header, code, map, footer } = t.getPrelinkedOutput();
        combinedFile.addGeneratedCode(header);
        combinedFile.addCodeWithMap(t.sourcePath, code, map);
        combinedFile.addGeneratedCode(footer);
      } else if (_.isObject(t)) {
        combinedFile.addGeneratedCode("{");
        const keys = Object.keys(t);
        for (const [i, key] of keys.entries()) {
          combinedFile.addGeneratedCode(JSON.stringify(key) + ":");
          walk(t[key]);
          if (i < keys.length - 1) {
            combinedFile.addGeneratedCode(",");
          }
        }
        combinedFile.addGeneratedCode("}");
      }
    }

    // const chunksLengthBeforeWalk = chunks.length;

    if (trees.size > 0) {
      combinedFile.addGeneratedCode("var require = ");
    }

    // Emit one meteorInstall call per distinct meteorInstallOptions
    // object, since the options apply to all modules installed by a given
    // call to meteorInstall.
    for (const [options, tree] of trees) {
      combinedFile.addGeneratedCode("meteorInstall(");
      walk(tree);
      combinedFile.addGeneratedCode("," + self._stringifyInstallOptions(options) + ");\n");
    }

    // TODO: fix this
    // if (moduleCount === 0) {
    //   // If no files were actually added to the chunks array, roll back
    //   // to before the `var require = meteorInstall(` chunk.
    //   chunks.length = chunksLengthBeforeWalk;
    // }

    return moduleCount;
  },

  _stringifyInstallOptions(options) {
    const optionsString = JSON.stringify(options, null, 2);

    if (this.useGlobalNamespace) {
      return optionsString;
    }

    if (! this.files.some(file => file.isDynamic())) {
      // If the package contains no files that can be imported
      // dynamically, then we don't need to provide an options.eval
      // function for evaluating dynamic modules.
      return optionsString;
    }

    assert.ok(optionsString.endsWith("\n}"));

    // If this package is not using the global namespace, pass an
    // options.eval method to meteorInstall, so that code added later can
    // have access to the same shared package variables as other code in
    // the package.
    return optionsString.slice(0, optionsString.length - 2) + [
      ",",
      "  eval: function () {",
      "    return eval(arguments[0]);",
      "  }",
      "}"
    ].join("\n");
  }
});

['computeAssignedVariables', '_buildModuleTrees', '_chunkifyModuleTrees'].forEach(method => {
  Module.prototype[method] =
    Profile(`linker Module#${method}`, Module.prototype[method]);
});

// Insert the given value into the tree by splitting the path and
// creating/following nested objects properties named by each component of
// the split path.
export function addToTree(value, path, tree) {
  const parts = path.split("/");
  const lastIndex = parts.length - 1;
  parts.forEach((part, i) => {
    if (part === "") {
      return;
    }

    tree = _.has(tree, part)
      ? tree[part]
      : tree[part] = i < lastIndex ? {} : value;
  });
}

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
    if (Object.keys(node).length === 0) {
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

export function File(inputFile, arch) {
  var self = this;

  // source code for this file (a string)
  // TODO: is there a reason inputFile stores the data as a buffer?
  self.source = inputFile.data.toString('utf8');

  // hash of source (precalculated for *.js files, calculated here for files
  // produced by plugins)
  self._inputHash = inputFile.hash || watch.sha1(self.source);

  // The path of the source file, relative to the root directory of the
  // package or application.
  self.sourcePath = inputFile.sourcePath;

  // Absolute module identifier to use when installing this file via
  // meteorInstall. If the inputFile has no .absModuleId, then this file
  // cannot be installed as a module.
  self.absModuleId = inputFile.absModuleId || null;

  // the path where this file would prefer to be served if possible
  self.servePath = inputFile.servePath;

  if (inputFile.alias) {
    self.aliasId = inputFile.alias.absModuleId;
  }

  self._allDeps = inputFile.deps;

  // True if the input file should not be evaluated eagerly.
  self.lazy = inputFile.lazy; // could be `true`, `false` or `undefined` <sigh>

  // False if the file is not imported at all, "static" if it is eagerly
  // imported, and "dynamic" if the file is dynamically imported.
  self.imported = inputFile.imported;

  // Boolean indicating whether this file is the main entry point module
  // for its package.
  self.mainModule = !!inputFile.mainModule;

  // If true, don't wrap this individual file in a closure.
  self.bare = !!inputFile.bare;

  // A source map (generated by something like CoffeeScript) for the input file.
  // Is an Object, not a string.
  self.sourceMap = inputFile.sourceMap;

  // If inputFile is a JSON file, its parsed data will be exposed via the
  // .jsonData property.
  self.jsonData = inputFile.jsonData || null;

  // The arch this file will run in
  self.bundleArch = arch;

  // Options to pass to meteorInstall when this file is installed.
  // Defined only when the modules package is in use by this module.
  self.meteorInstallOptions = inputFile.meteorInstallOptions;
};

Object.assign(File.prototype, {
  // Module identifiers imported or required by this module, if any.
  // Excludes dynamically imported dependencies, and may exclude
  // dependencies already included in the non-dynamic initial bundle.
  getNonDynamicDeps() {
    const nonDynamicDeps = Object.create(null);

    if (!_.isEmpty(this._allDeps)) {
      _.each(this._allDeps, (info, id) => {
        if (!info.dynamic) {
          nonDynamicDeps[id] = info;
        }
      });
    }

    return Object.keys(nonDynamicDeps);
  },

  // Return the globals in this file as an array of symbol names.  For
  // example: if the code references 'Foo.bar.baz' and 'Quux', and
  // neither are declared in a scope enclosing the point where they're
  // referenced, then globalReferences would include ["Foo", "Quux"].
  computeAssignedVariables: Profile("linker File#computeAssignedVariables", async function () {
    var self = this;

    if (self.absModuleId) {
      const parts = self.absModuleId.split("/");
      const nmi = parts.indexOf("node_modules");
      if (nmi >= 0 && parts[nmi + 1] !== "meteor") {
        // If this file is in a node_modules directory and is not part of
        // a Meteor package, then we don't care about capturing its global
        // variable assignments.
        return [];
      }
    }

    try {
      return Object.keys(findAssignedGlobals(self.source, self._inputHash));
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
        var parsed = await new sourcemap.SourceMapConsumer(self.sourceMap);
        var original = parsed.originalPositionFor(
          {line: e.lineNumber, column: e.column - 1});
        if (original.source) {
          errorOptions.file = original.source;
          errorOptions.line = original.line;
          errorOptions.column = original.column + 1;
        }
        parsed.destroy();
      }

      buildmessage.error(e.message, errorOptions);

      // Recover by pretending that this file is empty (which
      // includes replacing its source code with '' in the output)
      self.source = "";
      self._inputHash = watch.sha1(self.source);
      self.sourceMap = null;
      return [];
    }
  }),

  isDynamic() {
    return this.lazy && this.imported === "dynamic";
  },

  _getClosureHeader: Profile('linker File#_getClosureHeader', function () {
    if (this.meteorInstallOptions) {
      const headerParts = ["function module("];

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
  }),

  _getClosureFooter() {
    return this.meteorInstallOptions
      ? "}"
      : "}).call(this);\n";
  },

  getPrelinkedOutput: Profile('linker File#getPrelinkedOutput', function (options) {
    let header = this.bare ? '' : this._getClosureHeader() + '\n\n';
    let code = this.source;
    let map = this.sourceMap || null

    let pathNoSlash = convertColons(this.servePath.replace(/^\//, ""));
    let bannerLines = [pathNoSlash];

    if (this.bare) {
      bannerLines.push('This file is in bare mode and is not in its own closure.');
    }

    header += banner(bannerLines) + '\n';

    if (code) {
      if (this.bare) {
        // TODO: handle app bare files
      }

      // It's important for the code to end with a newline, so that a
      // trailing // comment can't snarf code appended after it.
      if (!code.endsWith('\n')) {
        code += '\n';
      }
    } else {
      code = '';
    }
    
    let footer = dividerLine(MIN_BANNER_WIDTH) + '\n';
    if (!this.bare) {
      footer += this._getClosureFooter();
    }

    return { header, code, map, footer };
  })
});

function getOutputWithSourceMapCached(file, servePath) {
  const key = JSON.stringify({
    hash: file._inputHash,
    arch: file.bundleArch,
    bare: file.bare,
    servePath: file.servePath,
    dynamic: file.isDynamic(),
  });

  // TODO: look into removing this cache
  if (DYNAMIC_PRELINKED_OUTPUT_CACHE.has(key)) {
    return DYNAMIC_PRELINKED_OUTPUT_CACHE.get(key);
  }

  let combinedFile = new CombinedFile();

  const { header, code, map, footer } = file.getPrelinkedOutput();

  combinedFile.addGeneratedCode(header);
  // TODO: should this use servePath or sourcePath?
  combinedFile.addCodeWithMap(file.servePath, code, map);
  combinedFile.addGeneratedCode(footer);

  const result = combinedFile.toStringWithMap();

  DYNAMIC_PRELINKED_OUTPUT_CACHE.set(key, result);

  return result;
}

const prelinkWithoutModules = Profile('linker prelinkWithoutModules', (files, isApp) => {
  let mainBundle = new CombinedFile();

  files.forEach((file, index) => {
    // TODO: there are lazy files, for example from mobile-experience
    // Lazy files can only be used if there is a module system.
    // We can easily allow lazy files by filtering them out,
    // but we will also want to make sure to exclude them when
    // computing assigned variables
    assert(!file.lazy, 'unexpected unused file in linker');

    if (index > 0) {
      mainBundle.addEmptyLines(6);
    }

    const { header, code, map, footer } = file.getPrelinkedOutput();
    mainBundle.addGeneratedCode(header);
    mainBundle.addCodeWithMap(file.sourcePath, code, map);
    mainBundle.addGeneratedCode(footer);
  });

  let output = mainBundle.toStringWithMap();

  return {
    mainBundle: output,
  };
});

const prelinkWithModules = Profile('linker prelinkWithModules', (files, name, isApp) => {
  let mainBundle = new CombinedFile();
  let dynamicFiles = [];
  let eagerModulePaths = [];
  let mainModulePath = null;
 
  let module = new Module(files, isApp);
  // TODO: do we need to calculate a hash?
  // TODO: do not use internal methods on module
  const trees = module._buildModuleTrees(dynamicFiles);
  const fileCount = module._chunkifyModuleTrees(trees, mainBundle);

  for (const file of files) {
    if (file.bare) {
      mainBundle.addEmptyLines(1);

      const { header, code, map, footer } = file.getPrelinkedOutput();
      mainBundle.addGeneratedCode(header);
      mainBundle.addCodeWithMap(file.sourcePath, code, map);
      mainBundle.addGeneratedCode(footer);
    } else if (!file.lazy) {
      eagerModulePaths.push(file.absModuleId);
      if (file.mainModule) {
        mainModulePath = file.absModuleId;
      }
    }
  }

  let output =  mainBundle.toStringWithMap();

  return {
    mainBundle: output,
    dynamicFiles,
    eagerModulePaths,
    mainModulePath
  };
});

class CombinedFile {
  constructor() {
    this._chunks = [];
    this._lineOffset = 0;
    this._addedFiles = 0;
  }

  addEmptyLines(lineCount) {
    this._chunks.push('\n'.repeat(lineCount));
    this._lineOffset += lineCount;
  }

  addGeneratedCode(code) {
    let lineCount = (code.match(/\n/g) || []).length;
    this._chunks.push(code);
    this._lineOffset += lineCount;
  }

  // TODO: add footer and header options
  addCodeWithMap(sourceName, code, map) {
    this._addedFiles += 1;
    let lineCount = (code.match(/\n/g) || []).length;

    this._chunks.push({
      code,
      map,
      sourceName,
      lineOffset: this._lineOffset,
      lines: lineCount
    });

    this.lineOffset += lineCount;
  }

  _buildWithMap() {
    let source = '';
    let sourceMap = new SourceMap();

    this._chunks.forEach(chunk => {
      if (typeof chunk === 'string') {
        source += chunk;
      } else if (typeof chunk === 'object') {
        source += chunk.code;

        if (chunk.map) {
          sourceMap.addVLQMap(chunk.map, chunk.lineOffset)
        } else {
          sourceMap.addEmptyMap(chunk.sourceName, chunk.code, chunk.lineOffset);
        }
      } else {
        throw new Error(`unrecognized chunk type, ${typeof chunk}`);
      }
    });

    let map = sourceMap.toVLQ();
    map.version = 3;
    sourceMap.delete();

    return { source, map };
  }

  // Optimization for when there are 1 or 0 files.
  // We can avoid parsing the source map if there is one, and instead
  // modify it to account for the offset from the header. 
  _buildWithBiasedMap() {
    let file;
    let header = '';
    let footer = '';
    
    this._chunks.forEach(chunk => {
      if (typeof chunk === 'string') {
        if (file) {
          footer += chunk;
        } else {
          header += chunk;
        }
      } else if (typeof chunk === 'object') {
        if (file) {
          throw new Error('_buildWithBiasedMap does not support multiple files');
        }
        file = chunk;
      } else {
        throw new Error(`unrecognized chunk type, ${typeof chunk}`);
      }
    });

    if (!file) {
      return { source: header + footer, map: null };
    }

    let map = file.map;

    if (!map) {
      let sourceMap = new SourceMap();
      sourceMap.addEmptyMap(file.sourceName, file.code, file.lineOffset);
      map = sourceMap.toVLQ();
      map.version = 3;
      sourceMap.delete();
    } else {
      // Bias the input sourcemap to account for the lines added by the header
      // This is much faster than parsing and re-encoding the sourcemap
      let headerMappings = ';'.repeat(file.lineOffset);
      map.mappings = headerMappings + map.mappings;
    }

    return {
      // TODO: standardize on source or code for naming
      source: header + file.code + footer,
      map
    };
  }

  toStringWithMap() {
    let source;
    let map;

    if (this._addedFiles < 2) {
      ({ source, map } = this._buildWithBiasedMap());
    } else {
      ({source, map} = this._buildWithMap())
    }

    return {
      source,
      sourceMap: map
    };
  }
}

['toStringWithMap', '_buildWithMap', '_buildWithBiasedMap'].forEach(method => {
  CombinedFile.prototype[method] =
    Profile(`CombinedFile#${method}`, CombinedFile.prototype[method]);
});

// Given a list of lines (not newline-terminated), returns a string placing them
// in a pretty banner of width bannerWidth. All lines must have length at most
// (bannerWidth - 6); if bannerWidth is not provided, the smallest width that
// fits is used.
var banner = function (lines, bannerWidth) {
  if (!bannerWidth) {
    bannerWidth = 6 + _.max(lines, function (x) { return x.length; }).length;
    bannerWidth = Math.max(bannerWidth, MIN_BANNER_WIDTH);
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
export var prelink = Profile("linker.prelink", async function (options) {
  return oldLinker.prelink(options);

  var module = new Module({
    name: options.name,
    combinedServePath: options.combinedServePath,
  });

  _.each(options.inputFiles, function (inputFile) {
    module.addFile(inputFile);
  });

  // Do static analysis to compute module-scoped variables. Error recovery from
  // the static analysis mutates the sources, so this has to be done before
  // concatenation.
  var assignedVariables = await module.computeAssignedVariables();
  var files = await module.getPrelinkedFiles();

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
  if (!options.hasRuntime) {
    return '(function() {\n\n';
  }

  var isApp = options.name === null;
  var chunks = [];
   let orderedDeps = [];

  options.deps.forEach(dep => {
    if (!dep.unordered) {
      orderedDeps.push(JSON.stringify(dep.package))
    }
  });

  chunks.push(
      `Package["core-runtime"].queue("${options.name}", [`,
      orderedDeps.join(', '),
      '], function () {'
  );

  if (isApp) {
    chunks.push(
      getImportCode(options.imports, "/* Imports for global scope */\n\n", true),
    );
  } else {
    chunks.push(
      getImportCode(options.imports, "/* Imports */\n", false),
    );
  }

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

function getImportCode(imports, header, omitVar) {
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
    buf += (omitVar ? "" : "var " ) +
      key + " = " + writeSymbolTree(node) + ";\n";
  });
  buf += "\n";

  return buf;
}

function getFooter ({
  name,
  exported,
  mainModulePath,
  eagerModulePaths,
  imports,
  hasRuntime
}) {
  if (!hasRuntime) {
    return '\n})();\n';
  }

  let chunks = [];
  let returnObj = Object.create(null);

  if (! _.isEmpty(exported)) {
    const scratch = {};
    _.each(exported, symbol => scratch[symbol] = symbol);
    const symbolTree = writeSymbolTree(buildSymbolTree(scratch), 4);
    returnObj.export = `function () { return ${symbolTree};}`;
  }


  if (eagerModulePaths && eagerModulePaths.length > 0) {
    returnObj.require = 'require';

    let modulePaths = eagerModulePaths.map(path => `    ${JSON.stringify(path)}`);
    returnObj.eagerModulePaths = `[\n${modulePaths.join(',\n')}\n  ]`;
  }
  if (mainModulePath) {
    returnObj.mainModulePath = JSON.stringify(mainModulePath);
  }

  chunks.push("\n\n/* Exports */\n");
  chunks.push('return {\n');

  let entries = Object.entries(returnObj);
  entries.forEach(([ key, value ], index) => {
    chunks.push(`  ${key}: ${value}`);
    if (index !== entries.length - 1) {
      chunks.push(',\n');
    }
  });

  chunks.push("\n}});\n");

  return chunks.join('');
}

// TODO: simplify wrapWithHeaderAndFooter
function wrapWithHeaderAndFooter(files, header, footer) {
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
  var headerContent = (new Array(headerLines + 1).join(';'));

  return files.map(file => {
    if (file.dynamic) {
      return file;
    }

    if (file.sourceMap) {
      var sourceMap = file.sourceMap;
      sourceMap.mappings = headerContent + sourceMap.mappings;
      return {
        source: header + file.source + footer,
        sourcePath: file.sourcePath,
        servePath: file.servePath,
        sourceMap: sourceMap
      };
    }

    return {
      source: header + file.source + footer,
      sourcePath: file.sourcePath,
      servePath: file.servePath
    };
  })
}

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
export var fullLink = Profile("linker.fullLink2", async function (inputFiles, {
  // True if we're linking the application (as opposed to a
  // package). Among other consequences, this makes the top level
  // namespace be the same as the global namespace, so that symbols are
  // accessible from the console, and avoids actually combining files into
  // a single file.
  isApp,
  // The architecture for which this bundle is being linked.
  bundleArch,
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
  // True if JS files with source maps should have a comment explaining
  // how to use them in a browser.
  includeSourceMapInstructions,

  // List of packages this bundle directly uses, or is implied by the packages
  // it uses
  deps
}) {
  if (USE_OLD_LINKER ) {
    return oldLinker.fullLink(
      inputFiles,
      {
        isApp,
        bundleArch,
        combinedServePath,
        name,
        declaredExports,
        imports,
        includeSourceMapInstructions,
        deps
      }
      );
    }

  buildmessage.assertInJob();
  
  const hasModules = inputFiles.some(file => file.meteorInstallOptions);

  let filesToLink = inputFiles.map(file => new File(file, bundleArch));

  let mainBundle;
  let dynamicFiles = [];
  let mainModulePath;
  let eagerModulePaths;

  if (hasModules) {
    ({
      mainBundle,
      dynamicFiles,
      mainModulePath,
      eagerModulePaths
    } = prelinkWithModules(filesToLink, name, isApp));
  } else {
    ({ mainBundle } = prelinkWithoutModules(filesToLink, isApp));
  }

  // Check if the core-runtime package will already be loaded
  // It is a dependency of the meteor package, and all packages depend
  // on the Meteor package, so if there are any packages loaded first,
  // we can be sure the runtime will be available
  // The main situations it is not available is the core-runtime
  // package itself, or any build plugins with no dependencies
  let hasRuntime = deps.some(entry => entry.unordered !== true);

  if (!hasRuntime && (
    Object.keys(declaredExports).length > 0 ||
    eagerModulePaths ||
    mainModulePath
  )) {
    throw new Error(`Runtime is not available, but it uses features needing the runtime: ${name}`);
  }

  // Do static analysis to compute module-scoped variables. Error recovery from
  // the static analysis mutates the sources, so this has to be done before
  // concatenation.
  let packageVariables = new Set(declaredExports);
  if (!isApp) {
    const failed = await buildmessage.enterJob('computing assigned variables', async () => {
      await Profile.time('linker-computeAssignedVariables', async () => {
        for (const file of filesToLink) {
          let globals = await file.computeAssignedVariables();
          globals.forEach(name => packageVariables.add(name));
        }
      });

      return buildmessage.jobHasMessages();
    });
    if (failed) {
      // recover by pretending there are no files
      return [];
    }
  }

  // If none of the prelinkedFiles contain any code, then the only
  // possible purpose of this package is to re-export imported symbols, so
  // we filter the set of imported symbols according to declaredExports.
  // When there are no declaredExports, this effectively slims the package
  // bundle down to just Package[name] = {}.
  // TODO: should this also check the dynamic imports?
  //       - probably not since there has to be code in the main bundle for
  //         dynamic imports to work
  if (!isApp && !mainBundle.source) {
    const newImports = {};
    declaredExports.forEach(name => {
      if (_.has(imports, name)) {
        newImports[name] = imports[name]
      }
    });
    imports = newImports;
  }

  // Otherwise we're making a package and we have to actually combine the files
  // into a single scope.
  var header = getHeader({
    name,
    imports,
    packageVariables: Array.from(packageVariables),
    hasRuntime,
    deps
  });

  var footer = getFooter({
    name,
    exported: declaredExports,
    mainModulePath,
    eagerModulePaths,
    imports,
    hasRuntime
  });

  if (includeSourceMapInstructions) {
    header = SOURCE_MAP_INSTRUCTIONS_COMMENT + "\n\n" + header;
  }

  return wrapWithHeaderAndFooter([{
    source: mainBundle.source,
    sourceMap: mainBundle.sourceMap,
    servePath: combinedServePath,
    // TODO: is source path ever used?
    // sourcePath: 
  }], header, footer).concat(dynamicFiles);
});
