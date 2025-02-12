/**
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const fastGlob = require('fast-glob');

function copyRecursiveSync(source, target) {
    // Resolve the paths inside the function
    const resolvedSource = path.resolve(source);
    const resolvedTarget = path.resolve(target);
    const stats = fs.statSync(resolvedSource);
    if (stats.isDirectory()) {
        if (!fs.existsSync(resolvedTarget)) {
            fs.mkdirSync(resolvedTarget, { recursive: true });
        }
        const files = fs.readdirSync(resolvedSource);
        files.forEach(file => {
            const srcPath = path.join(resolvedSource, file);
            const destPath = path.join(resolvedTarget, file);
            copyRecursiveSync(srcPath, destPath);
        });
    } else {
        const parentDir = path.dirname(resolvedTarget);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.copyFileSync(resolvedSource, resolvedTarget);
    }
}

/**
 * Logging callback used in the FileUpdater methods.
 * @callback loggingCallback
 * @param {string} message A message describing a single file update operation.
 */

/**
 * Updates a target file or directory with a source file or directory. (Directory updates are
 * not recursive.) Stats for target and source items must be passed in. This is an internal
 * helper function used by other methods in this module.
 *
 * @param {?string} sourcePath Source file or directory to be used to update the
 *     destination. If the source is null, then the destination is deleted if it exists.
 * @param {?fs.Stats} sourceStats An instance of fs.Stats for the source path, or null if
 *     the source does not exist.
 * @param {string} targetPath Required destination file or directory to be updated. If it does
 *     not exist, it will be created.
 * @param {?fs.Stats} targetStats An instance of fs.Stats for the target path, or null if
 *     the target does not exist.
 * @param {Object} [options] Optional additional parameters for the update.
 * @param {string} [options.rootDir] Optional root directory (such as a project) to which target
 *     and source path parameters are relative; may be omitted if the paths are absolute. The
 *     rootDir is always omitted from any logged paths, to make the logs easier to read.
 * @param {boolean} [options.all] If true, all files are copied regardless of last-modified times.
 *     Otherwise, a file is copied if the source's last-modified time is greather than or
 *     equal to the target's last-modified time, or if the file sizes are different.
 * @param {loggingCallback} [log] Optional logging callback that takes a string message
 *     describing any file operations that are performed.
 * @return {boolean} true if any changes were made, or false if the force flag is not set
 *     and everything was up to date
 */
function updatePathWithStats (sourcePath, sourceStats, targetPath, targetStats, options, log = () => {}) {
    const rootDir = (options && options.rootDir) || '';
    const copyAll = (options && options.all) || false;
    const targetFullPath = path.join(rootDir, targetPath);

    // Source or target could be a device, socket or pipe. We just skip these.
    const isSpecial = stats => stats && !stats.isFile() && !stats.isDirectory();
    if (isSpecial(targetStats) || isSpecial(sourceStats)) return false;

    if (!sourceStats) {
        if (!targetStats) return false;

        // The target exists but the source not, so we delete the target.
        log(`delete ${targetPath} (no source)`);
        fs.rmSync(targetFullPath, { recursive: true, force: true });
        return true;
    }

    if (targetStats && (targetStats.isDirectory() !== sourceStats.isDirectory())) {
        // The target exists but the directory status doesn't match the source.
        // So we delete it and let it be created again by the code below.
        log(`delete ${targetPath} (wrong type)`);
        fs.rmSync(targetFullPath, { recursive: true, force: true });
        targetStats = null;
    }

    if (sourceStats.isDirectory() && !targetStats) {
        // The target directory does not exist, so we create it.
        log(`mkdir ${targetPath}`);
        fs.mkdirSync(targetFullPath, { recursive: true });
        return true;
    }

    if (sourceStats.isFile()) {
        // The source is a file and the target either is one too or missing.

        // If the caller did not specify that all files should be copied, check
        // if the source has been modified since it was copied to the target, or
        // if the file sizes are different. (The latter catches most cases in
        // which something was done to the file after copying.) Comparison is >=
        // rather than > to allow for timestamps lacking sub-second precision in
        // some filesystems.
        const needsUpdate = !targetStats || copyAll ||
            sourceStats.size !== targetStats.size ||
            sourceStats.mtime.getTime() >= targetStats.mtime.getTime();
        if (!needsUpdate) return false;

        const type = targetStats ? 'updated' : 'new';
        log(`copy  ${sourcePath} ${targetPath} (${type} file)`);
        copyRecursiveSync(path.join(rootDir, sourcePath), targetFullPath);
        return true;
    }

    return false;
}

/**
 * Helper for updatePath and updatePaths functions. Queries stats for source and target
 */
function updatePathInternal (sourcePath, targetPath, options, log) {
    const rootDir = (options && options.rootDir) || '';
    const targetFullPath = path.join(rootDir, targetPath);
    const targetStats = fs.existsSync(targetFullPath) ? fs.statSync(targetFullPath) : null;
    let sourceStats = null;

    if (sourcePath) {
        // A non-null source path was specified. It should exist.
        const sourceFullPath = path.join(rootDir, sourcePath);
        if (!fs.existsSync(sourceFullPath)) {
            throw new Error(`Source path does not exist: ${sourcePath}`);
        }

        sourceStats = fs.statSync(sourceFullPath);
    }

    return updatePathWithStats(sourcePath, sourceStats, targetPath, targetStats, options, log);
}

/**
 * Updates a target file or directory with a source file or directory. (Directory updates are
 * not recursive.)
 *
 * @param {?string} sourcePath Source file or directory to be used to update the
 *     destination. If the source is null, then the destination is deleted if it exists.
 * @param {string} targetPath Required destination file or directory to be updated. If it does
 *     not exist, it will be created.
 * @param {Object} [options] Optional additional parameters for the update.
 * @param {string} [options.rootDir] Optional root directory (such as a project) to which target
 *     and source path parameters are relative; may be omitted if the paths are absolute. The
 *     rootDir is always omitted from any logged paths, to make the logs easier to read.
 * @param {boolean} [options.all] If true, all files are copied regardless of last-modified times.
 *     Otherwise, a file is copied if the source's last-modified time is greather than or
 *     equal to the target's last-modified time, or if the file sizes are different.
 * @param {loggingCallback} [log] Optional logging callback that takes a string message
 *     describing any file operations that are performed.
 * @return {boolean} true if any changes were made, or false if the force flag is not set
 *     and everything was up to date
 */
function updatePath (sourcePath, targetPath, options, log) {
    if (sourcePath !== null && typeof sourcePath !== 'string') {
        throw new Error('A source path (or null) is required.');
    }

    if (!targetPath || typeof targetPath !== 'string') {
        throw new Error('A target path is required.');
    }

    return updatePathInternal(sourcePath, targetPath, options, log);
}

/**
 * Updates files and directories based on a mapping from target paths to source paths. Targets
 * with null sources in the map are deleted.
 *
 * @param {Object} pathMap A dictionary mapping from target paths to source paths.
 * @param {Object} [options] Optional additional parameters for the update.
 * @param {string} [options.rootDir] Optional root directory (such as a project) to which target
 *     and source path parameters are relative; may be omitted if the paths are absolute. The
 *     rootDir is always omitted from any logged paths, to make the logs easier to read.
 * @param {boolean} [options.all] If true, all files are copied regardless of last-modified times.
 *     Otherwise, a file is copied if the source's last-modified time is greather than or
 *     equal to the target's last-modified time, or if the file sizes are different.
 * @param {loggingCallback} [log] Optional logging callback that takes a string message
 *     describing any file operations that are performed.
 * @return {boolean} true if any changes were made, or false if the force flag is not set
 *     and everything was up to date
 */
function updatePaths (pathMap, options, log) {
    if (!pathMap || typeof pathMap !== 'object' || Array.isArray(pathMap)) {
        throw new Error('An object mapping from target paths to source paths is required.');
    }

    // Iterate in sorted order for nicer logs
    return Object.keys(pathMap).sort().map(targetPath => {
        const sourcePath = pathMap[targetPath];
        return updatePathInternal(sourcePath, targetPath, options, log);
    }).some(updated => updated);
}

/**
 * Updates a target directory with merged files and subdirectories from source directories.
 *
 * @param {string|string[]} sourceDirs Required source directory or array of source directories
 *     to be merged into the target. The directories are listed in order of precedence; files in
 *     directories later in the array supersede files in directories earlier in the array
 *     (regardless of timestamps).
 * @param {string} targetDir Required destination directory to be updated. If it does not exist,
 *     it will be created. If it exists, newer files from source directories will be copied over,
 *     and files missing in the source directories will be deleted.
 * @param {Object} [options] Optional additional parameters for the update.
 * @param {string} [options.rootDir] Optional root directory (such as a project) to which target
 *     and source path parameters are relative; may be omitted if the paths are absolute. The
 *     rootDir is always omitted from any logged paths, to make the logs easier to read.
 * @param {boolean} [options.all] If true, all files are copied regardless of last-modified times.
 *     Otherwise, a file is copied if the source's last-modified time is greather than or
 *     equal to the target's last-modified time, or if the file sizes are different.
 * @param {string|string[]} [options.include] Optional glob string or array of glob strings that
 *     are tested against both target and source relative paths to determine if they are included
 *     in the merge-and-update. If unspecified, all items are included.
 * @param {string|string[]} [options.exclude] Optional glob string or array of glob strings that
 *     are tested against both target and source relative paths to determine if they are excluded
 *     from the merge-and-update. Exclusions override inclusions. If unspecified, no items are
 *     excluded.
 * @param {loggingCallback} [log] Optional logging callback that takes a string message
 *     describing any file operations that are performed.
 * @return {boolean} true if any changes were made, or false if the force flag is not set
 *     and everything was up to date
 */
function mergeAndUpdateDir (sourceDirs, targetDir, options, log) {
    if (sourceDirs && typeof sourceDirs === 'string') {
        sourceDirs = [sourceDirs];
    } else if (!Array.isArray(sourceDirs)) {
        throw new Error('A source directory path or array of paths is required.');
    }

    if (!targetDir || typeof targetDir !== 'string') {
        throw new Error('A target directory path is required.');
    }

    const rootDir = (options && options.rootDir) || '';

    let include = (options && options.include) || ['**'];
    if (typeof include === 'string') {
        include = [include];
    } else if (!Array.isArray(include)) {
        throw new Error('Include parameter must be a glob string or array of glob strings.');
    }

    let exclude = (options && options.exclude) || [];
    if (typeof exclude === 'string') {
        exclude = [exclude];
    } else if (!Array.isArray(exclude)) {
        throw new Error('Exclude parameter must be a glob string or array of glob strings.');
    }

    // Scan the files in each of the source directories.
    const sourceMaps = sourceDirs.map(sourceDir => {
        const sourcePath = path.join(rootDir, sourceDir);
        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Source directory does not exist: ${sourcePath}`);
        }

        return mapDirectory(rootDir, sourceDir, include, exclude);
    });

    // Scan the files in the target directory, if it exists.
    const targetFullPath = path.join(rootDir, targetDir);
    const targetMap = fs.existsSync(targetFullPath)
        ? mapDirectory(rootDir, targetDir, include, exclude)
        : {};
    const pathMap = mergePathMaps(sourceMaps, targetMap, targetDir);

    // Iterate in sorted order for nicer logs
    return Object.keys(pathMap).sort().map(subPath => {
        const entry = pathMap[subPath];
        return updatePathWithStats(
            entry.sourcePath,
            entry.sourceStats,
            entry.targetPath,
            entry.targetStats,
            options,
            log
        );
    }).some(updated => updated);
}

/**
 * Creates a dictionary map of all files and directories under a path.
 */
function mapDirectory (rootDir, subDir, include, exclude) {
    const pathToMap = path.join(rootDir, subDir);

    return fastGlob.sync(include, {
        fs, // we pass in fs here, to be able to mock it in our tests
        dot: true,
        stats: true,
        onlyFiles: false,
        cwd: pathToMap,
        ignore: exclude
    })
        .map(({ path: p, stats }) => ({
            [path.normalize(p)]: { subDir, stats }
        }))
        .reduce(
            (dirMap, fragment) => Object.assign(dirMap, fragment),
            { '': { subDir, stats: fs.statSync(pathToMap) } }
        );
}

/**
 * Merges together multiple source maps and a target map into a single mapping from
 * relative paths to objects with target and source paths and stats.
 */
function mergePathMaps (sourceMaps, targetMap, targetDir) {
    // Merge multiple source maps together, along with target path info.
    // Entries in later source maps override those in earlier source maps.
    const sourceMap = Object.assign({}, ...sourceMaps);

    const allKeys = [].concat(Object.keys(sourceMap), Object.keys(targetMap));
    const pathMap = allKeys.reduce((acc, subPath) => (
        Object.assign(acc, {
            [subPath]: {
                targetPath: path.join(targetDir, subPath),
                targetStats: null,
                sourcePath: null,
                sourceStats: null
            }
        })
    ), {});

    Object.entries(sourceMap).forEach(([subPath, { subDir, stats }]) => {
        Object.assign(
            pathMap[subPath],
            { sourcePath: path.join(subDir, subPath), sourceStats: stats }
        );
    });

    // Fill in target stats for targets that exist, and create entries
    // for targets that don't have any corresponding sources.
    Object.entries(targetMap).forEach(([subPath, { stats }]) => {
        Object.assign(pathMap[subPath], { targetStats: stats });
    });

    return pathMap;
}

module.exports = {
    updatePath,
    updatePaths,
    mergeAndUpdateDir
};
