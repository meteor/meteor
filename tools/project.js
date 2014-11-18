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


  // getFinishedUpgraders: function () {
  //   var self = this;
  //   var lines = files.getLinesOrEmpty(self._finishedUpgradersFile());
  //   return _.filter(_.map(lines, files.trimLine), _.identity);
  // },
