// XXX #3006: Most of this file is being refactored into
// project-context.js. Finish the job.

  // // Print out the changest hat we have made in the versions files.
  // //
  // // return 0 if everything went well, or 1 if we failed in some way.
  // showPackageChanges : function (versions, newVersions, options) {
  //   var self = this;
  //   // options.onDiskPackages

  //   // Don't tell the user what all the operations were until we finish -- we
  //   // don't want to give a false sense of completeness until everything is
  //   // written to disk.
  //   var messageLog = [];
  //   var failed = false;
  //   var stdSpace = "   ";
  //   // Remove the versions that don't exist
  //   var removed = _.difference(_.keys(versions), _.keys(newVersions));
  //   _.each(removed, function(packageName) {
  //     messageLog.push(stdSpace + "removed " + packageName + " from project");
  //   });

  //   _.each(newVersions, function(version, packageName) {
  //     if (failed)
  //       return;

  //     if (_.has(versions, packageName) &&
  //         versions[packageName] === version) {
  //       // Nothing changed. Skip this.
  //       return;
  //     }

  //     if (options.onDiskPackages &&
  //         (! options.onDiskPackages[packageName] ||
  //          options.onDiskPackages[packageName] !== version)) {
  //       // XXX maybe we shouldn't be letting the constraint solver choose
  //       // things that don't have the right arches?
  //       Console.warn("Package " + packageName +
  //                            " has no compatible build for version " +
  //                            version);
  //       failed = true;
  //       return;
  //     }

  //     // If the previous versions file had this, then we are upgrading, if it did
  //     // not, then we must be adding this package anew.
  //     if (_.has(versions, packageName)) {
  //       if (packageVersionParser.lessThan(
  //         newVersions[packageName], versions[packageName])) {
  //         messageLog.push(stdSpace + "downgraded " + packageName + " from version " +
  //                         versions[packageName] +
  //                         " to version " + newVersions[packageName]);
  //       } else {
  //         messageLog.push(stdSpace + "upgraded " + packageName + " from version " +
  //                         versions[packageName] +
  //                         " to version " + newVersions[packageName]);
  //       }
  //     } else {
  //       messageLog.push(stdSpace + "added " + packageName +
  //                       " at version " + newVersions[packageName]);
  //     };
  //   });

  //   if (failed)
  //     return 1;

  //   // Show the user the messageLog of packages we added.
  //   if ((!self.muted && !_.isEmpty(versions))
  //       || options.alwaysShow) {
  //     _.each(messageLog, function (msg) {
  //       Console.info(msg);
  //     });

  //     // Pay special attention to non-backwards-compatible changes.
  //     var incompatibleUpdates = [];
  //     _.each(self.constraints, function (constraint, package) {
  //       var oldV = versions[package];
  //       var newV = newVersions[package];
  //       // Did we not actually have a version before? We don't care.
  //       if (!oldV) {
  //         return;
  //       }
  //       // If this is a local package, then we are aware that this happened and it
  //       // is not news.
  //       if (catalog.complete.isLocalPackage(package)) {
  //         return;
  //       }
  //       // If we can't find the old version, then maybe that was a local package and
  //       // now is not, and that is also not news.
  //       var oldVersion = catalog.complete.getVersion(package, oldV);
  //       var newRec = catalog.complete.getVersion(package, newV);

  //       // The new version has to exist, or we wouldn't have chosen it.
  //       if (!oldVersion) {
  //         return;
  //       }
  //       var oldMajorVersion = packageVersionParser.majorVersion(oldV);
  //       var newMajorVersion = packageVersionParser.majorVersion(newV);
  //       if (oldMajorVersion !== newMajorVersion) {
  //         incompatibleUpdates.push({
  //           name: package,
  //           description: "(" + oldV + "->" + newV + ") " + newRec.description
  //         });
  //       }
  //     });

  //     if (!_.isEmpty(incompatibleUpdates)) {
  //       Console.warn(
  //         "\nThe following packages have been updated to new versions that are not " +
  //           "backwards compatible:");
  //       utils.printPackageList(incompatibleUpdates, { level: Console.LEVEL_WARN });
  //       Console.warn("\n");
  //     };
  //   }
  //   return 0;
  // },

  // // Modifications

  // // Shortcut to add a package to a project's packages file.
  // //
  // // Takes in an array of package names and an operation (either 'add' or
  // // 'remove') Writes the new information into the .meteor/packages file, adds
  // // it to the set of constraints, and invalidates the pre-computed
  // // packageLoader & versions files. They will be recomputed next time we ask
  // // for them.
  // //
  // // THIS AVOIDS THE NORMAL SAFETY CHECKS OF METEOR ADD.
  // //
  // // In fact, we use this specifically in circumstances when we may want to
  // // circumvent those checks -- either we are using a temporary app where
  // // failure to deal with all packages will have no long-lasting reprecussions
  // // (testing) or we are running an upgrader that intends to break the build.
  // //
  // // XXX: I don't like that this exists, but I like being explicit about what
  // // upgraders do: they force a remove or add of a package, perhaps without
  // // asking permission or running constraint solvers. If we are willing to kill
  // // those upgraders, I would love to remove it.
  // forceEditPackages : function (names, operation) {
  //   var self = this;

  //   var appConstraintFile = self._getConstraintFile();
  //   var lines = files.getLinesOrEmpty(appConstraintFile);
  //   if (operation === "add") {
  //     _.each(names, function (name) {
  //       // XXX This assumes that the file hasn't been edited since we lasted
  //       // loaded it into self.
  //       if (_.contains(self.constraints, name))
  //         return;
  //       if (!self.constraints.length && lines.length)
  //         lines.push('');
  //       lines.push(name);
  //       self.constraints[name] = null;
  //     });
  //     fs.writeFileSync(appConstraintFile,
  //                      lines.join('\n') + '\n', 'utf8');
  //   } else if (operation == "remove") {
  //     self._removePackageRecords(names);
  //   }

  //   // Any derived values need to be invalidated.
  //   self._depsUpToDate = false;
  // },

  // // Edits the internal and external package records: .meteor/packages and
  // // self.constraints to remove the packages in a given list of package
  // // names. Does not rewrite the versions file.
  // _removePackageRecords : function (names) {
  //   var self = this;

  //   // Compute the new set of packages by removing all the names from the list
  //   // of constraints.
  //   _.each(names, function (name) {
  //     delete self.constraints[name];
  //   });

  //   // Record the packages results to disk. This is a slightly annoying
  //   // operation because we want to keep all the comments intact.
  //   var packages = self._getConstraintFile();
  //   var lines = files.getLinesOrEmpty(packages);
  //   lines = _.reject(lines, function (line) {
  //     var cur = files.trimLine(line).split('@')[0];
  //     return _.indexOf(names, cur) !== -1;
  //   });
  //   fs.writeFileSync(packages,
  //                    lines.join('\n') + '\n', 'utf8');
  // },

  // // Remove packages from the app -- remove packages from the constraints, then
  // // recalculate versions and record the result to disk. We feel safe doing this
  // // here because this really shouldn't fail (we are just removing things).
  // removePackages : function (names) {
  //   var self = this;
  //   buildmessage.assertInCapture();
  //   self._removePackageRecords(names);

  //   // Force a recalculation of all the dependencies, and record them to disk.
  //   self._depsUpToDate = false;
  //   self._ensureDepsUpToDate();
  //   self._recordVersions();
  // },

  // // Tries to download all the packages that changed between the old
  // // self.dependencies and newVersions, and, if successful, adds 'moreDeps' to
  // // the package constraints to this project and replaces the project's
  // // dependencies with newVersions. Rewrites the data on disk to match. This
  // // does NOT run the constraint solver, it assumes that newVersions is valid to
  // // the full set of project constraints.
  // //
  // // - moreDeps: an object of package constraints to add to the project.
  // //   This object can be empty.
  // // - newVersions: a new set of dependencies for this project.
  // //
  // // returns an object mapping packageName to version of packages that we have
  // // available on disk. If this object does not contain all the keys of
  // // newVersions, then we haven't written the new versions&packages files to
  // // disk and the operation has failed.
  // addPackages : function (moreDeps, newVersions) {
  //   var self = this;

  //   // First, we need to make sure that we have downloaded all the packages that
  //   // we are going to use. So, go through the versions and call tropohouse to
  //   // make sure that we have them.
  //   var downloadedPackages = tropohouse.default.downloadMissingPackages(newVersions);

  //   // Return the packages that we have downloaded successfully and let the
  //   // client deal with reporting the error to the user.
  //   if (_.keys(downloadedPackages).length !== _.keys(newVersions).length) {
  //     return downloadedPackages;
  //   }

  //   // We can continue normally, so set our own internal variables.
  //   _.each(moreDeps, function (constraint) {
  //     self.constraints[constraint.name] = constraint.constraintString;
  //   });
  //   self.dependencies = newVersions;

  //   // Remove the old constraints on the same constraints, since we are going to
  //   // overwrite them.
  //   self._removePackageRecords(_.pluck(moreDeps, 'name'));

  //   // Add to the packages file. Do this first, since the versions file is
  //   // derived from this one and can always be reconstructed later. We read the
  //   // file from disk, because we don't store the comments.
  //   var packages = self._getConstraintFile();
  //   var lines = files.getLinesOrEmpty(packages);
  //   _.each(moreDeps, function (constraint) {
  //     if (constraint.constraintString) {
  //       lines.push(constraint.name + '@' + constraint.constraintString);
  //     } else {
  //       lines.push(constraint.name);
  //     }
  //   });
  //   lines.push('\n');
  //   fs.writeFileSync(packages, lines.join('\n'), 'utf8');

  //   // Rewrite the versions file.
  //   self._recordVersions();

  //   return downloadedPackages;
  // },


  // getFinishedUpgraders: function () {
  //   var self = this;
  //   var lines = files.getLinesOrEmpty(self._finishedUpgradersFile());
  //   return _.filter(_.map(lines, files.trimLine), _.identity);
  // },

  // // Adds the passed plugins to the cordovaPlugins list. If the plugin was
  // // already in the list, just updates it in-place.
  // // newPlugins is an object with a mapping from the Cordova plugin identifier
  // // to an semver string or a tarball url with a sha.
  // addCordovaPlugins: function (newPlugins) {
  //   var self = this;
  //   self.cordovaPlugins = _.extend(self.cordovaPlugins, newPlugins);

  //   var plugins = self._getCordovaPluginsFile();
  //   var lines = [];
  //   _.each(self.cordovaPlugins, function (versionString, plugin) {
  //     if (versionString)
  //       lines.push(plugin + '@' + versionString);
  //     else
  //       lines.push(plugin);
  //   });
  //   lines.push('\n');
  //   fs.writeFileSync(plugins, lines.join('\n'), 'utf8');
  // },

  // // Removes the plugins from the cordova-plugins file if they existed.
  // // pluginsToRemove - array of Cordova plugin identifiers
  // //
  // // Returns an array of plugin identifiers that were actually removed.
  // removeCordovaPlugins: function (pluginsToRemove) {
  //   var self = this;

  //   var removed = _.intersection(_.keys(self.cordovaPlugins), pluginsToRemove);
  //   self.cordovaPlugins =
  //     _.omit.apply(null, [self.cordovaPlugins].concat(pluginsToRemove));

  //   var plugins = self._getCordovaPluginsFile();
  //   var lines = [];

  //   _.each(self.cordovaPlugins, function (versionString, plugin) {
  //     if (versionString)
  //       lines.push(plugin + '@' + versionString);
  //     else
  //       lines.push(plugin);
  //   });
  //   lines.push('\n');
  //   fs.writeFileSync(plugins, lines.join('\n'), 'utf8');

  //   return removed;
  // },
