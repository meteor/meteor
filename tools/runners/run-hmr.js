import WS from 'ws';
import runLog from './run-log.js';
import crypto from 'crypto';
import Anser from "anser";
import { CordovaBuilder } from '../cordova/builder.js';

export class HMRServer {
  constructor({
    proxy, hmrPath, secret, projectContext, cordovaServerPort
}) {
    this.proxy = proxy;
    this.projectContext = projectContext;

    this.hmrPath = hmrPath;
    this.secret = secret;

    this.wsServer = null;
    this.connByArch = Object.create(null);
    this.started = false;

    this.changeSetsByArch = Object.create(null);

    this.maxChangeSets = 300;
    this.cacheKeys = Object.create(null);
    this.trimmedArchUntil = Object.create(null);
    this.firstBuild = null;

    if (!cordovaServerPort) {
     cordovaServerPort = CordovaBuilder.createCordovaServerPort(
          projectContext.appIdentifier
        );
    }

    this.cordovaOrigin = `http://localhost:${cordovaServerPort}`;
  }

  start() {
    if (!this.proxy.started) {
      throw new Error('Proxy must be started before HMR Server');
    }

    this.wsServer = new WS.Server({
      noServer: true,
    });
    this.proxy.server.on('upgrade', (req, res, head) => {
      if (req.url === this.hmrPath) {
        this.wsServer.handleUpgrade(req, res, head, (conn) => {
          this._handleWsConn(conn, req);
        });
      }
    });

    this.started = true;
  }

  stop() {
    this.wsServer.close();
    this.connByArch = Object.create(null);
  }

  _handleWsConn(conn, req) {
    let registered = false;
    let connArch = null;
    let fromCordova = this.cordovaOrigin && req.headers.origin === this.cordovaOrigin;

    conn.on('message', (_message) => {
      const message = JSON.parse(_message);

      switch (message.type) {
        case 'register': {
          const { arch, appId, secret = '' } = message;

          if (appId !== this.projectContext.appIdentifier) {
            // A different app is trying to request changes
            conn.send(JSON.stringify({
              type: 'register-failed',
              reason: 'wrong-app'
            }));
          }

          let secretsMatch = secret.length === this.secret.length &&
            crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(this.secret));

          if (
            !fromCordova &&
            !secretsMatch
          ) {
            conn.send(JSON.stringify({
              type: 'register-failed',
              reason: 'wrong-secret'
            }));
            conn.close();
            return;
          }

          this.connByArch[arch] = this.connByArch[arch] || [];
          this.connByArch[arch].push(conn);
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

        default:
          throw new Error(`Unknown HMR message ${message.type}`);
      }
    });

    // TODO: should use pings to detect disconnected sockets
    conn.on('close', () => {
      if (!connArch) {
        return;
      }

      const archConns = this.connByArch[connArch] || [];
      const index = archConns.indexOf(conn);
      if (index > -1) {
        archConns.splice(
          index,
          1
        );
      }
    });
  }

  _sendAll(message) {
    Object.values(this.connByArch).forEach(conns => {
      conns.forEach(conn => {
        conn.send(JSON.stringify(message));
      });
    });
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

  compare({ name, arch, hmrAvailable, files, cacheKey }, getFileOutput) {
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

    function saveFileDetails(file) {
      return {
        content: getFileOutput(file).toStringWithSourceMap({}),
        path: file.absModuleId,
        meteorInstallOptions: file.meteorInstallOptions
      };
    }

    const result = {
      fileHashes,
      unreloadableHashes: unreloadable,
      reloadable,
      addedFiles: reloadable ? addedFiles.map(saveFileDetails) : [],
      changedFiles: reloadable ? changedFiles.map(saveFileDetails) : [],
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
