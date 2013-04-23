var fs = require('fs');
var uglify = require('uglify-js');
var _ = require('underscore');
var buildmessage = require('./buildmessage');

var packageDot = function (name) {
  if (/^[a-zA-Z0-9]*$/.exec(name))
    return "Package." + name;
  else
    return "Package['" + name + "']";
};

var generateBoundary = function () {
  // In a perfect world we would call Packages.random.Random.id().
  // But we can't do that this is part of the code that is used to
  // compile and load packages. So let it slide for now and provide a
  // version based on (the completely non-cryptographic) Math.random,
  // which is good enough for this particular application.
  var alphabet = "23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz";
  var digits = [];
  for (var i = 0; i < 17; i++) {
    var index = Math.floor(Math.random() * alphabet.length);
    digits[i] = alphabet.substr(index, 1);
  }
  return "__imports_" + digits.join("") + "__";
};

///////////////////////////////////////////////////////////////////////////////
// Module
///////////////////////////////////////////////////////////////////////////////

// options include name, imports, forceExport, useGlobalNamespace,
// combinedServePath, and importStubServePath, all of which have the
// same meaning as they do when passed to import().
var Module = function (options) {
  var self = this;

  // module name or null
  self.name = options.name || null;

  // files in the module. array of File
  self.files = [];

  // boundary to use to mark where import should go in final phase
  self.boundary = generateBoundary();

  // options
  self.forceExport = options.forceExport || [];
  self.useGlobalNamespace = options.useGlobalNamespace;
  self.combinedServePath = options.combinedServePath;
  self.importStubServePath = options.importStubServePath;
};

_.extend(Module.prototype, {
  // source: the source code
  // servePath: the path where it would prefer to be served if possible
  addFile: function (source, servePath, sourcePath, includePositionInErrors) {
    var self = this;
    self.files.push(new File(source, servePath, sourcePath,
                             includePositionInErrors));
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
  computeModuleScopedVars: function () {
    var self = this;

    // Find all global references in any files
    var globalReferences = [];
    _.each(self.files, function (file) {
      globalReferences = globalReferences.concat(file.computeGlobalReferences());
    });
    globalReferences = _.uniq(globalReferences);

    return globalReferences;
  },

  // Output is a list of objects with keys 'source' and 'servePath'.
  getLinkedFiles: function () {
    var self = this;

    if (! self.files.length)
      return [];

    // If we don't want to create a separate scope for this module,
    // then our job is much simpler. And we can get away with
    // preserving the line numbers.
    if (self.useGlobalNamespace) {
      var ret = [{
        source: self.boundary,
        servePath: self.importStubServePath
      }];

      return ret.concat(_.map(self.files, function (file) {
        return {
          source: file.getLinkedOutput({ preserveLineNumbers: true }),
          servePath: file.servePath
        }
      }));
    }

    // Otherwise..

    // Find the maximum line length. The extra three are for the
    // comments that will be emitted when we skip a unit.
    var sourceWidth = _.max([68, self.maxLineLength(120 - 2)]) + 3;

    // Figure out which variables are module scope
    var moduleScopedVars = self.computeModuleScopedVars();

    // Prologue
    var combined = "(function () {\n\n";
    combined += self.boundary;

    if (moduleScopedVars.length) {
      combined += "/* Package-scope variables */\n";
      combined += "var " + moduleScopedVars.join(', ') + ";\n\n";
    }

    // Emit each file
    _.each(self.files, function (file) {
      combined += file.getLinkedOutput({ sourceWidth: sourceWidth });
      combined += "\n";
    });

    // Epilogue
    combined += self.getExportCode();
    combined += "\n})();";

    return [{
      source: combined,
      servePath: self.combinedServePath
    }];
  },

  // Return our exports as a list of string
  getExports: function () {
    var self = this;
    var exports = {};

    _.each(self.files, function (file) {
      _.each(file.units, function (unit) {
        _.extend(exports, unit.exports);
      });
    });

    return _.union(_.keys(exports), self.forceExport);
  },

  // Return code that saves our exports to Package.packagename.foo.bar
  getExportCode: function () {
    var self = this;
    if (! self.name)
      return "";
    if (self.useGlobalNamespace)
      // Haven't thought about this case. When would this happen?
      throw new Error("Not implemented: exports from global namespace");

    var buf = "/* Exports */\n";
    buf += "if (typeof Package === 'undefined') Package = {};\n";
    buf += packageDot(self.name) + " = ";

    var exports = self.getExports();
    if (exports.length === 0)
      return "";

    // Given exports like Foo, Bar.Baz, Bar.Quux.A, and Bar.Quux.B,
    // construct an expression like
    // {Foo: Foo, Bar: {Baz: Bar.Baz, Quux: {A: Bar.Quux.A, B: Bar.Quux.B}}}
    var scratch = {};
    _.each(self.getExports(), function (symbol) {
      scratch[symbol] = symbol;
    });
    var exports = buildSymbolTree(scratch);
    buf += writeSymbolTree(exports, 0);
    buf += ";\n";
    return buf;
  },

});

// Given 'symbolMap' like {Foo: 's1', 'Bar.Baz': 's2', 'Bar.Quux.A': 's3', 'Bar.Quux.B': 's4'}
// return something like
// {Foo: 's1', Bar: {Baz: 's2', Quux: {A: 's3', B: 's4'}}}
var buildSymbolTree = function (symbolMap, f) {
  // XXX XXX detect and report conflicts, like one file exporting
  // Foo and another file exporting Foo.Bar
  var ret = {}

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

var File = function (source, servePath, sourcePath, includePositionInErrors) {
  var self = this;

  // source code for this file (a string)
  self.source = source;

  // the path where this file would prefer to be served if possible
  self.servePath = servePath;

  // the path to use for error message
  self.sourcePath = sourcePath;

  // should line and column be included in errors?
  self.includePositionInErrors = includePositionInErrors;

  // The individual @units in the file. Array of Unit. Concatenating
  // the source of each unit, in order, will give self.source.
  self.units = [];

  self._unitize();
};

_.extend(File.prototype, {
  // Return the union of the global references in all of the units in
  // this file that we are actually planning to use. Array of string.
  computeGlobalReferences: function () {
    var self = this;

    var globalReferences = [];
    _.each(self.units, function (unit) {
      if (unit.include)
        globalReferences = globalReferences.concat(unit.computeGlobalReferences());
    });
    return globalReferences;
  },

  // Options:
  // - preserveLineNumbers: if true, decorate minimally so that line
  //   numbers don't change between input and output. In this case,
  //   sourceWidth is ignored.
  // - sourceWidth: width in columns to use for the source code
  getLinkedOutput: function (options) {
    var self = this;

    // XXX XXX if a unit is not going to be used, prepend each line with '//'

    // The newline after the source closes a '//' comment.
    if (options.preserveLineNumbers) {
      // Ugly version
      return "(function(){" + self.source + "\n})();\n";
    }

    // Pretty version
    var buf = "";

    // Prologue
    buf += "(function () {\n\n";

    // Banner
    var width = options.sourceWidth || 70;
    var bannerWidth = width + 3;
    var divider = new Array(bannerWidth + 1).join('/') + "\n";
    var spacer = "// " + new Array(bannerWidth - 6 + 1).join(' ') + " //\n";
    var padding = new Array(bannerWidth + 1).join(' ');
    var blankLine = new Array(width + 1).join(' ') + " //\n";
    buf += divider + spacer;
    buf += "// " + (self.servePath.slice(1) + padding).slice(0, bannerWidth - 6) +
      " //\n";
    buf += spacer + divider + blankLine;

    // Code, with line numbers
    // You might prefer your line numbers at the beginning of the
    // line, with /* .. */. Well, that requires parsing the source for
    // comments, because you have to do something different if you're
    // already inside a comment.
    var num = 1;
    _.each(self.units, function (unit) {
      var lines = unit.source.split('\n');

      _.each(lines, function (line) {
        if (! unit.include)
          line = "// " + line;
        if (line.length > width)
          buf += line + "\n";
        else
          buf += (line + padding).slice(0, width) + " // " + num + "\n";
        num++;
      });
    });

    // Footer
    buf += divider;

    // Epilogue
    buf += "\n}).call(this);\n\n\n\n\n\n"
    return buf;
  },

  // Split file and populate self.units
  // XXX it is an error to declare a @unit not at toplevel (eg, inside a
  // function or object..) We don't detect this but we might have to to
  // give an acceptable user experience..
  _unitize: function () {
    var self = this;
    var lines = self.source.split("\n");
    var buf = "";
    var unit = new Unit(null, true, self.sourcePath,
                        self.includePositionInErrors ? 0 : null);
    self.units.push(unit);

    var lineCount = 0;
    _.each(lines, function (line) {
      // XXX overly permissive. should detect errors
      var match = /^\s*\/\/\s*@unit(\s+([^\s]+))?/.exec(line);
      if (match) {
        unit.source = buf;
        buf = line;
        unit = new Unit(match[2] || null, false, self.sourcePath,
                        self.includePositionInErrors ? lineCount : null);
        self.units.push(unit);
        lineCount++;
        return;
      }

      // XXX overly permissive. should detect errors
      match = /^\s*\/\/\s*@(export|require|provide|weak)(\s+.*)$/.exec(line);
      if (match) {
        var what = match[1];
        var symbols = _.map(match[2].split(/,/), function (s) {
          return s.replace(/^\s+|\s+$/g, ''); // trim leading/trailing whitespace
        });

        _.each(symbols, function (s) {
          if (s.length)
            unit[what + "s"][s] = true;
        });

        /* fall through */
      }

      if (lineCount !== 0)
        buf += "\n";
      lineCount++;
      buf += line;
    });
    unit.source = buf;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Unit
///////////////////////////////////////////////////////////////////////////////

var Unit = function (name, mandatory, sourcePath, lineOffset) {
  var self = this;

  // name of the unit, or null if none provided
  self.name = name;

  // source code for this unit (a string)
  self.source = null;

  // true if this unit is to always be included
  self.mandatory = !! mandatory;

  // true if we should include this unit in the linked output
  self.include = self.mandatory;

  // filename to use in error messages
  self.sourcePath = sourcePath;

  // offset of 'self.source' in the original input file, in whole
  // lines (partial lines are not supported.) Used to generate correct
  // line number information in error messages. Set to null to omit
  // line/column information (you'll need to do this, for, eg,
  // coffeescript output, given that we don't have sourcemaps here
  // yet.)
  self.lineOffset = lineOffset;

  // symbols mentioned in @export, @require, @provide, or @weak
  // directives. each is a map from the symbol (given as a string) to
  // true.
  self.exports = {};
  self.requires = {};
  self.provides = {};
  self.weaks = {};
};

_.extend(Unit.prototype, {
  // Return the globals in unit file as an array of symbol names.  For
  // example: if the code references 'Foo.bar.baz' and 'Quux', and
  // neither are declared in a scope enclosing the point where they're
  // referenced, then globalReferences would include ["Foo", "Quux"].
  computeGlobalReferences: function () {
    var self = this;

    // XXX Use Uglify for now. Uglify is pretty good at returning us a
    // list of symbols that are referenced but not defined, but not
    // good at all at helping us figure out which of those are
    // assigned to rather than just referenced. Without the
    // assignments, we have to maintain an explicit list of symbols
    // that we expect to be declared in the browser, which is super
    // bogus! Use jsparse instead or maybe acorn, and rewrite uglify's
    // scope analysis code (it can't be that hard.)

    // Uglify likes to print to stderr when it gets a parse
    // error. Stop it from doing that.
    var oldWarnFunction = uglify.AST_Node.warn_function;
    uglify.AST_Node.warn_function = function () {};
    try {
      // instanceof uglify.AST_Toplevel
      var toplevel = uglify.parse(self.source);
    } catch (e) {
      if (e instanceof uglify.JS_Parse_Error) {
        // It appears that uglify's parse errors report 1-based line
        // numbers but 0-based column numbers
        buildmessage.error(e.message, {
          file: self.sourcePath,
          line: self.lineOffset === null ? null : e.line + self.lineOffset,
          column: self.lineOffset === null ? null : e.col + 1,
          downcase: true
        });

        // Recover by pretending that this unit is empty (which
        // includes replacing its source code with '' in the output)
        self.source = "";
        return [];
      };

      throw e;
    } finally {
      uglify.AST_Node.warn_function = oldWarnFunction;
    }
    toplevel.figure_out_scope();

    var globalReferences = [];
    _.each(toplevel.enclosed, function (symbol) {
      if (symbol.undeclared && ! (symbol.name in blacklist))
        globalReferences.push(symbol.name);
    });

    return globalReferences;
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
// Output is an object with keys:
// - files: is an array of output files in the same format as inputFiles
// - exports: the exports, as a list of string ('Foo', 'Thing.Stuff', etc)
// - boundary: an opaque value that must be passed along with 'files' to link()
var prelink = function (options) {
  var module = new Module({
    name: options.name,
    forceExport: options.forceExport,
    useGlobalNamespace: options.useGlobalNamespace,
    importStubServePath: options.importStubServePath,
    combinedServePath: options.combinedServePath
  });

  _.each(options.inputFiles, function (f) {
    module.addFile(f.source, f.servePath, f.sourcePath,
                   f.includePositionInErrors);
  });

  var files = module.getLinkedFiles();
  var exports = module.getExports();

  return {
    files: files,
    exports: exports,
    boundary: module.boundary
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
// boundary: the 'boundary' output from prelink()
//
// Output is an array of final output files in the same format as the
// 'inputFiles' argument to prelink().
var link = function (options) {
  var importCode = options.useGlobalNamespace ?
    getImportCode(options.imports, "/* Imports for global scope */\n\n", true) :
    getImportCode(options.imports, "/* Imports */\n");

  var ret = [];
  _.each(options.prelinkFiles, function (file) {
    var source = file.source;
    var parts = source.split(options.boundary);
    if (parts.length > 2)
      throw new Error("Boundary appears more than once?");
    if (parts.length === 2) {
      source = parts[0] + importCode + parts[1];
      if (source.length === 0)
        return; // empty global-imports file -- elide
    }
    ret.push({
      source: source,
      servePath: file.servePath
    });
  });

  return ret;
};

var getImportCode = function (imports, header, omitvar) {
  var self = this;

  if (_.isEmpty(imports))
    return "";

  var scratch = {};
  _.each(imports, function (name, symbol) {
    scratch[symbol] = packageDot(name) + "." + symbol;
  });
  var imports = buildSymbolTree(scratch);

  var buf = header;
  _.each(imports, function (node, key) {
    buf += (omitvar ? "" : "var " ) +
      key + " = " + writeSymbolTree(node) + ";\n";
  });

  // XXX need to remove newlines, whitespace, in line number preserving mode
  buf += "\n";
  return buf;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// From Chome. Open a console on an empty tab and call:
//   Object.getOwnPropertyNames(this).join('", "')
//   Object.getOwnPropertyNames(Object.getPrototypeOf(this)).join('", "')
// I'm not sure why window has a prototype, but it does, and that
// prototype contains important stuff like setTimeout.
// Additionally I manually added a few symbols at the bottom.
var blacklistedSymbols = [
  // Object.getOwnPropertyNames(this).join('", "')
  "eval", "$", "ntp", "findAncestorByClass", "escape", "undefined",
  "decodeURI", "eventLog", "url", "isRTL", "encodeURIComponent",
  "getRequiredElement", "chromeSend", "getFaviconURL", "logEvent",
  "parseHtmlSubset", "isNaN", "preventDefaultOnPoundLinkClicks",
  "Date", "window", "Math", "RangeError", "i18nTemplate", "NaN",
  "cr", "appendParam", "String", "decodeURIComponent",
  "findAncestor", "external", "unescape", "SyntaxError", "isFinite",
  "v8Intl", "RegExp", "location", "TypeError", "Function", "toCssPx",
  "document", "assert", "Object", "ReferenceError", "loadTimeData",
  "parseInt", "chrome", "EventTracker", "disableTextSelectAndDrag",
  "EvalError", "parseQueryParams", "Infinity", "swapDomNodes",
  "encodeURI", "top", "Intl", "global", "Error", "Array", "URIError",
  "parseFloat", "JSON", "Number", "Boolean", "WebSocket",
  "webkitRTCPeerConnection", "webkitMediaStream",
  "webkitOfflineAudioContext", "webkitAudioContext",
  "webkitSpeechGrammarList", "webkitSpeechGrammar",
  "webkitSpeechRecognitionEvent", "webkitSpeechRecognitionError",
  "webkitSpeechRecognition", "webkitNotifications",
  "WebKitSourceBufferList", "WebKitSourceBuffer",
  "WebKitMediaSource", "SharedWorker", "DeviceOrientationEvent",
  "MediaController", "HTMLSourceElement", "TimeRanges", "MediaError",
  "HTMLVideoElement", "HTMLMediaElement", "HTMLAudioElement",
  "Audio", "TrackEvent", "TextTrackList", "TextTrackCueList",
  "TextTrackCue", "TextTrack", "HTMLTrackElement",
  "HTMLShadowElement", "HTMLContentElement", "WebKitShadowRoot",
  "localStorage", "sessionStorage", "applicationCache", "CloseEvent",
  "MediaStreamEvent", "RTCIceCandidate", "RTCSessionDescription",
  "OfflineAudioCompletionEvent", "AudioProcessingEvent",
  "webkitAudioPannerNode", "SQLException", "IDBVersionChangeEvent",
  "IDBTransaction", "IDBRequest", "IDBOpenDBRequest",
  "IDBObjectStore", "IDBKeyRange", "IDBIndex", "IDBFactory",
  "IDBDatabase", "IDBCursorWithValue", "IDBCursor", "indexedDB",
  "webkitIDBTransaction", "webkitIDBRequest", "webkitIDBObjectStore",
  "webkitIDBKeyRange", "webkitIDBIndex", "webkitIDBFactory",
  "webkitIDBDatabase", "webkitIDBCursor", "webkitIndexedDB",
  "webkitStorageInfo", "Notification", "WebKitMutationObserver",
  "webkitURL", "URL", "FileReader", "FileError", "FormData",
  "SVGFilterElement", "SVGFETurbulenceElement", "SVGFETileElement",
  "SVGFESpotLightElement", "SVGFESpecularLightingElement",
  "SVGFEPointLightElement", "SVGFEOffsetElement",
  "SVGFEMorphologyElement", "SVGFEMergeNodeElement",
  "SVGFEMergeElement", "SVGFEImageElement",
  "SVGFEGaussianBlurElement", "SVGFEFuncRElement",
  "SVGFEFuncGElement", "SVGFEFuncBElement", "SVGFEFuncAElement",
  "SVGFEFloodElement", "SVGFEDropShadowElement",
  "SVGFEDistantLightElement", "SVGFEDisplacementMapElement",
  "SVGFEDiffuseLightingElement", "SVGFEConvolveMatrixElement",
  "SVGFECompositeElement", "SVGFEComponentTransferElement",
  "SVGFEColorMatrixElement", "SVGFEBlendElement",
  "SVGComponentTransferFunctionElement", "SVGVKernElement",
  "SVGMissingGlyphElement", "SVGHKernElement", "SVGGlyphRefElement",
  "SVGGlyphElement", "SVGFontFaceUriElement",
  "SVGFontFaceSrcElement", "SVGFontFaceNameElement",
  "SVGFontFaceFormatElement", "SVGFontFaceElement", "SVGFontElement",
  "SVGAltGlyphItemElement", "SVGAltGlyphElement",
  "SVGAltGlyphDefElement", "SVGSetElement", "SVGMPathElement",
  "SVGAnimateTransformElement", "SVGAnimateMotionElement",
  "SVGAnimateElement", "SVGAnimateColorElement", "SVGZoomAndPan",
  "SVGViewSpec", "SVGViewElement", "SVGUseElement", "SVGUnitTypes",
  "SVGTSpanElement", "SVGTRefElement", "SVGTransformList",
  "SVGTransform", "SVGTitleElement", "SVGTextPositioningElement",
  "SVGTextPathElement", "SVGTextElement", "SVGTextContentElement",
  "SVGSymbolElement", "SVGSwitchElement", "SVGSVGElement",
  "SVGStyleElement", "SVGStringList", "SVGStopElement",
  "SVGScriptElement", "SVGRenderingIntent", "SVGRectElement",
  "SVGRect", "SVGRadialGradientElement", "SVGPreserveAspectRatio",
  "SVGPolylineElement", "SVGPolygonElement", "SVGPointList",
  "SVGPoint", "SVGPatternElement", "SVGPathSegMovetoRel",
  "SVGPathSegMovetoAbs", "SVGPathSegList",
  "SVGPathSegLinetoVerticalRel", "SVGPathSegLinetoVerticalAbs",
  "SVGPathSegLinetoRel", "SVGPathSegLinetoHorizontalRel",
  "SVGPathSegLinetoHorizontalAbs", "SVGPathSegLinetoAbs",
  "SVGPathSegCurvetoQuadraticSmoothRel",
  "SVGPathSegCurvetoQuadraticSmoothAbs",
  "SVGPathSegCurvetoQuadraticRel", "SVGPathSegCurvetoQuadraticAbs",
  "SVGPathSegCurvetoCubicSmoothRel",
  "SVGPathSegCurvetoCubicSmoothAbs", "SVGPathSegCurvetoCubicRel",
  "SVGPathSegCurvetoCubicAbs", "SVGPathSegClosePath",
  "SVGPathSegArcRel", "SVGPathSegArcAbs", "SVGPathSeg",
  "SVGPathElement", "SVGPaint", "SVGNumberList", "SVGNumber",
  "SVGMetadataElement", "SVGMatrix", "SVGMaskElement",
  "SVGMarkerElement", "SVGLineElement", "SVGLinearGradientElement",
  "SVGLengthList", "SVGLength", "SVGImageElement",
  "SVGGradientElement", "SVGGElement", "SVGException",
  "SVGForeignObjectElement", "SVGEllipseElement",
  "SVGElementInstanceList", "SVGElementInstance", "SVGElement",
  "SVGDocument", "SVGDescElement", "SVGDefsElement",
  "SVGCursorElement", "SVGColor", "SVGClipPathElement",
  "SVGCircleElement", "SVGAnimatedTransformList",
  "SVGAnimatedString", "SVGAnimatedRect",
  "SVGAnimatedPreserveAspectRatio", "SVGAnimatedNumberList",
  "SVGAnimatedNumber", "SVGAnimatedLengthList", "SVGAnimatedLength",
  "SVGAnimatedInteger", "SVGAnimatedEnumeration",
  "SVGAnimatedBoolean", "SVGAnimatedAngle", "SVGAngle",
  "SVGAElement", "SVGZoomEvent", "XPathException", "XPathResult",
  "XPathEvaluator", "Storage", "ClientRectList", "ClientRect",
  "MimeTypeArray", "MimeType", "PluginArray", "Plugin",
  "MessageChannel", "MessagePort", "XSLTProcessor",
  "XMLHttpRequestException", "XMLHttpRequestUpload",
  "XMLHttpRequest", "XMLSerializer", "DOMParser", "XMLDocument",
  "EventSource", "RangeException", "Range", "NodeFilter", "Blob",
  "FileList", "File", "Worker", "Clipboard", "WebKitPoint",
  "WebKitCSSMatrix", "WebKitCSSKeyframesRule",
  "WebKitCSSKeyframeRule", "EventException", "WebGLContextEvent",
  "SpeechInputEvent", "StorageEvent", "TouchEvent",
  "XMLHttpRequestProgressEvent", "WheelEvent",
  "WebKitTransitionEvent", "WebKitAnimationEvent", "UIEvent",
  "TextEvent", "ProgressEvent", "PageTransitionEvent",
  "PopStateEvent", "OverflowEvent", "MutationEvent", "MouseEvent",
  "MessageEvent", "KeyboardEvent", "HashChangeEvent", "ErrorEvent",
  "CustomEvent", "CompositionEvent", "BeforeLoadEvent", "Event",
  "DataView", "Float64Array", "Float32Array", "Uint32Array",
  "Int32Array", "Uint16Array", "Int16Array", "Uint8ClampedArray",
  "Uint8Array", "Int8Array", "ArrayBufferView", "ArrayBuffer",
  "DOMStringMap", "WebGLUniformLocation", "WebGLTexture",
  "WebGLShaderPrecisionFormat", "WebGLShader",
  "WebGLRenderingContext", "WebGLRenderbuffer", "WebGLProgram",
  "WebGLFramebuffer", "WebGLBuffer", "WebGLActiveInfo",
  "TextMetrics", "ImageData", "CanvasRenderingContext2D",
  "CanvasGradient", "CanvasPattern", "Option", "Image",
  "HTMLUnknownElement", "HTMLOptionsCollection",
  "HTMLFormControlsCollection", "HTMLAllCollection",
  "HTMLCollection", "HTMLUListElement", "HTMLTitleElement",
  "HTMLTextAreaElement", "HTMLTableSectionElement",
  "HTMLTableRowElement", "HTMLTableElement", "HTMLTableColElement",
  "HTMLTableCellElement", "HTMLTableCaptionElement",
  "HTMLStyleElement", "HTMLSpanElement", "HTMLSelectElement",
  "HTMLScriptElement", "HTMLQuoteElement", "HTMLProgressElement",
  "HTMLPreElement", "HTMLParamElement", "HTMLParagraphElement",
  "HTMLOutputElement", "HTMLOptionElement", "HTMLOptGroupElement",
  "HTMLObjectElement", "HTMLOListElement", "HTMLModElement",
  "HTMLMeterElement", "HTMLMetaElement", "HTMLMenuElement",
  "HTMLMarqueeElement", "HTMLMapElement", "HTMLLinkElement",
  "HTMLLegendElement", "HTMLLabelElement", "HTMLLIElement",
  "HTMLKeygenElement", "HTMLInputElement", "HTMLImageElement",
  "HTMLIFrameElement", "HTMLHtmlElement", "HTMLHeadingElement",
  "HTMLHeadElement", "HTMLHRElement", "HTMLFrameSetElement",
  "HTMLFrameElement", "HTMLFormElement", "HTMLFontElement",
  "HTMLFieldSetElement", "HTMLEmbedElement", "HTMLDivElement",
  "HTMLDirectoryElement", "HTMLDataListElement", "HTMLDListElement",
  "HTMLCanvasElement", "HTMLButtonElement", "HTMLBodyElement",
  "HTMLBaseFontElement", "HTMLBaseElement", "HTMLBRElement",
  "HTMLAreaElement", "HTMLAppletElement", "HTMLAnchorElement",
  "HTMLElement", "HTMLDocument", "Window", "Selection",
  "ProcessingInstruction", "EntityReference", "Entity", "Notation",
  "DocumentType", "CDATASection", "Comment", "Text", "Element",
  "Attr", "CharacterData", "NamedNodeMap", "NodeList", "Node",
  "Document", "DocumentFragment", "DOMTokenList",
  "DOMSettableTokenList", "DOMImplementation", "DOMStringList",
  "DOMException", "StyleSheetList", "RGBColor", "Rect",
  "CSSRuleList", "Counter", "MediaList", "CSSStyleDeclaration",
  "CSSStyleRule", "CSSPageRule", "CSSMediaRule", "CSSImportRule",
  "CSSFontFaceRule", "CSSCharsetRule", "CSSRule",
  "WebKitCSSFilterValue", "WebKitCSSMixFunctionValue",
  "WebKitCSSTransformValue", "CSSValueList", "CSSPrimitiveValue",
  "CSSValue", "CSSStyleSheet", "StyleSheet", "performance",
  "console", "devicePixelRatio", "styleMedia", "parent", "opener",
  "frames", "self", "defaultstatus", "defaultStatus", "status",
  "name", "length", "closed", "pageYOffset", "pageXOffset",
  "scrollY", "scrollX", "screenTop", "screenLeft", "screenY",
  "screenX", "innerWidth", "innerHeight", "outerWidth",
  "outerHeight", "offscreenBuffering", "frameElement", "event",
  "crypto", "clientInformation", "navigator", "toolbar", "statusbar",
  "scrollbars", "personalbar", "menubar", "locationbar", "history",
  "screen",

  // Object.getOwnPropertyNames(Object.getPrototypeOf(this)).join('", "')
  "toString", "postMessage", "close", "blur", "focus",
  "ondeviceorientation", "onwebkittransitionend",
  "onwebkitanimationstart", "onwebkitanimationiteration",
  "onwebkitanimationend", "onsearch", "onreset", "onwaiting",
  "onvolumechange", "onunload", "ontimeupdate", "onsuspend",
  "onsubmit", "onstorage", "onstalled", "onselect", "onseeking",
  "onseeked", "onscroll", "onresize", "onratechange", "onprogress",
  "onpopstate", "onplaying", "onplay", "onpause", "onpageshow",
  "onpagehide", "ononline", "onoffline", "onmousewheel", "onmouseup",
  "onmouseover", "onmouseout", "onmousemove", "onmousedown",
  "onmessage", "onloadstart", "onloadedmetadata", "onloadeddata",
  "onload", "onkeyup", "onkeypress", "onkeydown", "oninvalid",
  "oninput", "onhashchange", "onfocus", "onerror", "onended",
  "onemptied", "ondurationchange", "ondrop", "ondragstart",
  "ondragover", "ondragleave", "ondragenter", "ondragend", "ondrag",
  "ondblclick", "oncontextmenu", "onclick", "onchange",
  "oncanplaythrough", "oncanplay", "onblur", "onbeforeunload",
  "onabort", "getSelection", "print", "stop", "open",
  "showModalDialog", "alert", "confirm", "prompt", "find",
  "scrollBy", "scrollTo", "scroll", "moveBy", "moveTo", "resizeBy",
  "resizeTo", "matchMedia", "setTimeout", "clearTimeout",
  "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "webkitRequestAnimationFrame",
  "webkitCancelAnimationFrame", "webkitCancelRequestAnimationFrame",
  "atob", "btoa", "addEventListener", "removeEventListener",
  "captureEvents", "releaseEvents", "getComputedStyle",
  "getMatchedCSSRules", "webkitConvertPointFromPageToNode",
  "webkitConvertPointFromNodeToPage", "dispatchEvent",
  "webkitRequestFileSystem", "webkitResolveLocalFileSystemURL",
  "openDatabase", "TEMPORARY", "PERSISTENT", "constructor",

  // Additional, manually added symbols.

  // We're going to need 'arguments'
  "arguments",

  // This is how we do imports and exports
  "Package",

  // Meteor provides these at runtime
  "Npm", "__meteor_runtime_config__", "__meteor_bootstrap__",

  // A node-ism (and needed by the 'meteor' package to read the
  // environment to bootstrap __meteor_runtime_config__, though
  // probably we should find a better way to do that)
  "process",

  // Another node global
  "Buffer",

  // These are used by sockjs. (XXX before this
  // goes out the door, it needs to switch to detecting assignment
  // rather than using a blacklist, or at the very very least it needs
  // to have a blacklist that includes all the major browsers.)
  "ActiveXObject", "CollectGarbage", "XDomainRequest"
];

var blacklist = {}
_.each(blacklistedSymbols, function (name) {
  blacklist[name] = true;
});

var linker = module.exports = {
  prelink: prelink,
  link: link
};
