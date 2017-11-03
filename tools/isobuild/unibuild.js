"use strict";

import _ from "underscore";
import files from "../fs/files.js";
import { WatchSet } from "../fs/watch.js";

let nextBuildId = 1;

export class Unibuild {
  constructor(isopack, {
    kind, // required (main/plugin/app)
    arch, // required
    uses,
    implies,
    watchSet,
    nodeModulesDirectories,
    declaredExports,
    resources,
  }) {
    this.pkg = isopack;
    this.kind = kind;
    this.arch = arch;
    this.uses = uses;
    this.implies = implies || [];

    // This WatchSet will end up having the watch items from the
    // SourceArch (such as package.js or .meteor/packages), plus all of
    // the actual source files for the unibuild (including items that we
    // looked at to find the source files, such as directories we
    // scanned).
    this.watchSet = watchSet || new WatchSet();

    // Each Unibuild is given a unique id when it's loaded (it is not
    // saved to disk). This is just a convenience to make it easier to
    // keep track of Unibuilds in a map; it's used by bundler and
    // compiler. We put some human readable info in here too to make
    // debugging easier.
    this.id = this.pkg.name + "." + this.kind + "@" + this.arch + "#" +
      (nextBuildId ++);

    // 'declaredExports' are the variables which are exported from this
    // package.  A list of objects with keys 'name' (required) and
    // 'testOnly' (boolean, defaults to false).
    this.declaredExports = declaredExports;

    // All of the data provided for eventual inclusion in the bundle,
    // other than JavaScript that still needs to be fed through the final
    // link stage. A list of objects with these keys:
    //
    // type: "source", "head", "body", "asset". (resources produced by
    // legacy source handlers can also be "js" or "css".
    //
    // data: The contents of this resource, as a Buffer. For example, for
    // "head", the data to insert in <head>; for "js", the JavaScript
    // source code (which may be subject to further processing such as
    // minification); for "asset", the contents of a static resource such
    // as an image.
    //
    // servePath: The (absolute) path at which the resource would prefer
    // to be served. Interpretation varies by type. For example, always
    // honored for "asset", ignored for "head" and "body", sometimes
    // honored for CSS but ignored if we are concatenating.
    //
    // sourceMap: Allowed only for "js". If present, a string.
    //
    // fileOptions: for "source", the options passed to `api.addFiles`.
    // plugin-specific.
    //
    // extension: for "source", the file extension that this matched
    // against at build time. null if matched against a specific filename.
    this.resources = resources;

    // Map from absolute paths of node_modules directories to
    // NodeModulesDirectory objects.
    this.nodeModulesDirectories = nodeModulesDirectories;

    // Provided for backwards compatibility; please use
    // unibuild.nodeModulesDirectories instead!
    _.some(this.nodeModulesDirectories, (nmd, nodeModulesPath) => {
      if (! nmd.local) {
        this.nodeModulesPath = nodeModulesPath;
        return true;
      }
    });
  }
}
