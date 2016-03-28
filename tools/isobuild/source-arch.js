import {isString, isFunction} from 'underscore';
import {WatchSet} from '../fs/watch.js';

function reportMissingOption(name) {
  throw new Error(`must provide options.${name} when creating SourceArch`);
}

/**
 * SourceArch
 *
 * Used in ./package-source.js.
 */
export default class SourceArch {
  constructor(pkg, {
    kind, // required
    arch, // required
    sourceRoot, // required
    getFiles, // required
    uses = [],
    implies = [],
    declaredExports = null,
    // Do not include the source files in watchSet. They will be added at
    // compile time when the sources are actually read.
    watchSet = new WatchSet(),
  }) {
    isString(kind) || reportMissingOption('kind');
    isString(arch) || reportMissingOption('arch');
    isString(sourceRoot) || reportMissingOption('sourceRoot');
    isFunction(getFiles) || reportMissingOption('getFiles');

    this.pkg = pkg;

    // Kind of this sourceArchitecture. At the moment, there are really
    // three options -- package, plugin, and app. We use these in linking.
    this.kind = kind;

    // The architecture (fully or partially qualified) that can use this
    // unibuild.
    this.arch = arch;

    // Absolute path of the root directory of this package or application.
    this.sourceRoot = sourceRoot;

    // Packages used. The ordering is significant only for determining
    // import symbol priority (it doesn't affect load order), and a given
    // package could appear more than once in the list, so code that
    // consumes this value will need to guard appropriately. Each element
    // in the array has keys:
    // - package: the package name
    // - constraint: the constraint on the version of the package to use,
    //   as a string (may be null)
    // - unordered: If true, we don't want the package's imports and we
    //   don't want to force the package to load before us. We just want
    //   to ensure that it loads if we load.
    // - weak: If true, we don't *need* to load the other package, but
    //   if the other package ends up loaded in the target, it must
    //   be forced to load before us. We will not get its imports
    //   or plugins.
    // It is an error for both unordered and weak to be true, because such
    // a dependency would have no effect.
    //
    // In most places, instead of using 'uses' directly, you want to use
    // something like compiler.eachUsedUnibuild so you also take into
    // account implied packages.
    //
    // Note that if `package` starts with 'isobuild:', it actually
    // represents a dependency on a feature of the Isobuild build tool,
    // not a real package. You need to be aware of this when processing a
    // `uses` array, which is another reason to use eachUsedUnibuild
    // instead.
    this.uses = uses;

    // Packages which are "implied" by using this package. If a unibuild X
    // uses this unibuild Y, and Y implies Z, then X will effectively use
    // Z as well (and get its imports and plugins).  An array of objects
    // of the same type as the elements of this.uses (although for now
    // unordered and weak are not allowed).
    this.implies = implies;

    // A function that returns the source files for this
    // architecture. Object with keys `sources` and `assets`, where each
    // is an array of objects with keys "relPath" and "fileOptions". Null
    // if loaded from isopack.
    //
    // fileOptions is optional and represents arbitrary options passed to
    // "api.addFiles"; they are made available on to the plugin as
    // compileStep.fileOptions.
    //
    // This is a function rather than a literal array because for an app,
    // we need to know the file extensions registered by the plugins in
    // order to compute the sources list, so we have to wait until build
    // time (after we have loaded any plugins, including local plugins in
    // this package) to compute this.
    this.getFiles = getFiles;

    // Object whose keys are relative paths of local node_modules
    // directories in this package or application, for the given
    // architecture. Does not include the .npm/package/node_modules
    // directory installed by Npm.depends. Should be populated when
    // getFiles is called.
    this.localNodeModulesDirs = Object.create(null);

    // Symbols that this architecture should export. List of symbols (as
    // strings).
    this.declaredExports = declaredExports;

    // Files and directories that we want to monitor for changes in
    // development mode, as a watch.WatchSet. In the latest refactoring of
    // the code, this does not include source files or directories, but
    // only control files such as package.js and .meteor/packages, since
    // the rest are not determined until compile time.
    this.watchSet = watchSet;
  }
}
