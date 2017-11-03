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

  toJSON({
    builder,
    unibuildDir,
    usesModules,
    npmDirsToCopy,
  }) {
    const unibuild = this;
    const unibuildJson = {
      format: "isopack-2-unibuild",
      declaredExports: unibuild.declaredExports,
      uses: _.map(unibuild.uses, u => ({
        'package': u.package,
        // For cosmetic value, leave false values for these options out of
        // the JSON file.
        constraint: u.constraint || undefined,
        unordered: u.unordered || undefined,
        weak: u.weak || undefined,
      })),
      implies: (_.isEmpty(unibuild.implies) ? undefined : unibuild.implies),
      resources: [],
    };

    // Figure out where the npm dependencies go.
    let node_modules = {};
    _.each(unibuild.nodeModulesDirectories, nmd => {
      const bundlePath = _.has(npmDirsToCopy, nmd.sourcePath)
      // We already have this npm directory from another unibuild.
        ? npmDirsToCopy[nmd.sourcePath]
        : npmDirsToCopy[nmd.sourcePath] = builder.generateFilename(
          nmd.getPreferredBundlePath("isopack"),
          { directory: true }
        );
      node_modules[bundlePath] = nmd.toJSON();
    });

    const preferredPaths = Object.keys(node_modules);
    if (preferredPaths.length === 1) {
      // For backwards compatibility, if there's only one node_modules
      // directory, store it as a single string.
      node_modules = preferredPaths[0];
    }

    if (preferredPaths.length > 0) {
      // If there are no node_modules directories, don't confuse older
      // versions of Meteor by storing an empty object.
      unibuildJson.node_modules = node_modules;
    }

    // Output 'head', 'body' resources nicely
    const concat = { head: [], body: [] };
    const offset = { head: 0, body: 0 };

    _.each(unibuild.resources, function (resource) {
      if (_.contains(["head", "body"], resource.type)) {
        if (concat[resource.type].length) {
          concat[resource.type].push(Buffer.from("\n", "utf8"));
          offset[resource.type]++;
        }
        if (! (resource.data instanceof Buffer)) {
          throw new Error("Resource data must be a Buffer");
        }

        if (! usesModules &&
            resource.fileOptions &&
            resource.fileOptions.lazy) {
          // Omit lazy resources from the unibuild JSON file.
          return;
        }

        unibuildJson.resources.push({
          type: resource.type,
          file: files.pathJoin(unibuildDir, resource.type),
          length: resource.data.length,
          offset: offset[resource.type]
        });

        concat[resource.type].push(resource.data);
        offset[resource.type] += resource.data.length;
      }
    });

    _.each(concat, function (parts, type) {
      if (parts.length) {
        builder.write(files.pathJoin(unibuildDir, type), {
          data: Buffer.concat(concat[type], offset[type])
        });
      }
    });

    // Output other resources each to their own file
    _.each(unibuild.resources, function (resource) {
      if (_.contains(["head", "body"], resource.type)) {
        // already did this one
        return;
      }

      const generatedFilename =
        builder.writeToGeneratedFilename(
          files.pathJoin(
            unibuildDir,
            resource.servePath || resource.path,
          ),
          { data: resource.data }
        );

      if (! usesModules &&
          resource.fileOptions &&
          resource.fileOptions.lazy) {
        // Omit lazy resources from the unibuild JSON file, but only after
        // they are copied into the bundle (immediately above).
        return;
      }

      unibuildJson.resources.push({
        type: resource.type,
        extension: resource.extension,
        file: generatedFilename,
        length: resource.data.length,
        offset: 0,
        usesDefaultSourceProcessor:
          resource.usesDefaultSourceProcessor || undefined,
        servePath: resource.servePath || undefined,
        path: resource.path || undefined,
        hash: resource.hash || undefined,
        fileOptions: resource.fileOptions || undefined
      });
    });

    return unibuildJson;
  }

  getLegacyJsResources() {
    const legacyJsResources = [];

    this.resources.forEach(resource => {
      if (resource.type === "source" &&
          resource.extension === "js") {
        legacyJsResources.push({
          data: resource.data,
          hash: resource.hash,
          servePath: this.pkg._getServePath(resource.path),
          bare: resource.fileOptions && resource.fileOptions.bare,
          sourceMap: resource.sourceMap,
          // If this file was actually read from a legacy isopack and is
          // itself prelinked, this will be an object with some metadata
          // about it, and we can skip re-running prelink later.
          legacyPrelink: resource.legacyPrelink
        });
      }
    });

    return legacyJsResources;
  }
}
