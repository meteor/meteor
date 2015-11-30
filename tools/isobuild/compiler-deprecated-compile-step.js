// This file contains an old definition of CompileStep, an object that is passed
// to the package-provided file handler.
// Since then, the newer API called "Batch Plugins" have replaced it but we keep
// the functionality for the backwards-compitability.
// @deprecated
// XXX COMPAT WITH 1.1.0.2

var _ = require('underscore');

var archinfo = require('../utils/archinfo.js');
var buildmessage = require('../utils/buildmessage.js');
var files = require('../fs/files.js');
var colonConverter = require('../utils/colon-converter.js');
var watch = require('../fs/watch.js');

var convertSourceMapPaths = function (sourcemap, f) {
  if (! sourcemap) {
    // Don't try to convert it if it doesn't exist
    return sourcemap;
  }

  var srcmap = JSON.parse(sourcemap);
  srcmap.sources = _.map(srcmap.sources, f);
  return JSON.stringify(srcmap);
};

exports.makeCompileStep = function (sourceItem, file, inputSourceArch, options) {
  var resources = options.resources;
  var addAsset = options.addAsset;

  var relPath = sourceItem.relPath;
  var fileOptions = _.clone(sourceItem.fileOptions) || {};
  var absPath = files.pathResolve(inputSourceArch.pkg.sourceRoot, relPath);
  var filename = files.pathBasename(relPath);
  var hash = file.hash;
  var contents = file.contents;

  // This object is called a #CompileStep and it's the interface
  // to plugins that define new source file handlers (eg,
  // Coffeescript).
  //
  // Fields on CompileStep:
  //
  // - arch: the architecture for which we are building
  // - inputSize: total number of bytes in the input file
  // - inputPath: the filename and (relative) path of the input
  //   file, eg, "foo.js". We don't provide a way to get the full
  //   path because you're not supposed to read the file directly
  //   off of disk. Instead you should call read(). That way we
  //   can ensure that the version of the file that you use is
  //   exactly the one that is recorded in the dependency
  //   information.
  // - pathForSourceMap: If this file is to be included in a source map,
  //   this is the name you should use for it in the map.
  // - rootOutputPath: on web targets, for resources such as
  //   stylesheet and static assets, this is the root URL that
  //   will get prepended to the paths you pick for your output
  //   files so that you get your own namespace, for example
  //   '/packages/foo'. null on non-web targets
  // - fileOptions: any options passed to "api.addFiles"; for
  //   use by the plugin. The built-in "js" plugin uses the "bare"
  //   option for files that shouldn't be wrapped in a closure.
  // - declaredExports: An array of symbols exported by this unibuild, or null
  //   if it may not export any symbols (eg, test unibuilds). This is used by
  //   CoffeeScript to ensure that it doesn't close over those symbols, eg.
  // - read(n): read from the input file. If n is given it should
  //   be an integer, and you will receive the next n bytes of the
  //   file as a Buffer. If n is omitted you get the rest of the
  //   file.
  // - appendDocument({ section: "head", data: "my markup" })
  //   Browser targets only. Add markup to the "head" or "body"
  //   Web targets only. Add markup to the "head" or "body"
  //   section of the document.
  // - addStylesheet({ path: "my/stylesheet.css", data: "my css",
  //                   sourceMap: "stringified json sourcemap"})
  //   Web targets only. Add a stylesheet to the
  //   document. 'path' is a requested URL for the stylesheet that
  //   may or may not ultimately be honored. (Meteor will add
  //   appropriate tags to cause the stylesheet to be loaded. It
  //   will be subject to any stylesheet processing stages in
  //   effect, such as minification.)
  // - addJavaScript({ path: "my/program.js", data: "my code",
  //                   sourcePath: "src/my/program.js",
  //                   bare: true })
  //   Add JavaScript code, which will be namespaced into this
  //   package's environment (eg, it will see only the exports of
  //   this package's imports), and which will be subject to
  //   minification and so forth. Again, 'path' is merely a hint
  //   that may or may not be honored. 'sourcePath' is the path
  //   that will be used in any error messages generated (eg,
  //   "foo.js:4:1: syntax error"). It must be present and should
  //   be relative to the project root. Typically 'inputPath' will
  //   do handsomely. "bare" means to not wrap the file in
  //   a closure, so that its vars are shared with other files
  //   in the module.
  // - addAsset({ path: "my/image.png", data: Buffer })
  //   Add a file to serve as-is over HTTP (web targets) or
  //   to include as-is in the bundle (os targets).
  //   This time `data` is a Buffer rather than a string. For
  //   web targets, it will be served at the exact path you
  //   request (concatenated with rootOutputPath). For server
  //   targets, the file can be retrieved by passing path to
  //   Assets.getText or Assets.getBinary.
  // - error({ message: "There's a problem in your source file",
  //           sourcePath: "src/my/program.ext", line: 12,
  //           column: 20, func: "doStuff" })
  //   Flag an error -- at a particular location in a source
  //   file, if you like (you can even indicate a function name
  //   to show in the error, like in stack traces). sourcePath,
  //   line, column, and func are all optional.
  //
  // XXX for now, these handlers must only generate portable code
  // (code that isn't dependent on the arch, other than 'web'
  // vs 'os') -- they can look at the arch that is provided
  // but they can't rely on the running on that particular arch
  // (in the end, an arch-specific unibuild will be emitted only if
  // there are native node modules). Obviously this should
  // change. A first step would be a setOutputArch() function
  // analogous to what we do with native node modules, but maybe
  // what we want is the ability to ask the plugin ahead of time
  // how specific it would like to force unibuilds to be.
  //
  // XXX we handle encodings in a rather cavalier way and I
  // suspect we effectively end up assuming utf8. We can do better
  // than that!
  //
  // XXX addAsset probably wants to be able to set MIME type and
  // also control any manifest field we deem relevant (if any)
  //
  // XXX Some handlers process languages that have the concept of
  // include files. These are problematic because we need to
  // somehow instrument them to get the names and hashs of all of
  // the files that they read for dependency tracking purposes. We
  // don't have an API for that yet, so for now we provide a
  // workaround, which is that _fullInputPath contains the full
  // absolute path to the input files, which allows such a plugin
  // to set up its include search path. It's then on its own for
  // registering dependencies (for now..)
  //
  // XXX in the future we should give plugins an easy and clean
  // way to return errors (that could go in an overall list of
  // errors experienced across all files)
  var readOffset = 0;

  /**
   * The comments for this class aren't used to generate docs right now.
   * The docs live in the GitHub Wiki at: https://github.com/meteor/meteor/wiki/CompileStep-API-for-Build-Plugin-Source-Handlers
   * @class CompileStep
   * @summary The object passed into Plugin.registerSourceHandler
   * @global
   */
  var compileStep = {

    /**
     * @summary The total number of bytes in the input file.
     * @memberOf CompileStep
     * @instance
     * @type {Integer}
     */
    inputSize: contents.length,

    /**
     * @summary The filename and relative path of the input file.
     * Please don't use this filename to read the file from disk, instead
     * use [compileStep.read](CompileStep-read).
     * @type {String}
     * @instance
     * @memberOf CompileStep
     */
    inputPath: files.convertToOSPath(relPath, true),

    /**
     * @summary The filename and absolute path of the input file.
     * Please don't use this filename to read the file from disk, instead
     * use [compileStep.read](CompileStep-read).
     * @type {String}
     * @instance
     * @memberOf CompileStep
     */
    fullInputPath: files.convertToOSPath(absPath),

    // The below is used in the less and stylus packages... so it should be
    // public API.
    _fullInputPath: files.convertToOSPath(absPath), // avoid, see above..

    // Used for one optimization. Don't rely on this otherwise.
    _hash: hash,

    // XXX duplicates _pathForSourceMap() in linker
    /**
     * @summary If you are generating a sourcemap for the compiled file, use
     * this path for the original file in the sourcemap.
     * @type {String}
     * @memberOf CompileStep
     * @instance
     */
    pathForSourceMap: files.convertToOSPath(
      inputSourceArch.pkg.name ?  inputSourceArch.pkg.name + "/" + relPath :
                                  files.pathBasename(relPath), true),

    // null if this is an app. intended to be used for the sources
    // dictionary for source maps.
    /**
     * @summary The name of the package in which the file being built exists.
     * @type {String}
     * @memberOf CompileStep
     * @instance
     */
    packageName: inputSourceArch.pkg.name,

    /**
     * @summary On web targets, this will be the root URL prepended
     * to the paths you pick for your output files. For example,
     * it could be "/packages/my-package".
     * @type {String}
     * @memberOf CompileStep
     * @instance
     */
    rootOutputPath: files.convertToOSPath(
      inputSourceArch.pkg.serveRoot, true),

    /**
     * @summary The architecture for which we are building. Can be "os",
     * "web.browser", or "web.cordova".
     * @type {String}
     * @memberOf CompileStep
     * @instance
     */
    arch: inputSourceArch.arch,

    /**
     * @deprecated in 0.9.4
     * This is a duplicate API of the above, we don't need it.
     */
    archMatches: function (pattern) {
      return archinfo.matches(inputSourceArch.arch, pattern);
    },

    /**
     * @summary Any options passed to "api.addFiles".
     * @type {Object}
     * @memberOf CompileStep
     * @instance
     */
    fileOptions: fileOptions,

    /**
     * @summary The list of exports that the current package has defined.
     * Can be used to treat those symbols differently during compilation.
     * @type {Object}
     * @memberOf CompileStep
     * @instance
     */
    declaredExports: _.pluck(inputSourceArch.declaredExports, 'name'),

    /**
     * @summary Read from the input file. If `n` is specified, returns the
     * next `n` bytes of the file as a Buffer. XXX not sure if this actually
     * returns a String sometimes...
     * @param  {Integer} [n] The number of bytes to return.
     * @instance
     * @memberOf CompileStep
     * @returns {Buffer}
     */
    read: function (n) {
      if (n === undefined || readOffset + n > contents.length) {
        n = contents.length - readOffset;
      }
      var ret = contents.slice(readOffset, readOffset + n);
      readOffset += n;
      return ret;
    },

    /**
     * @summary Works in web targets only. Add markup to the `head` or `body`
     * section of the document.
     * @param  {Object} options
     * @param {String} options.section Which section of the document should
     * be appended to. Can only be "head" or "body".
     * @param {String} options.data The content to append.
     * @memberOf CompileStep
     * @instance
     */
    addHtml: function (options) {
      if (! archinfo.matches(inputSourceArch.arch, "web")) {
        throw new Error("Document sections can only be emitted to " +
                        "web targets");
      }
      if (options.section !== "head" && options.section !== "body") {
        throw new Error("'section' must be 'head' or 'body'");
      }
      if (typeof options.data !== "string") {
        throw new Error("'data' option to appendDocument must be a string");
      }
      resources.push({
        type: options.section,
        data: new Buffer(files.convertToStandardLineEndings(options.data), 'utf8')
      });
    },

    /**
     * @deprecated in 0.9.4
     */
    appendDocument: function (options) {
      this.addHtml(options);
    },

    /**
     * @summary Web targets only. Add a stylesheet to the document.
     * @param {Object} options
     * @param {String} path The requested path for the added CSS, may not be
     * satisfied if there are path conflicts.
     * @param {String} data The content of the stylesheet that should be
     * added.
     * @param {String} sourceMap A stringified JSON sourcemap, in case the
     * stylesheet was generated from a different file.
     * @memberOf CompileStep
     * @instance
     */
    addStylesheet: function (options) {
      if (! archinfo.matches(inputSourceArch.arch, "web")) {
        throw new Error("Stylesheets can only be emitted to " +
                        "web targets");
      }
      if (typeof options.data !== "string") {
        throw new Error("'data' option to addStylesheet must be a string");
      }
      resources.push({
        type: "css",
        refreshable: true,
        data: new Buffer(files.convertToStandardLineEndings(options.data), 'utf8'),
        servePath: colonConverter.convert(
          files.pathJoin(
            inputSourceArch.pkg.serveRoot,
            files.convertToStandardPath(options.path, true))),
        sourceMap: convertSourceMapPaths(options.sourceMap,
                                         files.convertToStandardPath)
      });
    },

    /**
     * @summary Add JavaScript code. The code added will only see the
     * namespaces imported by this package as runtime dependencies using
     * ['api.use'](#PackageAPI-use). If the file being compiled was added
     * with the bare flag, the resulting JavaScript won't be wrapped in a
     * closure.
     * @param {Object} options
     * @param {String} options.path The path at which the JavaScript file
     * should be inserted, may not be honored in case of path conflicts.
     * @param {String} options.data The code to be added.
     * @param {String} options.sourcePath The path that will be used in
     * any error messages generated by this file, e.g. `foo.js:4:1: error`.
     * @memberOf CompileStep
     * @instance
     */
    addJavaScript: function (options) {
      if (typeof options.data !== "string") {
        throw new Error("'data' option to addJavaScript must be a string");
      }
      if (typeof options.sourcePath !== "string") {
        throw new Error("'sourcePath' option must be supplied to addJavaScript. Consider passing inputPath.");
      }

      // By default, use fileOptions for the `bare` option but also allow
      // overriding it with the options
      var bare = fileOptions.bare;
      if (options.hasOwnProperty("bare")) {
        bare = options.bare;
      }

      var data = new Buffer(
        files.convertToStandardLineEndings(options.data), 'utf8');
      resources.push({
        type: "js",
        data: data,
        // XXX Weirdly, we now ignore sourcePath even though we required
        //     it before. We used to use it as the source path in source map
        //     generated in linker. We now use the servePath for that, as of
        //     b556e622. Not sure this is actually correct...
        servePath: colonConverter.convert(
          files.pathJoin(
            inputSourceArch.pkg.serveRoot,
            files.convertToStandardPath(options.path, true))),
        hash: watch.sha1(data),
        sourceMap: convertSourceMapPaths(options.sourceMap,
                                         files.convertToStandardPath),
        bare: !! bare
      });
    },

    /**
     * @summary Add a file to serve as-is to the browser or to include on
     * the browser, depending on the target. On the web, it will be served
     * at the exact path requested. For server targets, it can be retrieved
     * using `Assets.getText` or `Assets.getBinary`.
     * @param {Object} options
     * @param {String} path The path at which to serve the asset.
     * @param {Buffer|String} data The data that should be placed in
     * the file.
     * @memberOf CompileStep
     * @instance
     */
    addAsset: function (options) {
      if (! (options.data instanceof Buffer)) {
        if (_.isString(options.data)) {
          options.data = new Buffer(options.data);
        } else {
          throw new Error("'data' option to addAsset must be a Buffer or String.");
        }
      }

      addAsset(options.data, files.convertToStandardPath(options.path, true));
    },

    /**
     * @summary Display a build error.
     * @param  {Object} options
     * @param {String} message The error message to display.
     * @param {String} [sourcePath] The path to display in the error message.
     * @param {Integer} line The line number to display in the error message.
     * @param {String} func The function name to display in the error message.
     * @memberOf CompileStep
     * @instance
     */
    error: function (options) {
      buildmessage.error(options.message || ("error building " + relPath), {
        file: options.sourcePath,
        line: options.line ? options.line : undefined,
        column: options.column ? options.column : undefined,
        func: options.func ? options.func : undefined
      });
    }
  };

  return compileStep;
};
