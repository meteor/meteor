import WS from 'ws';
import runLog from './run-log.js';
import crypto from 'crypto';
import Anser from "anser";

// Limit messages below ws's 100 MiB default.
const MAX_MESSAGE_SIZE = 64 * 1024;

// Anyone who can reach the proxy can send messages here.
function parseHMRMessage(data) {
  let message;
  try {
    message = JSON.parse(data);
  } catch (e) {
    return null;
  }

  if (!message || typeof message !== 'object') {
    return null;
  }

  // Client archs are always web.*. This also rules out names such as
  // __proto__ that would resolve to inherited properties in lookups by arch.
  if (typeof message.arch !== 'string' || !message.arch.startsWith('web.')) {
    return null;
  }

  switch (message.type) {
    case 'register':
      return message;

    case 'request-changes':
      // after is undefined when the client has no HMR version, for example
      // with `meteor run --production`
      if (message.after !== undefined && typeof message.after !== 'number') {
        return null;
      }
      return message;

    default:
      return null;
  }
}

export class HMRServer {
  constructor({ proxy, hmrPath, secret, projectContext }) {
    this.proxy = proxy;
    this.projectContext = projectContext;

    this.hmrPath = hmrPath;
    this.secretBuffer = Buffer.from(secret);

    this.wsServer = null;
    this.connByArch = new Map();
    this.started = false;

    this.changeSetsByArch = new Map();

    this.maxChangeSets = 300;
    this.cacheKeys = new Map();
    this.trimmedArchUntil = new Map();
    this.firstBuild = null;
  }

  start() {
    if (!this.proxy.started) {
      throw new Error('Proxy must be started before HMR Server');
    }

    this.wsServer = new WS.Server({
      noServer: true,
      maxPayload: MAX_MESSAGE_SIZE,
    });
    this.proxy.server.on('upgrade', (req, res, head) => {
      if (req.url === this.hmrPath) {
        this.wsServer.handleUpgrade(req, res, head, (conn) => {
          this._handleWsConn(conn);
        });
      }
    });

    this.started = true;
  }

  stop() {
    this.wsServer.close();
    this.connByArch = new Map();
  }

  _secretMatches(secret) {
    if (typeof secret !== 'string') {
      return false;
    }

    // Compare byte lengths, since timingSafeEqual throws when they differ
    const secretBuffer = Buffer.from(secret);
    return secretBuffer.length === this.secretBuffer.length &&
      crypto.timingSafeEqual(secretBuffer, this.secretBuffer);
  }

  _handleWsConn(conn) {
    let registered = false;
    let connArch = null;

    // ws reports invalid frames and oversized messages as an error on the
    // socket, and then closes it. Without a listener the error would be
    // thrown and stop the tool.
    conn.on('error', () => {});

    conn.on('message', (data) => {
      const message = parseHMRMessage(data);

      if (!message) {
        conn.close();
        return;
      }

      switch (message.type) {
        case 'register': {
          const { arch, appId, secret } = message;
          const isThisApp = appId === this.projectContext.appIdentifier;

          if (!isThisApp) {
            // A different app is trying to request changes
            conn.send(JSON.stringify({
              type: 'register-failed',
              reason: 'wrong-app'
            }));
          }

          // Origin is forgeable by non-browser clients; require the secret
          // even for Cordova. A wrong secret stops client reconnection.
          if (!isThisApp || !this._secretMatches(secret)) {
            conn.send(JSON.stringify({
              type: 'register-failed',
              reason: 'wrong-secret'
            }));
            conn.close();
            return;
          }

          if (!this.connByArch.has(arch)) {
            this.connByArch.set(arch, new Set());
          }
          const archConnsSet = this.connByArch.get(arch);
          archConnsSet.add(conn);
          connArch = arch;
          registered = true;
          break;
        }

        case 'request-changes': {
          if (!registered) {
            // Might have sent the wrong secret or be the wrong app
            // Even if we closed the connection, it might still handle
            // this message.
            return;
          }
          const { after, arch } = message;

          const trimmedUntil = this.trimmedArchUntil[arch] || Math.Infinity;
          if (trimmedUntil > after) {
            // We've removed changeSets needed for the client to update with HMR
            conn.send(
              JSON.stringify({
                type: 'changes',
                changeSets: [
                  { reloadable: false }
                ]
              })
            );
            return;
          }

          const archChangeSets = this.changeSetsByArch[arch] || [];
          const newChanges = archChangeSets.filter(({ linkedAt }) => {
            return linkedAt > after;
          });

          conn.send(JSON.stringify({
            type: 'changes',
            changeSets: newChanges
          }));

          break;
        }
      }
    });

    // TODO: should use pings to detect disconnected sockets
    conn.on('close', () => {
      if (!connArch) return;
      const archConnsSet = this.connByArch.get(connArch);
      if (archConnsSet) archConnsSet.delete(conn);
    });
  }

  _sendAll(message) {
    const messageStr = JSON.stringify(message);
    for (const connsSet of Object.values(this.connByArch)) {
      for (const conn of connsSet) conn.send(messageStr);
    }
 }

  setAppState(state) {
    if (state === 'error') {
      const lines = runLog.getLog().map(line => {
        return Anser.ansiToHtml(Anser.escapeForHtml(line.message))
      });
      this._sendAll({
        type: 'app-state',
        state: 'error',
        log: lines
      });
    } else if (state === 'okay') {
      this._sendAll({
        type: 'app-state',
        state: 'okay'
      });
    }
  }

  async compare({ name, arch, hmrAvailable, files, cacheKey }, getFileOutput) {
    if (this.firstBuild = null) {
      this.firstBuild = Date.now();
    }

    this.changeSetsByArch[arch] = this.changeSetsByArch[arch] || [];
    const previousCacheKey = this.cacheKeys[`${arch}-${name}`];

    if (previousCacheKey === cacheKey) {
      return;
    }

    // Try to do HMR without waiting for the build to finish
    // If it fails, the client will retry after the build finishes so
    // it can fall back to hot code push
    const sendEagerUpdate = (changeset) => {
      if (!this.connByArch[arch]) {
        return;
      }

      this.connByArch[arch].forEach(conn => {
        conn.send(JSON.stringify({
          type: 'changes',
          changeSets: [changeset],
          eager: true
        }));
      });
    }

    this.cacheKeys[`${arch}-${name}`] = cacheKey;
    const previous = this.findLastChangeset(name, arch) || {};

    if (!hmrAvailable) {
      let changeset = {
        name,
        reloadable: false,
        cacheKey,
        // TODO: use more accurate name
        linkedAt: Date.now()
      };
      this.changeSetsByArch[arch].push(changeset);
      this._trimChangeSets(arch);
      sendEagerUpdate(changeset);
      return;
    }

    const {
      addedFiles,
      changedFiles,
      removedFilePaths,
      unreloadable,
      onlyReplaceableChanges,
      fileHashes
    } = this.compareFiles(
      previous.fileHashes,
      previous.unreloadableHashes,
      files
    );

    const couldCompare = !!previous.fileHashes
    const reloadable = couldCompare &&
      onlyReplaceableChanges &&
      removedFilePaths.length === 0;

    async function saveFileDetails(file) {
      const content = await getFileOutput(file);
      return { 
          content: content.toStringWithSourceMap({}),
          path: file.absModuleId,
          meteorInstallOptions: file.meteorInstallOptions
      };
    }

    const iterWithFn = async (iter, fn) => {
      const results = await Promise.allSettled(iter.map(fn));
      return results
        .filter(result => {
          if (result.status === 'rejected') {
            console.error('HMR iterWithFn:', result.reason);
          }
          return result.status === 'fulfilled';
        })
        .map(result => result.value);
    }

    const result = {
      fileHashes,
      unreloadableHashes: unreloadable,
      reloadable,
      addedFiles: reloadable ? await iterWithFn(addedFiles, saveFileDetails) : [],
      changedFiles: reloadable ? await iterWithFn(changedFiles, saveFileDetails) : [],
      linkedAt: Date.now(),
      id: this._createId(),
      name
    };

    // TODO: we should also store the latest change set
    // for each arch and name someplace else so it doesn't
    // get removed when trimming changesets
    this.changeSetsByArch[arch].push(result);
    this._trimChangeSets(arch);

    if (!(arch in this.trimmedArchUntil)) {
      this.trimmedArchUntil[arch] = this.firstBuild - 1;
    }

    sendEagerUpdate(result);
  }

  _trimChangeSets(arch) {
    if (this.changeSetsByArch[arch].length > this.maxChangeSets) {
      const removed = this.changeSetsByArch[arch].splice(
        0,
        this.changeSetsByArch[arch].length - this.maxChangeSets
      );
      this.trimmedArchUntil[arch] = removed[removed.length - 1].linkedAt;
    }
  }

  _createId() {
    return `${Date.now()}-${Math.random()}`;
  }

  _checkReloadable(file) {
    return file.absModuleId &&
      !file.bare &&
      // TODO: support jsonData
      !file.jsonData &&
      file.meteorInstallOptions
  }

  compareFiles(previousHashes = new Map(), previousUnreloadable = [], currentFiles) {
    const unreloadable = [];
    const currentHashes = new Map();
    const unseenModules = new Map(previousHashes);

    const changedFiles = [];
    const addedFiles = [];
    let onlyReplaceableChanges = true;

    currentFiles.forEach(file => {
      let fileConfig;
      let ignoreHash = false;

      if (file.targetPath !== file.sourcePath && file.implicit) {
        // The import scanner created this file as an alias to the target path
        // This file's content does not change when the hash does, only the
        // content of the new file created at the target path.
        ignoreHash = true;
        fileConfig = JSON.stringify({
          implicit: file.implicit,
          sourcePath: file.sourcePath,
          targetPath: file.targetPath
        });
      } else {
        fileConfig = JSON.stringify({
          meteorInstallOptions: file.meteorInstallOptions,
          absModuleId: file.absModuleId,
          sourceMap: !!file.sourceMap,
          mainModule: file.mainModule,
          imported: file.imported,
          alias: file.alias,
          lazy: file.lazy,
          bare: file.bare
        })
      }

      if (
        !this._checkReloadable(file)
      ) {
        unreloadable.push(`${fileConfig}-${file._inputHash}`);
        return;
      }

      currentHashes.set(file.absModuleId, {
        inputHash: file._inputHash,
        config: fileConfig
      });

      const {
        inputHash: previousInputHash,
        config: previousConfig
      } = previousHashes.get(file.absModuleId) || {};

      if (!previousInputHash) {
        addedFiles.push(file);
      } else if (previousConfig !== fileConfig) {
        onlyReplaceableChanges = false;
      } else if (!ignoreHash && previousInputHash !== file._inputHash) {
        changedFiles.push(file);
      }

      unseenModules.delete(file.absModuleId);
    });

    const removedFilePaths = Array.from(unseenModules.keys());
    if (onlyReplaceableChanges) {
      const unreloadableChanged = unreloadable.length !== previousUnreloadable.length ||
        unreloadable.some((hash, i) => hash !== previousUnreloadable[i]);
      onlyReplaceableChanges = !unreloadableChanged;
    }

    return {
      fileHashes: currentHashes,
      addedFiles,
      changedFiles,
      removedFilePaths,
      unreloadable,
      onlyReplaceableChanges,
    };
  }

  findLastChangeset(name, arch) {
    const changeSets = this.changeSetsByArch[arch] || [];
    for (let i = changeSets.length - 1; i >= 0; i--) {
      if (changeSets[i].name === name) {
        return changeSets[i];
      }
    }
  }
}
