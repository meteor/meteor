"use strict";

import _ from "underscore";
import files from "../fs/files";
import { WatchSet, sha1 } from "../fs/watch";
import { NodeModulesDirectory } from "./bundler.js";
import * as archinfo from "../utils/archinfo";
import { SourceResource } from './compiler';

function rejectBadPath(p) {
  if (p.indexOf("..") >= 0) {
    throw new Error("bad path: " + p);
  }
}

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

  static async fromJSON(unibuildJson, {
    isopack,
    // At some point we stopped writing 'kind's to the metadata file, so
    // default to main.
    kind = "main",
    arch,
    unibuildBasePath,
    watchSet,
  }) {
    if (unibuildJson.format !== "unipackage-unibuild-pre1" &&
        unibuildJson.format !== "isopack-2-unibuild") {
      throw new Error("Unsupported isopack unibuild format: " +
                      JSON.stringify(unibuildJson.format));
    }

    // Is this unibuild the legacy pre-"compiler plugin" format which contains
    // "prelink" resources of pre-processed JS files (as well as the
    // "packageVariables" field) instead of individual "source" resources (and
    // a "declaredExports" field)?
    const unibuildHasPrelink =
      unibuildJson.format === "unipackage-unibuild-pre1";

    const resources = [];

    _.each(unibuildJson.resources, function (resource) {
      rejectBadPath(resource.file);

      const data = files.readBufferWithLengthAndOffset(
        files.pathJoin(unibuildBasePath, resource.file),
        resource.length,
        resource.offset,
      );

      if (resource.type === "prelink") {
        if (! unibuildHasPrelink) {
          throw Error("Unexpected prelink resource in " +
                      unibuildJson.format + " at " + unibuildBasePath);
        }

        // We found a "prelink" resource, because we're processing a package
        // published with an older version of Meteor which did not create
        // isopack-2 isopacks and which always preprocessed and linked all JS
        // files instead of leaving that until bundle time.  Let's pretend it
        // was just a single js source file, but leave a "legacyPrelink" field
        // on it so we can not re-link that part (and not re-analyze for
        // assigned variables).
        const prelinkResource = {
          type: "source",
          extension: "js",
          data: data,
          path: resource.servePath,
          // It's a shame to have to calculate the hash here instead of having
          // it on disk, but this only runs for legacy packages anyway.
          hash: sha1(data),
          // Legacy prelink files definitely don't have a source processor!
          // They were created by an Isobuild that didn't even know about
          // source processors!
          usesDefaultSourceProcessor: true,
          legacyPrelink: {
            packageVariables: unibuildJson.packageVariables || []
          },
          // Only published packages still use prelink resources,
          // so there is no need to mark this file to be watched
          _dataUsed: false
        };

        if (resource.sourceMap) {
          rejectBadPath(resource.sourceMap);
          prelinkResource.legacyPrelink.sourceMap = files.readFile(
            files.pathJoin(unibuildBasePath, resource.sourceMap), 'utf8');
        }

        resources.push(prelinkResource);

      } else if (resource.type === "source") {
        resources.push(new SourceResource({
          extension: resource.extension,
          usesDefaultSourceProcessor:
          !! resource.usesDefaultSourceProcessor,
          data: data,
          path: resource.path,
          hash: resource.hash,
          fileOptions: resource.fileOptions
        }));
      } else if (["head", "body", "css", "js", "asset"].includes(resource.type)) {
        resources.push({
          type: resource.type,
          data: data,
          servePath: resource.servePath || undefined,
          path: resource.path || undefined
        });

      } else {
        throw new Error("bad resource type in isopack: " +
                        JSON.stringify(resource.type));
      }
    });

    let declaredExports = unibuildJson.declaredExports || [];

    if (unibuildHasPrelink) {
      // Legacy unibuild; it stores packageVariables and says some of them
      // are exports.
      declaredExports = [];

      _.each(unibuildJson.packageVariables, function (pv) {
        if (pv.export) {
          declaredExports.push({
            name: pv.name,
            testOnly: pv.export === "tests",
          });
        }
      });
    }

    const nodeModulesDirectories =
      await NodeModulesDirectory.readDirsFromJSON(unibuildJson.node_modules, {
        packageName: isopack.name,
        sourceRoot: unibuildBasePath,
        // Rebuild binary npm packages if unibuild arch matches host arch.
        rebuildBinaries: archinfo.matches(archinfo.host(), arch)
      });

    return new this(isopack, {
      kind,
      arch,
      uses: unibuildJson.uses,
      implies: unibuildJson.implies,
      watchSet,
      nodeModulesDirectories,
      declaredExports: declaredExports,
      resources: resources,
    });
  }

  async toJSON({
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
    for (const nmd of Object.values(unibuild.nodeModulesDirectories)) {
      const bundlePath = _.has(npmDirsToCopy, nmd.sourcePath)
          // We already have this npm directory from another unibuild.
          ? npmDirsToCopy[nmd.sourcePath]
          : npmDirsToCopy[nmd.sourcePath] =
              nmd.getPreferredBundlePath("isopack");
      node_modules[bundlePath] = await nmd.toJSON();
    }

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
      if (["head", "body"].includes(resource.type)) {
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

    for (const [type, parts] of Object.entries(concat)) {
      if (parts.length) {
        await builder.write(files.pathJoin(unibuildDir, type), {
          data: Buffer.concat(concat[type], offset[type])
        });
      }
    }

    // Output other resources each to their own file
    for (const resource of unibuild.resources) {
      if (["head", "body"].includes(resource.type)) {
        // already did this one
        continue;
      }

      let data;
      if (resource.type === 'source') {
        data = resource.legacyPrelink ? resource.data : resource._data;
      } else {
        data = resource.data;
      }

      const generatedFilename =
          await builder.writeToGeneratedFilename(
              files.pathJoin(
                  unibuildDir,
                  resource.servePath || resource.path,
              ),
              { data }
          );

      if (! usesModules &&
          resource.fileOptions &&
          resource.fileOptions.lazy) {
        // Omit lazy resources from the unibuild JSON file, but only after
        // they are copied into the bundle (immediately above).
        continue;
      }

      unibuildJson.resources.push({
        type: resource.type,
        extension: resource.extension,
        file: generatedFilename,
        length: data.length,
        offset: 0,
        usesDefaultSourceProcessor:
            resource.usesDefaultSourceProcessor || undefined,
        servePath: resource.servePath || undefined,
        path: resource.path || undefined,
        hash: resource._hash || resource.hash || undefined,
        fileOptions: resource.fileOptions || undefined
      });
    }

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
